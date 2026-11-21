'use strict';

// Suite for plugin/hooks/tree-guard.js (ADR 0148, INV-0152): a dispatched implementer's file-tool write into a checkout of a
// repository that holds a superdev run, outside its main working tree's `.superdev/`, is refused.
//
// Cause of the earlier intermittent failure at "control: the counted write ... is denied" (triage #340): the hook bounds each git
// call and fails open past it (INV-0009). Under CPU and process-spawn starvation, which the concurrent runner supplies, a counted
// call outlasted that bound, `decide` passed the write, and a denial assertion read the pass as a missing denial. The suite wraps
// `child_process.spawnSync` before it loads the hook and records, per git call, whether the bound (or a signal) ended it. A
// decision holding such a call carries no verdict and `measure` runs it again, up to `ATTEMPTS` times; a decision with no killed
// call is final and asserted as it stands. Every in-process denial assertion goes through it. A hook run as a child process cannot be
// wrapped in-process, so a preload under `tests/` (`spawn-kill-record.js`, via `NODE_OPTIONS`) records each killed git call to a file in
// the suite's temporary directory, and every child-process denial assertion (the registered-hooks checks and the hook-process
// control) measures a child that left a record again, the same way. The fail-open cases assert the pass a kill produces.
// Reproductions: the case "the reproduction for the child process" holds the hook child's first git call past the bound; the case "a git shim holds one designated call past the bound before it does anything" (the `hold-shim` block)
// deterministically produces the killed-before-first-line call; the base suite's start/end bookkeeping took it for a verdict.

require('./fixture-git');
const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { assertSpawnDecided } = require('./spawn-verdict');

const pluginRoot = path.resolve(__dirname, '..', 'plugin');
const hooksJson = require(path.join(pluginRoot, 'hooks', 'hooks.json'));

const git = (args, cwd) => cp.execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();

// A repository holding a run: a main checkout with a tracked file, a run root with a ledger, and a slicetree under it. With
// `linked`, `.superdev` is a symlink to a directory outside the main checkout. The fixture is removed when the suite exits, pass
// or fail.
function fixture({ linked = false } = {}) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'tree-guard-')));
  process.on('exit', () => fs.rmSync(base, { recursive: true, force: true }));
  const main = path.join(base, 'main');
  fs.mkdirSync(main);
  git(['init', '-q', '-b', 'main'], main);
  git(['config', 'user.email', 'test@example.com'], main);
  git(['config', 'user.name', 'test'], main);
  fs.writeFileSync(path.join(main, 'a.txt'), 'a\n');
  git(['add', '.'], main);
  git(['commit', '-q', '-m', 'base'], main);
  if (linked) {
    fs.mkdirSync(path.join(base, 'store'));
    fs.symlinkSync(path.join(base, 'store'), path.join(main, '.superdev'));
  }
  const runRoot = path.join(main, '.superdev', 'scopes', 's');
  fs.mkdirSync(runRoot, { recursive: true });
  fs.writeFileSync(path.join(runRoot, 'ledger.md'), '# Scope\n');
  const slicetree = path.join(runRoot, 'slicetrees', '01');
  git(['worktree', 'add', '-q', '-b', 'slice-01', slicetree], main);
  return { base, main, runRoot, slicetree };
}

const implementerWrite = (file, cwd) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Write',
  agent_id: 'a1',
  agent_type: 'superdev:implementer',
  session_id: 's',
  cwd,
  tool_input: { file_path: file, content: 'x' },
});

// Runs a hook child process, then reads the kill record the preload (`tests/spawn-kill-record.js`) wrote for it. A child whose git
// call the bound killed fails open and exits 0, which carries no verdict (INV-0009): it is run again, up to `ATTEMPTS` times, and
// fails "no verdict" when every attempt holds a kill. The record lives in the suite's own temporary directory. Forward slashes keep
// the `--require` path intact through `NODE_OPTIONS` on Windows.
const ATTEMPTS = 5;
const preload = path.join(__dirname, 'spawn-kill-record.js').replace(/\\/g, '/');
let childRuns = 0;
function measureChild(label, spawn) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const killFile = path.join(fx.base, `kills-${childRuns++}`);
    const nodeOptions = `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + ' ' : ''}--require "${preload}"`;
    const r = spawn({ NODE_OPTIONS: nodeOptions, SPAWN_KILL_FILE: killFile });
    assertSpawnDecided(r, label);
    if (!fs.existsSync(killFile)) return r;
  }
  return assert.fail(`${label}: a git call the hook's bound killed in each of ${ATTEMPTS} attempts: no verdict`);
}

// Runs every PreToolUse hook hooks.json registers for `tool`, the way Claude Code would, and reports whether any denied the call.
function registeredHooksDeny(tool, input, extraEnv) {
  let denied = false;
  for (const group of hooksJson.hooks.PreToolUse) {
    if (!new RegExp(`^(?:${group.matcher})$`).test(tool)) continue;
    for (const h of group.hooks) {
      const r = measureChild(h.command, (env) => cp.spawnSync('sh', ['-c', h.command], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, ...extraEnv, ...env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      }));
      if (r.status === 2) denied = true;
    }
  }
  return denied;
}

const fx = fixture();

// The reproduction (triage #566): an implementer Write into the main checkout passed every registered PreToolUse hook.
assert.equal(
  registeredHooksDeny('Write', implementerWrite(path.join(fx.main, 'a.txt'), fx.main)),
  true,
  'an implementer Write into the main checkout is denied by the registered hooks',
);

// NotebookEdit carries its target in `notebook_path`.
assert.equal(
  registeredHooksDeny('NotebookEdit', { ...implementerWrite(undefined, fx.main), tool_name: 'NotebookEdit', tool_input: { notebook_path: path.join(fx.main, 'n.ipynb'), new_source: 'x' } }),
  true,
  'an implementer NotebookEdit into the main checkout is denied by the registered hooks',
);
assert.equal(registeredHooksDeny('Edit', { ...implementerWrite(path.join(fx.main, 'a.txt'), fx.main), tool_name: 'Edit' }), true, 'an implementer Edit into the main checkout is denied by the registered hooks');

// The reproduction for the child process: a git shim holds the hook's first git call past its bound, so the child fails open and
// exits 0 although the write is denied. That reads as no verdict, and the registered-hooks check measures it again. The shim is a
// `#!/bin/sh` script named `git`, which Node's `spawnSync('git')` never runs on Windows: POSIX-only machinery.
if (process.platform !== 'win32') {
  const realGit = cp.execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const shim = path.join(fx.base, 'child-hold-shim');
  const flag = path.join(fx.base, 'child-hold-flag');
  fs.mkdirSync(shim);
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\nif mkdir '${flag}' 2>/dev/null; then exec sleep 30; fi\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  const denied = registeredHooksDeny('Write', implementerWrite(path.join(fx.main, 'a.txt'), fx.main), { PATH: `${shim}${path.delimiter}${process.env.PATH}` });
  assert.ok(fs.existsSync(flag), 'the shim held the hook child\'s first git call');
  assert.equal(denied, true, 'a hook child whose first git call the bound killed is measured again and denies the write');
}

// The hook and its git helper destructure `spawnSync` when they load, so the wrapper goes in before the require.
const gitCalls = [];
const realSpawnSync = cp.spawnSync;
cp.spawnSync = function spawnSync(command, ...rest) {
  const res = realSpawnSync.call(this, command, ...rest);
  if (command === 'git') gitCalls.push({ killed: Boolean(res.signal) || (res.error && res.error.code === 'ETIMEDOUT') });
  return res;
};
const { decide } = require(path.join(pluginRoot, 'hooks', 'tree-guard.js'));

// The bound kill, observed where it happens: every git call `decide` makes, in order, with whether the bound (or any signal) ended it.
// A decision holding a killed call carries no verdict, so `measure` runs it again. A decision with no killed call is final.
function measure(input) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    gitCalls.length = 0;
    const r = decide(input);
    if (!gitCalls.some((c) => c.killed)) return { r, git: gitCalls.length, attempts: attempt };
  }
  return assert.fail(`the decision for ${input.tool_input.file_path || input.tool_input.notebook_path} had a git call the hook's bound killed in each of ${ATTEMPTS} attempts: no verdict`);
}
const decideM = (input) => measure(input).r;

// The refusal names the refused path, the slicetree rule, and the path to reuse under the slicetree.
{
  const target = path.join(fx.main, 'plugin', 'x.md');
  fs.mkdirSync(path.dirname(target));
  const r = decideM(implementerWrite(target, fx.main));
  assert.equal(r.block, true, 'a write into a subdirectory of the main checkout is denied');
  assert.ok(r.reason.includes(target), 'the refusal names the refused path: ' + r.reason);
  assert.ok(/only inside the slicetree/.test(r.reason), 'the refusal states the slicetree rule: ' + r.reason);
  assert.ok(r.reason.includes(`\`${path.join('plugin', 'x.md')}\``), 'the refusal gives the path relative to its working tree: ' + r.reason);
}

// Allowed: the slicetree, the run root (its progress log and reports), a repository holding no run, and a path in no repository.
{
  assert.equal(decide(implementerWrite(path.join(fx.slicetree, 'a.txt'), fx.slicetree)).block, false, 'a write into the slicetree passes');
  fs.mkdirSync(path.join(fx.runRoot, 'reports', '01'), { recursive: true });
  assert.equal(decide(implementerWrite(path.join(fx.runRoot, 'reports', '01', 'progress.md'), fx.main)).block, false, 'a write into the run root passes');
  const other = path.join(fx.base, 'fixture-repo');
  fs.mkdirSync(other);
  git(['init', '-q'], other);
  assert.equal(decide(implementerWrite(path.join(other, 'f.txt'), other)).block, false, 'a write into a repository holding no run passes');
  const bare = path.join(fx.base, 'no-repo');
  fs.mkdirSync(bare);
  assert.equal(decide(implementerWrite(path.join(bare, 'f.txt'), bare)).block, false, 'a write in no repository passes');
}

// Denied: another linked working tree of the repository, outside `.superdev/`.
{
  const linked = path.join(fx.base, 'linked');
  git(['worktree', 'add', '-q', '-b', 'linked', linked], fx.main);
  assert.equal(decideM(implementerWrite(path.join(linked, 'a.txt'), linked)).block, true, 'a write into another linked working tree is denied');
}

// Denied: the git directory of a repository holding a run, the main `.git/` and a linked working tree's own gitdir. `git status`
// never shows such a write. Control: the same path in a repository holding no run passes.
{
  const config = path.join(fx.main, '.git', 'config');
  const r = decideM(implementerWrite(config, fx.main));
  assert.equal(r.block, true, 'a write to the main .git/config is denied');
  assert.ok(r.reason.includes(config), 'the git-directory refusal names the refused path: ' + r.reason);
  assert.ok(/only inside the slicetree/.test(r.reason), 'the git-directory refusal states the slicetree rule: ' + r.reason);
  assert.ok(/git directory/.test(r.reason), 'the git-directory refusal names the git directory: ' + r.reason);
  assert.equal(decideM(implementerWrite(path.join(fx.main, '.git', 'hooks', 'pre-commit'), fx.main)).block, true, 'a write to .git/hooks/pre-commit is denied');
  const gitdir = path.resolve(fx.slicetree, git(['rev-parse', '--git-dir'], fx.slicetree));
  assert.equal(decideM(implementerWrite(path.join(gitdir, 'HEAD'), fx.slicetree)).block, true, "a write into a linked working tree's gitdir is denied");
  const other = path.join(fx.base, 'fixture-repo');
  assert.equal(decide(implementerWrite(path.join(other, '.git', 'config'), other)).block, false, "a write to the .git/config of a repository holding no run passes");
}

// Denied: a main `.git` that is a symlink to a directory with another name. The real path holds no `.git` segment, so the path
// as spelled places the write. Control: a write into that repository's checkout is denied too.
{
  const repo = path.join(fx.base, 'm3');
  fs.mkdirSync(repo);
  git(['init', '-q', '-b', 'main'], repo);
  fs.renameSync(path.join(repo, '.git'), path.join(fx.base, 'm3real.git'));
  fs.symlinkSync(path.join('..', 'm3real.git'), path.join(repo, '.git'));
  fs.mkdirSync(path.join(repo, '.superdev', 'scopes', 'x'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.superdev', 'scopes', 'x', 'ledger.md'), '# Scope\n');
  assert.equal(decideM(implementerWrite(path.join(repo, 'x.txt'), repo)).block, true, 'a write into a checkout whose .git is a symlink is denied');
  assert.equal(decideM(implementerWrite(path.join(repo, '.git', 'config'), repo)).block, true, 'a write to .git/config through a symlinked .git is denied');
}

// Allowed: a bare repository inside the main checkout holds no run, and git places a path in it inside that bare repository, in
// no working tree. Like any nested repository holding no run, a write there passes.
{
  const bare = path.join(fx.main, 'bare.git');
  git(['init', '-q', '--bare', bare], fx.main);
  assert.equal(decide(implementerWrite(path.join(bare, 'config'), fx.main)).block, false, 'a write into a bare repository holding no run passes');
}

// Denied: a submodule's gitdir under the main `.git/modules/`. Run there, git resolves the submodule's own repository, which
// holds no run, so only the `.git` the path lies under places it.
{
  const src = path.join(fx.base, 'sub-src');
  fs.mkdirSync(src);
  git(['init', '-q', '-b', 'main'], src);
  git(['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'sub'], src);
  git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', src, 'sub'], fx.main);
  const modules = path.join(fx.main, '.git', 'modules', 'sub');
  assert.equal(decideM(implementerWrite(path.join(modules, 'config'), fx.main)).block, true, "a write to a submodule's gitdir config is denied");
  assert.equal(decideM(implementerWrite(path.join(modules, 'hooks', 'pre-commit'), fx.main)).block, true, "a write to a submodule's gitdir hooks is denied");
}

// The controller, every other agent type, and a subagent call naming no agent type pass, and the guard runs no git to decide them.
{
  const shim = path.join(fx.base, 'shim');
  const marker = path.join(fx.base, 'git-ran');
  fs.mkdirSync(shim);
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 });
  const savedPath = process.env.PATH;
  process.env.PATH = `${shim}${path.delimiter}${savedPath}`;
  try {
    const target = path.join(fx.main, 'a.txt');
    const callers = [
      { label: 'the controller', input: { ...implementerWrite(target, fx.main), agent_id: undefined, agent_type: undefined } },
      { label: 'the doc-writer', input: { ...implementerWrite(target, fx.main), agent_type: 'superdev:doc-writer' } },
      { label: 'a general-purpose subagent', input: { ...implementerWrite(target, fx.main), agent_type: 'general-purpose' } },
      { label: 'a subagent naming no agent type', input: { ...implementerWrite(target, fx.main), agent_type: undefined } },
    ];
    for (const { label, input } of callers) assert.equal(decide(input).block, false, `${label} passes`);
    assert.equal(fs.existsSync(marker), false, 'the guard ran no git for a caller other than the implementer');
  } finally {
    process.env.PATH = savedPath;
  }
}

// An implementer decision costs at most three git calls (ADR 0148), counted through the `spawnSync` wrapper. A count, never a
// duration (ADR 0086).
for (const target of [path.join(fx.main, 'a.txt'), path.join(fx.main, '.git', 'config')]) {
  const { r, git: ran } = measure(implementerWrite(target, fx.main));
  assert.equal(r.block, true, `control: the counted write to ${target} is denied`);
  assert.ok(ran >= 1 && ran <= 3, `an implementer decision runs at most three git calls, ran ${ran} for ${target}`);
}

// The reproduction of the intermittent failure, made deterministic: a git shim that holds one designated call past the hook's
// bound before it does anything (the call a starved spawn leaves killed before its first line ran). The hook fails open on that
// call, so the decision carries no verdict and is measured again. Each target is a denial the suite asserts. POSIX-only: the
// `#!/bin/sh` shim named `git` never runs on Windows.
if (process.platform !== 'win32') {
  const realGit = cp.execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const shim = path.join(fx.base, 'hold-shim');
  const flag = path.join(fx.base, 'hold-flag');
  fs.mkdirSync(shim);
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\nif mkdir '${flag}' 2>/dev/null; then exec sleep 30; fi\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  const savedPath = process.env.PATH;
  process.env.PATH = `${shim}${path.delimiter}${savedPath}`;
  try {
    for (const target of [path.join(fx.main, 'a.txt'), path.join(fx.main, '.git', 'hooks', 'pre-commit')]) {
      fs.rmSync(flag, { recursive: true, force: true });
      const held = measure(implementerWrite(target, fx.main));
      assert.equal(held.r.block, true, `a decision whose first git call was held past the bound is measured again and denies ${target}`);
      assert.ok(fs.existsSync(flag) && held.attempts >= 2, `the held call made an earlier attempt carry no verdict for ${target}`);
    }
  } finally {
    process.env.PATH = savedPath;
  }
}

// A call the guard cannot judge passes (ADR 0148): the hook exits 0 and denies nothing.
{
  const hook = path.join(pluginRoot, 'hooks', 'tree-guard.js');
  const run = (hookPath, input, env) => {
    const r = cp.spawnSync(process.execPath, [hookPath], { input, encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env } });
    assertSpawnDecided(r, 'tree-guard');
    return r.status;
  };
  // A denial the child process asserts goes through the kill record; the fail-open cases below keep `run`.
  const runMeasured = (hookPath, input) => measureChild('tree-guard', (env) => cp.spawnSync(process.execPath, [hookPath], { input, encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env } })).status;
  const write = JSON.stringify(implementerWrite(path.join(fx.main, 'a.txt'), fx.main));
  assert.equal(runMeasured(hook, write), 2, 'control: the hook process denies an implementer write into the main checkout');
  assert.equal(run(hook, '{not json'), 0, 'unreadable hook input passes');

  // A git call past its bound carries no verdict (INV-0009). POSIX-only: a `#!/bin/sh` shim named `git`, and `chmod 0o000`
  // below, do nothing on Windows.
  if (process.platform !== 'win32') {
    const slow = path.join(fx.base, 'slow-git');
    fs.mkdirSync(slow);
    const marker = path.join(slow, 'called');
    fs.writeFileSync(path.join(slow, 'git'), `#!/bin/sh\necho git >> '${marker}'\nexec sleep 5\n`, { mode: 0o755 });
    assert.equal(run(hook, write, { PATH: `${slow}${path.delimiter}${process.env.PATH}` }), 0, 'a git call past its bound passes');
    assert.ok(fs.existsSync(marker), 'the hook reached the slow git stub');

    // An unreadable run directory.
    const scopes = path.join(fx.main, '.superdev', 'scopes');
    fs.chmodSync(scopes, 0o000);
    try {
      assert.equal(run(hook, write), 0, 'an unreadable run directory passes');
    } finally {
      fs.chmodSync(scopes, 0o755);
    }
  }

  // A helper module that will not load: the hook copied away from its `../lib/main-work-tree.js`.
  const lone = path.join(fx.base, 'lone', 'hooks');
  fs.mkdirSync(lone, { recursive: true });
  fs.copyFileSync(hook, path.join(lone, 'tree-guard.js'));
  assert.equal(run(path.join(lone, 'tree-guard.js'), write), 0, 'a helper module that will not load passes');
  // The same, with a stub at the hook's own `../lib/main-work-tree.js` that marks its load and throws.
  const stubbed = path.join(fx.base, 'stubbed');
  fs.mkdirSync(path.join(stubbed, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(stubbed, 'lib'));
  fs.copyFileSync(hook, path.join(stubbed, 'hooks', 'tree-guard.js'));
  const stubMarker = path.join(stubbed, 'stub-loaded');
  fs.writeFileSync(path.join(stubbed, 'lib', 'main-work-tree.js'), `require('fs').writeFileSync(${JSON.stringify(stubMarker)}, 'x'); throw new Error('gone');`);
  assert.equal(run(path.join(stubbed, 'hooks', 'tree-guard.js'), write), 0, 'a main-work-tree module that throws on load passes');
  assert.ok(fs.existsSync(stubMarker), 'the stub at ../lib/main-work-tree.js loaded');
  // A module that loads but whose resolver throws: the write passes.
  fs.rmSync(stubMarker);
  fs.writeFileSync(path.join(stubbed, 'lib', 'main-work-tree.js'), `require('fs').writeFileSync(${JSON.stringify(stubMarker)}, 'x'); module.exports = { mainWorkTree() { throw new Error('boom'); } };`);
  assert.equal(run(path.join(stubbed, 'hooks', 'tree-guard.js'), write), 0, 'a mainWorkTree that throws passes');
  assert.ok(fs.existsSync(stubMarker), 'the stub with a throwing mainWorkTree loaded');
}

// A target is judged by where its bytes would land, whatever its spelling.
{
  const denied = (file, cwd = fx.slicetree) => decideM(implementerWrite(file, cwd)).block;
  assert.equal(denied('../../../../../a.txt', fx.slicetree), true, 'a relative path that resolves into the main checkout is denied');
  assert.equal(denied('a.txt', fx.slicetree), false, 'a relative path inside the slicetree passes');
  assert.equal(denied(path.join(fx.slicetree, '..', '..', '..', '..', '..', 'a.txt')), true, '`..` segments that leave for the main checkout are denied');
  assert.equal(denied(path.join(fx.main, 'new', 'deeper', 'f.txt')), true, 'a new file in a directory that does not exist yet is denied');
  assert.equal(denied(path.join(fx.slicetree, 'new', 'deeper', 'f.txt')), false, 'a new file in a new slicetree directory passes');
  fs.mkdirSync(path.join(fx.main, '.superdev-foo'));
  assert.equal(denied(path.join(fx.main, '.superdev-foo', 'f.txt')), true, 'a sibling whose name only starts with `.superdev` is denied');

  // A symlink inside the slicetree that resolves into the main checkout.
  fs.symlinkSync(fx.main, path.join(fx.slicetree, 'escape'));
  assert.equal(denied(path.join(fx.slicetree, 'escape', 'a.txt')), true, 'a symlink inside the slicetree that resolves into a checkout is denied');
  assert.equal(denied(path.join(fx.slicetree, 'escape', 'new', 'f.txt')), true, 'a new file behind that symlink is denied');

  // A `..` after a symlink leaves the symlink's target, as the kernel resolves it. Spelled by concatenation: `path.join` would
  // collapse the `..` against `esc` before the guard saw it.
  fs.symlinkSync(path.join(fx.main, 'plugin'), path.join(fx.slicetree, 'esc'));
  assert.equal(denied([fx.slicetree, 'esc', '..', 'a.txt'].join(path.sep)), true, 'a `..` that follows a symlink into the main checkout is denied');

  // A dangling symlink inside the slicetree whose target would be created in the main checkout.
  fs.symlinkSync(path.join(fx.main, 'newfile.txt'), path.join(fx.slicetree, 'dangle'));
  assert.equal(denied(path.join(fx.slicetree, 'dangle')), true, 'a dangling symlink that would create a file in the main checkout is denied');
  fs.symlinkSync('../../../../../chained.txt', path.join(fx.slicetree, 'dangle-rel'));
  fs.symlinkSync(path.join(fx.slicetree, 'dangle-rel'), path.join(fx.slicetree, 'dangle-chain'));
  assert.equal(denied(path.join(fx.slicetree, 'dangle-chain')), true, 'a chain of symlinks ending in a dangling relative link into the main checkout is denied');
  fs.symlinkSync(path.join(fx.slicetree, 'loop-b'), path.join(fx.slicetree, 'loop-a'));
  fs.symlinkSync(path.join(fx.slicetree, 'loop-a'), path.join(fx.slicetree, 'loop-b'));
  assert.equal(denied(path.join(fx.slicetree, 'loop-a')), false, 'a symlink loop ends the walk and the write passes');

  // A symlinked spelling of the main checkout itself.
  const alias = path.join(fx.base, 'alias');
  fs.symlinkSync(fx.main, alias);
  assert.equal(denied(path.join(alias, 'a.txt')), true, 'a symlinked path to the main checkout is denied');
  assert.equal(denied(path.join(alias, '.superdev', 'scopes', 's', 'slicetrees', '01', 'a.txt')), false, 'a symlinked path into the slicetree passes');

  // Letter case, where the filesystem ignores it.
  const upper = path.join(fx.base, 'MAIN');
  if (fs.existsSync(upper)) {
    assert.equal(denied(path.join(upper, 'a.txt')), true, 'a differently cased path to the main checkout is denied');
    assert.equal(denied(path.join(upper, '.SUPERDEV', 'scopes', 's', 'slicetrees', '01', 'a.txt')), false, 'a differently cased path into the slicetree passes');
  }
}

// Windows spellings of a target (INV-0152): the cases below run on win32 only, and the suite asserts there that every one ran, so
// no platform guard skips them silently. Each is a write by the implementer; a denied one is measured through `decideM`.
if (process.platform === 'win32') {
  let ran = 0;
  const target = (file) => implementerWrite(file, fx.slicetree);
  const deniedWin = (file, label) => {
    ran++;
    assert.equal(decideM(target(file)).block, true, `${label}: a write into the main checkout is denied: ${file}`);
  };
  const main = fx.main;
  deniedWin(main.replace(/\//g, '\\') + '\\a.txt', 'backslash');
  deniedWin(main.replace(/\\/g, '/') + '/a.txt', 'forward slash');
  deniedWin(main[0].toLowerCase() + main.slice(1) + '\\a.txt', 'lower-case drive');
  deniedWin(main.replace(/\\/g, '/') + '/sub/../a.txt', 'forward slash with `..`');
  // The runner's temp directory is spelled as an 8.3 name; the fixture's real path is the long one.
  deniedWin(path.join(os.tmpdir(), path.basename(fx.base), 'main', 'a.txt'), `8.3 temp name (${os.tmpdir()})`);
  // A junction whose target is an absolute Windows path.
  fs.symlinkSync(main, path.join(fx.slicetree, 'junction'), 'junction');
  deniedWin(path.join(fx.slicetree, 'junction', 'a.txt'), 'junction');
  deniedWin(path.join(fx.slicetree, 'junction', 'new', 'f.txt'), 'new file behind a junction');
  // A UNC admin share, where the runner allows it: optional, so it is outside the count.
  const admin = `\\\\localhost\\${main[0]}$\\${main.slice(3)}\\a.txt`;
  if (fs.existsSync(admin)) assert.equal(decideM(target(admin)).block, true, `a UNC admin share spelling is denied: ${admin}`);
  // A write to a drive or share that does not exist passes, and the hook child finishes on its own: it runs under a bound far
  // above its own 5 s exit, and a child stuck in the ancestor walk is killed by that bound and fails here (INV-0009).
  const free = 'ZYXWVUTSRQPONMLKJIHGFED'.split('').find((l) => !fs.existsSync(`${l}:\\`));
  const hook = path.join(pluginRoot, 'hooks', 'tree-guard.js');
  for (const [label, file] of [
    ['an unmapped drive', `${free}:\\x\\a.txt`],
    ['a UNC root on a host with no DNS entry', '\\\\superdev-no-such-host.invalid\\share\\x\\a.txt'],
  ]) {
    ran++;
    const r = cp.spawnSync(process.execPath, [hook], { input: JSON.stringify(target(file)), encoding: 'utf8', timeout: 60000 });
    assertSpawnDecided(r, label);
    assert.equal(r.status, 0, `${label}: the write passes: ${file}`);
    assert.equal(decide(target(file)).block, false, `${label}: the decision passes in process: ${file}`);
  }
  assert.equal(ran, 9, `every native-path case ran (${ran} of 9)`);
}

// A `.superdev` that is a symlink to a directory outside the main checkout still holds the run and its slicetrees.
{
  const lx = fixture({ linked: true });
  assert.equal(decide(implementerWrite(path.join(lx.slicetree, 'a.txt'), lx.slicetree)).block, false, 'a write into a slicetree under a symlinked `.superdev` passes');
  assert.equal(decideM(implementerWrite(path.join(lx.main, 'a.txt'), lx.main)).block, true, 'control: a write into that main checkout is denied');
}
