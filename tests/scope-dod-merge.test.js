'use strict';

// Suite for plugin/scripts/scope.js's `dod-merge` verb: writing `<run-root>/dod.md` from the anchor's text while
// keeping the verdicts a local copy already carries (references/dod-ticks.md, ADR 0206). The shared directory
// and `call` come from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { call, cleanup, tmp } = require('./scope-setup');

try {
  const root = path.join(tmp, '.superdev', 'scopes', 'merge-scope');
  const dod = path.join(root, 'dod.md');
  const merge = (anchor) => call(['dod-merge', '--root', root], anchor);

  // #fresh: no dod.md yet; the anchor's text is written as it is.
  {
    const anchor = '- [ ] works — 01\n- [ ] fast — 02\n';
    const r = merge(anchor);
    assert.ok(r.ok, r.err);
    assert.strictEqual(fs.readFileSync(dod, 'utf8'), anchor);
  }

  // #keeps-local: a noteless anchor line takes the local line's verdict; a noted anchor line wins; a line only the
  // local copy carries is dropped; a line only the anchor carries is added.
  {
    fs.writeFileSync(dod, [
      '- [x] works — 01 — met: the test passes',
      '- [ ] fast — 02 — not met: 3 s',
      '- [ ] gone — 03 — met: stale',
      '',
    ].join('\n'));
    const anchor = [
      '## Definition of Done',
      '- [ ] works — 01',
      '- [x] fast — 02 — met: 80 ms after the fix',
      '- [ ] new — 04',
      '',
    ].join('\n');
    const r = merge(anchor);
    assert.ok(r.ok, r.err);
    assert.match(r.out, /dod-merge: kept 1 verdict/, r.out);
    assert.strictEqual(fs.readFileSync(dod, 'utf8'), [
      '## Definition of Done',
      '- [x] works — 01 — met: the test passes',
      '- [x] fast — 02 — met: 80 ms after the fix',
      '- [ ] new — 04',
      '',
    ].join('\n'));
  }

  // #ambiguous: two local lines pair with one anchor line; the anchor line stays as it is.
  {
    fs.writeFileSync(dod, '- [x] works — 01 — met: a\n- [ ] works — 01 — not met: b\n');
    const r = merge('- [ ] works — 01\n');
    assert.ok(r.ok, r.err);
    assert.strictEqual(fs.readFileSync(dod, 'utf8'), '- [ ] works — 01\n');
  }

  console.log('scope-dod-merge: ok');
} finally {
  cleanup();
}
