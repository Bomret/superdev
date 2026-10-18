'use strict';

// Suite for the run profile's phases view (ADR 0103): one row per chain segment, its time split, hooks, permission mode, and unfinished calls.

const assert = require('node:assert');
const path = require('node:path');
const { profile } = require('../plugin/scripts/profile.js');
const { result, hook, tmp, writeTree, alphaTree, REPO } = require('./profile-setup.js');

const root = tmp();
const projectsDir = path.join(root, 'projects');
writeTree(projectsDir, alphaTree(REPO));

// --- phases view ---------------------------------------------------------------------------------
{
  const p = profile({ projectsDir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.slug, 'alpha');
  assert.deepEqual(p.segments.map((s) => s.command), ['implement', 'review', 'review', 'document'],
    'one row per chain segment in time order: plan and the other scope are left out, a second review is its own row, and the scopetree session is included');

  for (const s of p.segments) {
    const t = s.times;
    assert.equal(t.subagent + t.tool + t.hook + t.model + t.human + t.idle, t.wall, `${s.command}: the split sums to wall-clock time`);
  }

  const [impl, rev1, rev2, doc] = p.segments;
  // The assistant's final text (130) and the Stop hook's own system entry (131) are consecutive turn
  // ends with nothing between them, so they collapse into one block. The Stop hook summary follows the
  // last real output, so the gap to the next typed prompt (160) starts there, at 131, a 29s gap — the
  // 1s between the text and the summary is the hook's own runtime, counted once, as hook time, instead
  // of also being folded into human wait.
  assert.deepEqual(impl.times, { wall: 170000, human: 59000, subagent: 65000, tool: 17000, hook: 3000, model: 26000, idle: 0 },
    'implement: ask 30s + a 29s between-turn gap is human wait, the Agent window is subagent time, and a PreToolUse hook comes out of tool time');
  assert.deepEqual(impl.hooks, { 'PreToolUse:Bash': 1000, Stop: 2000 }, 'hook time is summed per hook name');
  assert.deepEqual(rev1.times, { wall: 30000, human: 0, subagent: 0, tool: 10000, hook: 0, model: 20000, idle: 0 });
  assert.equal(rev2.times.wall, 20000, 'the second review runs to the next superdev command');
  assert.equal(doc.times.tool, 5000);

  // human wait (INV-0102)
  assert.equal(rev1.promptingMode, 'default', 'a segment in a prompting permission mode names it');
  assert.equal(impl.promptingMode, null, 'an auto segment carries no notice');

  // unfinished calls (INV-0103)
  assert.deepEqual(p.unfinished.map((u) => [u.segment, u.tool]), [[1, 'Bash']], 'the call with no result is listed, by tool');
  assert.equal(rev1.times.tool, 10000, 'the unfinished call adds nothing to tool time');

  assert.deepEqual(p.unrecognized, []);
}
console.log('profile-phases.test.js ok');
