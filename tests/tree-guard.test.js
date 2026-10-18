'use strict';

// Suite for plugin/hooks/tree-guard.js (ADR 0148, INV-0152): a dispatched implementer's file-tool write into a checkout of a
// repository that holds a superdev run, outside its main working tree's `.superdev/`, is refused.

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

// Runs every PreToolUse hook hooks.json registers for `tool`, the way Claude Code would, and reports whether any denied the call.
function registeredHooksDeny(tool, input) {
  let denied = false;
  for (const group of hooksJson.hooks.PreToolUse) {
    if (!new RegExp(`^(?:${group.matcher})$`).test(tool)) continue;
    for (const h of group.hooks) {
      const r = cp.spawnSync('sh', ['-c', h.command], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        timeout: 30000,
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
      });
      assertSpawnDecided(r, h.command);
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

const { decide } = require(path.join(pluginRoot, 'hooks', 'tree-guard.js'));

// The refusal names the refused path, the slicetree rule, and the path to reuse under the slicetree.
{
  const target = path.join(fx.main, 'plugin', 'x.md');
  fs.mkdirSync(path.dirname(target));
  const r = decide(implementerWrite(target, fx.main));
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
  assert.equal(decide(implementerWrite(path.join(linked, 'a.txt'), linked)).block, true, 'a write into another linked working tree is denied');
}

// Denied: the git directory of a repository holding a run, the main `.git/` and a linked working tree's own gitdir. `git status`
// never shows such a write. Control: the same path in a repository holding no run passes.
{
  const config = path.join(fx.main, '.git', 'config');
  const r = decide(implementerWrite(config, fx.main));
  assert.equal(r.block, true, 'a write to the main .git/config is denied');
  assert.ok(r.reason.includes(config), 'the git-directory refusal names the refused path: ' + r.reason);
  assert.ok(/only inside the slicetree/.test(r.reason), 'the git-directory refusal states the slicetree rule: ' + r.reason);
  assert.ok(/git directory/.test(r.reason), 'the git-directory refusal names the git directory: ' + r.reason);
  assert.equal(decide(implementerWrite(path.join(fx.main, '.git', 'hooks', 'pre-commit'), fx.main)).block, true, 'a write to .git/hooks/pre-commit is denied');
  const gitdir = path.resolve(fx.slicetree, git(['rev-parse', '--git-dir'], fx.slicetree));
  assert.equal(decide(implementerWrite(path.join(gitdir, 'HEAD'), fx.slicetree)).block, true, "a write into a linked working tree's gitdir is denied");
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
  assert.equal(decide(implementerWrite(path.join(repo, 'x.txt'), repo)).block, true, 'a write into a checkout whose .git is a symlink is denied');
  assert.equal(decide(implementerWrite(path.join(repo, '.git', 'config'), repo)).block, true, 'a write to .git/config through a symlinked .git is denied');
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
  assert.equal(decide(implementerWrite(path.join(modules, 'config'), fx.main)).block, true, "a write to a submodule's gitdir config is denied");
  assert.equal(decide(implementerWrite(path.join(modules, 'hooks', 'pre-commit'), fx.main)).block, true, "a write to a submodule's gitdir hooks is denied");
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

// An implementer decision costs at most three git calls (ADR 0148), counted through a PATH shim that logs each call and runs the
// real git. A count, never a duration (ADR 0086).
{
  const realGit = cp.execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const shim = path.join(fx.base, 'count-shim');
  const calls = path.join(fx.base, 'git-calls');
  fs.mkdirSync(shim);
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\necho x >> '${calls}'\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  const savedPath = process.env.PATH;
  process.env.PATH = `${shim}${path.delimiter}${savedPath}`;
  const count = () => fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean).length;
  try {
    for (const target of [path.join(fx.main, 'a.txt'), path.join(fx.main, '.git', 'config')]) {
      fs.writeFileSync(calls, '');
      assert.equal(decide(implementerWrite(target, fx.main)).block, true, `control: the counted write to ${target} is denied`);
      assert.ok(count() >= 1 && count() <= 3, `an implementer decision runs at most three git calls, ran ${count()} for ${target}`);
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
  const write = JSON.stringify(implementerWrite(path.join(fx.main, 'a.txt'), fx.main));
  assert.equal(run(hook, write), 2, 'control: the hook process denies an implementer write into the main checkout');
  assert.equal(run(hook, '{not json'), 0, 'unreadable hook input passes');

  // A git call past its bound carries no verdict (INV-0009).
  const slow = path.join(fx.base, 'slow-git');
  fs.mkdirSync(slow);
  fs.writeFileSync(path.join(slow, 'git'), '#!/bin/sh\nsleep 5\n', { mode: 0o755 });
  assert.equal(run(hook, write, { PATH: `${slow}${path.delimiter}${process.env.PATH}`, TREE_GUARD_GIT_BOUND_MS: '200' }), 0, 'a git call past its bound passes');

  // An unreadable run directory.
  const scopes = path.join(fx.main, '.superdev', 'scopes');
  fs.chmodSync(scopes, 0o000);
  try {
    assert.equal(run(hook, write), 0, 'an unreadable run directory passes');
  } finally {
    fs.chmodSync(scopes, 0o755);
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
  const denied = (file, cwd = fx.slicetree) => decide(implementerWrite(file, cwd)).block;
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

// A `.superdev` that is a symlink to a directory outside the main checkout still holds the run and its slicetrees.
{
  const lx = fixture({ linked: true });
  assert.equal(decide(implementerWrite(path.join(lx.slicetree, 'a.txt'), lx.slicetree)).block, false, 'a write into a slicetree under a symlinked `.superdev` passes');
  assert.equal(decide(implementerWrite(path.join(lx.main, 'a.txt'), lx.main)).block, true, 'control: a write into that main checkout is denied');
}
