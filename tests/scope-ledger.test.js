'use strict';

// Suite for plugin/scripts/scope.js's ledger verbs: init, stage, step, slice, the bullet and header records,
// get, status. Requires the module (silent — scope.js already guards its CLI entry with require.main === module,
// per ADR 0059) and calls its exported internals directly, the way the script's own inline --selftest used to
// before this suite moved off the shipped tree (ADR 0059). The shared directory, `call`, and the init payload
// come from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { tmp, call, sliceJson, scopePath, run, cleanup } = require('./scope-setup');
const { publishText, SLUG_RE, readLedgerHeader } = require(scopePath);

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

  // The **Step** line (ADR 0140): `step set|clear`, `get step`, the `stage set` clear, the trace mirror, status, publish, adopt.
  {
    const stepRoot = path.join(tmp, '.superdev', 'scopes', 'stepper');
    const stepLedger = () => fs.readFileSync(path.join(stepRoot, 'ledger.md'), 'utf8');
    const stepTrace = () => (fs.existsSync(path.join(stepRoot, 'trace.log')) ? fs.readFileSync(path.join(stepRoot, 'trace.log'), 'utf8').split('\n').filter(Boolean) : []);
    assert.ok(call(['init', 'feat/stepper', 'implementing'], sliceJson).ok, 'step fixture init');
    assert.ok(call(['stage', '--root', stepRoot, 'set', 'merged']).ok, 'step fixture at merged');
    assert.equal(call(['get', '--root', stepRoot, 'step']).out, 'none', 'a ledger with no step line reads none');
    assert.ok(call(['status']).out.includes('| stepper | merged | 2 |'), 'a step-less run prints as before');
    const t0 = stepTrace().length;
    assert.ok(call(['step', '--root', stepRoot, 'set', 'review']).ok, 'step set review');
    assert.ok(stepLedger().split('\n').includes('**Step:** review'), 'step set writes the line');
    assert.equal(call(['get', '--root', stepRoot, 'step']).out, 'review', 'get step prints the step');
    assert.equal(stepTrace().length, t0 + 1, 'step set appends one trace line');
    assert.match(stepTrace()[t0], / ledger step set review$/, 'step set mirrors its fields');
    assert.ok(call(['status']).out.includes('| stepper | merged, step: review | 2 |'), 'status prints the step beside the stage');
    assert.ok(publishText(stepRoot).includes('**Step:** review'), 'publish carries the step');
    {
      const adoptStep = path.join(tmp, 'elsewhere', 'stepper');
      assert.ok(call(['adopt', '--root', adoptStep], publishText(stepRoot)).ok, 'adopt reads a snapshot with a step');
      assert.equal(call(['get', '--root', adoptStep, 'step']).out, 'review', 'adopt keeps the step');
      const badAdopt = path.join(tmp, 'elsewhere2', 'stepper');
      const refused = call(['adopt', '--root', badAdopt], publishText(stepRoot).replace('**Step:** review', '**Step:** bogus'));
      assert.ok(!refused.ok, 'adopt refuses an unknown step');
      assert.ok(refused.err.includes('bogus'), 'the adopt refusal names the step');
    }
    const before = stepLedger();
    const t1 = stepTrace().length;
    const bad = call(['step', '--root', stepRoot, 'set', 'reviewing']);
    assert.ok(!bad.ok, 'step set with an unknown name is refused');
    for (const name of ['plan', 'implement', 'review', 'document', 'submit', 'ship', 'verify-ship', 'wrap-up']) assert.ok(bad.err.includes(name), `the refusal names ${name}`);
    assert.equal(stepLedger(), before, 'a refused step set leaves the ledger');
    assert.equal(stepTrace().length, t1, 'a refused step set appends no trace line');
    assert.ok(!call(['stage', '--root', stepRoot, 'set', 'implementing']).ok, 'a backwards stage set is refused');
    assert.equal(call(['get', '--root', stepRoot, 'step']).out, 'review', 'a refused stage set leaves the step');
    const t6 = stepTrace().length;
    assert.ok(call(['stage', '--root', stepRoot, 'set', 'merged']).ok, 'a same-stage write succeeds');
    assert.equal(stepTrace().length, t6 + 1, 'a same-stage write with a step appends no step clear');
    assert.equal(call(['get', '--root', stepRoot, 'step']).out, 'review', 'a same-stage write leaves the step');
    const t4 = stepTrace().length;
    assert.ok(call(['stage', '--root', stepRoot, 'set', 'reviewed']).ok, 'stage set reviewed');
    assert.equal(call(['get', '--root', stepRoot, 'step']).out, 'none', 'a stage write clears the step');
    assert.equal(stepTrace().length, t4 + 2, 'a stage write that clears the step appends its own line and one step clear');
    assert.match(stepTrace()[t4], / ledger step clear$/, 'the step clear precedes the stage line');
    const t5 = stepTrace().length;
    assert.ok(call(['stage', '--root', stepRoot, 'set', 'reviewed']).ok, 'a step-less same-value stage write');
    assert.equal(stepTrace().length, t5 + 1, 'a stage write with no step appends only its own line');
    call(['step', '--root', stepRoot, 'set', 'document']);
    const t2 = stepTrace().length;
    assert.ok(call(['step', '--root', stepRoot, 'clear']).ok, 'step clear');
    assert.equal(call(['get', '--root', stepRoot, 'step']).out, 'none', 'step clear removes the line');
    assert.equal(stepTrace().length, t2 + 1, 'step clear mirrors the write');
    assert.match(stepTrace()[t2], / ledger step clear$/, 'step clear mirrors its fields');
    assert.ok(call(['step', '--root', stepRoot, 'clear']).ok, 'a second step clear succeeds');
    assert.equal(stepTrace().length, t2 + 1, 'a second step clear appends nothing');
    // Every `step set` records a start (ADR 0147): the same write twice leaves the ledger alone and traces twice.
    call(['step', '--root', stepRoot, 'set', 'ship']);
    const t3 = stepTrace().length;
    const shipLedger = stepLedger();
    call(['step', '--root', stepRoot, 'set', 'ship']);
    assert.equal(stepTrace().length, t3 + 1, 'a step set naming the standing step appends a trace line');
    assert.match(stepTrace()[t3], / ledger step set ship$/, 'the repeated step set mirrors its fields');
    assert.equal(stepLedger(), shipLedger, 'a repeated step set leaves the ledger byte-identical');
    // `step block` records a stop with the step standing (ADR 0147): a trace line, the ledger untouched.
    {
      call(['step', '--root', stepRoot, 'set', 'review']);
      const blockLedger = stepLedger();
      const b0 = stepTrace().length;
      assert.ok(call(['step', '--root', stepRoot, 'block']).ok, 'step block with a step standing succeeds');
      assert.equal(stepTrace().length, b0 + 1, 'step block appends one trace line');
      assert.match(stepTrace()[b0], / ledger step block review$/, 'the line names the standing step');
      assert.equal(stepLedger(), blockLedger, 'step block leaves the ledger byte-identical');
      const extra = call(['step', '--root', stepRoot, 'block', 'review']);
      assert.ok(!extra.ok, 'step block with an extra argument is refused');
      assert.equal(stepLedger(), blockLedger, 'a refused step block leaves the ledger');
      assert.equal(stepTrace().length, b0 + 1, 'a refused step block appends no trace line');
      const empty = call(['step', '--root', stepRoot, 'block', '']);
      assert.ok(!empty.ok, 'step block with an empty-string argument is refused');
      assert.equal(stepLedger(), blockLedger, 'an empty-string step block leaves the ledger');
      assert.equal(stepTrace().length, b0 + 1, 'an empty-string step block appends no trace line');
      assert.equal(call(['get', '--root', stepRoot, 'step']).out, 'review', 'the step still reads review after a block');
      call(['step', '--root', stepRoot, 'set', 'review']);
      assert.match(stepTrace()[b0 + 1], / ledger step set review$/, 'a resumed step set records a new start');
      call(['step', '--root', stepRoot, 'clear']);
      const b1 = stepTrace().length;
      assert.ok(call(['step', '--root', stepRoot, 'block']).ok, 'step block with no step standing succeeds');
      assert.equal(stepTrace().length, b1, 'step block with no step standing appends nothing');
    }
    // `plan` and `implement` are steps (ADR 0147): set, read, published, adopted, kept by a planned `init`, cleared by the merged stage write.
    {
      assert.ok(call(['step', '--root', stepRoot, 'set', 'plan']).ok, 'step set plan');
      assert.equal(call(['get', '--root', stepRoot, 'step']).out, 'plan', 'get step prints plan');
      const planSnap = publishText(stepRoot);
      assert.ok(planSnap.includes('**Step:** plan'), 'publish carries the plan step');
      assert.ok(call(['adopt', '--root', path.join(tmp, 'elsewhere3', 'stepper')], planSnap).ok, 'adopt carries the plan step');
      assert.ok(call(['step', '--root', stepRoot, 'set', 'implement']).ok, 'step set implement');
      assert.equal(call(['get', '--root', stepRoot, 'step']).out, 'implement', 'get step prints implement');
      const implSnap = publishText(stepRoot);
      assert.ok(implSnap.includes('**Step:** implement'), 'publish carries the implement step');
      assert.ok(call(['adopt', '--root', path.join(tmp, 'elsewhere4', 'stepper')], implSnap).ok, 'adopt carries the implement step');
      const keepRoot = path.join(tmp, '.superdev', 'scopes', 'keeper');
      assert.ok(call(['init', 'feat/keeper', 'planned'], sliceJson).ok, 'keeper fixture init');
      assert.ok(call(['step', '--root', keepRoot, 'set', 'plan']).ok, 'keeper step set plan');
      assert.ok(call(['init', 'feat/keeper', 'planned'], sliceJson).ok, 'planned init over a planned ledger');
      assert.equal(call(['get', '--root', keepRoot, 'step']).out, 'plan', 'a planned rewrite keeps the plan step');
      assert.ok(call(['step', '--root', keepRoot, 'set', 'review']).ok, 'keeper step set review');
      assert.ok(call(['init', 'feat/keeper', 'planned'], sliceJson).ok, 'planned init over a planned ledger holding another step');
      assert.equal(call(['get', '--root', keepRoot, 'step']).out, 'review', 'a planned rewrite keeps any standing step');
      assert.ok(call(['init', 'feat/keeper', 'implementing'], sliceJson).ok, 'implementing init over a planned ledger');
      assert.equal(call(['get', '--root', keepRoot, 'step']).out, 'none', 'an implementing init writes no step');
      assert.ok(call(['step', '--root', keepRoot, 'set', 'implement']).ok, 'keeper step set implement');
      const t7 = stepTrace().length;
      const kt = () => fs.readFileSync(path.join(keepRoot, 'trace.log'), 'utf8').split('\n').filter(Boolean);
      const k0 = kt().length;
      assert.ok(call(['stage', '--root', keepRoot, 'set', 'merged']).ok, 'keeper stage set merged');
      assert.equal(call(['get', '--root', keepRoot, 'step']).out, 'none', 'the merged stage write clears the implement step');
      assert.match(kt()[k0], / ledger step clear$/, 'the merged stage write traces step clear');
      assert.equal(stepTrace().length, t7, 'the keeper run leaves the stepper trace alone');
      call(['step', '--root', stepRoot, 'clear']);
    }
    // A shipped run prints its step too: verify-ship and wrap-up start at `shipped`.
    assert.ok(call(['stage', '--root', stepRoot, 'set', 'shipped']).ok, 'stage set shipped');
    assert.ok(call(['status']).out.includes('| stepper | shipped |'), 'a step-less shipped run prints as before');
    call(['step', '--root', stepRoot, 'set', 'verify-ship']);
    assert.ok(call(['status']).out.includes('| stepper | shipped, step: verify-ship |'), 'status prints the step of a shipped run');
    // The ledger the mod's fixture holds for a run with a step.
    const src = fs.readFileSync(path.join(__dirname, '..', 'mods', 'superdev-view', 'hooks', 'ledger-fixtures.ts'), 'utf8');
    const stepLines = JSON.parse(src.slice(src.indexOf('/* ledger-step:start */') + 23, src.indexOf('/* ledger-step:end */')));
    const viewTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-viewstep-'));
    const viewRoot = path.join(viewTmp, '.superdev', 'scopes', 'view');
    const origStep = console.log;
    console.log = () => {};
    try {
      run(['init', 'feat/view', 'planned'], viewTmp, JSON.stringify({ anchor: '#9 — Show the pane', slices: [{ id: '01', issue: '#10', title: 'Draw the tiles', type: 'behavior', 'depends-on': '—' }] }));
      run(['stage', '--root', viewRoot, 'set', 'merged'], viewTmp);
      run(['slice', '--root', viewRoot, '01', 'merged', '--range', 'a1b2c3d..e4f5a6b'], viewTmp);
      run(['step', '--root', viewRoot, 'set', 'review'], viewTmp);
      console.log = origStep;
      assert.deepEqual(fs.readFileSync(path.join(viewRoot, 'ledger.md'), 'utf8').split('\n'), stepLines, 'scope.js writes the ledger with a step that superdev-view parses');
    } finally {
      console.log = origStep;
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
    assert.ok(!call(['status']).out.includes('| ' + slug + ' |'), 'status prints no row for a closed scope');
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

  // init over a closed ledger moves the run's trace.log aside with it, under the rotated ledger's own
  // name stem, so the new run's trace starts with its own `ledger init` line alone.
  {
    const slug = 'rotate-trace';
    const tRoot = path.join(tmp, '.superdev', 'scopes', slug);
    const closeRun = () => {
      assert.ok(call(['stage', 'set', 'shipped', '--root', tRoot]).ok);
      assert.ok(call(['stage', 'set', 'closed', '--root', tRoot]).ok);
    };
    const traceLines = () => fs.readFileSync(path.join(tRoot, 'trace.log'), 'utf8').split('\n').filter(Boolean);
    const pairs = () => {
      const ledgers = fs.readdirSync(tRoot).filter((f) => /^ledger-closed-.*\.md$/.test(f)).sort();
      const traces = fs.readdirSync(tRoot).filter((f) => /^trace-closed-.*\.log$/.test(f)).sort();
      return { ledgers, traces };
    };
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    closeRun();
    const earlier = fs.readFileSync(path.join(tRoot, 'trace.log'), 'utf8');
    assert.strictEqual(traceLines().length, 3, 'the earlier run traced init and two stage moves');
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok, 'init over a closed ledger rotates');
    const now = traceLines();
    assert.strictEqual(now.length, 1, 'the new trace holds only its own init line: ' + now.join(' | '));
    assert.ok(/ ledger init feat\/rotate-trace planned$/.test(now[0]), 'that line is the init: ' + now[0]);
    let p = pairs();
    assert.strictEqual(p.traces.length, 1, 'one rotated trace: ' + p.traces.join(', '));
    assert.strictEqual(p.traces[0].replace(/^trace-/, 'ledger-').replace(/\.log$/, '.md'), p.ledgers[0], 'same name stem as the ledger');
    assert.strictEqual(fs.readFileSync(path.join(tRoot, p.traces[0]), 'utf8'), earlier, 'the earlier trace moved byte for byte');

    // A stamp the ledger rotation has to suffix gives the trace the same suffix. Plant ledger names for
    // the next 120 seconds, so the next rotation's stamp collides unless the stage moves and the init
    // between planting and rotating take longer than two minutes, however loaded the machine is.
    const planted = [];
    const plantedAt = Date.now();
    for (let s = 0; s < 120; s++) {
      const stamp = new Date(plantedAt + s * 1000).toISOString().slice(0, 19).replace(/:/g, '');
      const name = `ledger-closed-${stamp}.md`;
      if (!fs.existsSync(path.join(tRoot, name))) {
        fs.writeFileSync(path.join(tRoot, name), 'planted\n');
        planted.push(name);
      }
    }
    closeRun();
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok, 'a colliding rotation passes');
    p = pairs();
    const suffixed = p.traces.filter((t) => /-\d+\.log$/.test(t));
    assert.strictEqual(suffixed.length, 1, 'the colliding trace took a suffix: ' + p.traces.join(', '));
    assert.ok(p.ledgers.includes(suffixed[0].replace(/^trace-/, 'ledger-').replace(/\.log$/, '.md')), 'the ledger took the same suffix');
    for (const name of planted) fs.unlinkSync(path.join(tRoot, name));

    // An earlier run that recorded no trace rotates its ledger alone, and init succeeds.
    closeRun();
    fs.unlinkSync(path.join(tRoot, 'trace.log'));
    const before = pairs();
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok, 'a trace-less closed run rotates');
    const after = pairs();
    assert.strictEqual(after.ledgers.length, before.ledgers.length + 1, 'the ledger rotated');
    assert.strictEqual(after.traces.length, before.traces.length, 'no trace was invented');

    // A re-init over a `planned` ledger is the same run: its trace stays, with every line.
    const plannedBefore = traceLines();
    assert.ok(call(['init', 'feat/' + slug, 'planned'], sliceJson).ok);
    assert.deepStrictEqual(traceLines().slice(0, plannedBefore.length), plannedBefore, 'the planned run keeps its trace');
    assert.strictEqual(pairs().traces.length, after.traces.length, 'nothing rotated over planned');

    // A refused init leaves both files byte-identical.
    assert.ok(call(['stage', 'set', 'implementing', '--root', tRoot]).ok);
    const ledgerText = fs.readFileSync(path.join(tRoot, 'ledger.md'), 'utf8');
    const traceText = fs.readFileSync(path.join(tRoot, 'trace.log'), 'utf8');
    assert.ok(!call(['init', 'feat/' + slug, 'planned'], sliceJson).ok, 'init over implementing refuses');
    assert.strictEqual(fs.readFileSync(path.join(tRoot, 'ledger.md'), 'utf8'), ledgerText, 'refused init: ledger untouched');
    assert.strictEqual(fs.readFileSync(path.join(tRoot, 'trace.log'), 'utf8'), traceText, 'refused init: trace untouched');

    // A trace that cannot be moved stops init with the earlier, closed ledger still in place.
    assert.ok(call(['stage', 'set', 'shipped', '--root', tRoot]).ok);
    assert.ok(call(['stage', 'set', 'closed', '--root', tRoot]).ok);
    const closedText = fs.readFileSync(path.join(tRoot, 'ledger.md'), 'utf8');
    fs.chmodSync(tRoot, 0o555);
    let stuck;
    try {
      stuck = call(['init', 'feat/' + slug, 'planned'], sliceJson);
    } finally {
      fs.chmodSync(tRoot, 0o755);
    }
    assert.ok(!stuck.ok && /trace/.test(stuck.err), 'an unmovable trace refuses init: ' + (stuck.err || stuck.out));
    assert.strictEqual(fs.readFileSync(path.join(tRoot, 'ledger.md'), 'utf8'), closedText, 'the closed ledger stays in place');

    // A ledger that cannot be moved after the trace moved puts the trace back and stops init with a
    // one-line refusal: `ledger.md` and `trace.log` both stay as they were. The fault is injected on
    // the ledger's own rename, the one step no file layout can make fail after the trace rename passed.
    const traceBefore = fs.readFileSync(path.join(tRoot, 'trace.log'), 'utf8');
    const rotatedBefore = pairs();
    const realRename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (from === path.join(tRoot, 'ledger.md')) throw Object.assign(new Error('EACCES: injected'), { code: 'EACCES' });
      return realRename(from, to);
    };
    let ledgerStuck;
    try {
      ledgerStuck = call(['init', 'feat/' + slug, 'planned'], sliceJson);
    } catch (e) {
      ledgerStuck = { ok: false, raw: e };
    } finally {
      fs.renameSync = realRename;
    }
    assert.ok(!ledgerStuck.ok && !ledgerStuck.raw, 'an unmovable ledger refuses init, never throws raw: ' + (ledgerStuck.raw && ledgerStuck.raw.stack));
    assert.ok(/ledger/.test(ledgerStuck.err) && !ledgerStuck.err.includes('\n'), 'one-line refusal: ' + ledgerStuck.err);
    assert.strictEqual(fs.readFileSync(path.join(tRoot, 'ledger.md'), 'utf8'), closedText, 'the closed ledger stays in place');
    assert.strictEqual(fs.readFileSync(path.join(tRoot, 'trace.log'), 'utf8'), traceBefore, 'the trace moved back');
    assert.deepStrictEqual(pairs(), rotatedBefore, 'nothing is left rotated aside');

    // When the trace cannot be put back either, init still stops with one line: it names the ledger
    // failure and the stranded trace's path, so the operator can move it back by hand.
    fs.renameSync = (from, to) => {
      if (from === path.join(tRoot, 'ledger.md')) throw Object.assign(new Error('EACCES: injected'), { code: 'EACCES' });
      if (to === path.join(tRoot, 'trace.log')) throw Object.assign(new Error('EACCES: injected'), { code: 'EACCES' });
      return realRename(from, to);
    };
    let bothStuck;
    try {
      bothStuck = call(['init', 'feat/' + slug, 'planned'], sliceJson);
    } catch (e) {
      bothStuck = { ok: false, raw: e };
    } finally {
      fs.renameSync = realRename;
    }
    assert.ok(!bothStuck.ok && !bothStuck.raw, 'an unrestorable trace refuses init, never throws raw: ' + (bothStuck.raw && bothStuck.raw.stack));
    const stranded = pairs().traces.find((t) => !rotatedBefore.traces.includes(t));
    assert.ok(stranded, 'the trace is stranded aside');
    assert.ok(
      /ledger/.test(bothStuck.err) && bothStuck.err.includes(path.join(tRoot, stranded)) && !bothStuck.err.includes('\n'),
      'one-line refusal naming the stranded trace: ' + bothStuck.err,
    );
    assert.strictEqual(fs.readFileSync(path.join(tRoot, 'ledger.md'), 'utf8'), closedText, 'the closed ledger stays in place');
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
    call(['status']).out.includes('| header-only | planned | 0 |'),
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

  // stage set on a ledger with no Stage line refuses, as an unknown stage does, and writes nothing.
  {
    const noStageRoot = path.join(tmp, '.superdev', 'scopes', 'no-stage');
    fs.mkdirSync(noStageRoot, { recursive: true });
    const noStageText = '# Ledger — no-stage\n\n**Branch:** feat/no-stage\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n';
    fs.writeFileSync(path.join(noStageRoot, 'ledger.md'), noStageText);
    for (const value of ['planned', 'implementing', 'merged', 'reviewed', 'documented-unreviewed', 'documented', 'submitted', 'shipped', 'closed']) {
      const refused = call(['stage', 'set', value, '--root', noStageRoot]);
      assert.ok(!refused.ok && /\*\*Stage:\*\*/.test(refused.err) && /by hand/.test(refused.err), `stage set ${value} on a stage-less ledger refused: ` + (refused.err || refused.out));
      assert.strictEqual(fs.readFileSync(path.join(noStageRoot, 'ledger.md'), 'utf8'), noStageText, `stage set ${value}: the ledger is byte-identical`);
    }
  }
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

  // minors (ADR 0174, INV-0171): the Minor queue, one bullet per queued slice naming it by id. `add` refuses an id the
  // slice table lacks, a second add leaves one bullet, `clear` removes the line, and an absent queue reads empty.
  {
    const ledger = () => fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    const trace = () => fs.readFileSync(path.join(root, 'trace.log'), 'utf8').split('\n').filter(Boolean);
    assert.strictEqual(call(['get', 'minors', ...R]).out, '', 'get minors prints nothing on a ledger with no queue');
    assert.ok(call(['minors', 'clear', ...R]).ok, 'minors clear on an absent queue succeeds');
    const t0 = trace().length;
    assert.ok(call(['minors', 'add', '01', ...R]).ok, 'minors add 01');
    assert.ok(call(['minors', 'add', '02', ...R]).ok, 'minors add 02');
    assert.ok(call(['minors', 'add', '01', ...R]).ok, 'a second add of 01');
    assert.match(ledger(), /\*\*Minors:\*\*\n- 01\n- 02\n/, 'one bullet per queued slice, one line');
    assert.strictEqual(call(['get', 'minors', ...R]).out, '01\n02', 'get minors prints the queued ids');
    const added = trace().slice(t0);
    assert.ok(added.length >= 2 && added.every((l) => / ledger minors add$/.test(l)), 'each write traces `ledger minors add` with no id: ' + added.join('|'));
    const before = ledger();
    const bad = call(['minors', 'add', '99', ...R]);
    assert.ok(!bad.ok && /99/.test(bad.err), 'minors add of an id the slice table lacks is refused: ' + bad.err);
    assert.strictEqual(ledger(), before, 'the refusal writes nothing');
    assert.ok(!call(['minors', 'add', ...R]).ok, 'minors add with no id is refused');
    assert.ok(!call(['minors', 'bogus', ...R]).ok, 'an unknown minors subcommand is refused');
    const beforeExtra = ledger();
    assert.ok(!call(['minors', 'add', '01', '02', ...R]).ok, 'minors add with a second id is refused');
    assert.ok(!call(['minors', 'clear', 'x', ...R]).ok, 'minors clear with an argument is refused');
    assert.strictEqual(ledger(), beforeExtra, 'a refused minors call writes nothing');
    assert.ok(call(['status']).out.includes('| demo | minors | 01, 02'), 'status prints the queued slices: ' + call(['status']).out);
    assert.ok(call(['minors', 'clear', ...R]).ok, 'minors clear');
    assert.ok(!/\*\*Minors:\*\*/.test(ledger()), 'clear removes the queue line');
    assert.strictEqual(call(['get', 'minors', ...R]).out, '', 'get minors prints nothing after clear');
    assert.ok(!/minors:/.test(call(['status']).out), 'status prints no minors line for an empty queue');
  }

  // A ledger an earlier release wrote carries no queue section: it reads as an empty queue, resumes, and takes an add.
  {
    const oldRoot = path.join(tmp, '.superdev', 'scopes', 'minors-old');
    fs.mkdirSync(oldRoot, { recursive: true });
    fs.writeFileSync(
      path.join(oldRoot, 'ledger.md'),
      '# Ledger — minors-old\n\n**Stage:** implementing\n**Branch:** feat/minors-old\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 01 | #1 | one | behavior | — | merged | a..b |\n',
      'utf8'
    );
    assert.strictEqual(call(['get', 'minors', '--root', oldRoot]).out, '', 'an old ledger reads as an empty queue');
    assert.ok(call(['status']).out.includes('| minors-old | implementing | 1 |'), 'status reads an old ledger');
    assert.ok(call(['minors', 'add', '01', '--root', oldRoot]).ok, 'an old ledger takes an add');
    assert.strictEqual(call(['get', 'minors', '--root', oldRoot]).out, '01');
  }

  // The ledger the mod's fixture holds for a run with a queued slice.
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'mods', 'superdev-view', 'hooks', 'ledger-fixtures.ts'), 'utf8');
    const queueLines = JSON.parse(src.slice(src.indexOf('/* ledger-queue:start */') + 24, src.indexOf('/* ledger-queue:end */')));
    const qTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-viewqueue-'));
    const qRoot = path.join(qTmp, '.superdev', 'scopes', 'view');
    const origQ = console.log;
    console.log = () => {};
    try {
      run(['init', 'feat/view', 'planned'], qTmp, JSON.stringify({ anchor: '#9 — Show the pane', slices: [{ id: '01', issue: '#10', title: 'Draw the tiles', type: 'behavior', 'depends-on': '—' }] }));
      run(['stage', '--root', qRoot, 'set', 'implementing'], qTmp);
      run(['slice', '--root', qRoot, '01', 'merged', '--range', 'a1b2c3d..e4f5a6b'], qTmp);
      run(['minors', 'add', '01', '--root', qRoot], qTmp);
      console.log = origQ;
      assert.deepEqual(fs.readFileSync(path.join(qRoot, 'ledger.md'), 'utf8').split('\n'), queueLines, 'scope.js writes the ledger with a queue that superdev-view parses');
    } finally {
      console.log = origQ;
      fs.rmSync(qTmp, { recursive: true, force: true });
    }
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
    // dispatch, a denied Bash command — both still take plain `add`, per scope-findings `## Degraded
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

  // One placement rule for an absent header: after the last present APPENDED_HEADERS entry, whichever
  // verb writes it, `**Docs:**` included. A header already present changes only its own line.
  {
    const hdrDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-headers-'));
    try {
      const g = (args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: hdrDir, encoding: 'utf8' }).trim();
      g(['init', '-q', '-b', 'main']);
      fs.writeFileSync(path.join(hdrDir, 'f'), 'a');
      g(['add', 'f']);
      g(['commit', '-q', '-m', 'a']);
      const sha1 = g(['rev-parse', 'HEAD']);
      fs.writeFileSync(path.join(hdrDir, 'f'), 'b');
      g(['commit', '-q', '-am', 'b']);
      const sha2 = g(['rev-parse', 'HEAD']);
      const hcall = (argv, stdin) => {
        const orig = console.log;
        console.log = () => {};
        try {
          run(argv, hdrDir, stdin || '');
        } finally {
          console.log = orig;
        }
      };
      const hRoot = (slug) => path.join(hdrDir, '.superdev', 'scopes', slug);
      const hLines = (slug) => fs.readFileSync(path.join(hRoot(slug), 'ledger.md'), 'utf8').split('\n');
      const at = (lines, name) => lines.findIndex((l) => l.startsWith(`**${name}:**`));

      hcall(['init', 'feat/hdr-pr-first', 'implementing'], sliceJson);
      hcall(['pr', 'set', '1', '--root', hRoot('hdr-pr-first')]);
      hcall(['docs', 'set', 'inline', '--root', hRoot('hdr-pr-first')]);
      const prFirst = hLines('hdr-pr-first');
      assert.strictEqual(at(prFirst, 'Docs'), at(prFirst, 'PR') + 1, 'docs set places an absent Docs after the last present header, PR: ' + prFirst.join(' | '));
      hcall(['init', 'feat/hdr-docs-first', 'implementing'], sliceJson);
      hcall(['docs', 'set', 'inline', '--root', hRoot('hdr-docs-first')]);
      hcall(['pr', 'set', '1', '--root', hRoot('hdr-docs-first')]);
      const docsFirst = hLines('hdr-docs-first');
      assert.strictEqual(at(docsFirst, 'PR'), at(docsFirst, 'Docs') + 1, 'pr set places an absent PR the same way on the mirrored ledger');

      // Every header present, then each verb writes its header again: only that line changes.
      const full = hRoot('hdr-full');
      hcall(['init', 'feat/hdr-full', 'implementing'], sliceJson);
      for (const argv of [['step', 'set', 'review'], ['docs', 'set', 'inline'], ['pr', 'set', '1'], ['suite', 'set', 'green', sha1], ['base', 'set', sha1], ['deploy', 'set', 'pve', 'pending']]) {
        hcall([...argv, '--root', full]);
      }
      for (const [name, argv] of [
        ['Step', ['step', 'set', 'document']],
        ['Docs', ['docs', 'set', 'other']],
        ['PR', ['pr', 'set', '2']],
        ['Suite', ['suite', 'set', 'red', sha2]],
        ['Base', ['base', 'set', sha2]],
        ['Deploy', ['deploy', 'set', 'pve', 'deployed']],
      ]) {
        const before = hLines('hdr-full');
        hcall([...argv, '--root', full]);
        const after = hLines('hdr-full');
        assert.strictEqual(after.length, before.length, `${argv[0]} set on a present header adds no line`);
        const changed = after.map((l, i) => (l === before[i] ? -1 : i)).filter((i) => i >= 0);
        assert.deepStrictEqual(changed, [at(before, name)], `${argv[0]} set changes only the ${name} line, in place`);
      }
    } finally {
      fs.rmSync(hdrDir, { recursive: true, force: true });
    }
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
  assert.ok(ps.ok && !/ledger unreadable/.test(ps.out.split('\n').find((l) => l.startsWith('| pipe-title |')) || ''), 'status reads the pipe-title ledger fine');

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
  assert.ok(ps.ok && !/ledger unreadable/.test(ps.out.split('\n').find((l) => l.startsWith('| newline-title |')) || ''), 'status reads the newline-title ledger fine');

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
  assert.ok(st.out.includes('| demo | shipped |'), 'a shipped scope collapses to one line: ' + st.out);
  assert.ok(
    !st.out.includes('| demo | shipped | 2 |'),
    "a shipped scope's tally is not printed"
  );
  assert.ok(
    st.out.includes('| demo | degraded | first pass degraded (2026-08-06), second pass degraded (2026-08-06)'),
    "a shipped scope's degrade record survives the collapse: " + st.out
  );
  // Its deferred-finding record survives for the same reason, and one reason more: it is the only
  // record naming work nobody has planned yet (ADR 0035), so the reap takes the last copy with it.
  assert.ok(
    st.out.includes('| demo | deferred | carry deferrals into the pull-request body (2026-08-23), second deferred finding (2026-08-23)'),
    "a shipped scope's deferred record survives the collapse: " + st.out
  );
  assert.ok(
    st.out.includes('| demo | deploy | pve deployed, proxy deployed'),
    "a shipped scope's deploy record survives the collapse: " + st.out
  );
  assert.ok(st.out.includes('| precli | reviewed | 1 |'), 'status shows pre-CLI scope');
  assert.ok(st.out.includes('| broken | ledger unreadable |'), 'unreadable ledger reported');

  // status: an `unresolved:` line for a scope that has one, and none for a scope that does not.
  // No scope carries one yet — the demo scope's line was cleared above.
  assert.ok(!/unresolved:/.test(st.out), 'no unresolved line when no scope has one: ' + st.out);
  // A shipped scope's collapsed status still carries its unresolved bullets, as it carries its
  // degraded ones (the demo scope above is shipped).
  assert.ok(call(['unresolved', 'add', 'suite still red at the three-strike cap (2026-08-12)', ...R]).ok);
  const stShippedUnresolved = call(['status']).out;
  assert.ok(
    stShippedUnresolved.includes('| demo | unresolved | suite still red at the three-strike cap (2026-08-12)'),
    "a shipped scope's unresolved record survives the collapse: " + stShippedUnresolved
  );
  // The Minor queue of a shipped scope prints the same way (the demo scope holds slice 01).
  assert.ok(call(['minors', 'add', '01', ...R]).ok);
  assert.ok(call(['status']).out.includes('| demo | minors | 01'), "a shipped scope's Minor queue survives the collapse");
  assert.ok(call(['minors', 'clear', ...R]).ok);

  // An in-flight scope still prints everything it printed before: tally, blocked slices, and its
  // degrade record. The collapse is scoped to `shipped` alone.
  const flightRoot = path.join(tmp, '.superdev', 'scopes', 'inflight');
  fs.mkdirSync(flightRoot, { recursive: true });
  fs.writeFileSync(
    path.join(flightRoot, 'ledger.md'),
    '# Ledger — inflight\n\n**Stage:** merged\n**Degraded:**\n- doc pass denied (2026-08-11)\n' +
      '**Unresolved:**\n- fix declined by the operator (2026-08-12)\n' +
      '**Deferred:**\n- plan the export retry (2026-08-12)\n' +
      '**Deploy:** pve deployed, proxy failed exit 2\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #20 | one | behavior | — | merged | a..b |\n' +
      '| 02 | #21 | two | behavior | — | blocked | — |\n',
    'utf8'
  );
  const stFlight = call(['status']);
  assert.ok(stFlight.out.includes('| inflight | merged | 2 |'), 'an in-flight scope keeps its header');
  assert.ok(stFlight.out.includes('| inflight | merged | 2 | 0 | 0 | 0 | 1 | 1 |'), 'and its tally');
  assert.ok(stFlight.out.includes('| inflight | blocked | 02 two'), 'and its blocked slices');
  assert.ok(stFlight.out.includes('| inflight | degraded | doc pass denied (2026-08-11)'), 'and its degrade record');
  assert.ok(stFlight.out.includes('| inflight | unresolved | fix declined by the operator (2026-08-12)'), 'and its unresolved record');
  assert.ok(stFlight.out.includes('| inflight | deploy | pve deployed, proxy failed exit 2'), 'and its deploy record');
  assert.ok(stFlight.out.includes('| inflight | deferred | plan the export retry (2026-08-12)'), 'and its deferred record');

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
  assert.ok(stPlanned.out.includes('| planned-status | planned | 0 |'), 'a planned run names its stage: ' + stPlanned.out);

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
    stSubmitted.out.includes('| submitted-status | submitted | 1 |'),
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
    stKb.out.includes('| demo | pending publish | 2 staged pages — `/superdev:publish-kb demo`'),
    'a scope with a run root carries its pending line: ' + stKb.out,
  );
  assert.ok(stKb.out.includes('| \\_adhoc | no ledger |'), 'a pending scope with no run root is reported');
  assert.ok(
    stKb.out.includes('| \\_adhoc | pending publish | 1 staged page — `/superdev:publish-kb _adhoc`'),
    'one page is singular',
  );
  assert.ok(!/nothing-here/.test(stKb.out), 'an empty staging directory is not pending');
  assert.ok(stKb.out.includes('| broken | ledger unreadable |'), 'the rest of the report is unchanged');

  // `demo` is shipped, so it collapses — but its staged-page lines are the exception that survives.
  // A page nobody publishes is invisible everywhere else (ADR 0023), and a shipped scope is exactly
  // where one waits, so collapsing these away would reintroduce the silent loss reporting prevents.
  // Asserted on the collapsed header specifically, not merely on the lines being present somewhere.
  const demoBlock = stKb.out.split('\n');
  const demoAt = demoBlock.findIndex((l) => l === '| demo | shipped |  |  |  |  |  |  |');
  assert.ok(demoAt >= 0, 'the shipped scope still collapses to a row with no tally, with pages staged: ' + stKb.out);
  const demoLines = demoBlock.filter((l) => l.startsWith('| demo | '));
  assert.ok(
    demoLines.some((l) => l.includes('pending publish | 2 staged pages')),
    "a shipped scope's pending line survives the collapse: " + demoLines.join(' | '),
  );
  assert.ok(
    demoLines.some((l) => l.includes('draft.markdown')),
    "a shipped scope's stray line survives the collapse: " + demoLines.join(' | '),
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
    stKb.out.split('\n').filter((l) => l === '| broken | pending publish | 1 staged page — `/superdev:publish-kb broken` |').length === 1,
    'a malformed ledger reports its own pending pages exactly once: ' + stKb.out,
  );
  assert.ok(!stKb.out.includes('| broken | no ledger |'), 'not reported a second time — its ledger file exists');

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
    onlyLog.join('\n').includes('pending publish | 1 staged page — `/superdev:publish-kb _adhoc`'),
    'staged pages alone still produce a report',
  );
  assert.ok(
    !onlyLog.join('\n').includes('No superdev runs found'),
    'the zero-scope message never hides pending pages',
  );
  fs.rmSync(only, { recursive: true, force: true });

  // The report is markdown: a name read off disk is escaped, so a `|` keeps the table row whole and a `_`
  // prints as itself, and a file name prints as code.
  const odd = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-kbodd-'));
  fs.mkdirSync(path.join(odd, '.superdev', 'kb-pending', 'a|b_c'), { recursive: true });
  fs.writeFileSync(path.join(odd, '.superdev', 'kb-pending', 'a|b_c', 'my_notes.txt'), 'x\n', 'utf8');
  const oddLog = [];
  console.log = (s) => oddLog.push(String(s));
  try {
    run(['status'], odd, '');
  } finally {
    console.log = origOnly;
  }
  const oddOut = oddLog.join('\n');
  assert.ok(oddOut.includes('| a\\|b\\_c | no ledger |'), 'a `|` and a `_` in a scope name are escaped in its row: ' + oddOut);
  assert.ok(oddOut.includes('| a\\|b\\_c | stray files | 1 non-`.md` file staged, ignored: `my_notes.txt`'), 'and a file name prints as code: ' + oddOut);
  fs.rmSync(odd, { recursive: true, force: true });

  // A closed scope gets no row, but its notes still print: they are the last copy before the reap. A repo
  // whose every run is closed with no note left prints one line saying no run is open.
  const done = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-closed-'));
  const doneRoot = path.join(done, '.superdev', 'scopes', 'gone');
  fs.mkdirSync(doneRoot, { recursive: true });
  const closedLedger = (extra) =>
    '# Ledger — gone\n\n**Stage:** closed\n' + extra + '\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n';
  const statusIn = (dir) => {
    const log = [];
    console.log = (s) => log.push(String(s));
    try {
      run(['status'], dir, '');
    } finally {
      console.log = origOnly;
    }
    return log.join('\n');
  };
  fs.writeFileSync(path.join(doneRoot, 'ledger.md'), closedLedger('**Deferred:**\n- plan it later (2026-10-30)\n'), 'utf8');
  assert.strictEqual(
    statusIn(done),
    '| Run | Note | Detail |\n|---|---|---|\n| gone | deferred | plan it later (2026-10-30) |',
    'a closed scope prints its notes as a note table and no run table',
  );
  fs.writeFileSync(path.join(doneRoot, 'ledger.md'), closedLedger('**Deferred:**\n- split a | b (2026-10-30)\n'), 'utf8');
  assert.ok(statusIn(done).endsWith('| gone | deferred | split a \\| b (2026-10-30) |'), 'a `|` in a note escapes, so the row stays whole');
  fs.writeFileSync(path.join(doneRoot, 'ledger.md'), closedLedger(''), 'utf8');
  assert.strictEqual(statusIn(done), 'No open superdev runs in this repo.', 'only closed scopes with no notes print one line');
  fs.rmSync(done, { recursive: true, force: true });

  // main()'s success path lets the process exit naturally instead of forcing process.exit(0),
  // so stdout flushes before exit. `call()` above bypasses main() entirely, so this needs a
  // real subprocess.
  const cp = require('child_process');
  const spawnEmpty = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-spawn-'));
  const spawned = cp.spawnSync(process.execPath, [scopePath, 'status'], { cwd: spawnEmpty, encoding: 'utf8' });
  assert.strictEqual(spawned.status, 0, 'CLI process exits 0 on success');
  assert.strictEqual(spawned.stdout.trim(), 'No superdev runs found in this repo.', 'CLI process flushes stdout');
  fs.rmSync(spawnEmpty, { recursive: true, force: true });
} finally {
  cleanup();
}
