'use strict';

// Suite for the run profile's unrecognized entries (INV-0101) and its CLI: config directory, exit codes, and a read-only run.

const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict.js');
const { profile } = require('../plugin/scripts/profile.js');
const { user, writeTree, enc, alphaTree, tmp, snapshot, SCRIPT, REPO } = require('./profile-setup.js');

// --- unrecognized entries (INV-0101) -------------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  const tree = alphaTree(REPO);
  tree[enc(REPO)].s1.entries.push({ type: 'assistant', cwd: REPO, message: { role: 'assistant', content: [] } }, '{not json');
  writeTree(dir, tree);
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.unrecognized.length, 2, 'an entry with no timestamp and a line that is no JSON are both reported');
  assert.equal(p.segments[0].times.wall, 170000, 'and neither is counted');

  const bad = path.join(tmp(), 'projects');
  writeTree(bad, { [enc(REPO)]: { s: { entries: [{ type: 'user', message: { content: '<command-name>/superdev:review</command-name>' } }] } } });
  assert.throws(() => profile({ projectsDir: bad, repoRoot: REPO, slug: 'alpha' }), /format not recognized/);
}

// --- the CLI: config dir, exit codes, and a read-only run ----------------------------------------
{
  const repo = tmp();
  const init = spawnSync('git', ['init', '-q', repo], { encoding: 'utf8', timeout: 30000 });
  assertSpawnDecided(init, 'git init');
  const home = tmp();
  const cfg = tmp();
  writeTree(path.join(cfg, 'projects'), alphaTree(repo));
  writeTree(path.join(home, '.claude', 'projects'), alphaTree(repo));

  const run = (args, env) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: repo, encoding: 'utf8', timeout: 30000, env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '', ...env },
    });
    assertSpawnDecided(r, `profile ${args.join(' ')}`);
    return r;
  };

  const before = snapshot(cfg);
  const viaCfg = run(['alpha'], { CLAUDE_CONFIG_DIR: cfg });
  assert.equal(viaCfg.status, 0, viaCfg.stderr);
  assert.match(viaCfg.stdout, /Run profile — alpha/);
  assert.match(viaCfg.stdout, new RegExp(path.join(cfg, 'projects').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'reads $CLAUDE_CONFIG_DIR/projects when set');
  assert.match(viaCfg.stdout, /implement/);
  assert.match(viaCfg.stdout, /tool times include approval waits/);
  assert.match(viaCfg.stdout, /unfinished/i);
  assert.deepEqual(snapshot(cfg), before, 'the transcript directory is byte-identical after a run');

  const viaHome = run([], {});
  assert.equal(viaHome.status, 0, viaHome.stderr);
  assert.match(viaHome.stdout, /Run profile — alpha/, 'no slug profiles the most recent scope and names it');
  assert.match(viaHome.stdout, new RegExp(path.join(home, '.claude', 'projects').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'reads ~/.claude/projects when unset');

  const noScope = run(['gamma'], { CLAUDE_CONFIG_DIR: cfg });
  assert.notEqual(noScope.status, 0);
  assert.match(noScope.stderr, /gamma/);
  assert.match(noScope.stderr, new RegExp(enc(repo)));
  assert.equal(noScope.stdout, '', 'no table');

  const empty = tmp();
  const noDir = run(['alpha'], { CLAUDE_CONFIG_DIR: empty });
  assert.notEqual(noDir.status, 0);
  assert.match(noDir.stderr, /alpha/);
  assert.match(noDir.stderr, new RegExp(path.join(empty, 'projects').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(noDir.stdout, '');
}
console.log('profile-cli.test.js ok');
