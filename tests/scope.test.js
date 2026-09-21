'use strict';

// Suite for plugin/scripts/scope.js. Requires the module (silent — scope.js already guards its CLI
// entry with require.main === module, per ADR 0059) and calls its exported internals directly, the
// way the script's own inline --selftest used to before this suite moved off the shipped tree
// (ADR 0059).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const scopePath = require.resolve('../plugin/scripts/scope.js');
const { run, publishText, SLUG_RE, readLedgerHeader, testContainment } = require(scopePath);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-'));

// Capture console.log output per call.
const call = (argv, stdinJson) => {
  const logged = [];
  const orig = console.log;
  console.log = (s) => logged.push(String(s));
  try {
    run(argv, tmp, stdinJson || '');
    return { ok: true, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
    throw e;
  } finally {
    console.log = orig;
  }
};

const sliceJson = JSON.stringify({
  anchor: '#187 — Run state owned by a deterministic CLI (scope.js)',
  slices: [
    { id: '01', issue: '#188', title: 'scope.js CLI', type: 'behavior', 'depends-on': '—' },
    { id: '02', issue: '#189', title: 'ledger-guard hook', type: 'behavior', 'depends-on': '01' },
  ],
});

try {
  // init: valid label creates root + schema-shaped ledger.
  let r = call(['init', 'feat/demo', 'planned'], sliceJson);
  assert.ok(r.ok, 'init should pass: ' + (r.err || ''));
  const root = path.join(tmp, '.superdev', 'scopes', 'demo');
  const text = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(text.includes('**Stage:** planned'), 'ledger carries Stage');
  assert.ok(text.includes('**Branch:** feat/demo'), 'ledger carries Branch');
  assert.ok(text.includes('**Anchor:** #187'), 'ledger carries Anchor');
  assert.ok(text.includes('| id | issue | title | type | depends-on | status | range |'), 'ledger carries the 7-column table');
  assert.ok(text.includes('| 01 | #188 | scope.js CLI | behavior | — | todo | — |'), 'ledger carries slice rows');
  assert.ok(fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8').includes('.superdev/'), '.superdev/ git-ignored');

  // init: a slice already reported merged (ADR 0004 — a second run over an appended feature must
  // never re-dispatch it) writes `merged` into the ledger table, alongside a sibling with no status
  // that still defaults to `todo`.
  const mergedSliceJson = JSON.stringify({
    anchor: '#187 — Run state owned by a deterministic CLI (scope.js)',
    slices: [
      { id: '01', issue: '#188', title: 'scope.js CLI', type: 'behavior', 'depends-on': '—', status: 'merged' },
      { id: '02', issue: '#189', title: 'ledger-guard hook', type: 'behavior', 'depends-on': '01' },
    ],
  });
  r = call(['init', 'feat/appended', 'planned'], mergedSliceJson);
  assert.ok(r.ok, 'init should pass with a merged slice: ' + (r.err || ''));
  const appendedText = fs.readFileSync(
    path.join(tmp, '.superdev', 'scopes', 'appended', 'ledger.md'),
    'utf8',
  );
  assert.ok(
    appendedText.includes('| 01 | #188 | scope.js CLI | behavior | — | merged | — |'),
    'ledger writes the merged status verbatim: ' + appendedText,
  );
  assert.ok(
    appendedText.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | todo | — |'),
    'a sibling with no status still defaults to todo: ' + appendedText,
  );

  // init: a slice list that is entirely merged (a second run over a fully-shipped appended feature,
  // ADR 0004) writes `merged` into every row — nothing defaults to `todo`. Isolated in its own root
  // so its 2-of-2-merged tally doesn't collide with the shipped-scope tally assertion below.
  const allMergedJson = JSON.stringify({
    anchor: '#187 — Run state owned by a deterministic CLI (scope.js)',
    slices: [
      { id: '01', issue: '#188', title: 'scope.js CLI', type: 'behavior', 'depends-on': '—', status: 'merged' },
      { id: '02', issue: '#189', title: 'ledger-guard hook', type: 'behavior', 'depends-on': '01', status: 'merged' },
    ],
  });
  const fullyShipped = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-fully-shipped-'));
  const origFullyShipped = console.log;
  console.log = () => {};
  try {
    run(['init', 'feat/fully-shipped', 'planned'], fullyShipped, allMergedJson);
  } finally {
    console.log = origFullyShipped;
  }
  const allMergedText = fs.readFileSync(
    path.join(fullyShipped, '.superdev', 'scopes', 'fully-shipped', 'ledger.md'),
    'utf8',
  );
  assert.ok(
    allMergedText.includes('| 01 | #188 | scope.js CLI | behavior | — | merged | — |')
      && allMergedText.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | merged | — |'),
    'every row seeds merged, none defaults to todo: ' + allMergedText,
  );
  fs.rmSync(fullyShipped, { recursive: true, force: true });

  // init: a ledger at stage `planned` (no slice has run) is overwritten rather than refused, and
  // init says so on stdout (ADR 0079 — this is what retires plan's append-mode base-lock carve-out).
  r = call(['init', 'feat/demo', 'planned'], sliceJson);
  assert.ok(r.ok, 'init over a planned ledger overwrites: ' + (r.err || ''));
  assert.ok(/overwrit/i.test(r.out), 'init reports the overwrite on stdout: ' + r.out);

  // init: once a scope moves off `planned`, a ledger.md that already exists is refused (the real
  // double-init signal).
  assert.ok(call(['stage', 'set', 'implementing', '--root', root]).ok);
  r = call(['init', 'feat/demo', 'planned'], sliceJson);
  assert.ok(!r.ok && /already exists/.test(r.err), 'existing ledger refused');

  // init: the entry stage is a required argument, with no default (Critical review finding, ADR 0079)
  // — `init` never guesses which caller is writing the ledger. Omitting it, or naming anything but
  // `planned`/`implementing`, refuses rather than silently stamping `planned`.
  r = call(['init', 'feat/entry-stage'], sliceJson);
  assert.ok(!r.ok && /entry stage/.test(r.err), 'init with no stage argument refuses: ' + (r.err || ''));
  r = call(['init', 'feat/entry-stage', 'shipped'], sliceJson);
  assert.ok(!r.ok && /entry stage/.test(r.err), 'init with a non-entry stage refuses: ' + (r.err || ''));
  assert.ok(
    !fs.existsSync(path.join(tmp, '.superdev', 'scopes', 'entry-stage')),
    'no root created when the entry stage is missing or invalid',
  );

  // init: run init's own `fresh` path enters straight at `implementing` — no plan ever cut this
  // ledger, so there is no `planned` interval to move it out of afterwards (Critical review finding).
  r = call(['init', 'feat/run-init-fresh', 'implementing'], sliceJson);
  assert.ok(r.ok, 'init implementing should pass: ' + (r.err || ''));
  assert.strictEqual(
    call(['get', 'stage', '--root', path.join(tmp, '.superdev', 'scopes', 'run-init-fresh')]).out,
    'implementing',
    'init implementing writes stage implementing directly, never planned',
  );

  // init: every stage short of `shipped` still refuses outright (the real double-init signal) —
  // `shipped` alone rotates instead (Important review finding B, ADR 0079/0080: `init` owns the
  // rotation, since `scope.js` is the sole ledger read and write path, ADR 0022).
  for (const stage of ['implementing', 'merged', 'reviewed', 'documented-unreviewed', 'documented']) {
    const slug = 'refuse-' + stage;
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    const r2 = path.join(tmp, '.superdev', 'scopes', slug);
    assert.ok(call(['stage', 'set', stage, '--root', r2]).ok, `advance ${slug} to ${stage}`);
    const reinit = call(['init', 'feat/' + slug, 'planned'], sliceJson);
    assert.ok(!reinit.ok && /already exists/.test(reinit.err), `init over stage "${stage}" still refuses`);
  }

  // init: a `shipped` ledger rotates aside to `ledger-shipped-<date>.md` rather than refusing — the
  // rotation `references/run-init.md` used to instruct the reader to perform by hand, now `init`'s own
  // job (Important review finding B). The fresh ledger lands at the requested entry stage, the rotated
  // file carries the old (shipped) content byte for byte, and init announces the rotation on stdout.
  {
    const slug = 'rotate-shipped';
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    const rotRoot = path.join(tmp, '.superdev', 'scopes', slug);
    assert.ok(call(['stage', 'set', 'shipped', '--root', rotRoot]).ok, 'advance to shipped');
    const shippedText = fs.readFileSync(path.join(rotRoot, 'ledger.md'), 'utf8');
    const rotated = call(['init', 'feat/' + slug, 'implementing'], sliceJson);
    assert.ok(rotated.ok, 'init over a shipped ledger rotates rather than refuses: ' + (rotated.err || ''));
    assert.ok(/rotat/i.test(rotated.out), 'init announces the rotation on stdout: ' + rotated.out);
    const rotatedFiles = fs
      .readdirSync(rotRoot)
      .filter((f) => /^ledger-shipped-.*\.md$/.test(f));
    assert.strictEqual(rotatedFiles.length, 1, 'exactly one rotated file: ' + rotatedFiles.join(', '));
    assert.strictEqual(
      fs.readFileSync(path.join(rotRoot, rotatedFiles[0]), 'utf8'),
      shippedText,
      'the rotated file carries the shipped ledger byte for byte',
    );
    assert.strictEqual(
      call(['get', 'stage', '--root', rotRoot]).out,
      'implementing',
      'the fresh ledger lands at the requested entry stage',
    );

    // A second rotation on the same day never overwrites the first, and nothing is deleted.
    assert.ok(call(['stage', 'set', 'shipped', '--root', rotRoot]).ok, 'advance to shipped again');
    const secondShippedText = fs.readFileSync(path.join(rotRoot, 'ledger.md'), 'utf8');
    assert.ok(call(['init', 'feat/' + slug, 'implementing'], sliceJson).ok, 'second rotation passes');
    const rotatedFiles2 = fs
      .readdirSync(rotRoot)
      .filter((f) => /^ledger-shipped-.*\.md$/.test(f));
    assert.strictEqual(rotatedFiles2.length, 2, 'a second same-day rotation adds a file rather than overwriting: ' + rotatedFiles2.join(', '));
    assert.strictEqual(
      fs.readFileSync(path.join(rotRoot, rotatedFiles[0]), 'utf8'),
      shippedText,
      'the first rotated file is untouched by the second rotation',
    );
    assert.ok(
      rotatedFiles2.some((f) => fs.readFileSync(path.join(rotRoot, f), 'utf8') === secondShippedText),
      'the second rotation is captured under its own file',
    );
  }

  // init: a refused init over a `shipped` ledger leaves it in place and rotates nothing — rotation
  // happens only after every validation of stdin passes (Important review finding G), so a malformed
  // payload never destroys the run's ledger.
  {
    const slug = 'refuse-shipped-malformed';
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    const refuseRoot = path.join(tmp, '.superdev', 'scopes', slug);
    assert.ok(call(['stage', 'set', 'shipped', '--root', refuseRoot]).ok, 'advance to shipped');
    const shippedBefore = fs.readFileSync(path.join(refuseRoot, 'ledger.md'), 'utf8');
    const refused = call(['init', 'feat/' + slug, 'implementing'], 'not json');
    assert.ok(!refused.ok, 'init with malformed stdin JSON is refused: ' + refused.out);
    assert.strictEqual(
      fs.readFileSync(path.join(refuseRoot, 'ledger.md'), 'utf8'),
      shippedBefore,
      'the shipped ledger is untouched by the refused init',
    );
    const rotatedOnRefusal = fs
      .readdirSync(refuseRoot)
      .filter((f) => /^ledger-shipped-.*\.md$/.test(f));
    assert.strictEqual(rotatedOnRefusal.length, 0, 'no rotation happens on a refused init');
  }

  // init: a run root directory that exists but holds no ledger.md yet (run init writes dod.md
  // before calling init) is tolerated — init still writes the ledger into it.
  const preexistingRoot = path.join(tmp, '.superdev', 'scopes', 'preexisting');
  fs.mkdirSync(preexistingRoot, { recursive: true });
  fs.writeFileSync(path.join(preexistingRoot, 'dod.md'), '# DoD\n', 'utf8');
  r = call(['init', 'feat/preexisting', 'planned'], sliceJson);
  assert.ok(r.ok, 'init tolerates a pre-existing dir with no ledger.md: ' + (r.err || ''));
  assert.ok(fs.existsSync(path.join(preexistingRoot, 'ledger.md')), 'ledger written into the pre-existing dir');
  assert.ok(fs.existsSync(path.join(preexistingRoot, 'dod.md')), 'dod.md untouched');

  // init: invalid labels refused naming the failing segment, no root created.
  for (const [label, re] of [
    ['zap/demo2', /type/],
    ['feat/Bad Slug', /slug/],
    ['nodelimiter', /no "\/"/],
    ['/demo2', /empty type/],
    ['feat/', /empty slug/],
    ['feat/-lead', /slug/],
  ]) {
    r = call(['init', label, 'planned'], sliceJson);
    assert.ok(!r.ok, `init "${label}" should refuse`);
    assert.ok(re.test(r.err), `refusal for "${label}" names the segment: ${r.err}`);
  }
  assert.ok(!fs.existsSync(path.join(tmp, '.superdev', 'scopes', 'demo2')), 'no root created on refusal');

  // init: duplicate slice ids refused.
  const dupJson = JSON.stringify({
    anchor: '#1 — anchor',
    slices: [
      { id: '01', issue: '#1', title: 'a', type: 'behavior' },
      { id: '01', issue: '#2', title: 'b', type: 'behavior' },
    ],
  });
  r = call(['init', 'feat/dup', 'planned'], dupJson);
  assert.ok(!r.ok && /duplicate slice id/.test(r.err), 'duplicate slice id refused');
  assert.ok(!fs.existsSync(path.join(tmp, '.superdev', 'scopes', 'dup')), 'no root created on duplicate id');

  // init: a refused init leaves the repo untouched — .gitignore is only written on success.
  {
    const refusedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-refused-'));
    const origRefused = console.log;
    console.log = () => {};
    try {
      run(['init', 'feat/refused', 'planned'], refusedDir, dupJson);
      assert.fail('duplicate-id init should refuse');
    } catch (e) {
      if (!e.isRefusal) throw e;
    } finally {
      console.log = origRefused;
    }
    assert.ok(!fs.existsSync(path.join(refusedDir, '.gitignore')), 'a refused init does not write .gitignore');
    fs.rmSync(refusedDir, { recursive: true, force: true });
  }

  // init: a slice literally named `id` (any case) is refused — tableRowIndexes reads that row
  // as the table header, so it would be written but invisible to every reader.
  const idSliceJson = JSON.stringify({
    anchor: '#1 — anchor',
    slices: [{ id: 'ID', issue: '#1', title: 'a', type: 'behavior' }],
  });
  r = call(['init', 'feat/idslice', 'planned'], idSliceJson);
  assert.ok(!r.ok && /reserved/.test(r.err), 'slice id "ID" refused as reserved: ' + (r.err || ''));

  // init: an anchor with a pipe is a header line, not a table cell — it reads back as written,
  // with no `\|` escape leaking into `get anchor` (and from there into a PR body).
  const pipeAnchorJson = JSON.stringify({
    anchor: '#5 — a | b',
    slices: [{ id: '01', issue: '#1', title: 'a', type: 'behavior' }],
  });
  r = call(['init', 'feat/pipe-anchor', 'planned'], pipeAnchorJson);
  assert.ok(r.ok, 'pipe-anchor init passes: ' + (r.err || ''));
  assert.strictEqual(
    call(['get', 'anchor', '--root', path.join(tmp, '.superdev', 'scopes', 'pipe-anchor')]).out,
    '#5 — a | b',
    'an anchor with a pipe reads back unescaped',
  );

  // init: an empty slice list is a valid, documented state — the ledger `/superdev:plan` writes at the
  // scope-branch cut, before any slice is decomposed (Important review finding 3, ADR 0079). It carries
  // a header and no slice rows, never refused as malformed, and `status` renders it as a run with no
  // slices yet rather than reporting nothing or erroring.
  const emptySlicesJson = JSON.stringify({ anchor: '#9 — cut before slicing', slices: [] });
  r = call(['init', 'feat/header-only', 'planned'], emptySlicesJson);
  assert.ok(r.ok, 'init with an empty slice list passes: ' + (r.err || ''));
  const headerOnlyRoot = path.join(tmp, '.superdev', 'scopes', 'header-only');
  assert.deepStrictEqual(call(['get', 'slices', '--root', headerOnlyRoot]).out, '', 'no slice rows yet');
  assert.ok(
    call(['status']).out.includes('header-only  (0 slices, stage: planned)'),
    'status renders a header-only ledger as a run with no slices yet',
  );
  // §6 fills in the table later, overwriting the same `planned` ledger init already allows overwriting.
  r = call(['init', 'feat/header-only', 'planned'], sliceJson);
  assert.ok(r.ok, 'a later init fills in the slice table over the same header-only ledger: ' + (r.err || ''));
  assert.strictEqual(
    call(['get', 'slices', '--root', headerOnlyRoot]).out.split('\n').length,
    2,
    'the slice table now carries both slices',
  );

  // stage: `planned` (ADR 0079) is a fresh ledger's own stage, accepted as a same-value write, and
  // `stage set implementing` moves forward out of it.
  assert.ok(call(['init', 'feat/planned-fwd', 'planned'], sliceJson).ok);
  const plannedRoot = path.join(tmp, '.superdev', 'scopes', 'planned-fwd');
  assert.strictEqual(call(['get', 'stage', '--root', plannedRoot]).out, 'planned', 'init writes stage planned');
  assert.ok(call(['stage', 'set', 'planned', '--root', plannedRoot]).ok, 'same-value planned write is a no-op');
  assert.ok(call(['stage', 'set', 'implementing', '--root', plannedRoot]).ok, 'planned → implementing moves forward');

  // stage: no write moves back to `planned` once a run has left it.
  const rBack = call(['stage', 'set', 'planned', '--root', plannedRoot]);
  assert.ok(!rBack.ok && /allowed:/.test(rBack.err), 'implementing → planned refused, naming the allowed stages: ' + (rBack.err || ''));

  // stage: get, unknown value, backwards, terminal, sanctioned move.
  const R = ['--root', root];
  assert.strictEqual(call(['get', 'stage', ...R]).out, 'implementing', 'get stage reads back the advanced stage');
  r = call(['stage', 'get', ...R]);
  assert.ok(!r.ok && /use set/.test(r.err), 'stage is set-only — get stage is the read path');
  r = call(['stage', 'set', 'polished', ...R]);
  assert.ok(!r.ok && /unknown stage/.test(r.err), 'unknown stage refused');
  assert.ok(call(['stage', 'set', 'merged', ...R]).ok, 'implementing → merged');
  r = call(['stage', 'set', 'implementing', ...R]);
  assert.ok(!r.ok, 'backwards move refused');
  assert.ok(call(['stage', 'set', 'documented-unreviewed', ...R]).ok, 'merged → documented-unreviewed');
  assert.ok(call(['stage', 'set', 'reviewed', ...R]).ok, 'sanctioned reviewed over documented-unreviewed');
  assert.ok(call(['stage', 'set', 'documented', ...R]).ok, 'reviewed → documented');
  r = call(['stage', 'set', 'reviewed', ...R]);
  assert.ok(!r.ok, 'documented is terminal for earlier stages');
  assert.ok(call(['stage', 'set', 'shipped', ...R]).ok, 'documented → shipped (ship\'s own write)');
  r = call(['stage', 'set', 'documented', ...R]);
  assert.ok(!r.ok, 'shipped is terminal');
  assert.ok(call(['stage', 'set', 'shipped', ...R]).ok, 'same-value write is a no-op, not a refusal');

  // stage: forward moves may skip ranks — the chain prose instructs it (review.md "anything else →
  // write reviewed", document.md "anything else → write documented-unreviewed") — and a forward move
  // out of documented-unreviewed reaching documented (no fix cycle ran) is allowed too. Each gets its
  // own scratch scope so it doesn't disturb the pipeline walk above.
  const mkStageRoot = (slug) => {
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    return path.join(tmp, '.superdev', 'scopes', slug);
  };
  let sr = mkStageRoot('stage-fwd-reviewed');
  assert.ok(call(['stage', 'set', 'reviewed', '--root', sr]).ok, 'implementing → reviewed (skip forward) allowed');

  sr = mkStageRoot('stage-fwd-docunrev');
  assert.ok(call(['stage', 'set', 'documented-unreviewed', '--root', sr]).ok, 'implementing → documented-unreviewed (skip forward) allowed');

  sr = mkStageRoot('stage-fwd-doc');
  assert.ok(call(['stage', 'set', 'documented-unreviewed', '--root', sr]).ok);
  assert.ok(call(['stage', 'set', 'documented', '--root', sr]).ok, 'documented-unreviewed → documented (no fix cycle) allowed');

  // stage: still-refused same-rank and backwards moves.
  sr = mkStageRoot('stage-back-docunrev');
  assert.ok(call(['stage', 'set', 'reviewed', '--root', sr]).ok);
  r = call(['stage', 'set', 'documented-unreviewed', '--root', sr]);
  assert.ok(!r.ok, 'reviewed → documented-unreviewed refused (only the reverse pair is sanctioned)');

  sr = mkStageRoot('stage-back-reviewed');
  assert.ok(call(['stage', 'set', 'reviewed', '--root', sr]).ok);
  assert.ok(call(['stage', 'set', 'documented', '--root', sr]).ok);
  r = call(['stage', 'set', 'reviewed', '--root', sr]);
  assert.ok(!r.ok, 'documented → reviewed refused');

  sr = mkStageRoot('stage-back-documented');
  assert.ok(call(['stage', 'set', 'documented', '--root', sr]).ok);
  assert.ok(call(['stage', 'set', 'shipped', '--root', sr]).ok);
  r = call(['stage', 'set', 'documented', '--root', sr]);
  assert.ok(!r.ok, 'shipped → documented refused');

  // slice: unknown id/status refused; a valid call updates exactly that row.
  r = call(['slice', '01', 'polished', ...R]);
  assert.ok(!r.ok && /unknown slice status/.test(r.err), 'unknown slice status refused');
  r = call(['slice', '99', 'merged', ...R]);
  assert.ok(!r.ok && /no slice row/.test(r.err), 'unknown slice id refused');
  assert.ok(call(['slice', '01', 'merged', ...R]).ok, 'valid slice update');
  const after = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(after.includes('| 01 | #188 | scope.js CLI | behavior | — | merged | — |'), 'row 01 updated');
  assert.ok(after.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | todo | — |'), 'row 02 untouched');

  // slice --range: writes the range cell when given, leaves it alone (— above) without it.
  assert.ok(call(['slice', '02', 'merged', '--range', 'abc123..def456', ...R]).ok, 'slice with --range');
  const withRange = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(withRange.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | merged | abc123..def456 |'), 'range cell written');

  // writeLines writes atomically (temp file + rename) — no leftover temp file survives a write.
  assert.deepStrictEqual(fs.readdirSync(root).filter((n) => n.includes('.tmp-')), [], 'no stray temp file left behind');

  // degraded: creates the line when absent, appends when present.
  assert.ok(call(['degraded', 'add', 'first pass degraded (2026-08-06)', ...R]).ok, 'degraded add creates');
  assert.ok(call(['degraded', 'add', 'second pass degraded (2026-08-06)', ...R]).ok, 'degraded add appends');
  const deg = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(/\*\*Degraded:\*\*\n- first pass degraded \(2026-08-06\)\n- second pass degraded \(2026-08-06\)/.test(deg), 'both bullets under one line');

  // unresolved: creates the line when absent, appends when present — mirrors degraded add.
  assert.ok(call(['unresolved', 'add', 'suite still red at the three-strike cap (2026-08-12)', ...R]).ok, 'unresolved add creates');
  assert.ok(call(['unresolved', 'add', 'operator declined the fix (2026-08-12)', ...R]).ok, 'unresolved add appends');
  const unres = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(
    /\*\*Unresolved:\*\*\n- suite still red at the three-strike cap \(2026-08-12\)\n- operator declined the fix \(2026-08-12\)/.test(unres),
    'both bullets under one line'
  );

  // deferred: the third record of this shape (ADR 0035). Creates the line when absent, appends when
  // present, exactly as degraded and unresolved do. It carries no `clear`: a deferred finding is not a
  // defect a re-verified run can wave away, and it stays true until somebody plans it.
  assert.ok(call(['deferred', 'add', 'carry deferrals into the pull-request body (2026-08-23)', ...R]).ok, 'deferred add creates');
  assert.ok(call(['deferred', 'add', 'second deferred finding (2026-08-23)', ...R]).ok, 'deferred add appends');
  const defer = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(
    /\*\*Deferred:\*\*\n- carry deferrals into the pull-request body \(2026-08-23\)\n- second deferred finding \(2026-08-23\)/.test(defer),
    'both deferred bullets under one line'
  );
  assert.strictEqual(
    call(['get', 'deferred', ...R]).out,
    'carry deferrals into the pull-request body (2026-08-23)\nsecond deferred finding (2026-08-23)',
    'get deferred prints one bullet per line'
  );

  // deferred add: a newline and an empty text are refused, and neither writes — the same two
  // refusals every bullet record makes, for the same reason.
  {
    const before = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    let d = call(['deferred', 'add', 'line one\nline two', ...R]);
    assert.ok(!d.ok && /newline/.test(d.err), 'deferred add with a newline refused: ' + d.err);
    d = call(['deferred', 'add', '', ...R]);
    assert.ok(!d.ok && /needs the bullet text/.test(d.err), 'deferred add with no text refused');
    assert.strictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), before, 'nothing written on either refusal');
  }

  // deferred: an unknown subcommand refuses, naming the one that exists — `clear` is not among them.
  {
    const d = call(['deferred', 'clear', ...R]);
    assert.ok(!d.ok && /unknown deferred subcommand.*add/.test(d.err), 'deferred clear refused, naming add: ' + d.err);
  }

  // get deferred: a ledger written before this record existed reports absent rather than failing,
  // the way every other header does for a pre-CLI ledger.
  {
    const preRoot = path.join(tmp, '.superdev', 'scopes', 'deferred-absent');
    fs.mkdirSync(preRoot, { recursive: true });
    fs.writeFileSync(path.join(preRoot, 'ledger.md'), '# Ledger — deferred-absent\n\n**Stage:** merged\n', 'utf8');
    const d = call(['get', 'deferred', '--root', preRoot]);
    assert.ok(d.ok, 'get deferred on a ledger with no such line succeeds');
    assert.strictEqual(d.out, '', 'and prints nothing');
  }

  // get unresolved / get degraded: one bullet per line, mirroring `get slices`.
  assert.strictEqual(
    call(['get', 'degraded', ...R]).out,
    'first pass degraded (2026-08-06)\nsecond pass degraded (2026-08-06)',
    'get degraded prints one bullet per line'
  );
  assert.strictEqual(
    call(['get', 'unresolved', ...R]).out,
    'suite still red at the three-strike cap (2026-08-12)\noperator declined the fix (2026-08-12)',
    'get unresolved prints one bullet per line'
  );

  // degraded add-denial / get denials: a denied verification dispatch is recorded distinguishably from
  // the other degraded shape, and counted, so an unattended run caps itself at two before the
  // platform's own three-denial kill stops it outside superdev's block procedure (ADR 0041). Its own
  // root, because the count is per run and the shared one above already carries the other shape.
  {
    const dRoot = path.join(tmp, '.superdev', 'scopes', 'denials');
    fs.mkdirSync(dRoot, { recursive: true });
    fs.writeFileSync(path.join(dRoot, 'ledger.md'), '# Ledger — denials\n\n**Stage:** implementing\n', 'utf8');
    const D = ['--root', dRoot];

    assert.strictEqual(call(['get', 'denials', ...D]).out, '0', 'no **Degraded:** line at all counts zero');

    assert.ok(call(['degraded', 'add', 'knowledge-base pass could not stage (2026-08-25)', ...D]).ok, 'degraded add creates');
    assert.strictEqual(call(['get', 'denials', ...D]).out, '0', 'a bullet of the other degraded shape counts zero');

    assert.ok(call(['degraded', 'add-denial', 'final-reviewer denied (2026-08-25)', ...D]).ok, 'add-denial appends');
    assert.ok(call(['degraded', 'add-denial', 'doc-reader denied (2026-08-25)', ...D]).ok, 'add-denial appends again');
    const denLedger = fs.readFileSync(path.join(dRoot, 'ledger.md'), 'utf8');
    assert.ok(
      /\*\*Degraded:\*\*\n- knowledge-base pass could not stage \(2026-08-25\)\n- denied: final-reviewer denied \(2026-08-25\)\n- denied: doc-reader denied \(2026-08-25\)/.test(denLedger),
      'every bullet under one line, each denial carrying the prefix'
    );
    assert.strictEqual(call(['get', 'denials', ...D]).out, '2', 'get denials counts only the prefixed bullets');

    // `get degraded` still prints every bullet one per line, prefix intact, so `/superdev:status` and
    // the pull-request body show a denial as a denial with no step of their own.
    assert.strictEqual(
      call(['get', 'degraded', ...D]).out,
      'knowledge-base pass could not stage (2026-08-25)\ndenied: final-reviewer denied (2026-08-25)\ndenied: doc-reader denied (2026-08-25)',
      'get degraded prints every bullet, denial prefix intact'
    );

    // add-denial shares add's two refusals, and neither writes.
    const beforeDenialRefusal = fs.readFileSync(path.join(dRoot, 'ledger.md'), 'utf8');
    let d = call(['degraded', 'add-denial', 'line one\nline two', ...D]);
    assert.ok(!d.ok && /newline/.test(d.err), 'add-denial with a newline refused: ' + d.err);
    d = call(['degraded', 'add-denial', '', ...D]);
    assert.ok(
      !d.ok && /^degraded add-denial needs the bullet text$/.test(d.err),
      'add-denial with no text refused, naming add-denial: ' + d.err
    );
    assert.strictEqual(
      fs.readFileSync(path.join(dRoot, 'ledger.md'), 'utf8'),
      beforeDenialRefusal,
      'nothing written on either refusal'
    );

    d = call(['degraded', 'zap', 'x', ...D]);
    assert.ok(!d.ok && /unknown degraded subcommand.*add\|add-denial/.test(d.err), 'unknown degraded subcommand names both: ' + d.err);

    d = call(['get', 'nope', ...D]);
    assert.ok(!d.ok && /denials/.test(d.err), 'get on an unknown field names denials among the valid ones: ' + d.err);

    // degraded reset-denials: the count runs from the last marker, and every recorded denial survives
    // it, so a maintainer who fixed the cause returns the budget without destroying the trail
    // (ADR 0044). The ledger above carries two denials at this point.
    assert.ok(
      call(['degraded', 'reset-denials', 'added final-reviewer to permissions.allow', ...D]).ok,
      'reset-denials appends'
    );
    assert.ok(
      /\n- denials reset: added final-reviewer to permissions\.allow\n?$/.test(fs.readFileSync(path.join(dRoot, 'ledger.md'), 'utf8')),
      'the marker carries its own prefix, under the same **Degraded:** line'
    );
    assert.strictEqual(call(['get', 'denials', ...D]).out, '0', 'a marker returns the whole budget');

    assert.ok(call(['degraded', 'add-denial', 'doc-reader denied (2026-08-27)', ...D]).ok, 'a denial after the marker');
    assert.strictEqual(call(['get', 'denials', ...D]).out, '1', 'the count runs from the marker, not the ledger head');

    assert.ok(call(['degraded', 'reset-denials', 'second reason', ...D]).ok, 'a second marker');
    assert.ok(call(['degraded', 'add-denial', 'slice-reviewer denied (2026-08-27)', ...D]).ok, 'a denial after the second marker');
    assert.strictEqual(call(['get', 'denials', ...D]).out, '1', 'two markers: the count runs from the later one');

    // Every denial bullet survives both resets: the record is what makes the cap tolerable.
    assert.strictEqual(
      call(['get', 'degraded', ...D]).out,
      [
        'knowledge-base pass could not stage (2026-08-25)',
        'denied: final-reviewer denied (2026-08-25)',
        'denied: doc-reader denied (2026-08-25)',
        'denials reset: added final-reviewer to permissions.allow',
        'denied: doc-reader denied (2026-08-27)',
        'denials reset: second reason',
        'denied: slice-reviewer denied (2026-08-27)',
      ].join('\n'),
      'get degraded prints the full history, both prefixes intact'
    );

    // reset-denials shares add's two refusals, and neither writes.
    const beforeResetRefusal = fs.readFileSync(path.join(dRoot, 'ledger.md'), 'utf8');
    d = call(['degraded', 'reset-denials', 'line one\nline two', ...D]);
    assert.ok(!d.ok && /newline/.test(d.err), 'reset-denials with a newline refused: ' + d.err);
    d = call(['degraded', 'reset-denials', '', ...D]);
    assert.ok(
      !d.ok && /^degraded reset-denials needs the reason$/.test(d.err),
      'reset-denials with no text refused, naming reset-denials and its reason: ' + d.err
    );
    assert.strictEqual(
      fs.readFileSync(path.join(dRoot, 'ledger.md'), 'utf8'),
      beforeResetRefusal,
      'nothing written on either refusal'
    );

    // A run root whose ledger carries no **Degraded:** line at all: the marker creates the line.
    {
      const rRoot = path.join(tmp, '.superdev', 'scopes', 'reset-only');
      fs.mkdirSync(rRoot, { recursive: true });
      fs.writeFileSync(path.join(rRoot, 'ledger.md'), '# Ledger — reset-only\n\n**Stage:** implementing\n', 'utf8');
      const RR = ['--root', rRoot];
      assert.ok(call(['degraded', 'reset-denials', 'nothing denied yet', ...RR]).ok, 'reset-denials on a line-less ledger');
      assert.ok(
        /\*\*Degraded:\*\*\n- denials reset: nothing denied yet/.test(fs.readFileSync(path.join(rRoot, 'ledger.md'), 'utf8')),
        'the **Degraded:** line is created for it'
      );
      assert.strictEqual(call(['get', 'denials', ...RR]).out, '0', 'and the count reads zero');
    }

    // A plain `add` cannot write a bullet `get denials` reads as either shape: the refusal names
    // `add-denial` as the verification-dispatch verb, and tells any other denial (an authoring
    // dispatch, a denied Bash command — both still take plain `add`, per scope-mode `## Degraded
    // passes`) to rework its wording instead of misrouting it to `add-denial` (ADR 0044).
    const beforePrefixRefusal = fs.readFileSync(path.join(dRoot, 'ledger.md'), 'utf8');
    d = call(['degraded', 'add', 'denied: something', ...D]);
    assert.ok(
      !d.ok && /add-denial is for a denied verification dispatch/.test(d.err) && /any other denial/.test(d.err),
      'degraded add refuses a denied: text, pointing verification denials at add-denial and telling any other denial to rework: ' + d.err
    );
    d = call(['degraded', 'add', 'denials reset: something', ...D]);
    assert.ok(!d.ok && /reset-denials/.test(d.err), 'degraded add refuses a denials reset: text, naming reset-denials: ' + d.err);
    assert.strictEqual(
      fs.readFileSync(path.join(dRoot, 'ledger.md'), 'utf8'),
      beforePrefixRefusal,
      'nothing written on either prefix refusal'
    );

    d = call(['degraded', 'nope', 'x', ...D]);
    assert.ok(
      !d.ok && /add\|add-denial\|reset-denials/.test(d.err),
      'unknown degraded subcommand names all three: ' + d.err
    );
  }

  // degraded add / unresolved add: a bullet containing a newline is refused — unescaped, it would
  // write arbitrary extra ledger lines, including a second **Stage:** line.
  const beforeNewlineDeg = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  r = call(['degraded', 'add', 'line one\nline two', ...R]);
  assert.ok(!r.ok && /newline/.test(r.err), 'degraded add with a newline refused: ' + r.err);
  assert.strictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), beforeNewlineDeg, 'nothing written on refusal');
  r = call(['unresolved', 'add', 'line one\nline two', ...R]);
  assert.ok(!r.ok && /newline/.test(r.err), 'unresolved add with a newline refused: ' + r.err);
  assert.strictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), beforeNewlineDeg, 'nothing written on refusal');

  // unresolved add: no text refuses with a one-line message and writes nothing.
  const beforeNoText = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  r = call(['unresolved', 'add', '', ...R]);
  assert.ok(!r.ok && /needs the bullet text/.test(r.err), 'unresolved add with no text refused');
  assert.strictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), beforeNoText, 'nothing written on refusal');

  // unresolved: an unknown subcommand refuses, naming the two that exist.
  r = call(['unresolved', 'zap', 'x', ...R]);
  assert.ok(!r.ok && /unknown unresolved subcommand.*add\|clear/.test(r.err), 'unknown unresolved subcommand refused: ' + r.err);

  // unresolved clear: removes the line and its bullets entirely.
  assert.ok(call(['unresolved', 'clear', ...R]).ok, 'unresolved clear');
  const cleared = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(!/\*\*Unresolved:\*\*/.test(cleared), 'the line is gone');
  assert.ok(!/suite still red/.test(cleared), 'its bullets are gone too');

  // unresolved clear: on a ledger with no such line, succeeds and changes nothing.
  const beforeNoopClear = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(call(['unresolved', 'clear', ...R]).ok, 'clearing an absent line still succeeds');
  assert.strictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), beforeNoopClear, 'and changes nothing');

  // unresolved clear: the two adjacency cases — nothing beside the block gets touched.
  // Case 1: **Unresolved:** and its bullets are the file's last lines (no trailing table, no
  // blank line after).
  const tailRoot = path.join(tmp, '.superdev', 'scopes', 'unresolved-tail');
  fs.mkdirSync(tailRoot, { recursive: true });
  const tailText =
    '# Ledger — unresolved-tail\n\n**Stage:** merged\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n' +
    '|---|---|---|---|---|---|---|\n' +
    '| 01 | #1 | x | behavior | — | merged | — |\n\n' +
    '**Unresolved:**\n- suite still red at the three-strike cap (2026-08-12)\n- second bullet\n';
  fs.writeFileSync(path.join(tailRoot, 'ledger.md'), tailText, 'utf8');
  assert.ok(call(['unresolved', 'clear', '--root', tailRoot]).ok, 'clear on a trailing Unresolved block');
  assert.strictEqual(
    fs.readFileSync(path.join(tailRoot, 'ledger.md'), 'utf8'),
    '# Ledger — unresolved-tail\n\n**Stage:** merged\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #1 | x | behavior | — | merged | — |\n\n',
    'the block and only the block is gone; the table above is untouched'
  );

  // Case 2: **Unresolved:**'s last bullet is immediately followed by the slice table header
  // row, with no blank-line separator.
  const gluedRoot = path.join(tmp, '.superdev', 'scopes', 'unresolved-glued');
  fs.mkdirSync(gluedRoot, { recursive: true });
  const gluedText =
    '# Ledger — unresolved-glued\n\n**Stage:** merged\n\n' +
    '**Unresolved:**\n- suite still red at the three-strike cap (2026-08-12)\n' +
    '| id | issue | title | type | depends-on | status | range |\n' +
    '|---|---|---|---|---|---|---|\n' +
    '| 01 | #1 | x | behavior | — | merged | — |\n';
  fs.writeFileSync(path.join(gluedRoot, 'ledger.md'), gluedText, 'utf8');
  assert.ok(call(['unresolved', 'clear', '--root', gluedRoot]).ok, 'clear on an Unresolved block glued to the table');
  assert.strictEqual(
    fs.readFileSync(path.join(gluedRoot, 'ledger.md'), 'utf8'),
    '# Ledger — unresolved-glued\n\n**Stage:** merged\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #1 | x | behavior | — | merged | — |\n',
    'the block is gone and the table header sits exactly where it did, no stray blank line'
  );

  // docs set: `**Docs:**` records that a run performed its documentation pass in the controller's
  // own context (ADR 0031), and the line sits with the other headers rather than above them.
  assert.ok(call(['docs', 'set', 'inline', ...R]).ok, 'docs set');
  const docsText = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(/\*\*Docs:\*\* inline/.test(docsText), 'ledger carries the Docs line');
  assert.ok(
    /\*\*Anchor:\*\*[^\n]*\n\*\*Docs:\*\* inline/.test(docsText),
    'the Docs line follows the last header line, not the title'
  );
  assert.strictEqual(call(['get', 'docs', ...R]).out, 'inline', 'get docs');

  // docs set: a second write replaces the line rather than adding a rival.
  assert.ok(call(['docs', 'set', 'inline-again', ...R]).ok, 'docs set twice');
  const docsTwice = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.strictEqual((docsTwice.match(/\*\*Docs:\*\*/g) || []).length, 1, 'one Docs line, not two');
  assert.strictEqual(call(['get', 'docs', ...R]).out, 'inline-again', 'the second value wins');

  // docs: refusals write nothing.
  const beforeDocsRefusal = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  r = call(['docs', 'set', ...R]);
  assert.ok(!r.ok && /docs set needs a value/.test(r.err), 'docs set with no value refused');
  r = call(['docs', 'zap', 'x', ...R]);
  assert.ok(!r.ok && /unknown docs subcommand.*set\|clear/.test(r.err), 'unknown docs subcommand refused: ' + r.err);
  r = call(['docs', 'set', 'inline', '--root', path.join(tmp, 'no-such-root')]);
  assert.ok(!r.ok && /no-such-root/.test(r.err), 'docs set against a missing root refused, naming it');
  r = call(['docs', 'set', 'two words', ...R]);
  assert.ok(!r.ok && /whitespace/.test(r.err), 'docs set with a whitespace-bearing value refused, naming the problem: ' + r.err);
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'),
    beforeDocsRefusal,
    'nothing written on any docs refusal'
  );

  // docs clear: removes the line and leaves every other byte alone.
  const beforeDocsClear = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(call(['docs', 'clear', ...R]).ok, 'docs clear');
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'),
    beforeDocsClear.replace('**Docs:** inline-again\n', ''),
    'the Docs line and only the Docs line is gone'
  );
  assert.strictEqual(call(['get', 'docs', ...R]).out, 'absent', 'get docs on a ledger with no line');

  // docs clear: on a ledger with no such line, succeeds and changes nothing — the shape an
  // interrupted lite run and every full run leave behind.
  const beforeNoopDocsClear = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(call(['docs', 'clear', ...R]).ok, 'clearing an absent Docs line still succeeds');
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'),
    beforeNoopDocsClear,
    'and changes nothing'
  );

  // get: prints the value; absent header reported as absent.
  assert.strictEqual(call(['get', 'branch', ...R]).out, 'feat/demo', 'get branch');
  assert.ok(/#187/.test(call(['get', 'anchor', ...R]).out), 'get anchor');
  const slices = call(['get', 'slices', ...R]).out.split('\n');
  assert.strictEqual(slices.length, 2, 'get slices prints one line per row');
  assert.strictEqual(slices[0], '01\t#188\tscope.js CLI\tbehavior\t—\tmerged\t—', 'get slices is tab-separated');

  // cell escaping: a `|` or a newline in a title must not corrupt the ledger row, and must
  // round-trip losslessly through get slices and a slice row-rebuild.
  const pipeJson = JSON.stringify({
    anchor: '#1 — anchor',
    slices: [{ id: '01', issue: '#1', title: 'add a|b parser', type: 'behavior' }],
  });
  let pr = call(['init', 'feat/pipe-title', 'planned'], pipeJson);
  assert.ok(pr.ok, 'init with a `|` in the title should pass: ' + (pr.err || ''));
  const pipeRoot = path.join(tmp, '.superdev', 'scopes', 'pipe-title');
  const P2 = ['--root', pipeRoot];
  let pipeSlices = call(['get', 'slices', ...P2]).out.split('\n');
  assert.strictEqual(pipeSlices[0], '01\t#1\tadd a|b parser\tbehavior\t—\ttodo\t—', 'get slices restores the literal |');
  assert.ok(call(['slice', '01', 'merged', ...P2]).ok, 'slice row-rebuild survives an escaped |');
  pipeSlices = call(['get', 'slices', ...P2]).out.split('\n');
  assert.strictEqual(pipeSlices[0], '01\t#1\tadd a|b parser\tbehavior\t—\tmerged\t—', 'title with | intact after row-rebuild');
  let ps = call(['status']);
  assert.ok(ps.ok && !/ledger unreadable/.test(ps.out.split('\n').find((l) => l.startsWith('pipe-title')) || ''), 'status reads the pipe-title ledger fine');

  const newlineJson = JSON.stringify({
    anchor: '#2 — anchor',
    slices: [{ id: '01', issue: '#2', title: 'line one\nline two', type: 'behavior' }],
  });
  pr = call(['init', 'feat/newline-title', 'planned'], newlineJson);
  assert.ok(pr.ok, 'init with a newline in the title should pass: ' + (pr.err || ''));
  const nlRoot = path.join(tmp, '.superdev', 'scopes', 'newline-title');
  const N2 = ['--root', nlRoot];
  let nlSlices = call(['get', 'slices', ...N2]).out.split('\n');
  assert.strictEqual(nlSlices.length, 1, 'a collapsed newline title stays one ledger row');
  assert.strictEqual(nlSlices[0], '01\t#2\tline one line two\tbehavior\t—\ttodo\t—', 'newline runs collapse to one space');
  assert.ok(call(['slice', '01', 'merged', ...N2]).ok, 'slice row-rebuild survives a collapsed newline');
  ps = call(['status']);
  assert.ok(ps.ok && !/ledger unreadable/.test(ps.out.split('\n').find((l) => l.startsWith('newline-title')) || ''), 'status reads the newline-title ledger fine');

  // The scope-slug and change-type rules live here as code (SLUG_RE, CHANGE_TYPES) but
  // hooks/run-lock.js extracts with the same charset and references/scope-mode.md states it
  // in prose — one fact in three syntaxes, kept equal (took over from drift-check's retired
  // scope-slug contract row).
  assert.strictEqual(SLUG_RE.source, '^[a-zA-Z0-9][a-zA-Z0-9_-]*$', 'SLUG_RE itself is pinned');
  const charset = SLUG_RE.source.slice(1, -1); // drop the ^…$ anchors
  const repo = path.join(path.dirname(scopePath), '..');
  const runLock = fs.readFileSync(path.join(repo, 'hooks', 'run-lock.js'), 'utf8');
  assert.ok(runLock.includes(charset), 'run-lock.js extracts with the SLUG_RE charset');
  const scopeMode = fs.readFileSync(path.join(repo, 'references', 'scope-mode.md'), 'utf8');
  assert.ok(scopeMode.includes('`' + charset + '`'), 'scope-mode.md states the SLUG_RE charset');

  // A pre-CLI ledger (hand-written, no Branch/Anchor/Degraded/Unresolved lines) parses unchanged.
  const preRoot = path.join(tmp, '.superdev', 'scopes', 'precli');
  fs.mkdirSync(preRoot, { recursive: true });
  const preCliText =
    '# Ledger — precli\n\n**Stage:** merged\n\n' +
    '| id | issue | title | type | depends-on | status | range |\n' +
    '|---|---|---|---|---|---|---|\n' +
    '| 01 | #10 | old slice | mechanical | — | merged | abc..def |\n';
  fs.writeFileSync(path.join(preRoot, 'ledger.md'), preCliText, 'utf8');
  const P = ['--root', preRoot];
  assert.strictEqual(call(['get', 'stage', ...P]).out, 'merged', 'pre-CLI stage readable');
  assert.strictEqual(call(['get', 'branch', ...P]).out, 'absent', 'absent Branch reported as absent');
  assert.strictEqual(readLedgerHeader(preCliText, 'Unresolved'), null, 'a missing Unresolved line reads as absent rather than raising');
  assert.ok(call(['unresolved', 'clear', ...P]).ok, 'clearing an absent Unresolved line on a pre-CLI ledger still succeeds');
  assert.ok(call(['stage', 'set', 'reviewed', ...P]).ok, 'pre-CLI ledger writable');

  // status: renders every scope; an unreadable ledger is reported while others render.
  const badRoot = path.join(tmp, '.superdev', 'scopes', 'broken');
  fs.mkdirSync(badRoot, { recursive: true });
  fs.writeFileSync(path.join(badRoot, 'ledger.md'), '| 01 | not | enough | cells |\n', 'utf8');
  const st = call(['status']);
  assert.ok(st.ok, 'status runs');
  // A shipped scope is not work in flight — `scope-prune` is about to reap it (ADR 0007) — so it
  // collapses to one line and drops its tally and blocked list. Its degrade record survives that
  // collapse: `scope-prune` reaps the run root seven days later, and the pull-request body is
  // otherwise the only surviving copy of a pass that ran degraded. Its staged-page lines survive too,
  // and are asserted with the rest of the kb cases below.
  assert.ok(st.out.includes('demo  (shipped)'), 'a shipped scope collapses to one line: ' + st.out);
  assert.ok(!st.out.includes('demo  (2 slices'), 'a shipped scope carries no slice count');
  assert.ok(
    !st.out.includes('todo: 0  in-progress: 0  in-review: 0  blocked: 0  merged: 2'),
    "a shipped scope's tally is not printed"
  );
  assert.ok(
    st.out.includes('  degraded: first pass degraded (2026-08-06), second pass degraded (2026-08-06)'),
    "a shipped scope's degrade record survives the collapse: " + st.out
  );
  // Its deferred-finding record survives for the same reason, and one reason more: it is the only
  // record naming work nobody has planned yet (ADR 0035), so the reap takes the last copy with it.
  assert.ok(
    st.out.includes('  deferred: carry deferrals into the pull-request body (2026-08-23), second deferred finding (2026-08-23)'),
    "a shipped scope's deferred record survives the collapse: " + st.out
  );
  assert.ok(st.out.includes('precli  (1 slices, stage: reviewed)'), 'status shows pre-CLI scope');
  assert.ok(st.out.includes('broken: ledger unreadable'), 'unreadable ledger reported');

  // status: an `unresolved:` line for a scope that has one, and none for a scope that does not.
  // No scope carries one yet — the demo scope's line was cleared above.
  assert.ok(!/unresolved:/.test(st.out), 'no unresolved line when no scope has one: ' + st.out);
  // A shipped scope's collapsed status still carries its unresolved bullets, as it carries its
  // degraded ones (the demo scope above is shipped).
  assert.ok(call(['unresolved', 'add', 'suite still red at the three-strike cap (2026-08-12)', ...R]).ok);
  const stShippedUnresolved = call(['status']).out;
  assert.ok(
    stShippedUnresolved.includes('  unresolved: suite still red at the three-strike cap (2026-08-12)'),
    "a shipped scope's unresolved record survives the collapse: " + stShippedUnresolved
  );

  // An in-flight scope still prints everything it printed before: tally, blocked slices, and its
  // degrade record. The collapse is scoped to `shipped` alone.
  const flightRoot = path.join(tmp, '.superdev', 'scopes', 'inflight');
  fs.mkdirSync(flightRoot, { recursive: true });
  fs.writeFileSync(
    path.join(flightRoot, 'ledger.md'),
    '# Ledger — inflight\n\n**Stage:** merged\n**Degraded:**\n- doc pass denied (2026-08-11)\n' +
      '**Unresolved:**\n- fix declined by the operator (2026-08-12)\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #20 | one | behavior | — | merged | a..b |\n' +
      '| 02 | #21 | two | behavior | — | blocked | — |\n',
    'utf8'
  );
  const stFlight = call(['status']);
  assert.ok(stFlight.out.includes('inflight  (2 slices, stage: merged)'), 'an in-flight scope keeps its header');
  assert.ok(stFlight.out.includes('todo: 0  in-progress: 0  in-review: 0  blocked: 1  merged: 1'), 'and its tally');
  assert.ok(stFlight.out.includes('  blocked: 02 two'), 'and its blocked slices');
  assert.ok(stFlight.out.includes('  degraded: doc pass denied (2026-08-11)'), 'and its degrade record');
  assert.ok(stFlight.out.includes('  unresolved: fix declined by the operator (2026-08-12)'), 'and its unresolved record');

  // A `planned` run — a plan cut the branch and scopetree but no slice has run — prints with its
  // stage named, not as an unknown or in-flight run (ADR 0079).
  const plannedStatusRoot = path.join(tmp, '.superdev', 'scopes', 'planned-status');
  fs.mkdirSync(plannedStatusRoot, { recursive: true });
  fs.writeFileSync(
    path.join(plannedStatusRoot, 'ledger.md'),
    '# Ledger — planned-status\n\n**Stage:** planned\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n',
    'utf8'
  );
  const stPlanned = call(['status']);
  assert.ok(stPlanned.out.includes('planned-status  (0 slices, stage: planned)'), 'a planned run names its stage: ' + stPlanned.out);

  // status with zero scopes.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-empty-'));
  const logged = [];
  const orig = console.log;
  console.log = (s) => logged.push(String(s));
  try {
    run(['status'], empty, '');
  } finally {
    console.log = orig;
  }
  assert.strictEqual(logged.join('\n'), 'No superdev runs found in this repo.', 'zero-scope message');
  fs.rmSync(empty, { recursive: true, force: true });

  // status: staged knowledge-base pages awaiting /superdev:publish-kb (ADR 0023). Nothing else
  // reports them, and a page nobody publishes is a page no reader sees.
  const kbDir = path.join(tmp, '.superdev', 'kb-pending');
  assert.ok(!/pending publish/.test(st.out), 'nothing staged adds no line at all');

  fs.mkdirSync(path.join(kbDir, 'demo'), { recursive: true });
  fs.writeFileSync(path.join(kbDir, 'demo', 'overview.md'), '---\ntitle: Overview\naction: upsert\n---\n', 'utf8');
  fs.writeFileSync(path.join(kbDir, 'demo', 'legacy.md'), '---\ntitle: Legacy\naction: delete\n---\n', 'utf8');
  fs.mkdirSync(path.join(kbDir, '_adhoc'), { recursive: true });
  fs.writeFileSync(path.join(kbDir, '_adhoc', 'guide.md'), '---\ntitle: Guide\naction: upsert\n---\n', 'utf8');
  fs.mkdirSync(path.join(kbDir, 'nothing-here'), { recursive: true });

  // A scope with a malformed ledger (see `broken` below) can still hold staged pages. Its pending
  // line belongs beside its `ledger unreadable` line, once — never a second time under `(no ledger)`,
  // because the ledger file exists; only its rows are malformed.
  fs.mkdirSync(path.join(kbDir, 'broken'), { recursive: true });
  fs.writeFileSync(path.join(kbDir, 'broken', 'p.md'), '---\ntitle: P\naction: upsert\n---\n', 'utf8');

  // A non-`.md` file in a staging directory (a page written as `overview` or `overview.markdown`)
  // must be surfaced, never silently skipped — that is exactly the silent loss the staged-page
  // filename contract exists to prevent. Cover both a scope with a run root and one without.
  fs.writeFileSync(path.join(kbDir, 'demo', 'draft.markdown'), 'stray\n', 'utf8');
  fs.mkdirSync(path.join(kbDir, 'stray-only'), { recursive: true });
  fs.writeFileSync(path.join(kbDir, 'stray-only', 'notes.txt'), 'stray\n', 'utf8');

  // A .md file written straight into the staging root, not under a <scope>/ subdirectory, is the same
  // silent-loss failure one level up: it counts in no scope's pages and matches no publish-kb glob.
  fs.writeFileSync(path.join(kbDir, 'orphan.md'), '---\ntitle: Orphan\naction: upsert\n---\n', 'utf8');

  const stKb = call(['status']);
  assert.ok(stKb.ok, 'status runs with staged pages');
  assert.ok(
    stKb.out.includes('  pending publish: 2 staged pages — /superdev:publish-kb demo'),
    'a scope with a run root carries its pending line: ' + stKb.out,
  );
  assert.ok(stKb.out.includes('_adhoc  (no ledger)'), 'a pending scope with no run root is reported');
  assert.ok(
    stKb.out.includes('  pending publish: 1 staged page — /superdev:publish-kb _adhoc'),
    'one page is singular',
  );
  assert.ok(!/nothing-here/.test(stKb.out), 'an empty staging directory is not pending');
  assert.ok(stKb.out.includes('broken: ledger unreadable'), 'the rest of the report is unchanged');

  // `demo` is shipped, so it collapses — but its staged-page lines are the exception that survives.
  // A page nobody publishes is invisible everywhere else (ADR 0023), and a shipped scope is exactly
  // where one waits, so collapsing these away would reintroduce the silent loss reporting prevents.
  // Asserted on the collapsed header specifically, not merely on the lines being present somewhere.
  const demoBlock = stKb.out.split('\n');
  const demoAt = demoBlock.findIndex((l) => l === 'demo  (shipped)');
  assert.ok(demoAt >= 0, 'the shipped scope still collapses with pages staged: ' + stKb.out);
  const demoLines = [];
  for (let i = demoAt + 1; i < demoBlock.length && demoBlock[i].startsWith('  '); i++) demoLines.push(demoBlock[i]);
  assert.ok(
    demoLines.some((l) => l.includes('pending publish: 2 staged pages')),
    "a shipped scope's pending line survives the collapse: " + demoLines.join(' | '),
  );
  assert.ok(
    demoLines.some((l) => l.includes('draft.markdown')),
    "a shipped scope's stray line survives the collapse: " + demoLines.join(' | '),
  );
  assert.ok(
    !demoLines.some((l) => l.startsWith('  todo:')),
    'and its tally still does not print',
  );
  assert.ok(
    stKb.out.includes('draft.markdown') && /ignored/.test(stKb.out),
    'a non-.md file under a scope with a run root is surfaced, not silently skipped: ' + stKb.out,
  );
  assert.ok(
    stKb.out.includes('stray-only') && stKb.out.includes('notes.txt'),
    'a scope with only stray files (no .md pages, no ledger) is still surfaced: ' + stKb.out,
  );
  assert.ok(
    stKb.out.includes('orphan.md') && /staged directly/.test(stKb.out),
    'a .md file staged directly under kb-pending (no scope directory) is surfaced, not silently dropped: ' + stKb.out,
  );
  assert.ok(
    stKb.out.includes('  pending publish: 1 staged page — /superdev:publish-kb broken'),
    'a malformed ledger still reports its own pending pages: ' + stKb.out,
  );
  assert.ok(!stKb.out.includes('broken  (no ledger)'), 'not reported a second time — its ledger file exists');

  // pages staged with no run root anywhere: the report is the pending blocks, not the zero-scope line.
  const only = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-kbonly-'));
  fs.mkdirSync(path.join(only, '.superdev', 'kb-pending', '_adhoc'), { recursive: true });
  fs.writeFileSync(path.join(only, '.superdev', 'kb-pending', '_adhoc', 'p.md'), 'x\n', 'utf8');
  const onlyLog = [];
  const origOnly = console.log;
  console.log = (s) => onlyLog.push(String(s));
  try {
    run(['status'], only, '');
  } finally {
    console.log = origOnly;
  }
  assert.ok(
    onlyLog.join('\n').includes('pending publish: 1 staged page — /superdev:publish-kb _adhoc'),
    'staged pages alone still produce a report',
  );
  assert.ok(
    !onlyLog.join('\n').includes('No superdev runs found'),
    'the zero-scope message never hides pending pages',
  );
  fs.rmSync(only, { recursive: true, force: true });

  // main()'s success path lets the process exit naturally instead of forcing process.exit(0),
  // so stdout flushes before exit. `call()` above bypasses main() entirely, so this needs a
  // real subprocess.
  const cp = require('child_process');
  const spawnEmpty = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-spawn-'));
  const spawned = cp.spawnSync(process.execPath, [scopePath, 'status'], { cwd: spawnEmpty, encoding: 'utf8' });
  assert.strictEqual(spawned.status, 0, 'CLI process exits 0 on success');
  assert.strictEqual(spawned.stdout.trim(), 'No superdev runs found in this repo.', 'CLI process flushes stdout');
  fs.rmSync(spawnEmpty, { recursive: true, force: true });

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
  assert.ok(call(['docs', 'set', 'inline', ...F]).ok);
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
  // straight into a string. Production never does that: `## Publishing run state`'s mechanism hands
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
  // produced — the real per-write shape `## Publishing run state` runs under.
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

  // Pin: scope.js shares kb-patch.js's fence-masking rule via `require` rather than growing a
  // private copy that could silently diverge (ADR 0022's second-reader lesson) — the equivalent of
  // ledger-guard.js's byte-identity pin against merge-guard.js's ARG token, adapted for a shared
  // function instead of a duplicated constant.
  {
    const src = fs.readFileSync(scopePath, 'utf8');
    assert.ok(
      /const\s*\{\s*maskFencedLines\s*\}\s*=\s*require\(['"]\.\/kb-patch\.js['"]\)/.test(src),
      'scope.js requires maskFencedLines from kb-patch.js'
    );
    assert.strictEqual(
      (src.match(/function\s+maskFencedLines\s*\(/g) || []).length,
      0,
      'scope.js defines no private maskFencedLines of its own'
    );
  }

  // --- root: the run-root path resolver, anchored to the main working tree (ADR 0080) -----------
  {
    // `call` above fixes cwd at `tmp`; `root` resolves relative to cwd, so it needs its own.
    const callIn = (argv, cwd, stdinJson) => {
      const logged = [];
      const orig = console.log;
      console.log = (s) => logged.push(String(s));
      try {
        run(argv, cwd, stdinJson || '');
        return { ok: true, out: logged.join('\n') };
      } catch (e) {
        if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
        throw e;
      } finally {
        console.log = orig;
      }
    };
    function gitRoot(args, cwd) {
      execFileSync('git', args, { cwd, stdio: 'ignore' });
    }

    // realpathSync: git resolves symlinks (e.g. macOS's /tmp -> /private/tmp) when it reports paths,
    // so the expectation below has to compare against the same resolved path.
    const mainRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-root-')));
    gitRoot(['init', '-q', '-b', 'main'], mainRepo);
    gitRoot(['config', 'user.email', 'test@example.com'], mainRepo);
    gitRoot(['config', 'user.name', 'test'], mainRepo);
    fs.writeFileSync(path.join(mainRepo, 'README.md'), 'x\n');
    gitRoot(['add', '.'], mainRepo);
    gitRoot(['commit', '-q', '-m', 'init'], mainRepo);

    const expectedRoot = path.join(mainRepo, '.superdev', 'scopes', 'demo');
    assert.strictEqual(
      callIn(['root', 'demo'], mainRepo).out,
      expectedRoot,
      'root resolves from the main working tree, which holds no linked worktree'
    );

    // A linked worktree (a scopetree or a slicetree) resolves the same run root.
    const worktreeDir = path.join(mainRepo, '..', path.basename(mainRepo) + '-wt');
    gitRoot(['worktree', 'add', '-q', '-b', 'feat/wt', worktreeDir], mainRepo);
    assert.strictEqual(
      callIn(['root', 'demo'], worktreeDir).out,
      expectedRoot,
      'root resolves the same path from a linked worktree'
    );
    fs.rmSync(worktreeDir, { recursive: true, force: true });

    // Outside a git repository entirely.
    const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-root-nogit-'));
    const noGit = callIn(['root', 'demo'], noGitDir);
    assert.ok(!noGit.ok && /not inside a git repository/.test(noGit.err), 'root refuses outside a git repository: ' + (noGit.err || ''));
    fs.rmSync(noGitDir, { recursive: true, force: true });

    // A slug carrying a path separator or a leading dot.
    for (const bad of ['a/b', '../escape', '.hidden']) {
      const r2 = callIn(['root', bad], mainRepo);
      assert.ok(!r2.ok, `root refuses slug "${bad}"`);
    }

    // `init` and `status`, run from a linked worktree (a scopetree or a slicetree), resolve the same
    // run root `root` resolves from the main working tree — never one nested inside the worktree itself
    // (Important review finding 4, ADR 0080). This is the exact shape of `/superdev:plan` cutting the
    // scopetree under the main working tree while run init's own `init` call, made from inside it,
    // would otherwise write the ledger one level too deep.
    const wtRoot = path.join(mainRepo, '..', path.basename(mainRepo) + '-init-wt');
    gitRoot(['worktree', 'add', '-q', '-b', 'feat/init-wt', wtRoot], mainRepo);
    const initFromWt = callIn(
      ['init', 'feat/init-wt-scope', 'planned'],
      wtRoot,
      JSON.stringify({ anchor: '#1 — init from a worktree', slices: [] }),
    );
    assert.ok(initFromWt.ok, 'init from a linked worktree passes: ' + (initFromWt.err || ''));
    const expectedInitRoot = path.join(mainRepo, '.superdev', 'scopes', 'init-wt-scope');
    assert.ok(
      fs.existsSync(path.join(expectedInitRoot, 'ledger.md')),
      'init from a linked worktree writes the ledger under the main working tree, not the worktree itself',
    );
    assert.ok(
      !fs.existsSync(path.join(wtRoot, '.superdev', 'scopes', 'init-wt-scope', 'ledger.md')),
      'init from a linked worktree nests no run root inside the worktree',
    );
    assert.ok(
      callIn(['status'], mainRepo).out.includes('init-wt-scope'),
      'status from the main working tree sees the run root init wrote from the linked worktree',
    );
    assert.ok(
      callIn(['status'], wtRoot).out.includes('init-wt-scope'),
      'status from the linked worktree resolves the same scopes directory as the main working tree',
    );
    fs.rmSync(wtRoot, { recursive: true, force: true });

    fs.rmSync(mainRepo, { recursive: true, force: true });
  }

  // --- testContainment: the exported containment test (ADR 0053, ADR 0065) ---------------------
  //
  // No CLI verb — a sibling script `require`s this directly, the same shape `readLedgerHeader` already
  // gives `hooks/scope-prune.js`. Real git repositories throughout, the same way tests/scope-prune.test.js's
  // own containment fixtures do: the git plumbing is the thing under test, not a stub over it.
  {
    function gitTest(args, cwd) {
      execFileSync('git', args, { cwd, stdio: 'ignore' });
    }

    function makeRepo() {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-'));
      gitTest(['init', '-q', '-b', 'main'], dir);
      gitTest(['config', 'user.email', 'test@example.com'], dir);
      gitTest(['config', 'user.name', 'test'], dir);
      fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
      gitTest(['add', '.'], dir);
      gitTest(['commit', '-q', '-m', 'init'], dir);
      return dir;
    }

    function makeWorkBranch(repoDir, branch, file, body) {
      gitTest(['checkout', '-q', '-b', branch], repoDir);
      fs.writeFileSync(path.join(repoDir, file), body);
      gitTest(['add', '.'], repoDir);
      gitTest(['commit', '-q', '-m', `work on ${branch}`], repoDir);
      gitTest(['checkout', '-q', 'main'], repoDir);
    }

    // #squash-merged: ancestry never lists this branch, since its commits were rewritten into one new
    // commit on main — the exact gap ADR 0053 closed.
    const squashRepo = makeRepo();
    makeWorkBranch(squashRepo, 'fix/squashed', 'app.txt', 'v2\n');
    gitTest(['merge', '--squash', 'fix/squashed'], squashRepo);
    gitTest(['commit', '-q', '-m', 'fix: squashed (#1)'], squashRepo);
    assert.strictEqual(
      testContainment(squashRepo, 'main', 'fix/squashed'),
      'contained',
      'a squash-merged branch reads contained'
    );
    fs.rmSync(squashRepo, { recursive: true, force: true });

    // #genuinely-unmerged-with-remote: the branch's content lives nowhere base can reach, not locally
    // and not on the remote either — so a refetch cannot flip the answer. The verdict must still only
    // land after the refetch actually ran (ADR 0065's second pass is not skipped just because the first
    // pass already looked conclusive): FETCH_HEAD carries whatever that fetch wrote, and its presence is
    // the one observable trace of the attempt.
    const unmergedRepo = makeRepo();
    const unmergedOrigin = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-origin-'));
    gitTest(['init', '-q', '--bare', '-b', 'main'], unmergedOrigin);
    gitTest(['remote', 'add', 'origin', unmergedOrigin], unmergedRepo);
    gitTest(['push', '-q', 'origin', 'main'], unmergedRepo);
    makeWorkBranch(unmergedRepo, 'fix/unmerged', 'app.txt', 'v2\n');
    assert.strictEqual(
      fs.existsSync(path.join(unmergedRepo, '.git', 'FETCH_HEAD')),
      false,
      'no fetch has run yet in this fixture'
    );
    assert.strictEqual(
      testContainment(unmergedRepo, 'main', 'fix/unmerged'),
      'not-contained',
      'content living only on the branch reads not contained'
    );
    assert.strictEqual(
      fs.existsSync(path.join(unmergedRepo, '.git', 'FETCH_HEAD')),
      true,
      'a not-contained local verdict triggers the refetch before answering'
    );
    fs.rmSync(unmergedRepo, { recursive: true, force: true });
    fs.rmSync(unmergedOrigin, { recursive: true, force: true });

    // #remote-only-branch: the local branch is gone (a host that squash-merges and never deletes the
    // remote-tracking ref) but `origin/fix/onremote-squashed` still names the exact commit — a bare
    // `merge-tree`/`merge-base` call never checks that qualified shape on its own (ADR 0053 Important
    // 3), so without qualifyBranch this reads could-not-resolve however completely base holds the work.
    const remoteOnlyRepo = makeRepo();
    const remoteOnlyOrigin = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-origin-'));
    gitTest(['init', '-q', '--bare', '-b', 'main'], remoteOnlyOrigin);
    gitTest(['remote', 'add', 'origin', remoteOnlyOrigin], remoteOnlyRepo);
    gitTest(['checkout', '-q', '-b', 'fix/onremote-squashed'], remoteOnlyRepo);
    fs.writeFileSync(path.join(remoteOnlyRepo, 'remote-squash.txt'), 'z\n');
    gitTest(['add', '.'], remoteOnlyRepo);
    gitTest(['commit', '-q', '-m', 'work on the remote branch'], remoteOnlyRepo);
    gitTest(['push', '-q', 'origin', 'fix/onremote-squashed'], remoteOnlyRepo);
    gitTest(['checkout', '-q', 'main'], remoteOnlyRepo);
    gitTest(['merge', '--squash', 'fix/onremote-squashed'], remoteOnlyRepo);
    gitTest(['commit', '-q', '-m', 'fix: onremote-squashed (#1)'], remoteOnlyRepo);
    gitTest(['branch', '-q', '-D', 'fix/onremote-squashed'], remoteOnlyRepo); // local gone, remote-tracking stays
    assert.strictEqual(
      testContainment(remoteOnlyRepo, 'main', 'fix/onremote-squashed'),
      'contained',
      'a branch gone locally but present as a remote-tracking ref is resolved and tested, not reported unresolvable'
    );
    fs.rmSync(remoteOnlyRepo, { recursive: true, force: true });
    fs.rmSync(remoteOnlyOrigin, { recursive: true, force: true });

    // #no-write-tree: a git that rejects `merge-tree --write-tree` falls back to `git merge-base
    // --is-ancestor` (scope-mode `## Containment`) rather than erroring. A shell wrapper on PATH stands
    // in for git 2.37 and earlier — it rejects only that one flag combination and forwards every other
    // call to the real git, exactly what an old git's own `merge-tree` does (three tree-ish arguments,
    // nonzero on `--write-tree`).
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const fakeGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-oldgit-'));
    fs.writeFileSync(
      path.join(fakeGitDir, 'git'),
      '#!/bin/sh\n' +
        'if [ "$1" = "merge-tree" ] && [ "$2" = "--write-tree" ]; then exit 129; fi\n' +
        `exec "${realGit}" "$@"\n`,
      { mode: 0o755 }
    );
    const oldGitRepo = makeRepo();
    makeWorkBranch(oldGitRepo, 'fix/mergecommit', 'app.txt', 'v2\n');
    gitTest(['merge', '-q', '--no-ff', '-m', 'merge', 'fix/mergecommit'], oldGitRepo);
    const savedPath = process.env.PATH;
    process.env.PATH = fakeGitDir + path.delimiter + savedPath;
    try {
      assert.strictEqual(
        testContainment(oldGitRepo, 'main', 'fix/mergecommit'),
        'contained',
        'a git without --write-tree falls back to the ancestry test rather than erroring'
      );
    } finally {
      process.env.PATH = savedPath;
    }
    fs.rmSync(oldGitRepo, { recursive: true, force: true });
    fs.rmSync(fakeGitDir, { recursive: true, force: true });

    // #unresolvable: a branch name naming no ref anywhere in the repository — a typo, or a scope whose
    // branch was renamed by hand — reads could-not-resolve, distinct from not-contained: a consumer
    // reading "not contained" as "hasn't landed yet" would warn about the wrong thing for a branch that
    // never existed at all.
    const noBranchRepo = makeRepo();
    assert.strictEqual(
      testContainment(noBranchRepo, 'main', 'fix/does-not-exist'),
      'could-not-resolve',
      'a branch naming no ref at all reports could-not-resolve'
    );
    fs.rmSync(noBranchRepo, { recursive: true, force: true });

    // #no-remote: no remote configured at all, and the branch is genuinely not contained — the fetch
    // ADR 0065 wants can't even be attempted, and the local verdict must stand rather than throw.
    const noRemoteRepo = makeRepo();
    makeWorkBranch(noRemoteRepo, 'fix/noremote', 'app.txt', 'v2\n');
    assert.strictEqual(
      testContainment(noRemoteRepo, 'main', 'fix/noremote'),
      'not-contained',
      'a repository with no remote configured answers from the local base without erroring'
    );
    fs.rmSync(noRemoteRepo, { recursive: true, force: true });

    // #unreachable-host: a dropped VPN or a firewalled host is ordinary, not exotic, and the refetch
    // must still return within a bounded window rather than leaving `git fetch` blocked on a connect
    // that never resolves. 192.0.2.1 is TEST-NET-1 (RFC 5737): reserved and never routed anywhere, so
    // the connect attempt stalls the way a genuinely black-holed remote would, unlike `#no-remote`
    // above, which fails fast because there is no remote to dial at all.
    const unreachableRepo = makeRepo();
    makeWorkBranch(unreachableRepo, 'fix/unreachable', 'app.txt', 'v2\n');
    gitTest(['remote', 'add', 'origin', 'http://192.0.2.1/nowhere.git'], unreachableRepo);
    const unreachableStart = Date.now();
    const unreachableVerdict = testContainment(unreachableRepo, 'main', 'fix/unreachable');
    const unreachableElapsedMs = Date.now() - unreachableStart;
    assert.strictEqual(
      unreachableVerdict,
      'not-contained',
      'an unreachable host still degrades to the local verdict'
    );
    assert.ok(
      unreachableElapsedMs < 8000,
      `the refetch returns within a bounded window instead of hanging, took ${unreachableElapsedMs}ms`
    );
    fs.rmSync(unreachableRepo, { recursive: true, force: true });

    // #argument-injection-base: `base` shaped like a git option must never reach `spawnSync` as one —
    // `git fetch <remote> <base>` carries no separator, so `base = '--upload-pack=<script>'` runs that
    // script as the (fake) remote's upload-pack before `git` ever complains about the ref. `branch` here
    // is an ordinary, genuinely not-contained branch so the call reaches the vulnerable fetch line
    // rather than exiting early on an unresolved branch.
    const injectionRepo = makeRepo();
    makeWorkBranch(injectionRepo, 'fix/injected', 'app.txt', 'v2\n');
    const injectionOrigin = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-origin-'));
    gitTest(['init', '-q', '--bare', '-b', 'main'], injectionOrigin);
    gitTest(['remote', 'add', 'origin', injectionOrigin], injectionRepo);
    const payloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-payload-'));
    const markerFile = path.join(payloadDir, 'marker');
    const payloadScript = path.join(payloadDir, 'evil.sh');
    fs.writeFileSync(payloadScript, `#!/bin/sh\ntouch "${markerFile}"\n`, { mode: 0o755 });
    const injectionVerdict = testContainment(
      injectionRepo,
      `--upload-pack=${payloadScript}`,
      'fix/injected',
      'origin'
    );
    assert.strictEqual(
      fs.existsSync(markerFile),
      false,
      'an option-shaped base never runs as an argument to git fetch'
    );
    assert.notStrictEqual(injectionVerdict, 'contained', 'an option-shaped base never reads contained');
    fs.rmSync(injectionRepo, { recursive: true, force: true });
    fs.rmSync(injectionOrigin, { recursive: true, force: true });
    fs.rmSync(payloadDir, { recursive: true, force: true });

    // #argument-injection-branch: an option-shaped `branch` must resolve safely too, through
    // `qualifyBranch`/`refResolves` (both `rev-parse` calls) — could-not-resolve, never a crash and
    // never contained.
    const injectionBranchRepo = makeRepo();
    const injectionBranchVerdict = testContainment(injectionBranchRepo, 'main', '-C/tmp');
    assert.notStrictEqual(
      injectionBranchVerdict,
      'contained',
      'an option-shaped branch never reads contained'
    );
    fs.rmSync(injectionBranchRepo, { recursive: true, force: true });

    // #real-conflict: the branch and base edit the same line differently — `git merge-tree` exits 1 on
    // a genuine conflict, the other cause besides an unresolved ref (scope-mode `## Containment`). Must
    // read not-contained, never crash and never contained — the wrong-direction failure this slice's
    // brief names explicitly.
    const conflictRepo = makeRepo();
    fs.writeFileSync(path.join(conflictRepo, 'README.md'), 'base change\n');
    gitTest(['commit', '-q', '-am', 'base edits the shared line'], conflictRepo);
    makeWorkBranch(conflictRepo, 'fix/conflicting', 'README.md', 'branch change\n');
    assert.strictEqual(
      testContainment(conflictRepo, 'main', 'fix/conflicting'),
      'not-contained',
      'a real conflict between branch and base reads not-contained, not a crash'
    );
    fs.rmSync(conflictRepo, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('scope tests ok');
