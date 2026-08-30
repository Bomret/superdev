#!/usr/bin/env node
'use strict';

// opencode-fixtures: the golden-fixture half of the `opencode-render` drift check. Renders the
// shipped plugin tree (skills, agents, and the generated hook bridge) through
// plugin/scripts/adapter.js the way the check does
// — one fixed model map, and the plugin root normalised to the `<plugin-root>` placeholder so the
// committed fixtures carry no machine-local absolute path — and, run as `node
// scripts/drift/opencode-fixtures.js --write`, regenerates scripts/drift/fixtures/opencode/ from
// it. scripts/drift/scanners.js's scanOpencodeFixtures renders the same way into a temp dir and
// diffs, so a skills/agents edit that changes the render goes red until this regenerates the
// fixtures in the same commit.

const fs = require('node:fs');
const path = require('node:path');

const adapter = require('../../plugin/scripts/adapter.js');

// Where the golden render lives, relative to the repository root.
const FIXTURE_DIR = path.join('scripts', 'drift', 'fixtures', 'opencode');

// The placeholder the absolute plugin root renders as, so the fixtures are machine-independent.
const PLACEHOLDER = '<plugin-root>';

// The one model map the fixtures render with. A consumer passes its own --model-map; these values
// exist only to keep the golden render deterministic.
const FIXTURE_MODEL_MAP = new Map([
  ['haiku', 'anthropic/claude-haiku-4-5'],
  ['opus', 'anthropic/claude-opus-4-1'],
  ['sonnet', 'anthropic/claude-sonnet-4-5'],
]);

// renderNormalized(root, dest): the opencode render of root's plugin tree into dest, with the
// absolute plugin-root path replaced by PLACEHOLDER in every rendered file. Returns the sorted
// list of written paths, relative to dest. Both the drift check and the fixture regeneration below
// render through this one function, so the two can never drift on the model map or the
// normalisation.
function renderNormalized(root, dest) {
  const pluginRoot = path.join(root, 'plugin');
  const written = adapter.render({
    harness: 'opencode',
    pluginRoot,
    dest,
    modelMap: FIXTURE_MODEL_MAP,
  });
  for (const rel of written) {
    const full = path.join(dest, rel);
    fs.writeFileSync(full, fs.readFileSync(full, 'utf8').split(pluginRoot).join(PLACEHOLDER));
  }
  return written;
}

function main() {
  if (process.argv[2] !== '--write') {
    console.error('usage: node scripts/drift/opencode-fixtures.js --write');
    process.exit(1);
  }
  const root = path.join(__dirname, '..', '..');
  const dest = path.join(root, FIXTURE_DIR);
  fs.rmSync(dest, { recursive: true, force: true });
  const written = renderNormalized(root, dest);
  for (const rel of written) console.log(`rendered ${path.join(FIXTURE_DIR, rel).split(path.sep).join('/')}`);
}

if (require.main === module) {
  main();
}

module.exports = { FIXTURE_DIR, PLACEHOLDER, FIXTURE_MODEL_MAP, renderNormalized };
