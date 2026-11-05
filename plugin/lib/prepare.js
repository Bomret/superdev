'use strict';

// prepare.js: runs a repository's prepare command at a worktree's root, in a process group of its own, and the `prepare` verb (ADR 0218).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fail } = require('./refusal.js');
const { gitSpawn } = require('./git-spawn.js');
const { drivePath } = require('./shell-word-readers.js');
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

// `prepare <tree>`: runs the prepare command that `<tree>`'s own `docs/agents/verification.md` states, at that tree's root, its
// output on stderr. `<tree>` must be the root of a working tree of the invoking repository. No section prints one note and exits
// 0, `none` exits 0, and a command that does not succeed exits 3, naming the command and its exit, signal, or start error. A
// command that succeeds but changes a tracked file exits 3 too, naming each such path: a path whose difference from HEAD,
// staged and unstaged, differs after the command from before it. A tracked edit the tree already held is no such change, and
// an untracked file the command writes is none either. An interrupt ends the command's group and exits 128 plus the signal number.
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
  const sup = superviseRuns(['ignore', 2, 2], null, 'SIGKILL');
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => sup.detach().then(() => process.exit(128 + os.constants.signals[sig])));
  }
  // Each tracked path's diff against HEAD, staged and unstaged, read with none of the user's external diff or textconv programs.
  // Both listings run in path order with renames off, so the n-th name owns the n-th `diff --git` chunk; no content line of a
  // patch starts with that header.
  const tracked = () => {
    const diff = (extra) => gitSpawn(['--no-optional-locks', 'diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--no-renames', '--binary', ...extra], real, { maxBuffer: Infinity }).stdout || '';
    const names = diff(['--name-only', '-z']).split('\0').filter(Boolean);
    const chunks = diff([]).split(/^(?=diff --git )/m).filter(Boolean);
    return new Map(names.map((name, i) => [name, chunks[i]]));
  };
  const before = tracked();
  let result;
  try { result = await runPrepare(sup, prep.command, real); } finally { sup.stop(); }
  if (!result.ok) {
    process.stderr.write(`prepare: \`${prep.command}\` did not succeed: ${result.reason}\n`);
    process.exitCode = PREPARE_FAILED_EXIT;
  } else {
    const after = tracked();
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((name) => before.get(name) !== after.get(name)).sort();
    if (changed.length) {
      process.stderr.write(`prepare: \`${prep.command}\` changed a tracked file: ${changed.join(', ')}\n`);
      process.exitCode = PREPARE_FAILED_EXIT;
    }
  }
}

module.exports = { runPrepare, verbPrepare };
