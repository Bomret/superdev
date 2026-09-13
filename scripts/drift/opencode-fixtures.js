#!/usr/bin/env node
'use strict';

// opencode-fixtures: the golden-fixture half of the `opencode-render` drift check. Renders the
// shipped plugin tree (skills, agents, and the generated hook bridge) through
// plugin/scripts/adapter.js the way the check does
// — one fixed model map, and the plugin root normalised to the `<plugin-root>` placeholder so the
// committed fixtures carry no machine-local absolute path — and, run as `node
// scripts/drift/opencode-fixtures.js --write`, regenerates scripts/drift/fixtures/opencode/ from
// it. A file whose render is line-aligned with its source is committed as a Render overlay
// (opencode-overlay.js, ADR 0060) instead of the raw render; scripts/drift/scanners.js's
// scanOpencodeFixtures renders the same way into a temp dir, computes the same overlay, and
// compares — so a skills/agents/adapter edit that changes the render goes red until this
// regenerates the fixtures in the same commit.

const fs = require('node:fs');
const path = require('node:path');

const adapter = require('../../plugin/scripts/adapter.js');
const overlay = require('./opencode-overlay');

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

// regenerateFixtures(root, dest): renders root's plugin tree into dest the way renderNormalized
// does, then replaces every written file that has a line-aligned source (ADR 0060) with its
// serialized Render overlay in place — same relative path, overlay content instead of the raw
// render. A file with no such source (the afk command, the hook bridge, the synthesized upgrade
// skill) keeps its raw rendered content, unchanged. Refuses, naming the file, when a would-be
// overlay source has stopped rendering line-aligned — the maintainer's recovery is
// `opencode-overlay.js`'s `WHOLE_BODY_SKILL_NAMES`, not a silent fallback here.
function regenerateFixtures(root, dest) {
  const pluginDir = path.join(root, 'plugin');
  const written = renderNormalized(root, dest);
  for (const rel of written) {
    const srcPath = overlay.sourceForRendered(pluginDir, rel);
    if (!srcPath) continue;
    const renderedText = fs.readFileSync(path.join(dest, rel), 'utf8');
    const sourceText = fs.readFileSync(srcPath, 'utf8');
    const result = overlay.computeOverlay(sourceText, renderedText);
    if (!result.ok) {
      throw Object.assign(
        new Error(
          `${rel} no longer renders line-aligned with ${path.relative(root, srcPath).split(path.sep).join('/')} ` +
            `(${result.reason}) — add its name to opencode-overlay.js's WHOLE_BODY_SKILL_NAMES before regenerating`,
        ),
        { isRefusal: true },
      );
    }
    const sourceRel = path.relative(pluginDir, srcPath).split(path.sep).join('/');
    fs.writeFileSync(path.join(dest, rel), overlay.serializeOverlay(sourceRel, result.overlay));
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
  try {
    const written = regenerateFixtures(root, dest);
    for (const rel of written) console.log(`rendered ${path.join(FIXTURE_DIR, rel).split(path.sep).join('/')}`);
  } catch (e) {
    if (e.isRefusal) {
      console.error(`opencode-fixtures: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

if (require.main === module) {
  main();
}

module.exports = { FIXTURE_DIR, PLACEHOLDER, FIXTURE_MODEL_MAP, renderNormalized, regenerateFixtures };
