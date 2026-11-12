#!/usr/bin/env node
'use strict';

// run-tests: the maintainer-only test runner; `package.json` carries no test script. It finds the suites under tests/ by
// their `*.test.js` name, so a suite added to the tree runs with no roster edit, runs each
// under `node` (the hooks' production runtime), and then the fixed tail: the invariant
// register check, the drift selftest, drift-check, and plugin manifest validation. The steps run as many at once as
// `os.availableParallelism()` reports, each in its own process group, and each prints its output whole with one
// `run-tests: <label>: <ms> ms` line, so a test audit ranks measured cost. The first failure ends the steps still
// running with their processes, starts no further step, and exits nonzero, naming what failed. `--related <path>...` runs the tail plus only the
// suites the changed paths reach (`selectSuites`), and the mod suite when a path is under `MOD_DIR`. Pure Node, no shell.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const TAIL = [
  [process.execPath, ['scripts/invariant-check.js', '--root', '.']],
  [process.execPath, ['scripts/drift-check.js', '--selftest']],
  [process.execPath, ['scripts/drift-check.js']],
  ['claude', ['plugin', 'validate', './plugin']],
];

// The superdev-view mod's own suites, which only `claude plugin test` runs. A focused run whose paths reach the mod
// runs them after the selected suites; the full run never does.
const MOD_DIR = 'mods/superdev-view/';
const MOD_SUITE = ['claude', ['plugin', 'test', 'mods/superdev-view']];

// A suite is a `*.test.js` file directly under `dir`. A shared helper (`spawn-verdict.js`) and a
// fixtures directory carry no such name or are not files, so neither runs as a suite.
function discoverSuites(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.test.js'))
    .map((e) => path.join(dir, e.name))
    .sort();
}

// Directories whose `<name>.js` a suite `<name>.test.js` pins.
const SHIPPED_DIRS = ['plugin/hooks', 'plugin/scripts', 'plugin/lib', 'scripts'];

// The shipped file a suite stem pins: `<stem>.js`, or for a suite split off another (`scope-test-verb`), the file of its
// longest `-`-delimited prefix (`scope.js`). An exact pin wins.
function pinnedBy(root, stem) {
  for (let s = stem; s; s = s.includes('-') ? s.slice(0, s.lastIndexOf('-')) : '') {
    const rel = SHIPPED_DIRS.map((d) => `${d}/${s}.js`).find((r) => fs.existsSync(path.join(root, r)));
    if (rel) return rel;
  }
  return undefined;
}

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The repository-relative `.js` files `rel` requires directly, as `<path>`, `<path>.js`, or
// `<path>/index.js` candidates. A `require` of a package or `node:` builtin is not relative.
function requiredBy(root, rel) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return new Set();
  }
  const found = new Set();
  for (const m of text.matchAll(/require\(\s*['"](\.[^'"]*)['"]\s*\)/g)) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
    found.add(base).add(`${base}.js`).add(`${base}/index.js`);
  }
  return found;
}

// Every file `rel` reaches through relative `require` edges, as candidate paths (see `requiredBy`). The walk
// continues through a module (a file under `plugin/lib/`) or a shared suite setup file (a non-suite file under
// `tests/`), and stops at any other file, a hook or script having a suite of its own. A visited set ends a
// cycle; a candidate that is no readable file has no edges, so a missing target adds only itself.
const isModule = (rel) => rel.startsWith('plugin/lib/') || (rel.startsWith('tests/') && !rel.endsWith('.test.js'));
function reachedBy(root, rel) {
  const seen = new Set();
  const todo = [rel];
  while (todo.length) {
    for (const next of requiredBy(root, todo.pop())) {
      if (!seen.has(next)) {
        seen.add(next);
        if (isModule(next)) todo.push(next);
      }
    }
  }
  return seen;
}

// The directories a suite's text names, as { segs, anchored }: a `./` or `../` path string that resolves from `tests/`
// to a directory of the repository, and the literal segments of a `path.join` / `path.resolve` call. A call whose first
// argument is `__dirname` or a `./` or `../` literal is anchored at `tests/`. A bare relative literal (`'docs/agents'`,
// `path.join('docs', 'agents')`) names nothing: a suite builds its fixture trees from such paths. A call
// whose leading directory is `path.dirname(<name>)`, with `<name>` assigned a `require.resolve` of a relative path in the
// suite's own text, is anchored at that path's directory. Any other `path.dirname(...)` names only its literal tail, which matches that tail at any depth,
// so it can select a suite for a directory it does not scan but never miss one it does. A call whose leading
// directory is any other computed value (a variable, `os.tmpdir()`) builds a path in a fixture tree and names nothing.
// Ceiling: a suite that scans a repository directory through a bare cwd-relative literal is missed, as is a directory built by a computed expression with no literal segment (`path.join(dir, name)`), or by a
// variable assigned elsewhere, is unreadable here and names nothing.
function namedDirs(root, text) {
  const dirs = [];
  const norm = (parts) => {
    const out = [];
    for (const part of parts) for (const seg of part.split('/')) {
      if (seg === '..') out.pop();
      else if (seg && seg !== '.') out.push(seg);
    }
    return out;
  };
  for (const m of text.matchAll(/(['"`])(\.\.?\/[\w./-]*)\1/g)) {
    const segs = norm([`tests/${m[2]}`]);
    try {
      if (segs.length && fs.statSync(path.join(root, ...segs)).isDirectory()) dirs.push({ segs, anchored: true });
    } catch {
      // not a directory of this repository
    }
  }
  for (const m of text.matchAll(/path\.(?:join|resolve)\(/g)) {
    const args = [];
    let depth = 1;
    let quote = '';
    let arg = '';
    for (let i = m.index + m[0].length; i < text.length && depth > 0; i++) {
      const c = text[i];
      if (quote) quote = c === quote ? '' : quote;
      else if (c === "'" || c === '"' || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
      if (c === ',' && depth === 1 && !quote) {
        args.push(arg.trim());
        arg = '';
      } else arg += c;
    }
    args.push(arg.trim());
    let parts = [];
    let anchored = false;
    // A leading directory that is neither `__dirname`, a `./` or `../` literal, nor `path.dirname(...)` is a fixture tree's
    // (a variable, `os.tmpdir()`, a bare relative literal), so the call names no directory of the repository.
    if (!/^(__dirname$|(['"`])\.\.?\/|path\.dirname\()/.test(args[0])) continue;
    // `path.dirname(<name>)`, where the suite assigns `<name>` a `require.resolve` of a relative path, is that path's
    // directory, so the call is anchored.
    const resolved = args[0].match(/^path\.dirname\(\s*([A-Za-z_$][\w$]*)\s*\)$/);
    const target = resolved && text.match(new RegExp(`(?:const|let|var)\\s+${escapeRe(resolved[1])}\\s*=\\s*require\\.resolve\\(\\s*(['"])(\\.[^'"]*)\\1\\s*\\)`));
    args.forEach((a, i) => {
      const lit = a.match(/^(['"`])([^'"`$]*)\1$/);
      if (i === 0 && target) [parts, anchored] = [[path.posix.dirname(path.posix.join('tests', target[2]))], true];
      else if (i === 0 && a === '__dirname') [parts, anchored] = [['tests'], true];
      else if (lit) {
        if (i === 0) [parts, anchored] = [['tests'], true];
        parts.push(lit[2]);
      } else [parts, anchored] = [[], false];
    });
    const segs = norm(parts);
    if (segs.length) dirs.push({ segs, anchored });
  }
  return dirs;
}

// How many files of the tree under `root` carry each basename, skipping `.git`, `node_modules`, `.superdev`, and every
// subdirectory that is a checkout of its own (it holds a `.git`, as a linked worktree under `.claude/worktrees/` does).
function basenameCounts(root) {
  const counts = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (dir !== root && entries.some((e) => e.name === '.git')) return;
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!['.git', 'node_modules', '.superdev'].includes(e.name)) walk(path.join(dir, e.name));
      } else counts.set(e.name, (counts.get(e.name) || 0) + 1);
    }
  };
  walk(root);
  return counts;
}

// Whether a mention of a basename several files share names `rel`: the path text right before the mention, or the
// literal arguments before it in a join call (`'plugin', 'hooks', 'x.json'`), with `./` and `../` segments dropped, is a
// directory `rel`'s own directory ends with. A bare mention names a root file.
function namesShared(before, rel) {
  const joined = before.match(/((?:['"`][\w./-]*['"`]\s*,\s*)+)['"`]$/);
  const text = joined ? joined[1].replace(/['"`]\s*,\s*/g, '/').replace(/['"`]/g, '') : before.match(/[\w./-]*$/)[0];
  const dir = text.split('/').filter((seg) => seg && seg !== '.' && seg !== '..');
  const own = path.posix.dirname(rel).split('/').filter((seg) => seg !== '.');
  if (!dir.length) return !own.length;
  return dir.length <= own.length && dir.every((seg, k) => own[own.length - dir.length + k] === seg);
}

// The repository-root release tooling. semantic-release and Bun read these, never a suite's code under test, so a
// change to one reaches only the suites whose text names it and never makes every suite run.
const RELEASE_TOOLING = ['release.config.cjs', 'package.json', 'bun.lock'];

// A suite's text with its comments removed: every line that opens with `//` or `*`, and every ` // ` comment that
// trails code. A citation in a comment is no read.
const uncommented = (text) => text.replace(/^\s*(?:\/\/|\/?\*).*$/gm, '').replace(/\s\/\/\s.*$/gm, '');

// Whether the string holding the mention at `at` names a path of the repository, by the directory rule of `namedDirs`: the
// string opens with `./` or `../`, or it is a literal argument of a `path.join` / `path.resolve` call whose first argument
// is `__dirname`, a `./` or `../` literal, `path.dirname(...)`, or a variable the suite assigns one of those or a
// `require.resolve` of a relative path. A bare relative string (`'docs/agents/verification.md'`)
// or a join from any other value (`path.join(S3, 'docs', ...)`) is a fixture tree's path.
function anchoredString(text, at) {
  let open = at - 1;
  while (open >= 0 && !`'"\``.includes(text[open])) open--;
  if (/^\.\.?\//.test(text.slice(open + 1, at))) return true;
  const join = text.slice(Math.max(0, open - 400), open).match(/path\.(?:join|resolve)\(\s*([^,()]+(?:\([^()]*\))?)(?:\s*,\s*(['"`])[^'"`]*\2)*\s*,\s*$/);
  if (!join) return false;
  const lead = join[1].trim();
  if (ANCHORED_LEAD.test(lead)) return true;
  // A variable the suite assigns, anywhere in its text, a `require.resolve` of a relative path or a join from an
  // anchored leading directory (`const repo = path.join(path.dirname(scopePath), '..')`) is anchored too.
  return /^[A-Za-z_$][\w$]*$/.test(lead) && new RegExp(
    `(?:const|let|var)\\s+${escapeRe(lead)}\\s*=\\s*(?:require\\.resolve\\(\\s*['"]\\.|path\\.(?:join|resolve)\\(\\s*(?:__dirname\\b|['"\`]\\.\\.?\\/|path\\.dirname\\())`,
  ).test(text);
}
const ANCHORED_LEAD = /^(?:__dirname|(['"`])\.\.?\/[^'"`]*\1|path\.dirname\([^()]*\))$/;

// Whether a named directory holds the repository-relative path `rel`.
function under({ segs, anchored }, rel) {
  const dir = path.posix.dirname(rel).split('/');
  const from = anchored ? [0] : dir.keys();
  for (const i of from) if (segs.every((seg, k) => dir[i + k] === seg)) return true;
  return false;
}

// The suites a change set reaches, as a subset of `suites`, in suite order. A suite is reached when
// its own text names a changed file (its basename, or its bare stem between path or quote
// delimiters; a basename another file of the tree shares counts only with a directory part, `namesShared`; a `.md`
// basename counts only where it ends a string outside a comment, in a path anchored the way a named directory is,
// `anchoredString`, so a citation, a sentence of fixture text, or a fixture tree's path is no read), when the file its name pins (`pinnedBy`) is the changed file, when the changed file is reached by
// relative `require` edges, walked transitively through modules (`plugin/lib/` files and non-suite files under
// `tests/`), from that pinned file or from the suite file itself, or when the changed path is the suite itself. A `.md` path also reaches a suite whose text names a directory
// holding it (`namedDirs`), because a suite may list or scan a directory; a code path never takes the
// directory rule, so one no rule places keeps making every suite run, except a `RELEASE_TOOLING` path, which no
// suite's code under test reads. A `.md` path no suite names, like a
// `scripts/drift/` path (the drift selftest sits in the tail), reaches no suite. Paths are matched by
// name, so a deleted path maps like any other.
// shortcut: `require` is read by regex, transitively from the file a suite pins and from the suite itself, wherever the
// call sits; a dynamic require reaches no suite and, for an otherwise unplaced path, falls back to every suite.
function selectSuites(root, suites, paths) {
  const bases = basenameCounts(root);
  const texts = suites.map((file) => fs.readFileSync(file, 'utf8'));
  const pinned = suites.map((file) => pinnedBy(root, path.basename(file, '.test.js')));
  const requires = suites.map((file, i) => {
    const reached = reachedBy(root, path.relative(root, file).split(path.sep).join('/'));
    if (pinned[i]) for (const r of reachedBy(root, pinned[i])) reached.add(r);
    return reached;
  });
  const dirs = texts.map((text) => namedDirs(root, text));
  const chosen = new Set();
  for (const raw of paths) {
    const rel = path.posix.normalize(raw.split(path.sep).join('/'));
    if (rel.startsWith('scripts/drift/')) continue;
    const base = path.posix.basename(rel);
    const stem = base.replace(/\.js$/, '');
    const named = new RegExp(`(?<![\\w-])${escapeRe(base)}(?![\\w-])|(?<=[/'"\`])${escapeRe(stem)}(?=[/'"\`])`, 'g');
    const shared = (bases.get(base) || 0) > (fs.existsSync(path.join(root, rel)) ? 1 : 0);
    const read = new RegExp(`(?<=['"\`/])${escapeRe(base)}(?=['"\`])`, 'g');
    const names = (text) => {
      const scanned = rel.endsWith('.md') ? uncommented(text) : text;
      return [...scanned.matchAll(rel.endsWith('.md') ? read : named)].some(
        (m) => (!rel.endsWith('.md') || anchoredString(scanned, m.index)) && (!shared || namesShared(scanned.slice(0, m.index), rel)),
      );
    };
    let placed = rel.startsWith(MOD_DIR) || RELEASE_TOOLING.includes(rel);
    suites.forEach((file, i) => {
      if (
        path.posix.join('tests', path.basename(file)) === rel ||
        (path.posix.dirname(rel) !== 'tests' && path.basename(file, '.test.js') === stem) ||
        pinned[i] === rel ||
        names(texts[i]) ||
        requires[i].has(rel) ||
        (rel.endsWith('.md') && dirs[i].some((d) => under(d, rel)))
      ) {
        chosen.add(i);
        placed = true;
      }
    });
    if (!placed && !rel.endsWith('.md')) return suites;
  }
  return suites.filter((_, i) => chosen.has(i));
}

// `--related <path>...` gives the changed-path set; no flag is the full run (undefined).
function parseArgs(argv) {
  const at = argv.indexOf('--related');
  return at < 0 ? undefined : argv.slice(at + 1);
}

// Ends a step's whole process group (each step is spawned as a group leader), so no process the step started outlives it.
function killGroup(child) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // the group is already gone
  }
}

// Runs `steps` ([command, args, label]) at most `limit` at a time, in order, and resolves the exit code. A step's output is
// collected and printed whole, between its label line and its timing line, when the step ends. The first failing step
// ends every running step with its processes, starts no further step, and prints `FAILED`; a step this runner ended
// prints one cancelled line and none of its output. A step whose process had already exited on its own when the run
// stopped prints its output and result as usual. The runner learns of an exit from the child's `exit` event, so a step
// whose process exited in the event-loop turn before the stop, with that event not yet delivered, is still signalled
// and labelled cancelled. A child that was killed, never started, or reported an error carries no
// status, and that is a failure, never a pass (INV-0009). A SIGINT, SIGTERM, or SIGHUP, and a write error on stdout (the
// reader went away), end every running step the same way. The kill reaches each step's own process group: a descendant
// that starts a group of its own escapes it, and one that holds the step's pipe open and never exits hangs the run.
// SIGKILL of the runner cannot be handled, so it leaves the steps running.
// Ceiling: on Windows a negative pid names no process group, so `process.kill(-pid)` throws, `killGroup` swallows the
// throw, and neither a failure nor a signal ends a running step or its processes there; the run still exits nonzero
// once every running step ends on its own (ADR 0150). The runner is maintainer-only, so no adopter meets this ceiling.
function runSteps(steps, cwd, out, limit, durations = new Map()) {
  return new Promise((resolve) => {
    const running = new Set();
    // The running children whose process has exited (their pipes may still be open), and those `stop` ended.
    const exited = new Set();
    const cancelled = new Set();
    let next = 0;
    let code = 0;
    let stopping = false;
    const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => [signal, () => stop(128 + os.constants.signals[signal])]);
    const onStdoutError = () => stop(1);
    const settle = () => {
      if (running.size || (!stopping && next < steps.length)) return;
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
      process.stdout.removeListener('error', onStdoutError);
      resolve(code);
    };
    function stop(status) {
      if (!stopping) code = status;
      stopping = true;
      for (const child of running) {
        if (!exited.has(child)) cancelled.add(child);
        killGroup(child);
      }
      settle();
    }
    for (const [signal, handler] of handlers) process.on(signal, handler);
    process.stdout.on('error', onStdoutError);

    function start() {
      while (!stopping && running.size < limit && next < steps.length) {
        const [command, args, label] = steps[next++];
        const started = performance.now();
        const chunks = [];
        let failure;
        let done = false;
        let child;
        try {
          child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
        } catch (err) {
          // spawn throws synchronously for an argument Node refuses and for a libuv error such as E2BIG
          out(`run-tests: FAILED ${label} (did not start: ${err.message})`);
          stop(1);
          return;
        }
        running.add(child);
        const finish = (status, signal) => {
          if (done) return;
          done = true;
          running.delete(child);
          exited.delete(child);
          if (cancelled.delete(child)) out(`run-tests: ${label}: cancelled`);
          else {
            const text = Buffer.concat(chunks).toString().replace(/\n$/, '');
            const ms = Math.round(performance.now() - started);
            durations.set(label, ms);
            out([`run-tests: ${label}`, ...(text ? [text] : []), `run-tests: ${label}: ${ms} ms`].join('\n'));
            if (status !== 0) {
              const why = signal ? `killed by ${signal}` : failure ? `did not start: ${failure.message}` : `exit ${status}`;
              out(`run-tests: FAILED ${label} (${why})`);
              stop(status || 1);
              return;
            }
          }
          start();
          settle();
        };
        for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => chunks.push(chunk));
        child.on('error', (err) => {
          failure = err;
          if (!child.pid) finish(1, null);
        });
        child.on('exit', () => {
          exited.add(child);
          killGroup(child);
        });
        child.on('close', (status, signal) => finish(status, signal));
      }
    }
    start();
    settle();
  });
}

// Where the last run's per-suite durations live: under `node_modules/`, which git ignores and `bun install` keeps.
const DURATIONS_FILE = path.join('node_modules', '.cache', 'run-tests.json');

// The `{ label: ms }` map the last run left in `root`, or an empty one.
function readDurations(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, DURATIONS_FILE), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Merges this run's measured durations into the file. A run that cannot write it loses only the ordering.
function writeDurations(root, before, measured) {
  try {
    fs.mkdirSync(path.join(root, path.dirname(DURATIONS_FILE)), { recursive: true });
    fs.writeFileSync(path.join(root, DURATIONS_FILE), JSON.stringify({ ...before, ...Object.fromEntries(measured) }, null, 2) + '\n');
  } catch {
    /* ordering only */
  }
}

// `parallelism` is how many steps run at once; it defaults to the logical CPUs available to the process. The suites start
// longest first by the durations the last run recorded, a suite with none first of all, so the slowest suite never
// starts last and holds the run open alone. With no record the order is the discovery order.
function runAll({ root, tail = TAIL, modSuite = MOD_SUITE, out = console.log, related, parallelism = os.availableParallelism() }) {
  const found = discoverSuites(path.join(root, 'tests'));
  if (found.length === 0) {
    out(`run-tests: no suite found under ${path.join(root, 'tests')}`);
    return Promise.resolve(1);
  }
  const suites = related ? selectSuites(root, found, related) : found;
  const mod = related && related.some((p) => path.posix.normalize(p.split(path.sep).join('/')).startsWith(MOD_DIR));
  const before = readDurations(root);
  const known = (label) => (Number.isFinite(before[label]) ? before[label] : Infinity);
  const suiteSteps = suites.map((file) => [process.execPath, [file], path.relative(root, file)]);
  suiteSteps.sort((a, b) => known(b[2]) - known(a[2]) || 0);
  const steps = [
    ...suiteSteps,
    ...(mod ? [modSuite, ...tail] : tail).map(([command, args]) => [command, args, [path.basename(command), ...args].join(' ')]),
  ];
  const measured = new Map();
  return runSteps(steps, root, out, Math.max(1, parallelism), measured).then((code) => {
    writeDurations(root, before, measured);
    return code;
  });
}

module.exports = { discoverSuites, selectSuites, parseArgs, runAll, TAIL };

if (require.main === module) {
  runAll({ root: path.join(__dirname, '..'), related: parseArgs(process.argv.slice(2)) }).then((code) => {
    process.exitCode = code;
  });
}
