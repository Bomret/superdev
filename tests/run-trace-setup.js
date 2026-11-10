'use strict';

// Shared setup of the run-trace suites (`tests/run-trace*.test.js`): a temporary repository with run roots `a` and `b`, the hook
// input helpers, and the Agent event builders. Each suite requires it, so each suite runs on its own. It is no suite.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');

const hookPath = require.resolve('../plugin/hooks/run-trace.js');
const { record } = require(hookPath);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-'));
const ledger = (rows) =>
  '# Ledger — demo\n\n**Stage:** implementing\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
  rows.map(([id, st]) => `| ${id} | #${id} | t | behavior | — | ${st} | — |`).join('\n') + '\n';

// A repository with run roots `a` and `b`. Run `a` has slicetrees 02 and 03 and a scopetree.
function runRoot(name, rows) {
  const root = path.join(tmp, '.superdev', 'scopes', name);
  fs.mkdirSync(path.join(root, 'slicetrees', '03', 'docs', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, 'slicetrees', '03', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'slicetrees', '02', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scopetree'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), ledger(rows));
  return root;
}
const A = runRoot('a', [['01', 'todo'], ['02', 'todo'], ['03', 'in-progress'], ['04', 'todo'], ['05', 'todo']]);
const B = runRoot('b', [['01', 'in-progress'], ['02', 'in-progress']]);
const trace = (root) => {
  try { return fs.readFileSync(path.join(root, 'trace.log'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').slice(1)); } catch { return []; }
};
const reset = () => [A, B].forEach((r) => fs.rmSync(path.join(r, 'trace.log'), { force: true }));

// Records one hook input in-process; returns the hook's output text, or '' (a test that expects none asserts '').
function runOut(input) {
  return record(input) || '';
}
function run(input) {
  assert.equal(runOut(input), '', 'prints nothing');
}
// Spawns the hook as Claude Code does: stdin in, exit 0, stdout back.
function spawnOut(input, raw) {
  const r = cp.spawnSync(process.execPath, [hookPath], { input: raw !== undefined ? raw : JSON.stringify(input), encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(r, 'run-trace.js');
  assert.equal(r.status, 0, 'always exits 0');
  assert.equal(r.stderr, '', 'prints nothing to stderr');
  return r.stdout;
}
const edit = (file_path, extra) => run(Object.assign({ tool_name: 'Edit', tool_input: { file_path }, cwd: tmp }, extra));
const bash = (command, cwd) => run({ tool_name: 'Bash', tool_input: { command }, cwd: cwd || tmp });
const S3 = path.join(A, 'slicetrees', '03');

// The Agent events of a dispatch: PreToolUse names the prompt, PostToolUse the response.
const agentPre = (prompt, tu, type, description, cwd, session) => ({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: tu, tool_input: { prompt, subagent_type: type || 'superdev:implementer', description: description || 'build it' }, cwd: cwd || tmp, ...(session ? { session_id: session } : {}) });
const agentPost = (tu, response, cwd) => ({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: tu, tool_response: response, cwd: cwd || tmp });

// S3 becomes a git repository so a run line carries a real sha. A path run needs its file to exist (triage #1210): the test file
// the cases run is committed with the tree, beside whatever else the caller wrote under S3.
function initS3() {
  const git = (...a) => cp.execFileSync('git', ['-C', S3, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
  fs.mkdirSync(path.join(S3, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(S3, 'tests', 'x.test.js'), '');
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return { git, sha: git('rev-parse', 'HEAD') };
}

const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });

// The bound of a spawn that waits out the hook's git bound (`lib/run-tree.js`, 1500 ms per call): above the hook's own 5 s exit
// and the sum of the four calls a run line can make, so a stalled git ends in the hook's verdict and never in this kill (INV-0009).
const GIT_SPAWN_BOUND_MS = 5000 + 4 * 1500;
module.exports = { tmp, ledger, runRoot, A, B, S3, trace, reset, runOut, run, spawnOut, edit, bash, hookPath, record, agentPre, agentPost, initS3, cleanup, GIT_SPAWN_BOUND_MS };
