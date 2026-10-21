#!/usr/bin/env node
'use strict';

// run-tests: the maintainer-only test runner; `package.json` carries no test script. It finds the suites under tests/ by
// their `*.test.js` name, so a suite added to the tree runs with no roster edit, runs each
// under `node` (the hooks' production runtime) in name order, and then the fixed tail: the invariant
// register check, the drift selftest, drift-check, and plugin manifest validation. Every step prints
// one `run-tests: <label>: <ms> ms` line, so a test audit ranks measured cost. The first failure stops
// the run and exits nonzero, naming what failed. `--related <path>...` runs the tail plus only the
// suites the changed paths reach (`selectSuites`), and the mod suite when a path is under `MOD_DIR`. Pure Node, no shell.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

// The directories a suite's text names, as { segs, anchored }: a path string that is a directory of the
// repository (anchored at its root; a `./` or `../` string resolves from `tests/`), and the literal segments of a
// `path.join` / `path.resolve` call. A call whose first argument is `__dirname` or a literal is anchored; a call
// whose leading directory is computed (`path.dirname(hookPath)`) names only its literal tail, which matches
// that tail at any depth, so it can select a suite for a directory it does not scan but never miss one it does.
// Ceiling: a directory built by a computed expression with no literal segment (`path.join(dir, name)`), or by a
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
  for (const m of text.matchAll(/(['"`])([\w./-]+\/[\w./-]*)\1/g)) {
    const segs = norm([m[2].startsWith('.') ? `tests/${m[2]}` : m[2]]);
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
    args.forEach((a, i) => {
      const lit = a.match(/^(['"`])([^'"`$]*)\1$/);
      if (i === 0 && a === '__dirname') [parts, anchored] = [['tests'], true];
      else if (lit) {
        if (i === 0) anchored = true;
        parts.push(lit[2]);
      } else [parts, anchored] = [[], false];
    });
    const segs = norm(parts);
    if (segs.length) dirs.push({ segs, anchored });
  }
  return dirs;
}

// Whether a named directory holds the repository-relative path `rel`.
function under({ segs, anchored }, rel) {
  const dir = path.posix.dirname(rel).split('/');
  const from = anchored ? [0] : dir.keys();
  for (const i of from) if (segs.every((seg, k) => dir[i + k] === seg)) return true;
  return false;
}

// The suites a change set reaches, as a subset of `suites`, in suite order. A suite is reached when
// its own text names a changed file (its basename, or its bare stem between path or quote
// delimiters), when the file its name pins (`pinnedBy`) is the changed file, when the changed file is reached by
// relative `require` edges, walked transitively through modules (`plugin/lib/` files and non-suite files under
// `tests/`), from that pinned file or from the suite file itself, or when the changed path is the suite itself. A `.md` path also reaches a suite whose text names a directory
// holding it (`namedDirs`), because a suite may list or scan a directory; a code path never takes the
// directory rule, so one no rule places keeps making every suite run. A `.md` path no suite names, like a
// `scripts/drift/` path (the drift selftest sits in the tail), reaches no suite. Paths are matched by
// name, so a deleted path maps like any other.
// shortcut: `require` is read by regex, transitively from the file a suite pins and from the suite itself, wherever the
// call sits; a dynamic require reaches no suite and, for an otherwise unplaced path, falls back to every suite.
function selectSuites(root, suites, paths) {
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
    const named = new RegExp(`(?<![\\w-])${escapeRe(base)}(?![\\w-])|(?<=[/'"\`])${escapeRe(stem)}(?=[/'"\`])`);
    let placed = rel.startsWith(MOD_DIR);
    suites.forEach((file, i) => {
      if (
        path.posix.join('tests', path.basename(file)) === rel ||
        (path.posix.dirname(rel) !== 'tests' && path.basename(file, '.test.js') === stem) ||
        pinned[i] === rel ||
        named.test(texts[i]) ||
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

// Returns the exit code. A child that was killed or never started carries no status, and that is a
// failure, never a pass (INV-0009).
function runStep(command, args, cwd, label, out) {
  out(`run-tests: ${label}`);
  const started = performance.now();
  const r = spawnSync(command, args, { cwd, stdio: 'inherit' });
  out(`run-tests: ${label}: ${Math.round(performance.now() - started)} ms`);
  if (r.status === 0) return 0;
  const why = r.signal ? `killed by ${r.signal}` : r.error ? `did not start: ${r.error.message}` : `exit ${r.status}`;
  out(`run-tests: FAILED ${label} (${why})`);
  return r.status || 1;
}

function runAll({ root, tail = TAIL, modSuite = MOD_SUITE, out = console.log, related }) {
  const found = discoverSuites(path.join(root, 'tests'));
  if (found.length === 0) {
    out(`run-tests: no suite found under ${path.join(root, 'tests')}`);
    return 1;
  }
  const suites = related ? selectSuites(root, found, related) : found;
  for (const file of suites) {
    const code = runStep(process.execPath, [file], root, path.relative(root, file), out);
    if (code !== 0) return code;
  }
  const mod = related && related.some((p) => path.posix.normalize(p.split(path.sep).join('/')).startsWith(MOD_DIR));
  for (const [command, args] of mod ? [modSuite, ...tail] : tail) {
    const code = runStep(command, args, root, [path.basename(command), ...args].join(' '), out);
    if (code !== 0) return code;
  }
  return 0;
}

module.exports = { discoverSuites, selectSuites, parseArgs, runAll, TAIL };

if (require.main === module) {
  process.exitCode = runAll({ root: path.join(__dirname, '..'), related: parseArgs(process.argv.slice(2)) });
}
