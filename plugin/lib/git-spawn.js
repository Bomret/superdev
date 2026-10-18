'use strict';

// git-spawn.js: the git calls the hooks and scripts share, the raw spawn and its commit-resolving reads, the throwing call, and the `git branch` list parse.

const { spawnSync, execFileSync } = require('child_process');

// spawnSync for `gitSpawn` and the reads built on it, never a throwing call: those git calls are real
// answers to read off an exit status (a conflict, an unresolved ref, a git without `--write-tree`), not
// an error to propagate. A git call that cannot even start (no git on PATH) reads as `status !== 0`
// exactly like a real nonzero exit, which keeps the fail-closed direction of its callers.
function gitSpawn(args, cwd, opts) {
  return spawnSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', ...opts });
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
// like `HEAD`).
function resolveCommit(ref, cwd) {
  const result = gitSpawn(['rev-parse', '--verify', '--quiet', '--end-of-options', ref + '^{commit}'], cwd);
  return result.status === 0 ? result.stdout.trim() : null;
}

function refResolves(ref, cwd) {
  return resolveCommit(ref, cwd) !== null;
}

// A file's text at a commit: '' where the commit has no such file, null where git cannot say. The tip's own
// `docs/agents/verification.md` is read this way, never a working tree's. `rel` is a path from the tree root: `--full-tree`
// stops `ls-tree` resolving it against `cwd`, which can be any subdirectory of the checkout (`commit:rel` is root-relative already).
function fileAt(commit, rel, cwd) {
  const listed = gitSpawn(['ls-tree', '--full-tree', '--name-only', commit, '--', rel], cwd);
  if (listed.status !== 0) return null;
  if (!listed.stdout.trim()) return '';
  const shown = gitSpawn(['show', `${commit}:${rel}`], cwd);
  return shown.status === 0 ? shown.stdout : null;
}

module.exports = { gitSpawn, gitThrow, parseBranchList, resolveCommit, refResolves, fileAt };
