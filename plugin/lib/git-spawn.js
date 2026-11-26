'use strict';

// git-spawn.js: the git calls the hooks and scripts share. It holds the raw spawn and its commit-resolving reads,
// the literal path reads at a commit (existence and file text), the throwing call, the `git branch` list parse,
// and the `git worktree list` parse.

const { spawnSync, execFileSync } = require('child_process');
const { fail } = require('./refusal.js');

// The bound on every shared local read (ADR 0290, INV-0009). A healthy local read takes milliseconds, so only a hung git
// reaches it. No setting changes it.
const LOCAL_READ_TIMEOUT_MS = 60000;

// spawnSync for `gitSpawn` and the reads built on it, never a throwing call: those git calls are real
// answers to read off an exit status (a conflict, an unresolved ref, a git without `--write-tree`), not
// an error to propagate. A git call that cannot even start (no git on PATH) reads as `status !== 0`
// exactly like a real nonzero exit, which keeps the fail-closed direction of its callers: a Spawn failure, which
// INV-0009 does not govern (ADR 0087). A call a signal ended is no such answer, so the shared reads below run through
// `localRead` and refuse it through `refuseKilled`, or answer "git cannot say", never an answer read off the missing
// status.
function gitSpawn(args, cwd, opts) {
  return spawnSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', ...opts });
}

// `gitSpawn` with the local-read bound and a kill signal by default. A caller's own `timeout` or `killSignal` wins, and opts
// that carry a `timeout` of `undefined`, or none at all, keep the bound.
function localRead(args, cwd, opts = {}) {
  return gitSpawn(args, cwd, {
    ...opts,
    timeout: opts.timeout === undefined ? LOCAL_READ_TIMEOUT_MS : opts.timeout,
    killSignal: opts.killSignal === undefined ? 'SIGKILL' : opts.killSignal,
  });
}

// A read a signal ended, its bound's kill or any other, carries no verdict (INV-0009): refuse it rather than read the
// missing status as an answer. A spawn that never started carries no signal, so it passes here as the Spawn failure it is
// (ADR 0087).
function refuseKilled(verb, result) {
  if (result.status === null && result.signal != null) {
    fail(`git ${verb} was ended by signal ${result.signal} — no verdict`, { noVerdict: { verb, signal: result.signal } });
  }
}

// The trimmed stdout of a git call that must succeed, thrown otherwise: a caller whose empty answer would read as
// "nothing there" (an empty branch set reads as every branch gone) catches the throw and bails instead.
// execFileSync, not execSync: no shell in between, so `%(refname)` and a repo-derived branch name or path
// never cross a shell that would treat `(`, a quote, a backtick, or `$()` as syntax.
function gitThrow(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// The branch names of `git branch` output, without the `*` (current) and `+` (other worktree) markers.
function parseBranchList(text) {
  return new Set(
    text
      .split('\n')
      .map((s) => s.replace(/^[*+ ]+/, '').trim())
      .filter(Boolean)
  );
}

// The full 40-hex commit `ref` resolves to in `cwd`, or `null` when it resolves to nothing —
// the one `rev-parse --verify` call both `refResolves` and `verbSuite` need, the latter for the
// resolved sha itself (INV-0017 needs the full commit on record, never a short sha or a moving ref
// like `HEAD`). A read a signal ended refuses as no verdict, never `null`.
function resolveCommit(ref, cwd) {
  const result = localRead(['rev-parse', '--verify', '--quiet', '--end-of-options', ref + '^{commit}'], cwd);
  refuseKilled('rev-parse', result);
  return result.status === 0 ? result.stdout.trim() : null;
}

function refResolves(ref, cwd) {
  return resolveCommit(ref, cwd) !== null;
}

// The environment of a git call that reads its paths literally: the process environment without the global pathspec modes.
// Git exits 128 when one of them meets `--literal-pathspecs` (verified on git 2.54).
function literalEnv() {
  const env = { ...process.env };
  for (const mode of ['GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS']) delete env[mode];
  return env;
}

// Whether a commit holds a path: `true` where it does, an empty file included, `false` where it does not.
// `null` where git cannot say (any nonzero exit, or a read a signal ended). `rel` is a path from the tree root, read literally.
// `:foo` is that file and never pathspec magic, and `a*` is that file and never a glob.
// `--full-tree` stops `ls-tree` resolving it against `cwd`, which can be any subdirectory of the checkout.
// It reads no blob, so a file of any size answers. A directory or submodule entry answers `true`.
function existsAt(commit, rel, cwd) {
  const listed = localRead(['--literal-pathspecs', 'ls-tree', '--full-tree', '--name-only', commit, '--', rel], cwd, { env: literalEnv() });
  if (listed.status !== 0) return null;
  return listed.stdout !== '';
}

// A file's text at a commit: '' where the commit has no such file, null where git cannot say. The tip's own
// `docs/agents/verification.md` is read this way, never a working tree's. `rel` is a path from the tree root (`commit:rel` is
// root-relative already). `show` answers a file that is there in one call; only where it fails does `existsAt` tell an absent
// file from a git that cannot say. A `show` a signal ended answers `null` at once, with no probe.
function fileAt(commit, rel, cwd) {
  const shown = localRead(['show', `${commit}:${rel}`], cwd);
  if (shown.status === 0) return shown.stdout;
  if (shown.signal != null) return null;
  return existsAt(commit, rel, cwd) === false ? '' : null;
}

// The registered working trees as `{ path, branch, detached }` (`branch` the short name, null where none), or `{ failure }` with the
// reason git cannot list them. `-z` ends each field with a NUL, so a path holding a newline stays whole.
// A git older than 2.36 refuses `-z`, and the listing then reads the newline-split form, which cannot keep such a path whole.
function listWorktrees(cwd) {
  let res = localRead(['worktree', 'list', '--porcelain', '-z'], cwd);
  let sep = '\0';
  if (!res.error && res.status !== null && res.status !== 0) {
    res = localRead(['worktree', 'list', '--porcelain'], cwd);
    sep = '\n';
  }
  // A signal first: the bound's kill also sets `error` (ETIMEDOUT), and the signal is what ended the listing.
  if (res.signal != null) return { failure: `worktree list was ended by signal ${res.signal}` };
  if (res.error) {
    const how = ['ENOENT', 'EACCES'].includes(res.error.code) ? 'could not start' : 'failed';
    return { failure: `worktree list ${how} (${res.error.code || res.error.message})` };
  }
  if (res.status !== 0) return { failure: `worktree list exited with status ${res.status}` };
  const trees = [];
  let cur = null;
  for (const line of res.stdout.split(sep)) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice('worktree '.length), branch: null, detached: false };
      trees.push(cur);
    } else if (cur && line.startsWith('branch ')) cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    else if (cur && line === 'detached') cur.detached = true;
  }
  return { trees };
}

module.exports = { LOCAL_READ_TIMEOUT_MS, gitSpawn, localRead, refuseKilled, gitThrow, parseBranchList, resolveCommit, refResolves, literalEnv, existsAt, fileAt, listWorktrees };
