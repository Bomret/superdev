'use strict';

// Fixture repositories commit regardless of the maintainer's global git config.
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `red-evidence` verb: the scope review's red-evidence reading (`references/review-scope-mode.md`'s
// `### 4.2 Red evidence`). It reads the ledger's suite and failed records, the run trace, and a check-status file, and writes nothing.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scopePath, run } = require('./scope-setup');
const { appendTrace } = require(scopePath);
const { encodePaths } = require('../plugin/lib/trace-log.js');

const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const made = [];

// The verb in-process: its stdout lines, or the refusal it threw.
const verb = (argv, cwd) => {
  const logged = [];
  const orig = console.log;
  console.log = (s) => logged.push(String(s));
  process.exitCode = undefined;
  try {
    run(['red-evidence', ...argv], cwd, '');
    return { ok: true, code: process.exitCode || 0, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message };
    throw e;
  } finally {
    console.log = orig;
    process.exitCode = undefined;
  }
};

const VERIF = (focused, extra = '') => `# V\n\n\`\`\`\nnode all.js\n\`\`\`\n\n\`\`\`\n${focused}\n\`\`\`\n${extra}`;
const commit = (repo, file, text, msg) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
  g(['add', '-A'], repo);
  g(['commit', '-q', '-m', msg], repo);
  return g(['rev-parse', 'HEAD'], repo);
};

// A repository whose `feat` branch holds R (a range commit), then M and T on top of it, and a side commit S off R's ancestry.
function make(focused = 'node focus.js {paths}', extra = '') {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-red-')));
  made.push(repo);
  g(['init', '-q', '-b', 'main'], repo);
  fs.writeFileSync(path.join(repo, '.gitignore'), '.superdev/\n');
  commit(repo, 'docs/agents/verification.md', VERIF(focused, extra), 'base');
  commit(repo, 'tests/a.test.js', 'a\n', 'tests');
  const B = g(['rev-parse', 'HEAD'], repo);
  g(['checkout', '-q', '-b', 'feat'], repo);
  const R = commit(repo, 'src/x.js', 'x\n', 'range');
  const M = commit(repo, 'src/x.js', 'fixed\n', 'fix');
  const T = commit(repo, 'src/y.js', 'y\n', 'more');
  g(['checkout', '-q', '-b', 'side', B], repo);
  const S = commit(repo, 'src/z.js', 'z\n', 'side');
  g(['checkout', '-q', 'feat'], repo);
  let n = 0;
  // A run root: `header` lines (`Suite`, `Failed`) and trace run lines.
  const root = (header, lines = []) => {
    const rt = path.join(repo, '.superdev', 'scopes', `f-${++n}`);
    fs.mkdirSync(rt, { recursive: true });
    fs.writeFileSync(path.join(rt, 'ledger.md'), `# Ledger — f-${n}\n\n**Stage:** reviewed\n**Branch:** feat\n${header.map((h) => `${h}\n`).join('')}**Anchor:** #1 — f\n\n` +
      '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n', 'utf8');
    for (const l of lines) appendTrace(rt, { kind: 'run', fields: l });
    return rt;
  };
  const args = (rt, extra = []) => ['--root', rt, '--branch', 'feat', '--base', 'main', ...extra];
  return { repo, B, R, M, T, S, root, args };
}

try {
  const f = make();

  // A red record at the tip prints the commit and the failed files its paired `Failed` record names.
  {
    const rt = f.root([`**Suite:** red @ ${f.T}`, `**Failed:** tests/a.test.js @ ${f.T}`]);
    const r = verb(f.args(rt), f.repo);
    assert.deepStrictEqual(r, { ok: true, code: 0, out: `red ${f.T} files=tests/a.test.js` }, 'a red record at the tip is a finding');
  }
  console.log('scope-red-evidence tests passed');
} finally {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
}
