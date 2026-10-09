'use strict';

// Suite for plugin/hooks/merge-guard.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported decide() directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

const assert = require('node:assert');
const cp = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');

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
// above LONG_VALUE_OPT owns why) — a qualitative bound (AGENTS.md, ADR 0086): catastrophic
// backtracking is effectively unbounded, so this ceiling stays loose rather than tight. 44 repeats resolve in
// about a millisecond. Without the `(?!-)` after the space-form value, the mutant took 47s at 36 repeats, 54s at
// 38, 212s at 40, 419s at 42, and 320s at 44, measured 2026-10-09 by running this suite against a mutated copy of
// the hook, at load averages between 70 and 300 on 8 cores; load varied between runs, so the non-monotonic numbers
// (419s at 42 but 320s at 44) are noise. 44 is the size where the mutant fails the 120s ceiling by 1.5x or more in
// every run measured, and a regression still fails the suite within minutes.
{
  const pathological = 'git ' + '--git-dir '.repeat(44) + 'x; git ' + 'merge main';
  const t0 = Date.now();
  decide(sub(pathological));
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 120000, `a pathological long-option run must resolve quickly, took ${elapsed}ms`);
}
assert.equal(decide({ tool_input: { command: 'git --work-tree /wt merge x' } }).block, false, 'the controller still merges in the space form');

// an unquoted command substitution (or backtick group) holding spaces is one shell word, so a subagent
// cannot reach the verb through it; the controller still merges
for (const value of ['$(git rev-parse --show-toplevel)/wt', '$(a $(b c))/wt', '`git rev-parse --show-toplevel`/wt']) {
  assert.equal(decide(sub(`git -C ${value} merge --no-ff s`)).block, true, `-C ${value} merge: a subagent is blocked`);
  assert.equal(decide(sub(`git --work-tree ${value} push origin s`)).block, true, `--work-tree ${value} push: a subagent is blocked`);
  assert.equal(decide({ tool_input: { command: `git -C ${value} merge --no-ff s` } }).block, false, `-C ${value} merge: the controller passes`);
}
// past one nesting level ARG cannot read the value to its end: the guard fails closed
// instead of splitting at the first space
for (const value of ['$(dirname $(dirname $(pwd)))/wt', '$((1+(2)))/wt', '$(echo ")")/wt']) {
  assert.equal(decide(sub(`git -C ${value} merge s`)).block, true, `-C ${value} merge: a subagent is blocked`);
  assert.equal(decide(sub(`git --work-tree ${value} push origin s`)).block, true, `--work-tree ${value} push: a subagent is blocked`);
  assert.equal(decide(sub(`git --git-dir=${value} rebase s`)).block, true, `--git-dir=${value} rebase: a subagent is blocked`);
  assert.equal(decide({ tool_input: { command: `git -C ${value} merge s` } }).block, false, `-C ${value} merge: the controller passes`);
}
// a generic `--opt=` value reads like the enumerated ones: a nested substitution behind it still blocks
assert.equal(decide(sub('git --exec-path=$(dirname $(dirname $(which git))) merge x')).block, true, 'a deep substitution behind a generic --opt= is blocked');
assert.equal(decide({ tool_input: { command: 'git --exec-path=$(dirname $(dirname $(which git))) merge x' } }).block, false, 'the controller passes it');
// an unquoted parameter expansion holding a space is one word; an unterminated one ends the word and is stuck
for (const value of ['${X:-a b}', '${X:-a b}/wt', 'a/${X:-a b}']) {
  assert.equal(decide(sub(`git -C ${value} merge x`)).block, true, `-C ${value} merge: a subagent is blocked`);
  assert.equal(decide(sub(`git --work-tree ${value} merge x`)).block, true, `--work-tree ${value} merge: a subagent is blocked`);
  assert.equal(decide({ tool_input: { command: `git -C ${value} merge x` } }).block, false, `-C ${value} merge: the controller passes`);
}
// a quoted or backticked `}` inside an unquoted parameter expansion does not close it: the word runs on
const QUOTED_BRACE = ['${X:-"a } b"}', "${X:-'a } b'}", '${X:-"}"}', "${X:-'}'}", '${X:-`a } b`}'];
const BRACE_OPTS = ['-C', '--work-tree', '--git-dir', '-c', '--namespace', '--exec-path=', '--foo='];
for (const opt of BRACE_OPTS) {
  const sep = opt.endsWith('=') ? '' : ' ';
  for (const value of QUOTED_BRACE) {
    assert.equal(decide(sub(`git ${opt}${sep}${value} merge s`)).block, true, `${opt} ${value} merge: a subagent is blocked`);
    assert.equal(decide({ tool_input: { command: `git ${opt}${sep}${value} merge s` } }).block, false, `${opt} ${value} merge: the controller passes`);
  }
}
assert.equal(decide(sub('git --exec-path=$(a $(b $(c))) log')).block, false, 'a stuck generic --opt= on a read command passes');
assert.equal(decide(sub('git -C ${X:-a b merge x')).block, true, 'an unterminated parameter expansion is blocked');
assert.equal(decide(sub('git -C `pwd merge x')).block, true, 'an unterminated backtick is blocked');
// a stuck -c value is blocked too
for (const value of ['$(dirname $(dirname $(pwd)))', '$((1+(2)))']) {
  assert.equal(decide(sub(`git -c a=${value} merge s`)).block, true, `-c a=${value} merge: a subagent is blocked`);
}
assert.equal(decide(sub('git -C $(dirname $(dirname $(pwd)))/wt status')).block, false, 'a deep substitution on a read command is fine');
assert.equal(decide(sub('echo $(dirname $(dirname $(pwd))) && git merge-base a b')).block, false, 'a substitution outside a git option value never blocks');
assert.equal(decide(sub('git -C $(dirname $(pwd))/wt log -1')).block, false, 'a closed one-level value never blocks');
// a merge/push word inside a substitution used as an option value is part of that value, not git's subcommand
// (a subshell running git stays a documented bypass, see merge-guard.js's `simplicity:` comment)
for (const cmd of ['git -C $(echo merge) x', 'git -C $(git push o) log']) {
  assert.equal(decide(sub(cmd)).block, false, `${cmd}: a verb inside an option value is not the subcommand`);
}
// unterminated groups and long runs of them resolve without catastrophic backtracking
// (qualitative bound, ADR 0086). With STUCK's atomic `(?=(ARG|))\2` as a plain `(?:ARG|)`, the `$(echo ")")` unit
// took 4.7s at 500 repeats, under the 120s ceiling, 68s at 1000, 413s at 1600, and 1108s at 2400 (measured
// 2026-10-09); it runs at 1600, where the shipped regex takes a few seconds. A `+` on ARG's first double-quoted
// `(?:[^"\\]|` ran the block past 200s unfinished at the sizes below.
{
  const t0 = Date.now();
  decide(sub('git -C ' + '$('.repeat(500) + ' x'));
  decide(sub('git ' + '-C $(a b) '.repeat(200) + 'x'));
  decide(sub('git ' + '-C `a b` '.repeat(200) + 'x'));
  decide(sub('git ' + '-C $(a $(b $(c))) '.repeat(200) + 'x'));
  decide(sub('git -C $(a $(b $(c))) x;'.repeat(500)));
  decide(sub('git -C $((1+(2))) x; '.repeat(500)));
  decide(sub('git -C $(echo ")") x; '.repeat(1600)));
  decide(sub('git -C ${a b} x; '.repeat(2000)));
  decide(sub('git -C ' + '${'.repeat(5000) + ' x; git y'));
  decide(sub('git -C ' + '${ '.repeat(5000) + 'x'));
  decide(sub('git -C ${ x; '.repeat(2000)));
  decide(sub('git -C ' + '${"'.repeat(20000)));
  decide(sub('git -C `a x; '.repeat(2000)));
  decide(sub('git --exec-path=' + '$(a '.repeat(2000) + 'x'));
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 120000, `command-substitution runs must resolve quickly, took ${elapsed}ms`);
}
assert.equal(decide(sub('git --work-tree /wt status')).block, false, 'a space-form read command is fine');
assert.equal(decide(sub('git -c user.name=x commit -m x')).block, false, 'git -c commit is fine');
assert.equal(decide(sub('git -C ../scope status')).block, false, 'git -C read is fine');
assert.equal(decide(sub('gh pr merge 5 --squash')).block, true, 'gh pr merge');
assert.equal(decide(sub('tea pr merge 5')).block, true, 'tea pr merge');
assert.equal(decide(sub('gh pr view 5')).block, false, 'gh read is fine');

// An `rtk` prefix (RTK's output filter) runs the same command, so a hand-typed `rtk git push` or
// `rtk gh pr merge` integrates exactly as the bare form does (triage #958).
for (const cmd of [
  'rtk git push origin s',
  'rtk git rebase main',
  'rtk git merge scope',
  'cd x && rtk git push',
  'rtk -vv --ultra-compact git -C /wt push',
  'rtk --verbose --skip-env git --no-pager rebase main',
  'rtk git -C $(dirname $(dirname $(pwd)))/wt merge x',
  'rtk gh pr merge 5 --squash',
  'rtk tea pr merge 5',
  'rtk tea api -X POST /repos/bomret/superdev/pulls/12/merge -d @-',
  'rtk gh api -X PUT repos/o/r/pulls/12/merge',
  'if rtk tea api -X POST /repos/bomret/superdev/pulls/12/merge; then :; fi',
  // rtk's run-anything subcommands (`proxy`, `err`, `run`, `summary`, `test`) execute the command after them
  'rtk proxy git push',
  'rtk err git push',
  'rtk run git push',
  'rtk summary git merge x',
  'rtk test git rebase main',
  'rtk -v proxy --skip-env git push',
  'rtk run --ultra-compact git -C /wt push',
  'rtk proxy git -C $(dirname $(dirname $(pwd)))/wt merge x',
  'rtk proxy gh pr merge 5',
  'rtk err tea pr merge 5',
  'rtk proxy tea api -X POST /repos/bomret/superdev/pulls/12/merge -d @-',
  'if rtk run gh api -X PUT repos/o/r/pulls/12/merge; then :; fi',
  // each subcommand also takes rtk's `--` separator before the command, and an rtk can sit behind another rtk
  'rtk proxy -- git push',
  'rtk run -- git push origin x',
  'rtk test -- git rebase main',
  'rtk err -- git push',
  'rtk summary -- git merge x',
  'rtk -v proxy --skip-env -- git push',
  'rtk proxy -- gh pr merge 5',
  'rtk run -- tea api -X POST /repos/bomret/superdev/pulls/12/merge -d @-',
  'rtk proxy rtk git push',
  'rtk proxy -- rtk run -- git push',
]) assert.equal(decide(sub(cmd)).block, true, `an rtk-prefixed integration is blocked: ${cmd}`);
for (const cmd of [
  'rtkx git push',
  'echo rtk git push',
  'rtk git status',
  'rtk git merge-base main HEAD',
  'rtk -C /wt git push',
  'rtk gh pr view 5',
  'rtk tea api -X GET /repos/bomret/superdev/pulls/12/merge',
  'rtk proxy git log',
  'rtk proxyx git push',
  'echo rtk proxy git push',
  'rtk log git push',
  'rtk proxy gh pr view 5',
  'rtk proxy -- git log',
  'rtk test -- bun run test',
  'rtk proxy -- gh pr view 5',
  'rtk proxy rtk git status',
]) assert.equal(decide(sub(cmd)).block, false, `not an rtk-prefixed integration: ${cmd}`);

// `tea api` merges a pull request through the REST endpoint (ADR 0111), so it is the same job as `tea pr merge`.
const M = '/repos/bomret/superdev/pulls/12/merge';
for (const cmd of [
  `tea api -X POST '${M}' -d @-`,
  `tea api -X POST ${M} -d @-`,
  `tea api --method POST ${M}`,
  `tea api --method=POST ${M}`,
  `tea api -XPOST ${M}`,
  `tea api -X post ${M}`,
  `tea api -X POST /api/v1${M}`,
  `tea api -X POST '/repos/{owner}/{repo}/pulls/12/merge' -d @-`,
  `tea api --login codeberg.org --repo bomret/superdev -X POST '${M}' -d @-`,
  `tea api -X POST '${M}' --login codeberg.org --repo bomret/superdev -d @-`,
  `tea api -i -X POST 'https://codeberg.org/api/v1${M}' -d '{"Do":"squash"}'`,
  `cd x && tea api -X POST ${M}`,
  `echo '{"Do":"squash"}' | tea api -X POST ${M} -d @-`,
  `tea api ${M} -d '{"Do":"squash"}'`,
  `tea api ${M} --data @-`,
  `tea api ${M} -f Do=squash`,
  `tea api ${M} -F Do=squash`,
  `tea api ${M} --field Do=squash`,
  `resp=$(tea api -i -X POST '${M}' -d @- 2>"$hdr")`,
  `tea api -X POST \\\n  "${M}" -d @-`,
  `if tea api -X POST ${M} -d @-; then echo ok; fi`,
  `( tea api -X POST ${M} )`,
  `x=\`tea api -X POST ${M}\``,
  `while tea api -X POST ${M}; do :; done`,
  `if false; then :; else tea api -X POST ${M}; fi`,
  `{ tea api -X POST ${M} -d @-; }`,
  `! tea api -X POST ${M}`,
  // known false positive (accepted, fails closed): text that merely quotes the call is blocked too
  `git commit -m "docs: pinned merge via \`tea api -X POST ${M} -d @-\`"`,
  `echo "x (tea api -X POST ${M})"`,
]) assert.equal(decide(sub(cmd)).block, true, `tea api merge is blocked: ${cmd}`);
for (const cmd of [
  `tea api '${M}'`,
  `tea api -X GET ${M}`,
  `tea api ${M} --login codeberg.org`,
  `tea api -X POST '/repos/bomret/superdev/issues/12/labels' -d @-`,
  `tea api /repos/bomret/superdev/issues/12/comments -d '{"body":"merge"}'`,
  `tea api -X PATCH '/repos/bomret/superdev/pulls/12' -d @-`,
  `tea api ${M} -X GET -d @-`,
  `tea api -X POST /repos/bomret/superdev/issues && tea api ${M}`,
  `tea api /repos/bomret/superdev/pulls/12/merge-status`,
  `resp=$(tea api '${M}')`,
  `if tea api -X GET ${M}; then echo ok; fi`,
  `( tea api -X POST /repos/bomret/superdev/issues )`,
]) assert.equal(decide(sub(cmd)).block, false, `tea api non-merge is allowed: ${cmd}`);
assert.equal(decide({ tool_input: { command: `tea api -X POST '${M}' -d @-` } }).block, false, 'the controller runs the tea api merge');
assert.match(decide(sub(`tea api -X POST ${M}`)).reason, /tea api/, 'the block reason names the tea api merge');

// `gh api` reaches the same merge endpoint (triage #793): PUT or POST, explicit or implied by a body flag.
// GitHub's merge endpoint is PUT; `gh api` defaults to GET and to POST once a body flag is given.
const GM = '/repos/bomret/superdev/pulls/12/merge';
for (const cmd of [
  `gh api -X PUT ${GM}`,
  `gh api --method PUT ${GM}`,
  `gh api --method=PUT ${GM}`,
  `gh api -XPUT ${GM}`,
  `gh api -X put ${GM}`,
  `gh api -X POST ${GM}`,
  `gh api ${GM} -X PUT -f merge_method=squash`,
  `gh api ${GM} -f merge_method=squash`,
  `gh api ${GM} -F merge_method=squash`,
  `gh api ${GM} --field merge_method=squash`,
  `gh api ${GM} --raw-field merge_method=squash`,
  `gh api ${GM} --input body.json`,
  `cd x && gh api -X PUT ${GM}`,
  `if gh api -X PUT ${GM}; then echo ok; fi`,
  `x=$(gh api -X PUT ${GM})`,
  `gh api -X PUT \\\n  ${GM}`,
]) assert.equal(decide(sub(cmd)).block, true, `gh api merge is blocked: ${cmd}`);
for (const cmd of [
  `gh api ${GM}`,
  `gh api -X GET ${GM}`,
  `gh api ${GM} -X GET -f per_page=1`,
  `gh api -X PUT /repos/bomret/superdev/issues/12/labels -f labels[]=x`,
  `gh api -X PUT /repos/bomret/superdev/pulls/12/merge-status`,
  `gh api -X PATCH /repos/bomret/superdev/pulls/12 -f state=closed`,
  `gh api -X DELETE ${GM}`,
  `gh api /repos/bomret/superdev/pulls/12/comments -f body=merge`,
  `gh api -X PUT /repos/bomret/superdev/issues && gh api ${GM}`,
]) assert.equal(decide(sub(cmd)).block, false, `gh api non-merge is allowed: ${cmd}`);
assert.equal(decide({ tool_input: { command: `gh api -X PUT ${GM}` } }).block, false, 'the controller runs the gh api merge');
assert.match(decide(sub(`gh api -X PUT ${GM}`)).reason, /gh api/, 'the block reason names the gh api merge');

// a long run of newlines before a `tea`/`gh`/`git` lead-in must not backtrack quadratically (the comment
// above BLOCK_CLI owns why). Measured against the same run's own 2000-newline baseline (AGENTS.md, ADR 0086):
// 10x the input costs ~10x when linear and ~100x when quadratic, so the 50x ceiling falsifies only the latter.
{
  const run = (n) => {
    const t0 = process.hrtime.bigint();
    decide(sub('\n'.repeat(n) + 'tea api -X POST ' + M));
    decide(sub('\n'.repeat(n) + 'gh pr merge 5'));
    decide(sub('\n'.repeat(n) + 'git status'));
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  const base = run(2000);
  const big = run(20000);
  assert.ok(big < 50 * (base + 5), `a long run of newlines must scale linearly: 2000 took ${base}ms, 20000 took ${big}ms`);
}

// require.main guard: requiring this hook must never run main()'s stdin/decide dispatch, and
// spawning it directly (as Claude Code's hook invocation does) must still decide exactly as before
// the guard was added.
{
  const payload = JSON.stringify(sub('git merge scope'));
  const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
    input: payload, encoding: 'utf8', timeout: 5000,
  });
  assertSpawnDecided(required, 'requiring merge-guard.js');
  assert.equal(required.status, 0, 'requiring merge-guard.js never blocks');
  assert.equal(required.stdout, '', 'requiring merge-guard.js prints nothing');
  assert.equal(required.stderr, '', 'requiring merge-guard.js runs no decision');

  const spawned = cp.spawnSync(process.execPath, [hookPath], { input: payload, encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(spawned, 'spawning merge-guard.js directly');
  assert.equal(spawned.status, 2, 'spawning merge-guard.js directly still blocks a subagent merge');
  assert.match(spawned.stderr, /subagents must not integrate/, 'and still reports the merge-guard reason');
}

console.log('merge-guard tests ok');
