// Bumps ".claude-plugin/plugin.json" version to argv[2]. Called by semantic-release
// (@semantic-release/exec prepareCmd) with the computed next version. marketplace.json
// carries no version field on purpose — plugin.json is the single source of truth.
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('usage: bump-version.mjs <version>');
  process.exit(1);
}

const f = '.claude-plugin/plugin.json';
const j = JSON.parse(readFileSync(f, 'utf8'));
j.version = version;
writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
console.log(`plugin.json → ${version}`);
