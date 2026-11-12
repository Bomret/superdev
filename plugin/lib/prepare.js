'use strict';

// prepare.js: runs a repository's prepare command at a worktree's root, in a process group of its own, and the `prepare` verb (ADR 0218).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fail } = require('./refusal.js');
const { gitSpawn } = require('./git-spawn.js');
const { drivePath } = require('./drive-path.js');
const { prepareCommandOf } = require('./verification.js');
const { superviseRuns } = require('./run-supervision.js');

// The exit status of a prepare command that ran and did not succeed, apart from a refusal's 1.
const PREPARE_FAILED_EXIT = 3;

// Runs `command` at the root `tree` through `sup`, a supervisor from run-supervision.js's `superviseRuns`, whose stdio sends the
// command's output to stderr; an interrupt ends the command's group with the supervisor's. The sweep ends whatever the command
// left running in its group once it exits. Resolves `{ ok, reason }`: `ok` when the command exited 0, and `reason` its exit
// status, the signal that ended it, or `start-failed:<error code>` when it could not start.
async function runPrepare(sup, command, tree) {
  const { code, signal, error } = await sup.run(command, tree, true);
  if (error) return { ok: false, reason: `start-failed:${error}` };
  return { ok: !signal && code === 0, reason: signal || String(code) };
}

// The stamp a successful preparation leaves in the tree's own git directory, outside every tracked file.
const STAMP = 'superdev-prepare.json';

// The untracked paths of `tree`, ignored ones included, a wholly untracked directory listed as one entry.
const untracked = (tree) => gitSpawn(['--no-optional-locks', 'ls-files', '-z', '--others', '--directory'], tree, { maxBuffer: Infinity }).stdout.split('\0').filter(Boolean);

// The untracked files of `tree` git does not ignore, one entry per file, or null where git cannot list them.
function unignoredFiles(tree) {
  const listed = gitSpawn(['--no-optional-locks', 'ls-files', '-z', '--others', '--exclude-standard'], tree, { maxBuffer: Infinity });
  return listed.status === 0 ? listed.stdout.split('\0').filter(Boolean) : null;
}

// The stamp is written only for a tree with no tracked change from its HEAD, so the stamped commit is the whole tracked state
// the command saw. Whether the preparation `stamp` records still holds at `tree`, whose prepare command is `command`: the stamp
// names the same command, every untracked path it recorded is still there, every tracked path that differs between the
// stamped commit and the working tree is a Markdown file, and every untracked file git does not ignore that the stamp does not
// record is a Markdown file. Any other change, such as a source or test file a building command reads or a lockfile an
// install reads, committed, edited, or newly created, needs the command again.
function stillPrepared(stamp, tree, command) {
  if (!stamp || stamp.command !== command || typeof stamp.head !== 'string' || !Array.isArray(stamp.untracked)) return false;
  const markdown = (rel) => /\.md$/i.test(rel);
  const diff = gitSpawn(['--no-optional-locks', 'diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', stamp.head, '--'], tree, { maxBuffer: Infinity });
  if (diff.status !== 0) return false;
  if (!diff.stdout.split('\0').filter(Boolean).every(markdown)) return false;
  const now = new Set(untracked(tree));
  if (!stamp.untracked.every((rel) => now.has(rel))) return false;
  // File by file, so a new file inside a directory the stamp recorded as one entry still counts as new.
  const created = unignoredFiles(tree);
  if (!created) return false;
  const known = new Set(Array.isArray(stamp.files) ? stamp.files : []);
  return created.every((rel) => known.has(rel) || markdown(rel));
}

// `prepare <tree>`: runs the prepare command that `<tree>`'s own `docs/agents/verification.md` states, at that tree's root, its
// output on stderr. `<tree>` must be the root of a working tree of the invoking repository. No section prints one note and exits
// 0, `none` exits 0, and a command that does not succeed exits 3, naming the command and its exit, signal, or start error. A
// command that succeeds but changes a tracked file exits 3 too, naming each such path: a path whose difference from HEAD,
// staged and unstaged, differs after the command from before it. A tracked edit the tree already held is no such change, and
// an untracked file the command writes is none either. An interrupt ends the command's group and exits 128 plus the signal number.
// A preparation that succeeds on a tree with no tracked change from HEAD writes a stamp to the tree's git directory, and a later call the stamp still holds for runs
// nothing, prints one note, and exits 0 (`stillPrepared`).
async function verbPrepare(cwd, args) {
  if (args.length !== 1 || !args[0]) fail('prepare needs <tree>, the root of a working tree of this repository');
  const tree = path.resolve(cwd, drivePath(args[0]));
  let real;
  try { real = fs.realpathSync(tree); } catch { fail(`prepare: "${args[0]}" does not exist`); }
  const list = gitSpawn(['worktree', 'list', '--porcelain'], cwd);
  if (list.status !== 0) fail('prepare: git could not list the working trees of this repository');
  const trees = list.stdout.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => {
    const p = drivePath(l.slice('worktree '.length));
    try { return fs.realpathSync(p); } catch { return path.resolve(p); }
  });
  if (!trees.includes(real)) fail(`prepare: "${args[0]}" is no working tree of this repository`);
  let text = '';
  try { text = fs.readFileSync(path.join(real, 'docs', 'agents', 'verification.md'), 'utf8'); } catch { /* no configuration: absent */ }
  const prep = prepareCommandOf(text);
  if (prep.state === 'absent') {
    process.stderr.write('prepare: docs/agents/verification.md states no `## Prepare command` section, so nothing ran; /superdev:setup proposes one\n');
    return;
  }
  if (prep.state === 'none') return;
  const gitDir = gitSpawn(['rev-parse', '--absolute-git-dir'], real).stdout.trim();
  const stampPath = gitDir ? path.join(drivePath(gitDir), STAMP) : null;
  let stamp = null;
  if (stampPath) try { stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8')); } catch { /* no stamp: prepare */ }
  if (stillPrepared(stamp, real, prep.command)) {
    process.stderr.write(`prepare: skipped \`${prep.command}\`: it succeeded at ${stamp.head.slice(0, 12)}, and every tracked change since is Markdown\n`);
    return;
  }
  if (stampPath) fs.rmSync(stampPath, { force: true });
  const sup = superviseRuns(['ignore', 2, 2], null, 'SIGKILL');
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => sup.detach().then(() => process.exit(128 + os.constants.signals[sig])));
  }
  // The tracked diff against HEAD, staged and unstaged, read with none of the user's external diff or textconv programs: its
  // whole text, which decides the exit, and each path's part of it, which names the paths. Both listings run in path order with
  // renames off, and no content line of a patch starts with a `diff --git ` header. A path owns every consecutive chunk under
  // one header, as a type change prints two, so the n-th name owns the n-th run of equal headers. Where the runs and the names
  // do not pair up, `parts` is null.
  const tracked = () => {
    const diff = (extra) => gitSpawn(['--no-optional-locks', 'diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--no-renames', '--binary', ...extra], real, { maxBuffer: Infinity }).stdout || '';
    const names = diff(['--name-only', '-z']).split('\0').filter(Boolean);
    const text = diff([]);
    const runs = [];
    for (const chunk of text.split(/^(?=diff --git )/m).filter(Boolean)) {
      const head = chunk.slice(0, chunk.indexOf('\n'));
      if (runs.length && runs[runs.length - 1].head === head) runs[runs.length - 1].body += chunk;
      else runs.push({ head, body: chunk });
    }
    const parts = runs.length === names.length ? new Map(names.map((name, i) => [name, runs[i].body])) : null;
    return { text, names, parts };
  };
  const before = tracked();
  let result;
  try { result = await runPrepare(sup, prep.command, real); } finally { sup.stop(); }
  if (!result.ok) {
    process.stderr.write(`prepare: \`${prep.command}\` did not succeed: ${result.reason}\n`);
    process.exitCode = PREPARE_FAILED_EXIT;
  } else {
    const after = tracked();
    if (before.text !== after.text) {
      // Without a pairing on either side, every path either listing names is named.
      const union = [...new Set([...before.names, ...after.names])];
      const changed = before.parts && after.parts ? union.filter((name) => before.parts.get(name) !== after.parts.get(name)) : union;
      process.stderr.write(`prepare: \`${prep.command}\` changed a tracked file: ${changed.sort().join(', ')}\n`);
      process.exitCode = PREPARE_FAILED_EXIT;
    } else if (stampPath && !after.text) {
      const head = gitSpawn(['rev-parse', '--verify', 'HEAD^{commit}'], real).stdout.trim();
      if (head) fs.writeFileSync(stampPath, JSON.stringify({ command: prep.command, head, untracked: untracked(real), files: unignoredFiles(real) || [] }) + '\n');
    }
  }
}

module.exports = { runPrepare, verbPrepare };
