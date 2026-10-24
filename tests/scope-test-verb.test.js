'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb, split off the core verbs' suite so a test-first step on
// one verb runs only that verb's cases (ADR 0139).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertSpawnDecided } = require('./spawn-verdict');
const { verif: verifText } = require('./scope-setup');

const scopePath = require.resolve('../plugin/scripts/scope.js');

// `scope.js test` (ADR 0127, INV-0117): runs a test command itself and records its own outcome.
{
  const { spawnSync } = require('node:child_process');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-verb-'));
  try {
    const root = path.join(D, '.superdev', 'scopes', 'demo');
    const S = path.join(root, 'slicetrees', '03');
    fs.mkdirSync(path.join(S, 'docs', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ledger.md'),
      '# Ledger — demo\n\n**Stage:** implementing\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 03 | #3 | t | behavior | — | in-progress | — |\n');
    const bin = path.join(D, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'bats'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const env = Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH });
    const sh = (cwd, argv) => {
      const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...argv], { cwd, encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(r, 'git ' + argv[0]);
      return r.stdout.trim();
    };
    const cli = (argv) => {
      const r = spawnSync(process.execPath, [scopePath, ...argv], { cwd: S, encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(r, 'scope.js ' + argv.join(' '));
      return r;
    };
    sh(S, ['init', '-q']);
    // A path run needs its file to exist (triage #1210); verif's commit takes it into the tree.
    fs.mkdirSync(path.join(S, 'services', 'x', 'tests'), { recursive: true });
    fs.writeFileSync(path.join(S, 'services', 'x', 'tests', 'a.bats'), '');
    const verif = (full, focused, whole) => {
      fs.writeFileSync(path.join(S, 'docs', 'agents', 'verification.md'),
        verifText(full, focused, whole ? `\n## Whole-repo command\n\n\`${whole}\`\n` : ''));
      sh(S, ['add', '-A']);
      sh(S, ['commit', '-q', '--allow-empty', '-m', 'v']);
    };
    const traceFile = path.join(root, 'trace.log');
    // The trace's lines without their timestamp, and a `run` line without its duration, which the duration case reads itself.
    const lines = () => (fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8').split('\n').filter(Boolean).map((l) => {
      const w = l.split(' ').slice(1);
      return (w[2] === 'run' && w.length === 9 ? w.slice(0, 8) : w).join(' ');
    }) : []);
    const verb = (argv, o) => {
      const r = spawnSync(process.execPath, [scopePath, 'test', ...argv], Object.assign({ cwd: S, encoding: 'utf8', timeout: 20000, env }, o));
      assertSpawnDecided(r, 'scope.js test ' + argv.join(' '));
      return r;
    };
    const bash = (script, o) => {
      const r = spawnSync('bash', ['-c', script], Object.assign({ cwd: S, encoding: 'utf8', timeout: 30000, env }, o));
      assertSpawnDecided(r, 'bash driver');
      return r;
    };
    const reset = () => fs.rmSync(traceFile, { force: true });

    // A failing suite piped into tail: the command's own status is recorded, once, on the slice at the tree's commit.
    verif('echo hello && exit 3', 'echo FOCUSED {paths}');
    let sha = sh(S, ['rev-parse', 'HEAD']);
    let r = bash(`node ${scopePath} test full | tail -1`);
    assert.equal(r.stdout.trim(), 'hello', 'the command output streams through');
    assert.deepEqual(lines(), [`03 main run full fail ${sha} clean -`], 'one run line with the real outcome, whatever the pipe');
    assert.equal(verb(['full']).status, 3, 'the verb exits with the command status');
    reset();
    verif('echo ok', 'echo FOCUSED {paths}');
    assert.equal(verb(['full']).status, 0);
    assert.match(lines()[0], /^03 main run full pass [0-9a-f]{40} clean -$/, 'a passing run records pass');
    // A configured command whose last path part is a reading command's name is a test run (INV-0129).
    reset();
    fs.mkdirSync(path.join(S, 'script'));
    fs.writeFileSync(path.join(S, 'script', 'test'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    verif('script/test', 'script/test {paths}');
    assert.equal(verb(['--', 'script/test']).status, 0, 'a configured script/test is not refused');
    assert.match(lines()[0] || '', /^03 main run full pass [0-9a-f]{40} clean -$/, 'a configured script/test records a full run');

    // whole runs the configured whole-repo command; focused substitutes shell-quoted paths, and with none runs full.
    reset();
    verif('echo FULLRAN', 'echo FOCUSED {paths}', 'echo WHOLERAN');
    assert.equal(verb(['whole']).stdout.trim(), 'WHOLERAN');
    assert.match(lines()[0], / run whole pass /);
    r = verb(['focused', 'a b.ts', 'c.ts']);
    assert.equal(r.stdout.trim(), 'FOCUSED a b.ts c.ts', 'both paths substitute for {paths}');
    assert.match(lines()[1], / run focused pass /);
    assert.equal(verb(['focused', "it's.ts"]).stdout.trim(), "FOCUSED it's.ts", 'a path is shell-quoted');
    r = verb(['focused']);
    assert.equal(r.stdout.trim(), 'FULLRAN', 'no path runs the full command');
    assert.match(lines()[3], / run full pass /, 'and records full');
    assert.match(lines()[3], / -$/, 'a full run records no path set');

    // A run line records its duration in whole milliseconds as its last field (ADR 0182). The command sleeps, so the
    // duration is at least the sleep it ran; no ceiling is asserted (root AGENTS.md, ADR 0086).
    {
      const { readTrace } = require('../plugin/lib/trace-log.js');
      reset();
      verif('sleep 0.3');
      assert.equal(verb(['full']).status, 0);
      const e = readTrace(fs.readFileSync(traceFile, 'utf8')).filter((x) => x.kind === 'run').pop();
      assert.match(e.fields[5], /^\d+$/, 'the duration is a whole number of milliseconds');
      assert.ok(Number(e.fields[5]) >= 300, `the duration covers the command's own sleep: ${e.fields[5]} ms`);
      verif('echo FULLRAN', 'echo FOCUSED {paths}', 'echo WHOLERAN');
    }

    // A focused run records its path set, and the trace reader returns it whole for any path (ADR 0175).
    {
      const { readTrace, decodePaths } = require('../plugin/lib/trace-log.js');
      const lastRun = () => readTrace(fs.readFileSync(traceFile, 'utf8')).filter((e) => e.kind === 'run').pop();
      for (const set of [['a b.ts', 'c.ts'], ['x,y.ts', 'z.ts'], ['-lead.ts'], ['-'], ['café.ts', '100%.ts', 'back\\slash.ts', 'p%2Cq.ts']]) {
        reset();
        assert.equal(verb(['focused', ...set]).status, 0);
        const e = lastRun();
        assert.equal(e.fields[0], 'focused');
        assert.deepEqual(decodePaths(e.fields[4]), set, `the set reads back whole: ${JSON.stringify(set)}`);
      }
      assert.deepEqual(decodePaths('-'), [], 'a line with no path set reads an empty set');
      reset();
      verb(['full']);
      assert.deepEqual(decodePaths(lastRun().fields[4]), [], 'a full run holds no path set');
      // An empty path argument is refused before anything runs, so it never reads as an absent or empty-member set.
      for (const bad of [[''], ['a', '']]) {
        reset();
        const r = verb(['focused', ...bad]);
        assert.notEqual(r.status, 0, `an empty path is refused: ${JSON.stringify(bad)}`);
        assert.match(r.stderr, /empty path/, 'the refusal names the empty path');
        assert.equal(lines().length, 0, 'nothing runs and no run line is written');
      }
    }

    // The free-command form runs only a classified test run.
    reset();
    r = verb(['--', 'echo', 'hi']);
    assert.notEqual(r.status, 0, 'a non-test command is refused');
    assert.ok(!r.stdout.includes('hi'), 'and nothing runs');
    assert.deepEqual(lines(), [], 'and nothing is recorded');
    r = verb(['--', 'command', '-pv', 'bats', 'services/x/tests/a.bats']);
    assert.notEqual(r.status, 0, 'a `command -v` lookup of a test run is refused');
    assert.deepEqual(lines(), [], 'and records nothing');
    r = verb(['--', 'bats', 'services/x/tests/a.bats']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(lines()[0], /^03 main run path pass [0-9a-f]{40} clean services\/x\/tests\/a\.bats$/, 'a path run records its file');
    reset();
    r = verb(['--', 'bats services/x/tests/a.bats | cat']);
    assert.match(lines()[0], / run path unknown /, 'a status the command shape hides records unknown');

    // No option sets outcome, kind, slice, or tree state.
    reset();
    for (const argv of [['--outcome', 'pass', 'full'], ['full', '--kind', 'whole'], ['--slice', '01', 'full'], ['bogus']]) {
      assert.notEqual(verb(argv).status, 0, argv.join(' ') + ' is refused');
    }
    assert.deepEqual(lines(), []);
    const usage = verb(['--help']).stdout.split('\n').filter((l) => /^ {2}test\b/.test(l)).join('\n');
    assert.ok(usage, 'usage lists the verb');
    assert.ok(!/--(outcome|kind|slice|tree|status|root)/.test(usage), 'its usage names no option that sets a run field');

    // An unconfigured kind is refused, naming the missing command.
    const root2 = path.join(D, '.superdev', 'scopes', 'bare');
    const S2 = path.join(root2, 'slicetrees', '01');
    fs.mkdirSync(S2, { recursive: true });
    fs.copyFileSync(path.join(root, 'ledger.md'), path.join(root2, 'ledger.md'));
    sh(S2, ['init', '-q']);
    r = verb(['full'], { cwd: S2 });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no full command/, 'the missing command is named');
    verif('echo ok', 'echo f', '');
    r = verb(['whole']);
    assert.match(r.stderr, /no whole command/, 'a missing whole command is named');
    assert.equal(fs.existsSync(path.join(root2, 'trace.log')), false);

    // A run during which the tree dirties, or HEAD moves, records dirty; a start commit stays the start commit.
    reset();
    verif('touch made-dirty.txt', 'true');
    verb(['full']);
    assert.match(lines()[0], / run full pass [0-9a-f]{40} dirty -$/, 'a tree dirtied during the run is dirty');
    fs.rmSync(path.join(S, 'made-dirty.txt'));
    reset();
    const gate = path.join(D, 'gate');
    fs.mkdirSync(gate);
    verif(`touch ${gate}/started; while [ ! -f ${gate}/go ]; do sleep 0.05; done`, 'true');
    sha = sh(S, ['rev-parse', 'HEAD']);
    bash(`node ${scopePath} test full & V=$!; while [ ! -f ${gate}/started ]; do sleep 0.05; done;` +
      ` git -c user.name=t -c user.email=t@t commit -q --allow-empty -m moved; touch ${gate}/go; wait $V`);
    assert.deepEqual(lines(), [`03 main run full pass ${sha} dirty -`], 'a background run records at its end, with its start commit, dirty for the moved HEAD');
    // Suite reuse: a clean run line at HEAD backs a green record (the control); the dirty line of a moved-HEAD run does not,
    // even with HEAD back on the start commit; and a dirty tree alone, at an unmoved HEAD, does not either.
    const reuse = () => {
      const head = sh(S, ['rev-parse', 'HEAD']);
      assert.equal(cli(['suite', 'set', 'green', head, '--root', root]).status, 0);
      return cli(['suite', 'reusable', '--branch', 'HEAD', '--root', root]);
    };
    sh(S, ['reset', '-q', '--hard', sha]);
    reset();
    verif('true', 'true');
    assert.equal(verb(['full']).status, 0);
    assert.equal(reuse().status, 0, 'control: a clean run line at HEAD backs reuse');
    reset();
    verif('touch made-dirty.txt', 'true');
    verb(['full']);
    fs.rmSync(path.join(S, 'made-dirty.txt'));
    assert.match(reuse().stderr, /dirty tree/, 'a run that dirtied an unmoved tree does not back reuse');
    reset();
    verif(`touch ${gate}/started2; while [ ! -f ${gate}/go2 ]; do sleep 0.05; done`, 'true');
    sha = sh(S, ['rev-parse', 'HEAD']);
    bash(`node ${scopePath} test full & V=$!; while [ ! -f ${gate}/started2 ]; do sleep 0.05; done;` +
      ` git -c user.name=t -c user.email=t@t commit -q --allow-empty -m moved2; touch ${gate}/go2; wait $V`);
    sh(S, ['reset', '-q', '--hard', sha]);
    assert.match(lines()[0], new RegExp(`^03 main run full pass ${sha} dirty -$`));
    assert.match(reuse().stderr, /dirty tree/, 'a moved-HEAD run line does not back reuse, with HEAD back on its start commit');
    // An edit the run trace records during the run, reverted before the run ends, still records dirty: the tree changed.
    reset();
    verif(`touch ${gate}/started3; while [ ! -f ${gate}/go3 ]; do sleep 0.05; done`, 'true');
    sha = sh(S, ['rev-parse', 'HEAD']);
    const editInput = JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', cwd: S, tool_input: { file_path: path.join(S, 'transient.txt') } });
    bash(`node ${scopePath} test full & V=$!; while [ ! -f ${gate}/started3 ]; do sleep 0.05; done;` +
      ` echo x > transient.txt; printf '%s' '${editInput}' | node ${path.join(__dirname, '..', 'plugin', 'hooks', 'run-trace.js')}; rm transient.txt;` +
      ` touch ${gate}/go3; wait $V`);
    assert.match(lines().find((l) => / run /.test(l)) || '', new RegExp(`^03 main run full pass ${sha} dirty -$`), 'an edit made and reverted during the run records dirty');
    assert.match(reuse().stderr, /dirty tree/, 'and that run line does not back reuse');

    // Killing the verb mid-run writes no line and leaves no child running (SIGTERM, and SIGKILL through the watcher).
    for (const sig of ['TERM', 'KILL']) {
      reset();
      const k = path.join(D, 'k' + sig);
      fs.mkdirSync(k);
      verif(`echo $$ > ${k}/pid; sleep 30 & echo $! > ${k}/spid; wait`, 'true');
      r = bash(`node ${scopePath} test full & V=$!; while [ ! -s ${k}/spid ]; do sleep 0.05; done; kill -${sig} $V; wait $V;` +
        ` for i in $(seq 100); do kill -0 $(cat ${k}/pid) 2>/dev/null || kill -0 $(cat ${k}/spid) 2>/dev/null || { echo gone; exit 0; }; sleep 0.1; done; echo alive`);
      assert.equal(r.stdout.trim().split('\n').pop(), 'gone', 'SIG' + sig + ': no child is left running: ' + r.stdout + r.stderr);
      assert.deepEqual(lines(), [], 'SIG' + sig + ': no line is written');
    }
    // An interrupted verb has the command's group sent SIGTERM only: a runner that traps it to tear down finishes its cleanup.
    {
      reset();
      const k = path.join(D, 'kTrap');
      fs.mkdirSync(k);
      verif(`trap "sleep 1; touch ${k}/cleaned" TERM; touch ${k}/ready; sleep 30 & wait`, 'true');
      r = bash(`node ${scopePath} test full & V=$!; while [ ! -f ${k}/ready ]; do sleep 0.05; done; kill -TERM $V; wait $V;` +
        ` for i in $(seq 100); do [ -f ${k}/cleaned ] && { echo cleaned; exit 0; }; sleep 0.1; done; echo missing`);
      assert.equal(r.stdout.trim().split('\n').pop(), 'cleaned', 'the TERM trap finishes its cleanup: ' + r.stdout + r.stderr);
    }
    // A SIGKILLed verb cannot signal: only its watcher does, and it also sends SIGTERM, so the trap still finishes.
    {
      reset();
      const k = path.join(D, 'kTrapKill');
      fs.mkdirSync(k);
      verif(`trap "sleep 1; touch ${k}/cleaned" TERM; touch ${k}/ready; sleep 30 & wait`, 'true');
      r = bash(`node ${scopePath} test full & V=$!; while [ ! -f ${k}/ready ]; do sleep 0.05; done; kill -KILL $V; wait $V;` +
        ` for i in $(seq 100); do [ -f ${k}/cleaned ] && { echo cleaned; exit 0; }; sleep 0.1; done; echo missing`);
      assert.equal(r.stdout.trim().split('\n').pop(), 'cleaned', 'after SIGKILL of the verb the TERM trap finishes its cleanup: ' + r.stdout + r.stderr);
    }
    // A process the command forks as its leader is dying (here from the TERM trap, after the watcher's signal went out) is
    // still in the group and still gets ended: it neither outlives the verb nor holds the caller's output open.
    {
      reset();
      const k = path.join(D, 'kLate');
      fs.mkdirSync(k);
      verif(`trap "sleep 30 & echo \\$! > ${k}/late; exit 0" TERM; touch ${k}/ready; sleep 30 & wait`, 'true');
      r = bash(`node ${scopePath} test full & V=$!; while [ ! -f ${k}/ready ]; do sleep 0.05; done; kill -KILL $V; wait $V;` +
        ` for i in $(seq 100); do [ -s ${k}/late ] && break; sleep 0.1; done;` +
        ` for i in $(seq 100); do kill -0 $(cat ${k}/late) 2>/dev/null || { echo gone; exit 0; }; sleep 0.1; done; echo alive`);
      assert.equal(r.stdout.trim().split('\n').pop(), 'gone', 'a process forked while the command ends is ended too: ' + r.stdout + r.stderr);
    }
    // The same late fork on the interrupted path: the verb itself gets SIGTERM, closes the watcher's channel and exits, and the
    // watcher ends the group as it does for a SIGKILLed verb. The late child is still ended. Several rounds, because the order
    // of the verb's exit, the leader's exit, and the channel's close is a race; each round is its own bash driver.
    {
      reset();
      const k = path.join(D, 'kLateTerm');
      fs.mkdirSync(k);
      verif(`trap "sleep 30 & echo \\$! > ${k}/late; exit 0" TERM; touch ${k}/ready; sleep 30 & wait`, 'true');
      for (let n = 1; n <= 40; n++) {
        const out = bash(`rm -f ${k}/ready ${k}/late; node ${scopePath} test full & V=$!; while [ ! -f ${k}/ready ]; do sleep 0.01; done;` +
          ` kill -TERM $V; wait $V; for i in $(seq 100); do [ -s ${k}/late ] && break; sleep 0.1; done;` +
          ` [ -s ${k}/late ] || { echo nolate; exit 0; };` +
          ` for i in $(seq 100); do kill -0 $(cat ${k}/late) 2>/dev/null || { echo gone; exit 0; }; sleep 0.1; done; echo alive`);
        assert.equal(out.stdout.trim().split('\n').pop(), 'gone', 'interrupted verb, round ' + n + ': a process forked while the command ends is ended too: ' + out.stdout + out.stderr);
      }
    }
    // A signal at the first moment the command is alive leaves nothing running: the handlers and the watcher exist before the
    // command starts, so no instant lacks a killer. Several rounds, because the instant is a race. Each round is its own
    // bash driver, so the driver's bound covers one round's work, never the sum of every round's under machine load.
    for (const sig of ['TERM', 'KILL']) {
      reset();
      const k = path.join(D, 'q' + sig);
      fs.mkdirSync(k);
      verif(`echo $$ > ${k}/pid.$$.tmp; mv ${k}/pid.$$.tmp ${k}/pid; sleep 30 & echo $! > ${k}/spid; wait`, 'true');
      for (let n = 1; n <= 25; n++) {
        const out = bash(`alive() { kill -0 $(cat ${k}/pid) 2>/dev/null || { [ -s ${k}/spid ] && kill -0 $(cat ${k}/spid) 2>/dev/null; }; };` +
          ` rm -f ${k}/pid ${k}/spid; node ${scopePath} test full & V=$!;` +
          ` while [ ! -s ${k}/pid ]; do sleep 0.01; done; kill -${sig} $V; wait $V;` +
          ` for i in $(seq 100); do alive || break; sleep 0.1; done; sleep 0.3; alive && { echo alive; exit 0; }; echo gone`);
        assert.equal(out.stdout.trim().split('\n').pop(), 'gone', 'SIG' + sig + ' right after the start, round ' + n + ': no child is left running: ' + out.stdout + out.stderr);
      }
      assert.deepEqual(lines(), [], 'SIG' + sig + ' right after the start: no line is written');
    }
    // A command ended by a signal writes no line.
    reset();
    verif('kill -TERM $$', 'true');
    assert.notEqual(verb(['full']).status, 0);
    assert.deepEqual(lines(), [], 'a signal-ended command records nothing');

    // A failed trace write prints a note on stderr and leaves the exit status alone.
    verif('exit 7', 'true');
    reset();
    fs.mkdirSync(traceFile);
    r = verb(['full']);
    assert.equal(r.status, 7, 'the exit status is unchanged');
    assert.match(r.stderr, /trace/, 'a note names the failed write');
    fs.rmdirSync(traceFile);

    // Outside every run tree the verb runs the command, passes the status through, and writes nothing.
    const free = path.join(D, 'free');
    fs.mkdirSync(path.join(free, 'docs', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(free, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\necho FREE; exit 4\n```\n');
    r = verb(['full'], { cwd: free });
    assert.equal(r.status, 4);
    assert.equal(r.stdout.trim(), 'FREE');
    r = verb(['--', 'echo', 'hi'], { cwd: free });
    assert.notEqual(r.status, 0, 'outside a run tree a non-test command is refused too');
    assert.ok(!r.stdout.includes('hi'), 'and nothing runs');
    fs.mkdirSync(path.join(free, 'tests'));
    fs.writeFileSync(path.join(free, 'tests', 'a.test.js'), 'process.exit(5);\n');
    r = verb(['--', 'node', 'tests/a.test.js'], { cwd: free });
    assert.equal(r.status, 5, 'a classified test command runs outside a run tree, and passes the status through');
    // A test path naming no file is no test run, as the hook reads it: the verb refuses it and runs nothing.
    r = verb(['--', 'node', 'tests/missing.test.js'], { cwd: free });
    assert.match(r.stderr, /not a test run/, 'a test path naming no file is refused');
    // A runner script named `test`, given as a path, is a test run: only the bare builtin `test` reads as no run.
    fs.writeFileSync(path.join(free, 'test'), '#!/bin/sh\nexit 6\n', { mode: 0o755 });
    r = verb(['--', './test', 'tests/a.test.js'], { cwd: free });
    assert.equal(r.status, 6, 'a runner script named test runs and passes its status through');
    fs.rmSync(path.join(free, 'test'));
    // A command that cd's into a run tree is that tree's run, wherever the verb stands: it records there.
    reset();
    fs.mkdirSync(path.join(S, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(S, 'tests', 'cd.test.js'), 'process.exit(0);\n');
    r = verb(['--', `cd ${S} && node tests/cd.test.js`], { cwd: free });
    assert.equal(r.status, 0);
    assert.match(lines()[0] || '', / run path pass [0-9a-f]{40} \w+ tests\/cd\.test\.js$/, 'a cd into a run tree records its run');
    fs.rmSync(path.join(S, 'tests', 'cd.test.js'));
    // A command that cd's out of every run tree is an out-of-tree run, wherever the verb stands: it runs and records nothing.
    reset();
    r = verb(['--', `cd ${free} && node tests/a.test.js`]);
    assert.equal(r.status, 5, 'a cd out of the run tree runs the test command and passes the status through: ' + r.stderr);
    assert.deepEqual(lines(), [], 'and records nothing');
    // A `cd` into a subdirectory classifies against that directory's repository top, where the commands are configured.
    const other = path.join(D, 'other');
    fs.mkdirSync(path.join(other, 'docs', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(other, 'sub'));
    fs.writeFileSync(path.join(other, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\nchecker\n```\n');
    fs.writeFileSync(path.join(bin, 'checker'), '#!/bin/sh\nexit 6\n', { mode: 0o755 });
    sh(other, ['init', '-q']);
    r = verb(['--', 'cd sub && checker'], { cwd: other });
    assert.equal(r.status, 6, 'outside every run tree, a cd into a subdirectory runs the configured command: ' + r.stderr);
    reset();
    r = verb(['--', `cd ${path.join(other, 'sub')} && checker`]);
    assert.equal(r.status, 6, 'a cd into another repository\'s subdirectory runs the configured command: ' + r.stderr);
    assert.deepEqual(lines(), [], 'and records nothing');
    reset();
    assert.deepEqual(lines(), [], 'nothing is written');
    fs.rmSync(path.join(free, 'tests'), { recursive: true });
    assert.deepEqual(fs.readdirSync(free).sort(), ['docs'], 'and no file appears');

    // A configured kind runs at the tree root, from any subdirectory of the tree.
    reset();
    fs.writeFileSync(path.join(S, 'rootfile.txt'), 'ROOTMARK\n');
    fs.mkdirSync(path.join(S, 'sub'), { recursive: true });
    verif('cat rootfile.txt', 'cat rootfile.txt');
    r = verb(['full'], { cwd: path.join(S, 'sub') });
    assert.equal(r.stdout.trim(), 'ROOTMARK', 'a root-relative command runs from a subdirectory');
    assert.equal(r.status, 0);
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}

// The command runs under `sh` from PATH, and a run ends through `endRun`, whose platform and kill spawner are injectable
// (ADR 0150, INV-0153).
{
  const { spawnSync } = require('node:child_process');
  const scope = require('../plugin/scripts/scope.js');

  // A CRLF `verification.md` yields the command an LF one does.
  const doc = (nl) => ['# V', '', '```sh', 'echo a', 'echo b', '```', '', '```sh', 'echo f {paths}', '```', ''].join(nl);
  assert.deepEqual(scope.verificationCommandsOf(doc('\r\n'), true), scope.verificationCommandsOf(doc('\n'), true), 'CRLF reads as LF');
  assert.equal(scope.verificationCommandsOf(doc('\r\n'), true).full, 'echo a\necho b', 'no carriage return stays in the command');

  // On win32, ending a run is `taskkill /pid <pid> /t /f`; an exited run is no error, on either platform.
  const calls = [];
  scope.endRun(4242, { platform: 'win32', spawn: (cmd, args) => { calls.push([cmd, ...args]); return { status: 128 }; } });
  assert.deepEqual(calls, [['taskkill', '/pid', '4242', '/t', '/f']], 'win32 ends the process tree through taskkill');
  assert.doesNotThrow(() => scope.endRun(4242, { platform: 'win32', spawn: () => { throw new Error('gone'); } }), 'a failed win32 kill is no error');
  assert.doesNotThrow(() => scope.endRun(2 ** 22 + 12345, { platform: 'linux' }), 'a POSIX kill of an exited run is no error');

  // `scope.js test` starts the command as `sh -c`, found on PATH.
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-sh-'));
  try {
    const bin = path.join(D, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'sh'), '#!/bin/sh\necho SH-STUB\nexec /bin/sh "$@"\n', { mode: 0o755 });
    fs.mkdirSync(path.join(D, 'docs', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(D, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\necho ran\n```\n');
    assertSpawnDecided(spawnSync('git', ['init', '-q'], { cwd: D }), 'git init');
    const r = spawnSync(process.execPath, [scopePath, 'test', 'full'], { cwd: D, encoding: 'utf8', timeout: 20000, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH } });
    assertSpawnDecided(r, 'scope.js test under a stub sh');
    assert.match(r.stdout, /SH-STUB/, 'the command ran under the PATH sh: ' + r.stdout + r.stderr);
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}

// On win32 the watcher ends a running command through `taskkill` when its channel closes, and leaves an exited one alone.
// The watcher runs from its own source text, as `superviseRuns` builds it, with the platform set to win32 and the kill
// spawner replaced by one that logs its argv. A bounded driver process holds the IPC channel, sends the run, and closes it.
{
  const { spawnSync } = require('node:child_process');
  const scope = require('../plugin/scripts/scope.js');
  // Runs a command under the win32 watcher and closes the channel: while it runs (`exitFirst` false) or once it exited,
  // leaving a background `sleep` in its group, which the POSIX branch would still signal and taskkill no longer reaches.
  // The test ends that group itself, since the logged taskkill kills nothing.
  const watch = (D, exitFirst) => {
    const log = path.join(D, 'kill.log');
    const src = `Object.defineProperty(process,'platform',{value:'win32'});const spawnSync=(c,a)=>{require('fs').appendFileSync(${JSON.stringify(log)},[c,...a].join(' ')+'\\n');return {status:0}};const endRun=${scope.endRun};(${scope.watchMain})()`;
    const driver = `const cp=require('child_process'),fs=require('fs');
      const [src,cwd,exitFirst]=process.argv.slice(1);
      const w=cp.spawn(process.execPath,['-e',src,'','','SIGTERM'],{stdio:['ignore','ignore','ignore','ipc']});
      w.on('exit',(code)=>process.stdout.write(String(code)));
      if (exitFirst==='1') w.on('message',()=>w.disconnect());
      else { const t=setInterval(()=>{ if (fs.existsSync(cwd+'/pid')) { clearInterval(t); w.disconnect(); } },20); }
      w.send({command:exitFirst==='1'?'sleep 30 & echo $$ > pid.tmp && mv pid.tmp pid':'echo $$ > pid.tmp && mv pid.tmp pid && exec sleep 30',cwd});`;
    const r = spawnSync(process.execPath, ['-e', driver, src, D, exitFirst ? '1' : '0'], { encoding: 'utf8', timeout: 20000 });
    const pid = fs.existsSync(path.join(D, 'pid')) ? fs.readFileSync(path.join(D, 'pid'), 'utf8').trim() : null;
    if (pid) try { process.kill(-Number(pid), 'SIGKILL'); } catch { /* already gone */ }
    assertSpawnDecided(r, 'the win32 watcher driver');
    return { exit: r.stdout, pid, log: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
  };
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-watch-win32-'));
  try {
    const running = watch(fs.mkdtempSync(path.join(D, 'a-')), false);
    assert.equal(running.exit, '0', 'the watcher exits once the channel closes');
    assert.equal(running.log, `taskkill /pid ${running.pid} /t /f\n`, 'a running command ends through taskkill');
    const exited = watch(fs.mkdtempSync(path.join(D, 'b-')), true);
    assert.equal(exited.exit, '0', 'the watcher exits once the channel closes after its command exited');
    assert.equal(exited.log, '', 'an exited command gets no taskkill, even with a process it left running');
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}

// An install missing lib/shell-words.js, which the command classifier needs, refuses `test -- <command>` as no test run with its usual
// one-line refusal, never a stack trace (INV-0159).
{
  const { spawnSync } = require('node:child_process');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-no-scanner-'));
  try {
    const plugin = path.dirname(path.dirname(scopePath));
    const install = path.join(D, 'install');
    for (const dir of ['scripts', 'lib']) fs.cpSync(path.join(plugin, dir), path.join(install, dir), { recursive: true, filter: (src) => path.basename(src) !== 'shell-words.js' });
    assert.ok(!fs.existsSync(path.join(install, 'lib', 'shell-words.js')), 'the install lacks the scanner');
    const verb = (argv) => {
      const r = spawnSync(process.execPath, [path.join(install, 'scripts', 'scope.js'), 'test', ...argv], { cwd: D, encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(r, 'scope.js test ' + argv.join(' ') + ' without the scanner');
      return r;
    };
    const r = verb(['--', 'echo', 'hi']);
    assert.notEqual(r.status, 0, 'a command no classifier can read is refused');
    assert.match(r.stderr, /not a test run, so nothing runs/, 'the refusal names the command as no test run');
    assert.ok(!/\n\s+at /.test(r.stderr), 'the refusal carries no stack trace');
    assert.ok(!r.stdout.includes('hi'), 'and nothing runs');
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}

// An install whose lib/test-runs.js fails to load for any reason but a missing module stays visible: `test -- <command>` exits nonzero
// with that error, and the one-line "not a test run" refusal does not cover it up.
{
  const { spawnSync } = require('node:child_process');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-broken-classifier-'));
  try {
    const plugin = path.dirname(path.dirname(scopePath));
    const install = path.join(D, 'install');
    for (const dir of ['scripts', 'lib']) fs.cpSync(path.join(plugin, dir), path.join(install, dir), { recursive: true });
    fs.writeFileSync(path.join(install, 'lib', 'test-runs.js'), "'use strict';\nthrow new Error('classifier-load-boom');\n");
    const r = spawnSync(process.execPath, [path.join(install, 'scripts', 'scope.js'), 'test', '--', 'echo', 'hi'], { cwd: D, encoding: 'utf8', timeout: 20000 });
    assertSpawnDecided(r, 'scope.js test -- with a classifier that throws on load');
    assert.notEqual(r.status, 0, 'a classifier that throws on load fails the verb');
    assert.match(r.stderr, /classifier-load-boom/, 'the load error is visible');
    assert.ok(!/not a test run/.test(r.stderr), 'the refusal does not hide it');
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}
