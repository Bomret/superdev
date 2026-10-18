'use strict';

// Suite for the run profile's dispatches: how a dispatch's duration, tool count, tokens, and status are read (INV-0101).

const assert = require('node:assert');
const path = require('node:path');
const { profile, render } = require('../plugin/scripts/profile.js');
const { ts, user, cmd, use, result, say, hook, writeTree, enc, tmp, REPO } = require('./profile-setup.js');

// --- background dispatches read duration, tool count and tokens from the task-notification --------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    // an async launch returns at once, with no totalDurationMs.
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    // the task-notification arrives later, carrying the real figures, keyed by tool-use id.
    {
      type: 'attachment', timestamp: ts(120), cwd: REPO,
      attachment: {
        type: 'queued_command', commandMode: 'task-notification',
        prompt: '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>1200</subagent_tokens><tool_uses>7</tool_uses><duration_ms>65000</duration_ms></usage>\n</task-notification>',
        usage: { totalTokens: 1200, toolUses: 7, durationMs: 65000 },
      },
    },
    say(125, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(60, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.toolUses, d.tokens]), [[65000, 7, 1200]],
    'an async dispatch reads its duration, tool count and tokens off the task-notification usage block');
  assert.deepEqual(p.unrecognized, [], 'a notified async dispatch is not unrecognized');
}

// --- a background dispatch's figures also come off the text-only `<usage>` block, an attachment's
// own `prompt` with no structured `attachment.usage` field (Claude Code 2.1.251–2.1.278) -----------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    {
      type: 'attachment', timestamp: ts(120), cwd: REPO,
      attachment: {
        type: 'queued_command', commandMode: 'task-notification',
        prompt: '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>1200</subagent_tokens><tool_uses>7</tool_uses><duration_ms>65000</duration_ms></usage>\n</task-notification>',
        // no structured `usage` field — this build only ever put the figures in `prompt` text.
      },
    },
    say(125, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(60, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.toolUses, d.tokens]), [[65000, 7, 1200]],
    'a text-only attachment.prompt notification is parsed for duration, tool count and tokens too');
  assert.deepEqual(p.unrecognized, [], 'a notified async dispatch is not unrecognized');
}

// --- a background dispatch's figures also come off a `user`-entry notification's own text (current,
// including 2.1.283) -------------------------------------------------------------------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    user(120, REPO, '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>1200</subagent_tokens><tool_uses>7</tool_uses><duration_ms>65000</duration_ms></usage>\n</task-notification>'),
    say(125, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(60, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.toolUses, d.tokens]), [[65000, 7, 1200]],
    'a user-entry task-notification is parsed for duration, tool count and tokens too');
  assert.deepEqual(p.unrecognized, [], 'a notified async dispatch is not unrecognized');
}


// --- an async dispatch whose notification never arrived is not yet notified, never zero (INV-0101),
// and is not reported as a format problem -------------------------------------------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    say(10, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(9, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending]), [[null, true]], 'no notification means no duration, never zero, but marked pending — still running, not a format problem');
  assert.deepEqual(p.unrecognized, [], 'a dispatch still awaiting its notification is not reported unrecognized');
  assert.match(render(p), /not yet notified/, 'the report names it as not yet notified');
}

// --- a failed or killed background dispatch's notification carries a status and no usage — it is
// reported by that status, never as "not yet notified" and never as a zero duration (INV-0101) ------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    user(30, REPO, '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>failed</status>\n<summary>Agent failed: an API error</summary>\n</task-notification>'),
    say(35, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(9, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending, d.status]), [[null, false, 'failed']],
    'a failed notification carries no duration or usage, but is recorded by its status, not marked pending');
  assert.deepEqual(p.unrecognized, [], 'a failed notification is a real result, not a format problem');
  assert.match(render(p), /: failed,/, 'the report shows the failed status in place of a duration');
}

// --- a killed background dispatch's notification is reported by that status too, the same way a
// failed one is -------------------------------------------------------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    user(30, REPO, '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>killed</status>\n<summary>Agent killed: exceeded its turn budget</summary>\n</task-notification>'),
    say(35, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(9, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending, d.status]), [[null, false, 'killed']],
    'a killed notification carries no duration or usage, but is recorded by its status, not marked pending');
  assert.deepEqual(p.unrecognized, [], 'a killed notification is a real result, not a format problem');
  assert.match(render(p), /: killed,/, 'the report shows the killed status in place of a duration');
}

// --- a dispatch rejected at the permission prompt reports as rejected, the way failed and killed
// are reported: no duration, not zero, and not unrecognized --------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: 'User rejected tool use' }),
    say(10, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending, d.status]), [[null, false, 'rejected']],
    'a rejected dispatch carries no duration and no usage, but is recorded by its own status, never zero');
  assert.deepEqual(p.unrecognized, [], 'a rejected dispatch is a real result, not a format problem');
  assert.match(render(p), /: rejected,/, 'the report shows the rejected status in place of a duration');
  assert.equal(p.segments[0].times.human, 1000,
    "a rejected dispatch's window (tool_use to the rejection) is the operator deciding at the permission prompt, so it counts as human wait");
  assert.equal(p.segments[0].times.subagent, 0, 'and none of it is subagent time');
}

// --- a dispatch denied by the auto-mode classifier, or blocked by a PreToolUse:Agent hook, reports by
// that status too — no duration, not zero, not unrecognized — and its window stays machine time, since
// it is the classifier or a hook deciding, not the operator (, item 3) --------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Review slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: 'Error: Permission for this action was denied by the Claude Code auto mode classifier. Reason: Blocked by classifier.' }),
    use(8, REPO, 'a2', 'Agent', { description: 'Review slice 02' }),
    result(9, REPO, 'a2', { toolUseResult: 'Error: PreToolUse:Agent hook error: [node "model-explicit.js"]: superdev: dispatch to "superdev:final-reviewer" must set an explicit model.' }),
    say(15, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending, d.status]), [[null, false, 'denied'], [null, false, 'blocked']],
    'a classifier denial and a hook block each carry no duration or usage, but are recorded by their own status, never zero and never unrecognized');
  assert.deepEqual(p.unrecognized, []);
  assert.match(render(p), /: denied,/, 'the report shows the denied status in place of a duration');
  assert.match(render(p), /: blocked,/, 'the report shows the blocked status in place of a duration');
  assert.equal(p.segments[0].times.subagent, 2000,
    'a denied or blocked dispatch is the classifier or a hook, not the operator, so its window stays machine time');
  assert.equal(p.segments[0].times.human, 0);
}

// --- a genuinely malformed synchronous result (no isAsync marker) is still a format problem -----
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Review slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { totalToolUseCount: 2 } }),
    say(10, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:slice-reviewer', description: 'Review slice 01', toolUseId: 'a1' },
    entries: [user(6, SLICE, 'go'), say(9, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending]), [[null, false]], 'a returned, non-async result missing totalDurationMs is not pending');
  assert.ok(p.unrecognized.some((u) => /totalDurationMs/.test(u.reason)), 'so it is still reported unrecognized');
}
console.log('profile-dispatches.test.js ok');
