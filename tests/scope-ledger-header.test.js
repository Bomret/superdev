'use strict';

// Suite for plugin/scripts/scope.js's ledger header reader: `readLedgerHeader`'s normalisation per header kind
// (ADR 0022), the ledgers an older version or an editor left behind (`shipped` before `submitted`, CRLF), and a
// comma inside a bullet. The shared directory, `call`, and the init payload come from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { tmp, call, scopePath, cleanup } = require('./scope-setup');
const { publishText, readLedgerHeader } = require(scopePath);

try {
  // --- readLedgerHeader: one reader, normalisation per header kind (ADR 0022) ---
  //
  // `hooks/scope-prune.js` carried its own copy of this and drifted on four axes. The hook now
  // requires the export below, so these cases are the definition for both readers.

  // Token headers — `Stage` and `Branch` — are single tokens. A hand-written ledger may wrap one in
  // markup or leave a period behind; every spelling reads as the bare token.
  for (const [line, expected, label] of [
    ['**Stage:** shipped', 'shipped', 'a plain value'],
    ['**Stage:** `shipped`', 'shipped', 'a backticked value'],
    ['**Stage:** **shipped**', 'shipped', 'an emphasised value'],
    ['**Stage:** `shipped`.', 'shipped', 'a backticked value with a trailing period'],
    ['**Stage:** shipped.', 'shipped', 'a plain value with a trailing period'],
  ]) {
    assert.strictEqual(readLedgerHeader(`# ledger\n\n${line}\n`, 'Stage'), expected, `Stage: ${label}`);
  }

  // The strip must never turn one stage into another.
  for (const [line, expected] of [
    ['**Stage:** documented-unreviewed', 'documented-unreviewed'],
    ['**Stage:** `reviewed`', 'reviewed'],
    ['**Stage:** not-shipped', 'not-shipped'],
  ]) {
    assert.strictEqual(readLedgerHeader(`# ledger\n\n${line}\n`, 'Stage'), expected, `Stage stays ${expected}`);
    assert.notStrictEqual(readLedgerHeader(`# ledger\n\n${line}\n`, 'Stage'), 'shipped', `${expected} is never shipped`);
  }

  assert.strictEqual(
    readLedgerHeader('# ledger\n\n**Branch:** `fix/x`\n', 'Branch'),
    'fix/x',
    'Branch is a token header too'
  );

  // A TOKEN header value is one word — git forbids whitespace in a refname — so trailing content after
  // the first whitespace run is never part of the value. A hand-written ledger that tacks on a
  // parenthetical or a comment must not widen the capture past that token: a value carrying trailing
  // content matches nothing in a branch set, and the veto that reads it (`branchPresent` in
  // hooks/scope-prune.js) reads a live, unmerged branch as gone.
  for (const [line, expected, label] of [
    ['**Branch:** fix/demo (PR #99 open)', 'fix/demo', 'a trailing parenthetical'],
    // A tab, not only a space: `split(' ')` passes every other row here and reads this one as the
    // whole line, which lands back on the delete path as a branch that matches nothing.
    ['**Branch:** fix/demo\t(PR open)', 'fix/demo', 'a tab-separated trailing note'],
    ['**Branch:** fix/demo   # note', 'fix/demo', 'a trailing comment'],
  ]) {
    assert.strictEqual(readLedgerHeader(`# ledger\n\n${line}\n`, 'Branch'), expected, `Branch: ${label}`);
  }

  // Prose headers — `Anchor` — carry a title that reaches a pull request through /superdev:review.
  // Take the rest of the line and trim; a uniform strip would eat the last character of a title
  // ending in punctuation.
  assert.strictEqual(
    readLedgerHeader('# ledger\n\n**Anchor:** #208 — Epic: one reader, shared.\n', 'Anchor'),
    '#208 — Epic: one reader, shared.',
    'Anchor keeps its internal colon and its trailing period'
  );

  // A header line present but empty is absent, for every header — and never reaches past its own
  // line. `\s` matches a newline, so a reader that is not line-anchored captures the NEXT header's
  // token here, which on `Branch` reads as a branch that exists nowhere.
  const valueless = '# ledger\n\n**Stage:** shipped\n**Branch:**\n**Anchor:** #208 — Epic\n';
  assert.strictEqual(readLedgerHeader(valueless, 'Branch'), null, 'an empty Branch line is absent');
  assert.strictEqual(readLedgerHeader(valueless, 'Stage'), 'shipped', 'and its neighbours still read');
  assert.strictEqual(readLedgerHeader(valueless, 'Anchor'), '#208 — Epic', 'including the one after it');
  assert.strictEqual(readLedgerHeader('# ledger\n\n**Stage:**   \n', 'Stage'), null, 'whitespace-only is absent');
  assert.strictEqual(readLedgerHeader('# ledger\n', 'Stage'), null, 'a missing line is absent');

  // The verbs report an empty header as `absent`, not as an empty line.
  const emptyRoot = path.join(tmp, '.superdev', 'scopes', 'emptyhdr');
  fs.mkdirSync(emptyRoot, { recursive: true });
  fs.writeFileSync(path.join(emptyRoot, 'ledger.md'), valueless, 'utf8');
  assert.strictEqual(call(['get', 'branch', '--root', emptyRoot]).out, 'absent', 'get branch reports absent');

  // `status` collapses a shipped scope whose stage line carries markup — it does not today.
  const markupRoot = path.join(tmp, '.superdev', 'scopes', 'markupstage');
  fs.mkdirSync(markupRoot, { recursive: true });
  fs.writeFileSync(
    path.join(markupRoot, 'ledger.md'),
    '# Ledger — markupstage\n\n**Stage:** `shipped`\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #1 | one | behavior | — | merged | a..b |\n',
    'utf8'
  );
  assert.ok(
    call(['status']).out.includes('markupstage  (shipped)'),
    'a backticked stage still collapses: ' + call(['status']).out
  );

  // A ledger an older version — one that predates `submitted` — left at stage `shipped` reads back
  // unchanged across every verb this suite exercises: STAGE_RANK gained a new value, not a new
  // parse rule.
  const preSubmittedRoot = path.join(tmp, '.superdev', 'scopes', 'pre-submitted-shipped');
  fs.mkdirSync(preSubmittedRoot, { recursive: true });
  const preSubmittedText =
    '# Ledger — pre-submitted-shipped\n\n**Stage:** shipped\n**Branch:** feat/pre-submitted-shipped\n' +
    '**Anchor:** #1 — anchor\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n' +
    '|---|---|---|---|---|---|---|\n' +
    '| 01 | #1 | one | behavior | — | merged | a..b |\n';
  fs.writeFileSync(path.join(preSubmittedRoot, 'ledger.md'), preSubmittedText, 'utf8');
  assert.strictEqual(call(['get', 'stage', '--root', preSubmittedRoot]).out, 'shipped', 'get stage still reads shipped');
  assert.ok(
    call(['status']).out.includes('pre-submitted-shipped  (shipped)'),
    'status still collapses the pre-existing shipped scope'
  );
  assert.ok(call(['stage', 'set', 'shipped', '--root', preSubmittedRoot]).ok, 'same-value shipped write is still a no-op');
  const prePublished = publishText(preSubmittedRoot);
  const preAdoptRoot = path.join(tmp, 'adopted-elsewhere', 'pre-submitted-shipped');
  fs.mkdirSync(path.dirname(preAdoptRoot), { recursive: true });
  const preAdopted = call(['adopt', '--root', preAdoptRoot], prePublished);
  assert.ok(!preAdopted.ok && /shipped/.test(preAdopted.err), 'adopt still refuses a shipped snapshot, pre-existing or not');
  assert.strictEqual(
    fs.readFileSync(path.join(preSubmittedRoot, 'ledger.md'), 'utf8'),
    preSubmittedText,
    'every verb above left the pre-existing shipped ledger byte-for-byte unchanged'
  );

  // Requiring the module must run no CLI code. Unguarded, `main()` parses the *caller's* argv and a
  // refusal calls process.exit — measured, a requiring process dies with `unknown verb ""` and exit 1.
  // A subprocess, because the running suite has already required scope.js once — Node's require
  // cache would hand back that cached module instead of re-executing its top-level guard.
  const requirer = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-require-'));
  const probe = path.join(requirer, 'probe.js');
  fs.writeFileSync(
    probe,
    `const m = require(${JSON.stringify(scopePath)});\n` +
      "process.stdout.write(typeof m.readLedgerHeader + '|' + m.readLedgerHeader('**Stage:** `shipped`', 'Stage'));\n",
    'utf8'
  );
  const required = cp.spawnSync(process.execPath, [probe], { cwd: requirer, encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(required, 'requiring scope.js from a probe process');
  assert.strictEqual(required.status, 0, 'requiring the module exits 0 rather than hanging or erroring');
  assert.strictEqual(required.stdout, 'function|shipped', 'the export works from a requiring process');
  assert.strictEqual(required.stderr, '', 'requiring the module prints no usage and no refusal');
  fs.rmSync(requirer, { recursive: true, force: true });

  // --- CRLF: a ledger an editor or `core.autocrlf` wrote reads exactly like an LF one ---
  //
  // Splitting on `'\n'` alone leaves a trailing `\r` on every line, and `headerRe`'s `(.*)$` cannot
  // span it — JavaScript's `.` excludes `\r` as a line terminator. Every header then reads as the
  // missing-optional-field case: `get stage` prints `absent`, `/superdev:ship` sees no stage, and
  // `hooks/scope-prune.js` never sees `shipped`, so it never reaps that run root. Silently, since the
  // Stop hook prints nothing either way. Nothing superdev writes is CRLF — `writeLines` joins with
  // `'\n'` — so this only reaches a maintainer whose editor or git config produced the file.
  const ledgerBody = (nl) =>
    ['# Ledger — crlf', '', '**Stage:** shipped', '**Branch:** fix/crlf', '**Anchor:** #219 — Epic: a title.',
     '**Degraded:**', '- a denied pass', '**Unresolved:**', '- suite still red at the cap', '',
     '| id | issue | title | type | depends-on | status | range |',
     '|---|---|---|---|---|---|---|',
     '| 01 | #219 | one | behavior | — | merged | a..b |', ''].join(nl);

  for (const [label, nl] of [['CRLF', '\r\n'], ['LF', '\n']]) {
    const text = ledgerBody(nl);
    assert.strictEqual(readLedgerHeader(text, 'Stage'), 'shipped', `${label}: Stage reads`);
    assert.strictEqual(readLedgerHeader(text, 'Branch'), 'fix/crlf', `${label}: Branch reads`);
    assert.strictEqual(readLedgerHeader(text, 'Anchor'), '#219 — Epic: a title.', `${label}: Anchor reads whole`);
    assert.strictEqual(readLedgerHeader(text, 'Unresolved'), null, `${label}: the Unresolved header line itself carries no value — its bullets are read separately`);
  }

  // A ledger mixing both endings — a file half-rewritten by a different editor.
  const mixed = '# Ledger — crlf\r\n\r\n**Stage:** shipped\n**Branch:** fix/crlf\r\n';
  assert.strictEqual(readLedgerHeader(mixed, 'Stage'), 'shipped', 'mixed endings: LF line reads');
  assert.strictEqual(readLedgerHeader(mixed, 'Branch'), 'fix/crlf', 'mixed endings: CRLF line reads');

  // Through the verbs and the report, not only the reader: the table and the degrade list too.
  const crlfRoot = path.join(tmp, '.superdev', 'scopes', 'crlfscope');
  fs.mkdirSync(crlfRoot, { recursive: true });
  fs.writeFileSync(path.join(crlfRoot, 'ledger.md'), ledgerBody('\r\n'), 'utf8');
  const CR = ['--root', crlfRoot];
  assert.strictEqual(call(['get', 'stage', ...CR]).out, 'shipped', 'get stage on a CRLF ledger');
  assert.strictEqual(call(['get', 'branch', ...CR]).out, 'fix/crlf', 'get branch on a CRLF ledger');
  assert.strictEqual(call(['get', 'anchor', ...CR]).out, '#219 — Epic: a title.', 'get anchor on a CRLF ledger');
  assert.strictEqual(
    call(['get', 'slices', ...CR]).out,
    '01\t#219\tone\tbehavior\t—\tmerged\ta..b',
    'the slice table parses under CRLF, with no stray carriage return in the last cell'
  );
  const crlfStatus = call(['status']).out;
  assert.ok(crlfStatus.includes('crlfscope  (shipped)'), 'status reads the stage of a CRLF ledger: ' + crlfStatus);
  // `includes` cannot see a trailing `\r`, so assert on the whole line: a stray carriage return in the
  // degrade bullet would leave the line unequal while still "including" the text.
  assert.ok(
    crlfStatus.split('\n').includes('  degraded: a denied pass'),
    'its degrade record renders as an exact line, with no stray carriage return: ' + JSON.stringify(crlfStatus)
  );
  assert.ok(
    crlfStatus.split('\n').includes('  unresolved: suite still red at the cap'),
    'its unresolved record renders as an exact line too, with no stray carriage return: ' + JSON.stringify(crlfStatus)
  );

  // A shipped scope collapses and carries no tally, so the criterion "its stage AND its tally" needs a
  // scope that is still in flight. Same ledger, one stage earlier.
  const crlfLive = path.join(tmp, '.superdev', 'scopes', 'crlflive');
  fs.mkdirSync(crlfLive, { recursive: true });
  fs.writeFileSync(path.join(crlfLive, 'ledger.md'), ledgerBody('\r\n').replace('**Stage:** shipped', '**Stage:** merged'), 'utf8');
  const liveStatus = call(['status']).out.split('\n');
  assert.ok(liveStatus.includes('crlflive  (1 slices, stage: merged)'), 'an in-flight CRLF scope keeps its header: ' + liveStatus.join(' | '));
  assert.ok(
    liveStatus.includes('  todo: 0  in-progress: 0  in-review: 0  blocked: 0  merged: 1'),
    'and its tally, byte-identical to the LF rendering'
  );

  // A write leaves the file readable, and normalises it to LF.
  assert.ok(call(['slice', '01', 'merged', '--range', 'c..d', ...CR]).ok, 'a verb writes to a CRLF ledger');
  const rewritten = fs.readFileSync(path.join(crlfRoot, 'ledger.md'), 'utf8');
  assert.ok(!rewritten.includes('\r'), 'a ledger scope.js wrote carries LF endings only');
  assert.strictEqual(call(['get', 'stage', ...CR]).out, 'shipped', 'and it still reads afterwards');

  // a bullet containing a comma survives intact through `get unresolved` — a status report that joins
  // bullets with `, ` corrupts a comma-bearing bullet on the read side; `get` must not do that. A
  // fresh scope, added last, so it doesn't show up in an earlier `status` scan of `tmp` that asserts no
  // scope carries an unresolved line.
  const commaJson = JSON.stringify({ anchor: '#1 — anchor', slices: [{ id: '01', issue: '#1', title: 'a', type: 'behavior' }] });
  assert.ok(call(['init', 'feat/comma-bullet', 'planned'], commaJson).ok);
  const commaRoot = path.join(tmp, '.superdev', 'scopes', 'comma-bullet');
  const CB = ['--root', commaRoot];
  assert.ok(call(['unresolved', 'add', 'suite red: a, b, and c all fail', ...CB]).ok);
  assert.strictEqual(
    call(['get', 'unresolved', ...CB]).out,
    'suite red: a, b, and c all fail',
    'a comma inside a bullet survives intact'
  );
} finally {
  cleanup();
}
