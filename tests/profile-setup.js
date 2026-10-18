'use strict';

// profile-setup.js — the synthetic Claude Code transcript builders and temp-tree helpers every
// profile suite shares. Each fixture is a transcript tree written to a temp dir, so each timing in a
// suite is exact by construction.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = require.resolve('../plugin/scripts/profile.js');

const T0 = Date.parse('2026-09-28T10:00:00.000Z');
const ts = (s) => new Date(T0 + s * 1000).toISOString();

// --- transcript entry builders -----------------------------------------------------------------
const user = (s, cwd, content, extra = {}) =>
  ({ type: 'user', timestamp: ts(s), cwd, permissionMode: 'auto', message: { role: 'user', content }, ...extra });
const cmd = (s, cwd, name, args, extra) =>
  user(s, cwd, `<command-message>superdev:${name}</command-message>\n<command-name>/superdev:${name}</command-name>\n<command-args>${args}</command-args>`, extra);
const use = (s, cwd, id, name, input = {}) =>
  ({ type: 'assistant', timestamp: ts(s), cwd, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const result = (s, cwd, id, extra) =>
  user(s, cwd, [{ type: 'tool_result', tool_use_id: id, content: 'ok' }], extra);
const say = (s, cwd) =>
  ({ type: 'assistant', timestamp: ts(s), cwd, message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } });
const interrupt = (s, cwd, text = '[Request interrupted by user]') =>
  user(s, cwd, [{ type: 'text', text }]);
const peerWake = (s, cwd) =>
  user(s, cwd, [{ type: 'text', text: 'Another Claude session sent a message: go on' }],
    { isMeta: true, origin: { kind: 'peer' } });
// A synthetic assistant entry — Claude Code's own stand-in message, never a real model turn — with no
// tool_use, so it is a turn end on that ground alone too.
const synthetic = (s, cwd, txt) =>
  ({ type: 'assistant', timestamp: ts(s), cwd, message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: txt }] } });
// A plain-text isMeta continuation note the harness inserts on resume, never wrapped in a tag.
const metaResume = (s, cwd, txt) => user(s, cwd, [{ type: 'text', text: txt }], { isMeta: true });
// An assistant "thinking" entry: a real, non-synthetic assistant entry that carries no final text.
const think = (s, cwd, txt) =>
  ({ type: 'assistant', timestamp: ts(s), cwd, message: { role: 'assistant', content: [{ type: 'thinking', thinking: txt }] } });
// An image-only prompt the operator pastes (a screenshot), with no text block of its own.
const imagePrompt = (s, cwd) =>
  user(s, cwd, [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } }]);
// The harness's own injected recap after a context compaction, never something the operator typed.
const compactSummary = (s, cwd, txt) => user(s, cwd, txt, { isCompactSummary: true });
const hook = (s, cwd, event, name, ms) =>
  ({ type: 'attachment', timestamp: ts(s), cwd, attachment: { type: 'hook_success', hookEvent: event, hookName: name, durationMs: ms } });
const stopHooks = (s, cwd, ms) =>
  ({ type: 'system', subtype: 'stop_hook_summary', timestamp: ts(s), cwd, hookInfos: [{ command: 'node stop.js', durationMs: ms }] });

const jsonl = (entries) => entries.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n') + '\n';

function writeTree(projectsDir, dirs) {
  for (const [dir, sessions] of Object.entries(dirs)) {
    for (const [id, s] of Object.entries(sessions)) {
      fs.mkdirSync(path.join(projectsDir, dir), { recursive: true });
      fs.writeFileSync(path.join(projectsDir, dir, `${id}.jsonl`), jsonl(s.entries));
      for (const [agentId, a] of Object.entries(s.agents || {})) {
        const sub = path.join(projectsDir, dir, id, 'subagents');
        fs.mkdirSync(sub, { recursive: true });
        fs.writeFileSync(path.join(sub, `agent-${agentId}.jsonl`), jsonl(a.entries));
        fs.writeFileSync(path.join(sub, `agent-${agentId}.meta.json`), JSON.stringify(a.meta));
      }
    }
  }
}

const enc = (p) => p.replace(/[^A-Za-z0-9]/g, '-');

// The fixture every phases assertion reads. REPO is the main working tree.
function alphaTree(REPO) {
  const SCOPE = path.join(REPO, '.superdev', 'scopes', 'alpha');
  const TREE = path.join(SCOPE, 'scopetree');
  const SLICE = path.join(SCOPE, 'slicetrees', '01');
  return {
    [enc(REPO)]: {
      s1: {
        entries: [
          cmd(0, REPO, 'plan', '.superdev/brainstorm/alpha.md'),
          say(5, REPO),
          // implement [10, 180): starts at the repo root, and only its subagent runs under the run root.
          cmd(10, REPO, 'implement', 'feat/alpha'),
          use(12, REPO, 'b1', 'Bash', { command: 'bun run test' }),
          hook(12, REPO, 'PreToolUse', 'PreToolUse:Bash', 1000),
          result(20, REPO, 'b1'),
          use(25, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
          result(90, REPO, 'a1', { toolUseResult: { totalDurationMs: 65000, totalToolUseCount: 3, totalTokens: 500 } }),
          use(95, REPO, 'q1', 'AskUserQuestion', {}),
          result(125, REPO, 'q1'),
          say(130, REPO),
          stopHooks(131, REPO, 2000),
          user(160, REPO, 'go on'),
          use(165, REPO, 'b2', 'Bash', { command: 'git status' }),
          result(175, REPO, 'b2'),
          // review [180, 210): prompting permission mode, one unfinished call.
          cmd(180, TREE, 'review', 'alpha', { permissionMode: 'default' }),
          use(185, TREE, 'b3', 'Bash', { command: 'bun run test' }),
          result(195, TREE, 'b3', { permissionMode: 'default' }),
          use(200, TREE, 'b4', 'Bash', { command: 'sleep 999' }),
          // review again [210, 230).
          cmd(210, TREE, 'review', 'alpha'),
          say(220, TREE),
          // a review of another scope in the same session [230, 240).
          cmd(230, REPO, 'review', 'feat/beta'),
          say(240, REPO),
        ],
        agents: {
          x1: {
            meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
            entries: [user(26, SLICE, 'Implement slice 01'), say(86, SLICE)],
          },
        },
      },
    },
    // A session started inside the scopetree lands in a sibling transcript directory.
    [enc(TREE)]: {
      s2: {
        entries: [
          cmd(300, TREE, 'document', 'alpha'),
          use(305, TREE, 'b5', 'Bash', { command: 'git diff' }),
          result(310, TREE, 'b5'),
          say(320, TREE),
        ],
      },
    },
    // A different repository whose encoded path shares the prefix is never read.
    [enc(REPO) + '-old']: {
      s3: { entries: [cmd(400, REPO + '-old', 'review', 'alpha'), say(410, REPO + '-old')] },
    },
  };
}

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'profile-test-')));
}

function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

const REPO = '/repo';

// Its own tool_result returns at launch; the `<task-notification>` naming its tool-use id, carried by a
// queued_command attachment, ends it.
const bgUse = (s, cwd, id, command) => use(s, cwd, id, 'Bash', { command, run_in_background: true });
const bgNote = (s, cwd, id, status = 'completed') => ({
  type: 'attachment', timestamp: ts(s), cwd,
  attachment: {
    type: 'queued_command', commandMode: 'task-notification',
    prompt: `<task-notification>\n<task-id>bg-${id}</task-id>\n<tool-use-id>${id}</tool-use-id>\n<output-file>/tmp/${id}.output</output-file>\n<status>${status}</status>\n<summary>Background command finished</summary>\n</task-notification>`,
  },
});

module.exports = {
  SCRIPT, REPO, T0, ts, user, cmd, use, result, say, interrupt, peerWake, synthetic, metaResume, think,
  imagePrompt, compactSummary, hook, stopHooks, bgUse, bgNote, jsonl, writeTree, enc, alphaTree, tmp, snapshot,
};
