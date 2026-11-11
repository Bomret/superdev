'use strict';

// test-verb.js: the `test` verb, which runs a test command under supervision and appends the run line the command's own exit status makes (ADR 0127, INV-0117).

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { gitSpawn } = require('./git-spawn.js');
const { verificationCommands } = require('./verification.js');
const { appendTrace, readTrace, encodePaths } = require('./trace-log.js');
const { checkRun } = require('./run-check.js');
const { superviseRuns } = require('./run-supervision.js');
const { usage } = require('./usage.js');

// A word as the shell reads it back: left bare where it needs no quoting.
const shellWord = (w) => (/^[\w@%+=:,./-]+$/.test(w) ? w : `'${w.replace(/'/g, "'\\''")}'`);
// A focused command template with every `{paths}` token replaced by the shell-quoted paths. A replacer function inserts
// its value literally, so a path holding a `$&`-style pattern stays a path.
const withPaths = (template, paths) => template.replace(/\{paths\}/g, () => paths.map(shellWord).join(' '));

// `test full|whole`, `test focused [<path>…]`, `test path <file>… -- <command>`: runs a test command under `sh`, streaming its output,
// and appends one `run` line carrying the command's own exit status (an Observed run), its duration in milliseconds, and its command as run. The run root, slice, commit, and
// tree state are read when the run starts; the line is written when the command finishes, `dirty` when HEAD moved, the tree
// was dirty at either end, or the trace recorded a change to the slice's files during the run. No option sets a field.
// A command ended by a signal, or a verb killed first, writes no line, and a verb that is killed or interrupted
// has its command's process group sent SIGTERM by the watcher, whatever ended the verb (`taskkill /t /f` on Windows), so a
// runner that ignores SIGTERM can outlive the verb.
// `test path <file>… -- <command>` runs the command as given, from the current directory, against the test files its caller names,
// and classifies nothing (ADR 0225). The line records the files (`encodePaths`) and the command as typed, which the run state
// carries to the remote, so a secret belongs in the environment. Outside every run tree the command runs and nothing is written.
// simplicity: a command that changes its own process group escapes the group kill; upgrade: a cgroup or subreaper if one bites.
function verbTest(cwd, args) {
  const { locate, treeState } = require('./run-tree.js');
  let kind = args[0];
  let command;
  let files = [];
  const at = locate(path.join(cwd, 'x'));
  let runCwd = cwd;
  // The tree a configured kind runs in outside every run tree: the repository's, else the cwd.
  const topOf = () => {
    const top = gitSpawn(['rev-parse', '--show-toplevel'], cwd);
    return top.status === 0 ? top.stdout.trim() : cwd;
  };
  const form = 'test path <file>… -- <command>';
  if (kind === '--') fail(`test --: names no test file; use \`${form}\``);
  if (kind === 'path') {
    const sep = args.indexOf('--');
    if (sep < 0) fail(`test path: needs \`--\` before the command (${form})`);
    files = args.slice(1, sep);
    const words = args.slice(sep + 1);
    if (!files.length) fail(`test path: needs at least one test file (${form})`);
    if (!words.length || (words.length === 1 && !words[0].trim())) fail(`test path: needs a command after \`--\` (${form})`);
    command = words.length === 1 ? words[0] : words.map(shellWord).join(' ');
  } else {
    if (!['full', 'focused', 'whole'].includes(kind) || (kind !== 'focused' && args.length > 1)) fail(`test: unrecognized arguments (${usage().split('\n').find((l) => /^ {2}test /.test(l)).trim()})`);
    const paths = args.slice(1);
    if (paths.includes('')) fail('test focused: an empty path argument names no file');
    if (kind === 'focused' && !paths.length) kind = 'full';
    const tree = at ? at.tree : topOf();
    // An argument holding whitespace that names no file is a path list joined into one word (an unsplit `$P`): the
    // command would read it as one path, select nothing, and pass.
    const joined = paths.find((p) => /\s/.test(p) && !fs.existsSync(path.resolve(tree, p)));
    if (joined !== undefined) fail(`test focused: the argument ${JSON.stringify(joined)} holds whitespace and names no file; pass each path as its own argument`);
    runCwd = tree; // the template is read from the tree root, so it runs there
    const template = verificationCommands(tree, true)[kind];
    if (!template) fail(`test ${kind}: no ${kind} command is configured in docs/agents/verification.md`);
    command = kind === 'focused' ? withPaths(template, paths) : template;
    if (kind === 'focused') files = paths;
  }
  // The run's digest is checked before the run line is written (ADR 0225); the check may append a `tamper` line, so it comes first.
  if (at) checkRun(at.runRoot);
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
  const started = performance.now();
  sup.run(command, runCwd, false).then(({ code, signal, error }) => {
    const ms = String(Math.round(performance.now() - started));
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
      // An edit the trace recorded for this slice during the run changed the tree, even one undone
      // before the end. simplicity: a change no hook records (another process writing the tree) shows only at the two ends.
      let changed = false;
      try {
        changed = readTrace(fs.readFileSync(traceFile).subarray(traceMark).toString('utf8'))
          .some((e) => e.slice === at.slice && e.kind === 'edit');
      } catch { /* no trace: nothing recorded */ }
      // The commit and tree state the command ran against: a moved HEAD, a dirty tree at either end, or a recorded change
      // during the run is `dirty`.
      const tree = sha1 !== sha || tree0 === 'dirty' || tree1 === 'dirty' || changed ? 'dirty' : tree0 === 'unknown' || tree1 === 'unknown' ? 'unknown' : 'clean';
      const outcome = code === 0 ? 'pass' : 'fail';
      if (!appendTrace(at.runRoot, { slice: at.slice, kind: 'run', fields: [kind, outcome, sha, tree, encodePaths(files), ms, command] })) {
        process.stderr.write('test: the run line could not be written to the run trace\n');
      }
    }
    process.exit(code);
  });
}

module.exports = { verbTest, shellWord };
