'use strict';

// Suite for plugin/scripts/scope.js's `dod-own` verb: an anchor's Definition of Done trimmed to the lines one
// Repository component owns on a shared anchor, the section passed through unchanged on an anchor that is not shared,
// and the refusals (ADR 0285). The shared directory and `call` come from tests/scope-setup.js.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call } = require('./scope-setup');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-dod-own-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
let fileCount = 0;
// A slices file holding `pairs`, one `<store-ref> <component>` line each.
const slicesFile = (...pairs) => {
  const file = path.join(dir, `slices-${fileCount++}.txt`);
  fs.writeFileSync(file, pairs.join('\n') + '\n');
  return file;
};
const SHARED = slicesFile('API-1 API', 'API-2 API', 'WEB-1 Web');
const own = (body, file = SHARED, component = 'API') => call(['dod-own', '--component', component, '--slices-file', file], body);
const anchor = (...criteria) => ['# Epic', '', 'Intro.', '', '## Definition of Done', '', ...criteria, '', '## Non-goals', '', '- none', ''].join('\n');
const API_REACH = '- [ ] Reachable: the API answers — scope (API)';
const API_RISK = '- [ ] Release risk: none — rollback: nothing deploys — scope (API)';
const WEB_REACH = '- [ ] Reachable: the page loads — scope (Web)';
const WEB_RISK = '- [ ] Release risk: none — rollback: nothing deploys — scope (Web)';

// The section `dod-own` prints: its heading, the given lines, and the blank line the section ends with.
const printed = (...lines) => ['## Definition of Done', '', ...lines, ''].join('\n') + '\n';

let r;

test('On a shared anchor the API run keeps the heading, the non-checklist lines, and exactly its own lines, in order.', () => {
  r = own(anchor('- [ ] the API serves it — API-1', '- [ ] the page shows it — WEB-1', 'A note line.', '- [ ] both API slices — API-1, API-2',
    '- [ ] the API guide — docs (API)', '- [ ] the page guide — docs (Web)', API_REACH, API_RISK, WEB_REACH, WEB_RISK));
  assert.ok(r.ok, 'dod-own trims a shared anchor: ' + (r.err || ''));
  assert.strictEqual(r.out, printed('- [ ] the API serves it — API-1', 'A note line.', '- [ ] both API slices — API-1, API-2',
    '- [ ] the API guide — docs (API)', API_REACH, API_RISK));
});

test('A slices file holding only this component\'s slices prints the section unchanged, plain tags included.', () => {
  const lines = ['- [ ] it serves — API-1', '- [ ] it holds — scope', '- [ ] the guide — docs', '- [ ] Reachable: it answers — scope', '- [ ] untagged'];
  r = own(anchor(...lines), slicesFile('API-1 API', 'API-2 API'));
  assert.ok(r.ok, 'a non-shared anchor passes: ' + (r.err || ''));
  assert.strictEqual(r.out, printed(...lines));
});

test('Each stop case refuses with its line named and prints nothing on stdout.', () => {
  const cases = [
    ['- [ ] it holds — scope', /plain scope tag: - \[ \] it holds — scope — fix: /],
    ['- [ ] the guide — docs', /plain docs tag: - \[ \] the guide — docs — fix: /],
    ['- [ ] nobody owns me', /untagged line: - \[ \] nobody owns me — fix: /],
    ['- [ ] both — API-1, WEB-1', /tag names slices of API and Web: - \[ \] both — API-1, WEB-1 — fix: /],
    ['- [ ] lost — API-9', /tag names API-9, which no slice under the anchor is: - \[ \] lost — API-9 — fix: /],
    ['- [ ] early — 01', /id-form tag 01: - \[ \] early — 01 — fix: /],
    ['- [ ] elsewhere — scope (Mobile)', /scope \(Mobile\) names a component no slice carries: - \[ \] elsewhere — scope \(Mobile\) — fix: /],
  ];
  for (const [line, re] of cases) {
    r = own(anchor(line, API_REACH, API_RISK, WEB_REACH, WEB_RISK));
    assert.ok(!r.ok && re.test(r.err), `${line} refuses: ${r.err}`);
    assert.strictEqual(r.out, '', `${line} prints nothing on stdout`);
  }
  r = own(anchor(API_RISK, WEB_REACH, WEB_RISK));
  assert.ok(!r.ok && /API owns no Reachable: line — fix: /.test(r.err) && r.out === '', 'no own Reachable: refuses: ' + r.err);
  r = own(anchor(API_REACH, WEB_REACH, WEB_RISK));
  assert.ok(!r.ok && /API owns no Release risk: line — fix: /.test(r.err) && r.out === '', 'no own Release risk: refuses: ' + r.err);
});

test('A judged sibling line is not printed, and a judged own line keeps its note.', () => {
  r = own(anchor('- [x] it serves — API-1 — met: seen at abc', '- [ ] it shows — WEB-1 — not met: gap', API_REACH, API_RISK, WEB_REACH, WEB_RISK));
  assert.ok(r.ok, 'judged lines pass: ' + (r.err || ''));
  assert.strictEqual(r.out, printed('- [x] it serves — API-1 — met: seen at abc', API_REACH, API_RISK));
});

test('A reference listed twice, a malformed slices-file line, and a body with no Definition of Done refuse.', () => {
  r = own(anchor(API_REACH), slicesFile('API-1 API', 'API-1 Web'));
  assert.ok(!r.ok && /reference API-1 listed twice/.test(r.err) && r.out === '', r.err);
  for (const bad of ['API-1', 'not-a-ref API', '01 API']) {
    r = own(anchor(API_REACH), slicesFile('API-2 API', bad));
    assert.ok(!r.ok && /not a "<store-ref> <component>" pair/.test(r.err) && r.out === '', `"${bad}" refuses: ${r.err}`);
  }
  r = own('# Epic\n\n- [ ] it serves — API-1\n');
  assert.ok(!r.ok && /no ## Definition of Done section/.test(r.err) && r.out === '', r.err);
});

test('A component holding spaces reads to the end of its slices-file line.', () => {
  r = own(anchor('- [ ] it serves — API-1', '- [ ] it holds — scope (Billing API)', '- [ ] Reachable: x — scope (Billing API)', '- [ ] Release risk: none — API-1'),
    slicesFile('API-1 Billing API', 'WEB-1 Web'), 'Billing API');
  assert.ok(r.ok, 'a spaced component passes: ' + (r.err || ''));
  assert.strictEqual(r.out, printed('- [ ] it serves — API-1', '- [ ] it holds — scope (Billing API)', '- [ ] Reachable: x — scope (Billing API)', '- [ ] Release risk: none — API-1'));
});
