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
    const verif = (full, focused, whole) => {
      fs.writeFileSync(path.join(S, 'docs', 'agents', 'verification.md'),
        `# V\n\n\`\`\`sh\n${full}\n\`\`\`\n\n\`\`\`sh\n${focused}\n\`\`\`\n` + (whole ? `\n## Whole-repo command\n\n\`${whole}\`\n` : ''));
      sh(S, ['add', '-A']);
      sh(S, ['commit', '-q', '--allow-empty', '-m', 'v']);
    };
    const traceFile = path.join(root, 'trace.log');
    const lines = () => (fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').slice(1).join(' ')) : []);
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

    // The free-command form runs only a classified test run.
    reset();
    r = verb(['--', 'echo', 'hi']);
    assert.notEqual(r.status, 0, 'a non-test command is refused');
    assert.ok(!r.stdout.includes('hi'), 'and nothing runs');
    assert.deepEqual(lines(), [], 'and nothing is recorded');
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
