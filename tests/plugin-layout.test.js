'use strict';

// Suite for the shipped tree's layout (ADR 0151): the CommonJS anchor covers plugin/lib/, every entry point under
// plugin/hooks/ and plugin/scripts/ keeps the export names it had before its code moved to plugin/lib/, and a name it
// re-exports from a module is that module's own.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const plugin = path.join(__dirname, '..', 'plugin');

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
