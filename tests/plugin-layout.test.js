'use strict';

// Suite for the shipped tree's layout (ADR 0151): the CommonJS anchor covers plugin/lib/, every entry point under
// plugin/hooks/ and plugin/scripts/ keeps the export names it had before its code moved to plugin/lib/, and a name it
// re-exports from a module is that module's own.

require('./fixture-git');
const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertSpawnDecided } = require('./spawn-verdict');

const plugin = path.join(__dirname, '..', 'plugin');
const libFiles = fs.readdirSync(path.join(plugin, 'lib'), { recursive: true }).filter((n) => n.endsWith('.js'));
const hookFiles = fs.readdirSync(path.join(plugin, 'hooks')).filter((n) => n.endsWith('.js'));

// The CommonJS anchor covers plugin/lib/: the nearest package.json above it is plugin/package.json, which carries
// `"type": "commonjs"`, and plugin/lib/ holds no `.mjs` file and no ESM syntax. Checked first, before anything under
// plugin/ loads, so a broken anchor fails here.
{
  const lib = path.join(plugin, 'lib');
  let dir = lib;
  while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
  assert.strictEqual(dir, plugin, 'plugin/package.json is the nearest package.json above plugin/lib/');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(plugin, 'package.json'), 'utf8')).type, 'commonjs', 'plugin/package.json carries "type": "commonjs"');
  for (const name of fs.readdirSync(lib, { recursive: true })) {
    assert.ok(!name.endsWith('.mjs'), `plugin/lib/${name} is no .mjs file`);
    if (!name.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(lib, name), 'utf8');
    assert.doesNotMatch(src, /^\s*(?:import\s[\s\S]*?\sfrom\s|import\s*['"]|export\s)|\bimport\.meta\b/m, `plugin/lib/${name} carries no ESM syntax`);
  }
}

// The export names of each entry point, sorted. A dropped or added export fails here.
const EXPORTS = {
  'hooks/ledger-guard.js': ['decide'],
  'hooks/merge-guard.js': ['decide'],
  'hooks/model-explicit.js': ['OURS', 'decide'],
  'hooks/run-lock.js': ['STALENESS_MS', 'decide'],
  'hooks/run-trace.js': ['bashTargets', 'locate', 'parseFinalVerdict', 'parseVerdict', 'record', 'testRuns', 'treeState', 'verificationKind'],
  'hooks/scope-prune.js': ['TTL_MS', 'branchNamesFrom', 'main', 'readBranch', 'readHeader', 'readStage', 'selectPrunable', 'shapeScanBranch'],
  'hooks/slicetree-sweep.js': ['git', 'main', 'selectRemovable'],
  'hooks/test-guard.js': ['decide'],
  'hooks/tree-guard.js': ['decide'],
  'hooks/update-check.js': ['cmpVersion'],
  'scripts/kb-patch.js': ['headingKeyOf', 'maskFencedLines', 'merge'],
  'scripts/publish-kb.js': ['addParentLink', 'checkContainment', 'classifyBackend', 'hashBody', 'listPendingScopes', 'parseBaseBranch',
    'parseCommandsTemplates', 'parseRemote', 'parseStagedPage', 'processFile', 'processStagedFiles', 'publishDelete', 'publishPatch', 'publishUpsert',
    'readPage', 'removeParentLink', 'renderReport', 'resolveMainCheckout', 'resolveScope', 'resolveScopeBranch', 'run', 'runFind', 'runTemplate',
    'timeoutMs'],
  'scripts/scope.js': ['CHANGE_TYPES', 'SLUG_RE', 'appendTrace', 'baseHistoryHasPatch', 'endRun', 'findCollisions', 'inProgressSlices',
    'isTestPath', 'mainWorkTree', 'publishText', 'readLedgerHeader', 'readTrace', 'refResolves', 'run', 'sliceType', 'testContainment',
    'untraceField', 'verificationCommands', 'verificationCommandsOf', 'watchMain'],
};
for (const [rel, names] of Object.entries(EXPORTS)) {
  assert.deepStrictEqual(Object.keys(require(path.join(plugin, rel))).sort(), names, `${rel} exports the names it exported before`);
}

// Each entry point re-exports names from the modules that hold them: each name is the module's own value, so a
// divergent local copy fails here.
const RE_EXPORTS = {
  'hooks/run-trace.js': { 'bash-writes': ['bashTargets'], 'run-tree': ['locate', 'treeState'], verdicts: ['parseVerdict', 'parseFinalVerdict'],
    'test-runs': ['testRuns', 'verificationKind'] },
  'scripts/kb-patch.js': { 'md-sections': ['maskFencedLines', 'merge', 'headingKeyOf'] },
  'scripts/publish-kb.js': { 'kb-staging': ['resolveMainCheckout', 'listPendingScopes', 'resolveScope'],
    'kb-backend-config': ['classifyBackend', 'parseCommandsTemplates'], 'kb-staged-page': ['parseStagedPage'],
    'kb-backend': ['runTemplate', 'runFind', 'publishUpsert', 'publishDelete', 'publishPatch', 'timeoutMs', 'hashBody'],
    'kb-apply': ['processFile', 'processStagedFiles'], 'kb-parent-link': ['addParentLink', 'removeParentLink'], 'kb-containment': ['resolveScopeBranch', 'parseBaseBranch', 'parseRemote', 'checkContainment'],
    'kb-read': ['readPage'], 'kb-report': ['renderReport'] },
  'scripts/scope.js': { 'run-supervision': ['endRun', 'watchMain'], verification: ['verificationCommandsOf', 'verificationCommands', 'isTestPath'],
    'trace-log': ['appendTrace', 'untraceField', 'readTrace'], ledger: ['sliceType', 'readLedgerHeader', 'inProgressSlices', 'SLUG_RE', 'CHANGE_TYPES'],
    'run-state': ['publishText'], containment: ['testContainment', 'baseHistoryHasPatch'], 'main-work-tree': ['mainWorkTree'],
    'git-spawn': ['refResolves'], collisions: ['findCollisions'] },
};
for (const [rel, mods] of Object.entries(RE_EXPORTS)) {
  const entry = require(path.join(plugin, rel));
  for (const [mod, names] of Object.entries(mods)) {
    const own = require(path.join(plugin, 'lib', `${mod}.js`));
    for (const name of names) assert.strictEqual(entry[name], own[name], `${path.basename(rel)}'s ${name} is ${mod}.js's`);
  }
}

// INV-0068: requiring a lib module or a hook prints nothing, spawns nothing, and exits nothing. One process requires every file of
// both listings, so a module or hook added later is covered without an edit here. stdin is an empty pipe, so a hook missing its
// require.main guard would dispatch and write.
{
  const files = [...libFiles.map((n) => path.join('lib', n)), ...hookFiles.map((n) => path.join('hooks', n))];
  const child = `
    const cp = require('node:child_process');
    const out = process.stdout.write.bind(process.stdout);
    const bad = [];
    let cur;
    // A hook's main() runs after stdin ends, long after cur moved on, so the offender is the plugin file in the call stack.
    const who = () => (new Error().stack.match(/(?:lib|hooks)\\/[\\w.-]+\\.js/) || [cur])[0];
    for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[k] = () => { bad.push(who() + ' spawns'); throw new Error('spawn'); };
    process.exit = () => { bad.push(who() + ' exits'); throw new Error('exit'); };
    process.stdout.write = process.stderr.write = () => { bad.push(who() + ' prints'); return true; };
    for (const f of ${JSON.stringify(files)}) {
      cur = f;
      try { require(require('node:path').join(${JSON.stringify(plugin)}, f)); } catch (e) { bad.push(f + ' throws ' + e.message); }
    }
    process.on('exit', () => out(JSON.stringify(bad)));`;
  // The child's environment names no real plugin root or data directory and no real update remote, so a hook that runs anyway
  // reaches nothing outside the test.
  const childData = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-layout-require-'));
  process.on('exit', () => fs.rmSync(childData, { recursive: true, force: true }));
  const childEnv = { ...process.env, CLAUDE_PLUGIN_ROOT: '', CLAUDE_PLUGIN_DATA: childData, SUPERDEV_UPDATE_CHECK_REMOTE: 'https://127.0.0.1:1/plugin.json' };
  const r = cp.spawnSync(process.execPath, ['-e', child], { input: '', encoding: 'utf8', timeout: 60000, env: childEnv });
  assertSpawnDecided(r, 'requiring every lib module and hook');
  assert.deepStrictEqual([r.status, r.stderr, r.stdout], [0, '', '[]'], `requiring prints, spawns, and exits nothing: ${r.stdout} ${r.stderr}`);
  for (const n of libFiles) {
    assert.doesNotMatch(fs.readFileSync(path.join(plugin, 'lib', n), 'utf8'), /require\(['"]\.\.\/(?:scripts|hooks)\//, `lib/${n} requires no entry point`);
  }
}

// INV-0068: each hook run as a process acts. DIRECT holds one payload that the hook decides on, and a hook without an entry fails.
{
  const git = (args, cwd) => cp.execFileSync('git', args, { cwd, stdio: 'ignore' });
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-layout-')));
  process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
  const dir = (name) => { const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true }); return d; };
  const repoIn = (name) => {
    const d = dir(name);
    git(['init', '-q', '-b', 'main'], d);
    git(['config', 'user.email', 'test@example.com'], d);
    git(['config', 'user.name', 'test'], d);
    fs.writeFileSync(path.join(d, 'a.txt'), 'a\n');
    git(['add', '.'], d);
    git(['commit', '-q', '-m', 'base'], d);
    return d;
  };
  const ledger = (rows) => '# Ledger — demo\n\n**Stage:** implementing\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
    rows.map(([id, st]) => `| ${id} | #${id} | t | behavior | — | ${st} | — |`).join('\n') + '\n';
  const implementer = (extra) => ({ hook_event_name: 'PreToolUse', agent_id: 'a1', agent_type: 'superdev:implementer', session_id: 's', ...extra });

  // A repository holding a run root `s` with a slicetree `01` and a verification.md of two equal fences.
  const runRepo = repoIn('run-repo');
  const runRoot = path.join(runRepo, '.superdev', 'scopes', 's');
  const slicetree = path.join(runRoot, 'slicetrees', '01');
  fs.mkdirSync(path.join(slicetree, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(runRoot, 'ledger.md'), ledger([['01', 'in-progress']]));
  fs.writeFileSync(path.join(slicetree, 'docs', 'agents', 'verification.md'), '# Verification\n\n```sh\nnpm test\n```\n\n```sh\nnpm test\n```\n');

  const lockRoot = dir('lock-root');
  const lockDir = path.join(lockRoot, '.superdev', 'scopes', 'lk');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, 'run.lock'), 'locked');

  const pluginRoot = dir('plugin-root');
  fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'));
  fs.writeFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.0.1' }));
  const updateData = dir('update-data');

  const pruneRepo = repoIn('prune-repo');
  const pruneScope = path.join(pruneRepo, '.superdev', 'scopes', 'gone');
  fs.mkdirSync(pruneScope, { recursive: true });
  fs.writeFileSync(path.join(pruneScope, 'ledger.md'), '# ledger\n\n**Stage:** closed\n');
  const old = new Date(Date.now() - 365 * 24 * 3600 * 1000);
  fs.utimesSync(path.join(pruneScope, 'ledger.md'), old, old);

  const sweepRepo = repoIn('sweep-repo');
  fs.mkdirSync(path.join(sweepRepo, '.superdev', 'scopes', 'guard'), { recursive: true });
  fs.writeFileSync(path.join(sweepRepo, '.superdev', 'scopes', 'guard', 'ledger.md'), '# ledger\n\n**Branch:** scope/guard\n');
  git(['branch', 'scope/guard'], sweepRepo);
  const sweepTree = path.join(sweepRepo, '.superdev', 'scopes', 'guard', 'slicetrees', '1');
  git(['worktree', 'add', '-q', '-b', 'slice/guard/1', sweepTree], sweepRepo);
  fs.writeFileSync(path.join(sweepTree, 'w.txt'), 'y\n');
  git(['add', '.'], sweepTree);
  git(['commit', '-q', '-m', 'work'], sweepTree);
  const foldTree = path.join(tmp, 'fold');
  git(['worktree', 'add', '-q', foldTree, 'scope/guard'], sweepRepo);
  git(['merge', '--no-ff', '-q', '-m', 'merge slice', 'slice/guard/1'], foldTree);
  git(['worktree', 'remove', foldTree], sweepRepo);

  // Each entry: the payload, the env, and the check on the result and the world after the run.
  const DIRECT = {
    'ledger-guard.js': { input: { tool_input: { file_path: '.superdev/scopes/demo/ledger.md' } },
      check: (r) => { assert.strictEqual(r.status, 2, 'blocks a ledger edit'); assert.match(r.stderr, /scope\.js/); } },
    'merge-guard.js': { input: { agent_id: 'a1', tool_input: { command: 'git merge scope' } },
      check: (r) => { assert.strictEqual(r.status, 2, 'blocks a subagent merge'); assert.match(r.stderr, /subagents must not integrate/); } },
    'model-explicit.js': { input: { tool_name: 'Agent', tool_input: { subagent_type: 'implementer' } },
      check: (r) => { assert.strictEqual(r.status, 2, 'blocks a modelless dispatch'); assert.match(r.stderr, /must set an explicit model/); } },
    'run-lock.js': { input: { tool_input: { command: 'git worktree add .superdev/scopes/lk/scopetree x' }, cwd: lockRoot },
      check: (r) => { assert.strictEqual(r.status, 2, 'blocks on a fresh lock'); assert.match(r.stderr, /another session is running this scope/); } },
    'run-trace.js': { input: { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(slicetree, 'x.js') }, cwd: runRepo },
      check: (r) => { assert.strictEqual(r.status, 0); assert.match(fs.readFileSync(path.join(runRoot, 'trace.log'), 'utf8'), / 01 main edit impl x\.js/, 'records the edit'); } },
    'scope-prune.js': { input: { cwd: pruneRepo },
      check: (r) => { assert.strictEqual(r.status, 0); assert.ok(!fs.existsSync(pruneScope), 'prunes the gone, closed, stale scope'); } },
    'slicetree-sweep.js': { input: { cwd: sweepRepo },
      check: (r) => { assert.strictEqual(r.status, 0); assert.ok(!fs.existsSync(sweepTree), 'sweeps the merged-and-worked slice'); } },
    'test-guard.js': { input: implementer({ tool_name: 'Bash', cwd: slicetree, tool_input: { command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full' } }),
      check: (r) => { assert.strictEqual(r.status, 2, 'refuses a full run'); assert.match(r.stderr, /^superdev: refused/); } },
    'tree-guard.js': { input: implementer({ tool_name: 'Write', cwd: runRepo, tool_input: { file_path: path.join(runRepo, 'a.txt'), content: 'x' } }),
      check: (r) => { assert.strictEqual(r.status, 2, 'refuses a write into the main checkout'); } },
    'update-check.js': { input: {}, env: { CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_DATA: updateData, SUPERDEV_UPDATE_CHECK_REMOTE: 'https://127.0.0.1:1/plugin.json' },
      check: (r) => { assert.strictEqual(r.status, 0); assert.ok(fs.existsSync(path.join(updateData, '.update-check')), 'stamps the check'); } },
  };
  assert.deepStrictEqual(Object.keys(DIRECT).sort(), [...hookFiles].sort(), 'DIRECT names every hook under plugin/hooks/');
  for (const name of hookFiles) {
    const { input, env, check } = DIRECT[name];
    const r = cp.spawnSync(process.execPath, [path.join(plugin, 'hooks', name)], { input: JSON.stringify(input), encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env } });
    assertSpawnDecided(r, `spawning ${name} directly`);
    try { check(r); } catch (e) { e.message = `${name} run directly: ${e.message}\nstderr: ${r.stderr}`; throw e; }
  }
}
