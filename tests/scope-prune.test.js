'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/hooks/scope-prune.js, its pure internals. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported internals directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059). The cases that run `main()` against
// real repositories live in `scope-prune-main`, `scope-prune-containment`, and `scope-prune-reap`, and the failure
// posture per loaded module in `scope-prune-guards`.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hookPath = require.resolve('../plugin/hooks/scope-prune.js');
const {
  TTL_MS,
  selectPrunable,
  shapeScanBranch,
  branchNamesFrom,
  readHeader,
  readStage,
  readBranch,
} = require(hookPath);

const FRESH = Date.now();
const STALE = Date.now() - TTL_MS - 1000;

// `isContained` in these pure cases is a stub over a set of branch names: the real one talks to git,
// and is exercised by the end-to-end fixtures in the other suites.
const containedIn = (...names) => {
  const set = new Set(names);
  return (branch) => set.has(branch);
};

// #merged-and-stale: contained branch, mtime past TTL, ledger stage `closed` → prune.
// #merged-and-fresh: contained branch, mtime within TTL → skip (too soon), regardless of stage.
// #unmerged: scope branch not contained (still active) → skip regardless of age or stage.
const closed = () => 'closed';
const mtimes = { 'merged-and-stale': STALE, 'merged-and-fresh': FRESH, unmerged: STALE };
const merged = containedIn('fix/merged-and-stale', 'docs/merged-and-fresh');
// Every scope here still has its branch, so containment is the question being asked of each.
const present = new Set(['main', 'fix/merged-and-stale', 'docs/merged-and-fresh', 'feat/unmerged']);
assert.deepEqual(
  selectPrunable(Object.keys(mtimes), merged, (s) => mtimes[s], closed, present, () => null),
  ['merged-and-stale'],
  'only a contained AND stale AND closed scope is pruned'
);
assert.deepEqual(
  selectPrunable(['unknown-mtime'], merged, () => null, closed, present, () => null),
  [],
  'unreadable mtime is never pruned'
);

// The gates run cheapest-first, and `--write-tree` writes tree objects into the object database on
// every call, in a `Stop` hook that fires on every finished turn. A scope that fails the TTL check or
// the stage check must therefore never reach the containment test at all (ADR 0053). Counting the
// calls is the only way to pin an ordering: every ordering returns the same answer.
{
  let calls = 0;
  const counted = (branch) => {
    calls += 1;
    return containedIn('fix/counted')(branch);
  };
  const alive = new Set(['main', 'fix/too-fresh', 'fix/mid-chain']);
  assert.deepEqual(
    selectPrunable(
      ['too-fresh', 'mid-chain'],
      counted,
      (s) => (s === 'too-fresh' ? FRESH : STALE),
      (s) => (s === 'too-fresh' ? 'closed' : 'reviewed'),
      alive,
      () => null,
    ),
    [],
    'a fresh scope and an unclosed scope are both skipped'
  );
  assert.equal(calls, 0, 'neither the TTL nor the stage rejection reaches the containment test');

  // And the same test *is* reached once every cheap gate passes, or the assertion above would pass
  // just as well against a containment test nothing ever calls.
  assert.deepEqual(
    selectPrunable(['counted'], counted, () => STALE, closed, new Set(['main', 'fix/counted']), () => null),
    ['counted'],
    'a scope past both cheap gates does reach the containment test'
  );
  assert.equal(calls, 1, 'and reaches it exactly once');
}

// Neither tier switches the invoking checkout onto the scope branch (ADR 0045), and both leave a
// scopetree standing until `/superdev:ship` removes it, so the containment test and the scopetree guard
// already protect a run mid-chain. The stage gate is the second, independent signal, exercised here on
// its own: a merged, stale scope whose ledger stage is `reviewed` (review ran, ship never did) must
// still not be pruned, whatever the branch or scopetree checks would otherwise say.
// The branch matcher takes the change type from the branch, because the run root's directory name is
// the slug alone. Only a Conventional Commits type counts: a slice branch (`slice/<scope>/<id>`) and a
// maintainer's own `wip/<scope>` both name the scope somewhere, and pruning a run root on either one
// would delete a live run's ledger.
assert.notEqual(shapeScanBranch(new Set(['refactor/exports']), 'exports'), null, 'a typed scope branch counts');
assert.equal(shapeScanBranch(new Set(['wip/exports']), 'exports'), null, 'an untyped branch does not');
assert.equal(shapeScanBranch(new Set(['slice/exports/03']), 'exports'), null, 'a slice branch does not');
assert.equal(shapeScanBranch(new Set(['exports']), 'exports'), null, 'a bare branch name does not');

const parkedAll = new Set(['main', 'feat/parked-mid-chain']);
const parkedContained = containedIn('feat/parked-mid-chain');
assert.deepEqual(
  selectPrunable(['parked-mid-chain'], parkedContained, () => STALE, () => 'reviewed', parkedAll, () => null),
  [],
  'a contained, stale scope whose ledger stage is not `closed` is never pruned'
);

// An unreadable ledger, or one with no `**Stage:**` line, is not evidence a run finished — it is
// evidence nothing can be read. Never prune on a guess.
assert.deepEqual(
  selectPrunable(['parked-mid-chain'], parkedContained, () => STALE, () => null, parkedAll, () => null),
  [],
  'a scope with no readable stage is never pruned'
);

// `shipped` is what an older version left behind, or what `/superdev:ship` writes today before its
// own gate hands off to `/superdev:wrap-up` (ADR 0106). It is not `closed`, so it is never prunable —
// whatever the TTL, containment, or branch presence otherwise say.
assert.deepEqual(
  selectPrunable(['awaiting-wrap-up'], parkedContained, () => STALE, () => 'shipped', parkedAll, () => null),
  [],
  'a contained, stale scope at `shipped` is never pruned — only `/superdev:wrap-up` moves it to `closed`'
);
assert.deepEqual(
  selectPrunable(['gone-and-shipped'], () => false, () => STALE, () => 'shipped', new Set(['main']), () => null),
  [],
  'a `shipped` scope whose branch is gone entirely is still never pruned'
);

// --- readStage: reads the ledger's `**Stage:**` line, or null when unreadable/absent ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-'));
fs.writeFileSync(path.join(tmp, 'ledger.md'), '# ledger\n\n**Stage:** closed\n');
assert.equal(readStage(tmp), 'closed', 'reads the stage value off the ledger line');
assert.equal(readStage(path.join(tmp, 'no-such-dir')), null, 'an unreadable ledger yields null');
fs.rmSync(tmp, { recursive: true, force: true });

// `scope.js stage set` may well write the value in backticks (`` **Stage:** `closed` ``), the same
// markup an agent writes by hand elsewhere in the ledger. The capture must still read `closed`, or the
// gate never matches and pruning is silently disabled forever.
const tmpBacktick = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-'));
fs.writeFileSync(path.join(tmpBacktick, 'ledger.md'), '# ledger\n\n**Stage:** `closed`\n');
assert.equal(readStage(tmpBacktick), 'closed', 'strips backticks from the captured stage value');
const backtickAll = new Set(['main', 'chore/backticked']);
assert.deepEqual(
  selectPrunable(['backticked'], containedIn('chore/backticked'), () => STALE, () => readStage(tmpBacktick), backtickAll, () => null),
  ['backticked'],
  'a ledger whose stage line wraps the value in backticks is still prunable'
);
fs.rmSync(tmpBacktick, { recursive: true, force: true });

// The two spellings a maintainer or an agent also plausibly writes: a backticked value followed by a
// period, and an emphasized value. Both must normalize, or the gate silently stops matching and the
// scope is never pruned. Every one of these is a real stage line, so the strip must not care in which
// order the markers appear.
for (const [line, label] of [
  ['**Stage:** `closed`.', 'a backticked value with a trailing period'],
  ['**Stage:** **closed**', 'an emphasized value'],
  ['**Stage:** closed.', 'a plain value with a trailing period'],
  ['**Stage:** `closed`', 'a backticked value'],
  ['**Stage:** closed', 'a plain value'],
]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-'));
  fs.writeFileSync(path.join(dir, 'ledger.md'), `# ledger\n\n${line}\n`);
  assert.equal(readStage(dir), 'closed', `normalizes ${label}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// The strip must not turn a different stage into `closed`. Every one of these stays itself, so a scope
// that has not closed is never pruned by a normalization accident.
for (const [line, expected] of [
  ['**Stage:** documented-unreviewed', 'documented-unreviewed'],
  ['**Stage:** `reviewed`', 'reviewed'],
  ['**Stage:** unclosed', 'unclosed'],
  ['**Stage:** not-closed', 'not-closed'],
]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-'));
  fs.writeFileSync(path.join(dir, 'ledger.md'), `# ledger\n\n${line}\n`);
  assert.equal(readStage(dir), expected, `leaves \`${expected}\` as itself`);
  assert.notEqual(readStage(dir), 'closed', `never reads \`${expected}\` as closed`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- Gone, and present-but-not-contained: the two halves of the branch decision ---
//
// Absence stays a landed signal beside containment (ADR 0007, ADR 0053), for the hosts that delete the
// branch on merge. It is read from *this clone's* refs, which is why it never arrived on its own:
// nothing removes the local branch, and a stale remote-tracking ref outlives the host's deletion.
const ALL = (...names) => new Set(['main', ...names]);
const nothingContained = () => false;

assert.deepEqual(
  selectPrunable(['squashed'], nothingContained, () => STALE, closed, ALL(), () => null),
  ['squashed'],
  'a gone branch, closed and past the TTL, is prunable'
);
assert.deepEqual(
  selectPrunable(['squashed'], nothingContained, () => STALE, () => 'reviewed', ALL(), () => null),
  [],
  'a gone branch whose stage is not `closed` is never prunable'
);
assert.deepEqual(
  selectPrunable(['squashed'], nothingContained, () => FRESH, closed, ALL(), () => null),
  [],
  'a gone branch inside the TTL is never prunable'
);
assert.deepEqual(
  selectPrunable(['squashed'], nothingContained, () => STALE, () => null, ALL(), () => null),
  [],
  'a gone branch with no readable stage is never prunable'
);

// Present-but-not-contained is the case absence must not swallow: the branch exists and carries
// content base does not hold, so the work is still in flight.
assert.deepEqual(
  selectPrunable(['live'], nothingContained, () => STALE, closed, ALL('feat/live'), () => null),
  [],
  'a branch that exists but is not contained is never prunable'
);
assert.deepEqual(
  selectPrunable(['landed'], containedIn('feat/landed'), () => STALE, closed, ALL('feat/landed'), () => null),
  ['landed'],
  'a branch that exists and is contained is prunable'
);

// A remote-tracking ref the user has not pruned counts as present, so an unfetched repository asks
// containment about it — and a branch base does not hold keeps the scope alive. Failing closed is the
// whole point: absence is only evidence when the refs are current.
assert.deepEqual(
  selectPrunable(['unfetched'], nothingContained, () => STALE, closed, ALL('fix/unfetched'), () => null),
  [],
  'a stale remote-tracking ref whose content base lacks keeps the scope alive — absence fails closed'
);

// Absence is matched by the same shape rule as before: only a change-typed branch names this scope.
// A `slice/<scope>/<id>` or a maintainer's `wip/<scope>` must not read as the scope branch, or its
// presence would keep a finished run's root forever.
assert.deepEqual(
  selectPrunable(['exports'], nothingContained, () => STALE, closed, ALL('slice/exports/03', 'wip/exports'), () => null),
  ['exports'],
  'a slice branch and a wip branch do not count as the scope branch being present'
);

// --- readBranch / resolveBranch: the ledger's `**Branch:**` line is authoritative, the shape scan is
// only the pre-CLI fallback (references/scope-mode.md, `## The scope branch`) ---
//
// The shape scan alone reads a live, unmerged branch as gone in two ordinary ways: a change type it
// doesn't recognise, or a slug that drifted from the run-root's directory name. Both would prune a run
// still mid-flight, because "gone" and "closed" together mean prunable.
{
  // `feature/alpha`: the type is not in CHANGE_TYPES (only `feat` is), so the shape scan reads
  // `alpha`'s branch as gone even though it exists and is unmerged.
  const alphaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
  fs.writeFileSync(path.join(alphaDir, 'ledger.md'), '# ledger\n\n**Branch:** feature/alpha\n');
  assert.equal(readBranch(alphaDir), 'feature/alpha', 'reads the exact branch off the ledger line');
  const alphaAll = new Set(['main', 'feature/alpha']);
  assert.deepEqual(
    selectPrunable(['alpha'], nothingContained, () => STALE, closed, alphaAll, () => readBranch(alphaDir)),
    [],
    'an unrecognised-type branch the ledger names as present is never read as gone'
  );
  fs.rmSync(alphaDir, { recursive: true, force: true });

  // `fix/delta-v2`: the type is recognised, but the run-root directory name (`delta`) is not the
  // branch's last segment (`delta-v2`), so the shape scan misses it too.
  const deltaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
  fs.writeFileSync(path.join(deltaDir, 'ledger.md'), '# ledger\n\n**Branch:** fix/delta-v2\n');
  const deltaAll = new Set(['main', 'fix/delta-v2']);
  assert.deepEqual(
    selectPrunable(['delta'], nothingContained, () => STALE, closed, deltaAll, () => readBranch(deltaDir)),
    [],
    'a drifted-slug branch the ledger names as present is never read as gone'
  );
  fs.rmSync(deltaDir, { recursive: true, force: true });

  // A pre-CLI ledger carries no `**Branch:**` line: readBranch returns null, and selectPrunable falls
  // back to the shape scan exactly as before this change.
  const preDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
  fs.writeFileSync(path.join(preDir, 'ledger.md'), '# ledger\n\n**Stage:** closed\n');
  assert.equal(readBranch(preDir), null, 'a pre-CLI ledger carries no Branch line');
  const preAll = new Set(['main', 'fix/precli']);
  assert.deepEqual(
    selectPrunable(['precli'], containedIn('fix/precli'), () => STALE, closed, preAll, () => readBranch(preDir)),
    ['precli'],
    'a pre-CLI ledger falls back to the shape scan, which reads a merged branch as prunable'
  );
  fs.rmSync(preDir, { recursive: true, force: true });

  // A hand-written ledger's `**Branch:**` line may carry the same markup `/superdev:ship` §4 writes on
  // `**Stage:**` — hand-written is exactly the population that produces it. Unlike Stage, Branch's
  // failure direction is destructive: an unstripped value matches nothing in the branch set,
  // `resolveBranch` reads a live, unmerged branch as gone, and the run root is deleted instead of
  // skipped. RED without the shared `readHeader` strip: each of these branches is present and unmerged,
  // so the scope must never be pruned.
  for (const [line, expected] of [
    ['**Branch:** `fix/bt`', 'fix/bt'],
    ['**Branch:** **fix/em**', 'fix/em'],
    ['**Branch:** fix/period.', 'fix/period'],
  ]) {
    const markupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
    fs.writeFileSync(path.join(markupDir, 'ledger.md'), `# ledger\n\n${line}\n`);
    assert.equal(readBranch(markupDir), expected, `readBranch strips markup down to ${expected}`);
    const alive = new Set(['main', expected]);
    assert.deepEqual(
      selectPrunable(['x'], nothingContained, () => STALE, closed, alive, () => readBranch(markupDir)),
      [],
      `a scope whose branch is ${expected}, alive and unmerged, is never pruned`
    );
    fs.rmSync(markupDir, { recursive: true, force: true });
  }

  // An empty `**Branch:**` line (the CLI writes the header before the value is known) must read as
  // absent, not spill into the next header's name. `\s` matches `\n`, so an ungated `\s*` after the
  // colon lets a value-less `**Branch:**` line capture the following line's `**Anchor:**` token,
  // stripped down to `Anchor` — truthy, and present in no real branch set, so `resolveBranch` reads a
  // live, unmerged branch as gone. Gone + closed + past TTL prunes a run root with a live branch.
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
  fs.writeFileSync(
    path.join(emptyDir, 'ledger.md'),
    '# ledger\n\n**Stage:** closed\n**Branch:**\n**Anchor:** #197 — Epic\n'
  );
  assert.equal(readBranch(emptyDir), null, 'an empty Branch line never captures the next line\'s token');
  const emptyAll = new Set(['main', 'feat/emptybranch']);
  assert.deepEqual(
    selectPrunable(['emptybranch'], nothingContained, () => STALE, closed, emptyAll, () => readBranch(emptyDir)),
    [],
    'a scope with an empty Branch line and a live, unmerged branch is never pruned'
  );
  fs.rmSync(emptyDir, { recursive: true, force: true });

  // The exact-branch read is exclusive, not a fallback union with the shape scan: when the ledger
  // names a branch, only that literal name counts as present. A different, shape-matching branch
  // alive in the repo (`fix/exports`, matching the scope by name) must not rescue a scope whose
  // ledger names a branch (`fix/renamed-away`) that is actually gone — that branch was renamed, and
  // the shape match is a coincidence, not evidence the named one survived.
  const exclusiveAll = new Set(['main', 'fix/exports']);
  assert.deepEqual(
    selectPrunable(['exports'], nothingContained, () => STALE, closed, exclusiveAll, () => 'fix/renamed-away'),
    ['exports'],
    'a ledger-named branch that is gone is never rescued by an unrelated shape-matching branch'
  );
}

// --- branchNamesFrom: normalises `git for-each-ref` output to comparable branch names ---
const refs = [
  'refs/heads/main',
  'refs/heads/fix/local-only',
  'refs/remotes/origin/main',
  'refs/remotes/origin/fix/on-remote',
  'refs/remotes/origin/HEAD',
  'refs/remotes/upstream/feat/other-remote',
  '',
];
const names = branchNamesFrom(refs);
assert.equal(names.has('fix/local-only'), true, 'a local branch keeps its name');
assert.equal(names.has('fix/on-remote'), true, 'a remote-tracking ref drops its remote prefix');
assert.equal(names.has('feat/other-remote'), true, 'a second remote is handled the same way');
assert.equal(names.has('HEAD'), false, "origin/HEAD is a symbolic ref, not a branch");
assert.equal(names.has('origin/main'), false, 'no name keeps its remote prefix');

// The hook `require`s `../lib/ledger.js`, `../lib/containment.js`, and `../lib/git-spawn.js`, and nothing else
// asserts that `lib/` actually ships alongside `hooks/` in a real install. If a future packaging change stopped
// shipping it, this hook would fail closed and prune nothing, forever, with no signal beyond that silence.
for (const mod of ['ledger.js', 'containment.js', 'git-spawn.js']) {
  assert.equal(
    fs.existsSync(path.join(path.dirname(hookPath), '..', 'lib', mod)),
    true,
    `lib/${mod} ships alongside this hook`
  );
}

// --- one reader, shared with scripts/scope.js (ADR 0022) ---
//
// This hook carried its own header regex and it drifted on four axes — anchoring, capture width,
// whether the whitespace after the colon crossed a newline, and normalisation — while being hardened
// against defects on this very delete path. Every vector below is the same one `tests/scope-ledger-header.test.js`
// asserts, so agreement is a property of there being one implementation rather than of two staying
// in step.
{
  const scope = require(path.join(path.dirname(hookPath), '..', 'scripts', 'scope.js'));
  const mk = (body) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-hdr-'));
    fs.writeFileSync(path.join(d, 'ledger.md'), body);
    return d;
  };

  for (const [line, name, expected, label] of [
    ['**Stage:** closed', 'Stage', 'closed', 'a plain token'],
    ['**Stage:** `closed`.', 'Stage', 'closed', 'a backticked token with a period'],
    ['**Stage:** **closed**', 'Stage', 'closed', 'an emphasised token'],
    ['**Stage:** reviewed', 'Stage', 'reviewed', 'a non-closed stage, unchanged'],
    ['**Branch:** `fix/x`', 'Branch', 'fix/x', 'a backticked branch'],
    // The capture-width difference: the hook used to take the first token, so an anchor title
    // stopped at its first space. `scope.js` takes the rest of the line, and now so does this.
    ['**Anchor:** #208 — Epic: one reader, shared.', 'Anchor', '#208 — Epic: one reader, shared.', 'a prose anchor title'],
  ]) {
    const dir = mk(`# ledger\n\n${line}\n`);
    const viaHook = readHeader(dir, name);
    const viaScope = scope.readLedgerHeader(`# ledger\n\n${line}\n`, name);
    assert.equal(viaHook, expected, `hook reads ${label}`);
    assert.equal(viaHook, viaScope, `hook and scope.js agree on ${label}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // A CRLF ledger — one an editor or `core.autocrlf` wrote — reads exactly as the LF one does, on
  // both sides. The hook reaching a different answer here is what would let it miss `closed` and
  // never reap a finished run root, silently.
  const crlf = mk('# ledger\r\n\r\n**Stage:** closed\r\n**Branch:** fix/crlf\r\n');
  assert.equal(readStage(crlf), 'closed', 'the hook reads a CRLF Stage');
  assert.equal(readBranch(crlf), 'fix/crlf', 'the hook reads a CRLF Branch');
  assert.equal(
    readStage(crlf),
    scope.readLedgerHeader('# ledger\r\n\r\n**Stage:** closed\r\n**Branch:** fix/crlf\r\n', 'Stage'),
    'hook and scope.js agree under CRLF'
  );
  fs.rmSync(crlf, { recursive: true, force: true });

  // A value-less header line reads as absent, and never reaches the next line's token.
  const empty = mk('# ledger\n\n**Stage:** closed\n**Branch:**\n**Anchor:** #208 — Epic\n');
  assert.equal(readHeader(empty, 'Branch'), null, 'an empty Branch line is absent');
  assert.equal(readHeader(empty, 'Stage'), 'closed', 'its neighbours still read');
  assert.equal(readBranch(empty), null, 'readBranch agrees');
  assert.equal(readStage(empty), 'closed', 'readStage agrees');
  fs.rmSync(empty, { recursive: true, force: true });

  assert.equal(readHeader(path.join(os.tmpdir(), 'no-such-scope-dir'), 'Stage'), null, 'an unreadable ledger is null');
}

console.log('scope-prune tests ok');
