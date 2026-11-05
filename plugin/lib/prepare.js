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
// command that succeeds but leaves a tracked file changed exits 3 too; an untracked file it writes is no such change. An
// interrupt ends the command's group and exits 128 plus the signal number.
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
  let result;
  try { result = await runPrepare(sup, prep.command, real); } finally { sup.stop(); }
  if (!result.ok) {
    process.stderr.write(`prepare: \`${prep.command}\` did not succeed: ${result.reason}\n`);
    process.exitCode = PREPARE_FAILED_EXIT;
  } else if (gitSpawn(['--no-optional-locks', 'status', '--porcelain', '--untracked-files=no'], real).stdout.trim()) {
    process.stderr.write(`prepare: \`${prep.command}\` left a tracked file changed\n`);
    process.exitCode = PREPARE_FAILED_EXIT;
  }
}

module.exports = { runPrepare, verbPrepare };
