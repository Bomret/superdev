'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js. Requires the module (silent — scope.js already guards its CLI
// entry with require.main === module, per ADR 0059) and calls its exported internals directly, the
// way the script's own inline --selftest used to before this suite moved off the shipped tree
// (ADR 0059).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');

const scopePath = require.resolve('../plugin/scripts/scope.js');
const {
  run,
  publishText,
  SLUG_RE,
  readLedgerHeader,
  testContainment,
  baseHistoryHasPatch,
  appendTrace,
  isTestPath,
  findCollisions,
} = require(scopePath);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-'));

// Capture console.log output per call, plus a direct process.stdout.write (dod-line's body mode
// writes its exact bytes that way, rather than through console.log's own added trailing newline).
const call = (argv, stdinJson) => {
  const logged = [];
  const orig = console.log;
  const origWrite = process.stdout.write;
  console.log = (s) => logged.push(String(s));
  process.stdout.write = (s) => {
    logged.push(String(s));
    return true;
  };
  try {
    run(argv, tmp, stdinJson || '');
    return { ok: true, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
    throw e;
  } finally {
    console.log = orig;
    process.stdout.write = origWrite;
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

  // The ledger layout superdev-view's parse.ts reads: scope.js writes exactly the shared ledger, and the
  // mod's suite parses the same text into headers and slice rows, so a layout change on either side fails one suite.
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'mods', 'superdev-view', 'hooks', 'ledger-fixtures.ts'), 'utf8');
    const lines = JSON.parse(src.slice(src.indexOf('/* ledger:start */') + 18, src.indexOf('/* ledger:end */')));
    const viewTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-view-'));
    const viewRoot = path.join(viewTmp, '.superdev', 'scopes', 'view');
    const viewJson = JSON.stringify({
      anchor: '#9 — Show the pane',
      slices: [
        { id: '01', issue: '#10', title: 'Draw the tiles', type: 'behavior', 'depends-on': '—' },
        { id: '02', issue: '#11', title: 'Draw the scope map', type: 'behavior', 'depends-on': '01' },
        { id: '03', issue: '#12', title: 'Document the mod', type: 'docs', 'depends-on': '02' },
        { id: '04', issue: '#13', title: 'Split | merge the panes', type: 'behavior', 'depends-on': '03' },
      ],
    });
    const origView = console.log;
    console.log = () => {};
    try {
      run(['init', 'feat/view', 'planned'], viewTmp, viewJson);
      run(['stage', '--root', viewRoot, 'set', 'implementing'], viewTmp);
      run(['slice', '--root', viewRoot, '01', 'merged', '--range', 'a1b2c3d..e4f5a6b'], viewTmp);
      run(['slice', '--root', viewRoot, '02', 'in-progress'], viewTmp);
      console.log = origView;
      assert.deepEqual(fs.readFileSync(path.join(viewRoot, 'ledger.md'), 'utf8').split('\n'), lines, 'scope.js writes the ledger superdev-view parses');
    } finally {
      console.log = origView;
      fs.rmSync(viewTmp, { recursive: true, force: true });
    }
  }

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

  // init: every stage short of `closed` and `planned` refuses outright (the real double-init signal).
  // `shipped` refuses too (ADR 0106): the run is finished only when wrap-up closes it, so the message
  // names the two commands that finish it, and nothing is written or rotated. `closed` alone rotates
  // (below; ADR 0079/0080: `init` owns the rotation, since `scope.js` is the sole ledger read and write path).
  for (const stage of ['implementing', 'merged', 'reviewed', 'documented-unreviewed', 'documented']) {
    const slug = 'refuse-' + stage;
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    const r2 = path.join(tmp, '.superdev', 'scopes', slug);
    assert.ok(call(['stage', 'set', stage, '--root', r2]).ok, `advance ${slug} to ${stage}`);
    const reinit = call(['init', 'feat/' + slug, 'planned'], sliceJson);
    assert.ok(!reinit.ok && /already exists/.test(reinit.err), `init over stage "${stage}" still refuses`);
  }

  {
    const slug = 'refuse-shipped';
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    const shRoot = path.join(tmp, '.superdev', 'scopes', slug);
    assert.ok(call(['stage', 'set', 'shipped', '--root', shRoot]).ok, 'advance to shipped');
    const shippedText = fs.readFileSync(path.join(shRoot, 'ledger.md'), 'utf8');
    const refused = call(['init', 'feat/' + slug, 'implementing'], sliceJson);
    assert.ok(!refused.ok, 'init over a shipped ledger refuses: ' + refused.out);
    assert.ok(
      /verify-ship/.test(refused.err) && /wrap-up/.test(refused.err),
      'the refusal names /superdev:verify-ship and /superdev:wrap-up: ' + refused.err,
    );
    assert.strictEqual(fs.readFileSync(path.join(shRoot, 'ledger.md'), 'utf8'), shippedText, 'the shipped ledger is untouched');
    assert.deepStrictEqual(
      fs.readdirSync(shRoot).filter((f) => /^ledger-.*\.md$/.test(f)),
      [],
      'nothing is rotated aside',
    );
  }

  // `closed` is the terminal stage (ADR 0106): reached from `shipped`, left by no move, printed as one
  // line by `status`, and rotated aside by `init` like a `shipped` ledger, never over an earlier rotation.
  {
    const slug = 'rotate-closed';
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    const cRoot = path.join(tmp, '.superdev', 'scopes', slug);
    const early = call(['stage', 'set', 'closed', '--root', cRoot]);
    assert.ok(!early.ok && /does not move to "closed"/.test(early.err), 'planned → closed refused: ' + early.err);
    assert.ok(call(['stage', 'set', 'submitted', '--root', cRoot]).ok);
    assert.ok(!call(['stage', 'set', 'closed', '--root', cRoot]).ok, 'submitted → closed refused');
    assert.ok(call(['stage', 'set', 'shipped', '--root', cRoot]).ok, 'advance to shipped');
    assert.ok(call(['stage', 'set', 'closed', '--root', cRoot]).ok, 'shipped → closed');
    for (const back of ['shipped', 'documented', 'implementing']) {
      const refused = call(['stage', 'set', back, '--root', cRoot]);
      assert.ok(!refused.ok && /terminal/.test(refused.err), `closed → ${back} refused as terminal: ${refused.err}`);
    }
    assert.ok(call(['status']).out.includes(slug + '  (closed)'), 'status prints a closed scope as one line');
    const closedText = fs.readFileSync(path.join(cRoot, 'ledger.md'), 'utf8');
    assert.ok(call(['init', 'feat/' + slug, 'implementing'], sliceJson).ok, 'init over a closed ledger rotates');
    const first = fs.readdirSync(cRoot).filter((f) => /^ledger-closed-.*\.md$/.test(f));
    assert.strictEqual(first.length, 1, 'one rotated closed ledger: ' + first.join(', '));
    assert.strictEqual(fs.readFileSync(path.join(cRoot, first[0]), 'utf8'), closedText, 'rotated byte for byte');
    assert.ok(call(['stage', 'set', 'shipped', '--root', cRoot]).ok);
    assert.ok(call(['stage', 'set', 'closed', '--root', cRoot]).ok);
    assert.ok(call(['init', 'feat/' + slug, 'implementing'], sliceJson).ok, 'second rotation passes');
    const second = fs.readdirSync(cRoot).filter((f) => /^ledger-closed-.*\.md$/.test(f));
    assert.strictEqual(second.length, 2, 'a second rotation never overwrites the first: ' + second.join(', '));
  }

  // init: a refused init over a `closed` ledger leaves it in place and rotates nothing — rotation
  // happens only after every validation of stdin passes (Important review finding G), so a malformed
  // payload never destroys the run's ledger.
  {
    const slug = 'refuse-closed-malformed';
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    const refuseRoot = path.join(tmp, '.superdev', 'scopes', slug);
    assert.ok(call(['stage', 'set', 'shipped', '--root', refuseRoot]).ok, 'advance to shipped');
    assert.ok(call(['stage', 'set', 'closed', '--root', refuseRoot]).ok, 'advance to closed');
    const shippedBefore = fs.readFileSync(path.join(refuseRoot, 'ledger.md'), 'utf8');
    const refused = call(['init', 'feat/' + slug, 'implementing'], 'not json');
    assert.ok(!refused.ok, 'init with malformed stdin JSON is refused: ' + refused.out);
    assert.strictEqual(
      fs.readFileSync(path.join(refuseRoot, 'ledger.md'), 'utf8'),
      shippedBefore,
      'the closed ledger is untouched by the refused init',
    );
    const rotatedOnRefusal = fs
      .readdirSync(refuseRoot)
      .filter((f) => /^ledger-closed-.*\.md$/.test(f));
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
  assert.ok(!r.ok, 'shipped → documented refused (a backwards move, not because shipped is terminal)');
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

  // stage: `submitted` (issue #682) ranks after `documented`/`documented-unreviewed`, before `shipped`
  // — reachable from `reviewed`, `documented`, and `documented-unreviewed` alike.
  for (const from of ['reviewed', 'documented', 'documented-unreviewed']) {
    sr = mkStageRoot('stage-submitted-from-' + from);
    assert.ok(call(['stage', 'set', from, '--root', sr]).ok);
    r = call(['stage', 'set', 'submitted', '--root', sr]);
    assert.ok(r.ok, `${from} → submitted should pass: ` + (r.err || ''));
    assert.strictEqual(call(['get', 'stage', '--root', sr]).out, 'submitted', 'get stage reads back submitted');
  }

  // stage: `shipped` is reachable from `submitted`.
  sr = mkStageRoot('stage-submitted-to-shipped');
  assert.ok(call(['stage', 'set', 'submitted', '--root', sr]).ok);
  assert.ok(call(['stage', 'set', 'shipped', '--root', sr]).ok, 'submitted → shipped should pass');

  // stage: a write from `submitted` back to `documented` (or any earlier stage) is refused, exit
  // nonzero, and the ledger is left unchanged.
  sr = mkStageRoot('stage-submitted-no-back');
  assert.ok(call(['stage', 'set', 'submitted', '--root', sr]).ok);
  const beforeBack = fs.readFileSync(path.join(sr, 'ledger.md'), 'utf8');
  r = call(['stage', 'set', 'documented', '--root', sr]);
  assert.ok(!r.ok, 'submitted → documented refused');
  assert.strictEqual(
    fs.readFileSync(path.join(sr, 'ledger.md'), 'utf8'),
    beforeBack,
    'a refused stage move from submitted leaves the ledger untouched'
  );

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

  // deferred: an unknown subcommand refuses, naming the two that exist — `clear` is not among them.
  {
    const d = call(['deferred', 'clear', ...R]);
    assert.ok(!d.ok && /unknown deferred subcommand.*add\|resolve/.test(d.err), 'deferred clear refused, naming add|resolve: ' + d.err);
  }

  // deferred resolve (ADR 0121): removes a bullet by its exact text, read on stdin the way `add -` reads it.
  {
    const ledger = () => fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    const odd = 'quote " backtick ` subst $(rm -rf x) — triage #871 (2026-10-05)';
    assert.ok(call(['deferred', 'add', '-', ...R], odd + '\n').ok, 'deferred add - takes shell-hostile text');
    assert.ok(call(['deferred', 'add', '-', ...R], odd + '\n').ok, 'a duplicate of it');
    assert.ok(call(['deferred', 'resolve', '-', ...R], odd + '\n').ok, 'deferred resolve - removes it');
    assert.strictEqual(
      call(['get', 'deferred', ...R]).out,
      'carry deferrals into the pull-request body (2026-08-23)\nsecond deferred finding (2026-08-23)',
      'every identical bullet goes; the others stay'
    );

    // Refusals leave the ledger byte-identical: no match, a prefix of a bullet, empty text, a newline.
    const before = ledger();
    for (const [text, why] of [
      ['no such finding', /no deferred bullet/],
      ['second deferred finding', /no deferred bullet/],
      ['', /needs the bullet text/],
      ['line one\nline two', /newline/],
    ]) {
      const d = call(['deferred', 'resolve', '-', ...R], text);
      assert.ok(!d.ok && why.test(d.err), `deferred resolve refuses ${JSON.stringify(text)}: ` + d.err);
      assert.strictEqual(ledger(), before, `nothing written for ${JSON.stringify(text)}`);
    }

    // Resolving the last bullet removes the `**Deferred:**` line itself.
    assert.ok(call(['deferred', 'resolve', '-', ...R], 'carry deferrals into the pull-request body (2026-08-23)').ok);
    assert.ok(call(['deferred', 'resolve', '-', ...R], 'second deferred finding (2026-08-23)').ok);
    assert.ok(!/\*\*Deferred:\*\*/.test(ledger()), 'no empty Deferred line remains');
    assert.strictEqual(call(['get', 'deferred', ...R]).out, '', 'get deferred prints nothing');

    // A ledger with no `**Deferred:**` line refuses too.
    const none = ledger();
    const d = call(['deferred', 'resolve', '-', ...R], 'anything');
    assert.ok(!d.ok && /no deferred bullet/.test(d.err), 'resolve on a ledger with no Deferred line refused: ' + d.err);
    assert.strictEqual(ledger(), none, 'nothing written');

    // Restore the two bullets later assertions in this block may read.
    call(['deferred', 'add', 'carry deferrals into the pull-request body (2026-08-23)', ...R]);
    call(['deferred', 'add', 'second deferred finding (2026-08-23)', ...R]);
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

  // unresolved add -, deferred add -, degraded add -: the sole word "-" past "add" reads the bullet
  // text from stdin instead of a shell-interpolated argument (triage #680), one trailing newline
  // stripped; text carrying a quote, a backtick, a `$(`, still lands byte for byte.
  {
    const tricky = 'report says `$(rm -rf /)` and "quotes" too';
    assert.ok(call(['unresolved', 'add', '-', ...R], tricky + '\n').ok, 'unresolved add - reads stdin');
    assert.ok(
      call(['get', 'unresolved', ...R]).out.includes(tricky),
      'the stdin-supplied unresolved text lands verbatim'
    );
    assert.ok(call(['deferred', 'add', '-', ...R], tricky + '\n').ok, 'deferred add - reads stdin');
    assert.ok(
      call(['get', 'deferred', ...R]).out.includes(tricky),
      'the stdin-supplied deferred text lands verbatim'
    );
    assert.ok(call(['degraded', 'add', '-', ...R], tricky + '\n').ok, 'degraded add - reads stdin');
    assert.ok(
      call(['get', 'degraded', ...R]).out.includes(tricky),
      'the stdin-supplied degraded text lands verbatim'
    );

    // A newline embedded in the stdin text (past the one trailing newline stripped) is still refused.
    const d = call(['unresolved', 'add', '-', ...R], 'line one\nline two\n');
    assert.ok(!d.ok && /newline/.test(d.err), 'an embedded newline in stdin text is still refused: ' + d.err);
  }

  // degraded add-denial - and degraded reset-denials -: the same stdin sentinel, since a classifier's
  // own refusal text (add-denial's argument) or an operator's reset reason can carry a quote just as
  // easily as any other bullet text (Important review find #2).
  {
    const dsRoot = path.join(tmp, '.superdev', 'scopes', 'stdin-denials');
    fs.mkdirSync(dsRoot, { recursive: true });
    fs.writeFileSync(path.join(dsRoot, 'ledger.md'), '# Ledger — stdin-denials\n\n**Stage:** implementing\n', 'utf8');
    const DS = ['--root', dsRoot];

    const trickyDenial = `final-reviewer denied: it's "not allowed" and \`$(rm -rf /)\``;
    assert.ok(
      call(['degraded', 'add-denial', '-', ...DS], trickyDenial + '\n').ok,
      'degraded add-denial - reads stdin'
    );
    assert.ok(
      call(['get', 'degraded', ...DS]).out.includes(trickyDenial),
      'the stdin-supplied add-denial text lands verbatim, prefix intact'
    );

    const trickyReason = `fixed it — it's "done" now`;
    assert.ok(
      call(['degraded', 'reset-denials', '-', ...DS], trickyReason + '\n').ok,
      'degraded reset-denials - reads stdin'
    );
    assert.ok(
      call(['get', 'degraded', ...DS]).out.includes(trickyReason),
      'the stdin-supplied reset-denials text lands verbatim'
    );
  }

  // The real CLI (a subprocess, not the mocked `run()` call above) actually waits on stdin for the
  // "-" sentinel — the case main()'s own needsStdin gate has to recognise.
  {
    const cliRoot = path.join(tmp, '.superdev', 'scopes', 'demo');
    const out = execFileSync(
      process.execPath,
      [scopePath, 'unresolved', 'add', '-', '--root', cliRoot],
      { input: 'from the real CLI\n', encoding: 'utf8' }
    );
    assert.strictEqual(out, '', 'unresolved add - prints nothing on success');
    assert.ok(
      fs.readFileSync(path.join(cliRoot, 'ledger.md'), 'utf8').includes('from the real CLI'),
      'the real CLI actually read stdin for the "-" sentinel'
    );
  }

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

  // docs set / suite set: a hand-edited ledger carrying bullets directly after the last header
  // line — non-standard, but scope.js parses a pre-CLI ledger unchanged — gets the new header line
  // placed after that whole block, never spliced between the header and its bullets.
  {
    const glued2Root = path.join(tmp, 'docs-suite-glued');
    fs.mkdirSync(glued2Root, { recursive: true });
    const glued2Text =
      '# Ledger — docs-suite-glued\n\n**Stage:** merged\n**Branch:** feat/docs-suite-glued\n' +
      '**Anchor:** #1 — glued\n- a hand-added bullet directly after Anchor, not a real Unresolved/Degraded/Deferred block\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #2 | x | behavior | — | merged | — |\n';
    fs.writeFileSync(path.join(glued2Root, 'ledger.md'), glued2Text, 'utf8');
    const G2 = ['--root', glued2Root];
    assert.ok(call(['docs', 'set', 'inline', ...G2]).ok, 'docs set on a ledger with a bullet glued to Anchor');
    const glued2Docs = fs.readFileSync(path.join(glued2Root, 'ledger.md'), 'utf8');
    assert.ok(
      /a hand-added bullet directly after Anchor, not a real Unresolved\/Degraded\/Deferred block\n\*\*Docs:\*\* inline/.test(
        glued2Docs
      ),
      'the Docs line lands after the glued bullet, not between Anchor and it: ' + glued2Docs
    );
  }

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

  // pr set: `**PR:**` records the pull request number `/superdev:submit-pr` opened, so `/superdev:ship`
  // reads it back instead of a head-branch lookup that a reused branch name could get wrong (INV-0092).
  assert.strictEqual(call(['get', 'pr', ...R]).out, 'absent', 'get pr on a ledger with no line');
  assert.ok(call(['pr', 'set', '123', ...R]).ok, 'pr set');
  const prText = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(/\*\*PR:\*\* #123/.test(prText), 'ledger carries the PR line as #123');
  assert.strictEqual(call(['get', 'pr', ...R]).out, '#123', 'get pr');

  // pr set: a second write replaces the line rather than adding a rival, and a leading "#" is accepted.
  assert.ok(call(['pr', 'set', '#456', ...R]).ok, 'pr set with a leading #');
  const prTwice = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.strictEqual((prTwice.match(/\*\*PR:\*\*/g) || []).length, 1, 'one PR line, not two');
  assert.strictEqual(call(['get', 'pr', ...R]).out, '#456', 'the second value wins');

  // pr: refusals write nothing.
  const beforePrRefusal = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  r = call(['pr', 'set', ...R]);
  assert.ok(!r.ok && /pr set needs a value/.test(r.err), 'pr set with no value refused');
  r = call(['pr', 'set', 'abc', ...R]);
  assert.ok(!r.ok && /pr set value must be a number/.test(r.err), 'pr set with a non-numeric value refused: ' + r.err);
  r = call(['pr', 'zap', 'x', ...R]);
  assert.ok(!r.ok && /unknown pr subcommand.*set\|clear/.test(r.err), 'unknown pr subcommand refused: ' + r.err);
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'),
    beforePrRefusal,
    'nothing written on any pr refusal'
  );

  // pr clear: removes the line and leaves every other byte alone; clearing an absent line still
  // succeeds and changes nothing (the shape a legacy ledger predating this header leaves behind).
  const beforePrClear = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(call(['pr', 'clear', ...R]).ok, 'pr clear');
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'),
    beforePrClear.replace('**PR:** #456\n', ''),
    'the PR line and only the PR line is gone'
  );
  assert.strictEqual(call(['get', 'pr', ...R]).out, 'absent', 'get pr on a ledger with no line');
  const beforeNoopPrClear = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.ok(call(['pr', 'clear', ...R]).ok, 'clearing an absent PR line still succeeds');
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'),
    beforeNoopPrClear,
    'and changes nothing'
  );

  // deploy set/get: `**Deploy:**` records each deploy target's state for the run, so
  // `/superdev:ship` can tell a finished deploy from a failed one and resume where it stopped
  // (INV-0099).
  assert.strictEqual(call(['deploy', 'get', ...R]).out, 'absent', 'deploy get on a ledger with no record');
  assert.ok(call(['deploy', 'set', 'pve', 'deployed', ...R]).ok, 'deploy set pve deployed');
  assert.ok(call(['deploy', 'set', 'proxy', 'failed', '--exit', '2', ...R]).ok, 'deploy set proxy failed --exit 2');
  assert.strictEqual(
    call(['deploy', 'get', ...R]).out,
    'pve deployed\nproxy failed exit 2',
    'deploy get prints both lines, in first-recorded order, with the exit on the failed one'
  );

  // deploy set: setting a target already recorded replaces its state in place, keeping its
  // position, and drops its exit when the new state carries none.
  assert.ok(call(['deploy', 'set', 'proxy', 'deployed', ...R]).ok, 'deploy set proxy deployed');
  assert.strictEqual(
    call(['deploy', 'get', ...R]).out,
    'pve deployed\nproxy deployed',
    'proxy replaced in place, exit dropped'
  );
  const deployText = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  assert.strictEqual((deployText.match(/\*\*Deploy:\*\*/g) || []).length, 1, 'one Deploy line, not two');

  // deploy set: refusals — an unknown state, --exit without failed, a missing target name, a comma
  // in the target name, or an invalid exit code — write nothing.
  const beforeDeployRefusal = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
  r = call(['deploy', 'set', 'pve', 'launched', ...R]);
  assert.ok(!r.ok && /unknown deploy state/.test(r.err), 'unknown deploy state refused: ' + r.err);
  r = call(['deploy', 'set', 'pve', 'deployed', '--exit', '1', ...R]);
  assert.ok(!r.ok && /--exit belongs only with failed/.test(r.err), '--exit without failed refused: ' + r.err);
  r = call(['deploy', 'set', '', 'pending', ...R]);
  assert.ok(!r.ok && /deploy set needs a <target>/.test(r.err), 'missing target name refused: ' + r.err);
  r = call(['deploy', 'set', 'a,b', 'pending', ...R]);
  assert.ok(!r.ok && /must be one word/.test(r.err), 'comma in target name refused: ' + r.err);
  r = call(['deploy', 'set', 'pve', 'failed', '--exit', 'abc', ...R]);
  assert.ok(!r.ok && /--exit value must be a number/.test(r.err), 'non-numeric exit code refused: ' + r.err);
  assert.strictEqual(
    fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'),
    beforeDeployRefusal,
    'nothing written on any deploy refusal'
  );

  // deploy get: a ledger with no deploy record prints "absent" and exits 0 — the same
  // missing-optional-header shape every other header field takes.
  assert.ok(call(['init', 'feat/no-deploy', 'planned'], sliceJson).ok);
  const noDeployRoot = path.join(tmp, '.superdev', 'scopes', 'no-deploy');
  const ND = ['--root', noDeployRoot];
  const rDeploy = call(['deploy', 'get', ...ND]);
  assert.ok(rDeploy.ok && rDeploy.out === 'absent', 'deploy get with no record prints absent and exits 0');

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
  assert.strictEqual(call(['deploy', 'get', ...P]).out, 'absent', 'a ledger predating the Deploy header reads it as absent');
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
  assert.ok(
    st.out.includes('  deploy: pve deployed, proxy deployed'),
    "a shipped scope's deploy record survives the collapse: " + st.out
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
      '**Unresolved:**\n- fix declined by the operator (2026-08-12)\n' +
      '**Deploy:** pve deployed, proxy failed exit 2\n\n' +
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
  assert.ok(stFlight.out.includes('  deploy: pve deployed, proxy failed exit 2'), 'and its deploy record');

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

  // A `submitted` run (issue #682) — the pull request is open and the chain has ended — is still
  // standing (its scopetree and lock exist), so it renders as an ordinary in-flight run, not the
  // `shipped` collapse.
  const submittedStatusRoot = path.join(tmp, '.superdev', 'scopes', 'submitted-status');
  fs.mkdirSync(submittedStatusRoot, { recursive: true });
  fs.writeFileSync(
    path.join(submittedStatusRoot, 'ledger.md'),
    '# Ledger — submitted-status\n\n**Stage:** submitted\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #20 | one | behavior | — | merged | a..b |\n',
    'utf8'
  );
  const stSubmitted = call(['status']);
  assert.ok(
    stSubmitted.out.includes('submitted-status  (1 slices, stage: submitted)'),
    'a submitted run names its stage rather than collapsing: ' + stSubmitted.out
  );

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

  // adopt --shipped: the explicit opt-in recreates a shipped original's run root from its anchor's
  // snapshot (scope-mode.md's `## Adopting a shipped original`, ADR 0124), where plain adopt refuses.
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
  // private copy that could silently diverge (ADR 0022's second-reader lesson) — the same shape as the
  // drift `arg-token` contract, which holds every Bash hook to a require of ./shell-words.js.
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

    // A subdirectory of the main working tree resolves the same run root.
    fs.mkdirSync(path.join(mainRepo, 'sub', 'deep'), { recursive: true });
    assert.strictEqual(
      callIn(['root', 'demo'], path.join(mainRepo, 'sub', 'deep')).out,
      expectedRoot,
      'root resolves the same path from a subdirectory'
    );

    // Inside a submodule the run root lives under the submodule's own checkout, never `.git/modules`.
    const subSource = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-root-subsrc-')));
    gitRoot(['init', '-q', '-b', 'main'], subSource);
    gitRoot(['config', 'user.email', 'test@example.com'], subSource);
    gitRoot(['config', 'user.name', 'test'], subSource);
    fs.writeFileSync(path.join(subSource, 'f.txt'), 'x\n');
    gitRoot(['add', '.'], subSource);
    gitRoot(['commit', '-q', '-m', 'init'], subSource);
    gitRoot(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', subSource, 'vendor/lib'], mainRepo);
    const subCheckout = path.join(mainRepo, 'vendor', 'lib');
    assert.strictEqual(
      callIn(['root', 'demo'], subCheckout).out,
      path.join(subCheckout, '.superdev', 'scopes', 'demo'),
      'root resolves to the submodule checkout from inside a submodule'
    );
    fs.rmSync(subSource, { recursive: true, force: true });

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

    // `staging <scope>` resolves a scope's staging directory in the main working tree from any
    // checkout, and `status` counts the pages staged there from a linked worktree too (ADR 0119,
    // INV-0121).
    const stagingWt = path.join(mainRepo, '..', path.basename(mainRepo) + '-staging-wt');
    gitRoot(['worktree', 'add', '-q', '-b', 'feat/staging-wt', stagingWt], mainRepo);
    const expectedStaging = path.join(mainRepo, '.superdev', 'kb-pending', 'demo');
    fs.mkdirSync(expectedStaging, { recursive: true });
    fs.writeFileSync(path.join(expectedStaging, 'page.md'), '---\ntitle: Page\naction: upsert\n---\nbody\n');
    assert.ok(
      callIn(['status'], stagingWt).out.includes('pending publish: 1 staged page — /superdev:publish-kb demo'),
      'status from a linked worktree reports the pages the main working tree holds',
    );
    const subDir = path.join(stagingWt, 'sub');
    fs.mkdirSync(subDir);
    for (const cwd of [mainRepo, stagingWt, subDir]) {
      assert.strictEqual(callIn(['staging', 'demo'], cwd).out, expectedStaging, `staging resolves the main working tree's directory from ${cwd}`);
    }
    assert.strictEqual(
      callIn(['staging', '_adhoc'], stagingWt).out,
      path.join(mainRepo, '.superdev', 'kb-pending', '_adhoc'),
      'staging accepts the ad-hoc scope',
    );
    for (const bad of [[], [''], ['a/b'], ['a\\b'], ['../escape'], ['.hidden']]) {
      const r3 = callIn(['staging', ...bad], stagingWt);
      assert.ok(!r3.ok && r3.out === '', `staging refuses ${JSON.stringify(bad)} with nothing on stdout`);
    }
    const stagingNoGit = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-staging-nogit-'));
    const ng = callIn(['staging', 'demo'], stagingNoGit);
    assert.ok(!ng.ok && ng.out === '' && /not inside a git repository/.test(ng.err), 'staging refuses outside a git repository: ' + (ng.err || ''));
    fs.rmSync(stagingNoGit, { recursive: true, force: true });
    fs.writeFileSync(path.join(expectedStaging, 'second.md'), 'x\n');
    fs.writeFileSync(path.join(expectedStaging, 'stray.txt'), 'x\n');
    assert.strictEqual(callIn(['staging', 'demo', '--count'], stagingWt).out, '2', '--count counts only the .md pages');
    assert.strictEqual(callIn(['staging', 'absent', '--count'], stagingWt).out, '0', '--count prints 0 for a missing directory');
    assert.ok(!fs.existsSync(path.join(mainRepo, '.superdev', 'scopes', 'absent')), 'staging needs and writes no run root');
    fs.rmSync(stagingWt, { recursive: true, force: true });

    fs.rmSync(mainRepo, { recursive: true, force: true });
  }

  // --- base: the scope's range base — the recorded merged base tip and the rule that picks the newest
  // of it and merge-base(<base>, <branch>) (`references/scope-mode.md` `## The scope's range base`) ---
  {
    const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const callIn = (argv, cwd, stdin) => {
      const logged = [];
      const orig = console.log;
      console.log = (s) => logged.push(String(s));
      try {
        run(argv, cwd, stdin || '');
        return { ok: true, out: logged.join('\n') };
      } catch (e) {
        if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
        throw e;
      } finally {
        console.log = orig;
      }
    };
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-base-')));
    g(['init', '-q', '-b', 'main'], repo);
    g(['config', 'user.email', 'test@example.com'], repo);
    g(['config', 'user.name', 'test'], repo);
    const commit = (file, msg) => {
      fs.writeFileSync(path.join(repo, file), msg + '\n');
      g(['add', '.'], repo);
      g(['commit', '-q', '-m', msg], repo);
      return g(['rev-parse', 'HEAD'], repo);
    };
    const A = commit('a.txt', 'a');
    g(['branch', 'remote'], repo);
    g(['checkout', '-q', 'remote'], repo);
    const T = commit('t.txt', 't');
    const T2 = commit('t2.txt', 't2');
    g(['checkout', '-q', 'main'], repo);
    g(['checkout', '-q', '-b', 'feat/base-demo'], repo);
    commit('own.txt', 'own');

    const sliceJson = JSON.stringify({
      anchor: '#1 — base record',
      slices: [{ id: '01', issue: '#2', title: 'x', type: 'behavior', 'depends-on': '—' }],
    });
    assert.ok(callIn(['init', 'feat/base-demo', 'planned'], repo, sliceJson).ok, 'init for the base fixture');
    const root = path.join(repo, '.superdev', 'scopes', 'base-demo');
    const RT = ['--root', root];
    const resolve = (base) => callIn(['base', 'resolve', '--branch', 'feat/base-demo', '--base', base, ...RT], repo);
    const ledger = () => fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');

    // No record: the merge-base, today's behaviour.
    assert.strictEqual(resolve('main').out, A, 'no record prints merge-base(base, branch)');

    // base set writes the resolved full commit, overwrites rather than adding a second line.
    assert.ok(callIn(['base', 'set', T.slice(0, 8), ...RT], repo).ok, 'base set <short sha>');
    assert.ok(ledger().includes(`**Base:** ${T}`), 'ledger carries the full commit');
    assert.strictEqual((ledger().match(/\*\*Base:\*\*/g) || []).length, 1, 'one Base line');

    // Header order does not depend on write order: PR and Deploy written after Base sit after it.
    assert.ok(callIn(['pr', 'set', '#9', ...RT], repo).ok, 'pr set after base set');
    assert.ok(callIn(['deploy', 'set', 'pve', 'deployed', ...RT], repo).ok, 'deploy set after base set');
    const order = ['Base', 'PR', 'Deploy'].map((n) => ledger().indexOf(`**${n}:**`));
    assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], 'Base, PR, Deploy in that order');

    // base set refuses a value that resolves to no commit, and writes nothing.
    const before = ledger();
    const bad = callIn(['base', 'set', 'not-a-real-sha', ...RT], repo);
    assert.ok(!bad.ok && /does not resolve to a commit/.test(bad.err), 'unresolvable sha refused');
    assert.strictEqual(ledger(), before, 'nothing written on refusal');

    // Record reachable from the branch, local base behind it: the record is newer.
    g(['merge', '-q', '--no-edit', T], repo);
    assert.strictEqual(resolve('main').out, T, 'a recorded tip ahead of the local base wins');

    // Record not reachable from the branch: the merge-base.
    assert.ok(callIn(['base', 'set', T2, ...RT], repo).ok, 'base set T2');
    assert.strictEqual(resolve('main').out, A, 'a record not reachable from the branch is ignored');

    // A record the repository cannot resolve (hand-edited ledger): the merge-base.
    fs.writeFileSync(path.join(root, 'ledger.md'), ledger().replace(/\*\*Base:\*\* .*/, '**Base:** deadbeef'));
    assert.strictEqual(resolve('main').out, A, 'an unresolvable record is ignored');

    // Local base ahead of the record (pulled later): merge-base is newer.
    assert.ok(callIn(['base', 'set', T, ...RT], repo).ok, 'base set T again');
    g(['branch', '-f', 'main', T2], repo);
    g(['merge', '-q', '--no-edit', 'main'], repo);
    assert.strictEqual(resolve('main').out, T2, 'a local base ahead of the record wins');

    // Incomparable: the merge-base and the record both sit on the branch, neither holding the other.
    g(['checkout', '-q', '-b', 'side', A], repo);
    const R = commit('r.txt', 'r');
    g(['checkout', '-q', '-b', 'localbase', A], repo);
    const M = commit('m.txt', 'm');
    g(['checkout', '-q', '-b', 'feat/base-inc', M], repo);
    g(['merge', '-q', '--no-edit', R], repo);
    commit('own2.txt', 'own2');
    assert.ok(callIn(['base', 'set', R, ...RT], repo).ok, 'base set R');
    const inc = callIn(['base', 'resolve', '--branch', 'feat/base-inc', '--base', 'localbase', ...RT], repo);
    assert.strictEqual(inc.out, M, 'incomparable candidates print merge-base(base, branch)');

    // --base and --branch are required.
    assert.ok(!callIn(['base', 'resolve', '--branch', 'feat/base-demo', ...RT], repo).ok, 'resolve needs --base');
    assert.ok(!callIn(['base', 'resolve', '--base', 'main', ...RT], repo).ok, 'resolve needs --branch');

    // publish carries the Base line and adopt reconstructs it.
    assert.ok(callIn(['base', 'set', T, ...RT], repo).ok, 'base set for publish');
    const published = callIn(['publish', ...RT], repo).out;
    assert.ok(published.includes(`**Base:** ${T}`), 'publish carries the Base line');
    const adoptRoot = path.join(repo, 'adopt-check', 'base-demo');
    assert.ok(callIn(['adopt', '--root', adoptRoot], repo, `# Anchor\n\n${published}\n`).ok, 'adopt parses a Base-bearing snapshot');
    assert.ok(
      fs.readFileSync(path.join(adoptRoot, 'ledger.md'), 'utf8').includes(`**Base:** ${T}`),
      'adopt reconstructs the Base line'
    );
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // --- collisions: a numbering collision found by number, never by a git conflict (ADR 0126, INV-0134) ---
  {
    const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-collisions-')));
    const put = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      fs.writeFileSync(path.join(repo, file), text);
    };
    const save = (msg) => {
      g(['add', '.'], repo);
      g(['commit', '-q', '-m', msg], repo);
      return g(['rev-parse', 'HEAD'], repo);
    };
    const register = (...ids) => ids.map((id) => `### INV-${id}\n\nStatement: ${id}.\n`).join('\n');
    g(['init', '-q', '-b', 'main'], repo);
    g(['config', 'user.email', 'test@example.com'], repo);
    g(['config', 'user.name', 'test'], repo);
    put('docs/adr/0001-one.md', '# 0001\n');
    put('ctx/docs/adr/0001-c.md', '# 0001\n');
    put('docs/invariants.md', register('0001'));
    const fork = save('fork point');
    g(['checkout', '-q', '-b', 'scope'], repo);
    put('docs/adr/0002-mine.md', '# 0002\n');
    put('docs/adr/0003-mine2.md', '# 0003\n');
    put('docs/adr/0004-ok.md', '# 0004\n');
    put('docs/adr/0006-same.md', '# 0006\n');
    put('ctx/docs/adr/0003-ctx.md', '# 0003\n');
    put('docs/invariants.md', `${register('0001')}\n### INV-0002\n\nStatement: the scope's own.\n`);
    save('scope work');
    g(['checkout', '-q', 'main'], repo);
    put('docs/adr/0002-base.md', '# 0002\n');
    put('docs/adr/0003-base2.md', '# 0003\n');
    put('docs/adr/0006-same.md', '# 0006 base\n');
    put('ctx/docs/adr/0002-cb.md', '# 0002\n');
    put('docs/invariants.md', register('0001', '0002'));
    save('base work');
    g(['checkout', '-q', '-b', 'other', fork], repo);
    put('docs/adr/0007-other.md', '# 0007\n');
    save('other live run');
    g(['checkout', '-q', 'main'], repo);
    const before = g(['for-each-ref', '--format=%(refname) %(objectname)'], repo);
    const opts = { base: 'main', branch: 'scope', rangeBase: fork, also: [] };

    // A same-number ADR under a different slug collides; each takes its own next free number above
    // every number in that home on both sides; an invariant id collides the same way.
    let found = findCollisions(repo, opts);
    assert.deepEqual(
      found.map((c) => [c.kind, c.home, c.number, c.scopePath, c.basePath, c.next]),
      [
        ['adr', 'docs/adr', '0002', 'docs/adr/0002-mine.md', 'docs/adr/0002-base.md', '0007'],
        ['adr', 'docs/adr', '0003', 'docs/adr/0003-mine2.md', 'docs/adr/0003-base2.md', '0008'],
        ['inv', 'docs/invariants.md', 'INV-0002', 'docs/invariants.md', 'docs/invariants.md', 'INV-0003'],
      ],
      'two ADR collisions with distinct next numbers and one invariant collision — the same path (0006) and a number held only in another ADR directory (ctx 0003) are none'
    );
    // An --also ref (another live plan run) holding the next number pushes the assignment past it.
    found = findCollisions(repo, { ...opts, also: ['other'] });
    assert.deepEqual(found.filter((c) => c.kind === 'adr').map((c) => c.next), ['0008', '0009'], '--also pushes past 0007');
    // Already took in from base: nothing the scope added collides with itself.
    assert.deepEqual(findCollisions(repo, { ...opts, rangeBase: 'scope' }), [], 'nothing added since the range base → no collision');
    assert.equal(g(['for-each-ref', '--format=%(refname) %(objectname)'], repo), before, 'the verb moves no ref');
    assert.equal(g(['status', '--porcelain'], repo), '', 'the verb leaves the working tree clean');

    // The CLI: exit 1 with one line per collision, 0 on none, 2 on an unknown ref naming it.
    const cli = (args) =>
      require('node:child_process').spawnSync(process.execPath, [scopePath, 'collisions', ...args], {
        cwd: repo,
        encoding: 'utf8',
        timeout: 30000,
      });
    let res = cli(['--base', 'main', '--branch', 'scope', '--range-base', fork]);
    assertSpawnDecided(res, 'collisions CLI');
    assert.equal(res.status, 1, 'collisions found → exit 1');
    assert.equal(res.stdout.trim().split('\n').length, 3, 'one line per collision');
    assert.match(res.stdout, /^adr docs\/adr 0002 docs\/adr\/0002-mine\.md docs\/adr\/0002-base\.md next 0007$/m);
    res = cli(['--base', 'main', '--branch', 'scope', '--range-base', 'scope']);
    assertSpawnDecided(res, 'collisions CLI, none');
    assert.equal(res.status, 0, 'nothing collides → exit 0');
    assert.equal(res.stdout, '', 'and prints nothing');
    res = cli(['--base', 'nope', '--branch', 'scope', '--range-base', fork]);
    assertSpawnDecided(res, 'collisions CLI, unknown ref');
    assert.equal(res.status, 2, 'an unknown ref → exit 2, never read as no collision');
    assert.match(res.stderr, /nope/, 'naming the ref');
    res = cli(['--base', 'main', '--branch', 'scope']);
    assertSpawnDecided(res, 'collisions CLI, missing flag');
    assert.equal(res.status, 2, 'a missing --range-base → exit 2');
    for (const flag of ['--base', '--branch', '--range-base']) {
      res = cli(['--base', 'main', '--branch', 'scope', '--range-base', fork, flag, 'main']);
      assertSpawnDecided(res, `collisions CLI, repeated ${flag}`);
      assert.equal(res.status, 2, `a repeated ${flag} → exit 2`);
      assert.match(res.stderr, new RegExp(flag), `naming ${flag}`);
    }
    // A flag followed by another flag has no value: the usage error names the flag missing it.
    res = cli(['--base', '--branch', 'scope', '--range-base', fork]);
    assertSpawnDecided(res, 'collisions CLI, flag as a value');
    assert.equal(res.status, 2, 'a flag where a value belongs → exit 2');
    assert.match(res.stderr, /--base needs a value/, 'naming --base');

    // A repository with no ADR directory and no invariant register has nothing to compare.
    const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-collisions-bare-')));
    g(['init', '-q', '-b', 'main'], bare);
    g(['config', 'user.email', 'test@example.com'], bare);
    g(['config', 'user.name', 'test'], bare);
    fs.writeFileSync(path.join(bare, 'README.md'), 'x\n');
    g(['add', '.'], bare);
    g(['commit', '-q', '-m', 'only a readme'], bare);
    assert.deepEqual(findCollisions(bare, { base: 'main', branch: 'main', rangeBase: 'main', also: [] }), [], 'no ADR directory, no register → none');
    fs.rmSync(bare, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });

    // A fresh fork for the edge cases: `scope` and `main` each diverge from `fork` once.
    const edge = (fork, onScope, onBase) => {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-collisions-edge-')));
      const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
      };
      const commit = (step) => {
        step(dir, write);
        g(['add', '-A'], dir);
        g(['commit', '-q', '--allow-empty', '-m', 'step'], dir);
        return g(['rev-parse', 'HEAD'], dir);
      };
      g(['init', '-q', '-b', 'main'], dir);
      g(['config', 'user.email', 'test@example.com'], dir);
      g(['config', 'user.name', 'test'], dir);
      const forkSha = commit(fork);
      g(['checkout', '-q', '-b', 'scope'], dir);
      commit(onScope);
      g(['checkout', '-q', 'main'], dir);
      commit(onBase);
      const got = findCollisions(dir, { base: 'main', branch: 'scope', rangeBase: forkSha, also: [] });
      fs.rmSync(dir, { recursive: true, force: true });
      return got.map((c) => [c.kind, c.number, c.scopePath, c.basePath]);
    };

    // An ADR the scope renumbers by rename is added under its new number, whatever diff.renames says.
    assert.deepEqual(
      edge(
        (d, w) => w('docs/adr/0001-x.md', '# x\n'),
        (d) => g(['mv', 'docs/adr/0001-x.md', 'docs/adr/0002-x.md'], d),
        (d, w) => w('docs/adr/0002-base.md', '# base\n')
      ),
      [['adr', '0002', 'docs/adr/0002-x.md', 'docs/adr/0002-base.md']],
      'a renamed-into number collides like an added one'
    );
    // A slug-only rename keeps its own number: the old path it left behind on base is no partner.
    assert.deepEqual(
      edge(
        (d, w) => w('docs/adr/0002-old-title.md', '# old\n'),
        (d) => g(['mv', 'docs/adr/0002-old-title.md', 'docs/adr/0002-new-title.md'], d),
        () => {}
      ),
      [],
      'a slug-only rename of an existing ADR is no collision'
    );
    // Both sides rename one ADR's slug to two different paths: two files at one number, so it collides.
    assert.deepEqual(
      edge(
        (d, w) => w('docs/adr/0002-foo.md', '# foo\n'),
        (d) => g(['mv', 'docs/adr/0002-foo.md', 'docs/adr/0002-bar.md'], d),
        (d) => g(['mv', 'docs/adr/0002-foo.md', 'docs/adr/0002-foo2.md'], d)
      ),
      [['adr', '0002', 'docs/adr/0002-bar.md', 'docs/adr/0002-foo2.md']],
      'a slug rename to two different paths on both sides of one ADR collides'
    );
    // "Same ADR" means one side kept the range base's path, never one number: the scope removing an
    // ADR at a number hides no other base ADR at that number.
    const dropFoo = (d) => g(['rm', '-q', 'docs/adr/0001-foo.md'], d);
    const foo = (d, w) => w('docs/adr/0001-foo.md', '# foo\n');
    const scopeNew = (d, w) => {
      dropFoo(d);
      w('docs/adr/0001-new.md', '# new scope decision\n');
    };
    assert.deepEqual(
      edge(foo, scopeNew, (d, w) => {
        dropFoo(d);
        w('docs/adr/0001-y.md', '# y base decision\n');
      }),
      [['adr', '0001', 'docs/adr/0001-new.md', 'docs/adr/0001-y.md']],
      'both sides delete one ADR and add a different one at its number → collision'
    );
    assert.deepEqual(
      edge(foo, scopeNew, (d) => g(['mv', 'docs/adr/0001-foo.md', 'docs/adr/0001-bar.md'], d)),
      [['adr', '0001', 'docs/adr/0001-new.md', 'docs/adr/0001-bar.md']],
      'a base slug rename of the ADR the scope deleted still collides with the scope new ADR'
    );
    assert.deepEqual(
      edge(foo, scopeNew, (d, w) => {
        g(['mv', 'docs/adr/0001-foo.md', 'docs/adr/0003-foo.md'], d);
        w('docs/adr/0001-y.md', '# y base decision\n');
      }),
      [['adr', '0001', 'docs/adr/0001-new.md', 'docs/adr/0001-y.md']],
      'a base ADR new at the number the scope vacated collides'
    );
    // Rename similarity hides no collision: three ADRs on one template pair by git's rename detection,
    // yet the scope's and base's replacements of a deleted ADR are two different ADRs at one number.
    const templated = (title) =>
      `# 0001: ${title}\n\n**Status:** Accepted\n\n## Context\n\nThe plugin needs a rule here.\nEvery caller reads it.\nIt stays stable.\n\n` +
      `## Decision\n\nAdopt the rule for ${title}.\nApply it everywhere.\n\n## Consequences\n\nCallers follow the rule.\nThe suite pins it.\n`;
    assert.deepEqual(
      edge(
        (d, w) => w('docs/adr/0001-foo.md', templated('foo')),
        (d, w) => {
          dropFoo(d);
          w('docs/adr/0001-new.md', templated('new'));
        },
        (d, w) => {
          dropFoo(d);
          w('docs/adr/0001-y.md', templated('y'));
        }
      ),
      [['adr', '0001', 'docs/adr/0001-new.md', 'docs/adr/0001-y.md']],
      'two templated replacements of one deleted ADR collide, though rename detection pairs each with it'
    );
    // The scope replacing an ADR base left untouched is no collision: after the merge only the scope's
    // file holds the number.
    assert.deepEqual(edge(foo, scopeNew, () => {}), [], 'the scope replacing an ADR base kept is no collision');
    // A non-ASCII slug reads verbatim, never as a quoted path that matches no ADR file.
    assert.deepEqual(
      edge(() => {}, (d, w) => w('docs/adr/0002-größe.md', '# ä\n'), (d, w) => w('docs/adr/0002-base.md', '# base\n')),
      [['adr', '0002', 'docs/adr/0002-größe.md', 'docs/adr/0002-base.md']],
      'a non-ASCII slug collides'
    );
    // An invariant entry the scope took in from base, read against a stale range base, is no collision.
    const inv = (id, text) => (d, w) => w('docs/invariants.md', `### INV-0001\n\nStatement: 1.\n${id ? `\n### INV-${id}\n\n${text}\n` : ''}`);
    assert.deepEqual(edge(inv(), inv('0002', 'Statement: 2.'), inv('0002', 'Statement: 2.')), [], 'an identical entry on both sides is no collision');
  }

  // --- suite: the suite record, the last full-suite run's result and the commit it ran on
  // (`references/scope-mode.md` `## The ledger`, INV-0017) ---------------------------------------
  {
    function gitSuite(args, cwd) {
      execFileSync('git', args, { cwd, stdio: 'ignore' });
    }
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

    const suiteRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-suite-')));
    gitSuite(['init', '-q', '-b', 'main'], suiteRepo);
    gitSuite(['config', 'user.email', 'test@example.com'], suiteRepo);
    gitSuite(['config', 'user.name', 'test'], suiteRepo);
    fs.writeFileSync(path.join(suiteRepo, 'README.md'), 'x\n');
    gitSuite(['add', '.'], suiteRepo);
    gitSuite(['commit', '-q', '-m', 'init'], suiteRepo);
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();

    const suiteSliceJson = JSON.stringify({
      anchor: '#1 — suite record',
      slices: [{ id: '01', issue: '#2', title: 'x', type: 'behavior', 'depends-on': '—' }],
    });
    assert.ok(
      callIn(['init', 'feat/suite-demo', 'planned'], suiteRepo, suiteSliceJson).ok,
      'init for the suite fixture'
    );
    const suiteRoot = path.join(suiteRepo, '.superdev', 'scopes', 'suite-demo');
    const SR = ['--root', suiteRoot];

    // suite set: writes the header line, and get suite prints it back.
    assert.ok(callIn(['suite', 'set', 'green', sha, ...SR], suiteRepo).ok, 'suite set green');
    const suiteText = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
    assert.ok(new RegExp(`\\*\\*Suite:\\*\\* green @ ${sha}`).test(suiteText), 'ledger carries the Suite line');
    assert.strictEqual(callIn(['get', 'suite', ...SR], suiteRepo).out, `green ${sha}`, 'get suite prints result and sha');

    // suite set: a second write overwrites rather than adding a second line.
    assert.ok(callIn(['suite', 'set', 'red', sha, ...SR], suiteRepo).ok, 'suite set red');
    const suiteTwice = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
    assert.strictEqual((suiteTwice.match(/\*\*Suite:\*\*/g) || []).length, 1, 'one Suite line, not two');
    assert.strictEqual(callIn(['get', 'suite', ...SR], suiteRepo).out, `red ${sha}`, 'the second write wins');

    // suite set: an unknown result is refused, and writes nothing.
    const beforeUnknownResult = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
    let r = callIn(['suite', 'set', 'yellow', sha, ...SR], suiteRepo);
    assert.ok(!r.ok && /unknown suite result "yellow"/.test(r.err), 'unknown suite result refused: ' + (r.err || ''));
    assert.strictEqual(
      fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8'),
      beforeUnknownResult,
      'nothing written on an unknown-result refusal'
    );

    // suite set: a sha that resolves to no commit in this repository is refused, and writes nothing.
    r = callIn(['suite', 'set', 'green', 'not-a-real-sha', ...SR], suiteRepo);
    assert.ok(
      !r.ok && /does not resolve to a commit/.test(r.err),
      'a sha that does not resolve is refused: ' + (r.err || '')
    );
    assert.strictEqual(
      fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8'),
      beforeUnknownResult,
      'nothing written on an unresolved-sha refusal'
    );

    // get suite: on a ledger with no record, prints nothing and exits zero.
    const noSuiteRoot = path.join(suiteRepo, '.superdev', 'scopes', 'suite-demo-none');
    fs.mkdirSync(noSuiteRoot, { recursive: true });
    fs.writeFileSync(
      path.join(noSuiteRoot, 'ledger.md'),
      '# Ledger — suite-demo-none\n\n**Stage:** implementing\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n',
      'utf8'
    );
    const noSuite = callIn(['get', 'suite', '--root', noSuiteRoot], suiteRepo);
    assert.ok(noSuite.ok && noSuite.out === '', 'get suite on a ledger with no record prints nothing and exits zero');

    // A ledger carrying the Suite line still parses for every existing verb.
    assert.strictEqual(callIn(['get', 'stage', ...SR], suiteRepo).out, 'planned', 'get stage still parses');
    assert.ok(callIn(['slice', '01', 'merged', ...SR], suiteRepo).ok, 'slice still parses');
    assert.ok(callIn(['publish', ...SR], suiteRepo).out.includes('**Suite:** red'), 'publish still parses, and carries the Suite line');
    const publishedSuite = callIn(['publish', ...SR], suiteRepo).out;
    // adopt matches its run-root basename against the payload's branch slug (ADR 0042), which is
    // still "suite-demo" — parked outside .superdev/scopes/ so it never collides with suiteRoot above.
    const adoptRoot = path.join(suiteRepo, 'adopt-check', 'suite-demo');
    const adopted = callIn(
      ['adopt', '--root', adoptRoot],
      suiteRepo,
      `# Anchor\n\n${publishedSuite}\n`
    );
    assert.ok(adopted.ok, 'adopt still parses a Suite-bearing snapshot: ' + (adopted.err || ''));
    assert.strictEqual(
      callIn(['get', 'suite', '--root', adoptRoot], suiteRepo).out,
      'red ' + sha,
      'adopt reconstructs the Suite line'
    );

    // suite set: a ref like HEAD records the resolved full commit, not the literal ref — a later
    // reuse compares the recorded sha against the scope branch's tip sha (INV-0017), and "HEAD"
    // never string-matches a real tip sha.
    assert.ok(callIn(['suite', 'set', 'green', 'HEAD', ...SR], suiteRepo).ok, 'suite set green HEAD');
    assert.strictEqual(
      callIn(['get', 'suite', ...SR], suiteRepo).out,
      `green ${sha}`,
      'HEAD resolves to the full commit, not the literal ref'
    );

    // suite set: a short sha also records the full commit.
    const shortSha = sha.slice(0, 8);
    assert.ok(callIn(['suite', 'set', 'green', shortSha, ...SR], suiteRepo).ok, 'suite set green <short sha>');
    assert.strictEqual(
      callIn(['get', 'suite', ...SR], suiteRepo).out,
      `green ${sha}`,
      'a short sha resolves to the full commit'
    );

    // suite set: a record made against the current tip no longer matches once the branch moves on —
    // the recorded sha stays put, the new HEAD is what changed.
    fs.writeFileSync(path.join(suiteRepo, 'README.md'), 'x\ny\n');
    gitSuite(['add', '.'], suiteRepo);
    gitSuite(['commit', '-q', '-m', 'second'], suiteRepo);
    const newSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
    assert.notStrictEqual(
      callIn(['get', 'suite', ...SR], suiteRepo).out,
      `green ${newSha}`,
      'the recorded sha no longer equals the new HEAD'
    );

    // suite set: no <sha> argument is refused, and writes nothing.
    const beforeNoSha = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
    r = callIn(['suite', 'set', 'green', ...SR], suiteRepo);
    assert.ok(!r.ok && /needs a <sha>/.test(r.err), 'suite set with no sha is refused: ' + (r.err || ''));
    assert.strictEqual(
      fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8'),
      beforeNoSha,
      'nothing written on a missing-sha refusal'
    );

    // The run trace backs reuse (ADR 0117, INV-0017): `traceRun` records one run line for a root.
    const traceRun = (rt, kind, result, sha, tree) =>
      appendTrace(rt, { kind: 'run', fields: [kind, result, sha, tree] });

    // suite reusable: a green record on the exact tip is reusable (path-scoped reuse, INV-0017).
    assert.ok(callIn(['suite', 'set', 'green', newSha, ...SR], suiteRepo).ok, 'suite set green newSha');
    // No trace file: not reusable, so the caller runs the suite again.
    r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
    assert.ok(!r.ok && /no full or whole run recorded/.test(r.err), 'a green record with no trace is not reusable: ' + (r.err || ''));
    traceRun(suiteRoot, 'full', 'pass', 'f'.repeat(40), 'clean');
    r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
    assert.ok(!r.ok && /no full or whole run recorded/.test(r.err), 'a run line at another sha does not back reuse: ' + (r.err || ''));
    traceRun(suiteRoot, 'full', 'pass', newSha, 'dirty');
    r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
    assert.ok(!r.ok && /dirty/.test(r.err), 'a dirty tree is not reusable: ' + (r.err || ''));
    traceRun(suiteRoot, 'full', 'pass', newSha, 'unknown');
    assert.ok(!callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok, 'an unknown tree is not reusable');
    traceRun(suiteRoot, 'full', 'unknown', newSha, 'clean');
    assert.ok(!callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok, 'an unknown result is not reusable');
    traceRun(suiteRoot, 'full', 'pass', newSha, 'clean');
    assert.ok(
      callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok,
      'a green record on the exact tip is reusable'
    );

    // suite reusable: `--branch` also takes a literal sha, not only a branch name — `/superdev:ship`'s
    // own hand-merge adoption passes the merged pull request's `head.sha` this way. A sha resolves to
    // itself and answers by the recorded sha exactly like a branch name resolving to the same tip.
    assert.ok(
      callIn(['suite', 'reusable', '--branch', newSha, ...SR], suiteRepo).ok,
      'a green record is reusable against its own sha passed literally, not only a branch name'
    );
    traceRun(suiteRoot, 'full', 'fail', newSha, 'clean');
    r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
    assert.ok(!r.ok && /is fail/.test(r.err), 'a later fail run defeats reuse: ' + (r.err || ''));
    traceRun(suiteRoot, 'full', 'pass', newSha, 'clean');

    // suite reusable: a green record on an earlier commit is not reusable when no test run at the new
    // tip backs the Markdown-only carry, even when every path changed since lies under
    // `docs/plans/<branch>/` — no store commits its own records on the scope branch (INV-0017, ADR 0110,
    // ADR 0128).
    const planDir = path.join('docs', 'plans', 'feat', 'suite-demo');
    fs.mkdirSync(path.join(suiteRepo, planDir), { recursive: true });
    fs.writeFileSync(path.join(suiteRepo, planDir, '01-tick.md'), 'ticked\n');
    gitSuite(['add', '.'], suiteRepo);
    gitSuite(['commit', '-q', '-m', 'tick'], suiteRepo);
    r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
    assert.ok(
      !r.ok && /predates tip/.test(r.err),
      'a record on an earlier commit is not reusable without a run at the tip: ' + (r.err || '')
    );

    // suite reusable: `--plan-files` is not a flag, so it is refused like any unrecognized
    // argument, naming it.
    r = callIn(['suite', 'reusable', '--branch', 'main', '--plan-files', ...SR], suiteRepo);
    assert.ok(!r.ok && /--plan-files/.test(r.err), 'a leftover --plan-files is refused, naming it: ' + (r.err || ''));
    assert.ok(callIn(['suite', 'set', 'green', 'HEAD', ...SR], suiteRepo).ok, 'suite set green HEAD');
    r = callIn(['suite', 'reusable', '--branch', 'main', '--plan-files', ...SR], suiteRepo);
    assert.ok(!r.ok && /--plan-files/.test(r.err), 'a leftover --plan-files is refused on the exact tip too: ' + (r.err || ''));

    // suite reusable: a non-green record is never reusable, whatever changed.
    assert.ok(callIn(['suite', 'set', 'red', newSha, ...SR], suiteRepo).ok, 'suite set red for the non-green case');
    r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
    assert.ok(!r.ok && /not green/.test(r.err), 'a red record is not reusable: ' + (r.err || ''));

    // suite reusable: no record at all is not reusable.
    r = callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo);
    assert.ok(!r.ok && /no suite record/.test(r.err), 'no suite record is not reusable: ' + (r.err || ''));

    // --- suite record kind: `whole` marks a run of the whole-repo command (ADR 0105, INV-0017) -----
    const wholeTip = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();

    // suite set --whole: writes the trailing " whole" marker, and get suite reports it.
    assert.ok(callIn(['suite', 'set', 'green', wholeTip, '--whole', ...SR], suiteRepo).ok, 'suite set green --whole');
    assert.strictEqual(
      callIn(['get', 'suite', ...SR], suiteRepo).out,
      `green ${wholeTip} whole`,
      'get suite reports the whole kind'
    );

    // suite reusable --whole: a green whole record on the exact tip is reusable through --whole, backed
    // only by a `whole` run line.
    traceRun(suiteRoot, 'full', 'pass', wholeTip, 'clean');
    r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
    assert.ok(!r.ok && /no whole run recorded/.test(r.err), 'a full run line does not satisfy --whole: ' + (r.err || ''));
    traceRun(suiteRoot, 'whole', 'pass', wholeTip, 'clean');
    assert.ok(
      callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo).ok,
      'a whole record is reusable through --whole'
    );

    // suite reusable: a whole run line at the tip satisfies a plain check (full or whole kind accepted).
    assert.ok(
      callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok,
      'a whole run line backs a plain reusable check'
    );

    // suite set (no --whole): a green record with no kind fails a --whole check, naming the missing
    // kind, but still satisfies a plain check.
    assert.ok(callIn(['suite', 'set', 'green', wholeTip, ...SR], suiteRepo).ok, 'suite set green, no kind');
    r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
    assert.ok(!r.ok && /kind/.test(r.err), 'a record with no kind fails a --whole check, naming the kind: ' + (r.err || ''));
    assert.ok(
      callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok,
      'the same record still satisfies a plain reusable check'
    );

    // suite reusable --whole: a red whole record is never reusable, with or without --whole, and
    // get suite shows it as red and whole.
    assert.ok(callIn(['suite', 'set', 'red', wholeTip, '--whole', ...SR], suiteRepo).ok, 'suite set red --whole');
    r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
    assert.ok(!r.ok && /not green/.test(r.err), 'a red whole record is not reusable with --whole: ' + (r.err || ''));
    r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
    assert.ok(!r.ok && /not green/.test(r.err), 'a red whole record is not reusable without --whole: ' + (r.err || ''));
    assert.strictEqual(
      callIn(['get', 'suite', ...SR], suiteRepo).out,
      `red ${wholeTip} whole`,
      'get suite shows the record as red and whole'
    );

    // suite reusable --whole: a green whole record on an earlier commit is not reusable either.
    assert.ok(
      callIn(['suite', 'set', 'green', wholeTip, '--whole', ...SR], suiteRepo).ok,
      'suite set green --whole for the earlier-commit case'
    );
    fs.writeFileSync(path.join(suiteRepo, planDir, 'another-tick.md'), 'ticked again\n');
    gitSuite(['add', '.'], suiteRepo);
    gitSuite(['commit', '-q', '-m', 'tick again'], suiteRepo);
    r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
    assert.ok(
      !r.ok && /predates tip/.test(r.err),
      'a whole record on an earlier commit is not reusable with --whole: ' + (r.err || '')
    );

    // suite set: an unrecognized flag (a mistyped `--whole`) is refused, naming it, and writes nothing —
    // it must never silently produce a no-kind record that a later `--whole` check trusts.
    const beforeUnknownFlag = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
    r = callIn(['suite', 'set', 'green', wholeTip, '--wholee', ...SR], suiteRepo);
    assert.ok(!r.ok && /--wholee/.test(r.err), 'suite set refuses an unrecognized flag, naming it: ' + (r.err || ''));
    assert.strictEqual(
      fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8'),
      beforeUnknownFlag,
      'nothing written on an unrecognized-flag refusal'
    );

    // suite reusable: an unrecognized flag is refused the same way, naming it, and writes nothing (it
    // touches no ledger regardless, but the refusal itself must still happen).
    r = callIn(['suite', 'reusable', '--branch', 'main', '--wholee', ...SR], suiteRepo);
    assert.ok(!r.ok && /--wholee/.test(r.err), 'suite reusable refuses an unrecognized flag, naming it: ' + (r.err || ''));

    // suite reusable: a malformed record (garbage trailing the recognized `<result> @ <sha>[ whole]`
    // shape) is refused, and the unrecognized-flag refusals above already cover an unknown flag —
    // none of these writes to the ledger.
    const malformedRoot = path.join(suiteRepo, '.superdev', 'scopes', 'malformed-suite-demo');
    fs.mkdirSync(malformedRoot, { recursive: true });
    fs.writeFileSync(
      path.join(malformedRoot, 'ledger.md'),
      '# Ledger — malformed-suite-demo\n\n**Stage:** merged\n' +
        `**Suite:** green @ ${wholeTip} whole extra\n` +
        '**Anchor:** #1 — malformed\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n',
      'utf8'
    );
    const beforeMalformed = fs.readFileSync(path.join(malformedRoot, 'ledger.md'), 'utf8');
    r = callIn(['suite', 'reusable', '--branch', 'main', '--root', malformedRoot], suiteRepo);
    assert.ok(!r.ok && /unreadable suite record/.test(r.err), 'a malformed record is refused: ' + (r.err || ''));
    assert.strictEqual(
      fs.readFileSync(path.join(malformedRoot, 'ledger.md'), 'utf8'),
      beforeMalformed,
      'nothing written on a malformed-record refusal'
    );

    // A ledger written before this change carries a Suite line with no kind, and reads back unchanged:
    // get suite reports the record with no kind, and it is reusable without --whole.
    const currentTip = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
    const preFeatureRoot = path.join(suiteRepo, '.superdev', 'scopes', 'pre-feature-suite-demo');
    fs.mkdirSync(preFeatureRoot, { recursive: true });
    traceRun(preFeatureRoot, 'full', 'pass', currentTip, 'clean');
    fs.writeFileSync(
      path.join(preFeatureRoot, 'ledger.md'),
      '# Ledger — pre-feature-suite-demo\n\n**Stage:** merged\n**Branch:** feat/pre-feature-suite-demo\n' +
        `**Suite:** green @ ${currentTip}\n` +
        '**Anchor:** #1 — pre-feature\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n',
      'utf8'
    );
    assert.strictEqual(
      callIn(['get', 'suite', '--root', preFeatureRoot], suiteRepo).out,
      `green ${currentTip}`,
      'a pre-existing ledger reads back unchanged, with no kind'
    );
    assert.ok(
      callIn(['suite', 'reusable', '--branch', 'main', '--root', preFeatureRoot], suiteRepo).ok,
      'a pre-existing no-kind record is reusable without --whole'
    );

    // suite reusable: a whole run line alone backs a plain check (no full run needed).
    // RED test: this should pass once the filter accepts both full and whole kinds for plain checks.
    const wholeOnlyRoot = path.join(suiteRepo, '.superdev', 'scopes', 'whole-only-suite-demo');
    fs.mkdirSync(wholeOnlyRoot, { recursive: true });
    const wholeOnlySha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
    traceRun(wholeOnlyRoot, 'whole', 'pass', wholeOnlySha, 'clean');
    fs.writeFileSync(
      path.join(wholeOnlyRoot, 'ledger.md'),
      '# Ledger — whole-only-suite-demo\n\n**Stage:** merged\n**Branch:** main\n' +
        `**Suite:** green @ ${wholeOnlySha} whole\n` +
        '**Anchor:** #1 — whole-only\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n',
      'utf8'
    );
    assert.ok(
      callIn(['suite', 'reusable', '--branch', 'main', '--root', wholeOnlyRoot], suiteRepo).ok,
      'a whole run line alone backs a plain check'
    );

    // suite reusable: a later focused run does not affect plain or --whole decision.
    const focusedRoot = path.join(suiteRepo, '.superdev', 'scopes', 'focused-suite-demo');
    fs.mkdirSync(focusedRoot, { recursive: true });
    const focusedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
    traceRun(focusedRoot, 'whole', 'pass', focusedSha, 'clean');
    traceRun(focusedRoot, 'focused', 'fail', focusedSha, 'clean');
    fs.writeFileSync(
      path.join(focusedRoot, 'ledger.md'),
      '# Ledger — focused-suite-demo\n\n**Stage:** merged\n**Branch:** main\n' +
        `**Suite:** green @ ${focusedSha} whole\n` +
        '**Anchor:** #1 — focused\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n',
      'utf8'
    );
    assert.ok(
      callIn(['suite', 'reusable', '--branch', 'main', '--root', focusedRoot], suiteRepo).ok,
      'a later focused fail does not defeat plain reuse'
    );
    assert.ok(
      callIn(['suite', 'reusable', '--branch', 'main', '--whole', '--root', focusedRoot], suiteRepo).ok,
      'a later focused fail does not defeat --whole reuse'
    );

    // suite reusable --whole: a later whole fail defeats --whole reuse.
    const wholeFailRoot = path.join(suiteRepo, '.superdev', 'scopes', 'whole-fail-suite-demo');
    fs.mkdirSync(wholeFailRoot, { recursive: true });
    const wholeFailSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
    traceRun(wholeFailRoot, 'whole', 'pass', wholeFailSha, 'clean');
    traceRun(wholeFailRoot, 'whole', 'fail', wholeFailSha, 'clean');
    fs.writeFileSync(
      path.join(wholeFailRoot, 'ledger.md'),
      '# Ledger — whole-fail-suite-demo\n\n**Stage:** merged\n**Branch:** main\n' +
        `**Suite:** green @ ${wholeFailSha} whole\n` +
        '**Anchor:** #1 — whole-fail\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n',
      'utf8'
    );
    r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', '--root', wholeFailRoot], suiteRepo);
    assert.ok(!r.ok && /is fail/.test(r.err), 'a later whole fail defeats --whole reuse: ' + (r.err || ''));

    // suite reusable: a later fail of any kind defeats a plain check (latest run of either kind decides).
    const mixedKindsRoot = path.join(suiteRepo, '.superdev', 'scopes', 'mixed-kinds-suite-demo');
    fs.mkdirSync(mixedKindsRoot, { recursive: true });
    const mixedKindsSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
    traceRun(mixedKindsRoot, 'full', 'pass', mixedKindsSha, 'clean');
    traceRun(mixedKindsRoot, 'whole', 'fail', mixedKindsSha, 'clean');
    fs.writeFileSync(
      path.join(mixedKindsRoot, 'ledger.md'),
      '# Ledger — mixed-kinds-suite-demo\n\n**Stage:** merged\n**Branch:** main\n' +
        `**Suite:** green @ ${mixedKindsSha}\n` +
        '**Anchor:** #1 — mixed-kinds\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n',
      'utf8'
    );
    r = callIn(['suite', 'reusable', '--branch', 'main', '--root', mixedKindsRoot], suiteRepo);
    assert.ok(!r.ok && /is fail/.test(r.err), 'a later whole fail defeats a plain check (latest of either kind): ' + (r.err || ''));

    fs.rmSync(suiteRepo, { recursive: true, force: true });
  }

  // --- isTestPath: the one test-path classifier (ADR 0128) ---------------------------------------
  //
  // Its globs: `*` stays in a segment, `**` crosses them, a slash anchors, a malformed entry is
  // skipped, and a section with no usable entry falls back to the defaults.
  {
    const paths = (...g) => '## Test paths\n\n' + g.map((e) => '- `' + e + '`').join('\n') + '\n';
    assert.ok(isTestPath('', 'a/b/x.test.js') && isTestPath('', 'tests/x.js') && !isTestPath(paths('tests/'), 'src/tests/x.js'));
    assert.ok(isTestPath(paths('lib/**/*.t.js'), 'lib/q/r.t.js') && !isTestPath(paths('lib/*.t.js'), 'lib/q/r.t.js'));
    assert.ok(!isTestPath(paths('/abs/**'), 'abs/x.js') && isTestPath(paths('/abs/**'), 'tests/x.js'), 'a malformed sole entry falls back to the defaults');
    assert.ok(isTestPath(paths('bad entry', 'lib/*.t.js'), 'lib/r.t.js') && !isTestPath(paths('bad entry', 'lib/*.t.js'), 'tests/x.js'), 'a malformed entry is skipped');
  }

  // --- suite reusable: a green record carries across Markdown-only commits (ADR 0128, INV-0017) ----
  {
    const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const callIn = (argv, cwd) => {
      const orig = console.log;
      const logged = [];
      console.log = (s) => logged.push(String(s));
      try {
        run(argv, cwd, '');
        return { ok: true, out: logged.join('\n') };
      } catch (e) {
        if (e.isRefusal) return { ok: false, err: e.message };
        throw e;
      } finally {
        console.log = orig;
      }
    };
    const traceRun = (rt, kind, result, sha, tree) => appendTrace(rt, { kind: 'run', fields: [kind, result, sha, tree] });

    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-carry-')));
    try {
    g(['init', '-q', '-b', 'main'], repo);
    g(['config', 'user.email', 'test@example.com'], repo);
    g(['config', 'user.name', 'test'], repo);
    fs.writeFileSync(path.join(repo, '.gitignore'), '.superdev/\n');
    fs.writeFileSync(path.join(repo, 'a.js'), 'x\n');
    g(['add', '.'], repo);
    g(['commit', '-q', '-m', 'code'], repo);
    const R = g(['rev-parse', 'HEAD'], repo);
    // Each case gets its own root: a ledger with a record at `sha`, and the given trace lines.
    let n = 0;
    const root = (record, lines) => {
      const rt = path.join(repo, '.superdev', 'scopes', `carry-${++n}`);
      fs.mkdirSync(rt, { recursive: true });
      fs.writeFileSync(
        path.join(rt, 'ledger.md'),
        `# Ledger — carry-${n}\n\n**Stage:** documented\n**Branch:** main\n**Suite:** ${record}\n**Anchor:** #1 — carry\n\n` +
          '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n',
        'utf8'
      );
      for (const l of lines) traceRun(rt, ...l);
      return rt;
    };
    const commit = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      fs.writeFileSync(path.join(repo, file), text);
      g(['add', '-A'], repo);
      g(['commit', '-q', '-m', file], repo);
      return g(['rev-parse', 'HEAD'], repo);
    };
    const reusable = (rt, ...flags) => callIn(['suite', 'reusable', '--branch', 'main', ...flags, '--root', rt], repo);

    // The reproduction: a green full record at R, one README.md commit to T, a focused pass at T.
    // ADR 0128's accepted ceiling: any passing focused run at T carries the record, whatever paths it
    // covered. The trace's run line names no covered paths, so `suite reusable` cannot check the run
    // spanned R..T; the documentation step's own range rule is what makes it do so.
    const T = commit('README.md', 'doc\n');
    let r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'clean'], ['focused', 'pass', T, 'clean']]));
    assert.ok(r.ok && r.out === 'reusable', 'a green record carries across a Markdown-only commit: ' + (r.err || ''));

    // The kind carries: a `whole` record at R satisfies --whole at T; a record with no kind still fails it.
    r = reusable(root(`green @ ${R} whole`, [['whole', 'pass', R, 'clean'], ['focused', 'pass', T, 'clean']]), '--whole');
    assert.ok(r.ok, 'a whole record carries and satisfies --whole: ' + (r.err || ''));
    r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'clean'], ['focused', 'pass', T, 'clean']]), '--whole');
    assert.ok(!r.ok && /kind/.test(r.err), 'a carried record with no kind still fails --whole: ' + (r.err || ''));

    // R must be backed by its own full or whole pass on a clean tree, as on the exact tip.
    r = reusable(root(`green @ ${R}`, [['focused', 'pass', R, 'clean'], ['focused', 'pass', T, 'clean']]));
    assert.ok(!r.ok && new RegExp(`no full or whole run recorded at ${R}`).test(r.err), 'a focused run at R backs nothing: ' + (r.err || ''));
    r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'dirty'], ['focused', 'pass', T, 'clean']]));
    assert.ok(!r.ok && /dirty/.test(r.err), 'a dirty full run at R backs nothing: ' + (r.err || ''));

    // The run at T: absent, failed, unknown, or on a dirty tree refuses.
    const backed = [['full', 'pass', R, 'clean']];
    for (const [lines, re, what] of [
      [[], /no test run recorded at the tip/, 'no run at T'],
      [[['focused', 'fail', T, 'clean']], /focused run at the tip is fail/, 'a failed run at T'],
      [[['focused', 'unknown', T, 'clean']], /is unknown/, 'an unknown run at T'],
      [[['focused', 'pass', T, 'dirty']], /dirty tree/, 'a dirty run at T'],
      [[['focused', 'pass', T, 'clean'], ['focused', 'fail', T, 'clean']], /is fail/, 'a later failed run at T'],
    ]) {
      r = reusable(root(`green @ ${R}`, [...backed, ...lines]));
      assert.ok(!r.ok && /predates tip/.test(r.err) && re.test(r.err), `${what} refuses: ${r.err || ''}`);
    }

    // The path guard: every path changed since R ends in `.md`, case-sensitive; a deletion and both sides
    // of a rename count.
    const branchAt = (name, from) => g(['checkout', '-q', '-b', name, from], repo);
    const pathCase = (name, change, re, what) => {
      branchAt(name, T);
      change();
      g(['add', '-A'], repo);
      g(['commit', '-q', '-m', name], repo);
      const tip = g(['rev-parse', 'HEAD'], repo);
      const rt = root(`green @ ${R}`, [...backed, ['focused', 'pass', tip, 'clean']]);
      const res = callIn(['suite', 'reusable', '--branch', name, '--root', rt], repo);
      assert.ok(!res.ok && re.test(res.err), `${what} refuses: ${res.err || ''}`);
      g(['checkout', '-q', 'main'], repo);
    };
    pathCase('p-add', () => fs.writeFileSync(path.join(repo, 'b.js'), 'y\n'), /b\.js changed since and is not Markdown/, 'an added non-Markdown file');
    pathCase('p-mod', () => fs.writeFileSync(path.join(repo, 'a.js'), 'z\n'), /a\.js changed since/, 'a modified non-Markdown file');
    pathCase('p-del', () => fs.rmSync(path.join(repo, 'a.js')), /a\.js changed since/, 'a deleted non-Markdown file');
    pathCase('p-ren', () => fs.renameSync(path.join(repo, 'a.js'), path.join(repo, 'a.md')), /a\.js changed since/, 'a rename from a non-Markdown name');
    for (const ext of ['MD', 'mdx', 'markdown']) {
      pathCase(`p-${ext}`, () => fs.writeFileSync(path.join(repo, `x.${ext}`), 'y\n'), new RegExp(`x\\.${ext} changed since`), `a .${ext} file`);
    }

    // A Markdown file under a test path refuses: the defaults, and a configured `## Test paths` entry.
    pathCase('t-default', () => {
      fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(repo, 'tests', 'fixture.md'), 'f\n');
    }, /tests\/fixture\.md is a test path/, 'a Markdown file under a default test path');

    // The configured `## Test paths` come from commit T, never from the working tree: the base commit
    // configures `check/`, and a working-tree copy that drops it changes nothing.
    g(['checkout', '-q', '-b', 'cfg', R], repo);
    const vRel = path.join('docs', 'agents', 'verification.md');
    const cfgR = commit(vRel, '# V\n\n## Test paths\n\n- `check/`\n');
    const cfgT = commit(path.join('check', 'case.md'), 'c\n');
    fs.writeFileSync(path.join(repo, vRel), '# V\n');
    r = callIn(['suite', 'reusable', '--branch', 'cfg', '--root', root(`green @ ${cfgR}`, [['full', 'pass', cfgR, 'clean'], ['focused', 'pass', cfgT, 'clean']])], repo);
    assert.ok(!r.ok && /check\/case\.md is a test path/.test(r.err), "a configured test path at T refuses, whatever the working tree says: " + (r.err || ''));
    g(['checkout', '-q', '--', vRel], repo);
    // From a subdirectory as well: T's verification.md is read at the tree root, never resolved against the cwd.
    r = callIn(['suite', 'reusable', '--branch', 'cfg', '--root', root(`green @ ${cfgR}`, [['full', 'pass', cfgR, 'clean'], ['focused', 'pass', cfgT, 'clean']])], path.join(repo, 'check'));
    assert.ok(!r.ok && /check\/case\.md is a test path/.test(r.err), 'a configured test path at T refuses from a subdirectory too: ' + (r.err || ''));

    // A change to the verification configuration itself refuses: it can rewrite the commands and test
    // paths the carry trusts.
    const cfgT2 = commit(vRel, '# V\n\n## Test paths\n\n- `nothing/`\n');
    r = callIn(['suite', 'reusable', '--branch', 'cfg', '--root', root(`green @ ${cfgT}`, [['full', 'pass', cfgT, 'clean'], ['focused', 'pass', cfgT2, 'clean']])], repo);
    assert.ok(!r.ok && /verification\.md is the verification configuration/.test(r.err), 'a verification.md change refuses: ' + (r.err || ''));
    g(['checkout', '-q', 'main'], repo);

    // A failed full or whole run at T is not hidden by a later focused pass.
    for (const k of ['full', 'whole']) {
      r = reusable(root(`green @ ${R}`, [...backed, [k, 'fail', T, 'clean'], ['focused', 'pass', T, 'clean']]));
      assert.ok(!r.ok && new RegExp(`a ${k} run at the tip failed`).test(r.err), `a failed ${k} run at T refuses despite a later focused pass: ${r.err || ''}`);
    }
    // A failed run of a test file named directly (`path`) at T is not hidden either.
    r = reusable(root(`green @ ${R}`, [...backed, ['path', 'fail', T, 'clean'], ['focused', 'pass', T, 'clean']]));
    assert.ok(!r.ok && /a path run at the tip failed/.test(r.err), `a failed path run at T refuses despite a later focused pass: ${r.err || ''}`);

    // A --no-ff merge of a side branch that changed only Markdown still carries.
    branchAt('m-side', T);
    commit('side-doc.md', 'm\n');
    g(['checkout', '-q', '-b', 'm-into', T], repo);
    g(['merge', '-q', '--no-ff', '-m', 'merge', 'm-side'], repo);
    const M = g(['rev-parse', 'HEAD'], repo);
    g(['checkout', '-q', 'main'], repo);
    r = callIn(['suite', 'reusable', '--branch', 'm-into', '--root', root(`green @ ${R}`, [...backed, ['focused', 'pass', M, 'clean']])], repo);
    assert.ok(r.ok && r.out === 'reusable', 'a --no-ff merge of a Markdown-only side branch carries: ' + (r.err || ''));

    // A git error while deciding the carry refuses. A loose object of the tip moved aside makes the git
    // call that needs it fail, while every earlier call still succeeds: the tip's root tree fails the
    // diff, its `docs` tree the ls-tree, and the verification.md blob the show.
    g(['checkout', '-q', '-b', 'gf', R], repo);
    const gfR = commit(vRel, '# V\n');
    const gfT = commit('gf.md', 'g\n');
    g(['checkout', '-q', 'main'], repo);
    for (const [spec, re, what] of [
      [`${gfT}^{tree}`, /git could not list the paths changed since/, 'an unreadable tip tree'],
      [`${gfT}:docs`, /git could not read the tip's verification configuration/, 'an unreadable docs tree at the tip'],
      [`${gfT}:${vRel}`, /git could not read the tip's verification configuration/, 'an unreadable verification.md at the tip'],
    ]) {
      const oid = g(['rev-parse', spec], repo);
      const obj = path.join(repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2));
      fs.renameSync(obj, `${obj}.aside`);
      try {
        r = callIn(['suite', 'reusable', '--branch', 'gf', '--root', root(`green @ ${gfR}`, [['full', 'pass', gfR, 'clean'], ['focused', 'pass', gfT, 'clean']])], repo);
      } finally {
        fs.renameSync(`${obj}.aside`, obj);
      }
      assert.ok(!r.ok && re.test(r.err), `${what} refuses: ${r.err || ''}`);
    }

    // R not an ancestor of T: a commit on a side branch.
    branchAt('side', R);
    const S = commit('side.md', 's\n');
    g(['checkout', '-q', 'main'], repo);
    r = reusable(root(`green @ ${S}`, [['full', 'pass', S, 'clean'], ['focused', 'pass', T, 'clean']]));
    assert.ok(!r.ok && /not an ancestor/.test(r.err), 'a record off the tip line refuses: ' + (r.err || ''));
    // A recorded sha git cannot resolve refuses rather than throwing.
    const bogus = 'e'.repeat(40);
    r = reusable(root(`green @ ${bogus}`, [['full', 'pass', bogus, 'clean'], ['focused', 'pass', T, 'clean']]));
    assert.ok(!r.ok && /predates tip/.test(r.err), 'an unresolvable recorded sha refuses: ' + (r.err || ''));
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
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
    // ADR 0065 wants can't even be attempted, and the local verdict must stand rather than throw. This
    // is an ordinary, expected refetch failure (no bound ever ran), not the #591 case — the diagnostic
    // must stay silent here rather than printing a "finding" about a bound that was never in play.
    const noRemoteRepo = makeRepo();
    makeWorkBranch(noRemoteRepo, 'fix/noremote', 'app.txt', 'v2\n');
    const origNoRemoteStderrWrite = process.stderr.write;
    const noRemoteStderr = [];
    process.stderr.write = (chunk) => {
      noRemoteStderr.push(String(chunk));
      return true;
    };
    let noRemoteVerdict;
    try {
      noRemoteVerdict = testContainment(noRemoteRepo, 'main', 'fix/noremote');
    } finally {
      process.stderr.write = origNoRemoteStderrWrite;
    }
    assert.strictEqual(
      noRemoteVerdict,
      'not-contained',
      'a repository with no remote configured answers from the local base without erroring'
    );
    assert.strictEqual(
      noRemoteStderr.length,
      0,
      `an unkilled refetch failure prints no diagnostic, got: ${noRemoteStderr.join('')}`
    );
    fs.rmSync(noRemoteRepo, { recursive: true, force: true });

    // #unreachable-host: a dropped VPN or a firewalled host is ordinary, not exotic, and the refetch
    // must still degrade to the local verdict rather than leaving `git fetch` blocked on a connect that
    // never resolves. 192.0.2.1 is TEST-NET-1 (RFC 5737): reserved and never routed anywhere, so the
    // connect attempt stalls the way a genuinely black-holed remote would, unlike `#no-remote` above,
    // which fails fast because there is no remote to dial at all.
    //
    // The assertion is on the seam ADR 0086 names, not a clock: a duration only ever reports the
    // scheduler, which is what flaked this same case at 118965ms under load with the bound intact
    // (ADR 0086). `spawnSync`'s `signal` is the discriminator — set exactly when the refetch's own
    // `timeout`/`killSignal` ended it, absent when `git` exited on its own — so the refetch's outcome is
    // read off stderr, the only surface `testContainment` exposes it on, instead of off elapsed time. A
    // recurrence of #591 would show up here as no diagnostic line at all — the write only fires when
    // `fetched.signal` is set, so a bound that silently stopped catching the kill leaves this assertion
    // failing on a missing line, which is what makes it self-diagnosing rather than a duration to eyeball.
    const unreachableRepo = makeRepo();
    makeWorkBranch(unreachableRepo, 'fix/unreachable', 'app.txt', 'v2\n');
    gitTest(['remote', 'add', 'origin', 'http://192.0.2.1/nowhere.git'], unreachableRepo);
    const origStderrWrite = process.stderr.write;
    const capturedStderr = [];
    process.stderr.write = (chunk) => {
      capturedStderr.push(String(chunk));
      return true;
    };
    let unreachableVerdict;
    try {
      unreachableVerdict = testContainment(unreachableRepo, 'main', 'fix/unreachable');
    } finally {
      process.stderr.write = origStderrWrite;
    }
    assert.strictEqual(
      unreachableVerdict,
      'not-contained',
      'an unreachable host still degrades to the local verdict'
    );
    assert.ok(
      capturedStderr.some((line) => line.includes('ended by its own bound')),
      `expected the refetch outcome on stderr, got: ${capturedStderr.join('')}`
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

    // The second tier (ADR 0082): where the tree comparison conflicts, ask whether base's history
    // already took the branch's patch. Fixtures below share one shape — a branch squash-merged onto
    // main, after which main edits the same line again, so `merge-tree` conflicts on a branch base
    // holds in full.
    function makeConflictingSquashRepo() {
      const dir = makeRepo();
      fs.writeFileSync(path.join(dir, 'app.txt'), 'l1\nl2\nl3\n');
      gitTest(['add', '.'], dir);
      gitTest(['commit', '-q', '-m', 'app'], dir);
      makeWorkBranch(dir, 'fix/took-it', 'app.txt', 'l1\nB2\nl3\n');
      gitTest(['merge', '--squash', 'fix/took-it'], dir);
      gitTest(['commit', '-q', '-m', 'fix: took-it (#1)'], dir);
      fs.writeFileSync(path.join(dir, 'app.txt'), 'l1\nB2 revised\nl3\n');
      gitTest(['commit', '-q', '-am', 'base revises the same line'], dir);
      return dir;
    }

    // A fake git on PATH, standing in for a condition a real fixture cannot cheaply build — the same
    // wrapper shape `#no-write-tree` above already uses. `body` is shell, run before the real git.
    function withFakeGit(body, fn) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-fakegit-'));
      fs.writeFileSync(path.join(dir, 'git'), `#!/bin/sh\n${body}\nexec "${realGit}" "$@"\n`, {
        mode: 0o755,
      });
      const saved = process.env.PATH;
      process.env.PATH = dir + path.delimiter + saved;
      try {
        return fn(dir);
      } finally {
        process.env.PATH = saved;
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    // #conflicting-squash: the case ADR 0082 measured. The tree comparison exits 1, and base's history
    // carries a commit whose diff is the branch's own cumulative diff, so the probe answers contained.
    const tookItRepo = makeConflictingSquashRepo();
    assert.strictEqual(
      testContainment(tookItRepo, 'main', 'fix/took-it'),
      'contained',
      'a squash-merged branch whose files base edited afterward reads contained'
    );
    fs.rmSync(tookItRepo, { recursive: true, force: true });

    // #probe-large-diff: the probe's `git diff` call carries no `maxBuffer`, so it inherits
    // `spawnSync`'s 1 MiB default — a cumulative diff past that reports `ENOBUFS`, which the probe
    // reads as a failed call and answers not-contained. Same shape as #conflicting-squash, but the
    // branch also appends a large, purely-additive block so the mergeBase..branch diff exceeds 1 MiB.
    const largeDiffRepo = makeRepo();
    fs.writeFileSync(path.join(largeDiffRepo, 'app.txt'), 'l1\nl2\nl3\n');
    gitTest(['add', '.'], largeDiffRepo);
    gitTest(['commit', '-q', '-m', 'app'], largeDiffRepo);
    const bulk = Array.from({ length: 80000 }, (_, i) => `bulk-line-${i}`).join('\n') + '\n';
    makeWorkBranch(largeDiffRepo, 'fix/took-it-large', 'app.txt', `l1\nB2\nl3\n${bulk}`);
    gitTest(['merge', '--squash', 'fix/took-it-large'], largeDiffRepo);
    gitTest(['commit', '-q', '-m', 'fix: took-it-large (#1)'], largeDiffRepo);
    fs.writeFileSync(path.join(largeDiffRepo, 'app.txt'), `l1\nB2 revised\nl3\n${bulk}`);
    gitTest(['commit', '-q', '-am', 'base revises the same line'], largeDiffRepo);
    assert.strictEqual(
      testContainment(largeDiffRepo, 'main', 'fix/took-it-large'),
      'contained',
      'a cumulative diff past 1 MiB still reads contained, not the ENOBUFS not-contained'
    );
    fs.rmSync(largeDiffRepo, { recursive: true, force: true });

    // #probe-exports: slice 2 (`hooks/scope-prune.js`) calls the probe directly, so it is exported
    // beside `testContainment`, takes the checkout plus two refs, and answers a boolean.
    const probeRepo = makeConflictingSquashRepo();
    assert.strictEqual(
      baseHistoryHasPatch(probeRepo, 'main', 'fix/took-it'),
      true,
      'the exported probe answers true for work base history took'
    );
    fs.rmSync(probeRepo, { recursive: true, force: true });

    // #probe-rejects-unheld-work: a conflicting branch base never took. No patch id matches, so the
    // first tier's not-contained verdict stands.
    const unheldRepo = makeRepo();
    fs.writeFileSync(path.join(unheldRepo, 'app.txt'), 'l1\nl2\nl3\n');
    gitTest(['add', '.'], unheldRepo);
    gitTest(['commit', '-q', '-m', 'app'], unheldRepo);
    makeWorkBranch(unheldRepo, 'fix/unheld', 'app.txt', 'l1\nBRANCH\nl3\n');
    fs.writeFileSync(path.join(unheldRepo, 'app.txt'), 'l1\nBASE\nl3\n');
    gitTest(['commit', '-q', '-am', 'base writes its own line'], unheldRepo);
    assert.strictEqual(
      baseHistoryHasPatch(unheldRepo, 'main', 'fix/unheld'),
      false,
      'the probe answers false for work base history never took'
    );
    assert.strictEqual(
      testContainment(unheldRepo, 'main', 'fix/unheld'),
      'not-contained',
      'a conflicting branch carrying work base does not hold still reads not-contained'
    );
    fs.rmSync(unheldRepo, { recursive: true, force: true });

    // #commit-cap: past the cap the scan is skipped entirely. A real fixture would need the cap's worth
    // of commits, so the fake git reports the count instead and marks any `git log` that runs — the
    // assertion is that none does.
    const cappedRepo = makeConflictingSquashRepo();
    const capMarker = path.join(cappedRepo, 'log-ran');
    const capVerdict = withFakeGit(
      'if [ "$1" = "rev-list" ]; then echo 999999; exit 0; fi\n' +
        `if [ "$1" = "log" ]; then touch "${capMarker}"; fi`,
      () => testContainment(cappedRepo, 'main', 'fix/took-it')
    );
    assert.strictEqual(capVerdict, 'not-contained', 'a range past the commit cap reads not-contained');
    assert.strictEqual(fs.existsSync(capMarker), false, 'a range past the cap walks no patches');
    fs.rmSync(cappedRepo, { recursive: true, force: true });

    // #probe-on-the-ancestry-path: a git without `--write-tree` answers no on `--is-ancestor` for a
    // squash-merged branch, and reaches the probe from there.
    const oldGitProbeRepo = makeConflictingSquashRepo();
    assert.strictEqual(
      withFakeGit(
        'if [ "$1" = "merge-tree" ] && [ "$2" = "--write-tree" ]; then exit 129; fi',
        () => testContainment(oldGitProbeRepo, 'main', 'fix/took-it')
      ),
      'contained',
      'a git without --write-tree reaches the probe and reads contained for a squash-merged branch'
    );
    fs.rmSync(oldGitProbeRepo, { recursive: true, force: true });

    // #probe-fails-closed: INV-0003. Every git call the probe makes is a step that can fail, and each
    // failure answers not-contained rather than throwing.
    for (const failing of ['merge-base', 'diff', 'patch-id', 'rev-list', 'log']) {
      const failRepo = makeConflictingSquashRepo();
      const verdict = withFakeGit(`if [ "$1" = "${failing}" ]; then exit 3; fi`, () =>
        testContainment(failRepo, 'main', 'fix/took-it')
      );
      assert.strictEqual(
        verdict,
        'not-contained',
        `a failing git ${failing} on a probe step reads not-contained rather than throwing`
      );
      fs.rmSync(failRepo, { recursive: true, force: true });
    }

    // #probe-argument-injection: an option-shaped `base` reaches the probe, because the tree comparison
    // it follows cannot resolve one either. No probe call may run it as a git option.
    const probeInjectionRepo = makeConflictingSquashRepo();
    const probePayloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-containment-payload-'));
    const probeMarker = path.join(probePayloadDir, 'marker');
    const probePayload = path.join(probePayloadDir, 'evil.sh');
    fs.writeFileSync(probePayload, `#!/bin/sh\ntouch "${probeMarker}"\n`, { mode: 0o755 });
    assert.strictEqual(
      baseHistoryHasPatch(probeInjectionRepo, `--upload-pack=${probePayload}`, 'fix/took-it'),
      false,
      'an option-shaped base never reads as a probe match'
    );
    assert.strictEqual(
      baseHistoryHasPatch(probeInjectionRepo, 'main', `--upload-pack=${probePayload}`),
      false,
      'an option-shaped branch never reads as a probe match'
    );
    assert.strictEqual(
      fs.existsSync(probeMarker),
      false,
      'no probe call runs an option-shaped ref as a git option'
    );
    fs.rmSync(probeInjectionRepo, { recursive: true, force: true });
    fs.rmSync(probePayloadDir, { recursive: true, force: true });
  }

  // dod-line: sets a `met` line, keeping the tag, ticking the marker.
  {
    const body = [
      '# dod.md',
      '',
      '- [ ] the widget renders — 01',
      '- [ ] the gadget spins — 02',
      '',
    ].join('\n');
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'screenshot attached'],
      body
    );
    assert.ok(r.ok, 'dod-line met should pass: ' + (r.err || ''));
    assert.ok(
      r.out.includes('- [x] the widget renders — 01 — met: screenshot attached'),
      'dod-line renders a met line ticked, with its note, keeping the tag: ' + r.out
    );
    assert.ok(r.out.includes('- [ ] the gadget spins — 02'), 'dod-line leaves the other line untouched');
  }

  // dod-line: sets `not-met` and `ceiling` lines unticked, with their own note, keeping the tag.
  {
    const body = ['- [ ] the widget renders — 01, 02', '- [x] the gadget spins — #667'].join('\n');
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'not-met', '--note', 'no evidence yet'],
      body
    );
    assert.ok(r.ok, 'dod-line not-met should pass: ' + (r.err || ''));
    assert.ok(
      r.out.includes('- [ ] the widget renders — 01, 02 — not met: no evidence yet'),
      'dod-line renders a not-met line unticked, keeping a multi-id tag: ' + r.out
    );

    r = call(
      ['dod-line', '--match', 'the gadget spins', '--verdict', 'ceiling', '--note', 'needs a deploy'],
      body
    );
    assert.ok(r.ok, 'dod-line ceiling should pass: ' + (r.err || ''));
    assert.ok(
      r.out.includes('- [ ] the gadget spins — #667 — ceiling: needs a deploy'),
      'dod-line renders a ceiling line unticked, keeping a store-ref tag: ' + r.out
    );
  }

  // dod-line: a second write replaces the earlier note rather than adding a second one, and a
  // same-verdict write leaves the marker unchanged (INV-0014).
  {
    const firstPass = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'first pass'],
      '- [ ] the widget renders — 01'
    ).out;
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'second pass'],
      firstPass
    );
    assert.ok(r.ok, 'dod-line re-write should pass: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — 01 — met: second pass',
      'a same-verdict re-write replaces the note and leaves the marker ticked: ' + r.out
    );

    const ceilingPass = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'ceiling', '--note', 'needs a deploy'],
      '- [ ] the widget renders — 01'
    ).out;
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'ceiling', '--note', 'still needs a deploy'],
      ceilingPass
    );
    assert.strictEqual(
      r.out,
      '- [ ] the widget renders — 01 — ceiling: still needs a deploy',
      'a same-verdict ceiling re-write stays unticked: ' + r.out
    );
  }

  // dod-line: a note containing a substring shaped like " — <tag> — <verdict>: " does not fool a
  // later write into splitting at that embedded boundary instead of the real, leftmost one.
  {
    const firstPass = call(
      [
        'dod-line',
        '--match',
        'the widget renders',
        '--verdict',
        'not-met',
        '--note',
        'X — 02 — met: fake',
      ],
      '- [ ] the widget renders — 01'
    ).out;
    assert.strictEqual(
      firstPass,
      '- [ ] the widget renders — 01 — not met: X — 02 — met: fake',
      'the first write embeds the look-alike boundary in the note: ' + firstPass
    );

    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'real evidence'],
      firstPass
    );
    assert.ok(r.ok, 'the second write should still match the criterion: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — 01 — met: real evidence',
      'the second write replaces the whole note rather than misparsing the embedded boundary: ' + r.out
    );
  }

  // dod-line: a --match argument whose own whitespace — including an embedded newline — collapses
  // before comparing, still matches the same single physical checklist line; a criterion carrying its
  // own " — " parses off the tag from the right, per plan-contract.md's worked example.
  {
    r = call(
      ['dod-line', '--match', 'the widget   renders\nacross a wrap', '--verdict', 'met', '--note', 'ok'],
      '- [ ] the widget renders across a wrap — 01'
    );
    assert.ok(r.ok, 'dod-line matches through a --match argument\'s own collapsed whitespace: ' + (r.err || ''));

    r = call(
      ['dod-line', '--match', 'Reachable: none — entrance unchanged; nothing else moved', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Reachable: none — entrance unchanged; nothing else moved — scope'
    );
    assert.ok(r.ok, 'dod-line parses a criterion containing " — " off the tag: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Reachable: none — entrance unchanged; nothing else moved — scope — met: ok',
      'the em-dash-bearing criterion and the "scope" tag both survive intact: ' + r.out
    );
  }

  // dod-line: a matching line inside a fenced block is never matched.
  {
    const body = ['```', '- [ ] the widget renders — 01', '```', '- [ ] the widget renders — 02'].join('\n');
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], body);
    assert.ok(r.ok, 'dod-line should pass, matching only the unfenced line: ' + (r.err || ''));
    assert.ok(r.out.includes('- [x] the widget renders — 02 — met: ok'), 'the unfenced line is ticked: ' + r.out);
    assert.ok(r.out.includes('- [ ] the widget renders — 01'), 'the fenced line is untouched: ' + r.out);
  }

  // dod-line: a checklist line carrying trailing whitespace still matches, with or without a note
  // already on it, and the trailing whitespace is dropped only on the line dod-line itself rewrites —
  // an untouched sibling line's own trailing whitespace survives byte for byte.
  {
    const body = ['- [ ] the widget renders — 01   ', '- [ ] the gadget spins — 02   '].join('\n');
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], body);
    assert.ok(r.ok, 'dod-line should match a no-note line with trailing whitespace: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      ['- [x] the widget renders — 01 — met: ok', '- [ ] the gadget spins — 02   '].join('\n'),
      'the edited line drops its trailing whitespace; the untouched line keeps its own: ' + r.out
    );

    const notedBody = '- [ ] the widget renders — 01 — not met: no evidence yet   ';
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], notedBody);
    assert.ok(r.ok, 'dod-line should match a with-note line with trailing whitespace: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — 01 — met: ok',
      'the re-write drops the trailing whitespace along with the earlier note: ' + r.out
    );
  }

  // dod-line: refusals — zero matches, two-or-more matches, a bad --verdict, a missing --match.
  {
    r = call(['dod-line', '--match', 'nothing matches this', '--verdict', 'met', '--note', 'x'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse on zero matches');
    assert.strictEqual(r.out, '', 'a zero-match refusal prints nothing');

    r = call(
      ['dod-line', '--match', 'dup', '--verdict', 'met', '--note', 'x'],
      ['- [ ] dup — 01', '- [ ] dup — 02'].join('\n')
    );
    assert.ok(!r.ok, 'dod-line should refuse on two matches');
    assert.strictEqual(r.out, '', 'a two-match refusal prints nothing');

    r = call(['dod-line', '--match', 'a line', '--verdict', 'bogus', '--note', 'x'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a bad --verdict');
    assert.strictEqual(r.out, '', 'a bad-verdict refusal prints nothing');

    r = call(['dod-line', '--verdict', 'met', '--note', 'x'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a missing --match');

    r = call(['dod-line', '--match', 'a line', '--verdict', 'met'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a missing --note');
    assert.strictEqual(r.out, '', 'a missing-note refusal prints nothing');

    r = call(['dod-line', '--match', 'a line', '--verdict', 'met', '--note', 'evidence\ninjected line'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a --note containing a newline');
    assert.strictEqual(r.out, '', 'a newline-note refusal prints nothing');

    r = call(['dod-line', '--match', 'a line', '--verdict', 'met', '--note', 'evidence\rinjected'], '- [ ] a line — 01');
    assert.ok(!r.ok, 'dod-line should refuse a --note containing a carriage return');
    assert.strictEqual(r.out, '', 'a carriage-return-note refusal prints nothing');
  }

  // dod-line: --line mode transforms a single line, for the Jira ADF text node.
  {
    r = call(
      ['dod-line', '--line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'],
      '[ ] the widget renders — 01'
    );
    assert.ok(r.ok, '--line mode should pass: ' + (r.err || ''));
    assert.strictEqual(r.out, '[x] the widget renders — 01 — met: ok', '--line mode transforms the one line: ' + r.out);
  }

  // dod-line: a Jira issue-key tag (`PROJ-<n>`, references/issue-tracker-jira.md's own rewritten
  // notation), single and as part of a comma list, in both --line and body mode.
  {
    r = call(
      ['dod-line', '--line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'],
      '[ ] the widget renders — PROJ-12'
    );
    assert.ok(r.ok, 'dod-line should accept a Jira issue-key tag: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '[x] the widget renders — PROJ-12 — met: ok',
      '--line mode keeps the Jira issue-key tag: ' + r.out
    );

    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'],
      '- [ ] the widget renders — PROJ-12, PROJ-13'
    );
    assert.ok(r.ok, 'dod-line should accept a comma list of Jira issue-key tags: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — PROJ-12, PROJ-13 — met: ok',
      'body mode keeps the Jira issue-key comma list: ' + r.out
    );
  }

  // dod-line: body mode's real stdout (a subprocess, not the mocked console.log above) reproduces the
  // input byte for byte everywhere but the edited line, including the input's own trailing newline —
  // it gains no second one.
  {
    const body = ['- [ ] the widget renders — 01', '- [ ] the gadget spins — 02', ''].join('\n');
    const out = execFileSync(process.execPath, [scopePath, 'dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], {
      input: body,
      encoding: 'utf8',
    });
    assert.strictEqual(
      out,
      ['- [x] the widget renders — 01 — met: ok', '- [ ] the gadget spins — 02', ''].join('\n'),
      'a body ending in a trailing newline gains no second one: ' + JSON.stringify(out)
    );

    const noTrailing = ['- [ ] the widget renders — 01', '- [ ] the gadget spins — 02'].join('\n');
    const out2 = execFileSync(process.execPath, [scopePath, 'dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], {
      input: noTrailing,
      encoding: 'utf8',
    });
    assert.strictEqual(
      out2,
      ['- [x] the widget renders — 01 — met: ok', '- [ ] the gadget spins — 02'].join('\n'),
      'a body with no trailing newline gains none either: ' + JSON.stringify(out2)
    );
  }

  // dod-line: an untagged criterion — a single-slice feature's own DoD (plan-contract.md's `###
  // Criterion tags`), a run from before tagging existed, or one untagged line inside an otherwise
  // tagged DoD — ticks with no tag segment, in body mode.
  {
    r = call(
      ['dod-line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'e'],
      '- [ ] Old criterion with no tag'
    );
    assert.ok(r.ok, 'dod-line should accept an untagged line: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Old criterion with no tag — met: e',
      'an untagged line ticks with no tag segment: ' + r.out
    );

    const body = ['- [ ] the widget renders — 01', '- [ ] an untagged line among tagged ones'].join('\n');
    r = call(
      ['dod-line', '--match', 'an untagged line among tagged ones', '--verdict', 'not-met', '--note', 'why'],
      body
    );
    assert.ok(r.ok, 'dod-line should accept an untagged line beside tagged ones: ' + (r.err || ''));
    assert.ok(
      r.out.includes('- [ ] an untagged line among tagged ones — not met: why'),
      'the untagged line among tagged ones stays untagged: ' + r.out
    );
    assert.ok(r.out.includes('- [ ] the widget renders — 01'), 'the tagged sibling is untouched: ' + r.out);
  }

  // dod-line: the same untagged shape in --line mode, for the Jira ADF text node.
  {
    r = call(
      ['dod-line', '--line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'e'],
      '[ ] Old criterion with no tag'
    );
    assert.ok(r.ok, '--line mode should accept an untagged line: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '[x] Old criterion with no tag — met: e',
      '--line mode ticks an untagged line with no tag segment: ' + r.out
    );
  }

  // dod-line: an untagged criterion whose own text looks like a tag suffix still round-trips as one
  // whole, untagged criterion — no real tag exists to split off.
  {
    r = call(
      ['dod-line', '--match', 'Reachable: none — entrance unchanged', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Reachable: none — entrance unchanged'
    );
    assert.ok(r.ok, 'dod-line should accept an untagged criterion carrying its own " — ": ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Reachable: none — entrance unchanged — met: ok',
      'the whole criterion round-trips untagged: ' + r.out
    );
  }

  // dod-line: an untagged noted line (no tag between the criterion and the verdict) still matches and
  // re-writes, keeping the untagged shape.
  {
    r = call(
      ['dod-line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'second'],
      '- [ ] Old criterion with no tag — not met: first'
    );
    assert.ok(r.ok, 'dod-line should accept an untagged noted line: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Old criterion with no tag — met: second',
      'an untagged noted line re-writes, still untagged: ' + r.out
    );
  }

  // dod-line: the fourth verdict, `accepted` (ADR 0095, triage #679) — an operator-accepted unmet
  // criterion renders unticked, exactly like not-met/ceiling, with its own `accepted:` label. It parses
  // back on a later read exactly like the other three.
  {
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'accepted', '--note', 'operator decision, 2026-09-25'],
      '- [ ] the widget renders — 01'
    );
    assert.ok(r.ok, 'dod-line accepted should pass: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [ ] the widget renders — 01 — accepted: operator decision, 2026-09-25',
      'dod-line renders an accepted line unticked, keeping the tag: ' + r.out
    );

    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'later evidence'],
      r.out
    );
    assert.ok(r.ok, 'a later met write still parses an accepted line: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] the widget renders — 01 — met: later evidence',
      'the accepted line still round-trips through a later judgment: ' + r.out
    );
  }

  // dod-line: --note-file and --match-file (triage #680) — an alternative to --note/--match that reads
  // the text from a file, one trailing newline stripped, verbatim otherwise: a quote, a backtick, a
  // `$(`, all survive.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dod-line-files-'));
    const notePath = path.join(dir, 'note.txt');
    const matchPath = path.join(dir, 'match.txt');
    const trickyNote = 'evidence: `$(rm -rf /)` and "quotes" too';
    fs.writeFileSync(notePath, trickyNote + '\n', 'utf8');
    fs.writeFileSync(matchPath, 'the widget renders\n', 'utf8');

    r = call(
      ['dod-line', '--match-file', matchPath, '--verdict', 'met', '--note-file', notePath],
      '- [ ] the widget renders — 01'
    );
    assert.ok(r.ok, 'dod-line --match-file/--note-file should pass: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      `- [x] the widget renders — 01 — met: ${trickyNote}`,
      'dod-line renders the file-supplied note verbatim, trailing newline stripped: ' + r.out
    );

    // Giving both forms of the same argument refuses.
    r = call(
      ['dod-line', '--match', 'the widget renders', '--match-file', matchPath, '--verdict', 'met', '--note', 'x'],
      '- [ ] the widget renders — 01'
    );
    assert.ok(!r.ok, 'dod-line refuses --match and --match-file together');
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'x', '--note-file', notePath],
      '- [ ] the widget renders — 01'
    );
    assert.ok(!r.ok, 'dod-line refuses --note and --note-file together');

    // A note-file whose content carries an internal newline (past the one trailing newline stripped)
    // is still refused — the same refusal --note already makes.
    fs.writeFileSync(notePath, 'line one\nline two\n', 'utf8');
    r = call(
      ['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note-file', notePath],
      '- [ ] the widget renders — 01'
    );
    assert.ok(!r.ok && /newline/.test(r.err), 'dod-line refuses a --note-file with an embedded newline: ' + r.err);

    fs.rmSync(dir, { recursive: true, force: true });
  }

  // dod-line: an untagged criterion ending in something shaped like a tag (`— 3`) is not misread as
  // tagged — the whole line is still the criterion, since no real tag exists to split off (triage #679's
  // C.1). Tag parsing still works for a genuinely tagged line ending the same way.
  {
    r = call(
      ['dod-line', '--match', 'Retries capped — 3', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Retries capped — 3'
    );
    assert.ok(r.ok, 'dod-line matches an untagged criterion ending in a number-shaped suffix: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Retries capped — 3 — met: ok',
      'the whole line round-trips as one untagged criterion: ' + r.out
    );

    r = call(
      ['dod-line', '--match', 'Retries capped', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Retries capped — 01'
    );
    assert.ok(r.ok, 'a genuinely tagged line still matches its bare criterion: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Retries capped — 01 — met: ok',
      'tag parsing is unaffected for a real tag: ' + r.out
    );
  }

  // dod-line: the same untagged-fallback offer reaches the tag-with-note shape too — an untagged
  // criterion ending in something tag-shaped is still readable once it already carries a note (Minor
  // review find #4). Tick the line, then re-judge it against the same untagged `--match`.
  {
    r = call(
      ['dod-line', '--match', 'Retries capped — 3', '--verdict', 'met', '--note', 'e'],
      '- [ ] Retries capped — 3'
    );
    assert.ok(r.ok, 'first tick: ' + (r.err || ''));
    assert.strictEqual(r.out, '- [x] Retries capped — 3 — met: e');

    r = call(
      ['dod-line', '--match', 'Retries capped — 3', '--verdict', 'not-met', '--note', 'regressed'],
      r.out
    );
    assert.ok(r.ok, 'a ticked line with a tag-shaped suffix still matches the same untagged criterion: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [ ] Retries capped — 3 — not met: regressed',
      'the whole line still round-trips as one untagged criterion: ' + r.out
    );
  }

  // dod-line: the untagged fallback trims trailing whitespace off the criterion it renders (triage
  // #679's C.2).
  {
    r = call(
      ['dod-line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'ok'],
      '- [ ] Old criterion with no tag   '
    );
    assert.ok(r.ok, 'dod-line should match an untagged line with trailing whitespace: ' + (r.err || ''));
    assert.strictEqual(
      r.out,
      '- [x] Old criterion with no tag — met: ok',
      'the untagged fallback trims trailing whitespace off the criterion: ' + r.out
    );
  }

  // dod-line: body mode scopes an untagged match to the `## Definition of Done` section when the body
  // carries one (triage #679's C.3) — an identical checkbox outside that section is ignored, and a
  // second one inside it still refuses as ambiguous.
  {
    const body = [
      '# dod.md',
      '',
      '## Out of scope',
      '',
      '- [ ] Old criterion with no tag',
      '',
      '## Definition of Done',
      '',
      '- [ ] the widget renders — 01',
      '',
      '## Notes',
      '',
      '- [ ] Old criterion with no tag',
    ].join('\n');
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], body);
    assert.ok(r.ok, 'dod-line matches inside the DoD section: ' + (r.err || ''));
    assert.ok(r.out.includes('- [x] the widget renders — 01 — met: ok'), 'the DoD-section line is ticked: ' + r.out);

    r = call(['dod-line', '--match', 'Old criterion with no tag', '--verdict', 'met', '--note', 'ok'], body);
    assert.ok(!r.ok, 'a checkbox outside the DoD section is never a match candidate, even though two copies exist');

    // A body with no "Definition of Done" heading still matches over the whole body, as before.
    const noHeading = ['- [ ] the widget renders — 01', '- [ ] the gadget spins — 02'].join('\n');
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'ok'], noHeading);
    assert.ok(r.ok, 'a body with no DoD heading still matches over the whole body: ' + (r.err || ''));
  }

  // dod-line: a note already opening with the verdict's own label carries that label once.
  {
    const body = '- [ ] the widget renders — 01';
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'met: ok'], body);
    assert.strictEqual(r.out, '- [x] the widget renders — 01 — met: ok', 'own label written once: ' + r.out);
    r = call(['dod-line', '--line', '--match', 'the widget renders', '--verdict', 'not-met', '--note', 'not met: red'], body);
    assert.ok(r.out.includes('— not met: red') && !r.out.includes('not met: not met'), '--line: own label once: ' + r.out);
    r = call(['dod-line', '--match', 'the widget renders', '--verdict', 'met', '--note', 'not met: x'], body);
    assert.ok(r.out.includes('— met: not met: x'), "another verdict's label is note text, kept: " + r.out);
  }

  // dod-line fails closed: no matching line → nothing on stdout, the criterion on stderr, exit 1 —
  // the empty stdout is what a store's gated body edit refuses to send (ADR 0115).
  for (const mode of [[], ['--line']]) {
    const res = cp.spawnSync(
      process.execPath,
      [scopePath, 'dod-line', ...mode, '--match', 'absent criterion', '--verdict', 'met', '--note', 'ok'],
      { input: '- [ ] the widget renders — 01', encoding: 'utf8', timeout: 30000 }
    );
    assertSpawnDecided(res, 'dod-line no-match ' + mode.join(''));
    assert.strictEqual(res.status, 1, 'no match exits 1');
    assert.strictEqual(res.stdout, '', 'no match prints nothing on stdout');
    assert.ok(res.stderr.includes('absent criterion'), 'no match names the criterion on stderr: ' + res.stderr);
  }

  // --help / -h: usage on stdout, exit 0, before any verb reads stdin. stdin is /dev/zero, which never
  // ends, so a verb that waits on stdin first is killed by the (loose, qualitative) bound instead.
  {
    const ledgerBefore = fs.readdirSync(tmp).join(',');
    const endless = fs.openSync('/dev/zero', 'r');
    try {
      for (const argv of [['--help'], ['-h'], ['dod-line', '--help'], ['init', '--help'], ['adopt', '--help'], ['deferred', 'add', '-', '-h']]) {
        const res = cp.spawnSync(process.execPath, [scopePath, ...argv], {
          cwd: tmp,
          stdio: [endless, 'pipe', 'pipe'],
          encoding: 'utf8',
          timeout: 30000,
        });
        assertSpawnDecided(res, argv.join(' '));
        assert.strictEqual(res.status, 0, argv.join(' ') + ' exits 0: ' + res.stderr);
        assert.ok(res.stdout.includes('usage: node scope.js'), argv.join(' ') + ' prints the usage');
      }
    } finally {
      fs.closeSync(endless);
    }
    assert.strictEqual(fs.readdirSync(tmp).join(','), ledgerBefore, '--help writes nothing');
  }

  // A `-h` / `--help` that is a flag's value or a bullet's text is data, not a request for usage: inside a
  // store's gated body-edit chain the usage text would pass `[ -s ]` and replace the anchor body.
  {
    const spawnScope = (argv, input) =>
      cp.spawnSync(process.execPath, [scopePath, ...argv], { cwd: tmp, input, encoding: 'utf8', timeout: 30000 });
    let res = spawnScope(['dod-line', '--match', 'x', '--verdict', 'met', '--note', '-h'], '- [ ] x — 01\n');
    assertSpawnDecided(res, 'dod-line --note -h');
    assert.strictEqual(res.status, 0, 'dod-line --note -h exits 0: ' + res.stderr);
    assert.ok(res.stdout.includes('- [x] x — 01 — met: -h'), '-h is written as the note: ' + res.stdout);
    assert.ok(!res.stdout.includes('usage:'), 'no usage text replaces the body');

    const root = path.join(tmp, '.superdev', 'scopes', 'demo');
    res = spawnScope(['unresolved', 'add', '-h', '--root', root]);
    assertSpawnDecided(res, 'unresolved add -h');
    assert.strictEqual(res.status, 0, 'unresolved add -h exits 0: ' + res.stderr);
    assert.ok(!res.stdout.includes('usage:'), 'unresolved add -h prints no usage');
    res = spawnScope(['get', 'unresolved', '--root', root]);
    assert.ok(res.stdout.includes('-h'), 'unresolved add -h records -h: ' + res.stdout + res.stderr);

    // Every token after `add` / `add-denial` is bullet text, not just the first.
    res = spawnScope(['unresolved', 'add', 'foo', '-h', '--root', root]);
    assertSpawnDecided(res, 'unresolved add foo -h');
    assert.ok(!res.stdout.includes('usage:'), 'unresolved add foo -h prints no usage');
    res = spawnScope(['get', 'unresolved', '--root', root]);
    assert.ok(res.stdout.includes('foo -h'), 'unresolved add foo -h records "foo -h": ' + res.stdout + res.stderr);
    res = spawnScope(['degraded', 'add-denial', '-h', '--root', root]);
    assertSpawnDecided(res, 'degraded add-denial -h');
    assert.ok(!res.stdout.includes('usage:'), 'degraded add-denial -h prints no usage');
    res = spawnScope(['get', 'degraded', '--root', root]);
    assert.ok(res.stdout.includes('-h'), 'degraded add-denial -h records -h: ' + res.stdout + res.stderr);
    res = spawnScope(['deferred', 'resolve', '-h', '--root', root]);
    assertSpawnDecided(res, 'deferred resolve -h');
    assert.ok(!res.stdout.includes('usage:'), 'deferred resolve -h prints no usage');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// run trace (ADR 0117): ledger events, the single writer, and the reader.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-trace-'));
  try {
    const { appendTrace } = require(scopePath);
    const { spawnSync } = require('node:child_process');
    const root = path.join(dir, '.superdev', 'scopes', 'demo');
    const traceFile = path.join(root, 'trace.log');
    const lines = () => (fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8').split('\n').filter(Boolean) : []);
    const quiet = (argv, stdin) => {
      const orig = console.log;
      console.log = () => {};
      try {
        run(argv, dir, stdin || '');
        return true;
      } catch (e) {
        if (e.isRefusal) return false;
        throw e;
      } finally {
        console.log = orig;
      }
    };

    assert.ok(quiet(['init', 'feat/demo', 'implementing'], sliceJson), 'init');
    assert.equal(lines().length, 1, 'init appends one ledger line');
    assert.match(lines()[0], /^\d{4}-\d\d-\d\dT[\d:.]+Z scope main ledger init feat\/demo implementing$/, 'ledger line shape');
    assert.ok(quiet(['slice', '01', 'merged', '--root', root]), 'slice');
    assert.equal(lines().length, 2, 'slice appends one line');
    assert.match(lines()[1], / 01 main ledger slice 01 merged$/, 'slice line names its slice');
    assert.ok(quiet(['stage', 'set', 'reviewed', '--root', root]), 'stage forward');
    assert.equal(lines().length, 3);
    assert.ok(!quiet(['stage', 'set', 'implementing', '--root', root]), 'backward stage refused');
    assert.ok(!quiet(['slice', '99', 'merged', '--root', root]), 'unknown slice refused');
    assert.equal(lines().length, 3, 'a refused verb appends no line');
    assert.ok(quiet(['unresolved', 'add', 'secret-token-123', '--root', root]));
    assert.equal(lines().length, 4);
    assert.ok(!lines()[3].includes('secret-token-123'), 'bullet text stays out of the trace');
    assert.ok(quiet(['get', 'stage', '--root', root]));
    assert.equal(lines().length, 4, 'a read verb appends no line');

    // Every other writing verb appends exactly one ledger line; bullet text never reaches the trace.
    const adoptRoot = path.join(dir, 'elsewhere', 'demo');
    const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    git('commit', '-q', '--allow-empty', '-m', 'x');
    const writers1 = [
      [['base', 'set', 'HEAD'], / ledger base set HEAD$/],
      [['suite', 'set', 'green', 'HEAD'], / ledger suite set green HEAD$/],
      [['deploy', 'set', 'prod', 'pending'], / ledger deploy set prod pending$/],
      [['docs', 'set', 'inline'], / ledger docs set inline$/],
      [['docs', 'clear'], / ledger docs clear$/],
      [['pr', 'set', '12'], / ledger pr set 12$/],
      [['pr', 'clear'], / ledger pr clear$/],
      [['degraded', 'add', 'secret-token-123'], / ledger degraded add$/],
      [['degraded', 'add-denial', 'secret-token-123'], / ledger degraded add-denial$/],
      [['degraded', 'reset-denials', 'secret-token-123'], / ledger degraded reset-denials$/],
      [['deferred', 'add', 'secret-token-123'], / ledger deferred add$/],
      [['deferred', 'resolve', 'secret-token-123'], / ledger deferred resolve$/],
    ];
    for (const [argv, shape] of writers1) {
      const n = lines().length;
      assert.ok(quiet([...argv, '--root', root]), argv.join(' ') + ' succeeds');
      assert.equal(lines().length, n + 1, argv.join(' ') + ' appends one line');
      assert.match(lines()[n], shape, argv.join(' ') + ' line shape');
      assert.ok(!lines()[n].includes('secret-token-123'), argv.join(' ') + ' keeps bullet text out');
    }
    // Every ledger-writing verb the usage text lists is driven against a fresh run root and appends one
    // `ledger <verb> …` line: a verb added to the usage text with no driver here, or one that stops tracing, fails.
    {
      const usageText = spawnSync('node', [scopePath, '--help'], { encoding: 'utf8' }).stdout;
      const readOnly = new Set(['get', 'trace', 'publish', 'status', 'root', 'staging', 'dod-line', 'collisions', 'test', 'fail-to-pass']);
      const readOnlySub = /^\s+(deploy get|suite reusable|base resolve)\b/;
      const usageVerbs = new Set(usageText.split('\n').slice(1)
        .filter((l) => /^ {2}[^-\s]/.test(l) && !readOnlySub.test(l))
        .map((l) => l.trim().split(/\s+/)[0])
        .filter((v) => !readOnly.has(v)));
      assert.ok(usageVerbs.size >= 12, 'usage text yields the writing verbs: ' + [...usageVerbs].join(','));
      const drivers = {
        init: ['init', 'feat/g-init', 'implementing'],
        stage: ['stage', 'set', 'reviewed'],
        slice: ['slice', '01', 'merged'],
        degraded: ['degraded', 'add', 'x'],
        unresolved: ['unresolved', 'add', 'x'],
        deferred: ['deferred', 'add', 'x'],
        docs: ['docs', 'set', 'inline'],
        pr: ['pr', 'set', '12'],
        deploy: ['deploy', 'set', 'prod', 'pending'],
        suite: ['suite', 'set', 'green', 'HEAD'],
        base: ['base', 'set', 'HEAD'],
        adopt: ['adopt'],
      };
      const traceOf = (r) => (fs.existsSync(path.join(r, 'trace.log')) ? fs.readFileSync(path.join(r, 'trace.log'), 'utf8').split('\n').filter(Boolean) : []);
      for (const v of usageVerbs) {
        assert.ok(drivers[v], `usage lists writing verb "${v}" with no driver in this guard`);
        const gRoot = path.join(dir, '.superdev', 'scopes', 'g-' + v);
        let target = gRoot;
        let argv = [...drivers[v], '--root', gRoot];
        let stdin;
        if (v === 'init') argv = drivers.init, stdin = sliceJson;
        else {
          assert.ok(quiet(['init', 'feat/g-' + v, 'implementing'], sliceJson), v + ' fixture init');
          if (v === 'adopt') {
            target = path.join(dir, 'elsewhere', 'g-adopt');
            argv = ['adopt', '--root', target];
            stdin = require(scopePath).publishText(gRoot);
          }
        }
        const n = traceOf(target).length;
        assert.ok(quiet(argv, stdin), `${v} succeeds`);
        const added = traceOf(target).slice(n);
        assert.equal(added.length, 1, `${v} appends one trace line`);
        assert.match(added[0], new RegExp(` ledger ${v}( |$)`), `${v} traces a ledger ${v} event`);
      }
    }
    {
      const n = lines().length;
      assert.ok(!quiet(['deferred', 'resolve', 'no-such-bullet', '--root', root]), 'a resolve matching nothing is refused');
      assert.equal(lines().length, n, 'a refused resolve appends no line');
    }
    // No-op clears: clearing absent headers must not trace a line (RED test for finding 1).
    // Create a fresh root for the no-op clear test since root already has unresolved/docs/pr from above
    const noopRoot = path.join(dir, '.superdev', 'scopes', 'noop');
    assert.ok(quiet(['init', 'feat/noop', 'implementing'], sliceJson), 'init for noop root');
    const noop = lines().length;
    assert.ok(quiet(['unresolved', 'clear', '--root', noopRoot]), 'unresolved clear when absent succeeds');
    assert.equal(lines().length, noop, 'unresolved clear on absent header traces no line');
    assert.ok(quiet(['docs', 'clear', '--root', noopRoot]), 'docs clear when absent succeeds');
    assert.equal(lines().length, noop, 'docs clear on absent header traces no line');
    assert.ok(quiet(['pr', 'clear', '--root', noopRoot]), 'pr clear when absent succeeds');
    assert.equal(lines().length, noop, 'pr clear on absent header traces no line');
    const n0 = lines().length;
    assert.ok(quiet(['adopt', '--root', adoptRoot], require(scopePath).publishText(root)), 'adopt');
    assert.equal(fs.readFileSync(path.join(adoptRoot, 'trace.log'), 'utf8').split('\n').filter(Boolean).length, 1, 'adopt appends one line');
    assert.equal(lines().length, n0, 'adopt traces into the adopted root only');
    // An absent or empty field keeps its position.
    appendTrace(root, { slice: '', kind: 'note', fields: [undefined, ''] });
    assert.match(lines()[lines().length - 1], /^\S+ scope main note - -$/, 'placeholder fields');
    fs.writeFileSync(traceFile, lines().slice(0, 4).join('\n') + '\n');

    // Escaping: control characters never start a new line.
    const before = lines().length;
    appendTrace(root, { slice: '01', kind: 'edit', fields: ['impl', 'a\nb\rc\td\u2028e f'] });
    assert.equal(lines().length, before + 1, 'one new line');
    assert.ok(lines()[before].endsWith('edit impl a\\nb\\rc\\td\\u2028e\\x20f'), 'escaped: ' + lines()[before]);

    // Concurrent writers leave every line whole.
    const N = 8;
    const writers = [];
    const writer = `require(${JSON.stringify(scopePath)}).appendTrace(${JSON.stringify(root)}, {kind:'note', fields:['x'.repeat(5000)]})`;
    const procs = [];
    for (let i = 0; i < N; i++) procs.push(require('node:child_process').spawn(process.execPath, ['-e', writer]));
    for (const p of procs) writers.push(new Promise((res) => p.on('exit', res)));
    const done = Promise.all(writers).then(() => {
      const notes = lines().filter((l) => / note /.test(l));
      assert.equal(notes.length, N, 'every concurrent line landed');
      assert.ok(notes.every((l) => /^\S+ scope main note x{5000}$/.test(l)), 'no line torn or interleaved');

      // Reader.
      const out = spawnSync(process.execPath, [scopePath, 'trace', '--root', root], { encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(out, 'trace');
      assert.equal(out.status, 0);
      const printed = out.stdout.split('\n').filter(Boolean);
      assert.equal(printed.length, lines().length, 'trace prints every line');
      assert.match(printed[0], / ledger init /, 'oldest first');
      const one = spawnSync(process.execPath, [scopePath, 'trace', '--slice', '01', '--root', root], { encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(one, 'trace --slice');
      assert.ok(one.stdout.split('\n').filter(Boolean).every((l) => l.split(' ')[1] === '01'), '--slice 01 prints only 01');
      assert.ok(one.stdout.includes('ledger slice 01 merged'));
      const none = spawnSync(process.execPath, [scopePath, 'trace', '--slice', '99', '--root', root], { encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(none, 'trace --slice none');
      assert.match(none.stdout.trim(), /^no trace: this run has recorded no events$/, 'a slice with no lines prints the one no-trace line');
      for (const content of [null, '']) {
        const empty = path.join(dir, 'empty' + content);
        fs.mkdirSync(empty, { recursive: true });
        if (content !== null) fs.writeFileSync(path.join(empty, 'trace.log'), content);
        const r2 = spawnSync(process.execPath, [scopePath, 'trace', '--root', empty], { encoding: 'utf8', timeout: 20000 });
        assertSpawnDecided(r2, 'trace empty');
        assert.equal(r2.status, 0, 'no trace exits 0');
        assert.match(r2.stdout.trim(), /^no trace/, 'one no-trace line');
      }
      // No verb takes a caller-chosen event.
      assert.ok(!quiet(['event', 'edit', 'x', '--root', root]), 'no verb appends a caller-chosen event');
      assert.equal(lines().length, before + 1 + N, 'and the trace is unchanged');
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('scope tests ok');
    });
    done.catch((e) => {
      fs.rmSync(dir, { recursive: true, force: true });
      console.error(e);
      process.exit(1);
    });
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
