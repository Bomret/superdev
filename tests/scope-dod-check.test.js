'use strict';

// Suite for plugin/scripts/scope.js's `dod-check` verb: an anchor body's Absorbs line against its
// `(triage <ref>)` citations, its `Reachable:` criterion, and its `Release risk:` categories (ADR 0233,
// INV-0189, INV-0137). The shared directory and `call` come from tests/scope-setup.js.

const assert = require('node:assert');
const { call, cleanup } = require('./scope-setup');

// A well-formed Definition of Done: one Reachable criterion and the shared release-risk form.
const REACHABLE = '- [ ] Reachable: `/superdev:plan` runs it — 01';
const RISK = '- [ ] Release risk: none — rollback, deploy-window data compatibility, production visibility: nothing deploys; consumer compatibility: below 1.0.0 — scope';
const body = (absorbs, ...criteria) =>
  ['# Epic', '', 'Intro prose.', '', '## Definition of Done', '', ...criteria, REACHABLE, RISK, '', '## Non-goals', '', '- none', '', ...(absorbs === null ? [] : [`**Absorbs:** ${absorbs}`, ''])].join('\n');
const refusal = (r) => {
  assert.ok(!r.ok, 'dod-check refuses');
  return r.err.split('\n').slice(1);
};

try {
  let r;

  // A well-formed anchor passes with no output.
  r = call(['dod-check'], body('#158', '- [ ] Closes the gap (triage #158) — 01'));
  assert.ok(r.ok, 'a well-formed anchor passes: ' + (r.err || ''));
  assert.strictEqual(r.out, '', 'a pass prints nothing');

  // The #164 shape: #158 is absorbed but appears only in a prose Source: sentence.
  r = call(['dod-check'], body('#158', '- [ ] Closes the gap — 01').replace('Intro prose.', 'Source: triage #158 (triage #158).'));
  assert.deepStrictEqual(refusal(r), ['Absorbs entry #158 is cited by no criterion']);
  assert.match(r.err, /^dod-check refused:/, 'the refusal opens with its header');

  // An unabsorbed citation, a citation with no Absorbs line, and a record cited by two criteria.
  r = call(['dod-check'], body('#1', '- [ ] a (triage #1) — 01', '- [ ] b (triage #2) — 01'));
  assert.deepStrictEqual(refusal(r), ['citation (triage #2) names no Absorbs entry']);
  r = call(['dod-check'], body(null, '- [ ] a (triage #2) — 01'));
  assert.deepStrictEqual(refusal(r), ['citation (triage #2) with no Absorbs line']);
  r = call(['dod-check'], body('#1', '- [ ] a (triage #1) — 01', '- [ ] b (triage #1) — 01'));
  assert.deepStrictEqual(refusal(r), ['#1 is cited by 2 criteria']);

  // Two citations in one criterion, and one record cited twice in one criterion, pass.
  r = call(['dod-check'], body('#1, #2', '- [ ] a (triage #1) and (triage #2), again (triage #1) — 01'));
  assert.ok(r.ok, 'several citations in one criterion pass: ' + (r.err || ''));

  // Prose, a fence, an inline code span, a verdict note, and a tag count for nothing.
  {
    const shaped = [
      '# Epic',
      '',
      'Prose (triage #1), Reachable: and rollback, consumer compatibility.',
      '',
      '## Definition of Done',
      '',
      '```',
      '- [ ] fenced (triage #1)',
      '- [ ] Reachable: fenced',
      '```',
      '- [ ] code `(triage #1)` and `Reachable:` — 01',
      '- [ ] `Reachable:` led by a code span — 01',
      '- [x] judged — 01 — met: (triage #1) Reachable: seen',
      '- [ ] tagged — #1',
      '- [ ] Release risk: rollback, production visibility — scope',
      '- [ ] noted — 01 — accepted: deploy-window data compatibility',
      '',
      '**Absorbs:** #1',
      '',
    ].join('\n');
    r = call(['dod-check'], shaped);
    assert.deepStrictEqual(refusal(r), [
      'Absorbs entry #1 is cited by no criterion',
      'no criterion begins with Reachable:',
      'no Release risk: criterion names deploy-window data compatibility',
      'no Release risk: criterion names consumer compatibility',
    ]);
    assert.doesNotMatch(r.err, /judged|tagged|noted|Prose|fenced/, 'a problem line quotes no other body text');
  }

  // The Absorbs line: the first unfenced one, malformed entries ignored, a repeat counted once, both notations.
  {
    const fencedFirst = body('#1, foo, #1, PROJ-7, 12', '- [ ] a (triage #1) (triage PROJ-7) — 01').replace(
      'Intro prose.',
      '```\n**Absorbs:** #9\n```'
    );
    r = call(['dod-check'], fencedFirst + '\n**Absorbs:** #5\n');
    assert.ok(r.ok, 'the first unfenced Absorbs line counts, malformed entries ignored, a repeat once: ' + (r.err || ''));
    r = call(['dod-check'], body('PROJ-7', '- [ ] a — 01'));
    assert.deepStrictEqual(refusal(r), ['Absorbs entry PROJ-7 is cited by no criterion']);
  }

  // No Reachable criterion, and each unnamed release-risk category, on its own line.
  {
    const bare = ['## Definition of Done', '', '- [ ] Release risk: rollback — scope', '- [ ] work — 01', ''].join('\n');
    r = call(['dod-check'], bare);
    assert.deepStrictEqual(refusal(r), [
      'no criterion begins with Reachable:',
      'no Release risk: criterion names deploy-window data compatibility',
      'no Release risk: criterion names consumer compatibility',
      'no Release risk: criterion names production visibility',
    ]);
  }

  // A lone-slice body with no Definition of Done heading is read whole; a judged anchor by its criterion text.
  {
    const lone = ['## Acceptance', '', '- [x] fixed (triage #4) — met: seen', REACHABLE.replace('- [ ]', '- [x]') + ' — met: ok', RISK, '', '**Absorbs:** #4', ''].join('\n');
    r = call(['dod-check'], lone);
    assert.ok(r.ok, 'a lone-slice judged body passes: ' + (r.err || ''));
  }

  // Every problem in one run; CRLF reads like LF; an empty body refuses.
  {
    const many = ['## Definition of Done', '', '- [ ] a (triage #2) — 01', '- [ ] b (triage #2) — 01', '', '**Absorbs:** #1', ''].join('\n');
    const lf = call(['dod-check'], many);
    assert.deepStrictEqual(refusal(lf), [
      'Absorbs entry #1 is cited by no criterion',
      'citation (triage #2) names no Absorbs entry',
      '#2 is cited by 2 criteria',
      'no criterion begins with Reachable:',
      'no Release risk: criterion names rollback',
      'no Release risk: criterion names deploy-window data compatibility',
      'no Release risk: criterion names consumer compatibility',
      'no Release risk: criterion names production visibility',
    ]);
    const crlf = call(['dod-check'], many.replace(/\n/g, '\r\n'));
    assert.strictEqual(crlf.err, lf.err, 'CRLF reads like LF');
    r = call(['dod-check'], body('#158', '- [ ] Closes the gap (triage #158) — 01').replace(/\n/g, '\r\n'));
    assert.ok(r.ok, 'a CRLF well-formed body passes: ' + (r.err || ''));
    for (const empty of ['', '  \n\t\n']) {
      r = call(['dod-check'], empty);
      assert.ok(!r.ok, 'an empty body refuses');
      assert.match(r.err, /dod-check refused: the input is empty/);
    }
  }

  console.log('scope-dod-check: ok');
} finally {
  cleanup();
}
