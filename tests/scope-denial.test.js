'use strict';

// Suite for plugin/scripts/scope.js's `denial` verb (INV-0196): the verdict for a denied dispatch the caller already recorded,
// read from the ledger's slice rows and `**Degraded:**` bullets. The verb only reads, so every case writes its own ledger in one
// temporary directory.

const { test, after } = require('node:test');
require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call, cleanup } = require('./scope-setup');
after(() => {
  cleanup();
});

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-denial-')));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const TABLE = ['| id | issue | title | type | depends-on | status | range |', '|----|-------|-------|------|------------|--------|-------|'];
const DENIED = '- denied: pass ran inline — dispatch denied by the permission classifier';
const RESET = '- denials reset: cause addressed';
const B = 'behavior';
const FULL = [B, B, B, B];
let n = 0;
// A run root whose ledger holds the given slice types (none writes no table) and `**Degraded:**` bullets (none writes no line).
const rootWith = (types, bullets = []) => {
  const root = path.join(dir, 'run' + n++);
  fs.mkdirSync(root);
  const rows = types.map((t, i) => `| ${String(i + 1).padStart(2, '0')} | #${i + 1} | t${i + 1} | ${t} | — | todo | — |`);
  const lines = ['# Run state', '', '**Stage:** implement'];
  if (bullets.length) lines.push('**Degraded:**', ...bullets);
  if (types.length) lines.push('', ...TABLE, ...rows);
  fs.writeFileSync(path.join(root, 'ledger.md'), lines.concat('').join('\n'));
  return root;
};
const verdict = (pass, root, unattended) => {
  const r = call(['denial', pass, ...(unattended ? ['--unattended'] : []), '--root', root]);
  assert.ok(r.ok, `denial ${pass} should not refuse: ${r.err}`);
  return r.out;
};
const refused = (argv) => {
  const r = call(argv);
  assert.ok(!r.ok, `${argv.join(' ')} should refuse`);
  return r.err;
};
const lots = (k) => Array(k).fill(DENIED);

test('Attended, every denial is inline with no cap, whatever the tier.', () => {
  assert.strictEqual(verdict('final-reviewer', rootWith(FULL, lots(3)), false), 'inline', 'a third attended denial is inline');
  assert.strictEqual(verdict('implementer', rootWith(FULL), false), 'inline', 'an attended denied implementer is inline');
  assert.strictEqual(verdict('slice-reviewer', rootWith([], lots(1)), false), 'inline', 'an attended unknown tier is inline');
});

test('Unattended, a denied implementer or fix blocks at once, recorded or not.', () => {
  assert.strictEqual(verdict('implementer', rootWith(FULL), true), 'block implementer');
  assert.strictEqual(verdict('fix', rootWith([B]), true), 'block implementer');
});

test('Unattended verification: an unknown tier blocks, then authored work blocks, then the second denial.', () => {
  assert.strictEqual(verdict('final-reviewer', rootWith([], lots(1)), true), 'block unknown-tier');
  assert.strictEqual(verdict('final-reviewer', rootWith([B, B], lots(1)), true), 'block authored', 'a lite run is authored');
  assert.strictEqual(verdict('doc-reader', rootWith([...FULL, 'docs'], lots(1)), true), 'block authored', 'a docs row is authored');
  assert.strictEqual(verdict('final-reviewer', rootWith([...FULL, 'mechanical'], lots(1)), true), 'block authored', 'a mechanical row is authored');
  // A slice review verifies a behavior slice a dispatched implementer built, so it is never authored work.
  assert.strictEqual(verdict('slice-reviewer', rootWith([...FULL, 'docs'], lots(1)), true), 'inline', 'a first slice-review denial with a docs row is inline');
  assert.strictEqual(verdict('slice-reviewer', rootWith([...FULL, 'mechanical'], lots(2)), true), 'block second-denial', 'a second slice-review denial blocks');
  assert.strictEqual(verdict('final-reviewer', rootWith(FULL, lots(1)), true), 'inline', 'the first denial of an all-behavior full run is inline');
  assert.strictEqual(verdict('final-reviewer', rootWith(FULL, lots(2)), true), 'block second-denial');
  assert.strictEqual(verdict('final-reviewer', rootWith(FULL, lots(3)), true), 'block second-denial', 'a later denial still blocks');
});

test('The count runs from the last reset marker.', () => {
  assert.strictEqual(verdict('final-reviewer', rootWith(FULL, [...lots(2), RESET, DENIED]), true), 'inline', 'denials before a reset do not count');
  assert.strictEqual(verdict('final-reviewer', rootWith(FULL, [...lots(2), RESET, DENIED, DENIED]), true), 'block second-denial');
});

test('A plain degraded entry is no denial.', () => {
  assert.ok(refused(['denial', 'final-reviewer', '--root', rootWith(FULL, ['- ran inline — kb writer could not stage'])]).includes('denial'));
});

test('Refusals: an unknown pass, an unrecorded verification denial (also behind a reset), a missing pass, a stray argument, a bad root.', () => {
  assert.ok(refused(['denial', 'simplicity-reviewer', '--root', rootWith(FULL, lots(1))]).includes('simplicity-reviewer'));
  // A plan-time or brainstorm-time reader is no verification pass.
  for (const reader of ['slice-readiness-reviewer', 'intent-challenger']) {
    assert.ok(refused(['denial', reader, '--root', rootWith(FULL, lots(1))]).includes(`"${reader}" is no known pass`), `${reader} is no pass`);
  }
  assert.ok(refused(['denial', 'final-reviewer', '--root', rootWith(FULL)]).includes('record'));
  assert.ok(refused(['denial', 'final-reviewer', '--unattended', '--root', rootWith(FULL, [...lots(2), RESET])]).includes('record'));
  refused(['denial', '--root', rootWith(FULL)]);
  refused(['denial', 'final-reviewer', 'extra', '--root', rootWith(FULL, lots(1))]);
  refused(['denial', 'final-reviewer', '--root', path.join(dir, 'absent')]);
});

test('The verb writes nothing.', () => {
  const root = rootWith(FULL, lots(1));
  const before = fs.readdirSync(root).sort().join() + fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  verdict('final-reviewer', root, true);
  assert.strictEqual(fs.readdirSync(root).sort().join() + fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), before);
});

