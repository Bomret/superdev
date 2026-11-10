'use strict';

// Suite for plugin/scripts/scope.js's suite record: `suite set`, `get suite`, `suite reusable` (the last full-suite
// run's result and the commit it ran on, `references/run-state.md` `## The ledger`, INV-0017), the Markdown-only
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
// (`references/run-state.md` `## The ledger`, INV-0017) ---------------------------------------
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

  // suite reusable: a green record on an earlier commit carries to a tip with no recorded run when every path
  // changed since is Markdown, here under `docs/plans/<branch>/` (INV-0017, ADR 0110, ADR 0128, ADR 0189).
  const planDir = path.join('docs', 'plans', 'feat', 'suite-demo');
  fs.mkdirSync(path.join(suiteRepo, planDir), { recursive: true });
  fs.writeFileSync(path.join(suiteRepo, planDir, '01-tick.md'), 'ticked\n');
  gitSuite(['add', '.'], suiteRepo);
  gitSuite(['commit', '-q', '-m', 'tick'], suiteRepo);
  r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
  assert.ok(
    r.ok && r.out === 'reusable',
    'a record on an earlier commit carries across a Markdown-only commit with no run at the tip: ' + (r.err || '')
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

  // suite reusable: a passing full or whole run on a clean tree at the exact tip is reusable, whoever wrote it, with no
  // suite record or a record at another commit (ADR 0182). The latest such line at the tip decides.
  const exactTip = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
  traceRun(noSuiteRoot, 'focused', 'pass', exactTip, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo);
  assert.ok(!r.ok && /no suite record/.test(r.err), 'a focused run at the tip backs no reuse: ' + (r.err || ''));
  traceRun(noSuiteRoot, 'full', 'pass', exactTip, 'dirty');
  assert.ok(!callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo).ok, 'a full run on a dirty tree at the tip is not reusable');
  traceRun(noSuiteRoot, 'full', 'pass', exactTip, 'clean');
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo).ok,
    'a passing full run on a clean tree at the tip is reusable with no suite record'
  );
  // The accepted run becomes the suite record (ADR 0186).
  assert.strictEqual(callIn(['get', 'suite', '--root', noSuiteRoot], suiteRepo).out, `green ${exactTip}`, 'the exact-tip route records the run it accepted');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', '--root', noSuiteRoot], suiteRepo);
  assert.ok(!r.ok, 'a full run at the tip does not satisfy --whole');
  traceRun(noSuiteRoot, 'whole', 'pass', exactTip, 'clean');
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--whole', '--root', noSuiteRoot], suiteRepo).ok,
    'a passing whole run at the tip satisfies --whole over a record without the kind'
  );
  assert.strictEqual(callIn(['get', 'suite', '--root', noSuiteRoot], suiteRepo).out, `green ${exactTip} whole`, 'an accepted whole run records the kind');
  traceRun(noSuiteRoot, 'full', 'fail', exactTip, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo);
  assert.ok(!r.ok, 'a later failing full run at the tip refuses reuse');
  traceRun(noSuiteRoot, 'full', 'pass', exactTip, 'clean');
  // A record at another commit, green or red, does not hide the tip's own passing run.
  assert.ok(callIn(['suite', 'set', 'red', newSha, '--root', noSuiteRoot], suiteRepo).ok, 'suite set red at an earlier commit');
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo).ok,
    'a red record at an earlier commit leaves a passing full run at the tip reusable'
  );
  assert.strictEqual(callIn(['get', 'suite', '--root', noSuiteRoot], suiteRepo).out, `green ${exactTip} whole`, 'the record at the earlier commit is replaced by the tip, keeping the passing whole run\'s kind');
  // A red record at the tip itself is the rerun's (ADR 0172): a passing run after it does not override it.
  assert.ok(callIn(['suite', 'set', 'red', exactTip, '--root', noSuiteRoot], suiteRepo).ok, 'suite set red at the tip');
  traceRun(noSuiteRoot, 'full', 'pass', exactTip, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo);
  assert.ok(!r.ok && /red/.test(r.err), 'a red record at the tip is not overridden by a later passing run: ' + (r.err || ''));

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

  // A green record with no kind at the tip gives way to a passing whole run there: --whole accepts it and records the kind
  // (ADR 0186).
  assert.ok(callIn(['suite', 'set', 'green', wholeTip, ...SR], suiteRepo).ok, 'suite set green, no kind');
  assert.ok(callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo).ok, 'a passing whole run at the tip meets --whole over a no-kind record');
  assert.strictEqual(callIn(['get', 'suite', ...SR], suiteRepo).out, `green ${wholeTip} whole`, 'the accepted whole run records the kind');

  // suite set (no --whole): a green record with no kind fails a --whole check, naming the missing
  // kind, once no whole run passes at the tip, but still satisfies a plain check.
  assert.ok(callIn(['suite', 'set', 'green', wholeTip, ...SR], suiteRepo).ok, 'suite set green, no kind');
  traceRun(suiteRoot, 'whole', 'fail', wholeTip, 'clean');
  traceRun(suiteRoot, 'full', 'pass', wholeTip, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
  assert.ok(!r.ok && /kind/.test(r.err), 'a record with no kind fails a --whole check, naming the kind: ' + (r.err || ''));
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok,
    'the same record still satisfies a plain reusable check'
  );
  traceRun(suiteRoot, 'whole', 'pass', wholeTip, 'clean');

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

  // suite reusable --whole: a green whole record on an earlier commit carries across Markdown-only commits.
  assert.ok(
    callIn(['suite', 'set', 'green', wholeTip, '--whole', ...SR], suiteRepo).ok,
    'suite set green --whole for the earlier-commit case'
  );
  fs.writeFileSync(path.join(suiteRepo, planDir, 'another-tick.md'), 'ticked again\n');
  gitSuite(['add', '.'], suiteRepo);
  gitSuite(['commit', '-q', '-m', 'tick again'], suiteRepo);
  r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
  assert.ok(
    r.ok && r.out === 'reusable',
    'a whole record on an earlier commit carries with --whole across Markdown-only commits: ' + (r.err || '')
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

  // The reproduction: a green full record at R, one README.md commit to T, no run recorded at T (ADR 0189).
  const T = commit('README.md', 'doc\n');
  let r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'clean']]));
  assert.ok(r.ok && r.out === 'reusable', 'a green record carries across a Markdown-only commit with no run at T: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(r.ok && r.out === 'reusable', 'a passing focused run at T changes nothing: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'clean'], ['focused', 'pass', T, 'dirty']]));
  assert.ok(r.ok && r.out === 'reusable', 'a passing run on a dirty tree refuses nothing: ' + (r.err || ''));

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

  // The runs at T: a failed run of any kind refuses and a later pass hides none; a latest run reading unknown refuses.
  const backed = [['full', 'pass', R, 'clean']];
  for (const [lines, re, what] of [
    [[['focused', 'fail', T, 'clean']], /focused run at the tip failed/, 'a failed focused run at T'],
    [[['focused', 'fail', T, 'clean'], ['focused', 'pass', T, 'clean']], /focused run at the tip failed/, 'a failed focused run at T hidden by a later pass'],
    [[['focused', 'pass', T, 'clean'], ['focused', 'fail', T, 'clean']], /focused run at the tip failed/, 'a later failed focused run at T'],
    [[['focused', 'unknown', T, 'clean']], /is unknown/, 'an unknown run at T'],
    [[['focused', 'fail', T, 'clean'], ['focused', 'unknown', T, 'clean']], /failed/, 'a failed run followed by an unknown one'],
    [[['focused', 'pass', T, 'clean'], ['full', 'unknown', T, 'clean']], /full run at the tip is unknown/, 'a latest full run reading unknown'],
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

  // The latest run at the tip, of any kind, decides: a pass after an unknown reuses; a lone unknown path run refuses.
  r = reusable(root(`green @ ${R}`, [...backed, ['focused', 'unknown', T, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(r.ok && r.out === 'reusable', 'a focused pass after an unknown focused run at T reuses: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [...backed, ['full', 'unknown', T, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(r.ok && r.out === 'reusable', 'a focused pass after an unknown full run at T reuses: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [...backed, ['path', 'unknown', T, 'clean']]));
  assert.ok(!r.ok && /path run at the tip is unknown/.test(r.err), 'an unknown path run at T refuses: ' + (r.err || ''));
  // A failed run at T refuses with no focused run at T at all.
  for (const k of ['whole', 'path']) {
    r = reusable(root(`green @ ${R}`, [...backed, [k, 'fail', T, 'clean']]));
    assert.ok(!r.ok && new RegExp(`a ${k} run at the tip failed`).test(r.err), `a failed ${k} run at T with no focused run refuses: ${r.err || ''}`);
  }

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

// --- suite reusable: the complete-selector carry (ADR 0175, INV-0017) ----------------------------
// A green record carries across a non-Markdown delta where the tip's verification.md declares the focused
// selector complete, the focused command takes `{paths}`, and a passing clean focused run at the tip covered
// every changed path. Each case builds its own repository from the verification.md text it needs.
{
  const { encodePaths, encodeArgs } = require('../plugin/lib/trace-log.js');
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
  const vRel = path.join('docs', 'agents', 'verification.md');
  const verification = (focused, extra) => `# V\n\n\`\`\`\nnode all.js\n\`\`\`\n\n\`\`\`\n${focused}\n\`\`\`\n${extra || ''}`;
  const DECLARED = '\n## Complete selector\n\nThe focused command selects every test a changed path can affect.\n';
  const withFiles = (files) => `${DECLARED}\nSelector files:\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;

  // fixture(text) -> helpers over a fresh repository whose first commit R holds `text` as verification.md.
  const fixture = (text) => {
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-complete-')));
    g(['init', '-q', '-b', 'main'], repo);
    g(['config', 'user.email', 'test@example.com'], repo);
    g(['config', 'user.name', 'test'], repo);
    fs.writeFileSync(path.join(repo, '.gitignore'), '.superdev/\n');
    fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(repo, vRel), text);
    fs.mkdirSync(path.join(repo, 'src', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'a\n');
    fs.writeFileSync(path.join(repo, 'src', 'deep', 'd.js'), 'd\n');
    fs.writeFileSync(path.join(repo, 'old.js'), 'o\n');
    g(['add', '.'], repo);
    g(['commit', '-q', '-m', 'base'], repo);
    const R = g(['rev-parse', 'HEAD'], repo);
    let n = 0;
    const root = (record, lines) => {
      const rt = path.join(repo, '.superdev', 'scopes', `cc-${++n}`);
      fs.mkdirSync(rt, { recursive: true });
      fs.writeFileSync(
        path.join(rt, 'ledger.md'),
        `# Ledger — cc-${n}\n\n**Stage:** documented\n**Branch:** main\n**Suite:** ${record}\n**Anchor:** #1 — carry\n\n` +
          '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n',
        'utf8'
      );
      for (const l of lines) appendTrace(rt, { kind: 'run', fields: l });
      return rt;
    };
    const commit = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      if (content === null) fs.rmSync(path.join(repo, file));
      else fs.writeFileSync(path.join(repo, file), content);
      g(['add', '-A'], repo);
      g(['commit', '-q', '-m', file], repo);
      return g(['rev-parse', 'HEAD'], repo);
    };
    const reusable = (rt, cwd, ...flags) => callIn(['suite', 'reusable', '--branch', 'main', ...flags, '--root', rt], cwd || repo);
    return { repo, R, root, commit, reusable };
  };
  const base = (R) => ['full', 'pass', R, 'clean'];
  const focused = (sha, paths, result, tree) => ['focused', result || 'pass', sha, tree || 'clean', encodePaths(paths)];
  const cases = [];
  const cleanup = () => cases.forEach((f) => fs.rmSync(f.repo, { recursive: true, force: true }));
  const make = (text) => { const f = fixture(text); cases.push(f); return f; };
  try {
    const FOCUSED = 'node focus.js {paths}';
    const f = make(verification(FOCUSED, DECLARED));
    const T = f.commit('src/a.js', 'changed\n');
    let r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, ['src/a.js'])]));
    assert.ok(r.ok && r.out === 'reusable', 'a covering clean focused run carries a green record: ' + (r.err || ''));

    // A run line in the layout with the duration and the arguments field reads as one without them (the lines above): same verdict.
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), [...focused(T, ['src/a.js']), '120', encodeArgs(['focus.js', 'src/a.js'])]]));
    assert.ok(r.ok && r.out === 'reusable', 'a covering focused run with the arguments field carries a green record: ' + (r.err || ''));

    // The kind carries.
    r = f.reusable(f.root(`green @ ${f.R} whole`, [['whole', 'pass', f.R, 'clean'], focused(T, ['src/a.js'])]), null, '--whole');
    assert.ok(r.ok, 'a whole record carries as whole: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, ['src/a.js'])]), null, '--whole');
    assert.ok(!r.ok && /kind/.test(r.err), 'a kindless record still fails --whole: ' + (r.err || ''));

    // Paths recorded as typed: ./x, an absolute path, and a path with a comma all compare normalized.
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, ['./src/a.js'])]));
    assert.ok(r.ok, 'a ./ path covers: ' + (r.err || ''));
    // A selector may reach fewer tests for a directory than for a file under it, so only the path itself covers.
    for (const dir of ['src', 'src/', '.', f.repo]) {
      r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, [dir])]));
      assert.ok(!r.ok && /fewer paths/.test(r.err), `a directory (${dir}) covers no file under it: ` + (r.err || ''));
    }
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, [path.join(f.repo, 'src', 'a.js')])]));
    assert.ok(r.ok, 'an absolute path covers: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T, ['srcx'])]));
    assert.ok(!r.ok && /fewer|cover/.test(r.err), 'a sibling prefix is no directory cover: ' + (r.err || ''));

    // Refusals at the tip.
    for (const [lines, re, what] of [
      [[], /no focused run recorded at the tip/, 'no focused run'],
      [[focused(T, ['src/a.js'], 'fail')], /fail/, 'a failed focused run'],
      [[focused(T, ['src/a.js'], 'unknown')], /unknown/, 'an unknown focused run'],
      [[focused(T, ['src/a.js'], 'pass', 'dirty')], /dirty/, 'a dirty focused run'],
      [[['focused', 'pass', T, 'clean', '-']], /no recorded path set/, 'a run with no path set'],
      [[['focused', 'pass', T, 'clean']], /no recorded path set/, 'a run line with no path field'],
      [[focused(T, ['src/other.js'])], /fewer|cover/, 'a run covering fewer paths'],
      [[focused(T, ['src/a.js']), ['full', 'fail', T, 'clean']], /full run at the tip failed/, 'a failed full run'],
      [[focused(T, ['src/a.js']), ['whole', 'fail', T, 'clean']], /whole run at the tip failed/, 'a failed whole run'],
      [[focused(T, ['src/a.js']), ['path', 'fail', T, 'clean', 'tests/x.test.js']], /path run at the tip failed/, 'a failed path run'],
    ]) {
      r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), ...lines]));
      assert.ok(!r.ok && /predates tip/.test(r.err) && re.test(r.err), `${what} refuses: ${r.err || ''}`);
    }
    // The record itself: red, or no backing run.
    r = f.reusable(f.root(`red @ ${f.R}`, [base(f.R), focused(T, ['src/a.js'])]));
    assert.ok(!r.ok && /not green/.test(r.err), 'a red record refuses: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [focused(T, ['src/a.js'])]));
    assert.ok(!r.ok && /no full or whole run recorded/.test(r.err), 'an unbacked record refuses: ' + (r.err || ''));

    // Deletions and both sides of a rename count as changed paths.
    const T2 = f.commit('old.js', null);
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T2, ['src/a.js'])]));
    assert.ok(!r.ok && /fewer|cover/.test(r.err), 'a deleted path must be covered: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T2, ['src/a.js', 'old.js'])]));
    assert.ok(r.ok, 'a deleted path covered carries: ' + (r.err || ''));
    fs.renameSync(path.join(f.repo, 'src', 'deep', 'd.js'), path.join(f.repo, 'src', 'deep', 'e.js'));
    g(['add', '-A'], f.repo);
    g(['commit', '-q', '-m', 'rename'], f.repo);
    const T3 = g(['rev-parse', 'HEAD'], f.repo);
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/a.js', 'old.js', 'src/deep/e.js'])]));
    assert.ok(!r.ok, 'a rename covered on its new side only refuses: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/a.js', 'old.js', 'src/deep/e.js', 'src/deep/d.js'])]));
    assert.ok(r.ok, 'a rename covered on both sides carries: ' + (r.err || ''));

    // No carry builds on another: a focused run covering only the paths since an intermediate tip does not carry.
    r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/deep/e.js', 'src/deep/d.js'])]));
    assert.ok(!r.ok, 'a run covering only the paths since an intermediate tip does not carry: ' + (r.err || ''));
    r = f.reusable(f.root(`green @ ${T}`, [focused(T3, ['old.js', 'src/deep/e.js', 'src/deep/d.js'])]));
    assert.ok(!r.ok && /no full or whole run recorded/.test(r.err), 'no step wrote a carried record at T, so it has no backing run: ' + (r.err || ''));

    // From a subdirectory, and under diff.relative=true, reuse decides the same (triage #1004, #1015).
    g(['config', 'diff.relative', 'true'], f.repo);
    for (const cwd of [f.repo, path.join(f.repo, 'src', 'deep'), path.join(f.repo, 'docs')]) {
      r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/a.js', 'old.js', 'src/deep/e.js', 'src/deep/d.js'])]), cwd);
      assert.ok(r.ok, `a covered delta carries from ${path.relative(f.repo, cwd) || 'root'} under diff.relative: ` + (r.err || ''));
      r = f.reusable(f.root(`green @ ${f.R}`, [base(f.R), focused(T3, ['src/deep/e.js', 'src/deep/d.js'])]), cwd);
      assert.ok(!r.ok && /fewer|cover/.test(r.err), `a delta outside the subdirectory is still seen from ${path.relative(f.repo, cwd) || 'root'}: ` + (r.err || ''));
    }
    g(['config', '--unset', 'diff.relative'], f.repo);

    // Markdown-only rule (ADR 0128, ADR 0189): a Markdown delta under the declaration carries with or without a recorded run.
    const m = make(verification(FOCUSED, DECLARED));
    const MT = m.commit('notes.md', 'n\n');
    r = m.reusable(m.root(`green @ ${m.R}`, [base(m.R), ['focused', 'pass', MT, 'clean']]));
    assert.ok(r.ok, 'the Markdown-only carry stands under the declaration: ' + (r.err || ''));
    r = m.reusable(m.root(`green @ ${m.R}`, [base(m.R)]));
    assert.ok(r.ok, 'the Markdown-only carry needs no run at the tip under the declaration: ' + (r.err || ''));
    r = m.reusable(m.root(`green @ ${m.R}`, [base(m.R), ['focused', 'fail', MT, 'clean']]));
    assert.ok(!r.ok && /focused run at the tip failed/.test(r.err), 'a failed focused run refuses the Markdown carry under the declaration: ' + (r.err || ''));

    // A covered commit M, then Markdown-only commits to the tip (ADR 0189): the record carries to the tip with no run there.
    const cm = make(verification(FOCUSED, DECLARED));
    const CM = cm.commit('src/a.js', 'c\n');
    const CT = cm.commit('README.md', 'r\n');
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CM, ['src/a.js'])]));
    assert.ok(r.ok && r.out === 'reusable', 'a covered commit then a Markdown-only commit carries with no run at the tip: ' + (r.err || ''));
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CM, ['src/a.js']), ['full', 'fail', CT, 'clean']]));
    assert.ok(!r.ok && /predates tip/.test(r.err), 'a failed run at the tip refuses the carry through a covered commit: ' + (r.err || ''));
    // The refusal names the Markdown tail's own reason where that tail is what failed.
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CM, ['src/a.js']), ['full', 'unknown', CT, 'clean']]));
    assert.ok(!r.ok && /full run at the tip is unknown/.test(r.err), 'the Markdown tail\'s reason names the blocker: ' + (r.err || ''));
    const CX = cm.commit('src/b.js', 'b\n');
    cm.commit('NOTES.md', 'n\n');
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CM, ['src/a.js'])]));
    assert.ok(!r.ok && /predates tip/.test(r.err), 'a non-Markdown change after the covered commit refuses: ' + (r.err || ''));
    r = cm.reusable(cm.root(`green @ ${cm.R}`, [base(cm.R), focused(CX, ['src/a.js', 'README.md', 'src/b.js'])]));
    assert.ok(r.ok, 'a later covered commit then Markdown carries: ' + (r.err || ''));
    // The Markdown-only tail is case-sensitive: an uppercase `.MD` after the covered commit refuses.
    const up = make(verification(FOCUSED, DECLARED));
    const UM = up.commit('src/a.js', 'c\n');
    up.commit('NOTES.MD', 'n\n');
    r = up.reusable(up.root(`green @ ${up.R}`, [base(up.R), focused(UM, ['src/a.js'])]));
    assert.ok(!r.ok && /predates tip/.test(r.err), 'a NOTES.MD commit after the covered commit refuses: ' + (r.err || ''));
    // A side commit with a later committer date, merged in, is listed before the covered commit's line; the walk
    // still reaches the covered commit.
    const sk = make(verification(FOCUSED, DECLARED));
    g(['checkout', '-q', '-b', 'side'], sk.repo);
    fs.writeFileSync(path.join(sk.repo, 'side.md'), 's\n');
    g(['add', '-A'], sk.repo);
    execFileSync('git', ['commit', '-q', '-m', 'side'], { cwd: sk.repo, env: { ...process.env, GIT_COMMITTER_DATE: '2099-01-01T00:00:00' } });
    const SQ = g(['rev-parse', 'HEAD'], sk.repo);
    g(['checkout', '-q', 'main'], sk.repo);
    const SM = sk.commit('src/a.js', 'c\n');
    sk.commit('README.md', 'r\n');
    g(['checkout', '-q', SQ, '--', 'side.md'], sk.repo);
    const ST2 = g(['commit-tree', g(['write-tree'], sk.repo), '-p', 'HEAD', '-p', SQ, '-m', 'join'], sk.repo);
    g(['reset', '-q', '--hard', ST2], sk.repo);
    r = sk.reusable(sk.root(`green @ ${sk.R}`, [base(sk.R), focused(SM, ['src/a.js'])]));
    assert.ok(r.ok && r.out === 'reusable', 'a covered commit reached past a later-dated side commit carries: ' + (r.err || ''));

    // Refused: no declaration; a focused command without {paths}.
    const nd = make(verification(FOCUSED, ''));
    const NT = nd.commit('src/a.js', 'c\n');
    r = nd.reusable(nd.root(`green @ ${nd.R}`, [base(nd.R), focused(NT, ['src/a.js'])]));
    assert.ok(!r.ok && /src\/a\.js changed since and is not Markdown/.test(r.err), 'no declaration: the Markdown rule alone decides: ' + (r.err || ''));
    const np = make(verification('node focus.js', DECLARED));
    const PT = np.commit('src/a.js', 'c\n');
    r = np.reusable(np.root(`green @ ${np.R}`, [base(np.R), focused(PT, ['src/a.js'])]));
    assert.ok(!r.ok && /\{paths\}/.test(r.err), 'a focused command without {paths} refuses with its own reason: ' + (r.err || ''));

    // A listed selector file, or verification.md itself, in the delta refuses.
    const sf = make(verification(FOCUSED, withFiles(['tools/select.js'])));
    const ST = sf.commit('tools/select.js', 's\n');
    r = sf.reusable(sf.root(`green @ ${sf.R}`, [base(sf.R), focused(ST, ['tools/select.js'])]));
    assert.ok(!r.ok && /tools\/select\.js is a selector file/.test(r.err), 'a listed selector file refuses: ' + (r.err || ''));
    const vc = make(verification(FOCUSED, DECLARED));
    fs.writeFileSync(path.join(vc.repo, 'src', 'a.js'), 'changed\n');
    const VT = vc.commit(vRel, verification(FOCUSED, DECLARED) + '\nmore\n');
    r = vc.reusable(vc.root(`green @ ${vc.R}`, [base(vc.R), focused(VT, [vRel, 'src/a.js'])]));
    assert.ok(!r.ok && /verification configuration/.test(r.err), 'a verification.md change next to a code path refuses: ' + (r.err || ''));

    // A list item may carry text after its span, and a listed directory covers the files under it.
    const lt = make(verification(FOCUSED, `${DECLARED}\n- \`tools/select.js\` — the runner\n- \`tools/lib/\`\n`));
    const LT = lt.commit('tools/select.js', 's\n');
    r = lt.reusable(lt.root(`green @ ${lt.R}`, [base(lt.R), focused(LT, ['tools/select.js'])]));
    assert.ok(!r.ok && /tools\/select\.js is a selector file/.test(r.err), 'a listed file with trailing text refuses: ' + (r.err || ''));
    const dl = make(verification(FOCUSED, `${DECLARED}\n- \`tools/select.js\`\n- \`tools/lib/\`\n`));
    const LD = dl.commit('tools/lib/x.js', 'x\n');
    r = dl.reusable(dl.root(`green @ ${dl.R}`, [base(dl.R), focused(LD, ['tools/lib/x.js'])]));
    assert.ok(!r.ok && /tools\/lib\/x\.js is a selector file/.test(r.err), 'a file under a listed directory refuses: ' + (r.err || ''));
    const ld = make(verification(FOCUSED, `${DECLARED}\n- \`tools/lib/\`\n`));
    const LS = ld.commit('tools/libx.js', 'x\n');
    r = ld.reusable(ld.root(`green @ ${ld.R}`, [base(ld.R), focused(LS, ['tools/libx.js'])]));
    assert.ok(r.ok, 'a sibling of a listed directory is no selector file: ' + (r.err || ''));

    // The section is found outside code fences, and a subheading does not end it.
    const fc = make(verification(FOCUSED, '\n```\n## Complete selector\n```\n'));
    const FT = fc.commit('src/a.js', 'c\n');
    r = fc.reusable(fc.root(`green @ ${fc.R}`, [base(fc.R), focused(FT, ['src/a.js'])]));
    assert.ok(!r.ok && /src\/a\.js changed since and is not Markdown/.test(r.err), 'a fenced heading declares nothing: ' + (r.err || ''));
    const sh = make(verification(FOCUSED, `${DECLARED}\n### Files\n\n- \`tools/select.js\`\n`));
    const SH = sh.commit('tools/select.js', 's\n');
    r = sh.reusable(sh.root(`green @ ${sh.R}`, [base(sh.R), focused(SH, ['tools/select.js'])]));
    assert.ok(!r.ok && /tools\/select\.js is a selector file/.test(r.err), 'a list under a subheading still counts: ' + (r.err || ''));

    // A list item names its first backtick span wherever it sits, under any bullet or ordered marker.
    for (const item of ['- the runner: `tools/select.js`', '+ `tools/select.js`', '1. `tools/select.js`', '* `tools/select.js`']) {
      const mi = make(verification(FOCUSED, `${DECLARED}\n${item}\n`));
      const MI = mi.commit('tools/select.js', 's\n');
      r = mi.reusable(mi.root(`green @ ${mi.R}`, [base(mi.R), focused(MI, ['tools/select.js'])]));
      assert.ok(!r.ok && /tools\/select\.js is a selector file/.test(r.err), `the item ${item} lists its span: ` + (r.err || ''));
    }

    // A four-backtick fence holding a three-backtick line stays open: the heading inside it declares nothing.
    const f4 = make(verification(FOCUSED, '\n````\n```\n## Complete selector\n````\n'));
    const F4 = f4.commit('src/a.js', 'c\n');
    r = f4.reusable(f4.root(`green @ ${f4.R}`, [base(f4.R), focused(F4, ['src/a.js'])]));
    assert.ok(!r.ok && /src\/a\.js changed since and is not Markdown/.test(r.err), 'a heading inside a longer fence declares nothing: ' + (r.err || ''));

    // A failing covering focused run at the tip is not masked by an earlier pass.
    const mk = make(verification(FOCUSED, DECLARED));
    const MK = mk.commit('src/a.js', 'c\n');
    r = mk.reusable(mk.root(`green @ ${mk.R}`, [base(mk.R), focused(MK, ['src/a.js']), focused(MK, ['src/a.js'], 'fail'), focused(MK, ['src/other.js'])]));
    assert.ok(!r.ok && /fewer|cover/.test(r.err), 'pass, fail, then a narrower pass refuses: ' + (r.err || ''));
    r = mk.reusable(mk.root(`green @ ${mk.R}`, [base(mk.R), focused(MK, ['src/a.js'], 'fail'), focused(MK, ['src/a.js'])]));
    assert.ok(r.ok, 'a covering pass after a failure carries: ' + (r.err || ''));

    // Git errors read as git errors: an unreadable tip configuration, and no work tree to resolve an absolute path.
    const ge = make(verification(FOCUSED, DECLARED));
    const GT = ge.commit('src/a.js', 'c\n');
    const geRoot = ge.root(`green @ ${ge.R}`, [base(ge.R), focused(GT, ['src/a.js'])]);
    const blob = g(['rev-parse', `${GT}:${vRel}`], ge.repo);
    fs.rmSync(path.join(ge.repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
    r = ge.reusable(geRoot);
    assert.ok(!r.ok && /git could not read/.test(r.err) && !/not Markdown/.test(r.err), 'an unreadable declaration is a git error: ' + (r.err || ''));
    const gb = make(verification(FOCUSED, DECLARED));
    const GB = gb.commit('src/a.js', 'c\n');
    const gbRoot = gb.root(`green @ ${gb.R}`, [base(gb.R), focused(GB, [path.join(gb.repo, 'src', 'a.js')])]);
    const bare = path.join(gb.repo, '..', `${path.basename(gb.repo)}.git`);
    g(['clone', '-q', '--bare', gb.repo, bare], gb.repo);
    try {
      r = gb.reusable(gbRoot, bare);
      assert.ok(!r.ok && /git could not/.test(r.err) && !/no recorded path set/.test(r.err), 'an unresolvable work tree is a git error: ' + (r.err || ''));
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }

    // The declaration is read from the tip commit, never the working tree.
    const wt = make(verification(FOCUSED, DECLARED));
    const WT = wt.commit('src/a.js', 'c\n');
    fs.writeFileSync(path.join(wt.repo, vRel), verification(FOCUSED, ''));
    r = wt.reusable(wt.root(`green @ ${wt.R}`, [base(wt.R), focused(WT, ['src/a.js'])]));
    assert.ok(r.ok, 'a working-tree edit of the declaration changes nothing: ' + (r.err || ''));

    // A record not on an ancestor refuses.
    g(['checkout', '-q', '-b', 'side', f.R], f.repo);
    const SD = f.commit('side.js', 's\n');
    g(['checkout', '-q', 'main'], f.repo);
    r = f.reusable(f.root(`green @ ${SD}`, [base(SD), focused(T3, ['src/a.js', 'old.js', 'src/deep/e.js', 'src/deep/d.js'])]));
    assert.ok(!r.ok && /not an ancestor/.test(r.err), 'a record off the tip line refuses: ' + (r.err || ''));
  } finally {
    cleanup();
  }
}

// --- suite rerun and the recorded rerun (ADR 0172, INV-0017) ------------------------------------
// Under the complete-selector declaration, a full run at the tip that failed counts green once the ledger records
// a rerun of one test file for that tip, that file alone passed clean there, and a focused run passed clean there.
{
  const { encodePaths } = require('../plugin/lib/trace-log.js');
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
  const DECLARED = '\n## Complete selector\n\nThe focused command selects every test a changed path can affect.\n';
  const cases = [];
  // A repository whose first commit holds the verification text; `T` is its tip.
  const make = (extra) => {
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-rerun-')));
    cases.push(repo);
    g(['init', '-q', '-b', 'main'], repo);
    g(['config', 'user.email', 'test@example.com'], repo);
    g(['config', 'user.name', 'test'], repo);
    fs.writeFileSync(path.join(repo, '.gitignore'), '.superdev/\n');
    fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'docs', 'agents', 'verification.md'), `# V\n\n\`\`\`\nnode all.js\n\`\`\`\n\n\`\`\`\nnode focus.js {paths}\n\`\`\`\n${extra}`);
    fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'tests', 'a.test.js'), 'a\n');
    g(['add', '.'], repo);
    g(['commit', '-q', '-m', 'base'], repo);
    // The scope's range: one commit on `feat` changing src/x.js; `main` is the base branch.
    g(['checkout', '-q', '-b', 'feat'], repo);
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'x.js'), 'x\n');
    g(['add', '.'], repo);
    g(['commit', '-q', '-m', 'range'], repo);
    const T = g(['rev-parse', 'HEAD'], repo);
    let n = 0;
    const root = (record, lines) => {
      const rt = path.join(repo, '.superdev', 'scopes', `rr-${++n}`);
      fs.mkdirSync(rt, { recursive: true });
      fs.writeFileSync(path.join(rt, 'ledger.md'), `# Ledger — rr-${n}\n\n**Stage:** documented\n**Branch:** main\n**Suite:** ${record}\n**Anchor:** #1 — r\n\n` +
        '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n', 'utf8');
      for (const l of lines) appendTrace(rt, { kind: 'run', fields: l });
      return rt;
    };
    const rerun = (rt, file, ref, cwd) => callIn(['suite', 'rerun', file, ref, '--root', rt], cwd || repo);
    const reusable = (rt, ...flags) => callIn(['suite', 'reusable', '--branch', 'feat', '--base', 'main', ...flags, '--root', rt], repo);
    const reusableNoBase = (rt) => callIn(['suite', 'reusable', '--branch', 'feat', '--root', rt], repo);
    return { repo, T, root, rerun, reusable, reusableNoBase };
  };
  const FAILED = (T) => ['full', 'fail', T, 'clean'];
  const ALONE = (T, res, tree) => ['path', res || 'pass', T, tree || 'clean', 'tests/a.test.js'];
  const FOCUSED = (T, res, tree, paths) => ['focused', res || 'pass', T, tree || 'clean', encodePaths(paths || ['src/x.js'])];
  const ledgerOf = (rt) => fs.readFileSync(path.join(rt, 'ledger.md'), 'utf8');
  try {
    const f = make(DECLARED);
    const good = [FAILED(f.T), ALONE(f.T), FOCUSED(f.T)];

    // The verb records the file, the tip, and the triage record; a second record for the tip refuses.
    const rt = f.root(`red @ ${f.T}`, good);
    let r = f.reusable(rt);
    assert.ok(!r.ok && /rerun/.test(r.err), 'a failed full run with no rerun record stays red: ' + (r.err || ''));
    r = f.rerun(rt, 'tests/a.test.js', '#99');
    assert.ok(r.ok, 'suite rerun records: ' + (r.err || ''));
    assert.ok(ledgerOf(rt).includes(`**Rerun:** tests/a.test.js @ ${f.T} #99\n`), 'the ledger carries the rerun record: ' + ledgerOf(rt));
    r = f.rerun(rt, 'tests/a.test.js', '#100');
    assert.ok(!r.ok && /already/.test(r.err), 'a tip that carries a rerun record refuses a second: ' + (r.err || ''));
    assert.ok(ledgerOf(rt).includes('#99') && !ledgerOf(rt).includes('#100'), 'the refused record leaves the ledger as it was');
    r = f.reusable(rt);
    assert.ok(r.ok && r.out === 'reusable', 'one failed full run counts green on the recorded rerun: ' + (r.err || ''));
    assert.ok(f.reusable(rt, '--whole').ok === false, 'a failed full-kind run never serves a whole-repo gate');

    // The verb refuses empty or spaced arguments and a file the tip does not hold.
    const rv = f.root(`red @ ${f.T}`, good);
    assert.ok(!f.rerun(rv, 'tests/missing.test.js', '#1').ok, 'a file the tip does not hold refuses');
    assert.ok(!f.rerun(rv, 'tests/a.test.js', 'two words').ok, 'a triage record with a space refuses');
    assert.ok(!ledgerOf(rv).includes('**Rerun:**'), 'a refused verb writes no record');

    // Every shortfall stays red.
    const red = (lines, why, tweak) => {
      const x = f.root(`red @ ${f.T}`, lines);
      assert.ok(f.rerun(x, 'tests/a.test.js', '#99').ok);
      if (tweak) tweak(x);
      const res = f.reusable(x);
      assert.ok(!res.ok, `${why} stays red`);
    };
    red([FAILED(f.T), FOCUSED(f.T)], 'no passing rerun of the file');
    red([FAILED(f.T), ALONE(f.T, 'fail'), FOCUSED(f.T)], 'a failing rerun');
    red([FAILED(f.T), ALONE(f.T, 'pass', 'dirty'), FOCUSED(f.T)], 'a dirty rerun');
    red([FAILED(f.T), ALONE(f.T, 'fail'), ALONE(f.T), FOCUSED(f.T)], 'a rerun that failed before it passed');
    red([FAILED(f.T), ALONE(f.T)], 'no focused run');
    red([FAILED(f.T), ALONE(f.T), FOCUSED(f.T, 'fail')], 'a failing focused run');
    red([FAILED(f.T), ALONE(f.T), FOCUSED(f.T, 'pass', 'dirty')], 'a dirty focused run');
    red([FAILED(f.T), FAILED(f.T), ALONE(f.T), FOCUSED(f.T)], 'two failed full runs at the tip');
    red([ALONE(f.T), FOCUSED(f.T)], 'no failed full run in the trace');
    // The file then passed: a solo or focused pass recorded before the failed full run counts for nothing.
    red([ALONE(f.T), FAILED(f.T), FOCUSED(f.T)], 'a solo pass recorded before the failed full run');
    red([FOCUSED(f.T), FAILED(f.T), ALONE(f.T)], 'a focused pass recorded before the failed full run');
    // A run of the file recorded before the failed full run, such as a dirty RED run, never turns the rerun red.
    const early = f.root(`red @ ${f.T}`, [ALONE(f.T, 'fail', 'dirty'), FAILED(f.T), ALONE(f.T), FOCUSED(f.T)]);
    assert.ok(f.rerun(early, 'tests/a.test.js', '#99').ok);
    r = f.reusable(early);
    assert.ok(r.ok && r.out === 'reusable', 'a dirty run of the file before the failed full run counts for nothing: ' + (r.err || ''));
    // A failed run of another test file at the tip is never hidden by the rerun.
    red([FAILED(f.T), ['path', 'fail', f.T, 'clean', 'tests/b.test.js'], ALONE(f.T), FOCUSED(f.T)], 'a failed path run of another file at the tip');
    red([FAILED(f.T), ['path', 'pass', f.T, 'clean', 'tests/b.test.js'], FOCUSED(f.T)], 'a rerun of another file');
    red([FAILED(f.T), ALONE(f.T), ['focused', 'pass', f.T, 'clean', '-']], 'a focused run over no path');
    // The focused run must cover every path the scope's range changed (src/x.js).
    red([FAILED(f.T), ALONE(f.T), FOCUSED(f.T, 'pass', 'clean', ['src/y.js'])], 'a focused run missing a path the range changed');
    red([FAILED(f.T), ALONE(f.T), FOCUSED(f.T, 'pass', 'clean', ['./src'])], 'a focused run naming only the directory');
    // Without --base the range cannot be judged.
    const nb = f.root(`red @ ${f.T}`, good);
    assert.ok(f.rerun(nb, 'tests/a.test.js', '#99').ok);
    r = f.reusableNoBase(nb);
    assert.ok(!r.ok && /--base/.test(r.err), 'a rerun with no --base refuses and names the flag: ' + (r.err || ''));
    // --base never changes a green record's reuse.
    const gr = f.root(`green @ ${f.T}`, [['full', 'pass', f.T, 'clean']]);
    assert.ok(f.reusableNoBase(gr).ok, 'a green record at the tip is reusable without --base');
    // A multi-file path run is no run of the file alone.
    red([FAILED(f.T), ['path', 'pass', f.T, 'clean', 'tests/a.test.js,tests/b.test.js'], FOCUSED(f.T)], 'a multi-file run holding the rerun file');
    // The test file is a blob at the tip, named root-relative however it is typed.
    const dv = f.root(`red @ ${f.T}`, good);
    assert.ok(!f.rerun(dv, 'tests', '#1').ok, 'a directory is no test file');
    assert.ok(!ledgerOf(dv).includes('**Rerun:**'), 'a refused directory writes no record');
    const dotted = f.root(`red @ ${f.T}`, good);
    assert.ok(f.rerun(dotted, './tests/a.test.js', '#1').ok, './ path records');
    assert.ok(ledgerOf(dotted).includes(`**Rerun:** tests/a.test.js @ ${f.T} #1\n`), 'a ./ path records root-relative: ' + ledgerOf(dotted));
    const sub = f.root(`red @ ${f.T}`, good);
    assert.ok(f.rerun(sub, 'a.test.js', '#1', path.join(f.repo, 'tests')).ok, 'a subdirectory-relative path records');
    assert.ok(ledgerOf(sub).includes(`**Rerun:** tests/a.test.js @ ${f.T} #1\n`), 'a subdirectory-relative path records root-relative: ' + ledgerOf(sub));
    assert.ok(f.reusable(sub).ok, 'the root-relative record matches the trace');

    // A rerun record for another tip does not count.
    const other = f.root(`red @ ${f.T}`, good);
    fs.writeFileSync(path.join(other, 'ledger.md'), ledgerOf(other).replace(`**Suite:**`, `**Rerun:** tests/a.test.js @ ${'d'.repeat(40)} #99\n**Suite:**`));
    assert.ok(!f.reusable(other).ok, 'a rerun record for another tip stays red');
    // A tip that moved past the failed run through a non-Markdown commit stays red.
    const moved = f.root(`red @ ${f.T}`, good);
    assert.ok(f.rerun(moved, 'tests/a.test.js', '#99').ok);
    fs.writeFileSync(path.join(f.repo, 'later.js'), 'x\n');
    g(['add', '-A'], f.repo);
    g(['commit', '-q', '-m', 'later'], f.repo);
    assert.ok(!f.reusable(moved).ok, 'a rerun recorded for an earlier tip stays red at a later tip past a non-Markdown commit');

    // Without the declaration the rerun never counts.
    const nd = make('');
    const ndRt = nd.root(`red @ ${nd.T}`, [FAILED(nd.T), ALONE(nd.T), FOCUSED(nd.T)]);
    assert.ok(nd.rerun(ndRt, 'tests/a.test.js', '#99').ok);
    r = nd.reusable(ndRt);
    assert.ok(!r.ok && /Complete selector|declar/.test(r.err), 'no declaration stays red: ' + (r.err || ''));

    // A Markdown-only commit after the failed run (ADR 0189): the rerun holds at the record's commit, and every path
    // changed since passes the Markdown-only rule judged at the tip.
    const dp = make(DECLARED);
    const dpOk = dp.root(`red @ ${dp.T}`, [FAILED(dp.T), ALONE(dp.T), FOCUSED(dp.T)]);
    const dpFail = dp.root(`red @ ${dp.T}`, [FAILED(dp.T), ALONE(dp.T), FOCUSED(dp.T)]);
    assert.ok(dp.rerun(dpOk, 'tests/a.test.js', '#99').ok && dp.rerun(dpFail, 'tests/a.test.js', '#99').ok);
    const dpCommit = (file) => {
      fs.writeFileSync(path.join(dp.repo, file), 'doc\n');
      g(['add', '-A'], dp.repo);
      g(['commit', '-q', '-m', file], dp.repo);
      return g(['rev-parse', 'HEAD'], dp.repo);
    };
    const DT = dpCommit('README.md');
    r = dp.reusable(dpOk);
    assert.ok(r.ok && r.out === 'reusable', 'a Markdown-only commit after a passing rerun reuses: ' + (r.err || ''));
    appendTrace(dpFail, { kind: 'run', fields: ['full', 'fail', DT, 'clean'] });
    r = dp.reusable(dpFail);
    assert.ok(!r.ok && /full run at the tip failed/.test(r.err), 'a failed run at the Markdown-only tip stays red: ' + (r.err || ''));
    dpCommit('later.js');
    r = dp.reusable(dpOk);
    assert.ok(!r.ok && /later\.js changed since and is not Markdown/.test(r.err), 'a non-Markdown commit after the failed run stays red: ' + (r.err || ''));
    // A failed run's commit off the tip's history stays red, whatever changed since.
    const offRt = dp.root(`red @ ${DT}`, [FAILED(DT), ALONE(DT), FOCUSED(DT)]);
    fs.writeFileSync(path.join(offRt, 'ledger.md'), ledgerOf(offRt).replace('**Suite:**', `**Rerun:** tests/a.test.js @ ${DT} #99\n**Suite:**`));
    g(['reset', '-q', '--hard', dp.T], dp.repo);
    dpCommit('OTHER.md');
    r = dp.reusable(offRt);
    assert.ok(!r.ok && /neither at the tip nor an ancestor/.test(r.err), 'a failed run off the tip\'s history stays red: ' + (r.err || ''));
  } finally {
    cases.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  }
}
