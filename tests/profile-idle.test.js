'use strict';

// Suite for human wait and idle (INV-0102): which gaps between turns count as human wait or idle, and where the walk-back from a closing entry stops.

const assert = require('node:assert');
const path = require('node:path');
const { profile } = require('../plugin/scripts/profile.js');
const { ts, user, cmd, use, result, say, interrupt, peerWake, synthetic, metaResume, think, imagePrompt, compactSummary, hook, stopHooks, writeTree, enc, tmp, REPO } = require('./profile-setup.js');

// --- idle: a turn end followed by a cross-session wake with nothing running is idle time, kept out
// of human wait and every machine total -----------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // the turn ends idle, nothing running
    peerWake(65, REPO), // a peer session wakes it 60s later
    say(70, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.idle, 60000, 'the gap from the turn end to the peer wake, with nothing running, is idle');
  assert.equal(p.segments[0].times.human, 0, 'a peer wake is not a typed prompt, so it starts no human wait');
}

// --- idle: a subagent running over the same gap keeps it subagent time, not idle ------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    say(10, REPO), // the turn ends idle, waiting on the background dispatch
    peerWake(65, REPO), // a peer session wakes it while the dispatch is still running
    say(70, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(65, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.subagent, 59000, 'the gap the background subagent ran through stays subagent time');
  assert.equal(p.segments[0].times.idle, 0, 'nothing is left over for idle once the subagent interval covers the gap');
}

// --- idle: a turn end followed by a typed prompt still gives human wait, not idle -----
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    user(45, REPO, 'go on'),
    say(50, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 40000, 'a typed prompt still ends the gap as human wait');
  assert.equal(p.segments[0].times.idle, 0, 'and none of it is idle');
}

// --- an image-only prompt the operator pastes is a typed prompt, not idle -------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    imagePrompt(50, REPO),
    say(55, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 45000, 'an image-only prompt with no text of its own is still a typed prompt, so the gap to it is human wait');
  assert.equal(p.segments[0].times.idle, 0);
}

// --- a compact summary is never a typed prompt; the harness injects it, so the walk-back looks
// straight past it to whatever really closes the gap -----------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    compactSummary(50, REPO, 'This session is being continued from a previous conversation...'),
    user(90, REPO, 'go on'),
    say(95, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 85000,
    'the compact summary is filler, not the entry that closes the gap; the whole gap to the next typed prompt is human wait, from the turn end (5)');
  assert.equal(p.segments[0].times.idle, 0);
}


// --- a task-notification landing as a `user` entry is not a typed prompt, so the idle gap it ends
// stays subagent time, never human wait (INV-0102) --------------------------------------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    say(10, REPO), // the turn ends idle, waiting on the background dispatch
    user(70, REPO, '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>500</subagent_tokens><tool_uses>4</tool_uses><duration_ms>60000</duration_ms></usage>\n</task-notification>'),
    say(75, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(65, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 0, 'the notification is harness-injected, not a typed prompt, so it starts no human wait');
  assert.equal(p.segments[0].times.subagent, 59000, 'the gap the background subagent ran through stays subagent time instead');
}

// --- a local command's own echoed stdout is also never a typed prompt ------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    user(60, REPO, '<local-command-stdout>Set model to `claude-opus-5[1m]`</local-command-stdout>'),
    say(65, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 0, 'a local command\'s own echoed output is harness-injected, not an operator prompt');
}

// --- the idle gap before a typed prompt is measured from the last real turn end, walking back over
// a caveat, a Stop hook attachment, or a SessionStart context attachment the harness inserts ahead of
// the prompt (INV-0102) ----------------------------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // the turn ends here; everything below is harness filler before the next typed prompt
    hook(30, REPO, 'Stop', 'Stop', 500),
    user(60, REPO, '<local-command-caveat>Caveat: …</local-command-caveat>', { isMeta: true }),
    cmd(65, REPO, 'review', 'feat/alpha'),
    say(70, REPO),
    hook(90, REPO, 'SessionStart', 'SessionStart', 200), // a resume's hook_additional_context attachment
    cmd(95, REPO, 'document', 'feat/alpha'),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 60000,
    'the caveat and the Stop hook attachment are filler, not the entry the idle gap ends at — the gap is measured back to the turn end');
  assert.equal(p.segments[1].times.human, 25000,
    'a SessionStart hook_additional_context attachment on resume is filler too');
}

// --- an interrupt is a turn end, not a typed prompt: the gap from it to the next typed prompt is
// human wait, never leaked into model time ---------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // a real turn end
    use(10, REPO, 'b1', 'Bash', { command: 'sleep 999' }), // interrupted mid-call, no tool_result
    interrupt(15, REPO),
    user(45, REPO, 'continue'), // the next typed prompt, 30s after the interrupt
    say(50, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 30000,
    'the interrupt ends the turn; the gap from it to the next typed prompt is human wait, not model time');
}

// --- the walk-back stops at the block's last real, non-synthetic assistant entry: a thinking entry
// followed by the model's real final text, then a typed prompt gives a gap that starts at the text
// entry, not the earlier thinking entry -----------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    think(5, REPO, 'reasoning...'),
    say(8, REPO), // the model's real, final output for the turn
    user(40, REPO, 'go on'),
    say(45, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 32000,
    'the gap to the next typed prompt runs from the last real assistant entry (8), not the earlier thinking entry (5) — the 3s from thinking to text stays model time');
}

// --- the walk-back also stops at an interrupt entry: a real assistant entry still streaming when the
// operator cuts it off, then the interrupt, then the next typed prompt gives a gap that starts at the
// interrupt — the machine's generation time up to the interrupt stays model time, not human wait
//  ------------------------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    think(5, REPO, 'reasoning, still streaming...'), // the model was mid-generation when interrupted
    interrupt(15, REPO),
    user(45, REPO, 'continue'),
    say(50, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 30000,
    'the gap runs from the interrupt (15), where machine work stopped, not from the earlier thinking entry (5) — the 10s the model spent generating before the interrupt stays out of human wait');
}

// --- a Stop hook summary that follows the block's last real output moves the gap's start to the
// summary itself, so the hook's own runtime is counted once, as hook time, never also as human wait
//  ------------------------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // the model's real, final output for the turn
    stopHooks(6, REPO, 1000), // the Stop hook runs between the turn's end and this summary
    user(40, REPO, 'go on'),
    say(45, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 34000,
    'the gap starts at the Stop hook summary (6), not the turn end before it (5) — the hook\'s own second stays out of human wait');
  assert.equal(p.segments[0].times.hook, 1000, 'the Stop hook\'s own duration still counts, as hook time');
}

// --- a variant interrupt message ("… for tool use") is recognized the same way ----------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    use(10, REPO, 'b1', 'Bash', { command: 'sleep 999' }),
    interrupt(15, REPO, '[Request interrupted by user for tool use]'),
    user(20, REPO, 'continue'),
    say(25, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 5000, 'the "for tool use" variant is recognized as an interrupt too');
}

// --- a rate-limit or spend-limit resume gives idle: a synthetic assistant entry ends the turn, and the
// isMeta "Continue from where you left off." note that lands hours later is not a typed prompt — the
// one general rule replaces limit-reset resume behavior ------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    synthetic(10, REPO, "You've hit your org's monthly spend limit · your session limit resets 2:10am"),
    metaResume(14410, REPO, 'Continue from where you left off.'), // 4 hours later
    say(14415, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.idle, 14405000,
    'the synthetic limit notice is a turn end, consecutive with the real turn end before it; the plain-text resumption note is not a typed prompt, so the whole limit-reset gap — measured from the block\'s earliest entry — is idle');
  assert.equal(p.segments[0].times.human, 0);
}

// --- an interrupt, then a synthetic "No response requested." entry, then a typed retry: both are turn
// ends and collapse into one block, so the whole gap is human wait, measured from the interrupt, not
// merely from the synthetic entry closest to the retry ---------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    use(10, REPO, 'b1', 'Bash', { command: 'sleep 999' }),
    interrupt(15, REPO),
    synthetic(42735, REPO, 'No response requested.'), // 11h52m after the interrupt
    user(42740, REPO, 'retry'),
    say(42745, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 42725000,
    'the interrupt and the synthetic entry are both turn ends and collapse into one block; the typed retry closes the whole gap as human wait, from the interrupt');
  assert.equal(p.segments[0].times.idle, 0);
}

// --- a task-notification wake ending an otherwise uncovered gap gives idle, the way a peer message
// does — anything that is not a typed prompt is idle --
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // the turn ends idle, nothing running
    {
      type: 'attachment', timestamp: ts(65), cwd: REPO,
      attachment: {
        type: 'queued_command', commandMode: 'task-notification',
        prompt: '<task-notification>\n<task-id>ag9</task-id>\n<tool-use-id>zzz</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>10</subagent_tokens><tool_uses>1</tool_uses><duration_ms>1000</duration_ms></usage>\n</task-notification>',
        usage: { totalTokens: 10, toolUses: 1, durationMs: 1000 },
      },
    }, // no matching dispatch — nothing else is running, so this wake covers no subagent interval
    say(70, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.idle, 60000, 'the task-notification wake ends the uncovered gap as idle, not human wait');
  assert.equal(p.segments[0].times.human, 0);
}
console.log('profile-idle.test.js ok');
