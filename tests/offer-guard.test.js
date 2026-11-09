'use strict';

// Suite for plugin/hooks/offer-guard.js (ADR 0213, INV-0183). Drives the shipped hook through stdin only; each case
// points TMPDIR at a directory of its own, so the marker directory the hook builds under os.tmpdir() is the case's own.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict.js');

const HOOK = path.join(__dirname, '..', 'plugin', 'hooks', 'offer-guard.js');
const MARKER_DIR = process.getuid ? `superdev-offer-guard-${process.getuid()}` : 'superdev-offer-guard';

function run(tmp, input) {
  const r = spawnSync('node', [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp },
    encoding: 'utf8',
    timeout: 10000,
  });
  assertSpawnDecided(r, 'offer-guard');
  return r;
}
const freshTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'offer-guard-test-'));
const ids = { session_id: 'sess-1', prompt_id: 'prompt-1' };

const card = (prompt) => ({
  ...ids, hook_event_name: 'PostToolUse', tool_name: 'mcp__ccd_session__start_session',
  tool_input: { title: 'Review', prompt },
});
const ask = (labels) => ({
  ...ids, hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion',
  tool_input: { questions: [{ question: 'Next?', header: 'Next', options: labels.map((label) => ({ label, description: 'd' })) }] },
});
const stop = (msg, extra = {}) => ({ ...ids, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: msg, ...extra });

const next = (cmd, pre = '', post = '') =>
  `Done.\n\n### Next\n\n${pre}\`\`\`\n${cmd}\n\`\`\`\n\nReviews the scope.\n${post}`;
const MARK = 'A superdev offer started this session.';

function blocked(r) {
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.decision, 'block');
  return out.reason;
}
function passed(r, label) {
  assert.equal(r.status, 0, label);
  assert.equal(r.stdout, '', label);
}

// A single-command Next block with no offer is held, the reason naming the offer and its exceptions.
{
  const tmp = freshTmp();
  const reason = blocked(run(tmp, stop(next('/superdev:review offer-guard'))));
  assert.match(reason, /## The offer/);
  assert.match(reason, /precedence/);
  assert.match(reason, /offer call is the closing's first action, before the wrap-up call/);
  for (const w of ['unattended', 'chained', 'same skill', 'step', 'refused', "an exit where the skill's own offer conditions make no offer"])
    assert.match(reason, new RegExp(w), w);
}

// An offer card with the marker line, or a Start option, lets the Next block stop; markers end at Stop.
{
  const tmp = freshTmp();
  passed(run(tmp, card(`/superdev:review offer-guard\n${MARK}\nBackground…`)), 'card post');
  passed(run(tmp, stop(next('/superdev:review offer-guard'))), 'card offer passes');
  blocked(run(tmp, stop(next('/superdev:review offer-guard'))));
}
{
  const tmp = freshTmp();
  passed(run(tmp, ask(['Start /superdev:review offer-guard', 'Stop here'])), 'ask post');
  passed(run(tmp, stop(next('/superdev:review offer-guard'))), 'ask offer passes');
}

// An offer is scoped to its session and turn.
{
  const tmp = freshTmp();
  run(tmp, card(`/superdev:review offer-guard\n${MARK}`));
  blocked(run(tmp, stop(next('/superdev:review offer-guard'), { prompt_id: 'prompt-2' })));
}

// An offer for one command does not pass a Next block naming another.
{
  const tmp = freshTmp();
  run(tmp, card(`/superdev:review offer-guard\n${MARK}`));
  blocked(run(tmp, stop(next('/superdev:document offer-guard'))));
}

// Calls that are no offer write no marker.
{
  const tmp = freshTmp();
  run(tmp, card('/superdev:review offer-guard\nSomething else.'));
  run(tmp, ask(['Review it', 'Stop here']));
  blocked(run(tmp, stop(next('/superdev:review offer-guard'))));
}

// Next blocks that are never held.
{
  const tmp = freshTmp();
  passed(run(tmp, stop('Done.\n\n### Next\n\nNothing. Scope `x` is closed.\n')), 'no fence');
  passed(run(tmp, stop(next('/superdev:review a\n/superdev:document a'))), 'two commands');
  passed(run(tmp, stop(next('/superdev:review a', 'Blocked: the suite is red.\n\n'))), 'Blocked');
  passed(run(tmp, stop(next('/superdev:ship a', 'First: approve the PR.\n\n'))), 'First');
  passed(run(tmp, stop('Example:\n\n````\n### Next\n\n```\n/superdev:review a\n```\n````\n')), 'quoted Next');
  passed(run(tmp, stop('No Next block here.')), 'no Next');
  blocked(run(tmp, stop(next('/superdev:review a', '', '\nOr: `/superdev:document a` — docs first.\n'))));
}

// A message with no Next heading that still names one next command is held: a lone command fence, or a `/superdev:` code
// span on a line that says "next". Commands in prose without "next", and two different commands, are not held.
{
  const tmp = freshTmp();
  blocked(run(tmp, stop('Reviewed.\n\nTo open the PR, run this:\n```\n/superdev:submit-pr a\n```\n')));
  blocked(run(tmp, stop('Done.\n\nNext would be `/superdev:submit-pr` to open the PR. I start it only if you ask.')));
  passed(run(tmp, stop('The hook reads `/superdev:review` output.')), 'prose span');
  passed(run(tmp, stop('Run in order:\n```\n/superdev:ship a\n```\n```\n/superdev:publish-kb a\n```\n')), 'two fences');
  passed(run(tmp, stop('Example:\n```\n/superdev:review a\n/superdev:document a\n```\n')), 'two-line fence');
  run(tmp, card(`/superdev:submit-pr a\n${MARK}`));
  passed(run(tmp, stop('Next would be `/superdev:submit-pr a`.')), 'headless offered');
}

// An unattended run's Next block is held once: the Stop input carries no posture, so the hook cannot tell it apart.
{
  const tmp = freshTmp();
  blocked(run(tmp, stop(next('/superdev:review a --unattended'))));
  passed(run(tmp, stop(next('/superdev:review a --unattended'), { stop_hook_active: true })), 'unattended second stop');
}

// A Stop removes markers older than one day, whichever turn wrote them; a fresh marker of another turn stays.
{
  const tmp = freshTmp();
  run(tmp, card(`/superdev:review a\n${MARK}`));
  run(tmp, { ...card(`/superdev:review a\n${MARK}`), prompt_id: 'prompt-fresh' });
  const dir = path.join(tmp, MARKER_DIR);
  const old = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(path.join(dir, 'sess-1.prompt-1.review'), old, old);
  run(tmp, stop(next('/superdev:review a'), { prompt_id: 'prompt-other' }));
  assert.deepEqual(fs.readdirSync(dir), ['sess-1.prompt-fresh.review'], 'stale marker removed');
}

// A held turn that stops again ends.
passed(run(freshTmp(), stop(next('/superdev:review a'), { stop_hook_active: true })), 'stop_hook_active');

// Malformed or missing input passes silently.
{
  const tmp = freshTmp();
  passed(run(tmp, 'not json'), 'malformed');
  passed(run(tmp, ''), 'empty');
  passed(run(tmp, { hook_event_name: 'Stop', last_assistant_message: next('/superdev:review a') }), 'no ids');
  passed(run(tmp, stop(42)), 'non-string message');
  passed(run(tmp, { ...ids, hook_event_name: 'Stop', stop_hook_active: false }), 'no message');
  passed(run(tmp, { ...ids, hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion' }), 'no tool_input');
  passed(run(tmp, stop(next('/superdev:review a'), { session_id: '../x' })), 'bad id charset');
}

// An unwritable temporary directory passes silently.
passed(run(path.join(freshTmp(), 'missing', 'deeper'), card(`/superdev:review a\n${MARK}`)), 'unwritable tmp');

// A foreign or symlinked marker directory is never used; a symlink at the marker path is never written through.
if (process.getuid) {
  const tmp = freshTmp();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-guard-elsewhere-'));
  fs.symlinkSync(elsewhere, path.join(tmp, MARKER_DIR));
  passed(run(tmp, card(`/superdev:review a\n${MARK}`)), 'symlinked dir post');
  assert.deepEqual(fs.readdirSync(elsewhere), [], 'nothing written through the symlinked directory');
  blocked(run(tmp, stop(next('/superdev:review a'))));
}
{
  const tmp = freshTmp();
  fs.mkdirSync(path.join(tmp, MARKER_DIR), { mode: 0o700 });
  run(tmp, card(`/superdev:review a\n${MARK}`));
  const [marker] = fs.readdirSync(path.join(tmp, MARKER_DIR));
  assert.ok(marker, 'a marker was written');
  const target = path.join(tmp, 'target');
  fs.writeFileSync(target, 'untouched');
  fs.rmSync(path.join(tmp, MARKER_DIR, marker));
  fs.symlinkSync(target, path.join(tmp, MARKER_DIR, marker));
  passed(run(tmp, card(`/superdev:review a\n${MARK}`)), 'symlinked marker post');
  assert.equal(fs.readFileSync(target, 'utf8'), 'untouched', 'never written through the symlink');
}

console.log('offer-guard tests ok');
