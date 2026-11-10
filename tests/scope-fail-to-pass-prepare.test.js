'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb: the repository's prepare command, which runs in the verb's worktree
// before each of its two runs, and the traced control it gates (ADR 0218, INV-0139). Every scenario writes only inside the
// fixture's own temporary directory (INV-0154).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { f2pFixture, testVerbFixture, verif, writeOperatorConfig, scopePath } = require('./scope-setup');

const { appendTrace } = require(scopePath);

// A `## Prepare command` section holding `body`.
const section = (body) => `\n## Prepare command\n\n${body}\n`;
// The lines the prepare commands below append to `$F2P_DIR/prep`, one per preparation.
const prepared = (s) => {
  const file = path.join(s.dir, 'prep');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
};

{
  const { probe, CMD, scenario, leftover, drive, done } = f2pFixture();
  try {
    // The reproduction (WEAVER-620): the tip's test needs a dependency that exists only in a package directory of the main
    // checkout, which module resolution never reaches from the worktree. With no section the control cannot pass; with a
    // command that installs the dependency in the worktree, the verb judges the tests.
    const repro = (extra) => ({
      base: { '.gitignore': '.superdev/\nnode_modules/\n', 'pkg/src.js': 'module.exports = "a";\n', 'docs/agents/verification.md': verif(CMD, CMD, extra) },
      tip: { 'pkg/src.js': 'module.exports = "b";\n', 'pkg/check.test.js': 'require("dep");\nif (require("./src.js") !== "b") process.exit(1);\n' },
      cmd: 'node pkg/check.test.js',
    });
    const installDep = (s) => {
      fs.mkdirSync(path.join(s.repo, 'pkg', 'node_modules', 'dep'), { recursive: true });
      fs.writeFileSync(path.join(s.repo, 'pkg', 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');
    };
    let s = scenario(repro(''));
    installDep(s);
    let r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'unknown control=1', 'no section: the control cannot load the dependency: ' + r.stderr);
    assert.match(r.stderr, /MODULE_NOT_FOUND/);
    s = scenario(repro(section('`mkdir -p pkg/node_modules/dep && echo "module.exports = 1;" > pkg/node_modules/dep/index.js`')));
    installDep(s);
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', 'a prepare command installs the dependency in the worktree: ' + r.stderr);

    // The command runs before the control and again before the put-back run, which sees the dependency version the restored
    // files name. It is the tip's command, even where the put-back restores a base `verification.md` with another section or
    // none.
    for (const [label, baseExtra] of [['a base with another section', section('`echo base >> "$F2P_DIR/prep"`')], ['a base with no section', '']]) {
      s = scenario({
        base: { 'v.txt': '1\n', 'docs/agents/verification.md': verif(CMD, CMD, baseExtra) },
        tip: { 'v.txt': '2\n', 'docs/agents/verification.md': verif(CMD, CMD, section('`echo "tip $(cat v.txt)" >> "$F2P_DIR/prep"`')), 'tests/t.sh': probe + 'grep -q 2 v.txt\n' },
      });
      r = s.run(s.range);
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `${label}: ${r.stderr}`);
      assert.deepEqual(prepared(s), ['tip 2', 'tip 1'], `${label}: the tip's command prepares each run, with the files that run sees`);
    }

    // A traced passing control is reused only where the tip states a prepare command or `none`; a reused control's put-back run
    // is still prepared. With the section absent, malformed, written as a fence, or only inside a fence, the control runs.
    const runs = (sc) => (fs.existsSync(sc.log) ? fs.readFileSync(sc.log, 'utf8').split('\n').filter(Boolean).length : 0);
    const fence = '```';
    for (const [label, extra, reused, preps] of [
      ['`none`', section('`none`'), true, 0],
      ['the bare word none', section('none'), true, 0],
      ['a command', section('`echo p >> "$F2P_DIR/prep"`'), true, 1],
      ['no section', '', false, 0],
      ['a section of prose', section('Run the installer first.'), false, 0],
      ['a section holding only a fence', section(`${fence}sh\necho p >> "$F2P_DIR/prep"\n${fence}`), false, 0],
      ['a heading inside a fence', `\n${fence}md\n## Prepare command\n\n\`none\`\n${fence}\n`, false, 0],
      ['an uppercase NONE', section('`NONE`'), false, 0],
    ]) {
      s = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, extra) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
      });
      appendTrace(s.root, { slice: '01', kind: 'run', fields: ['path', 'pass', s.tipSha, 'clean', 'tests/t.sh', '40'] });
      r = s.run(s.range);
      if (label === 'an uppercase NONE') {
        // `NONE` is no `none`: it reads as a command, so the control is reused and the put-back run's preparation runs it.
        assert.equal(r.stdout.trim(), 'unknown control=0,prepare=127', `${label}: ${r.stderr}`);
        continue;
      }
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `${label}: ${r.stderr}`);
      assert.equal(runs(s), reused ? 1 : 2, `${label}: the control is ${reused ? '' : 'not '}reused`);
      assert.equal(prepared(s).length, preps, `${label}: preparations`);
    }

    // A preparation that fails, is ended by a signal, cannot start, or dirties the tree gives no verdict. One before the control
    // runs no control and writes no control run line.
    for (const [label, command, reason] of [
      ['a failing command', 'exit 3', 'prepare=3'],
      ['a signalled command', 'kill -TERM $$', 'prepare=SIGTERM'],
      ['a tree-dirtying command', 'echo x >> src.txt', 'prepare=dirty'],
    ]) {
      s = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, section('`' + command + '`')) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
      });
      r = s.run(s.range);
      assert.equal(r.status, 0, `${label}: ${r.stderr}`);
      assert.equal(r.stdout.trim(), `unknown ${reason}`, `${label}: ${r.stderr}`);
      assert.deepEqual(s.ran(), [], `${label}: no control runs`);
      assert.deepEqual(s.runLines(), [], `${label}: no control run line`);
      assert.deepEqual(s.trace().map((l) => l.split(' ').slice(2, 5).join(' ')), [`fail-to-pass ${s.range} unknown`], `${label}: the outcome line`);
      assert.match(r.stderr, /first unknown outcome/, `${label}: the scope run's first unknown is named`);
      assert.deepEqual(leftover(s), [], `${label}: no worktree stays`);
    }
    // No shell on the PATH: the preparation cannot start.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, section('`true`')) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    const gitOnly = path.join(s.dir, 'git-only');
    fs.mkdirSync(gitOnly);
    fs.symlinkSync(process.env.PATH.split(path.delimiter).map((d) => path.join(d, 'git')).find((p) => fs.existsSync(p)), path.join(gitOnly, 'git'));
    r = s.run(s.range, { env: { PATH: gitOnly } });
    assert.equal(r.stdout.trim(), 'unknown prepare=start-failed:ENOENT', r.stderr.slice(0, 2000));
    assert.deepEqual(s.runLines(), [], 'a preparation that cannot start writes no control run line');
    // A preparation that fails before the put-back run follows a control that ran and wrote its line.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, section('`grep -q b src.txt`')) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'unknown control=0,prepare=1', r.stderr);
    assert.equal(s.ran().length, 1, 'the control ran, the put-back run did not');
    assert.equal(s.runLines().length, 1, 'the control wrote its run line');

    // The dirty rule reads tracked files only: a preparation that writes an untracked, unignored file still prepares both runs.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, section('`echo x > made.txt`')) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);

    // Preparation time counts in neither the control's recorded duration nor the put-back bound: a two-second preparation,
    // counted, would make the control's duration at least 2000 ms and the bound at least ten times that. The put-back run
    // hangs, so the bound shows in the outcome.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, section('`sleep 2`')) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt || exec sleep 60\n' },
    });
    writeOperatorConfig(s.repo, { verification: { failToPassFloorMs: 500 } });
    r = s.run(s.range);
    const m = /^unknown control=0,put-back=\S+,bound=(\d+)ms$/.exec(r.stdout.trim());
    assert.ok(m, 'the put-back run is killed at its bound: ' + r.stdout + r.stderr);
    assert.ok(Number(m[1]) < 20000, `the bound ${m[1]} ms leaves the preparation out`);
    const controlMs = Number(s.rawRunLines()[0].split(' ')[8]); // the duration, ahead of the arguments field
    assert.ok(controlMs < 2000, `the control's duration ${controlMs} ms leaves the preparation out`);

    // An interrupt during a preparation ends every process it started and removes the worktree; no control runs.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, section('`echo $$ > "$F2P_PID"; touch "$F2P_MARK"; exec sleep 60`')) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    const ended = drive({
      mode: 'signal', signal: 'SIGTERM', cwd: s.tree, range: s.range, cmd: s.cmd, root: s.root,
      marker: path.join(s.dir, 'marker'), pidfile: path.join(s.dir, 'pid'),
      env: { F2P_LOG: s.log, F2P_DIR: s.dir, F2P_MARK: path.join(s.dir, 'marker'), F2P_PID: path.join(s.dir, 'pid') },
    });
    assert.equal(ended.code, 143, 'the verb exits 128 plus the signal');
    assert.deepEqual(ended.leftAtExit, [], 'the worktree is gone when the verb exits');
    assert.deepEqual(s.trace(), [], 'an interrupted run writes no outcome line');
    assert.deepEqual(s.ran(), [], 'no control ran');
  } finally {
    done();
  }
}

// A `## Prepare command` section written as a fence, ahead of the test command fences, never shifts the full or the focused
// command.
{
  const { S, sh, verb, end } = testVerbFixture();
  try {
    fs.writeFileSync(path.join(S, 'docs', 'agents', 'verification.md'),
      '# V\n\n## Prepare command\n\n```sh\necho PREPARE\n```\n\n## Commands\n\n```sh\necho FULLRAN\n```\n\n```sh\necho FOCUSED {paths}\n```\n');
    sh(S, ['add', '-A']);
    sh(S, ['commit', '-q', '-m', 'v']);
    assert.equal(verb(['full']).stdout.trim(), 'FULLRAN', 'the full command is the first fence outside the section');
    assert.match(verb(['focused', 'services/x/tests/a.bats']).stdout.trim(), /^FOCUSED /, 'the focused command is the second');
  } finally {
    end();
  }
}

// fail-to-pass's help entry names the preparation's reasons.
{
  const r = spawnSync(process.execPath, [scopePath, '--help'], { encoding: 'utf8', timeout: 20000 });
  assertSpawnDecided(r, 'scope.js --help');
  assert.match(r.stdout, /prepare=/, 'the help names the prepare= reasons');
}
