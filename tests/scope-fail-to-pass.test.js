'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb, split off the core verbs' suite so a test-first step on
// one verb runs only that verb's cases (ADR 0139).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertSpawnDecided } = require('./spawn-verdict');

const scopePath = require.resolve('../plugin/scripts/scope.js');
const { appendTrace } = require(scopePath);

// Every case runs at the default floor of the bound unless it sets its own (ADR 0142).
delete process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS;

// `scope.js fail-to-pass` (ADR 0134, INV-0138, INV-0139): runs a range's tests twice in a throwaway worktree, the second
// time with every file the range touched outside its test files put back as it stood at the range's base, and records
// the outcome as a trace line of its own kind. Each scenario is a real repository: a base commit, a tip commit, a run
// root under `.superdev/scopes/`, and a scopetree at the tip, the cwd the verb runs from.
{
  const { spawnSync } = require('node:child_process');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-f2p-'));
  try {
    const git = (cwd, argv) => {
      const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...argv], { cwd, encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(r, 'git ' + argv[0]);
      assert.equal(r.status, 0, 'git ' + argv.join(' ') + ': ' + r.stderr);
      return r.stdout.trim();
    };
    // `verification.md` text: the first fence is the full command, the second the focused one.
    const verif = (full, focused, extra = '') =>
      `# V\n\n\`\`\`sh\n${full}\n\`\`\`\n` + (focused ? `\n\`\`\`sh\n${focused}\n\`\`\`\n` : '') + extra;
    // A test script's first line records what the worktree holds when the command runs.
    const probe = 'ls -1 | tr "\\n" "|" >> "$F2P_LOG"; echo >> "$F2P_LOG"\n';
    let n = 0;
    // `base` and `tip` map a path to its text, or to null to delete it at the tip; `rename` pairs move a base file at the tip.
    const scenario = ({ base, tip, rename = [], bare = false }) => {
      const dir = path.join(D, 's' + ++n);
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      const put = (files) => {
        for (const [rel, text] of Object.entries(files)) {
          const abs = path.join(repo, rel);
          if (text === null) {
            fs.rmSync(abs, { recursive: true, force: true });
            continue;
          }
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, text);
        }
      };
      git(repo, ['init', '-q', '-b', 'main']);
      put({ '.gitignore': '.superdev/\n', ...base });
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '-m', 'base']);
      const baseSha = git(repo, ['rev-parse', 'HEAD']);
      for (const [from, to] of rename) {
        fs.mkdirSync(path.dirname(path.join(repo, to)), { recursive: true });
        fs.renameSync(path.join(repo, from), path.join(repo, to));
      }
      put(tip);
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '--allow-empty', '-m', 'tip']);
      const tipSha = git(repo, ['rev-parse', 'HEAD']);
      const root = path.join(repo, '.superdev', 'scopes', 'demo');
      const tree = path.join(root, 'scopetree');
      // `bare`: a repository with no run root and no `.superdev/` directory.
      if (!bare) {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(path.join(root, 'ledger.md'),
          '# Ledger — demo\n\n**Stage:** implementing\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 01 | #1 | t | behavior | — | in-progress | — |\n');
        git(repo, ['worktree', 'add', '-q', '-b', 'feat/demo', tree, tipSha]);
      }
      const log = path.join(dir, 'log');
      return {
        dir, repo, root, tree, baseSha, tipSha, log, range: `${baseSha}..${tipSha}`,
        run: (range, o = {}) => {
          const r = spawnSync(process.execPath, [scopePath, 'fail-to-pass', range], { cwd: tree, encoding: 'utf8', timeout: 60000, ...o, env: { ...process.env, F2P_LOG: log, F2P_DIR: dir, ...o.env } });
          assertSpawnDecided(r, 'scope.js fail-to-pass ' + range);
          return r;
        },
        trace: () => {
          const file = path.join(root, 'trace.log');
          return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').slice(1).join(' ')) : [];
        },
        ran: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
      };
    };
    const CMD = 'sh tests/t.sh';

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
    r = s.run(s.range, {
      env: {
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_COUNT: String(at + 2),
        [`GIT_CONFIG_KEY_${at}`]: 'commit.gpgsign',
        [`GIT_CONFIG_VALUE_${at}`]: 'true',
        [`GIT_CONFIG_KEY_${at + 1}`]: 'user.useConfigOnly',
        [`GIT_CONFIG_VALUE_${at + 1}`]: 'true',
      },
    });
    assert.equal(r.stdout.trim(), 'pass-to-pass control=0,put-back=0', `the put-back worktree is clean against its HEAD: ${r.stderr}`);

    // The put-back commit starts no automatic maintenance, which could detach and outlive the verb, even where the
    // environment turns it on. GIT_TRACE records every command a git child of the verb starts.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    const gitTrace = path.join(s.dir, 'git-trace');
    r = s.run(s.range, {
      env: {
        GIT_TRACE: gitTrace,
        GIT_CONFIG_COUNT: String(at + 1),
        [`GIT_CONFIG_KEY_${at}`]: 'maintenance.auto',
        [`GIT_CONFIG_VALUE_${at}`]: 'true',
      },
    });
    assert.equal(r.stdout.trim(), 'pass-to-pass control=0,put-back=0', r.stderr);
    assert.doesNotMatch(fs.readFileSync(gitTrace, 'utf8'), /run_command: git (maintenance run|gc) --auto/, 'no git child of the verb starts automatic maintenance');

    // A focused command carrying `{paths}` is the pick green-gate makes on a merge (ADR 0134). The verb and the hook each
    // substitute it with their own quoting: green-gate's quotes every path, the verb's leaves a shell-safe path bare. Sharing one
    // would change green-gate's command string, or put its gate behind the require it keeps fail-silent for the trace writer,
    // so this pins the shell words both hand the command instead. (A focused command with no `{paths}` is no shared
    // pick: green-gate runs it verbatim, the verb runs the full command.)
    s = scenario({
      base: {
        'src/plain.txt': 'a\n', 'odd name.txt': 'a\n', "it's.txt": 'a\n', '$x*.txt': 'a\n',
        'docs/agents/verification.md': verif(CMD, 'sh tests/args.sh {paths}'),
      },
      tip: {
        'src/plain.txt': 'b\n', 'odd name.txt': 'b\n', "it's.txt": 'b\n', '$x*.txt': 'b\n',
        'tests/args.sh': 'for a in "$@"; do printf "%s\\n" "$a" >> "$F2P_LOG"; done\n',
      },
    });
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'pass-to-pass control=0,put-back=0', r.stderr);
    const changedPaths = git(s.repo, ['diff', '--name-only', '--no-renames', '-z', s.baseSha, s.tipSha]).split('\0').filter(Boolean);
    let picked;
    require('../plugin/hooks/green-gate.js').decide(
      { tool_input: { command: 'git merge --no-ff slice/s1' } },
      () => ({ full: CMD, focused: 'sh tests/args.sh {paths}' }),
      (command) => { picked = command; return { ok: true }; },
      () => changedPaths,
    );
    const hookLog = path.join(s.dir, 'hook-log');
    assertSpawnDecided(spawnSync('bash', ['-c', picked], { cwd: s.tree, env: { ...process.env, F2P_LOG: hookLog }, timeout: 20000 }), 'green-gate pick');
    assert.deepEqual(
      [s.ran().slice(0, changedPaths.length), fs.readFileSync(hookLog, 'utf8').split('\n').filter(Boolean)],
      [changedPaths, changedPaths],
      'the verb and green-gate hand the focused command the same words: one per changed path',
    );

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

    // What the checkout that ran the verb holds: its HEAD, branches, worktrees, index, and working tree.
    const checkout = (cwd) => [
      git(cwd, ['rev-parse', 'HEAD']),
      git(cwd, ['for-each-ref']),
      git(cwd, ['worktree', 'list', '--porcelain']).replace(/^worktree .*\/fail-to-pass-.*$/gm, 'LEFTOVER'),
      git(cwd, ['status', '--porcelain=v1', '-uall']),
      git(cwd, ['diff', '--cached', '--name-only']),
    ];
    const leftover = (sc) => fs.readdirSync(sc.root).filter((e) => e.startsWith('fail-to-pass-'));
    // A refusal: exit 1 with the message on stderr, no trace line, no worktree, nothing run, the checkout as it was.
    const refuses = (sc, range, message) => {
      const before = [checkout(sc.repo), checkout(sc.tree)];
      const out = sc.run(range);
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

    // A repository with no configured test command runs nothing and writes nothing.
    const noCommand = scenario({ base: { 'src.txt': 'a\n' }, tip: { 'src.txt': 'b\n', 'tests/t.sh': probe } });
    r = noCommand.run(noCommand.range);
    assert.equal(r.status, 2, 'no outcome line is written, so the verb does not exit 0: ' + r.stdout);
    assert.match(r.stderr, /no test command is configured/);
    assert.deepEqual(noCommand.ran(), [], 'nothing runs');
    assert.deepEqual(noCommand.trace(), [], 'nothing is written');
    assert.deepEqual(leftover(noCommand), [], 'and no worktree stays');

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
    assert.deepEqual(s.ran(), ['docs|src.txt|tests|'], 'only the control ran');
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} unknown control=3`], 'and its line is written');
    assert.deepEqual(leftover(s), []);
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'unknown control=3');
    assert.doesNotMatch(r.stderr, /observation/, 'a second `unknown` in the same scope run says nothing');
    assert.equal(s.trace().length, 2, 'and both lines are written');

    // Polls until no process named in the pid files is alive (a file holds one pid per line), and fails on the last poll.
    const assertGone = (message, ...files) => {
      assert.ok(files.every((f) => fs.existsSync(f)), `${message}: the run started its processes`);
      const gone = spawnSync('bash', ['-c', 'for i in $(seq 100); do alive=; for f in "$@"; do kill -0 $(cat "$f") 2>/dev/null && alive=1; done; [ -z "$alive" ] && { echo gone; exit 0; }; sleep 0.1; done; echo alive', 'bash', ...files], { encoding: 'utf8', timeout: 30000 });
      assertSpawnDecided(gone, 'the liveness poll');
      assert.equal(gone.stdout.trim(), 'gone', message);
    };
    // The command starts `sleep 300` in the background and records its pid in `$F2P_DIR/child`. The sleep's output goes to
    // /dev/null, so a survivor never holds the verb's stderr pipe open and the failure shows at the liveness poll.
    const background = 'sleep 300 >/dev/null 2>&1 & echo $! >> "$F2P_DIR/child"';

    // A control ended by a signal carries no exit status: it records `unknown` naming the signal. The process group it ran in
    // dies with it, a background process included.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(`${background}; kill -KILL $$`) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    r = s.run(s.range);
    assert.equal(r.status, 0, 'an `unknown` is an outcome that was read and printed, a signal-ended control included: ' + r.stderr);
    assert.equal(r.stdout.trim(), 'unknown control=SIGKILL', r.stderr);
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} unknown control=SIGKILL`]);
    assert.deepEqual(leftover(s), [], 'and no worktree stays');
    assertGone('a signal-ended control leaves no process of its group running', path.join(s.dir, 'child'));

    // A run ended by a signal has no exit status: no verdict (INV-0009), so it records `unknown` naming the signal and the
    // bound it ran under. Its whole process group dies with it, a background process included.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(`grep -q b src.txt || { ${background}; kill -KILL $$; }`) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    r = s.run(s.range);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim(), /^unknown control=0,put-back=SIGKILL,bound=\d+ms$/);
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} ${r.stdout.trim()}`]);
    assert.deepEqual(leftover(s), []);
    assertGone('a signal-ended run before the change leaves no process of its group running', path.join(s.dir, 'child'));

    // A run that exits on its own and leaves a background process behind leaves none running once the run is over, so
    // nothing writes into a worktree the verb removes, or into the files the second run puts back.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(background) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'pass-to-pass control=0,put-back=0', r.stderr);
    assertGone('both runs leave no background process running', path.join(s.dir, 'child'));

    // The run with the files put back is bounded at ten times the duration the control took in the same invocation. The
    // control sleeps $F2P_SLEEP seconds, so it took at least that long, and the bound is read back from the outcome's reason:
    // every assertion compares it with what that invocation itself ran, never with a fixed ceiling (root AGENTS.md, ADR 0086).
    // The run with the files put back hangs, and its whole process group dies at the bound, the shell and the `sleep` it started.
    // Each run writes the millisecond time it started into the file it creates, so the stamps' contents give the gap between
    // the two starts at a resolution no filesystem's mtime limits.
    const stamp = 'node -e \'require("fs").writeFileSync(process.argv[1], String(Date.now()))\' ';
    const hangs = [
      `if grep -q b src.txt; then ${stamp}"$F2P_DIR/control-start"; sleep "$F2P_SLEEP"; exit 0; fi`,
      `${stamp}"$F2P_DIR/put-back-start"`,
      'if [ -n "$F2P_SLOW" ]; then sleep "$F2P_SLOW"; exit 1; fi',
      'echo $$ > "$F2P_DIR/pid"; sleep 300 & echo $! > "$F2P_DIR/child"; wait',
    ].join('\n') + '\n';
    const bounded = (sleepSeconds, env = {}) => {
      const b = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': hangs },
      });
      const startedAt = Date.now();
      // A floor of 1 ms lets the factor alone set the bound, so a hanging run is killed without waiting the 10 000 ms floor.
      const out = b.run(b.range, { env: { F2P_SLEEP: String(sleepSeconds), SUPERDEV_FAIL_TO_PASS_FLOOR_MS: '1', ...env } });
      return { b, out, elapsedMs: Date.now() - startedAt };
    };
    const shortRun = bounded(0.05);
    const longRun = bounded(0.4);
    const [shortBound, longBound] = [[shortRun, 0.05], [longRun, 0.4]].map(([run, seconds]) => {
      assert.equal(run.out.status, 0, run.out.stderr);
      const m = /^unknown control=0,put-back=SIGKILL,bound=(\d+)ms$/.exec(run.out.stdout.trim());
      assert.ok(m, 'a run killed at its bound records `unknown` naming the signal and the bound: ' + run.out.stdout);
      assert.ok(Number(m[1]) >= 10 * seconds * 1000, `the bound is at least ten times the control's ${seconds}s sleep: ${m[1]}ms`);
      assert.deepEqual(run.b.trace(), [`01 main fail-to-pass ${run.b.range} ${run.out.stdout.trim()}`], 'and the line is written');
      assert.deepEqual(leftover(run.b), []);
      assertGone('no process the run with the files put back started keeps running', path.join(run.b.dir, 'pid'), path.join(run.b.dir, 'child'));
      return Number(m[1]);
    });
    assert.ok(longBound > shortBound, `the bound follows the control's own duration: ${shortBound}ms after a 0.05s control, ${longBound}ms after a 0.4s one`);
    // The kill lands at the reported bound. The control took a tenth of the bound, and a kill armed several bounds late would
    // let the whole verb run for far more than that plus three bounds. The ceiling comes from the bound the same run reported;
    // the longer run alone carries it, because the verb's own git steps weigh most against the short run's small bound.
    assert.ok(longRun.elapsedMs <= longBound / 10 + 3 * longBound, `the verb ran ${longRun.elapsedMs}ms against a reported bound of ${longBound}ms: the second run is killed at its bound`);
    // The factor stays near ten: this catches a factor far above it, such as twenty, and passes one up to about fifteen. The
    // gap between the two starts is the control's duration plus the verb's own put-back step, so ten times it is the bound's
    // ceiling. The slack is five of the control's own 0.4s sleeps (2000ms), which covers a start that lands late under
    // scheduling pressure. Both stamps and the slack come from that one invocation, so a descheduled process only loosens it.
    const startGapMs = Number(fs.readFileSync(path.join(longRun.b.dir, 'put-back-start'), 'utf8')) - Number(fs.readFileSync(path.join(longRun.b.dir, 'control-start'), 'utf8'));
    assert.ok(longBound <= 10 * startGapMs + 5 * 0.4 * 1000, `the bound stays near ten times the control's duration: ${longBound}ms against a ${startGapMs}ms gap between the two starts`);
    // A run that takes three times the control's duration ends inside its bound and reads a verdict.
    const slow = bounded(0.2, { F2P_SLOW: '0.6' });
    assert.equal(slow.out.stdout.trim(), 'fail-to-pass control=0,put-back=1', slow.out.stderr);

    // The bound has a floor (ADR 0142, #1059). A control that finishes in milliseconds would give a bound shorter than the
    // delays a loaded machine adds, so a run before the change that ends on its own after more than ten times the control,
    // but well under the floor, still reads a verdict. The control here is a shell builtin or two, so ten times it stays
    // far below the second run's one-second sleep. A floor override that is empty, not a number, zero, negative, or above
    // 2147483647 (the longest delay Node's timer holds; a longer one fires at once) reads as no override. A set value it
    // rejects says so once on stderr; an unset or empty one says nothing. One case per class: `5s` is the non-numeric one,
    // because a leading-digit parse would read it as 5 ms and lose the verdict.
    const floored = (env) => {
      const f = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': 'grep -q b src.txt && exit 0\nsleep 1; exit 1\n' },
      });
      return f.run(f.range, { env });
    };
    const floorNote = /SUPERDEV_FAIL_TO_PASS_FLOOR_MS/g;
    for (const [value, notes] of [[undefined, 0], ['', 0], ['5s', 1], ['0', 1], ['-5', 1], ['2147483648', 1]]) {
      const out = floored(value === undefined ? {} : { SUPERDEV_FAIL_TO_PASS_FLOOR_MS: value });
      assert.equal(out.stdout.trim(), 'fail-to-pass control=0,put-back=1', `a fast control keeps its verdict at the default floor (${JSON.stringify(value)}): ${out.stderr}`);
      assert.equal((out.stderr.match(floorNote) || []).length, notes, `a rejected override is named once on stderr, an unset or empty one never (${JSON.stringify(value)}): ${out.stderr}`);
      if (notes) assert.match(out.stderr, /SUPERDEV_FAIL_TO_PASS_FLOOR_MS=.*10000 ms/, 'the note names the value fallen back to');
    }
    // An override sets the floor: a hanging run after a fast control is killed at the floor it names, never earlier.
    const atFloor = bounded(0.01, { SUPERDEV_FAIL_TO_PASS_FLOOR_MS: '1500' });
    const floorBound = /^unknown control=0,put-back=SIGKILL,bound=(\d+)ms$/.exec(atFloor.out.stdout.trim());
    assert.ok(floorBound, 'a run killed at the floor records `unknown` naming the bound: ' + atFloor.out.stdout);
    assert.ok(Number(floorBound[1]) >= 1500, `the bound is at least the floor: ${floorBound[1]}ms`);
    assert.doesNotMatch(atFloor.out.stderr, floorNote, 'a valid override says nothing on stderr');
    assertGone('no process the run killed at the floor started keeps running', path.join(atFloor.b.dir, 'pid'), path.join(atFloor.b.dir, 'child'));

    // A real run's trace holds lines already: its ledger lines and an earlier outcome that read a verdict, which is no
    // `unknown`, so the first `unknown` after them still says so.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'exit 3\n' },
    });
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

    // The line names the slice the verb runs for: the slice a slicetree holds, the one in-progress slice a scopetree has,
    // and `scope` where none or several are in progress.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    git(s.repo, ['worktree', 'add', '-q', '-b', 'slice/07', path.join(s.root, 'slicetrees', '07'), s.tipSha]);
    s.run(s.range, { cwd: path.join(s.root, 'slicetrees', '07') });
    assert.deepEqual(s.trace(), [`07 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1`], 'a slicetree names its slice');
    const slice = spawnSync(process.execPath, [scopePath, 'slice', '01', 'merged', '--root', s.root], { cwd: s.repo, encoding: 'utf8' });
    assert.equal(slice.status, 0, slice.stderr);
    fs.rmSync(path.join(s.root, 'trace.log'));
    s.run(s.range);
    assert.deepEqual(s.trace(), [`scope main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1`], 'a scopetree with no slice in progress names `scope`');
    // The slice whose ledger row records exactly this range owns the line, from any directory, whatever form the row's commits
    // take: a run from the scopetree after the merge, with no slice in progress, still names it.
    const short = `${s.baseSha.slice(0, 8)}..${s.tipSha.slice(0, 8)}`;
    const recorded = spawnSync(process.execPath, [scopePath, 'slice', '01', 'merged', '--range', short, '--root', s.root], { cwd: s.repo, encoding: 'utf8' });
    assert.equal(recorded.status, 0, 'a range is recorded on a row that is merged already: ' + recorded.stderr);
    fs.rmSync(path.join(s.root, 'trace.log'));
    s.run(s.range);
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1`], 'the scopetree line names the slice that recorded the range');
    fs.rmSync(path.join(s.root, 'trace.log'));
    s.run(s.range, { cwd: path.join(s.root, 'slicetrees', '07') });
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1`], 'and so does a line from another slicetree');

    // A fix cycle's range, and the range from a slice's base to a tip a fix cycle moved on, match no ledger row, so the line names
    // `scope` from a scopetree with no slice in progress. `/superdev:review`'s fix loop and run handoff's fix loop run the verb
    // there for the cycle itself and for the run that closes a Pass-to-pass finding (ADR 0134).
    fs.writeFileSync(path.join(s.tree, 'src.txt'), 'c\n');
    fs.writeFileSync(path.join(s.tree, 'tests', 't.sh'), probe + 'grep -q c src.txt\n');
    git(s.tree, ['add', '-A']);
    git(s.tree, ['commit', '-q', '-m', 'fix']);
    const fixSha = git(s.tree, ['rev-parse', 'HEAD']);
    for (const [label, range] of [['a fix cycle', `${s.tipSha}..${fixSha}`], ["a merged slice's base to the tip a fix cycle moved on", `${s.baseSha}..${fixSha}`]]) {
      fs.rmSync(path.join(s.root, 'trace.log'));
      r = s.run(range);
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `${label}: ${r.stderr}`);
      assert.deepEqual(s.trace(), [`scope main fail-to-pass ${range} fail-to-pass control=0,put-back=1`], `${label} names \`scope\``);
    }

    // The command: the focused one over the range's whole changed-path set where it carries `{paths}`, the full one
    // otherwise. Both runs use the same command string.
    const argsProbe = 'printf "%s|" "$@" >> "$F2P_LOG"; echo >> "$F2P_LOG"\n';
    const picks = (full, focused) => scenario({
      base: { 'src.txt': 'a\n', 'old.txt': 'o\n', 'docs/agents/verification.md': verif(full, focused) },
      tip: { 'src.txt': 'b\n', 'old.txt': null, 'my file.txt': 'x\n', 'tests/t.sh': argsProbe + 'grep -q b src.txt\n' },
    });
    s = picks('sh tests/t.sh full', 'sh tests/t.sh focused {paths}');
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.deepEqual(s.ran(), Array(2).fill('focused|my file.txt|old.txt|src.txt|tests/t.sh|'), 'the focused command gets every changed path, quoted, on both runs');
    for (const [label, focused] of [
      ['a fixed-subset focused command', 'sh tests/t.sh subset'],
      ['a self-detecting focused command', 'sh tests/t.sh --changed'],
    ]) {
      s = picks('sh tests/t.sh full', focused);
      s.run(s.range);
      assert.deepEqual(s.ran(), Array(2).fill('full|'), `${label} runs the full command, twice`);
    }
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif('sh tests/t.sh full') },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': argsProbe + 'grep -q b src.txt\n' },
    });
    s.run(s.range);
    assert.deepEqual(s.ran(), Array(2).fill('full|'), 'a repository with the full command alone runs it, twice');

    // The command and the test paths come from the tip, even where the range changed the verification file itself.
    s = scenario({
      base: { 'src.txt': 'a\n', 'spec-files/x': 'one\n', 'docs/agents/verification.md': verif('sh tests/t.sh base') },
      tip: {
        'src.txt': 'b\n',
        'spec-files/x': 'two\n',
        'docs/agents/verification.md': verif('sh tests/t.sh tip', null, '\n## Test paths\n\n- `spec-files/`\n- `tests/`\n'),
        'tests/t.sh': argsProbe + 'cat spec-files/x >> "$F2P_LOG"\ngrep -q b src.txt\n',
      },
    });
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.deepEqual(s.ran(), ['tip|', 'two', 'tip|', 'two'], 'the tip\'s command runs twice, and a file the tip\'s test paths name stays as it is');

    // The configuration is read from the tree root, whatever directory the verb runs from: a subdirectory of the scopetree
    // finds the tip's command and its `## Test paths`, where a cwd-relative read finds neither and nothing runs.
    s = scenario({
      base: { 'src.txt': 'a\n', 'spec-files/x': 'one\n', 'docs/agents/verification.md': verif('sh tests/t.sh tip', null, '\n## Test paths\n\n- `spec-files/`\n- `tests/`\n') },
      tip: { 'src.txt': 'b\n', 'spec-files/x': 'two\n', 'tests/t.sh': argsProbe + 'cat spec-files/x >> "$F2P_LOG"\ngrep -q b src.txt\n' },
    });
    for (const sub of ['docs', 'docs/agents']) {
      fs.rmSync(s.log, { force: true });
      r = s.run(s.range, { cwd: path.join(s.tree, sub) });
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `a run from ${sub} reads the configured command: ${r.stderr}`);
      assert.deepEqual(s.ran(), ['tip|', 'two', 'tip|', 'two'], `a run from ${sub} reads the configured test paths`);
    }
    // The changed-path listing is the range's whole change set as well, where the operator's git config limits `git diff` to
    // the cwd (`diff.relative`).
    git(s.repo, ['config', 'diff.relative', 'true']);
    r = s.run(s.range, { cwd: path.join(s.tree, 'docs') });
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `a \`diff.relative\` config does not narrow the changed paths: ${r.stderr}`);

    // No git hook runs. The control proves the fixture's hooks are live: a plain `git worktree add` fires them.
    const hooked = (sc) => {
      const sentinel = path.join(path.dirname(sc.repo), 'hook-fired');
      for (const hook of ['post-checkout', 'reference-transaction', 'post-index-change']) {
        fs.writeFileSync(path.join(sc.repo, '.git', 'hooks', hook), `#!/bin/sh\necho ${hook} >> "${sentinel}"\n`, { mode: 0o755 });
      }
      const probeDir = path.join(path.dirname(sc.repo), 'hook-probe');
      git(sc.repo, ['worktree', 'add', '-q', '--detach', probeDir, sc.tipSha]);
      assert.ok(fs.existsSync(sentinel), 'a plain git worktree add fires the fixture hooks');
      git(sc.repo, ['worktree', 'remove', '--force', probeDir]);
      fs.rmSync(sentinel);
      return sentinel;
    };
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    let before = [checkout(s.repo), checkout(s.tree)];
    const sentinel = hooked(s);
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.ok(!fs.existsSync(sentinel), 'creating, restoring in, and removing the worktree ran no hook: ' + (fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8') : ''));
    assert.deepEqual(leftover(s), [], 'an outcome leaves no worktree directory');
    assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, 'and the checkout keeps its HEAD, branches, index, working tree, and worktrees');

    // An error after the worktree exists (the put-back fails) removes it too, and the checkout keeps its state.
    const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    const shim = path.join(D, 'bin');
    fs.mkdirSync(shim, { recursive: true });
    fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = restore ] && { echo 'shim: restore refused' >&2; exit 1; }; done\nexec ${realGit} "$@"\n`, { mode: 0o755 });
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    before = [checkout(s.repo), checkout(s.tree)];
    r = s.run(s.range, { env: { PATH: shim + path.delimiter + process.env.PATH } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /could not put the files back/);
    assert.deepEqual(s.ran(), ['docs|src.txt|tests|'], 'the control ran and the second run did not');
    assert.deepEqual(s.trace(), [], 'an error writes no outcome line');
    assert.deepEqual(leftover(s), [], 'an error leaves no worktree directory');
    assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, 'and the checkout as it was');

    // An interrupt, a kill included, ends the command's process group and removes the worktree; a started control that
    // is still running leaves its marker, and the driver signals the verb once it exists.
    const driver = path.join(D, 'driver.js');
    fs.writeFileSync(driver, `
      const { spawn } = require('node:child_process');
      const fs = require('node:fs');
      const cfg = JSON.parse(process.argv[2]);
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const until = async (done) => { for (let i = 0; i < 600 && !done(); i++) await wait(50); if (!done()) throw new Error('timed out waiting'); };
      const left = () => fs.readdirSync(cfg.root).filter((e) => e.startsWith('fail-to-pass-'));
      const start = (env) => {
        const child = spawn(process.execPath, [cfg.scope, 'fail-to-pass', cfg.range], { cwd: cfg.cwd, env: { ...process.env, ...cfg.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
        const out = { stdout: '', stderr: '' };
        child.stdout.on('data', (d) => (out.stdout += d));
        child.stderr.on('data', (d) => (out.stderr += d));
        out.exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
        out.child = child;
        return out;
      };
      (async () => {
        if (cfg.mode === 'signal') {
          const run = start({});
          await until(() => fs.existsSync(cfg.marker));
          run.child.kill(cfg.signal);
          const ended = await run.exited;
          const leftAtExit = left();
          await until(() => left().length === 0);
          const pid = Number(fs.readFileSync(cfg.pidfile, 'utf8'));
          await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } }).catch((e) => {
            try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
            throw e;
          });
          console.log(JSON.stringify({ ...ended, leftAtExit }));
        } else {
          const runs = [start({}), start({})];
          const ended = await Promise.all(runs.map((run) => run.exited));
          console.log(JSON.stringify(ended.map((e, i) => ({ ...e, stdout: runs[i].stdout, stderr: runs[i].stderr }))));
        }
      })().catch((e) => { console.error(e.stack); process.exit(1); });
    `);
    const drive = (cfg) => {
      const d = spawnSync(process.execPath, [driver, JSON.stringify({ scope: scopePath, ...cfg })], { encoding: 'utf8', timeout: 120000 });
      assertSpawnDecided(d, 'the interrupt driver');
      assert.equal(d.status, 0, d.stderr);
      return JSON.parse(d.stdout);
    };
    // A runner that traps SIGTERM and keeps going ends with its group too: nothing it started outlives the verb.
    const hang = 'echo $$ > "$F2P_PID"; touch "$F2P_MARK"; exec sleep 60';
    const stubborn = 'trap "" TERM; echo $$ > "$F2P_PID"; touch "$F2P_MARK"; while :; do sleep 0.2; done';
    for (const [signal, exitStatus, command, label = signal] of [
      ['SIGINT', 130, hang], ['SIGTERM', 143, hang], ['SIGHUP', 129, hang], ['SIGKILL', null, hang], ['SIGTERM', 143, stubborn, 'SIGTERM on a runner that traps it'],
    ]) {
      s = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(command) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
      });
      // The snapshot comes first: `git status` itself fires the fixture's post-index-change hook.
      before = [checkout(s.repo), checkout(s.tree)];
      const sentinelHere = hooked(s);
      const ended = drive({
        mode: 'signal', signal, cwd: s.tree, range: s.range, root: s.root,
        marker: path.join(path.dirname(s.repo), 'marker'), pidfile: path.join(path.dirname(s.repo), 'pid'),
        env: { F2P_MARK: path.join(path.dirname(s.repo), 'marker'), F2P_PID: path.join(path.dirname(s.repo), 'pid') },
      });
      assert.equal(ended.signal, signal === 'SIGKILL' ? 'SIGKILL' : null, `${label}:how the verb ended`);
      if (exitStatus) assert.equal(ended.code, exitStatus, `${label}:the verb exits 128 plus the signal`);
      if (signal !== 'SIGKILL') assert.deepEqual(ended.leftAtExit, [], `${label}:the worktree is gone when the verb exits`);
      assert.deepEqual(s.trace(), [], `${label}:an interrupted run writes no outcome line`);
      assert.deepEqual(leftover(s), [], `${label}:no worktree directory stays`);
      assert.ok(!fs.existsSync(sentinelHere), `${label}:no hook ran: ` + (fs.existsSync(sentinelHere) ? fs.readFileSync(sentinelHere, 'utf8') : ''));
      assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, `${label}:the checkout keeps its state, and no worktree stays registered`);
    }

    // Two runs at the same time in one run root do not collide: each runs in a worktree of its own, and the checkout keeps
    // its HEAD, branches, index, working tree, and worktrees.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': 'mkdir -p "$F2P_BARRIER"; touch "$F2P_BARRIER/$$"; for i in $(seq 200); do [ "$(ls "$F2P_BARRIER" | wc -l)" -ge 2 ] && break; sleep 0.1; done\npwd >> "$F2P_LOG"\ngrep -q b src.txt\n' },
    });
    before = [checkout(s.repo), checkout(s.tree)];
    const both = drive({ mode: 'parallel', cwd: s.tree, range: s.range, root: s.root, env: { F2P_LOG: s.log, F2P_BARRIER: path.join(path.dirname(s.repo), 'barrier') } });
    assert.deepEqual(both.map((e) => e.code), [0, 0], 'both runs end with an outcome: ' + JSON.stringify(both));
    assert.deepEqual(both.map((e) => e.stdout.trim()), Array(2).fill('fail-to-pass control=0,put-back=1'));
    assert.equal(s.trace().length, 2, 'each run writes its own line');
    assert.equal(new Set(s.ran()).size, 2, 'in two different worktrees');
    assert.deepEqual(leftover(s), []);
    assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, 'and the checkout keeps its state through both runs');

    // Run from the repository's main checkout, outside every run tree, the verb runs and records nothing.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    r = s.run(s.range, { cwd: s.repo });
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.deepEqual(s.trace(), [], 'no run root, no trace line');
    assert.deepEqual(fs.readdirSync(path.join(s.repo, '.superdev')), ['scopes'], 'and no worktree directory stays');

    // Outside a run root, in a repository that has no `.superdev/` yet and does not ignore it, the verb ignores it through the
    // repository's `info/exclude`, so the checkout's working tree stays byte for byte as it was, and removes the empty
    // directory it created.
    s = scenario({
      bare: true,
      base: { '.gitignore': 'node_modules/\n', 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    const ignoreFile = fs.readFileSync(path.join(s.repo, '.gitignore'), 'utf8');
    r = s.run(s.range, { cwd: s.repo });
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.ok(!fs.existsSync(path.join(s.repo, '.superdev')), 'the `.superdev/` directory the verb created is removed');
    assert.equal(fs.readFileSync(path.join(s.repo, '.gitignore'), 'utf8'), ignoreFile, 'the checkout\'s `.gitignore` is as it was');
    assert.equal(git(s.repo, ['status', '--porcelain=v1', '-uall']), '', 'and its working tree is clean');
    assert.match(git(s.repo, ['check-ignore', '-v', '.superdev/x']), /info\/exclude:\d+:\.superdev\/\s+\.superdev\/x$/, '`.superdev/` is ignored through `info/exclude`');

    // The run against the changed code resolves dependencies as the scope's own worktrees do: through the main checkout.
    s = scenario({
      base: { '.gitignore': '.superdev/\nnode_modules/\n', 'src.txt': 'a\n', 'docs/agents/verification.md': verif('node tests/check.js', 'node tests/check.js') },
      tip: { 'src.txt': 'b\n', 'tests/check.js': "require('dep'); process.exit(require('fs').readFileSync('src.txt', 'utf8').includes('b') ? 0 : 1);\n" },
    });
    fs.mkdirSync(path.join(s.repo, 'node_modules', 'dep'), { recursive: true });
    fs.writeFileSync(path.join(s.repo, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', 'a module installed in the main checkout resolves from the worktree: ' + r.stderr);

    // An outcome line is no test run: it is no `run` line, never backs a suite record, and `suite reusable` answers as before.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    });
    const cli = (sc, argv) => {
      const out = spawnSync(process.execPath, [scopePath, ...argv, '--root', sc.root], { cwd: sc.repo, encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(out, 'scope.js ' + argv.join(' '));
      return out;
    };
    assert.equal(cli(s, ['suite', 'set', 'green', s.tipSha]).status, 0);
    const unbacked = cli(s, ['suite', 'reusable', '--branch', 'feat/demo']);
    assert.equal(unbacked.status, 1, 'a suite record no run line backs is not reusable: ' + unbacked.stdout);
    assert.equal(s.run(s.range).status, 0);
    const afterOutcome = cli(s, ['suite', 'reusable', '--branch', 'feat/demo']);
    assert.deepEqual([afterOutcome.status, afterOutcome.stderr], [unbacked.status, unbacked.stderr], 'the outcome line backs nothing');
    appendTrace(s.root, { slice: '01', kind: 'run', fields: ['full', 'pass', s.tipSha, 'clean', '-'] });
    const backed = cli(s, ['suite', 'reusable', '--branch', 'feat/demo']);
    assert.equal(backed.status, 0, 'a passing full run at the tip backs the record: ' + backed.stderr);
    assert.equal(s.run(s.range).status, 0);
    assert.deepEqual(cli(s, ['suite', 'reusable', '--branch', 'feat/demo']).stdout, backed.stdout, 'a second outcome line leaves the answer as it was');
    assert.equal(s.trace().filter((l) => l.split(' ')[2] === 'run').length, 1, 'no outcome line is a run line');
    // `trace` prints the outcome line like any other, which is what `/superdev:status --trace` shows.
    const timeline = cli(s, ['trace']).stdout.split('\n');
    assert.ok(timeline.some((l) => new RegExp(` 01 main fail-to-pass ${s.range} fail-to-pass control=0,put-back=1$`).test(l)), 'trace prints the outcome line');
    assert.ok(cli(s, ['trace', '--slice', '01']).stdout.includes(' fail-to-pass '), 'and the slice filter keeps it');

    // A test command that cannot start (here one past the argument size limit, E2BIG) records `unknown` naming the start
    // failure, in one line with no stack trace, and leaves no worktree. Inside a run root the line reaches the trace;
    // outside one nothing is written.
    // A 600 KB command passes one argument past Linux's per-argument limit; six 100 KB variables bring the total past
    // macOS's whole-exec limit too, while every git child, which carries no such argument, still starts.
    const HUGE = `: ${'x'.repeat(600 * 1024)}; ${CMD}`;
    const padding = Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`F2P_PAD_${i}`, 'p'.repeat(100 * 1024)]));
    for (const bare of [false, true]) {
      s = scenario({
        bare,
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(HUGE) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
      });
      r = s.run(s.range, bare ? { cwd: s.repo, env: padding } : { env: padding });
      const where = bare ? 'outside a run root' : 'inside a run root';
      assert.equal(r.status, 0, `${where}: a start failure is an unknown outcome: ` + r.stderr.slice(0, 2000));
      assert.match(r.stdout.trim(), /^unknown control=\S*E2BIG\S*$/, `${where}: one unknown line naming the start failure`);
      assert.doesNotMatch(r.stderr, /\n\s+at /, `${where}: no stack trace`);
      const home = bare ? path.join(s.repo, '.superdev') : s.root;
      assert.deepEqual(fs.existsSync(home) ? fs.readdirSync(home).filter((f) => f.startsWith('fail-to-pass-')) : [], [], `${where}: no worktree left`);
      if (bare) assert.ok(!fs.existsSync(home), 'outside a run root nothing is written');
      else assert.deepEqual(s.trace().map((l) => l.split(' ').slice(2, 5).join(' ')), [`fail-to-pass ${s.range} unknown`], 'the trace line reads unknown');
    }

    // A second run that cannot start records `unknown` naming the put-back's start failure, in one line with no stack
    // trace, and leaves no worktree. The verb starts each run as `bash -c <command>`, so a missing script only exits 127;
    // what fails the start is the shell itself going missing. PATH holds one directory of links to the tools the verb
    // and the command use, and the control run deletes the `bash` link, so the second spawn finds no shell (ENOENT).
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif('rm -f "$F2P_DIR/bin/bash"') },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
    });
    const bin = path.join(s.dir, 'bin');
    fs.mkdirSync(bin);
    for (const tool of ['bash', 'git', 'rm']) {
      const real = process.env.PATH.split(path.delimiter).map((d) => path.join(d, tool)).find((p) => fs.existsSync(p));
      fs.symlinkSync(real, path.join(bin, tool));
    }
    r = s.run(s.range, { env: { PATH: bin } });
    assert.equal(r.status, 0, 'a put-back start failure is an unknown outcome: ' + r.stderr.slice(0, 2000));
    assert.equal(r.stdout.trim(), 'unknown control=0,put-back=start-failed:ENOENT', 'one unknown line naming the put-back start failure');
    assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
    assert.deepEqual(fs.readdirSync(s.root).filter((f) => f.startsWith('fail-to-pass-')), [], 'no worktree left');
    assert.deepEqual(s.trace().map((l) => l.split(' ').slice(2, 5).join(' ')), [`fail-to-pass ${s.range} unknown`], 'the trace line reads unknown');
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}
