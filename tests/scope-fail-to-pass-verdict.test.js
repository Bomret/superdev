'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb (ADR 0134, ADR 0182, INV-0138, INV-0139), split off the core verbs'
// suite so a test-first step on one verb runs only that verb's cases (ADR 0139): the verdict cases, which put the range's
// files back, refuse a range, and record the control run. Its sibling files hold the signal, bound, interrupt, concurrency,
// and environment cases. Every scenario writes only inside the fixture's own temporary directory (INV-0154).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { f2pFixture, verif } = require('./scope-setup');

const { readTrace, traceField } = require('../plugin/lib/trace-log.js');

// Every case runs at the default floor of the bound unless it sets its own (ADR 0142).
delete process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS;

{
  const { probe, CMD, scenario, leftover, checkout, done } = f2pFixture();
  try {
    // A modified source file the test needs: it passes against the changed code and fails once the file is put back.
    let s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    let r = s.run(s.range);
    assert.equal(r.status, 0, 'an outcome exits 0: ' + r.stderr);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', 'the outcome prints on stdout');
    assert.doesNotMatch(r.stderr, /observation/, 'an outcome that reads a verdict says nothing');
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1`], 'one trace line of its own kind, on the slice, naming the range, the outcome, and the reason');
    assert.deepEqual(s.rawTrace(), [`01 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1 sh\\x20tests/t.sh`], 'and the command last, escaped as a trace field');
    // The control run is also a test run (ADR 0175, ADR 0182): it writes a `path` run line with its result, the tip, a clean
    // tree, and the range's test files, the files the command was handed to cover. The line is attributed like the outcome
    // line, and the outcome line is unchanged.
    assert.deepEqual(s.runLines(), [`01 main run path pass ${s.tipSha} clean tests/t.sh`], 'one passing path run line at the tip on a clean tree, naming the test files');
    assert.match(s.rawRunLines()[0], / tests\/t\.sh \d+$/, 'and its duration in whole milliseconds last');

    // Tests that pass with the other files put back as well read pass-to-pass.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    r = s.run(s.range);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'pass-to-pass control=0,put-back=0');
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} pass-to-pass control=0,put-back=0`]);

    // The second run's worktree matches its own HEAD, as the control's does, so a command that checks for a clean tree
    // before its tests still reads pass-to-pass. The environment holds no git identity, refuses to guess one, and asks to
    // sign every commit.
    const CLEAN_CMD = `git diff --quiet HEAD && ${CMD}`;
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CLEAN_CMD, CLEAN_CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    const at = Number(process.env.GIT_CONFIG_COUNT || 0);
    const gitTrace = path.join(s.dir, 'git-trace');
    r = s.run(s.range, {
      env: {
        GIT_TRACE: gitTrace,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_COUNT: String(at + 3),
        [`GIT_CONFIG_KEY_${at}`]: 'commit.gpgsign',
        [`GIT_CONFIG_VALUE_${at}`]: 'true',
        [`GIT_CONFIG_KEY_${at + 1}`]: 'user.useConfigOnly',
        [`GIT_CONFIG_VALUE_${at + 1}`]: 'true',
        [`GIT_CONFIG_KEY_${at + 2}`]: 'maintenance.auto',
        [`GIT_CONFIG_VALUE_${at + 2}`]: 'true',
      },
    });
    assert.equal(r.stdout.trim(), 'pass-to-pass control=0,put-back=0', `the put-back worktree is clean against its HEAD: ${r.stderr}`);
    // The put-back commit starts no automatic maintenance, which could detach and outlive the verb, even where the
    // environment turns it on (the same run, with `maintenance.auto` on). GIT_TRACE records every command a git child of
    // the verb starts.
    assert.doesNotMatch(fs.readFileSync(gitTrace, 'utf8'), /run_command: git (maintenance run|gc) --auto/, 'no git child of the verb starts automatic maintenance');

    // Both runs run the caller's command, and a command handed as several words keeps each word as given, however odd.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/args.sh': 'for a in "$@"; do printf "%s\\n" "$a" >> "$F2P_LOG"; done\n' },
    });
    const odd = ['odd name.txt', "it's.txt", '$x*.txt'];
    r = s.run(s.range, { argv: ['sh', 'tests/args.sh', ...odd] });
    assert.equal(r.stdout.trim(), 'pass-to-pass control=0,put-back=0', r.stderr);
    assert.deepEqual(s.ran(), [...odd, ...odd], 'each run gets the command\'s words as given');

    // A file the range added is removed for the second run, so a test that needs it fails there.
    s = scenario({
      base: { 'a.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'lib.txt': 'lib\n', 'tests/t.sh': probe + 'test -f lib.txt\n' },
    });
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.deepEqual(s.ran(), ['a.txt|docs|lib.txt|tests|', 'a.txt|docs|tests|'], 'the second run sees the tree without the added file');

    // What the control run built is gone for the second run, ignored or not: a test that reads a build copy of the added
    // file fails once the file is put back, where the leftover copy would let it pass.
    for (const [label, ignore, build] of [
      ['an ignored build directory', '.superdev/\nbuild/\n', 'mkdir -p build; cp lib.txt build/lib.out'],
      ['an untracked file', '.superdev/\n', 'cp lib.txt lib.out'],
    ]) {
      s = scenario({
        base: { '.gitignore': ignore, 'a.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'lib.txt': 'lib\n', 'tests/t.sh': `if [ -f lib.txt ]; then ${build}; fi\ntest -f build/lib.out || test -f lib.out\n` },
      });
      r = s.run(s.range);
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `${label} of the control run does not reach the second run: ${r.stderr}`);
    }

    // A tracked file the control run changed outside the put-back paths does not reach the second run either: the test
    // regenerates `gen.txt` from `src.txt` only while the change is present, and the base's `gen.txt` must fail it.
    s = scenario({
      base: { 'src.txt': 'a\n', 'gen.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': 'if grep -q b src.txt; then cp src.txt gen.txt; fi\ngrep -q b gen.txt\n' },
    });
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `a tracked file the control run changed is reset before the second run: ${r.stderr}`);

    // A deleted or renamed file is restored for the second run. A put-back path is a literal path: a file named
    // `*.cfg` never reaches the test file `tests/x.cfg` that the glob would also match.
    s = scenario({
      base: {
        'old.txt': 'old\n', 'mv.txt': 'mv\n', '*.cfg': 'one\n', 'tests/x.cfg': 'one\n', 'docs/agents/verification.md': verif(CMD, CMD),
      },
      tip: { 'old.txt': null, '*.cfg': 'two\n', 'tests/x.cfg': 'two\n', 'tests/t.sh': probe + 'cat tests/x.cfg >> "$F2P_LOG"\ntest ! -e old.txt\n' },
      rename: [['mv.txt', 'moved.txt']],
      cmd: 'sh tests/t.sh tests/x.cfg',
    });
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.deepEqual(
      s.ran(),
      ['*.cfg|docs|moved.txt|tests|', 'two', '*.cfg|docs|mv.txt|old.txt|tests|', 'two'],
      'the second run sees the deleted and the renamed file as they stood at the base, and the test file as it stands at the tip',
    );

    // A range that replaces a file with a directory of the same name (`foo` becomes `foo/bar.js`), or a directory with a file,
    // is put back too. Each test needs the tip's shape of `foo`, so it fails once the base's shape is back. (`./foo` is the
    // path `foo` under another key: the tip deletes the directory, then writes the file.)
    for (const [label, base, tip, test] of [
      ['a file replaced by a directory', { foo: 'f\n' }, { foo: null, 'foo/bar.js': 'x\n' }, 'test -d foo'],
      ['a directory replaced by a file', { 'foo/bar.js': 'x\n' }, { foo: null, './foo': 'f\n' }, 'test -f foo'],
    ]) {
      s = scenario({
        base: { ...base, 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { ...tip, 'tests/t.sh': test + '\n' },
      });
      r = s.run(s.range);
      assert.equal(r.status, 0, `${label} is put back: ${r.stderr}`);
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `${label} reads fail-to-pass: ${r.stderr}`);
    }

    // A refusal: exit 1 with the message on stderr, no trace line, no worktree, nothing run, the checkout as it was.
    const refuses = (sc, range, message, o = {}) => {
      const before = [checkout(sc.repo), checkout(sc.tree)];
      const out = sc.run(range, o);
      assert.equal(out.status, 1, `${range} is refused: ${out.stdout}${out.stderr}`);
      assert.match(out.stderr, message, `${range} names its reason`);
      assert.equal(out.stdout, '', 'a refusal prints no outcome');
      assert.deepEqual(sc.trace(), [], `${range} writes no trace line`);
      assert.deepEqual(leftover(sc), [], `${range} leaves no worktree directory`);
      assert.deepEqual([checkout(sc.repo), checkout(sc.tree)], before, `${range} leaves the checkout as it was`);
      assert.deepEqual(sc.ran(), [], `${range} runs nothing`);
    };
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    refuses(s, `nope..${s.tipSha}`, /"nope" does not resolve/);
    refuses(s, `${s.baseSha}..nope`, /"nope" does not resolve/);
    refuses(s, s.baseSha, /not a <base>\.\.<tip> range/);
    refuses(s, `${s.baseSha}...${s.tipSha}`, /does not resolve|not a <base>\.\.<tip> range/);
    refuses(s, `${s.tipSha}..${s.baseSha}`, /not an ancestor/);
    refuses(s, `${s.tipSha}..${s.tipSha}`, /empty/);
    // A range whose commits change no file is empty as well.
    const quiet = scenario({ base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) }, tip: {} });
    refuses(quiet, quiet.range, /empty/);
    // A range that changes only test files has nothing to put back.
    const testsOnly = scenario({ base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) }, tip: { 'tests/t.sh': probe } });
    refuses(testsOnly, testsOnly.range, /only test files/);

    // A git that fails to list the range's changed paths, or to read the tip's `verification.md`, is refused with its own
    // message. A `git` shim on the PATH fails the one subcommand and runs the real git for every other.
    const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    const failing = (sub) => {
      const dir = path.join(s.dir, `shim-${sub}`);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = ${sub} ] && exit 1; done\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
      return { env: { PATH: dir + path.delimiter + process.env.PATH } };
    };
    refuses(s, s.range, /git could not list the paths the range changes/, failing('diff'));
    refuses(s, s.range, /git could not read the tip's verification configuration/, failing('ls-tree'));

    // The verb runs only the command it is handed (ADR 0182): a range with no `--` command, or an empty one, is refused.
    refuses(s, s.range, /-- <command>/, { noCommand: true });
    refuses(s, s.range, /needs a command/, { cmd: ' ' });
    // A range that changes no test file has no test of its own to fail.
    const noTests = scenario({ base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) }, tip: { 'src.txt': 'b\n' } });
    refuses(noTests, noTests.range, /changes no test file/);
    // The verb reads no word of the command (ADR 0188): a command that names no test file of the range, or names one only to a
    // command that runs nothing, runs and records its outcome with the command, and the reviewer judges what it ran.
    const twoTests = scenario({
      base: { 'src.txt': 'a\n', 'tests/old.sh': 'x\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe, 'tests/old.sh': 'y\n' },
    });
    for (const cmd of ['sh tests/t.sh', ': tests/old.sh; sh tests/t.sh', 'sh tests/t.sh old']) {
      fs.rmSync(path.join(twoTests.root, 'trace.log'), { force: true });
      r = twoTests.run(twoTests.range, { cmd });
      assert.equal(r.stdout.trim(), 'pass-to-pass control=0,put-back=0', `${cmd} runs: ${r.stderr}`);
      assert.equal(readTrace(fs.readFileSync(path.join(twoTests.root, 'trace.log'), 'utf8')).find((e) => e.kind === 'fail-to-pass').fields[3], traceField(cmd), `${cmd} is recorded on the outcome line`);
    }

    // A control that moves HEAD records the tip it ran on and a dirty tree, as `scope.js test` does for a moved HEAD.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'git -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -q --allow-empty -m moved\n' },
    });
    s.run(s.range);
    assert.deepEqual(s.runLines(), [`01 main run path pass ${s.tipSha} dirty tests/t.sh`], 'a moved HEAD reads dirty at the tip');

    // A control that does not pass records `unknown` with its exit status as the reason (INV-0139): the second run never happens.
    // The scope run's first `unknown` is an observation naming the environment gap (references/scope-mode.md's `## Observations`).
    // The verb says so on stderr for that outcome alone, reading the run root's own trace, so a later `unknown` in the same
    // scope run, an outcome that reads a verdict, and a run outside every run root each say nothing.
    const firstUnknown = /the scope run's first unknown outcome[\s\S]*capture an observation naming the environment gap/;
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'exit 3\n' },
    });
    r = s.run(s.range);
    assert.equal(r.status, 0, 'an `unknown` is an outcome that was read and printed: ' + r.stderr);
    assert.equal(r.stdout.trim(), 'unknown control=3', 'the outcome names the control\'s exit status');
    assert.match(r.stderr, firstUnknown, 'the first `unknown` of the scope run says to capture an observation');
    assert.deepEqual(s.runLines(), [`01 main run path fail ${s.tipSha} clean tests/t.sh`], 'a failing control writes a failing run line');
    assert.deepEqual(s.ran(), ['docs|src.txt|tests|'], 'only the control ran');
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} unknown control=3`], 'and its line is written');
    assert.deepEqual(leftover(s), []);
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'unknown control=3');
    assert.doesNotMatch(r.stderr, /observation/, 'a second `unknown` in the same scope run says nothing');
    assert.equal(s.trace().length, 2, 'and both lines are written');

    // A real run's trace holds lines already: its ledger lines and an earlier outcome that read a verdict, which is no
    // `unknown`, so the first `unknown` after them still says so. The scenario above has the same base and tip: its trace is
    // overwritten with the seed.
    fs.writeFileSync(path.join(s.root, 'trace.log'),
      '2026-10-10T00:00:00.000Z scope main ledger init demo\n' +
      `2026-10-10T00:00:01.000Z 01 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1\n`);
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'unknown control=3');
    assert.match(r.stderr, firstUnknown, 'the first `unknown` after a readable trace and an earlier verdict says to capture an observation');
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'unknown control=3');
    assert.doesNotMatch(r.stderr, /observation/, 'a second `unknown` after a readable trace says nothing');
    assert.equal(s.trace().length, 4, 'and both lines are appended to the seeded trace');
    s = scenario({
      bare: true,
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'exit 3\n' },
    });
    r = s.run(s.range, { cwd: s.repo });
    assert.equal(r.stdout.trim(), 'unknown control=3', r.stderr);
    assert.doesNotMatch(r.stderr, /observation/, 'outside every run root there is no scope run to observe');
  } finally {
    done();
  }
}
