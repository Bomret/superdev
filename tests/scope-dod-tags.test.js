'use strict';

// Suite for plugin/scripts/scope.js's `dod-tags` verb: the criterion-tag rewrite into store notation, the
// check mode without a map, `--line` mode, and the refusals (ADR 0209, INV-0182). The shared directory and
// `call` come from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { call, scopePath, cleanup } = require('./scope-setup');

const fileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-tags-args-'));
let fileCount = 0;
const writeFile = (text) => {
  const p = path.join(fileDir, `f-${fileCount++}.txt`);
  fs.writeFileSync(p, text, 'utf8');
  return p;
};
const mapFile = (pairs) => writeFile(pairs.join('\n') + '\n');
const section = (...lines) => ['# Epic', '', '## Definition of Done', '', ...lines, ''].join('\n');

try {
  let r;

  // A tag naming several slices reaches store notation, and dod-line ticks the line by its criterion alone.
  {
    const map = mapFile(['01 #1388', '02 #1396']);
    r = call(['dod-tags', '--map-file', map], section('- [ ] x — 01, 02'));
    assert.ok(r.ok, 'dod-tags rewrites: ' + (r.err || ''));
    assert.strictEqual(r.out, section('- [ ] x — #1388, #1396'));
    const t = call(
      ['dod-line', '--match-file', writeFile('x'), '--verdict', 'met', '--note-file', writeFile('seen')],
      r.out
    );
    assert.ok(t.ok, 'dod-line ticks the rewritten line: ' + (t.err || ''));
    assert.ok(t.out.includes('- [x] x — #1388, #1396 — met: seen'), t.out);
  }

  // A mixed tag rewrites the id and keeps the reference; Jira keys work the same.
  {
    r = call(['dod-tags', '--map-file', mapFile(['01 #1388'])], section('- [ ] x — 01, #1390'));
    assert.ok(r.ok, r.err);
    assert.strictEqual(r.out, section('- [ ] x — #1388, #1390'));
    r = call(['dod-tags', '--map-file', mapFile(['01 PROJ-1', '02 PROJ-2'])], section('- [ ] x — 01, 02', '- [ ] y — PROJ-3, 01'));
    assert.ok(r.ok, r.err);
    assert.strictEqual(r.out, section('- [ ] x — PROJ-1, PROJ-2', '- [ ] y — PROJ-3, PROJ-1'));
  }

  // scope, docs, store tags, judged lines, text outside the section, and trailing whitespace pass unchanged;
  // a second run over the output changes nothing.
  {
    const body = [
      '# Epic',
      '',
      'Intro with - [ ] a — 01 outside the section',
      '- [ ] outside — 01',
      '',
      '## Definition of Done',
      '',
      '- [ ] a — 01   ',
      '- [ ] b — scope',
      '- [ ] c — docs  ',
      '- [ ] d — #1400',
      '- [x] e — 01 — met: done',
      '- [ ] f — 01 — not met: later',
      '',
      '## Non-goals',
      '',
      '- [ ] g — 07',
      '',
    ].join('\n');
    const map = mapFile(['01 #1388']);
    r = call(['dod-tags', '--map-file', map], body);
    assert.ok(r.ok, r.err);
    const want = body.replace('- [ ] a — 01   ', '- [ ] a — #1388   ');
    assert.strictEqual(r.out, want);
    const again = call(['dod-tags', '--map-file', map], r.out);
    assert.ok(again.ok, again.err);
    assert.strictEqual(again.out, r.out, 'a second run changes nothing');
  }

  // A criterion holding ` — ` keeps its text.
  {
    r = call(['dod-tags', '--map-file', mapFile(['01 #1388'])], section('- [ ] Reachable: none — entrance unchanged — 01'));
    assert.ok(r.ok, r.err);
    assert.strictEqual(r.out, section('- [ ] Reachable: none — entrance unchanged — #1388'));
  }

  // A CRLF body keeps every line ending: bytes outside the section and unchanged lines come out identical.
  {
    const body = 'intro\r\n## Definition of Done\r\n- [ ] a — 01\r\n- [ ] b — scope\r\nmixed\nend\r\n';
    r = call(['dod-tags', '--map-file', mapFile(['01 #5'])], body);
    assert.ok(r.ok, r.err);
    assert.strictEqual(r.out, body.replace('— 01', '— #5'));
  }

  // Refusals that name every offending line and print nothing.
  {
    const body = section(
      '- [ ] braced — {#1388, #1396}',
      '- [ ] untagged line',
      '- [ ] missing — 03',
      '- [ ] joined — 01, scope',
      '- [ ] fine — 01'
    );
    r = call(['dod-tags', '--map-file', mapFile(['01 #1388'])], body);
    assert.ok(!r.ok, 'refused');
    assert.strictEqual(r.out, '', 'prints nothing');
    for (const n of ['braced', 'untagged line', 'missing', 'joined']) assert.ok(r.err.includes(n), `names ${n}: ${r.err}`);
    assert.ok(!r.err.includes('fine'), r.err);
    r = call(['dod-tags', '--map-file', mapFile(['01 #1388'])], section('- [ ] joined — docs, #12'));
    assert.ok(!r.ok && r.err.includes('joins scope or docs with other entries'), 'docs joined with a reference is refused: ' + r.err);
  }

  // Refusals of the map and the body.
  {
    r = call(['dod-tags', '--map-file', mapFile(['01 #1', '01 #2'])], section('- [ ] x — 01'));
    assert.ok(!r.ok && /duplicate/.test(r.err), 'duplicate id: ' + r.err);
    r = call(['dod-tags', '--map-file', mapFile(['01 {#1}'])], section('- [ ] x — 01'));
    assert.ok(!r.ok && /store notation/.test(r.err), 'bad reference: ' + r.err);
    r = call(['dod-tags', '--map-file', mapFile(['01 #1'])], '');
    assert.ok(!r.ok && /empty/.test(r.err), 'empty body: ' + r.err);
    r = call(['dod-tags', '--map-file', mapFile(['01 #1'])], '# Epic\n\n- [ ] x — 01\n');
    assert.ok(!r.ok && /Definition of Done/.test(r.err), 'no section: ' + r.err);
    for (const bad of [r]) assert.strictEqual(bad.out, '');
  }

  // No map: check only.
  {
    const body = section('- [ ] a — 01, 02', '- [ ] b — scope', '- [ ] c — #4');
    r = call(['dod-tags'], body);
    assert.ok(r.ok, r.err);
    assert.strictEqual(r.out, body);
    r = call(['dod-tags'], section('- [ ] a — {01, 02}'));
    assert.ok(!r.ok && r.err.includes('{01, 02}') && r.out === '', 'check refuses: ' + r.err);
  }

  // --line mode: one Jira text node.
  {
    const map = mapFile(['01 PROJ-1', '02 PROJ-2']);
    r = call(['dod-tags', '--line', '--map-file', map], '[ ] x — 01, 02\n');
    assert.ok(r.ok, r.err);
    assert.strictEqual(r.out, '[ ] x — PROJ-1, PROJ-2');
    r = call(['dod-tags', '--line'], '[ ] x\n');
    assert.ok(!r.ok && r.out === '', 'line check refuses an untagged node');
  }

  // Through the real CLI: --help lists the verb, and stdin reaches it.
  {
    let res = cp.spawnSync(process.execPath, [scopePath, '--help'], { encoding: 'utf8', timeout: 30000 });
    assertSpawnDecided(res, 'scope.js --help');
    assert.ok(res.stdout.includes('dod-tags'), 'usage lists dod-tags');
    res = cp.spawnSync(process.execPath, [scopePath, 'dod-tags', '--map-file', mapFile(['01 #9'])], {
      input: section('- [ ] x — 01'),
      encoding: 'utf8',
      timeout: 30000,
    });
    assertSpawnDecided(res, 'scope.js dod-tags');
    assert.strictEqual(res.status, 0, res.stderr);
    assert.strictEqual(res.stdout, section('- [ ] x — #9'));
    res = cp.spawnSync(process.execPath, [scopePath, 'dod-tags'], { input: section('- [ ] x'), encoding: 'utf8', timeout: 30000 });
    assertSpawnDecided(res, 'scope.js dod-tags refusal');
    assert.notStrictEqual(res.status, 0);
    assert.strictEqual(res.stdout, '');
  }

  console.log('scope-dod-tags: ok');
} finally {
  fs.rmSync(fileDir, { recursive: true, force: true });
  cleanup();
}
