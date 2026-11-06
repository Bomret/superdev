'use strict';

// Suite for the test runs, reverts, and restores of the run trace (ADR 0117, INV-0129, INV-0161). Classification calls `verificationKind` and
// `testRuns` of plugin/lib/test-runs.js and the hook's `record`.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { verificationKind, testRuns } = require('../plugin/lib/test-runs.js');
const { bashTargets } = require('../plugin/lib/bash-writes.js');
const { tmp, ledger, A, S3, trace, reset, run, edit, bash, hookPath, initS3, cleanup, GIT_SPAWN_BOUND_MS } = require('./run-trace-setup');
const vf = path.join(S3, 'docs', 'agents', 'verification.md');
// A path run needs its file to exist (triage #1210): the test files the cases below run are committed with the tree.
fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
const { git, sha } = initS3();

const post = (command, extra) => run(Object.assign({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, cwd: S3 }, extra));
const fail = (command) => post(command, { hook_event_name: 'PostToolUseFailure' });
const tail = (rows) => rows.map((l) => l.slice(2).join(' '));

reset();
post('bun run test');
fail('bun run test');
// The sentinel holds a character no hex sha contains, so a commit sha never matches it by chance.
post('GITEA_TOKEN=zz-secret-zz bun run test');
assert.deepEqual(tail(trace(A)), [`run full pass ${sha} clean -`, `run full fail ${sha} clean -`, `run full pass ${sha} clean -`], 'full command, both events; env value and command text never recorded');
assert.ok(!fs.readFileSync(path.join(A, 'trace.log'), 'utf8').includes('zz-secret-zz'));

reset();
post('node tests/x.test.js');
post('grep foo tests/x.test.js');
post('cat tests/x.test.js');
post('git diff tests/x.test.js');
post('bun run test:unit');
assert.deepEqual(tail(trace(A)), [`run path pass ${sha} clean tests/x.test.js`], 'a path run records; reads and a sibling command record nothing');

// A quoted note that begins with a test path is free text, never a path: a command writing it records no run.
reset();
post(`node scripts/note.js dod-line 3 "tests/x.test.js adopt block: a stage-less payload is refused"`);
assert.deepEqual(tail(trace(A)), [], 'a note argument starting with a test path records no run');
// A quoted test path that holds a space and names a file is still a path run.
fs.writeFileSync(path.join(S3, 'tests', 'x y.test.js'), '');
reset();
post(`node "tests/x y.test.js"`);
fs.rmSync(path.join(S3, 'tests', 'x y.test.js'));
assert.deepEqual(tail(trace(A)).map((l) => l.split(' ').slice(0, 2).join(' ')), ['run path'], 'a quoted test path with a space records');

// A compound configured command matches across the segments it spans, with the outcome rules of a direct run (#928).
const vfSaved = fs.readFileSync(vf, 'utf8');
fs.writeFileSync(vf, '# V\n\n```sh\nbun test && bash scripts/test-affected.sh\n```\n\n```sh\nbun test {paths}\n```\n');
reset();
post('bun test && bash scripts/test-affected.sh');
fail('bun test && bash scripts/test-affected.sh');
post('bun test');
post('bun test; bash scripts/test-affected.sh');
post('bun test && bash scripts/test-affected.sh || true');
assert.deepEqual(tail(trace(A)), [`run full pass ${sha} dirty -`, `run full fail ${sha} dirty -`, `run full unknown ${sha} dirty -`], 'a compound full command records one run; its prefix alone or a different joiner records none');
post('bun test && bash scripts/test-affected.sh --x');
assert.equal(trace(A).pop()[3], 'focused', 'a compound full run with a segment past its template narrows to focused');
assert.equal(trace(A).pop()[7], '-', 'a focused run the hook records from a direct call holds no path set');
reset();
fs.writeFileSync(vf, '# V\n\n```sh\ncd sub && bun test\n```\n');
post('cd sub && bun test');
assert.deepEqual(tail(trace(A)), [`run full pass ${sha} dirty -`], 'a compound configured command starting with cd matches');
fs.mkdirSync(path.join(S3, 'sub', 'tests'), { recursive: true });
fs.writeFileSync(path.join(S3, 'sub', 'tests', 'a.test.js'), '');
post('cd sub && bun test && node tests/a.test.js');
assert.equal(trace(A).filter((l) => l[2] === 'run').pop()[7], 'sub/tests/a.test.js', 'a cd inside a matched compound still moves the base');
fs.rmSync(path.join(S3, 'sub'), { recursive: true });
reset();
fs.writeFileSync(vf, '# V\n\n```sh\nbun test | tee out.log\n```\n');
post('bun test | tee out.log');
post('set -o pipefail; bun test | tee out.log');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown'], 'a pipe into a non-pass-through stage inside a compound reads unknown, as the same pipe run directly does');
reset();
fail('set -o pipefail; bun test | tee out.log');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown'], 'under pipefail a non-pass-through stage inside a compound hides the status, as a direct run does');
fs.writeFileSync(vf, '# V\n\n```sh\nbun test; bash x.sh\n```\n\n```sh\nbun test || true\n```\n');
reset();
fail('bun test; bash x.sh');
fail('bun test || true');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown'], 'an inner ; or || keeps the status unknown');

fs.writeFileSync(vf, '# V\n\n```sh\nbun test | tee out.log\n```\n');
reset();
post('rtk proxy bun test | tee out.log');
assert.equal(trace(A).filter((l) => l[2] === 'run').length, 1, 'rtk proxy <command> is <command>');
fs.writeFileSync(vf, '# V\n\n```sh\ncd sub; bun test\n```\n\n```sh\ncd sub && set -o pipefail && bun test | tail -5\n```\n');
reset();
post('cd sub; bun test');
fail('cd sub && set -o pipefail && bun test | tail -5');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['pass', 'fail'], 'a joiner before the test and a pipefail past the first segment do not hide the outcome');
fs.writeFileSync(vf, vfSaved);

// A wrapper never changes what a command is: `rtk` joins the wrappers.
reset();
post('rtk grep foo tests/x.test.js');
post('rtk -v bun run test');
post('rtk bun run test');
assert.deepEqual(tail(trace(A)), [`run full pass ${sha} clean -`, `run full pass ${sha} clean -`], 'rtk <test command>, with or without option words, is that run; rtk <search> is none');

reset();
for (const c of ['node tests/x.test.js | tail -5', 'node tests/x.test.js || true', 'node tests/x.test.js; true']) post(c);
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'unknown'], 'an exit status that hides the test reads unknown');
reset();
post('set -o pipefail; node tests/x.test.js | tail -5');
fail('set -o pipefail; node tests/x.test.js | tail -5');
assert.deepEqual(trace(A).map((l) => l[4]), ['pass', 'fail'], 'pipefail keeps the real outcome');

reset();
for (const c of ['set -o pipefail; bun run test 2>&1 | tail -5; echo done', 'set -o pipefail; bun run test 2>&1 | tail -5 || true']) post(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown'], 'a command after the pipeline hides the test status');

// Under pipefail only a pass-through pipe stage (tail, cat) keeps the test's status; any other stage decides it.
reset();
for (const c of ['set -o pipefail; bun run test 2>&1 | grep FAIL', 'set -o pipefail; bun run test | false', 'set -o pipefail; bun run test | head -20', 'set -o pipefail; bun run test | cat | grep x', 'set -o pipefail; set +o pipefail; bun run test | tail -5']) fail(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'], 'a pipe stage that can fail on its own hides the test status; +o pipefail turns it off');
reset();
for (const c of ['set -o pipefail; bun run test 2>&1 | tail -5', 'set -o pipefail; bun run test | cat | tail -5', 'set -euo pipefail; bun run test | tail -5', 'set +o pipefail; set -o pipefail; bun run test | tail -5', 'set -o pipefail; bun run test 2>&1 | tail -5\n', 'set -o pipefail; bun run test 2>&1 | tail -5;']) fail(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['fail', 'fail', 'fail', 'fail', 'fail', 'fail'], 'tail and cat stages, option groups, the last pipefail sign, and trailing separators keep the real outcome');

reset();
fs.writeFileSync(path.join(S3, 'src', 'dirty.js'), 'x');
post('bun run test');
assert.equal(trace(A)[0][6], 'dirty');
fs.rmSync(path.join(S3, 'src', 'dirty.js'));

// A git call killed at its bound records unknown for its field.
{
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const marker = path.join(bin, 'called');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho git >> '${marker}'\nexec sleep 5\n`, { mode: 0o755 });
  reset();
  const input = { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 };
  const r = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify(input), encoding: 'utf8', timeout: GIT_SPAWN_BOUND_MS, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH } });
  assertSpawnDecided(r, 'run-trace.js with a stalled git');
  assert.ok(fs.existsSync(marker), 'the hook reached the stalled git stub');
  assert.deepEqual(tail(trace(A)), ['run full pass unknown unknown -'], 'a killed git call records unknown');
}

reset();
post('git restore --source=main -- src/x.js');
post('git restore -- src/x.js');
post('git checkout HEAD -- src/x.js');
post('git checkout main -- src/x.js');
post('git checkout feature');
fail('git restore --source=main -- src/y.js');
assert.deepEqual(trace(A).map((l) => l.slice(2).join(' ')), ['revert src/x.js', 'restore src/x.js', 'restore src/x.js', 'revert src/x.js']);

// `--source <rev>` and `-s <rev>` as separate words name the source like `--source=<rev>`: a revert, and `HEAD` a restore.
reset();
post('git restore --source main -- src/x.js');
post('git restore -s main -- src/y.js');
post('git restore --source HEAD -- src/z.js');
post('git restore -s HEAD -- src/w.js');
post('git restore --source main src/v.js');
post('git restore -s main src/u.js');
assert.deepEqual(trace(A).map((l) => l.slice(2).join(' ')), ['revert src/x.js', 'revert src/y.js', 'restore src/z.js', 'restore src/w.js', 'revert src/v.js', 'revert src/u.js']);

// The tree comes from the effective directory at each segment, the input cwd only as the fallback.
{
  const S2 = path.join(A, 'slicetrees', '02');
  const git2 = (...a) => cp.execFileSync('git', ['-C', S2, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(S2, 'src', 'm.js'), 'm');
  fs.mkdirSync(path.join(S2, 'docs', 'agents'), { recursive: true });
  fs.copyFileSync(vf, path.join(S2, 'docs', 'agents', 'verification.md'));
  git2('init', '-q');
  git2('add', '-A');
  git2('commit', '-q', '-m', 'base2');
  const sha2 = git2('rev-parse', 'HEAD');
  assert.notEqual(sha, sha2);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-out-'));
  reset();
  bash(`cd ${S3} && bun run test`, outside);
  bash(`git -C ${S3} restore --source=main -- f`, outside);
  assert.deepEqual(trace(A).map((l) => l.join(' ')), [`03 main run full pass ${sha} clean -`, '03 main revert f']);
  reset();
  bash(`cd ${S2} && bun run test`, S3);
  assert.deepEqual(trace(A).map((l) => l.join(' ')), [`02 main run full pass ${sha2} clean -`], 'a cd into another tree records in that tree');
  fs.rmSync(outside, { recursive: true, force: true });
}

// A pass names the test only where the test is the command's sole command.
reset();
for (const c of ['true || bun run test', 'bun run test &', 'bun run test; echo done', 'npm run build && bun run test', 'cd src || bun run test']) post(c);
post('cd src && bun run test');
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'pass'], 'a pass outside the sole-command shape reads unknown');
reset();
fail('true || bun run test');
fail('bun run test &');
fail('cd src && bun run test');
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'fail']);

// A lone `&` separates commands; `&&`, `&>`, `2>&1`, `|&`, and a quoted `&` do not.
reset();
for (const c of ['bun run test & wait', 'bun run test & echo x']) post(c);
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown'], 'a background test names no outcome');
reset();
for (const c of ['bun run test &> out.log', 'set -o pipefail; bun run test 2>&1 | tail -5', 'bun run test |& tail -5', 'echo "a & b" && bun run test']) post(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['pass', 'pass', 'unknown', 'unknown']);
reset();
fail('bun run test & wait');
fail('bun run test &> out.log');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'fail']);

// A failed chain names fail only where the test is the command's failure.
reset();
fail('npm run build && bun run test');
fail('bun run test && echo done');
fail('cd src && bun run test');
fail('bun run test');
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'fail', 'fail']);

// `git restore --staged` touches only the index.
reset();
post('git restore --staged src/x.js');
post('git restore -S src/x.js');
post('git restore --staged --worktree src/x.js');
assert.deepEqual(trace(A).map((l) => l.join(' ')), ['03 main restore src/x.js']);

// A command that writes a file and runs a test records both events.
reset();
post('echo x > src/w.js && bun run test');
assert.deepEqual(trace(A).map((l) => l[2]), ['run', 'edit']);

// Focused and whole-repo commands classify by kind; the longest match wins.
fs.writeFileSync(vf, '# V\n\n```sh\nnx affected -t test\n```\n\n```sh\nnx test --fast\n```\n\n## Whole-repo command\n\n`nx run-many -t test`\n');
reset();
for (const c of ['nx affected -t test', 'nx test --fast', 'nx run-many -t test']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['full', 'focused', 'whole']);

// Command position (INV-0129): a test command quoted in an argument records no run; a real compound invocation does.
fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test --related {paths}\n```\n');
reset();
for (const c of ['tea pr create --description "Verified: bun run test passes"', 'gh pr comment 3 -b "ran bun run test"', "echo 'bun run test'", 'bun run test:unit']) post(c);
assert.deepEqual(trace(A), [], 'a quoted test command and a sibling script record no run');
reset();
for (const c of ['cd src && bun run test', 'FOO=1 bun run test', 'bun run test | tail', 'bun run test 2>&1', 'sudo bun run test']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['full', 'full', 'full', 'full', 'full'], 'real compound invocations record');

// `{paths}` stands for one or more path words: a substituted focused run is focused, never full.
{
  const v = { full: 'bun run test', focused: 'bun run test --related {paths}', whole: null };
  assert.equal(verificationKind('bun run test --related a.js', v), 'focused');
  assert.equal(verificationKind('FOO=1 bun run test', v), 'full');
  assert.equal(verificationKind('FOO="bun run test" echo x', v), null, 'an env value is no command');
}
// A configured command is normalized as a segment is: its env assignments and wrappers are not command words.
for (const full of ['CI=1 bun run test', 'time bun run test']) {
  const v = { full, focused: 'CI=1 bun run test --related {paths}', whole: null };
  assert.equal(verificationKind('bun run test', v), 'full', `${full}: bare invocation`);
  assert.equal(verificationKind('CI=1 bun run test', v), 'full', `${full}: env-prefixed invocation`);
  assert.equal(verificationKind('bun run test --related a.js', v), 'focused', `${full}: focused with {paths}`);
}
// A redirect is stripped outside quoted words only.
{
  const v = { full: 'bun run test', focused: null, whole: null };
  assert.equal(verificationKind('FOO="a>b" bun run test', v), 'full', 'a quoted env value holds its `>`');
  assert.equal(verificationKind('bun run test > out.txt', v), 'full');
  assert.equal(verificationKind('bun run test >out.txt 2>&1', v), 'full');
  assert.equal(verificationKind('echo "bun run test > x"', v), null);
}
// A full-template match whose command words run past the template is a narrowed run, never full (INV-0129).
{
  const v = { full: 'bun run test', focused: 'node scripts/run-tests.js --related {paths}', whole: null };
  assert.equal(verificationKind('bun run test --related plugin/hooks/a.js', v), 'focused');
  assert.equal(verificationKind('bun run test -- --related a.js', v), 'focused');
  assert.equal(verificationKind('bun run test 2>&1', v), 'full', 'a redirect adds no argument word');
  assert.equal(verificationKind('bun run test > out.txt', v), 'full');
}
// The same rule holds for a whole-repo match: `pnpm turbo test --filter=web` is a narrowed run, never `whole` (INV-0129).
{
  const v = { full: 'pnpm turbo test --affected', focused: null, whole: 'pnpm turbo test' };
  assert.equal(verificationKind('pnpm turbo test --affected', v), 'full');
  assert.equal(verificationKind('pnpm turbo test', v), 'whole');
  assert.equal(verificationKind('pnpm turbo test 2>&1', v), 'whole', 'a redirect adds no argument word');
  assert.equal(verificationKind('pnpm turbo test --filter=web', v), 'focused');
  assert.equal(verificationKind('pnpm turbo test --affected --filter=web', v), 'focused');
}
{
  const turbo = '# V\n\n```sh\npnpm turbo test --affected\n```\n\n## Whole-repo command\n\n`pnpm turbo test`\n';
  fs.writeFileSync(vf, turbo);
  reset();
  post('pnpm turbo test --filter=web');
  assert.deepEqual(trace(A).map((l) => l[3]), ['focused']);
  const root = fs.mkdtempSync(path.join(tmp, 'reuse-'));
  fs.writeFileSync(path.join(root, 'ledger.md'), ledger([['03', 'in-progress']]).replace('**Stage:** implementing', `**Stage:** implementing\n**Suite:** green @ ${sha} whole`));
  fs.copyFileSync(path.join(A, 'trace.log'), path.join(root, 'trace.log'));
  for (const extra of [[], ['--whole']]) {
    const r = cp.spawnSync(process.execPath, [require.resolve('../plugin/scripts/scope.js'), 'suite', 'reusable', '--branch', 'HEAD', '--root', root, ...extra], { cwd: S3, encoding: 'utf8', timeout: 10000 });
    assertSpawnDecided(r, 'scope.js suite reusable');
    assert.equal(r.status, 1, `a narrowed whole-template run is no reuse evidence ${extra.join(' ')}`);
    assert.ok(/no (full or whole|whole) run/.test(r.stderr), r.stderr);
  }
  fs.rmSync(root, { recursive: true, force: true });
  fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test --related {paths}\n```\n');
}
reset();
for (const c of ['bun run test --related a.js', 'bun run test --related a.js b.js', 'bun run test', 'bun run test --related']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['focused', 'focused', 'full', 'focused'], 'the longest template wins; argument words past the full template narrow the run');
fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nnode scripts/run-tests.js --related {paths}\n```\n');
reset();
post('node scripts/run-tests.js --related tests/a.test.js scripts/b.js');
assert.deepEqual(trace(A).map((l) => l[3]), ['focused'], 'a focused command that shares no prefix with the full one records focused');

// Command position: a subshell, brace group, `!`, a shell keyword, or `timeout` before the command does not hide it;
// a quoted (`bash -c "..."`) or indirect (`xargs`) mention still records nothing.
fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test --related {paths}\n```\n');
reset();
for (const c of ['(cd app && bun run test)', '{ bun run test; }', 'if bun run test; then echo ok; fi', 'timeout 60 bun run test',
  'timeout -k 5 1m bun run test', '! bun run test', 'while bun run test; do :; done']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['full', 'full', 'full', 'full', 'full', 'full', 'full'], 'command-position forms still record');
reset();
for (const c of ['bash -c "bun run test"', 'xargs bun run test', 'npx bun run test']) post(c);
assert.deepEqual(trace(A), [], 'a quoted or indirect test command records no run');

// A substitution inside the test's own command is no later stage; a command after a subshell run is.
reset();
post('bun run test $(cat x)');
post('(bun run test) && echo ok');
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['focused pass', 'full unknown'], 'the substitution word narrows the run and ends nothing');

// `!` inverts the exit status, so the outcome of a negated run names no pass or fail (INV-0017).
reset();
post('! bun run test');
post('if ! bun run test; then echo bad; fi');
fail('! bun run test');
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full unknown', 'full unknown', 'full unknown'], 'a negated run reads unknown on both events');
// The `!` holds behind a keyword and in front of a group.
reset();
for (const c of ['! { bun run test; }', '! time bun run test', '! (bun run test)']) fail(c);
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full unknown', 'full unknown', 'full unknown'], 'a negated group or keyword run reads unknown');
// A `!` before a group negates the group's last command, so any negated command ahead of the test makes its status unknown.
reset();
const negGroups = ['! { cd sub; bun run test; }', '! (cd sub && bun run test)', '! { set -e; bun run test; }', '! { true; bun run test; }', '! (true; bun run test)'];
for (const c of negGroups) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), negGroups.flatMap(() => ['full unknown', 'full unknown']), 'a run behind a negated group reads unknown on both events');

// Any unquoted `!` negation in the command line makes every test run of it unknown, wherever the negation lands.
reset();
const negLines = ['! case x in *) bun run test;; esac', '! case x in *) true; bun run test;; esac', '! if true; then bun run test; fi', '! while false; do :; done; bun run test',
  '! { cd sub; bun run test; }', '! [[ -n x ]] || bun run test'];
for (const c of negLines) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), negLines.flatMap(() => ['full unknown', 'full unknown']), 'a `!` anywhere in the line reads every run unknown');
// A `!` in quotes, in `[[ ]]` operands, or inside a word is no negation.
for (const c of ['[[ a != b ]] && bun run test', "echo '!' ; bun run test", '[[ ! -n x ]] && bun run test', 'echo a!b && bun run test']) {
  assert.deepEqual(testRuns(c, S3).map((r) => r.unknown), [false], c);
}

// A function definition runs nothing: its body records no run, restore, or `scope.js test` call.
reset();
for (const c of ['x() { bun run test; }', 'function x { bun run test; }', 'function x () { bun run test; }', 'x() { bun run test; }; x']) { post(c); fail(c); }
assert.deepEqual(trace(A), [], 'a test inside a function body records no run');

// A function header with a body that is no group records no run on either event.
reset();
for (const c of ['f() case x in *) bun run test;; esac', 'f() for i in 1; do bun run test; done', 'f() if true; then bun run test; fi', 'f() while false; do bun run test; done',
  'f() until true; do bun run test; done', 'f() select x in 1; do bun run test; done', 'f() [[ -n x ]]; bun run test', 'f() (( 1 )); bun run test']) { post(c); fail(c); }
assert.deepEqual(trace(A), [], 'a bare compound function body records no run');

// A run records pass or fail only in a plain list of simple commands: a test inside compound structure or a substitution reads unknown.
reset();
const compoundLines = ['case $(bun run test) in *) ;; esac', 'case "$(bun run test)" in *) ;; esac', 'case `bun run test` in *) ;; esac', 'case x in $(bun run test)) ;; esac',
  'if true; then bun run test; fi', 'for i in 1; do bun run test; done', '{ bun run test; }', '(bun run test)', '[[ -n x ]] && bun run test'];
for (const c of compoundLines) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), compoundLines.flatMap(() => ['full unknown', 'full unknown']), 'a run in compound structure reads unknown on both events');
// A coprocess runs asynchronously and the line exits at once, so the status is not the test's.
reset();
const asyncLines = ['coproc bun run test', 'time coproc bun run test', 'set -o pipefail; coproc bun run test | cat'];
for (const c of asyncLines) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), asyncLines.flatMap(() => ['full unknown', 'full unknown']), 'a coprocess run reads unknown on both events');
// A backtick body runs before the command it sits in, so its commands come first in the list as in the `$( )` spelling.
reset();
const tickLines = ['cd `echo nowhere` && bun run test', 'set `echo x`; bun run test | cat'];
for (const c of tickLines) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), tickLines.flatMap(() => ['full unknown', 'full unknown']), 'a run after a backtick body reads unknown on both events');
// A heredoc body's commands (`exit 1` in a substitution) are no test paths and leave no run of their own.
reset();
fail('cd tests <<EOF && bun run test\n$(exit 1)\nEOF');
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full unknown'], 'a heredoc body adds no run line');
// A plain list keeps its outcome.
reset();
for (const c of ['bun run test', 'cd sub && bun run test', 'set -o pipefail; bun run test | tail -5']) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full pass', 'full fail', 'full pass', 'full fail', 'full pass', 'full fail'], 'a plain list of simple commands keeps pass and fail');

// A function body's writes record at its definition, since a call of it later writes them; its `cd` moves nothing at the definition.
assert.deepEqual(bashTargets('f() { echo x > out; }; f', S3), [path.join(S3, 'out')], 'a function body write records');
assert.deepEqual(bashTargets('function f { cp a out; }; f', S3), [path.join(S3, 'out')], 'a `function` body write records');
assert.deepEqual(bashTargets('f() { cd sub; }; echo > out', S3), [path.join(S3, 'out')], 'a function body cd moves nothing at definition');

// The wrappers `timeout` and `env` take `--` and their option flags before the command.
reset();
for (const c of ['timeout 5s -- bun run test', 'timeout -k 5 1m -- bun run test', 'env -i FOO=1 bun run test', 'env -u HOME bun run test', 'env -- bun run test', 'command -p bun run test']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['full', 'full', 'full', 'full', 'full', 'full'], 'wrapped runs record');

// `sudo` and `nice` take option words (and a value for `-u`, `-g`, `-C`, `-n`, attached or separate) before the command.
reset();
const OPTS = ['sudo -E bun run test', 'sudo -u root bun run test', 'sudo -uroot bun run test', 'sudo -g wheel -u root bun run test',
  'sudo --user root bun run test', 'sudo -- bun run test', 'nice bun run test', 'nice -n 5 bun run test', 'nice -n5 bun run test', 'nice --adjustment 5 bun run test', 'time -p bun run test',
  'sudo -p pw bun run test'];
for (const c of OPTS) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), OPTS.map(() => 'full'), 'a wrapper\'s option words and their values do not hide the run');
// A wrapper option that changes directory runs the command where the hook cannot follow: no run, no restore (INV-0161).
reset();
for (const c of ['sudo -iu root bun run test', 'sudo -i bun run test', 'sudo -D /x bun run test', 'sudo --chdir /x bun run test',
  'env -C /x bun run test', 'env --chdir=/x bun run test', 'sudo -D /x git restore src/a.txt']) post(c);
assert.deepEqual(trace(A), [], 'a chdir wrapper option records no run and no restore (INV-0161)');
// Only a `cd` that runs in this shell moves the base: behind `nice` or `sudo` it runs in a child and moves nothing.
reset();
post('nice cd /x; bun run test');
post('sudo cd /x; git restore src/a.txt');
assert.deepEqual(trace(A).map((l) => l.slice(2, 4).join(' ')), ['run full', 'restore src/a.txt'], 'a wrapped cd moves no base');
reset();
for (const c of ['sudo -u root bash -c "bun run test"', 'sudo -E echo "bun run test"', 'nice -n 5 xargs bun run test', 'command -v bun run test']) post(c);
assert.deepEqual(trace(A), [], 'a quoted, indirect, or lookup mention behind a wrapper records no run');

// A PreToolUse rewrite reaches PostToolUse: RTK's hook turns `bun run test` into `rtk bun run test`, and `rtk` passes the
// command's exit status through, so the run records with its outcome (docs/known-issues.md, #955).
reset();
const RTK = ['rtk bun run test', 'rtk --ultra-compact bun run test', `cd ${S3} && rtk bun run test`];
for (const c of RTK) post(c, c.startsWith('cd ') ? { cwd: tmp } : {});
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), RTK.map(() => 'full pass'), 'a run behind rtk records with its outcome');
reset();
fail('rtk bun run test');
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full fail'], 'a failed run behind rtk records fail');

// An escaped `)` ends a path word; only an unescaped closing `)` is dropped.
reset();
post('git restore src/a\\(1\\)');
post('(git restore src/b.js)');
// The path reads as bash reads it: the escapes are gone (ADR 0160).
assert.deepEqual(trace(A).map((l) => l.slice(2).join(' ')), ['restore src/a(1)', 'restore src/b.js']);

// `{paths}` matches embedded in a word, and after an optional `--`.
{
  const v = { full: 'make test', focused: 'make test FILES={paths}', whole: null };
  assert.equal(verificationKind('make test FILES=a.js', v), 'focused');
  assert.equal(verificationKind('make test', v), 'full');
  assert.equal(verificationKind('make test FILES=', v), 'focused', 'the placeholder needs a path, and the extra word narrows the full run');
  const w = { full: 'bun run test', focused: 'bun run test --related {paths}', whole: null };
  assert.equal(verificationKind('bun run test --related -- a.js', w), 'focused');
  assert.equal(verificationKind('bun run test --related -- ', w), 'focused');
}

// A focused run never backs a reused suite record (INV-0017), in either focused form.
for (const [template, command] of [['node scripts/run-tests.js --related {paths}', 'node scripts/run-tests.js --related tests/a.test.js'],
  ['bun run test --related {paths}', 'bun run test --related tests/a.test.js'],
  ['node scripts/run-tests.js --related {paths}', 'bun run test --related tests/a.test.js'],
  ['node scripts/run-tests.js --related {paths}', 'bun run test -- --related tests/a.test.js']]) {
  fs.writeFileSync(vf, `# V\n\n\`\`\`sh\nbun run test\n\`\`\`\n\n\`\`\`sh\n${template}\n\`\`\`\n`);
  reset();
  post(command);
  const root = fs.mkdtempSync(path.join(tmp, 'reuse-'));
  fs.writeFileSync(path.join(root, 'ledger.md'), ledger([['03', 'in-progress']]).replace('**Stage:** implementing', `**Stage:** implementing\n**Suite:** green @ ${sha}`));
  fs.copyFileSync(path.join(A, 'trace.log'), path.join(root, 'trace.log'));
  const r = cp.spawnSync(process.execPath, [require.resolve('../plugin/scripts/scope.js'), 'suite', 'reusable', '--branch', 'HEAD', '--root', root], { cwd: S3, encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(r, 'scope.js suite reusable');
  assert.equal(r.status, 1, `a focused run alone is no full-suite evidence (${template})`);
  assert.ok(/no full or whole run/.test(r.stderr), r.stderr);
  fs.rmSync(root, { recursive: true, force: true });
}

// No verification.md: no full run, still a path run.
fs.rmSync(vf);
reset();
post('bun run test');
post('node tests/x.test.js');
assert.deepEqual(tail(trace(A)).map((l) => l.split(' ').slice(0, 2).join(' ')), ['run path']);

// A test run in a background Bash call returns before the test ran: its outcome is unknown, never pass.
{
  const vf2 = path.join(S3, 'docs', 'agents', 'verification.md');
  fs.writeFileSync(vf2, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  reset();
  run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test', run_in_background: true }, cwd: S3 });
  run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 });
  assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'pass'], 'only the foreground run records pass');
  fs.rmSync(vf2);
}

// A `scope.js fail-to-pass … -- <command>` call records its own control run (ADR 0182), so the hook records no run for the test
// file its command names, quoted script word or not; the rest of the command line records as usual.
{
  reset();
  for (const scope of ['node plugin/scripts/scope.js', 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"']) {
    post(`${scope} fail-to-pass abc..def -- node tests/x.test.js`);
  }
  assert.deepEqual(trace(A), [], 'a fail-to-pass call records no run for the test file it names');
  post('node plugin/scripts/scope.js fail-to-pass abc..def -- node tests/x.test.js && node tests/x.test.js');
  assert.deepEqual(trace(A).map((l) => l.slice(2, 4).join(' ')), ['run path'], 'a run after the call still records');
}

// A `scope.js prepare <tree>` call runs the repository's prepare command, no test (ADR 0218): a tree path that matches a test
// pattern records no run.
{
  reset();
  for (const scope of ['node plugin/scripts/scope.js', 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"']) {
    post(`${scope} prepare .superdev/scopes/demo/slicetrees/tests`);
    post(`${scope} prepare tests/fixture.test.js`);
  }
  assert.deepEqual(trace(A), [], 'a prepare call records no run');
}

cleanup();
