'use strict';

// Suite for plugin/scripts/scope.js's `discard` verb (ADR 0208, INV-0181): the one sanctioned removal of a run's ledger and run trace.
// It removes `ledger.md`, `trace.log`, and `run.lock`, then the run root when that leaves it empty, and refuses a root outside the
// main working tree's `.superdev/scopes/<scope>/` and a run whose stage is later than `planned`.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { run } = require('./scope-setup');

const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-discard-')));
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
const scopes = path.join(repo, '.superdev', 'scopes');

const call = (argv) => {
  try {
    run(argv, repo, '');
    return { ok: true };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message };
    throw e;
  }
};
const RUN_FILES = ['ledger.md', 'trace.log', 'run.lock'];
function makeRun(scope, stage, extra) {
  const root = path.join(scopes, scope);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), `# Ledger — ${scope}\n\n**Stage:** ${stage}\n`);
  fs.writeFileSync(path.join(root, 'trace.log'), 'x\n');
  fs.writeFileSync(path.join(root, 'run.lock'), 'plan n\n');
  for (const e of extra || []) {
    if (e.endsWith('/')) fs.mkdirSync(path.join(root, e), { recursive: true });
    else fs.writeFileSync(path.join(root, e), 'x\n');
  }
  return root;
}

// A planned run holding only the three files: all go, and the root with them.
{
  const root = makeRun('a', 'planned');
  assert.ok(call(['discard', '--root', root]).ok, 'discard of a planned run succeeds');
  assert.equal(fs.existsSync(root), false, 'the emptied run root is removed');
  // Run twice, and on an absent root: exit 0.
  assert.ok(call(['discard', '--root', root]).ok, 'discard of an absent root succeeds');
}

// Other content keeps the root.
for (const extra of [['dod.md'], ['scopetree/']]) {
  const root = makeRun('b', 'planned', extra);
  assert.ok(call(['discard', '--root', root]).ok, 'discard with other content succeeds: ' + extra);
  for (const f of RUN_FILES) assert.equal(fs.existsSync(path.join(root, f)), false, f + ' removed beside ' + extra);
  assert.ok(fs.existsSync(path.join(root, extra[0])), 'the other content stays: ' + extra);
  assert.ok(call(['discard', '--root', root]).ok, 'a second discard succeeds');
  fs.rmSync(root, { recursive: true, force: true });
}

// An absent file is no error: a root holding only the lock loses it and goes.
{
  const root = path.join(scopes, 'c');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'run.lock'), 'x\n');
  assert.ok(call(['discard', '--root', root]).ok, 'discard with no ledger succeeds');
  assert.equal(fs.existsSync(root), false, 'the lock-only root is removed');
}

// Refusals remove nothing.
{
  const keep = makeRun('d', 'planned');
  const refused = (argv, why) => {
    const r = call(argv);
    assert.equal(r.ok, false, 'refused: ' + why);
    for (const f of RUN_FILES) assert.ok(fs.existsSync(path.join(keep, f)), f + ' kept after a refusal: ' + why);
    return r.err;
  };
  assert.ok(/--root/.test(refused(['discard'], 'missing --root')), 'the refusal names --root');
  refused(['discard', '--root', scopes], '.superdev/scopes itself');
  refused(['discard', '--root', path.join(repo, '.superdev')], '.superdev');
  refused(['discard', '--root', path.join(scopes, 'd', '..', '..', 'kb-pending', 'd')], 'a .. escape');
  refused(['discard', '--root', path.join(scopes, 'd', 'scopetree')], 'a path below a run root');
  refused(['discard', '--root', path.join(os.tmpdir(), 'elsewhere', '.superdev', 'scopes', 'd')], 'another tree');
  // A symlink inside the scopes directory that points at another tree is judged by its target.
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-discard-out-')));
  fs.writeFileSync(path.join(outside, 'ledger.md'), '**Stage:** planned\n');
  fs.symlinkSync(outside, path.join(scopes, 'link'));
  assert.equal(call(['discard', '--root', path.join(scopes, 'link')]).ok, false, 'a symlinked root leaving the scopes directory is refused');
  assert.ok(fs.existsSync(path.join(outside, 'ledger.md')), 'the symlink target keeps its file');
  fs.unlinkSync(path.join(scopes, 'link'));
  for (const stage of ['implementing', 'merged', 'reviewed', 'submitted', 'closed']) {
    const root = makeRun('e', stage);
    const r = call(['discard', '--root', root]);
    assert.equal(r.ok, false, 'a run at ' + stage + ' is refused');
    assert.ok(/planned/.test(r.err), 'the stage refusal names planned: ' + stage);
    for (const f of RUN_FILES) assert.ok(fs.existsSync(path.join(root, f)), f + ' kept at ' + stage);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

console.log('scope-discard tests ok');
