'use strict';

// test-verb.js: the `test` verb, which runs a test command under supervision and appends the run line the command's own exit status makes (ADR 0127, INV-0117).

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { gitSpawn } = require('./git-spawn.js');
const { verificationCommands } = require('./verification.js');
const { appendTrace, readTrace, encodePaths } = require('./trace-log.js');
const { superviseRuns } = require('./run-supervision.js');
const { usage } = require('./usage.js');

// A word as the shell reads it back: left bare where it needs no quoting, so the hook's classifier reads it as typed.
const shellWord = (w) => (/^[\w@%+=:,./-]+$/.test(w) ? w : `'${w.replace(/'/g, "'\\''")}'`);
// A focused command template with every `{paths}` token replaced by the shell-quoted paths. A replacer function inserts
// its value literally, so a path holding a `$&`-style pattern stays a path.
const withPaths = (template, paths) => template.replace(/\{paths\}/g, () => paths.map(shellWord).join(' '));

// `test full|whole`, `test focused [<path>…]`, `test -- <command>`: runs a test command under `sh`, streaming its output,
// and appends one `run` line carrying the command's own exit status (an Observed run). The run root, slice, commit, and
// tree state are read when the run starts; the line is written when the command finishes, `dirty` when HEAD moved, the tree
// was dirty at either end, or the trace recorded a change to the slice's files during the run. No option sets a field.
// A command ended by a signal, or a verb killed first, writes no line, and a verb that is killed or interrupted
// has its command's process group sent SIGTERM by the watcher, whatever ended the verb (`taskkill /t /f` on Windows), so a
// runner that ignores SIGTERM can outlive the verb.
// Outside every run tree, or for a command that cd's out of every run tree, the command runs and nothing is written. lib/run-tree.js and lib/test-runs.js are required here, at call time, for the
// locator and the classifier they share with the run-trace hook. An install whose classifier cannot find a module (lib/shell-words.js is
// missing) classifies no command as a test run, so `test --` refuses every command and a configured kind still runs; any other load
// failure propagates.
// simplicity: a command that changes its own process group escapes the group kill; upgrade: a cgroup or subreaper if one bites.
function verbTest(cwd, args) {
  const { locate, treeState } = require('./run-tree.js');
  let testRuns = () => [];
  try {
    ({ testRuns } = require('./test-runs.js'));
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e; // a syntax error or a throwing module stays visible
  }
  const free = args[0] === '--';
  let kind = args[0];
  let command;
  let files = [];
  let at = locate(path.join(cwd, 'x'));
  let hidden = false; // the command's shape hides its status from the test
  let runCwd = cwd;
  // The tree a command classifies against outside every run tree: the repository's, else the cwd.
  const topOf = () => {
    const top = gitSpawn(['rev-parse', '--show-toplevel'], cwd);
    return top.status === 0 ? top.stdout.trim() : cwd;
  };
  if (free) {
    if (args.length < 2) fail('test --: needs a command');
    command = args.length === 2 ? args[1] : args.slice(1).map(shellWord).join(' ');
    let runs = testRuns(command, cwd, at ? null : topOf());
    // From inside a run tree, a command that cd's out of every run tree classifies as it would outside one.
    if (at && !runs.length) runs = testRuns(command, cwd, topOf());
    if (runs.length !== 1) fail(runs.length ? 'test --: the command holds more than one test run, run one per call' : `test --: not a test run, so nothing runs: ${command}`);
    // The classified run's own location decides, so a `cd` into a run tree records there from any cwd, and a `cd` out of
    // every run tree records nothing.
    if (runs[0].at.runRoot) {
      ({ kind, files, at } = runs[0]);
      hidden = runs[0].unknown || !runs[0].sole;
    } else at = null;
  } else {
    if (!['full', 'focused', 'whole'].includes(kind) || (kind !== 'focused' && args.length > 1)) fail(`test: unrecognized arguments (${usage().split('\n').find((l) => /^ {2}test /.test(l)).trim()})`);
    const paths = args.slice(1);
    if (paths.includes('')) fail('test focused: an empty path argument names no file');
    if (kind === 'focused' && !paths.length) kind = 'full';
    const tree = at ? at.tree : topOf();
    runCwd = tree; // the template is read from the tree root, so it runs there
    const template = verificationCommands(tree, true)[kind];
    if (!template) fail(`test ${kind}: no ${kind} command is configured in docs/agents/verification.md`);
    command = kind === 'focused' ? withPaths(template, paths) : template;
    if (kind === 'focused') files = paths;
  }
  const [sha, tree0] = at ? treeState(at.tree) : [];
  // Where the trace ends now: a file change it records for this slice past this point happened during the run.
  const traceFile = at && path.join(at.runRoot, 'trace.log');
  let traceMark = 0;
  try { if (at) traceMark = fs.statSync(traceFile).size; } catch { /* no trace yet: from its start */ }
  // The watcher exists before the command does and starts it: when this process is interrupted or dies by any signal, even
  // SIGKILL, the watcher's channel closes and it ends the command's group (the process tree on Windows). A verb killed before
  // the watcher starts the command leaves nothing to end.
  const sup = superviseRuns(['inherit', 'inherit', 'inherit'], null, 'SIGTERM');
  // An interrupt ends the run the way a SIGKILL of the verb does: the closed channel makes the watcher end the command.
  const stop = (sig) => () => {
    sup.detach();
    process.exit(128 + require('os').constants.signals[sig]);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, stop(sig));
  sup.run(command, runCwd, false).then(({ code, signal, error }) => {
    sup.stop();
    if (error) {
      process.stderr.write(`test: cannot run sh: ${error}\n`);
      process.exit(127);
    }
    if (signal) {
      process.stderr.write(`test: the command ended by ${signal}; no run is recorded\n`);
      process.exit(128 + require('os').constants.signals[signal]);
    }
    if (at) {
      const [sha1, tree1] = treeState(at.tree);
      // An edit, revert, or restore the trace recorded for this slice during the run changed the tree, even one undone
      // before the end. simplicity: a change no hook records (another process writing the tree) shows only at the two ends.
      let changed = false;
      try {
        changed = readTrace(fs.readFileSync(traceFile).subarray(traceMark).toString('utf8'))
          .some((e) => e.slice === at.slice && ['edit', 'revert', 'restore'].includes(e.kind));
      } catch { /* no trace: nothing recorded */ }
      // The commit and tree state the command ran against: a moved HEAD, a dirty tree at either end, or a recorded change
      // during the run is `dirty`.
      const tree = sha1 !== sha || tree0 === 'dirty' || tree1 === 'dirty' || changed ? 'dirty' : tree0 === 'unknown' || tree1 === 'unknown' ? 'unknown' : 'clean';
      const outcome = hidden ? 'unknown' : code === 0 ? 'pass' : 'fail';
      if (!appendTrace(at.runRoot, { slice: at.slice, kind: 'run', fields: [kind, outcome, sha, tree, kind === 'focused' ? encodePaths(files) : files.join(',')] })) {
        process.stderr.write('test: the run line could not be written to the run trace\n');
      }
    }
    process.exit(code);
  });
}

module.exports = { verbTest, withPaths };
