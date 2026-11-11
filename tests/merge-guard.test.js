'use strict';

// Suite for plugin/hooks/merge-guard.js (ADR 0227). The hook is one raw-text check over a subagent's Bash command.
// The suite requires the hook (silent, require.main guard) and calls its exported decide(), and spawns it once
// for the hook's stdin and exit-code contract.

const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');

const { assertSpawnDecided } = require('./spawn-verdict');

const hookPath = require.resolve('../plugin/hooks/merge-guard.js');
const { decide } = require(hookPath);

const sub = (command) => ({ agent_id: 'a1', tool_input: { command } });
const ctl = (command) => ({ tool_input: { command } });

const DENIED = [
  'git push',
  'git -C /x/scopetree merge main',
  'rtk git push',
  '/usr/bin/git rebase main',
  'GIT push',
  'git \\\npush',
  'gh pr merge 3',
  'gh api -X PUT repos/o/r/pulls/1/merge',
  'tea pr merge 3',
  'tea pr m 3',
  'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" push --root r',
  'git pull',
  'cd x && git push -u origin s',
  'git add -A\ngit commit -m x\ngit push',
  '$(git push)',
  'echo `git push`',
  'git push>/dev/null',
  'git push</dev/null',
  'tea pr m>/dev/null',
  'git commit -m "git push fails"',
  '\\git push',
  '\\gh pr merge 3',
  '\\tea pr m 3',
  // Over-denials ADR 0227 accepts: a verb word after a lead word denies whatever the command does.
  'git stash push -u -m tag',
  'git log feat/merge',
  'grep -rn "git push" plugin',
  // A heredoc line that itself holds a lead word and a verb is denied.
  "git commit -F - <<'EOF'\nfix: run git push later\nEOF",
];
const ALLOWED = [
  'git add src/push.ts',
  "git commit -F - <<'EOF'\nfix: merge the lists\nEOF",
  'grep -n merge file.md',
  'node scope.js dod-merge',
  'node tests/merge-guard.test.js',
  'scope.js test path tests/push.test.js -- node tests/push.test.js',
  'git status',
  'git merge-base main HEAD',
  'forgit push',
  'npm test',
  'git add -A && git commit -m x',
  'echo m',
];

for (const c of DENIED) {
  assert.equal(decide(sub(c)).block, true, 'a subagent call is denied: ' + JSON.stringify(c));
  assert.equal(decide(ctl(c)).block, false, 'the controller runs it: ' + JSON.stringify(c));
}
for (const c of ALLOWED) {
  assert.equal(decide(sub(c)).block, false, 'a subagent call is allowed: ' + JSON.stringify(c));
  assert.equal(decide(ctl(c)).block, false, 'the controller runs it: ' + JSON.stringify(c));
}
assert.equal(decide({}).block, false, 'no input fields → allow');
assert.equal(decide(null).block, false, 'no input → allow');
assert.equal(decide({ agent_id: 'a1' }).block, false, 'a subagent call with no command → allow');

// The `m` alias is a verb after `tea` only.
assert.equal(decide(sub('git m 3')).block, false, 'git has no m alias');
assert.equal(decide(sub('gh pr m 3')).block, false, 'gh has no m alias');

// The denial names the way out for a commit message holding a verb.
{
  const { reason } = decide(sub('git push'));
  assert.match(reason, /subagents must not integrate/);
  assert.ok(reason.includes("git commit -F - <<'EOF'"), 'the denial names the heredoc form');
  assert.match(reason, /as long as no line of it holds/, 'the denial states the heredoc passes only without a lead word and verb on one line');
}

// merge-guard requires no module (ADR 0227).
assert.ok(!/require\(/.test(fs.readFileSync(hookPath, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/require\.main/g, '')), 'merge-guard.js requires no module');

// A long line with many lead words and no verb answers in linear time: 10x the input costs ~10x when linear and ~100x
// when quadratic, so the 50x ceiling falsifies only the latter (ADR 0149).
{
  const { timePair } = require('./linear-time');
  const run = (n) => {
    decide(sub('git '.repeat(n) + 'status'));
    decide(sub('\n'.repeat(n) + 'git push'));
    decide(sub('git ' + 'a '.repeat(n)));
  };
  const [base, big] = timePair(run, 2000, 20000, 50);
  assert.ok(big < 50 * base, `a long command must scale linearly: 2000 took ${base} ns, 20000 took ${big} ns`);
}

// Spawning the hook directly (as Claude Code's hook invocation does) decides: the guard's decision path.
// That requiring it prints nothing is proven in tests/plugin-layout.test.js.
{
  const spawned = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify(sub('git merge scope')), encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(spawned, 'spawning merge-guard.js directly');
  assert.equal(spawned.status, 2, 'a subagent merge exits 2');
  assert.match(spawned.stderr, /subagents must not integrate/, 'and reports the merge-guard reason');
  const allowed = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify(ctl('git merge scope')), encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(allowed, 'spawning merge-guard.js with a controller call');
  assert.equal(allowed.status, 0, 'a controller merge exits 0');
  const garbage = cp.spawnSync(process.execPath, [hookPath], { input: 'not json', encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(garbage, 'spawning merge-guard.js with malformed input');
  assert.equal(garbage.status, 0, 'malformed input never blocks');
}

console.log('merge-guard tests ok');
