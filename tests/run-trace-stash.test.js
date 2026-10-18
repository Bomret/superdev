'use strict';

// Suite for the starting-directory stash of the run trace (ADR 0159, INV-0160): a Bash call resolves from the directory it started in.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { testRuns } = require('../plugin/lib/test-runs.js');
const { tmp, ledger, A, trace, run, spawnOut, edit, hookPath, cleanup } = require('./run-trace-setup');

// A Bash call resolves from the directory it started in (ADR 0159). A PostToolUse `cwd` is the directory the command
// ended in, so the PreToolUse input's `cwd` is stashed by `tool_use_id` and read back once.
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-start-'));
  const savedTmp = process.env.TMPDIR;
  process.env.TMPDIR = path.join(home, 'tmp');
  fs.mkdirSync(process.env.TMPDIR);
  // The stash directory is per user, so a second account on a shared /tmp stashes in its own (no uid on Windows).
  const stashDir = path.join(os.tmpdir(), process.getuid ? `superdev-run-trace-${process.getuid()}` : 'superdev-run-trace');
  const C = path.join(home, '.superdev', 'scopes', 'c');
  const T = path.join(C, 'scopetree');
  for (const d of ['tests', 'sub', path.join('docs', 'agents')]) fs.mkdirSync(path.join(T, d), { recursive: true });
  fs.writeFileSync(path.join(C, 'ledger.md'), ledger([['01', 'in-progress']]));
  fs.writeFileSync(path.join(T, 'tests', 'a.test.js'), '');
  fs.writeFileSync(path.join(T, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  const lines = () => trace(C).map((l) => (l[2] === 'run' ? `run ${l[3]} ${l[4]} ${l[7]}` : l.slice(2).join(' ')));
  const clear = () => fs.rmSync(path.join(C, 'trace.log'), { force: true });
  let n = 0;
  const pre = (command, start, tu) => run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: tu, tool_input: { command }, cwd: start });
  const post = (command, end, tu, event) => run({ hook_event_name: event || 'PostToolUse', tool_name: 'Bash', tool_use_id: tu, tool_input: { command }, cwd: end });
  const call = (command, start, end, event) => { const tu = `tu${++n}`; pre(command, start, tu); post(command, end, tu, event); return tu; };
  const tests = path.join(T, 'tests');

  // hooks.json registers run-trace.js for PreToolUse on Bash, beside the guardrails.
  const registered = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.ok(registered.PreToolUse.some((g) => g.matcher === 'Bash' && g.hooks.some((h) => h.command.includes('hooks/run-trace.js'))), 'PreToolUse on Bash runs run-trace.js');

  // A literal relative `cd` resolves once, under PostToolUse and PostToolUseFailure.
  clear();
  call('cd tests && node a.test.js', T, tests);
  call('cd tests && node a.test.js', T, tests, 'PostToolUseFailure');
  assert.deepEqual(lines(), ['run path pass tests/a.test.js', 'run path fail tests/a.test.js'], 'a cd from the tree root resolves once');
  // A redirect write after a relative `cd` (triage #978).
  clear();
  call('cd sub && echo x > f.txt', T, path.join(T, 'sub'));
  assert.deepEqual(lines(), ['edit impl sub/f.txt'], 'a redirect after a cd records under the path it wrote');
  // A `cd` in the middle of a command.
  clear();
  call('git status && cd tests && node a.test.js', T, tests);
  assert.deepEqual(lines().map((l) => l.split(' ').pop()), ['tests/a.test.js'], 'a mid-command cd resolves once');
  // A restore after a relative `cd`.
  clear();
  call('cd sub && git restore -- f.txt', T, path.join(T, 'sub'));
  assert.deepEqual(lines(), ['restore sub/f.txt'], 'a restore after a cd names the path it reached');
  // A `scope.js test` call after a relative `cd` is the verb's own run: the hook records none for it.
  clear();
  call('cd tests && node scripts/scope.js test -- node a.test.js', T, tests);
  assert.deepEqual(lines(), [], 'a scope.js test call after a cd records no hook run');

  // A `cd` the hook cannot read resolves the segments after it against the directory the command ended in.
  clear();
  for (const c of ['cd "$D" && node tests/a.test.js', 'cd ~ && node tests/a.test.js', 'cd - && node tests/a.test.js', 'cd && node tests/a.test.js']) call(c, home, T);
  assert.deepEqual(lines().map((l) => l.split(' ').pop()), ['tests/a.test.js', 'tests/a.test.js', 'tests/a.test.js', 'tests/a.test.js'], 'an unreadable cd falls back to the end directory');
  // A relative `cd` after an unreadable one also stays at the end directory: the end already holds its move.
  clear();
  call('cd "$D" && cd tests && node a.test.js', home, tests);
  call('cd ~ && cd sub && echo x > f.txt', home, path.join(T, 'sub'));
  call('cd "$D" && cd sub && git restore -- f.txt', home, path.join(T, 'sub'));
  call('cd "$D" && cd tests && node scripts/scope.js test -- node a.test.js', home, tests);
  assert.deepEqual(lines(), ['run path pass tests/a.test.js', 'edit impl sub/f.txt', 'restore sub/f.txt'], 'a relative cd after an unreadable cd doubles no prefix');
  // An unreadable `cd` in a nested instance or an uncalled function body leaves the outer shell's relative `cd` where it moved.
  clear();
  call('(cd ~ && ls) ; cd sub && echo x > f.txt ; cd ..', T, T);
  call('cd "$D" && (cd sub && echo x > f.txt)', home, T);
  call('echo $(cd ~) ; cd sub && echo x > f.txt ; cd ..', T, T);
  call('f() { cd ~; } ; cd sub && echo x > f.txt ; cd ..', T, T);
  assert.deepEqual(lines(), ['edit impl sub/f.txt', 'edit impl sub/f.txt', 'edit impl sub/f.txt', 'edit impl sub/f.txt'], 'a nested or function-body unreadable cd keeps the outer relative cd');
  // A called function's `cd` moves the outer shell: the call resolves as an unreadable `cd` does.
  clear();
  call('f() { cd tests; } ; f ; node a.test.js', T, tests);
  call('f() { cd ~; } ; f ; cd tests && node a.test.js', T, tests);
  assert.deepEqual(lines().map((l) => l.split(' ').pop()), ['tests/a.test.js', 'tests/a.test.js'], 'a called function cd resolves to the end directory');
  // A pipeline stage's `cd` runs in a subshell and moves nothing after the pipeline.
  clear();
  call('cd tests | cat ; cd tests && node a.test.js', T, tests);
  assert.deepEqual(lines().map((l) => l.split(' ').pop()), ['tests/a.test.js'], 'a pipeline stage cd doubles no prefix');
  // `command cd` and `builtin cd` move as the `cd` they wrap, `command -p` included.
  clear();
  call('builtin cd tests && node a.test.js', T, tests);
  call('command -p cd tests && node a.test.js', T, tests);
  call('command cd tests && git restore -- a.test.js', T, tests);
  assert.deepEqual(lines(), ['run path pass tests/a.test.js', 'run path pass tests/a.test.js', 'restore tests/a.test.js'], 'a wrapped cd moves the directory');
  // An absolute `cd` after an unreadable one still resolves to itself.
  clear();
  call(`cd "$D" && cd ${T} && node tests/a.test.js`, home, T);
  assert.deepEqual(lines(), ['run path pass tests/a.test.js'], 'an absolute cd after an unreadable cd resolves to itself');
  // `pushd -n` and `popd -n` take `-n` as an option and leave the directory where it was.
  clear();
  call('pushd -n sub && node tests/a.test.js', T, T);
  call('popd -n && node tests/a.test.js', T, T);
  assert.deepEqual(lines().map((l) => l.split(' ').pop()), ['tests/a.test.js', 'tests/a.test.js'], 'pushd -n and popd -n move no directory');

  // No usable stash resolves against the input's `cwd`: no PreToolUse, an unsafe `tool_use_id`, an unwritable stash directory.
  clear();
  post('node a.test.js', tests, 'never-stashed');
  pre('node a.test.js', home, 'a/../b');
  post('node a.test.js', tests, 'a/../b');
  process.env.TMPDIR = path.join(home, 'not-a-dir');
  fs.writeFileSync(process.env.TMPDIR, '');
  pre('node a.test.js', home, 'unwritable');
  post('node a.test.js', tests, 'unwritable');
  // The spawned PreToolUse hook prints nothing and exits 0 when the stash cannot be written (INV-0160).
  assert.equal(spawnOut({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'spawned', tool_input: { command: 'node a.test.js' }, cwd: home }), '', 'an unwritable stash prints nothing');
  process.env.TMPDIR = path.join(home, 'tmp');
  assert.deepEqual(lines(), ['run path pass tests/a.test.js', 'run path pass tests/a.test.js', 'run path pass tests/a.test.js'], 'no usable stash resolves against the input cwd');

  // The stash is removed once read, and PreToolUse writes no trace line.
  clear();
  const tu = `tu${++n}`;
  pre('node a.test.js', T, tu);
  assert.ok(fs.existsSync(path.join(stashDir, tu)), 'PreToolUse stashes the starting directory');
  assert.deepEqual(lines(), [], 'PreToolUse writes no trace line');
  post('node a.test.js', T, tu, 'PostToolUseFailure');
  assert.ok(!fs.existsSync(path.join(stashDir, tu)), 'PostToolUseFailure removes the stash');
  const tu2 = call('node a.test.js', T, T);
  assert.ok(!fs.existsSync(path.join(stashDir, tu2)), 'PostToolUse removes the stash');
  // A PostToolUse that records nothing still removes the stash: shell-words.js cannot load.
  const gone = path.join(home, 'gone.js');
  const goneMarker = path.join(home, 'gone-loaded');
  fs.writeFileSync(gone, `const M = require('module'); const load = M._load; M._load = function (req, ...a) { if (req === './shell-words.js') { require('fs').writeFileSync(${JSON.stringify(goneMarker)}, 'x'); throw new Error('gone'); } return load.call(this, req, ...a); };`);
  const unloaded = [{ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'unloaded', tool_input: { command: 'node a.test.js' }, cwd: T },
    { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'unloaded', tool_input: { command: 'node a.test.js' }, cwd: T }];
  const ur = cp.spawnSync(process.execPath, ['-r', gone, '-e', `const { record } = require(${JSON.stringify(hookPath)}); for (const e of ${JSON.stringify(unloaded)}) record(e);`], { encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(ur, 'run-trace.js with shell-words.js unloadable');
  assert.equal(ur.status, 0, ur.stderr);
  assert.ok(fs.existsSync(goneMarker), 'the stub for ./shell-words.js loaded');
  assert.ok(!fs.existsSync(path.join(stashDir, 'unloaded')), 'a PostToolUse that records nothing removes the stash');

  // A symlink at the stash path is never written through.
  const victim = path.join(home, 'victim.txt');
  fs.writeFileSync(victim, 'keep');
  fs.symlinkSync(victim, path.join(stashDir, 'linked'));
  pre('node a.test.js', T, 'linked');
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep', 'a planted symlink is not written through');
  clear();
  post('node a.test.js', tests, 'linked');
  assert.deepEqual(lines(), ['run path pass tests/a.test.js'], 'a symlinked stash is not read as a starting directory');
  // A stash directory that is a symlink is not the hook's own: nothing is stashed in it, and nothing in it is read.
  // simplicity: a directory another account owns needs a chown, so only the symlink case is pinned.
  const elsewhere = path.join(home, 'elsewhere');
  fs.mkdirSync(elsewhere);
  fs.renameSync(stashDir, `${stashDir}.own`);
  fs.symlinkSync(elsewhere, stashDir);
  pre('node a.test.js', tests, 'viaLink');
  assert.ok(!fs.existsSync(path.join(elsewhere, 'viaLink')), 'a symlinked stash directory receives no stash');
  fs.writeFileSync(path.join(elsewhere, 'planted'), tests);
  clear();
  post('node tests/a.test.js', T, 'planted');
  assert.deepEqual(lines(), ['run path pass tests/a.test.js'], 'a stash in a symlinked directory is not read');
  fs.unlinkSync(stashDir);
  fs.renameSync(`${stashDir}.own`, stashDir);

  // A command that only reads test files records no run (triage #1210): a `for`/`select` header is no command, and the
  // reading commands record nothing for a test file they name.
  clear();
  call('cd tests && for f in scan scanRunRootPaths; do grep -c "\\b$f\\b" $t; done', T, tests);
  call('for f in "scan(" x; do echo "$(grep -n -F "$f" a.test.js | tr "\\n" " ")"; done', tests, tests);
  call('for t in tests/a.test.js; do wc -l $t; done', T, T);
  call('select t in tests/a.test.js; do cat $t; done', T, T);
  call('cd tests && for t in a.test.js; do head $t; done', T, tests);
  for (const r of ['tr a b tests/a.test.js', 'sort tests/a.test.js', 'cut -c1 tests/a.test.js', 'uniq tests/a.test.js', 'jq . tests/a.test.js',
    'test -f tests/a.test.js', '[ -f tests/a.test.js ]', '[[ -f tests/a.test.js ]]', 'basename tests/a.test.js', 'dirname tests/a.test.js', 'realpath tests/a.test.js']) call(r, T, T);
  assert.deepEqual(lines(), [], 'reading commands and loop headers record no run');
  // The builtin `test` reads as one only as a bare command word: a runner script named `test` given as a path still runs.
  for (const r of ['./test tests/a.test.js', 'script/test tests/a.test.js']) call(r, T, T);
  assert.deepEqual(lines(), ['run path pass tests/a.test.js', 'run path pass tests/a.test.js'], 'a runner script named test records its path run');
  clear();
  // A loop body running the configured command still records it, its outcome unknown.
  call('for i in 1; do bun run test; done', T, T);
  assert.deepEqual(lines(), ['run full unknown -'], 'a configured run inside a loop body still records');

  // A path word counts only when its file part names a file or directory that exists.
  clear();
  fs.writeFileSync(path.join(T, 'tests', 'a.py'), '');
  call('node tests/a.test.js', T, T);
  call('node tests/missing.test.js', T, T);
  call('pytest tests/a.py::test_x', T, T);
  call('pytest tests/gone.py::test_x', T, T);
  call('node --test tests/a.test.js:12', T, T);
  call(`node --test 'tests/*.test.js'`, T, T);
  assert.deepEqual(lines(), ['run path pass tests/a.test.js', 'run path pass tests/a.py::test_x', 'run path pass tests/a.test.js:12', 'run path pass tests/*.test.js'],
    'a missing file records no run; a node id counts by its file part; a quoted glob keeps its reading');
  assert.equal(testRuns('node tests/missing.test.js', T).length, 0, 'the classifier scope.js test reads agrees');

  // `command -v` and `-V`, also in an option cluster, look the name up and run nothing; `command` and `command -p` run it.
  clear();
  for (const c of ['command -v node tests/a.test.js', 'command -pv node tests/a.test.js', 'command -V node tests/a.test.js', 'command node tests/a.test.js']) call(c, T, T);
  assert.deepEqual(lines(), ['run path pass tests/a.test.js'], 'a lookup records no path run');
  assert.equal(testRuns('command -pv node tests/a.test.js', T).length, 0, 'the classifier scope.js test reads agrees on a lookup');

  // A `-C` after git's subcommand moves no edit base; a restore of a glob records no literal glob path.
  clear();
  fs.writeFileSync(path.join(T, 'p.patch'), '--- a/sub/q.js\n+++ b/sub/q.js\n@@\n');
  call('git apply -C 1 p.patch', T, T);
  call(`git restore 'tests/*'`, T, T);
  assert.deepEqual(lines(), ['edit impl sub/q.js'], 'git apply -C 1 keeps the edit base, and a glob restore records nothing');

  // `git apply` reads only its own patch input, resolves against the worktree top, and honours -p and --directory (ADR 0160).
  clear();
  fs.mkdirSync(path.join(T, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(T, 'sub', 'p.patch'), '--- a/sub/x.js\n+++ b/sub/x.js\n@@\n');
  fs.writeFileSync(path.join(T, 'p2.patch'), '--- a/a/x.js\n+++ b/a/x.js\n@@\n');
  call('cd sub && git apply p.patch', T, T);
  call('git apply -p2 p2.patch', T, T);
  call('git apply --directory=d p2.patch', T, T);
  for (const c of ['git apply --check p2.patch', 'git apply --stat p2.patch', 'git apply --numstat p2.patch', 'git apply --summary p2.patch',
    'git apply --cached p2.patch', 'git stash apply', 'git commit -m apply p2.patch']) call(c, T, T);
  call("git log apply; cat <<'E'\n+++ b/z.js\nE", T, T);
  call('git apply --build-fake-ancestor=f.idx p2.patch', T, T);
  assert.deepEqual(lines(), ['edit impl sub/x.js', 'edit impl x.js', 'edit impl d/a/x.js', 'edit impl f.idx', 'edit impl a/x.js'],
    'git apply: the worktree top, -p2, --directory, no write for a check or a non-apply word, the fake-ancestor file');

  // Every `-C` composes in order, for a restore too.
  clear();
  call('git -C sub -C deep restore a.js', T, T);
  assert.deepEqual(lines(), ['restore sub/deep/a.js'], 'git -C sub -C deep restore');

  // A configured command whose last path part is a reading command's name still records its run (INV-0129).
  clear();
  fs.writeFileSync(path.join(T, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\nscript/test\n```\n\n```sh\nscript/test {paths}\n```\n');
  call('script/test', T, T);
  call('script/test tests/a.test.js', T, T);
  assert.deepEqual(lines(), ['run full pass -', 'run focused pass -'], 'a configured script/test records its run');
  fs.writeFileSync(path.join(T, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');

  process.env.TMPDIR = savedTmp;
  if (savedTmp === undefined) delete process.env.TMPDIR;
  fs.rmSync(home, { recursive: true, force: true });
}

cleanup();
