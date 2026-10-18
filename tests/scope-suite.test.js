'use strict';

// Suite for plugin/scripts/scope.js's suite record: `suite set`, `get suite`, `suite reusable` (the last full-suite
// run's result and the commit it ran on, `references/scope-mode.md` `## The ledger`, INV-0017), the Markdown-only
// carry (ADR 0128), and `isTestPath`, the one test-path classifier. Each case builds its own git repository, so the
// suite needs only `run` and the exports from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scopePath, run } = require('./scope-setup');
const { appendTrace, isTestPath } = require(scopePath);

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
