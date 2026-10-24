'use strict';

// fail-to-pass.js: the `fail-to-pass` verb, which runs a commit range's tests twice in a throwaway worktree and records what the two runs showed (ADR 0134, INV-0138, INV-0139).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { fail } = require('./refusal.js');
const { ledgerPath, splitLines, tableRowIndexes, splitRow } = require('./ledger.js');
const { isTestPath, verificationCommandsOf } = require('./verification.js');
const { gitSpawn, resolveCommit, fileAt } = require('./git-spawn.js');
const { PROBE_MAX_BUFFER } = require('./containment.js');
const { mainWorkTree } = require('./main-work-tree.js');
const { appendTrace, readTrace, encodePaths } = require('./trace-log.js');
const { treeState } = require('./run-tree.js');
const { superviseRuns, withWorktreeLock } = require('./run-supervision.js');
const { withPaths } = require('./test-verb.js');

// The floor of the bound on the run with the files put back (ADR 0142): 10 000 ms, or the positive whole number of
// milliseconds `SUPERDEV_FAIL_TO_PASS_FLOOR_MS` names. A value that is not a positive integer — empty, a word, zero,
// negative — reads as absent rather than as "kill immediately". That positive-integer rule is the one
// `SUPERDEV_PUBLISH_KB_TIMEOUT_MS` applies; the cap below is this override's own.
// A value above 2147483647 reads as absent too: Node's setTimeout fires a longer delay after 1 ms, which would kill
// the run at once under a bound it never ran under. A set value it rejects is named in one line on stderr, so the
// operator sees why the override took no effect; an unset or empty one says nothing. The verb reads the floor once.
const FAIL_TO_PASS_FLOOR_MS = 10000;
const MAX_TIMER_MS = 2147483647;

function failToPassFloorMs() {
  const raw = (process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS || '').trim();
  const n = /^\d+$/.test(raw) ? Number(raw) : 0;
  if (n > 0 && n <= MAX_TIMER_MS) return n;
  if (raw) process.stderr.write(`fail-to-pass: SUPERDEV_FAIL_TO_PASS_FLOOR_MS=${JSON.stringify(raw)} is not a whole number of milliseconds from 1 to ${MAX_TIMER_MS}; the floor stays ${FAIL_TO_PASS_FLOOR_MS} ms\n`);
  return FAIL_TO_PASS_FLOOR_MS;
}

// The bound on the run with the files put back: ten times the control's duration, rounded up, or the floor, whichever
// is larger (ADR 0142). Pure, so the suite pins the factor and the floor without a clock; the caller reads the floor.
const failToPassBoundMs = (controlMs, floorMs) => Math.max(Math.ceil(controlMs * 10), floorMs);

// The domain shapes, named as CONTEXT.md names them. A **fail-to-pass run** is a performed test comparison over a
// commit range; its **outcome** is what the two runs showed, and the run trace carries it as a line of its own kind.
//
// @typedef {'fail-to-pass' | 'pass-to-pass' | 'unknown'} FailToPassOutcome
//   fail-to-pass: the tests passed against the changed code and failed with the range's other files put back.
//   pass-to-pass: they passed both times, so they do not discriminate what the range changed.
//   unknown:      the run could not judge (INV-0139): the tests did not pass against the changed code, or the run with the
//                 files put back outlasted its bound or ended by a signal (INV-0009), or a run's command could not start. No
//                 reviewer reads it as a verdict.
//
// @typedef {object} FailToPassRun
//   base, tip: the range's two full commits; `tip` is the commit the command and the test paths are read from.
//   command:   the one command string both runs use.
//   outcome:   FailToPassOutcome. reason: `control=<exit>,put-back=<exit>`, the two exit statuses and nothing else; for
//              `unknown`, `control=<exit or signal>` where the control did not pass, else
//              `control=0,put-back=<exit or signal>,bound=<ms>ms`, the bound ten times the control's duration or the floor,
//              whichever is larger (`failToPassFloorMs`; `SUPERDEV_FAIL_TO_PASS_FLOOR_MS` overrides the floor, ADR 0142).
//              A run whose command could not start reads `start-failed:<error code>` in place of its exit, and the second carries no bound.
//
// The trace line is `<ts> <slice|scope> main fail-to-pass <base>..<tip> <outcome> <reason>`. The slice is the one whose
// ledger row records exactly this range, else the one the run's directory attributes to, else `scope`. The control run also
// writes a `run` line for its command's kind, attributed the same way (ADR 0175).

// The id of the ledger row whose range cell names exactly `base..tip`, each side read as a commit (a row may carry
// abbreviated ones), or null.
function sliceOfRange(root, base, tip, cwd) {
  let lines;
  try { lines = splitLines(fs.readFileSync(ledgerPath(root), 'utf8')); } catch { return null; }
  for (const i of tableRowIndexes(lines)) {
    const cells = splitRow(lines[i]);
    const [lo, hi, ...more] = (cells[6] || '').split('..');
    if (lo && hi && !more.length && resolveCommit(lo, cwd) === base && resolveCommit(hi, cwd) === tip) return cells[0];
  }
  return null;
}

// Makes `.superdev/` ignored for the repository whose main working tree is `main`, through the `info/exclude` of its common git
// dir, so no file of the checkout changes (`ensureSuperdevIgnored` writes the checkout's own `.gitignore`, which this verb never
// does). A repository that ignores it already, by any rule, is left alone.
function ignoreSuperdevLocally(main) {
  if (gitSpawn(['check-ignore', '-q', '--', '.superdev/x'], main).status !== 1) return;
  const common = gitSpawn(['rev-parse', '--git-common-dir'], main);
  if (common.status !== 0) return;
  const file = path.join(path.resolve(main, common.stdout.trim()), 'info', 'exclude');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* no exclude file yet */ }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, (text && !text.endsWith('\n') ? '\n' : '') + '.superdev/\n');
}

// `fail-to-pass <base>..<tip>`: the tests the range selects run in a throwaway worktree at the tip, then again with the
// files the range changed outside its test files put back as they stood at the base. Exit 0: an outcome was read and
// printed (`unknown` included); inside a run root its line is appended (a failed append is reported on stderr, the status
// stays 0), outside one no line exists. Exit 1: a refusal or an error (git could not create the worktree, clear what the
// first run left, or put the files back), message on stderr. Exit 2: no outcome and no line, because no test command is
// configured (nothing ran). An interrupt exits 128 plus the signal number.
async function verbFailToPass(cwd, args) {
  if (args.length !== 1) fail('fail-to-pass needs one <base>..<tip> range');
  const [baseRef, tipRef, ...extra] = args[0].split('..');
  if (!baseRef || !tipRef || extra.length) fail(`fail-to-pass: "${args[0]}" is not a <base>..<tip> range`);
  const base = resolveCommit(baseRef, cwd);
  if (!base) fail(`fail-to-pass: "${baseRef}" does not resolve to a commit`);
  const tip = resolveCommit(tipRef, cwd);
  if (!tip) fail(`fail-to-pass: "${tipRef}" does not resolve to a commit`);
  if (gitSpawn(['merge-base', '--is-ancestor', base, tip], cwd).status !== 0) fail(`fail-to-pass: "${baseRef}" is not an ancestor of "${tipRef}"`);
  // `diff.relative=false`: the listing is the whole range from the tree root, whatever the operator's config and cwd say.
  const diff = gitSpawn(['-c', 'diff.relative=false', 'diff', '--name-status', '--no-renames', '-z', base, tip], cwd, { maxBuffer: PROBE_MAX_BUFFER });
  if (diff.status !== 0) fail('fail-to-pass: git could not list the paths the range changes');
  const tokens = diff.stdout.split('\0').filter(Boolean);
  const changed = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) changed.push({ status: tokens[i], path: tokens[i + 1] });
  if (!changed.length) fail(`fail-to-pass: the range is empty: ${baseRef}..${tipRef} changes no file`);
  const config = fileAt(tip, 'docs/agents/verification.md', cwd);
  if (config === null) fail("fail-to-pass: git could not read the tip's verification configuration");
  const putBackChanges = changed.filter((c) => !isTestPath(config, c.path));
  if (!putBackChanges.length) fail('fail-to-pass: the range changes only test files, so nothing is put back');
  // references/test-selection.md: the focused command over the whole changed-path set where it carries `{paths}`, and the
  // full command for a fixed-subset or self-detecting focused command or where only the full command exists.
  const commands = verificationCommandsOf(config, true);
  const focused = Boolean(commands.focused && commands.focused.includes('{paths}'));
  const command = focused
    ? withPaths(commands.focused, changed.map((c) => c.path))
    : commands.full;
  if (!command) {
    process.stderr.write(`fail-to-pass: no test command is configured in docs/agents/verification.md at ${tipRef}; nothing ran\n`);
    process.exitCode = 2;
    return;
  }
  // The worktree sits beside `slicetrees/` in the run root, outside every tree the run trace attributes a run to, so no hook
  // records its test runs; the verb writes the control's `run` line itself. Module resolution walks up from there to the main checkout's own `node_modules`, as it does
  // from the scope's own worktrees (the setup probe's placement). Outside a run root it sits under `.superdev/`, and no line
  // is written, `.superdev/` is git-ignored first through the repository's `info/exclude` (no file of the checkout changes), and
  // a `.superdev/` this call created is removed at exit. `mkdtemp` makes the directory unique to this invocation, so parallel runs never share one.
  const at = require('./run-tree.js').locate(path.join(cwd, 'x'));
  const main = at ? null : mainWorkTree(cwd) || cwd;
  const home = at ? at.runRoot : path.join(main, '.superdev');
  const madeHome = !at && !fs.existsSync(home);
  if (main) ignoreSuperdevLocally(main);
  fs.mkdirSync(home, { recursive: true });
  const dir = fs.mkdtempSync(path.join(home, 'fail-to-pass-'));
  // No git hook runs, whoever configured one: `core.hooksPath` names no directory for every git call below.
  const noHooks = ['-c', 'core.hooksPath=/dev/null'];
  // The worktree outlives no exit. The watcher holds a channel from this process and takes over when it closes, on an
  // interrupt or a kill past the signal handlers: it ends the running command's group (the process tree on Windows), then
  // removes the worktree.
  const sup = superviseRuns(['ignore', 2, 2], { cwd, dir }, 'SIGKILL');
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    sup.stop();
    withWorktreeLock(cwd, () => {
      const gone = spawnSync('git', [...noHooks, 'worktree', 'remove', '--force', dir], { cwd, stdio: 'ignore' });
      if (gone.status !== 0) {
        fs.rmSync(dir, { recursive: true, force: true });
        spawnSync('git', ['worktree', 'prune'], { cwd, stdio: 'ignore' });
      }
    });
    // `rmdir` takes an empty directory only, so a `.superdev/` that holds anything else stays.
    if (madeHome) try { fs.rmdirSync(home); } catch { /* not empty, or already gone */ }
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    // The watcher ends the run as it does for a SIGKILLed verb, with SIGKILL, not SIGTERM: a runner that traps SIGTERM keeps
    // running and may write into the worktree. The verb exits once the watcher has ended the group and removed the worktree.
    process.on(sig, () => sup.detach().then(() => process.exit(128 + require('os').constants.signals[sig])));
  }
  process.on('exit', cleanup);
  // `--literal-pathspecs`: a changed path named `*.cfg` is that file, and never a glob over the test files it would also match.
  const git = (gitArgs, input) => spawnSync('git', [...noHooks, '--literal-pathspecs', ...gitArgs], { cwd: dir, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const step = (what, gitArgs, input) => { const r = git(gitArgs, input); if (r.status !== 0) fail(`fail-to-pass: git could not ${what}: ${r.stderr.trim()}`); };
  // The command runs in its own process group, which an interrupt ends with it. `limitMs`, where given, bounds the run: its
  // group is killed when the bound expires, and `expired` says so. The result carries the run's own duration in `ms`. A
  // command that cannot start (E2BIG on a long `{paths}` list, which spawn throws, or an error it emits) resolves with
  // `startError`, its error code, and no exit.
  const exec = async (limitMs) => {
    const started = performance.now();
    let expired = false;
    const timer = limitMs === undefined ? null : setTimeout(() => { expired = true; sup.end(); }, limitMs);
    // The sweep ends the group with its shell on every exit: one a signal ended, and one that exited and left a background
    // process. Nothing the run started outlives it, so nothing writes into the worktree the next step resets or the exit
    // handler removes.
    const { code, signal, error } = await sup.run(command, dir, true);
    clearTimeout(timer);
    if (error) return { startError: error };
    return { code, signal, expired, ms: performance.now() - started };
  };
  try {
    const added = withWorktreeLock(cwd, () => spawnSync('git', [...noHooks, 'worktree', 'add', '-q', '--detach', dir, tip], { cwd, encoding: 'utf8' }));
    if (added.status !== 0) fail(`fail-to-pass: git could not create the worktree: ${added.stderr.trim()}`);
    // Only a control that passed gives the second run a meaning (INV-0139); a control that did not pass records `unknown`,
    // and the second run never starts.
    const [sha0, tree0] = treeState(dir);
    const control = await exec();
    const status = (run) => (run.startError ? `start-failed:${run.startError}` : run.signal || run.code);
    // One ledger read names the slice both lines carry, the outcome line and the control run's `run` line (ADR 0175).
    const slice = at && (sliceOfRange(at.runRoot, base, tip, cwd) || at.slice);
    const record = (outcome, reason) => {
      // The scope run's first `unknown` is an observation (references/scope-mode.md's `## Observations`), and the run root's
      // own trace says whether an earlier one exists, so the caller counts nothing. simplicity: two `unknown` outcomes
      // written in the same instant both read no earlier one and both say so; capture reads before it writes, so a
      // duplicate record is the worst case.
      const seenUnknown = () => {
        try { return readTrace(fs.readFileSync(path.join(at.runRoot, 'trace.log'), 'utf8')).some((e) => e.kind === 'fail-to-pass' && e.fields[1] === 'unknown'); } catch { return false; }
      };
      if (at && outcome === 'unknown' && !seenUnknown()) process.stderr.write("fail-to-pass: the scope run's first unknown outcome: capture an observation naming the environment gap (references/scope-mode.md, `## Observations`)\n");
      if (at && !appendTrace(at.runRoot, { slice, kind: 'fail-to-pass', fields: [`${base}..${tip}`, outcome, reason] })) {
        process.stderr.write('fail-to-pass: the outcome line could not be written to the run trace\n');
      }
      console.log(`${outcome} ${reason}`);
    };
    // The control run is a test run too (ADR 0175): a run that finished with an exit status writes the `run` line `scope.js
    // test` writes for its kind, attributed like the outcome line. One a signal ended or that could not start writes none.
    // Like `scope.js test`, it names the tip and reads both ends: a HEAD that left the tip or a dirty tree at either end is `dirty`.
    if (at && control.code !== null && control.code !== undefined && !control.signal && !control.startError) {
      const [sha1, tree1] = treeState(dir);
      const states = [tree0, tree1];
      const tree = sha0 !== tip || sha1 !== tip || states.includes('dirty') ? 'dirty' : states.includes('unknown') ? 'unknown' : 'clean';
      const files = changed.map((c) => c.path);
      if (!appendTrace(at.runRoot, { slice, kind: 'run', fields: [focused ? 'focused' : 'full', control.code === 0 ? 'pass' : 'fail', tip, tree, focused ? encodePaths(files) : ''] })) {
        process.stderr.write('fail-to-pass: the control run line could not be written to the run trace\n');
      }
    }
    if (control.code !== 0) return record('unknown', `control=${status(control)}`);
    // The second run sees the base's files outside the test paths, the tip's test files, and nothing the control run left:
    // a tracked file it changed (`reset --hard` to the tip), an untracked or ignored one it wrote (`dist/`, `target/classes`, a
    // copy under an ignored `build/`; `clean -ffdx` takes every such path, a nested repository included). Dependencies resolve
    // from outside this worktree, so the clean leaves them alone.
    step('clear what the first run left', ['reset', '-q', '--hard', tip]);
    step('clear what the first run left', ['clean', '-ffdxq']);
    // The range's added paths are removed first, and the rest come back from the base. Restoring a path the base held as a file
    // where the tip has a directory (or the reverse) already drops the paths beneath it from the index, so a pathspec for an
    // added one, named afterwards, matches nothing and git refuses.
    const addedPaths = putBackChanges.filter((c) => c.status === 'A').map((c) => c.path);
    if (addedPaths.length) step('put the files back', ['rm', '-q', '-r', '--pathspec-from-file=-', '--pathspec-file-nul'], addedPaths.join('\0'));
    const restPaths = putBackChanges.filter((c) => c.status !== 'A').map((c) => c.path);
    if (restPaths.length) step('put the files back', ['restore', '--source=' + base, '--staged', '--worktree', '--pathspec-from-file=-', '--pathspec-file-nul'], restPaths.join('\0'));
    // The put-back is committed on the worktree's detached HEAD, so the second run, like the control, sees a tree that
    // matches its HEAD: a command that checks for a clean tree first reads the tests' own verdict. Identity and signing come
    // from `-c`, so an environment with no identity, or one that signs every commit, still commits; `noHooks` runs no hook.
    // `maintenance.auto` and `gc.auto` start no automatic maintenance, which would detach in the shared object store and
    // outlive the verb, its cwd in the worktree the exit handler removes.
    step('put the files back', ['-c', 'user.name=superdev', '-c', 'user.email=superdev@localhost', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', 'commit', '-q', '-m', 'fail-to-pass put-back']);
    // Code missing the feature can hang, so the second run is bounded at ten times the duration the control took in this
    // invocation, or the floor, whichever is larger: a millisecond control would otherwise give a bound shorter than the
    // delays a loaded machine adds (ADR 0142).
    const bound = failToPassBoundMs(control.ms, failToPassFloorMs());
    const putBack = await exec(bound);
    // A run whose bound expired, or that a signal ended, carries no verdict whether or not the kill landed (INV-0009).
    if (putBack.startError) return record('unknown', `control=0,put-back=${status(putBack)}`);
    if (putBack.expired || putBack.signal) return record('unknown', `control=0,put-back=${status(putBack)},bound=${bound}ms`);
    record(putBack.code === 0 ? 'pass-to-pass' : 'fail-to-pass', `control=${control.code},put-back=${putBack.code}`);
  } finally {
    cleanup();
  }
}

module.exports = { verbFailToPass, failToPassBoundMs };
