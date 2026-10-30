'use strict';

// Suite for plugin/scripts/scope.js's `publish` and `adopt` verbs: the anchor's published run-state snapshot
// (ADR 0042), its markers, the refusals, and the real fold through kb-patch.js. The shared directory, `call`,
// and the init payload come from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { tmp, call, sliceJson, scopePath, run, cleanup } = require('./scope-setup');
const { publishText } = require(scopePath);

try {
  let r;

  // --- publish / adopt: the anchor's published snapshot (ADR 0042) ---

  // publish|adopt round trip on a minimal ledger — Stage, Branch, Anchor, and a slice table only,
  // the shape a fresh init leaves behind before any of Degraded/Unresolved/Deferred/Docs exist.
  assert.ok(call(['init', 'feat/publish-minimal', 'planned'], sliceJson).ok);
  const minimalRoot = path.join(tmp, '.superdev', 'scopes', 'publish-minimal');
  const minimalOriginal = fs.readFileSync(path.join(minimalRoot, 'ledger.md'), 'utf8');
  const minimalPublished = publishText(minimalRoot);
  assert.ok(minimalPublished.startsWith('## Run state\n'), 'publish output opens with the Run state heading');
  assert.strictEqual(
    (minimalPublished.match(/^#{1,6} /gm) || []).length,
    1,
    'publish output carries no other heading'
  );
  const openAt = minimalPublished.indexOf('<!-- superdev:run-state -->');
  const closeAt = minimalPublished.indexOf('<!-- /superdev:run-state -->');
  assert.ok(openAt > 0 && closeAt > openAt, 'publish output wraps its payload between the two markers');
  // A different location, same basename as the slug — adopt checks the run-root directory name
  // against the branch slug, so the adopted copy cannot sit under .superdev/scopes/ beside the
  // original without colliding on that same name.
  const adoptMinimalRoot = path.join(tmp, 'adopted-elsewhere', 'publish-minimal');
  fs.mkdirSync(path.dirname(adoptMinimalRoot), { recursive: true });
  run(['adopt', '--root', adoptMinimalRoot], tmp, minimalPublished);
  assert.strictEqual(
    fs.readFileSync(path.join(adoptMinimalRoot, 'ledger.md'), 'utf8'),
    minimalOriginal,
    'adopt reproduces a minimal ledger byte-for-byte'
  );

  // The same round trip on a ledger carrying every header line — Stage, Branch, Anchor, Degraded,
  // Unresolved, Deferred, Docs — plus a slice table.
  assert.ok(call(['init', 'feat/publish-full', 'planned'], sliceJson).ok);
  const fullRoot = path.join(tmp, '.superdev', 'scopes', 'publish-full');
  const F = ['--root', fullRoot];
  assert.ok(call(['degraded', 'add', 'a denied pass', ...F]).ok);
  assert.ok(call(['unresolved', 'add', 'suite still red', ...F]).ok);
  assert.ok(call(['deferred', 'add', 'a deferred finding', ...F]).ok);
  assert.ok(call(['minors', 'add', '02', ...F]).ok);
  assert.ok(call(['docs', 'set', 'inline', ...F]).ok);
  assert.ok(call(['pr', 'set', '789', ...F]).ok);
  assert.ok(call(['deploy', 'set', 'pve', 'deployed', ...F]).ok);
  assert.ok(call(['deploy', 'set', 'proxy', 'failed', '--exit', '2', ...F]).ok);
  const fullOriginal = fs.readFileSync(path.join(fullRoot, 'ledger.md'), 'utf8');
  const fullPublished = publishText(fullRoot);
  const adoptFullRoot = path.join(tmp, 'adopted-elsewhere', 'publish-full');
  fs.mkdirSync(path.dirname(adoptFullRoot), { recursive: true });
  run(['adopt', '--root', adoptFullRoot], tmp, fullPublished);
  assert.strictEqual(
    fs.readFileSync(path.join(adoptFullRoot, 'ledger.md'), 'utf8'),
    fullOriginal,
    'adopt reproduces a fully-populated ledger byte-for-byte'
  );
  assert.strictEqual(call(['get', 'minors', '--root', adoptFullRoot]).out, '02', 'the adopted ledger keeps the Minor queue');
  assert.strictEqual(
    call(['get', 'pr', '--root', adoptFullRoot]).out,
    '#789',
    'the adopted ledger still reads the PR number'
  );
  assert.strictEqual(
    call(['deploy', 'get', '--root', adoptFullRoot]).out,
    'pve deployed\nproxy failed exit 2',
    'the adopted ledger still reads the deploy record'
  );

  // The same round trip at stage `submitted` (issue #682) — the snapshot preserves the stage rather
  // than dropping or renaming it.
  assert.ok(call(['init', 'feat/publish-submitted', 'planned'], sliceJson).ok);
  const submittedRoot = path.join(tmp, '.superdev', 'scopes', 'publish-submitted');
  assert.ok(call(['stage', 'set', 'reviewed', '--root', submittedRoot]).ok);
  assert.ok(call(['stage', 'set', 'submitted', '--root', submittedRoot]).ok);
  const submittedOriginal = fs.readFileSync(path.join(submittedRoot, 'ledger.md'), 'utf8');
  const submittedPublished = publishText(submittedRoot);
  const adoptSubmittedRoot = path.join(tmp, 'adopted-elsewhere', 'publish-submitted');
  fs.mkdirSync(path.dirname(adoptSubmittedRoot), { recursive: true });
  run(['adopt', '--root', adoptSubmittedRoot], tmp, submittedPublished);
  assert.strictEqual(
    fs.readFileSync(path.join(adoptSubmittedRoot, 'ledger.md'), 'utf8'),
    submittedOriginal,
    'adopt reproduces a submitted ledger byte-for-byte'
  );
  assert.strictEqual(
    call(['get', 'stage', '--root', adoptSubmittedRoot]).out,
    'submitted',
    'the adopted ledger still reads stage submitted'
  );

  // publish: a run root holding no ledger.md refuses, one line on stderr, nothing written.
  const noLedgerRoot = path.join(tmp, '.superdev', 'scopes', 'no-such-scope');
  r = call(['publish', '--root', noLedgerRoot]);
  assert.ok(!r.ok && /no ledger at/.test(r.err), 'publish with no ledger.md refused, naming the path: ' + (r.err || ''));
  assert.ok(!fs.existsSync(noLedgerRoot), 'publish creates nothing on refusal');

  // adopt: no opening marker at all refuses, and writes nothing.
  const noOpenRoot = path.join(tmp, 'adopted-elsewhere', 'no-open-marker');
  fs.mkdirSync(path.dirname(noOpenRoot), { recursive: true });
  r = call(['adopt', '--root', noOpenRoot], '# Some anchor\n\nJust a description, no run-state markers at all.\n');
  assert.ok(!r.ok && /no ".*superdev:run-state.*" marker/.test(r.err), 'adopt with no opening marker refused: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(noOpenRoot, 'ledger.md')), 'adopt writes nothing on that refusal');

  // adopt: an opening marker with no closing marker refuses.
  const noCloseRoot = path.join(tmp, 'adopted-elsewhere', 'no-close-marker');
  fs.mkdirSync(path.dirname(noCloseRoot), { recursive: true });
  const noCloseBody = '## Run state\n\n<!-- superdev:run-state -->\n\n**Branch:** feat/no-close-marker\n';
  r = call(['adopt', '--root', noCloseRoot], noCloseBody);
  assert.ok(!r.ok && /no ".*\/superdev:run-state.*" marker/.test(r.err), 'adopt with no closing marker refused: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(noCloseRoot, 'ledger.md')), 'adopt writes nothing on that refusal');

  // adopt: a closing marker that appears before the opening one refuses.
  const reversedRoot = path.join(tmp, 'adopted-elsewhere', 'reversed-markers');
  fs.mkdirSync(path.dirname(reversedRoot), { recursive: true });
  const reversedBody =
    '<!-- /superdev:run-state -->\n\n# Some anchor\n\n<!-- superdev:run-state -->\n\n**Branch:** feat/reversed-markers\n';
  r = call(['adopt', '--root', reversedRoot], reversedBody);
  assert.ok(!r.ok && /appears before its/.test(r.err), 'adopt with a closing marker before the opening one refused: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(reversedRoot, 'ledger.md')), 'adopt writes nothing on that refusal');

  // adopt: more than one opening marker refuses — which payload to adopt cannot be resolved.
  const dupOpenRoot = path.join(tmp, 'adopted-elsewhere', 'dup-open-marker');
  fs.mkdirSync(path.dirname(dupOpenRoot), { recursive: true });
  const dupOpenBody =
    '<!-- superdev:run-state -->\n**Branch:** feat/dup-open-marker\n<!-- /superdev:run-state -->\n\n' +
    '<!-- superdev:run-state -->\n**Branch:** feat/dup-open-marker\n<!-- /superdev:run-state -->\n';
  r = call(['adopt', '--root', dupOpenRoot], dupOpenBody);
  assert.ok(!r.ok && /2 times/.test(r.err), 'adopt with a duplicated opening marker refused: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(dupOpenRoot, 'ledger.md')), 'adopt writes nothing on that refusal');

  // adopt: a payload with no **Branch:** line fails the schema — the heading is reconstructed from
  // that line, so its absence is the case that matters.
  const noBranchRoot = path.join(tmp, 'adopted-elsewhere', 'no-branch');
  fs.mkdirSync(path.dirname(noBranchRoot), { recursive: true });
  const noBranchBody =
    '## Run state\n\n<!-- superdev:run-state -->\n\n**Stage:** implementing\n**Anchor:** #1 — anchor\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '<!-- /superdev:run-state -->\n';
  r = call(['adopt', '--root', noBranchRoot], noBranchBody);
  assert.ok(!r.ok && /no \*\*Branch:\*\* line/.test(r.err), 'adopt with no Branch line refused: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(noBranchRoot, 'ledger.md')), 'adopt writes nothing on a schema failure');

  // adopt: a `**Minors:**` bullet that is no id in the payload's slice table refuses, and writes nothing — the
  // anchor body is editable by anyone with issue access, and the controller derives `reports/<id>/progress.md` from it.
  const badMinorRoot = path.join(tmp, 'adopted-elsewhere', 'bad-minor');
  fs.mkdirSync(path.dirname(badMinorRoot), { recursive: true });
  const badMinorBody = (bullet) =>
    '## Run state\n\n<!-- superdev:run-state -->\n\n**Stage:** implementing\n**Minors:**\n' + bullet + '\n**Branch:** feat/bad-minor\n**Anchor:** #1 — anchor\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '| 01 | #2 | one | behavior | — | merged | a..b |\n' +
    '<!-- /superdev:run-state -->\n';
  r = call(['adopt', '--root', badMinorRoot], badMinorBody('- ../x'));
  assert.ok(!r.ok && /Minors/.test(r.err) && /\.\.\/x/.test(r.err), 'adopt with a non-id Minors bullet refused: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(badMinorRoot, 'ledger.md')), 'adopt writes nothing on a bad Minors bullet');
  r = call(['adopt', '--root', badMinorRoot], badMinorBody('- 99'));
  assert.ok(!r.ok && /99/.test(r.err), 'adopt with a Minors bullet the slice table lacks refused: ' + (r.err || ''));
  assert.ok(call(['adopt', '--root', badMinorRoot], badMinorBody('- 01')).ok, 'adopt with a Minors bullet naming a table id succeeds');

  // adopt: a run root whose ledger.md already exists refuses, and leaves that ledger untouched.
  const existingRoot = path.join(tmp, 'adopted-elsewhere', 'already-there');
  fs.mkdirSync(existingRoot, { recursive: true });
  fs.writeFileSync(path.join(existingRoot, 'ledger.md'), '# Ledger — already-there\n\n**Stage:** merged\n', 'utf8');
  const existingBefore = fs.readFileSync(path.join(existingRoot, 'ledger.md'), 'utf8');
  const validBody =
    '## Run state\n\n<!-- superdev:run-state -->\n\n**Stage:** implementing\n**Branch:** feat/already-there\n**Anchor:** #1 — anchor\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '<!-- /superdev:run-state -->\n';
  r = call(['adopt', '--root', existingRoot], validBody);
  assert.ok(!r.ok && /already exists/.test(r.err), 'adopt with an existing ledger.md refused: ' + (r.err || ''));
  assert.strictEqual(
    fs.readFileSync(path.join(existingRoot, 'ledger.md'), 'utf8'),
    existingBefore,
    'the existing ledger is left untouched'
  );

  // adopt: a run root whose directory name does not match the Branch line's slug refuses.
  const mismatchRoot = path.join(tmp, 'adopted-elsewhere', 'wrong-name');
  fs.mkdirSync(path.dirname(mismatchRoot), { recursive: true });
  r = call(['adopt', '--root', mismatchRoot], validBody); // validBody's Branch slug is already-there
  assert.ok(!r.ok && /does not match the branch slug/.test(r.err), 'adopt with a mismatched run root refused: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(mismatchRoot, 'ledger.md')), 'adopt writes nothing on a slug mismatch');

  // adopt: a payload whose Stage reads "shipped" refuses. `shipped` is terminal (`## The stage
  // never moves backwards`), so adopting one would write dod.md, name the run kind `resumed`, and
  // cut a scopetree — only to have every later `stage set` then refuse the ledger it just built.
  const shippedRoot = path.join(tmp, 'adopted-elsewhere', 'shipped-snapshot');
  fs.mkdirSync(path.dirname(shippedRoot), { recursive: true });
  const shippedBody =
    '## Run state\n\n<!-- superdev:run-state -->\n\n**Stage:** shipped\n**Branch:** feat/shipped-snapshot\n**Anchor:** #1 — anchor\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '<!-- /superdev:run-state -->\n';
  r = call(['adopt', '--root', shippedRoot], shippedBody);
  assert.ok(!r.ok && /shipped/.test(r.err), 'adopt with a shipped snapshot refused: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(shippedRoot, 'ledger.md')), 'adopt writes nothing on that refusal');

  // adopt: a `closed` snapshot refuses the same way (ADR 0106).
  const closedRoot = path.join(tmp, 'adopted-elsewhere', 'closed-snapshot');
  r = call(['adopt', '--root', closedRoot], shippedBody.replace('Stage:** shipped', 'Stage:** closed').replace('shipped-snapshot', 'closed-snapshot'));
  assert.ok(!r.ok && /closed/.test(r.err), 'adopt with a closed snapshot refused: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(closedRoot, 'ledger.md')), 'adopt writes nothing on that refusal');

  // adopt: a payload with no Stage line refuses as `--shipped` does, since a ledger adopted without one
  // could never move its stage again.
  const stagelessRoot = path.join(tmp, 'adopted-elsewhere', 'stageless-snapshot');
  r = call(['adopt', '--root', stagelessRoot], shippedBody.replace('**Stage:** shipped\n', '').replace('shipped-snapshot', 'stageless-snapshot'));
  assert.ok(!r.ok && /no \*\*Stage:\*\* line/.test(r.err), 'adopt with a stage-less snapshot refused, naming the line: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(stagelessRoot, 'ledger.md')), 'adopt writes nothing on a stage-less payload');

  // adopt --shipped: the explicit opt-in recreates a shipped original's run root from its anchor's
  // snapshot (shipped-run.md's `## Adopting a shipped original`, ADR 0124), where plain adopt refuses.
  const shippedOptRoot = path.join(tmp, 'adopted-elsewhere', 'shipped-opt-in');
  r = call(['adopt', '--shipped', '--root', shippedOptRoot], shippedBody.replace('shipped-snapshot', 'shipped-opt-in'));
  assert.ok(r.ok, 'adopt --shipped adopts a shipped snapshot: ' + (r.err || ''));
  assert.strictEqual(call(['get', 'stage', '--root', shippedOptRoot]).out, 'shipped', 'the adopted ledger reads shipped');

  // adopt --shipped accepts `shipped` and only `shipped`: a live, a closed, or a stage-less payload
  // refuses and writes nothing, so the opt-in never adopts what run init's own adopt path owns.
  for (const [stageLine, name] of [
    ['**Stage:** implementing\n', 'shipped-opt-in-live'],
    ['**Stage:** closed\n', 'shipped-opt-in-closed'],
    ['', 'shipped-opt-in-stageless'],
  ]) {
    const optRoot = path.join(tmp, 'adopted-elsewhere', name);
    r = call(['adopt', '--shipped', '--root', optRoot], shippedBody.replace('**Stage:** shipped\n', stageLine).replace('shipped-snapshot', name));
    assert.ok(!r.ok && /--shipped adopts only/.test(r.err), `adopt --shipped refuses ${name}: ` + (r.err || ''));
    assert.ok(!fs.existsSync(path.join(optRoot, 'ledger.md')), `adopt --shipped writes nothing for ${name}`);
    if (!stageLine) {
      assert.ok(/carries no \*\*Stage:\*\* line/.test(r.err), 'a stage-less refusal names the missing Stage line: ' + r.err);
    }
  }

  // adopt disregards every heading in the body: a bare `#`-led line and a fenced `#`-led line
  // sitting *inside* the payload, between two slice-table rows, neither end the payload early nor
  // trigger a refusal — the markers alone decide where it starts and stops, so heading-shaped
  // content between them is just more payload text.
  const headingsInsideRoot = path.join(tmp, 'adopted-elsewhere', 'headings-inside-payload');
  fs.mkdirSync(path.dirname(headingsInsideRoot), { recursive: true });
  const headingsInsideBody =
    '## Run state\n\n<!-- superdev:run-state -->\n\n**Stage:** implementing\n**Branch:** feat/headings-inside-payload\n**Anchor:** #1 — anchor\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '| 01 | #1 | one | behavior | — | merged | — |\n' +
    '# a bare heading sitting between two rows\n' +
    '```bash\n# a fenced heading-shaped line, also between two rows\nnpm i\n```\n' +
    '| 02 | #2 | two | behavior | 01 | merged | — |\n' +
    '<!-- /superdev:run-state -->\n';
  r = call(['adopt', '--root', headingsInsideRoot], headingsInsideBody);
  assert.ok(r.ok, 'adopt with heading-shaped lines inside the payload should pass: ' + (r.err || ''));
  assert.strictEqual(
    call(['get', 'slices', '--root', headingsInsideRoot]).out,
    '01\t#1\tone\tbehavior\t—\tmerged\t—\n02\t#2\ttwo\tbehavior\t01\tmerged\t—',
    'neither row is dropped — the headings inside the payload never truncated it'
  );

  // adopt takes only what sits between the markers from a body carrying other sections around
  // them — the shape a real anchor issue body has (a description, then the snapshot, then comments
  // or other content the code host renders around it) — including sections whose own content reuses
  // ledger vocabulary (an unrelated table, prose mentioning "**Degraded:**"/"**Unresolved:**"/
  // "**Deferred:**"): none of that plays any part in bounding the payload, so none of it triggers a
  // refusal the way the inferred-boundary rule this replaced did.
  const sectionedRoot = path.join(tmp, 'adopted-elsewhere', 'sectioned');
  fs.mkdirSync(path.dirname(sectionedRoot), { recursive: true });
  const sectionedBody =
    '# Add a widget\n\nSome description of the feature.\n\n' +
    '## Run state\n\n<!-- superdev:run-state -->\n\n**Stage:** merged\n**Branch:** feat/sectioned\n**Anchor:** #1 — anchor\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '| 01 | #1 | one | behavior | — | merged | — |\n' +
    '<!-- /superdev:run-state -->\n\n' +
    '## Non-goals\n\n- Not covering X\n\n' +
    '## Comments\n\nsomeone commented, "**Degraded:** a pass here too" and pasted an unrelated table:\n\n' +
    '| left | right |\n|---|---|\n| a | b |\n';
  r = call(['adopt', '--root', sectionedRoot], sectionedBody);
  assert.ok(r.ok, 'adopt with other sections, including ledger-shaped prose, around Run state should pass: ' + (r.err || ''));
  const sectionedLedger = fs.readFileSync(path.join(sectionedRoot, 'ledger.md'), 'utf8');
  assert.ok(sectionedLedger.startsWith('# Ledger — sectioned'), 'the ledger heading is reconstructed');
  assert.ok(!sectionedLedger.includes('Some description'), 'the section before Run state is not carried in');
  assert.ok(!sectionedLedger.includes('someone commented') && !sectionedLedger.includes('left | right'), 'the section after Run state is not carried in either');
  assert.strictEqual(call(['get', 'stage', '--root', sectionedRoot]).out, 'merged', 'the adopted ledger reads correctly through the normal verbs');

  // adopt round-trips a real `publish --root` result (the actual CLI, spawned as a subprocess, not
  // the in-process pure function) spliced into a realistic multi-section anchor body — Definition of
  // Done checkboxes, Non-goals bullets, and a Slice graph mermaid fence — with the Run state section
  // placed last. Hand-built fixtures are exactly what let both the truncation and the false-refusal
  // through the last two review cycles, so this one uses the real output instead.
  assert.ok(call(['init', 'feat/real-publish-splice', 'planned'], sliceJson).ok);
  const realRoot = path.join(tmp, '.superdev', 'scopes', 'real-publish-splice');
  const RS = ['--root', realRoot];
  assert.ok(call(['degraded', 'add', 'a denied pass', ...RS]).ok);
  assert.ok(call(['unresolved', 'add', 'suite still red', ...RS]).ok);
  const realOriginal = fs.readFileSync(path.join(realRoot, 'ledger.md'), 'utf8');
  const realPublished = execFileSync(process.execPath, [scopePath, 'publish', '--root', realRoot], { encoding: 'utf8' });
  const realBodyRunStateLast =
    '# Add a widget\n\nSome description of the feature.\n\n' +
    '## Definition of Done\n\n- [x] one thing\n- [ ] another thing\n\n' +
    '## Non-goals\n\n- Not covering X\n\n' +
    '## Slice graph\n\n```mermaid\ngraph TD\n  01 --> 02\n```\n\n' +
    realPublished;
  const realAdoptRoot = path.join(tmp, 'adopted-elsewhere', 'real-publish-splice');
  fs.mkdirSync(path.dirname(realAdoptRoot), { recursive: true });
  run(['adopt', '--root', realAdoptRoot], tmp, realBodyRunStateLast);
  assert.strictEqual(
    fs.readFileSync(path.join(realAdoptRoot, 'ledger.md'), 'utf8'),
    realOriginal,
    'adopt reproduces the ledger byte-for-byte from a real publish output, Run state placed last'
  );

  // The same real published payload, placed *before* Definition of Done instead of after it — the
  // markers bound the payload regardless of where among the other sections it sits.
  const realBodyRunStateFirst =
    '# Add a widget\n\nSome description of the feature.\n\n' +
    realPublished + '\n\n' +
    '## Definition of Done\n\n- [x] one thing\n- [ ] another thing\n\n' +
    '## Non-goals\n\n- Not covering X\n\n' +
    '## Slice graph\n\n```mermaid\ngraph TD\n  01 --> 02\n```\n';
  const realAdoptFirstRoot = path.join(tmp, 'adopted-elsewhere', 'real-publish-splice-first');
  fs.mkdirSync(path.dirname(realAdoptFirstRoot), { recursive: true });
  // Adopting into the same slug at a second location — the run root's basename, not its parent
  // directory, is what adopt checks against the Branch slug.
  fs.mkdirSync(path.join(tmp, 'adopted-elsewhere', 'real-publish-splice-second-parent'), { recursive: true });
  run(
    ['adopt', '--root', path.join(tmp, 'adopted-elsewhere', 'real-publish-splice-second-parent', 'real-publish-splice')],
    tmp,
    realBodyRunStateFirst,
  );
  assert.strictEqual(
    fs.readFileSync(
      path.join(tmp, 'adopted-elsewhere', 'real-publish-splice-second-parent', 'real-publish-splice', 'ledger.md'),
      'utf8',
    ),
    realOriginal,
    'adopt reproduces the ledger byte-for-byte from a real publish output placed before Definition of Done'
  );

  // A fenced illustrative example of the marker syntax — the only way to *show* an HTML comment to
  // a human, since it renders invisibly otherwise — sits elsewhere in the body alongside the real
  // payload. The fence is masked before the marker scan runs, so it is neither mistaken for the
  // real payload nor counted as a second opening marker.
  const fencedExampleRoot = path.join(tmp, 'adopted-elsewhere', 'fenced-example');
  fs.mkdirSync(path.dirname(fencedExampleRoot), { recursive: true });
  const fencedExampleBody =
    '# Anchor\n\n' +
    'Here is what the snapshot looks like:\n\n' +
    '```markdown\n<!-- superdev:run-state -->\n**Stage:** shipped\n**Branch:** feat/wrong-slug\n<!-- /superdev:run-state -->\n```\n\n' +
    '## Run state\n\n<!-- superdev:run-state -->\n\n**Stage:** implementing\n**Branch:** feat/fenced-example\n**Anchor:** #1 — anchor\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '| 01 | #1 | one | behavior | — | merged | — |\n' +
    '<!-- /superdev:run-state -->\n';
  r = call(['adopt', '--root', fencedExampleRoot], fencedExampleBody);
  assert.ok(r.ok, 'adopt with a fenced illustrative example alongside the real payload should pass: ' + (r.err || ''));
  assert.strictEqual(call(['get', 'stage', '--root', fencedExampleRoot]).out, 'implementing', 'the real payload, not the fenced example, was adopted');

  // A body whose *only* marker pair sits inside a fence carries no real payload at all — the
  // markers are masked away before the scan, so this reads exactly as "no opening marker" and
  // refuses, rather than silently adopting the fenced example as live state.
  const onlyFencedRoot = path.join(tmp, 'adopted-elsewhere', 'only-fenced-markers');
  fs.mkdirSync(path.dirname(onlyFencedRoot), { recursive: true });
  const onlyFencedBody =
    '# Anchor\n\nOnly a fenced illustrative example, no real payload:\n\n' +
    '```markdown\n<!-- superdev:run-state -->\n**Stage:** shipped\n**Branch:** feat/only-fenced-markers\n<!-- /superdev:run-state -->\n```\n';
  r = call(['adopt', '--root', onlyFencedRoot], onlyFencedBody);
  assert.ok(!r.ok, 'adopt with only a fenced example and no real payload refuses rather than fabricating control flow: ' + JSON.stringify(r));
  assert.ok(!fs.existsSync(path.join(onlyFencedRoot, 'ledger.md')), 'adopt writes nothing on that refusal');

  // An unterminated fence in the body refuses outright, the same posture kb-patch.js's merge()
  // already takes: guessing where the fence would have closed risks masking real markers past it.
  const unterminatedFenceRoot = path.join(tmp, 'adopted-elsewhere', 'unterminated-fence');
  fs.mkdirSync(path.dirname(unterminatedFenceRoot), { recursive: true });
  const unterminatedFenceBody =
    '# Anchor\n\n```markdown\nan opened fence that never closes\n\n' +
    '## Run state\n\n<!-- superdev:run-state -->\n\n**Branch:** feat/unterminated-fence\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    '<!-- /superdev:run-state -->\n';
  r = call(['adopt', '--root', unterminatedFenceRoot], unterminatedFenceBody);
  assert.ok(!r.ok && /unterminated fenced code block/.test(r.err), 'adopt with an unterminated fence refuses, naming it: ' + (r.err || ''));
  assert.ok(!fs.existsSync(path.join(unterminatedFenceRoot, 'ledger.md')), 'adopt writes nothing on that refusal');

  // --- the real fold: publish → kb-patch.js <anchor-body> <publish-output> → adopt ---
  //
  // Every fixture above builds its anchor body by hand, splicing scope.js's own publish output
  // straight into a string. Production never does that: run-state.md's `## Publishing run state` mechanism hands
  // both the fetched anchor body and publish's stdout to kb-patch.js's merge, and adopts *its* stdout.
  // "Hand-built fixtures are exactly what let both the truncation and the false-refusal through the
  // last two review cycles" (above) stopped one step short of exercising that fold — this closes it,
  // running kb-patch.js as a real subprocess rather than importing its merge().
  assert.ok(call(['init', 'feat/kb-patch-fold', 'planned'], sliceJson).ok);
  const foldRoot = path.join(tmp, '.superdev', 'scopes', 'kb-patch-fold');
  const kbPatchPath = path.join(path.dirname(scopePath), 'kb-patch.js');
  const foldDir = path.join(tmp, 'kb-patch-fold-fixtures');
  fs.mkdirSync(foldDir, { recursive: true });

  // Append: a fresh anchor body carrying no `## Run state` section yet.
  const noSectionFile = path.join(foldDir, 'anchor-1.md');
  fs.writeFileSync(noSectionFile, '# Add a widget\n\nSome description.\n\n## Non-goals\n\n- Not covering X\n', 'utf8');
  const publish1File = path.join(foldDir, 'publish-1.md');
  fs.writeFileSync(publish1File, execFileSync(process.execPath, [scopePath, 'publish', '--root', foldRoot], { encoding: 'utf8' }), 'utf8');
  const merged1 = execFileSync(process.execPath, [kbPatchPath, noSectionFile, publish1File], { encoding: 'utf8' });
  assert.ok(merged1.includes('## Run state'), 'the fold appends the Run state section to a body carrying none');
  assert.ok(merged1.startsWith('# Add a widget'), 'the section ahead of it survives untouched');
  assert.ok(merged1.includes('## Non-goals'), 'the section after it survives untouched');

  // Replace: a further ledger write, then a second publish folded into the body the first fold just
  // produced — the real per-write shape run-state.md's `## Publishing run state` runs under.
  assert.ok(call(['degraded', 'add', 'a denied pass', '--root', foldRoot]).ok);
  const merged1File = path.join(foldDir, 'anchor-2.md');
  fs.writeFileSync(merged1File, merged1, 'utf8');
  const publish2File = path.join(foldDir, 'publish-2.md');
  fs.writeFileSync(publish2File, execFileSync(process.execPath, [scopePath, 'publish', '--root', foldRoot], { encoding: 'utf8' }), 'utf8');
  const merged2 = execFileSync(process.execPath, [kbPatchPath, merged1File, publish2File], { encoding: 'utf8' });
  assert.strictEqual((merged2.match(/^## Run state$/gm) || []).length, 1, 'the second fold replaces the section rather than appending a second one');
  assert.ok(merged2.includes('a denied pass'), 'the replaced section carries the later write');
  assert.ok(merged2.startsWith('# Add a widget'), 'the surrounding body still survives the replace');
  // Splice the `## Run state` section (through the next heading of level 1 or 2, or EOF) out of
  // each body, kb-patch.js's own section-boundary rule, and compare what's left byte-for-byte —
  // the DoD's "every byte outside the section identical" criterion, not just a prefix check.
  const stripRunState = (text) => {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => /^## Run state\s*$/.test(l));
    if (start === -1) return text;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^#{1,2}(\s|$)/.test(lines[i])) {
        end = i;
        break;
      }
    }
    lines.splice(start, end - start);
    return lines.join('\n');
  };
  assert.strictEqual(
    stripRunState(merged2),
    stripRunState(merged1),
    'the replace leaves every byte outside the ## Run state section identical'
  );

  // Round trip: adopting the kb-patch.js-folded body reproduces the ledger byte-for-byte.
  const foldedOriginal = fs.readFileSync(path.join(foldRoot, 'ledger.md'), 'utf8');
  const foldAdoptRoot = path.join(tmp, 'adopted-elsewhere', 'kb-patch-fold');
  fs.mkdirSync(path.dirname(foldAdoptRoot), { recursive: true });
  run(['adopt', '--root', foldAdoptRoot], tmp, merged2);
  assert.strictEqual(
    fs.readFileSync(path.join(foldAdoptRoot, 'ledger.md'), 'utf8'),
    foldedOriginal,
    'adopting the kb-patch.js-folded body reproduces the ledger byte-for-byte'
  );

  // Pin: the modules holding scope.js's fence-aware readers (the run-state adopt and the dod-line edit) share
  // kb-patch.js's fence-masking rule, which lives in lib/md-sections.js, via `require` rather than growing a
  // private copy that could silently diverge (ADR 0022's second-reader lesson) — the same shape as the
  // drift `arg-token` contract, which holds every Bash hook to a require of ../lib/shell-words.js.
  for (const name of ['run-state', 'dod-line']) {
    const src = fs.readFileSync(path.join(path.dirname(scopePath), '..', 'lib', `${name}.js`), 'utf8');
    assert.ok(
      /const\s*\{\s*maskFencedLines\s*\}\s*=\s*require\(['"]\.\/md-sections\.js['"]\)/.test(src),
      `${name}.js requires maskFencedLines from md-sections.js`
    );
    assert.strictEqual(
      (src.match(/function\s+maskFencedLines\s*\(/g) || []).length,
      0,
      `${name}.js defines no private maskFencedLines of its own`
    );
  }

  // A slice id that would lead outside reports/<id>/ is refused everywhere a reports path is built (triage #1342).
  const badIds = ['../x', 'a/b', '/abs', 'a\\b', '..', ''];
  const row01 = /^\| 01 \|/m;
  assert.ok(row01.test(minimalPublished), 'fixture snapshot holds an `01` row');
  let n = 0;
  for (const bad of badIds) {
    const body = minimalPublished.replace(row01, `| ${bad} |`);
    const ghost = path.join(tmp, `bad-${n++}`, 'publish-minimal');
    fs.mkdirSync(path.dirname(ghost), { recursive: true });
    r = call(['adopt', '--root', ghost], body);
    assert.ok(!r.ok && r.err.includes(`"${bad}"`) && /slice id/.test(r.err), `adopt refuses table id ${JSON.stringify(bad)}: ${r.err}`);
    assert.ok(!fs.existsSync(path.join(ghost, 'ledger.md')), 'no ledger written');
  }
  for (const good of ['S1', 'api-auth']) {
    const ghost = path.join(tmp, `good-${n++}`, 'publish-minimal');
    fs.mkdirSync(path.dirname(ghost), { recursive: true });
    r = call(['adopt', '--root', ghost], minimalPublished.replace(row01, `| ${good} |`));
    assert.ok(r.ok, `adopt accepts table id ${good}: ${r.err}`);
  }
  for (const bad of badIds.filter(Boolean)) {
    const ghost = path.join(tmp, `badm-${n++}`, 'publish-minimal');
    fs.mkdirSync(path.dirname(ghost), { recursive: true });
    const body = minimalPublished.replace('**Branch:**', `**Minors:**\n- ${bad}\n\n**Branch:**`);
    r = call(['adopt', '--root', ghost], body);
    assert.ok(!r.ok && r.err.includes(`"${bad}"`), `adopt refuses Minors id ${JSON.stringify(bad)}: ${r.err}`);
    assert.ok(!fs.existsSync(path.join(ghost, 'ledger.md')), 'no ledger written for Minors');
  }
  for (const bad of badIds) {
    r = call(['init', 'feat/badid', 'planned'], JSON.stringify({ anchor: '#1', slices: [{ id: bad || ' ', issue: '#1', title: 't', type: 'behavior' }] }));
    assert.ok(!r.ok, `init refuses id ${JSON.stringify(bad)}`);
  }
  assert.ok(call(['init', 'feat/okid', 'planned'], JSON.stringify({ anchor: '#1', slices: [{ id: 'api-auth', issue: '#1', title: 't', type: 'behavior' }] })).ok, 'api-auth inits');
  const okRoot = path.join(tmp, '.superdev', 'scopes', 'okid');
  for (const bad of badIds.filter(Boolean)) {
    r = call(['slice', bad, 'done', '--root', okRoot]);
    assert.ok(!r.ok && /slice id/.test(r.err), `slice verb refuses ${JSON.stringify(bad)}: ${r.err}`);
    r = call(['minors', 'add', bad, '--root', okRoot]);
    assert.ok(!r.ok && /slice id/.test(r.err), `minors add refuses ${JSON.stringify(bad)}: ${r.err}`);
  }
} finally {
  cleanup();
}
