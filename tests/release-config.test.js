'use strict';
// release-config.test.js: release.config.cjs — the version and marketplace ref
// rewrites, the breaking-change rule, and the release assets. The config loads in a child process,
// so this process's environment is never touched. semantic-release itself is not run.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');

const root = path.join(__dirname, '..');
const configPath = path.join(root, 'release.config.cjs');

// Loads the config in a child with exactly `env` and returns { config }.
function load(env) {
  const code = `const c = require(${JSON.stringify(configPath)});
    process.stdout.write(JSON.stringify({ config: c }))`;
  const r = spawnSync(process.execPath, ['-e', code], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 30000 });
  assertSpawnDecided(r, 'release.config.cjs load');
  assert.strictEqual(r.status, 0, 'the config loads');
  return JSON.parse(r.stdout);
}

const base = load({});
const plugin = (name) => base.config.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === name)[1];

// version and marketplace ref rewrites on the real files
const { replacements } = plugin('semantic-release-replace-plugin');
for (const [i, file, current, expected] of [
  [0, 'plugin/.claude-plugin/plugin.json', (j) => `"version": "${j.version}"`, '"version": "9.8.7"'],
  [1, '.claude-plugin/marketplace.json', (j) => `"ref": "${j.plugins[0].source.ref}"`, '"ref": "v9.8.7"'],
]) {
  const r = replacements[i];
  assert.deepStrictEqual(r.files, [file], `replacement ${i} targets ${file}`);
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const matches = text.match(new RegExp(r.from, 'gm')) || [];
  // the match is exactly the current field text, so the pattern cannot over-match
  assert.deepStrictEqual(matches, [current(JSON.parse(text))], `${file}: the pattern matches exactly the current field`);
  assert.strictEqual(r.to.replace('${nextRelease.version}', '9.8.7'), expected, `${file}: the replacement text`);
}

// a breaking change gives a minor bump
assert.deepStrictEqual(plugin('@semantic-release/commit-analyzer').releaseRules, [{ breaking: true, release: 'minor' }]);

// the release commit's assets
assert.deepStrictEqual(
  plugin('@semantic-release/git').assets,
  ['CHANGELOG.md', 'plugin/.claude-plugin/plugin.json', '.claude-plugin/marketplace.json'],
  'the git assets'
);

console.log('release-config: ok');
