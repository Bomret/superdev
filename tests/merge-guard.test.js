'use strict';

// Suite for plugin/hooks/merge-guard.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported decide() directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

const assert = require('node:assert');
const path = require('node:path');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const hookPath = require.resolve('../plugin/hooks/merge-guard.js');
const { decide } = require(hookPath);

const sub = (command) => ({ agent_id: 'a1', tool_input: { command } });

assert.equal(decide({}).block, false, 'no agent_id → allow');
assert.equal(decide({ tool_input: { command: 'git merge scope' } }).block, false, 'controller merges');
assert.equal(decide(sub('npm test')).block, false);
assert.equal(decide(sub('git commit -m "x"')).block, false);
assert.equal(decide(sub('git status')).block, false);
assert.equal(decide(sub('forgit push')).block, false, 'no false positive on substrings');
assert.equal(decide(sub('git merge-base main HEAD')).block, false, 'merge-base is read-only, not a merge');
assert.equal(decide(sub('git merge-tree a b')).block, false, 'merge-tree is read-only');
assert.equal(decide(sub('git merge scope')).block, true);
assert.equal(decide(sub('  git push -u origin s')).block, true, 'leading spaces');
assert.equal(decide(sub('cd x && git push')).block, true, 'after &&');
assert.equal(decide(sub('git rebase main')).block, true);
assert.equal(decide(sub('git add -A\ngit commit -m x\ngit push')).block, true, 'push on a later line');
assert.equal(decide(sub('git -C ../scope push')).block, true, 'git -C <path> push');
assert.equal(decide(sub('git -C "path with spaces" push')).block, true, 'git -C <double-quoted path> push');
assert.equal(decide(sub("git -C 'path with spaces' push")).block, true, 'git -C <single-quoted path> push');
assert.equal(decide(sub('git -C "a \\" b" push')).block, true, 'git -C <double-quoted path with escaped quote> push');
assert.equal(decide(sub('git -C ~/my\\ path push')).block, true, 'git -C <backslash-escaped space, unquoted> push');
assert.equal(decide(sub('git -c k="v w" push')).block, true, 'git -c <unquoted key, quoted value> push');
assert.equal(decide(sub('git --git-dir="a b" push')).block, true, 'git --git-dir="quoted value with space" push');
assert.equal(decide(sub('git -C .superdev/scopes/x/scopetree rebase main')).block, true, 'git -C rebase');
assert.equal(decide(sub('git --no-pager push origin s')).block, true, 'inline global flag before push');
assert.equal(decide(sub('git --work-tree /wt merge x')).block, true, 'git --work-tree <path> merge (space form)');
assert.equal(decide(sub('git --work-tree=/wt merge x')).block, true, 'git --work-tree=<path> merge');
assert.equal(decide(sub('git --git-dir /wt/.git push origin main')).block, true, 'git --git-dir <path> push (space form)');
assert.equal(decide(sub('git --git-dir /wt/.git --work-tree /wt merge x')).block, true, 'two space-form options before the verb');
assert.equal(decide(sub('git --work-tree "a b" merge x')).block, true, 'a quoted space-form value is one shell word');
assert.equal(decide(sub('git --no-pager merge x')).block, true, 'a valueless long option still reaches the verb');
assert.equal(decide(sub('git --exec-path merge x')).block, true, '--exec-path (not enumerated — git itself takes no value there) still reaches the verb, via the --ARG fallback');
assert.equal(decide(sub('git --shallow-file /dev/null merge x')).block, true, 'git --shallow-file <path> merge (space form)');
assert.equal(decide(sub('git --attr-source main merge x')).block, true, 'git --attr-source <tree> merge (space form)');

// a long run of enumerated option names with no verb must not backtrack exponentially (the comment
// above LONG_VALUE_OPT owns why) — this resolves well inside any hook timeout, not just eventually
{
  const pathological = 'git ' + '--git-dir '.repeat(60) + 'x; git ' + 'merge main';
  const t0 = Date.now();
  decide(sub(pathological));
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 500, `a pathological long-option run must resolve quickly, took ${elapsed}ms`);
}
assert.equal(decide({ tool_input: { command: 'git --work-tree /wt merge x' } }).block, false, 'the controller still merges in the space form');
assert.equal(decide(sub('git --work-tree /wt status')).block, false, 'a space-form read command is fine');
assert.equal(decide(sub('git -c user.name=x commit -m x')).block, false, 'git -c commit is fine');
assert.equal(decide(sub('git -C ../scope status')).block, false, 'git -C read is fine');
assert.equal(decide(sub('gh pr merge 5 --squash')).block, true, 'gh pr merge');
assert.equal(decide(sub('tea pr merge 5')).block, true, 'tea pr merge');
assert.equal(decide(sub('gh pr view 5')).block, false, 'gh read is fine');

// require.main guard: requiring this hook must never run main()'s stdin/decide dispatch, and
// spawning it directly (as Claude Code's hook invocation does) must still decide exactly as before
// the guard was added.
{
  const payload = JSON.stringify(sub('git merge scope'));
  const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
    input: payload, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(required.status, 0, 'requiring merge-guard.js never blocks');
  assert.equal(required.stdout, '', 'requiring merge-guard.js prints nothing');
  assert.equal(required.stderr, '', 'requiring merge-guard.js runs no decision');

  const spawned = cp.spawnSync(process.execPath, [hookPath], { input: payload, encoding: 'utf8', timeout: 5000 });
  assert.equal(spawned.status, 2, 'spawning merge-guard.js directly still blocks a subagent merge');
  assert.match(spawned.stderr, /subagents must not integrate/, 'and still reports the merge-guard reason');
}

// argv[2] === '--selftest' is a global-process condition, not "this file was invoked directly": a
// parent process invoked as `node <parent>.js --selftest` that requires this hook must not run this
// hook's own selftest as a side effect (issue #442 finding 1). Guarded by an env marker so that, if
// the guard is broken, the recursively-triggered inner selftest doesn't spawn a further generation
// of itself — it proves the leak exactly once instead of nesting indefinitely.
if (!process.env.SUPERDEV_ARGV_GUARD_TEST) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-guard-argv-'));
  const wrapper = path.join(dir, 'req.js');
  fs.writeFileSync(wrapper, `require(${JSON.stringify(hookPath)});`);
  try {
    const outer = cp.spawnSync(process.execPath, [wrapper, '--selftest'], {
      encoding: 'utf8', timeout: 5000,
      env: Object.assign({}, process.env, { SUPERDEV_ARGV_GUARD_TEST: '1' }),
    });
    assert.equal(outer.status, 0, 'a parent whose own argv[2] is --selftest still exits cleanly when it requires merge-guard.js');
    assert.equal(outer.stdout, '', "and never runs merge-guard.js's own selftest as a side effect");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('merge-guard tests ok');
