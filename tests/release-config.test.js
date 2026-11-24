'use strict';
// release-config.test.js: release.config.cjs — the version and marketplace ref
// rewrites, the breaking-change rule, and the release assets. The config loads in a child process,
// so this process's environment is never touched. semantic-release itself is not run.

const { test } = require('node:test');
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

const { replacements } = plugin('semantic-release-replace-plugin');
const version = (j) => [`"version": "${j.version}"`];
test('version and marketplace ref rewrites on the real files', () => {
  for (const [i, file, current, expected] of [
    [0, 'plugin/.claude-plugin/plugin.json', version, '"version": "9.8.7"'],
    [1, 'mods/superdev-view/.claude-plugin/plugin.json', version, '"version": "9.8.7"'],
    [2, '.claude-plugin/marketplace.json', (j) => j.plugins.map((p) => `"ref": "${p.source.ref}"`), '"ref": "v9.8.7"'],
  ]) {
    const r = replacements[i];
    assert.deepStrictEqual(r.files, [file], `replacement ${i} targets ${file}`);
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const matches = text.match(new RegExp(r.from, 'gm')) || [];
    // the matches are exactly the current fields, so the pattern cannot over-match
    const fields = current(JSON.parse(text));
    assert.deepStrictEqual(matches, fields, `${file}: the pattern matches exactly the current fields`);
    // the release fails unless every field is rewritten, so the expected counts follow the file
    assert.deepStrictEqual(r.results, [{ file, hasChanged: true, numMatches: fields.length, numReplacements: fields.length }],
      `${file}: the expected rewrite count`);
    assert.strictEqual(r.to.replace('${nextRelease.version}', '9.8.7'), expected, `${file}: the replacement text`);
  }
});

test('a breaking change gives a minor bump', () => {
  assert.deepStrictEqual(plugin('@semantic-release/commit-analyzer').releaseRules, [{ breaking: true, release: 'minor' }]);
});

// The literal targets pinned above are the independent check, so a target changed without the matching asset change
// fails here.
test('the release commit\'s assets: every file the release rewrites, plus the changelog, as a set.', () => {
  assert.deepStrictEqual(
    [...plugin('@semantic-release/git').assets].sort(),
    [...new Set(['CHANGELOG.md', ...replacements.flatMap((r) => r.files)])].sort(),
    'the git assets are the replacement targets and the changelog'
  );
});

