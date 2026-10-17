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
assert.equal(decide(sub('git --exec-path merge x')).block, true, '--exec-path (not enumerated — git itself takes no value there) still reaches the verb, read as a value-less option');
assert.equal(decide(sub('git --shallow-file /dev/null merge x')).block, true, 'git --shallow-file <path> merge (space form)');
assert.equal(decide(sub('git --attr-source main merge x')).block, true, 'git --attr-source <tree> merge (space form)');
// `$[ … ]` is arithmetic, and bash runs the substitutions and backtick groups it holds.
for (const c of ['echo $[1+$(git push)]', 'echo $[1+`git push`]']) {
  assert.equal(decide(sub(c)).block, true, 'a guarded verb inside $[…] is denied: ' + c);
}
assert.equal(decide(sub('echo $[1>2]')).block, false, 'arithmetic naming no verb is allowed');

// a long run of enumerated option names with no verb answers without backtracking: a qualitative bound
// (AGENTS.md, ADR 0086), loose because exponential backtracking is effectively unbounded.
{
  const t0 = Date.now();
  const verdict = decide(sub('git ' + '--git-dir '.repeat(44) + 'x; git ' + 'merge main'));
  const elapsed = Date.now() - t0;
  assert.equal(verdict.block, true, 'the merge after the option run is denied');
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
// a value nested past one level, or holding a quoted `)`, is one word to the scanner: the guard reads the verb
// after it instead of splitting at the first space
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
assert.equal(decide(sub('git -C $(echo merge) x')).block, false, 'a verb inside an option value is not the subcommand');
assert.equal(decide(sub('git -C $(git push o) log')).block, true, 'a git push run inside an option value is a command of its own');
// unterminated groups and long runs of them resolve in bounded time (qualitative bound, ADR 0086)
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
// `pulls` and `pull` are tea's own names for `pr`, read by the scanner, the raw line-start reading, and the raw-text rule.
for (const cmd of ['tea pulls merge 3', 'tea pull merge 3', 'sh -c "sudo tea pulls merge 3"', "cat <<'E'\ntea pulls merge 3\nE", 'tea pulls merge "3']) {
  assert.equal(decide(sub(cmd)).block, true, `tea's pulls route is denied: ${JSON.stringify(cmd)}`);
}
assert.equal(decide(sub('tea pulls list')).block, false, 'a tea pulls read is fine');
// Options before `pr` and before `merge` are read past, their values included; tea's `m` is its alias for `merge`.
for (const cmd of ['gh pr -R o/r merge 1', 'gh --repo o/r pr merge 1', 'gh -R o/r pr merge 1', 'gh -Ro/r pr merge 1', 'gh --repo=o/r pr merge 1',
  'gh pr --repo=o/r merge 1', 'tea pr m 3', 'tea pulls m 3', 'tea pr --repo o/r merge 3', 'tea pulls -r o/r m 3', 'tea --debug pr -l me merge 3']) {
  assert.equal(decide(sub(cmd)).block, true, `a pr merge past options is denied: ${cmd}`);
}
for (const cmd of ['gh pr -R o/r view 1', 'gh -R o/r pr list', 'tea pr -r merge list', 'gh pr m 1']) {
  assert.equal(decide(sub(cmd)).block, false, `no pr merge: ${cmd}`);
}
// `gh`/`tea pr merge` is read through the scanner at every level, past `NAME=` words, keywords, and wrappers.
for (const cmd of [
  "sh -c 'gh pr merge 1'", '(gh pr merge 1)', 'x=$(gh pr merge 1)', 'if true; then gh pr merge 1; fi', '! gh pr merge 1',
  'GH_TOKEN=x gh pr merge 1', 'time gh pr merge 1', '{ gh pr merge 1; }', '`tea pr merge 2`', 'ssh h "tea pr merge 2"',
  'echo $[1+$(gh pr merge 1)]', 'sudo gh pr merge 1', 'env A=1 tea pr merge 2',
]) {
  assert.equal(decide(sub(cmd)).block, true, `a gh/tea pr merge is denied: ${cmd}`);
  assert.equal(decide({ tool_input: { command: cmd } }).block, false, `the controller is not: ${cmd}`);
}
for (const cmd of ['gh pr merge "1', 'x; tea pr merge $(a']) {
  assert.equal(decide(sub(cmd)).block, true, `an unreadable gh/tea pr merge is denied by its raw text: ${cmd}`);
}
assert.equal(decide(sub('gh pr view "1')).block, false, 'an unreadable gh read is allowed');
// The raw line-start reading stays beside the scanned one, so every shape it denied stays denied, heredoc text included.
for (const cmd of ["cat <<'E'\ngh pr merge 1\nE", 'cat <<E\ntea pr merge 1\nE', 'gh pr merge-x']) {
  assert.equal(decide(sub(cmd)).block, true, `the raw line-start reading still denies: ${JSON.stringify(cmd)}`);
}
// A heredoc body a known shell reads on stdin is a command line (#1016); any body naming an integration is denied (below).
for (const cmd of ['bash <<E\ngit push origin x\nE', "sh <<'E'\ngit merge x\nE", 'bash <<"E"\ngit rebase main\nE', 'zsh <<-E\n\tgit push\n\tE',
  'dash << E\ngit push\nE', 'ksh <<E\ngit push\nE', '/bin/bash <<E\ngit push\nE', 'env bash <<E\ngit push\nE', 'cat <<E | sh\ngit push\nE',
  'bash -s <<E\ngit push\nE', 'bash -s -- a <<E\ngit push\nE', 'sh /dev/stdin <<E\ngit push\nE', 'source /dev/stdin <<E\ngit push\nE',
  '. /dev/stdin <<E\ngit push\nE', 'bash -c "$(cat <<E\ngit push\nE\n)"', 'eval "$(cat <<E\ngit push\nE\n)"', 'x=$(bash <<E\ngit push\nE\n)',
  'cat <<A; bash <<B\ndata\nA\ngit push\nB', 'bash <<E\necho don\'t; git push\nE']) {
  assert.equal(decide(sub(cmd)).block, true, `a shell-fed heredoc body is read: ${JSON.stringify(cmd)}`);
}
// Any heredoc body or here-string text that names a guarded integration is denied, whatever command receives it (the base rule):
// a shell reached through a process substitution, a descriptor, `$(cat)`, `eval`, `busybox`, `ssh`, or `xargs git` included, and
// data alike, a known false positive of the quoted-word class. Only a pure file sink or message sink is exempt (below).
for (const cmd of ["cat <<'E'\ngit push\nE", 'cat <<E\ngit merge x\nE', 'ssh host <<E\ngit push\nE', 'x=$(cat <<E\ngit push\nE\n)',
  'cat <<E > >(sh)\ngit push\nE', 'cat <<E >(sh)\ngit push\nE', 'cat <<E 1> >(bash)\ngit push\nE', '{ cat <<E; } > >(sh)\ngit push\nE',
  'cat <<E | tee >(sh)\ngit push\nE', '(cat <<E) > >(sh)\ngit push\nE', 'cat <<E | sh -c "$(cat)"\ngit push\nE',
  'cat <<E | bash -c "$(cat)"\ngit push\nE', 'cat <<E | eval "$(cat)"\ngit push\nE', 'f() { eval "$(cat)"; }; cat <<E | f\ngit push\nE',
  'exec 3<<E; sh <&3-\ngit push\nE', 'exec 4<<E; exec 3<&4; sh <&3\ngit push\nE', 'exec 3<<E; sh /proc/self/fd/3\ngit push\nE',
  'cat <<E | busybox sh\ngit push\nE', "eval 'f() { sh; }'; cat <<E | f\ngit push\nE", 'cat <<E | xargs git\npush\nE',
  'cat <<-E\n\tgh pr merge 1\n\tE', 'cat 3<<E\ntea pulls merge 3\nE', 'cat <<E\ngh api -X PUT repos/o/r/pulls/1/merge\nE',
  'cat <<<"git push"', 'cat <<<"git push" | sh', "cat <<<'gh pr merge 1'", '3<<<"git rebase main" cat']) {
  assert.equal(decide(sub(cmd)).block, true, `heredoc or here-string text naming an integration is denied: ${JSON.stringify(cmd)}`);
  assert.equal(decide({ tool_input: { command: cmd } }).block, false, `the controller is not: ${JSON.stringify(cmd)}`);
}
// `xargs` appends stdin words to the command behind it: a git, gh, or tea command there that stops before its verb fails closed.
for (const cmd of ['echo push | xargs git', 'printf "pr merge 1" | xargs gh', 'xargs -n 1 tea pulls < f']) {
  assert.equal(decide(sub(cmd)).block, true, `a verb xargs may append is denied: ${cmd}`);
}
for (const cmd of ['git ls-files | xargs git log', 'xargs gh pr view < f', 'echo a | xargs git -C x status']) {
  assert.equal(decide(sub(cmd)).block, false, `a verb the command names itself decides: ${cmd}`);
}
for (const cmd of ['cat <<E\nhello\nE', 'gh pr create --body-file - <<E\nfix\nE', "git commit -F - <<'E'\nfix: read names\nE", 'cat <<<"hello" | sh']) {
  assert.equal(decide(sub(cmd)).block, false, `heredoc or here-string text naming nothing guarded is allowed: ${JSON.stringify(cmd)}`);
}
// A pure file sink (`cat`, or `tee` with at most `-a`, its stdout to a plain file) or a message sink (`git commit -F -`, `gh pr|issue …
// --body-file -`, `tea issue|issues|pull|pulls|pr … --description-file -`) standing alone on the line takes a body naming an integration as data.
// `/dev/null` is a plain file.
for (const cmd of ["cat >> /abs/.superdev/scopes/demo/reports/02/progress.md <<'SUPERDEV_TEXT_EOF'\nImportant: `git push` inside $[ ] is allowed\nSUPERDEV_TEXT_EOF",
  'cat > f <<E\nfix: git push\nE', 'cat >f <<-E\n\tthen gh pr merge 1\n\tE', '/bin/cat 1> f <<E\nfix: git push\nE', 'cat >| f <<E\nfix: git push\nE',
  'cat &> f <<E\nfix: git push\nE', 'cat > "notes dir/f.md" <<E\nfix: git push\nE', 'cat > f <<<"fix: git push"', 'tee -a f <<E >/dev/null\nfix: git push\nE',
  'tee f g <<E > h\nfix: git push\nE', 'cat > f <<E; echo done\nfix: git push\nE', 'cat > f <<E && git status\nfix: git push\nE',
  'git commit -F - <<E\nfix: git push fails\nE', "git -C /wt commit --file=- <<'E'\nfix: git merge x\nE", 'git commit -q --file - <<E\nfix: git push\nE',
  "gh pr create --body-file - <<'E'\nthen git merge x\nE", 'gh issue comment 3 -F - <<E\nfix: git push\nE', 'gh pr edit 1 --body-file=- <<E\nfix: git push\nE',
  "tea issues create -t x --description-file - <<'E'\nfix: git push\nE", 'tea pr create --title x --description-file - <<E\nthen tea pr merge 1\nE']) {
  assert.equal(decide(sub(cmd)).block, false, `a file or message sink takes the body as data: ${JSON.stringify(cmd)}`);
}
// A sink's text is still read by the base hook's line rule: a line or `;`, `&`, `|` segment that starts with `git` (behind any `rtk`
// prefix) and later names a guarded verb is denied, as the base hook denied it.
for (const cmd of ['cat > f <<E\ngit push\nE', 'cat >> f <<E\nnotes\n  git -C x merge y\nE', 'cat > f <<E\nok; git rebase main\nE', 'cat > f <<<"git push"',
  'tee -a f <<E >/dev/null\nrtk git push\nE', 'git commit -F - <<E\nfix: x\n\ngit push origin main\nE', 'gh pr create --body-file - <<E\na | git pull\nE']) {
  assert.equal(decide(sub(cmd)).block, true, `a sink's line that starts with a guarded git verb is denied: ${JSON.stringify(cmd)}`);
}
// The raw line-start rule (BLOCK_CLI) and the raw API merge check still read the whole command, a sink's body included.
for (const cmd of ['cat > f <<E\ngh pr merge 1\nE', 'cat > f <<E\ntea api -X POST /repos/o/r/pulls/1/merge\nE']) {
  assert.equal(decide(sub(cmd)).block, true, `the raw text rules still read a sink's body: ${JSON.stringify(cmd)}`);
}
// Every other receiver, and a sink whose output can reach a shell, is denied (fail closed).
for (const cmd of ['cat <<E > >(sh)\ngit push\nE', 'cat > >(sh) <<E\ngit push\nE', 'cat > /dev/fd/1 <<E\ngit push\nE', 'cat > /dev/stdout <<E\ngit push\nE',
  'cat > /proc/self/fd/1 <<E\ngit push\nE', 'cat <<E >f | sh\ngit push\nE', 'cat > f <<E |& sh\ngit push\nE', '{ cat > f <<E; } | sh\ngit push\nE',
  '{ cat > f <<E; } > g\ngit push\nE', 'tee f <<E | sh\ngit push\nE', 'tee f <<E\ngit push\nE', 'tee >(sh) <<E >/dev/null\ngit push\nE',
  'tee --append f <<E >/dev/null\ngit push\nE', 'cat <<E | tee f\ngit push\nE', 'f() { cat > x <<E; }; f | sh\ngit push\nE', 'sudo cat > f <<E\ngit push\nE',
  'X=1 cat > f <<E\ngit push\nE', 'cat -v > f <<E\ngit push\nE', 'cat - > f <<E\ngit push\nE', 'cat > "$F" <<E\ngit push\nE', 'cat > $(echo f) <<E\ngit push\nE',
  'cat > f 3<<E\ngit push\nE', 'cat > f 2>&1 <<E\ngit push\nE', 'x=$(cat > f <<E\ngit push\nE\n)', 'echo `cat > f <<E\ngit push\nE\n`',
  'if true; then cat > f <<E; fi\ngit push\nE', '(cat > f <<E)\ngit push\nE', 'exec > >(sh); cat > /tmp/o <<E\ngit push\nE',
  "sh -c 'cat > f <<E\ngit push\nE'", 'git commit -F - <<E | sh\ngit push\nE', 'git commit -F - <<E > >(sh)\ngit push\nE',
  'git commit -F f <<E\ngit push\nE', 'git -c alias.commit=x commit -F - <<E\ngit push\nE', 'gh api repos/o/r -F - <<E\ngit push\nE',
  'gh pr create --body-file - <<E | sh\ngit push\nE', 'tea comment 3 <<E\ngit push\nE', 'env git commit -F - <<E\ngit push\nE']) {
  assert.equal(decide(sub(cmd)).block, true, `no sink exempts the body: ${JSON.stringify(cmd)}`);
}
// A message sink that opens an editor on its text (git `-e`/`--edit` or a `-c`/`--config-env` editor setting, gh `-e`/`--editor`)
// runs that editor over the body, so it exempts nothing; an editor set by an environment word (`GIT_EDITOR=sh`) is no sink already.
for (const cmd of ["git -c core.editor=sh commit -F - -e <<'E'\n(git push)\nE", 'git commit -F - --edit <<E\n(git push)\nE', 'git commit -eF - <<E\n(git push)\nE',
  'git commit -F - -ve <<E\n(git push)\nE', 'git -c core.editor=vi commit -F - <<E\nfix: git push\nE', 'git -c Core.Editor=sh commit -F - <<E\n(git push)\nE',
  'git -c sequence.editor=sh commit -F - <<E\n(git push)\nE', 'git --config-env=core.editor=ED commit -F - <<E\n(git push)\nE',
  'git --config-env core.editor=ED commit -F - <<E\n(git push)\nE', 'GIT_EDITOR=sh git commit -F - -e <<E\n(git push)\nE', 'EDITOR=sh git commit -F - <<E\n(git push)\nE',
  'VISUAL=sh gh pr create --body-file - <<E\n(git push)\nE', 'gh pr create --body-file - --editor <<E\n(git push)\nE', 'gh issue create -e -F - <<E\n(git push)\nE',
  'gh pr comment 1 -eF - <<E\n(git push)\nE']) {
  assert.equal(decide(sub(cmd)).block, true, `a sink that runs an editor exempts nothing: ${JSON.stringify(cmd)}`);
}
for (const cmd of ['git -c user.name=x commit -F - <<E\n(git push)\nE', 'git commit -F - --no-edit <<E\n(git push)\nE', 'gh pr create -t x --body-file - <<E\n(git push)\nE']) {
  assert.equal(decide(sub(cmd)).block, false, `a sink running no editor still takes the body as data: ${JSON.stringify(cmd)}`);
}
// A here-string, and the text `echo` or `printf` writes, that a known shell reads on stdin is read as a command line.
for (const cmd of ['bash <<<"git push"', "bash <<<'git push'", 'sh <<< "git merge x"', "sh <<<$'git\\x20push'", 'cat <<<"git push" | sh',
  'echo git push | sh', 'echo "git" "push" | sh', 'sh < <(echo git push origin x)', "printf 'true\\ngit push' | sh", "printf 'git\\x20push' | sh"]) {
  assert.equal(decide(sub(cmd)).block, true, `text a shell reads is read: ${cmd}`);
}
for (const cmd of ['echo git push', 'echo git push | cat', 'cat file | sh']) {
  assert.equal(decide(sub(cmd)).block, false, `text no shell reads is data: ${cmd}`);
}
// A compound or grouped pipeline element feeds every later element: a heredoc or echo text inside one reaches a shell that a
// later element is or holds (#1016).
for (const cmd of ['{ cat <<E; } | sh\ngit push\nE', '{ cat <<E\ngit push\nE\n} | sh', 'if true; then cat <<E; fi | sh\ngit push\nE',
  'for i in 1; do cat <<E; done | bash\ngit push\nE', 'cat <<E | (bash)\ngit push\nE', 'cat <<E | { bash; }\ngit push\nE',
  '{ echo git push; } | sh', 'echo git push | (sh)', 'while false; do :; done; case x in *) cat <<E;; esac | sh\ngit push\nE',
  '(cat <<E) | sh\ngit push\nE', '{ cat <<E; true; } | cat | sh\ngit push\nE']) {
  assert.equal(decide(sub(cmd)).block, true, `a compound pipeline element feeds a later shell: ${JSON.stringify(cmd)}`);
}
assert.equal(decide(sub('{ echo git push; } | cat')).block, false, 'no later shell reads the echo text');
// A heredoc body naming an integration is denied by the base rule even where no later shell reads it.
for (const cmd of ['{ cat <<E; } | grep x\ngit push\nE', '{ cat <<E; } && sh\ngit push\nE', 'if true; then cat <<E; fi; sh\ngit push\nE',
  'sh | { cat <<E; }\ngit push\nE', '(cat <<E) ; (grep x)\ngit push\nE', '( (cat <<E) ) ; sh\ngit push\nE']) {
  assert.equal(decide(sub(cmd)).block, true, `a heredoc body naming an integration is denied: ${JSON.stringify(cmd)}`);
}
// A shell the command line reaches indirectly reads a heredoc body or echo text as a command line, failing closed: `xargs` running a
// known shell, a defined alias naming one, a function whose body holds a stdin-reading shell or holds the heredoc and is piped to
// one, and a numbered heredoc a shell of the line reads through `<&N`, `0<&N`, or `/dev/fd/N`.
for (const cmd of ['cat <<E | xargs sh -c\ngit push\nE', 'cat <<E | xargs -I{} sh -c {}\ngit push\nE', 'echo git push | xargs -0 bash -c',
  'alias s=sh; cat <<E | s\ngit push\nE', "alias x=y s='/bin/bash -s'; s <<E\ngit push\nE", 'alias s=sh; echo git push | s',
  'f() { cat <<E; } ; f | sh\ngit push\nE', 'function f { cat <<E; }; f | sh\ngit push\nE', 'f() { sh; }; cat <<E | f\ngit push\nE',
  'f() { echo git push; }; f | bash', 'g() { xargs sh -c; }; echo git push | g', 'f() { cat <<E; }; g() { f; }; g | sh\ngit push\nE',
  'exec 3<<E; sh <&3\ngit push\nE', 'sh /dev/fd/3 3<<E\ngit push\nE', 'sh <&3 3<<E\ngit push\nE', 'sh 0<&3 3<<E\ngit push\nE',
  'exec 4<<-E; bash < /dev/fd/4\n\tgit push\n\tE', 'exec 3<<E; source /dev/fd/3\ngit push\nE']) {
  assert.equal(decide(sub(cmd)).block, true, `an indirect shell reads the text: ${JSON.stringify(cmd)}`);
}
for (const cmd of ['cat <<E | xargs echo\ngit push\nE', 'alias s=cat; cat <<E | s\ngit push\nE', 'f() { cat <<E; }; f | grep x\ngit push\nE',
  'f() { grep x; }; cat <<E | f\ngit push\nE', 'exec 3<<E; cat <&3\ngit push\nE', 'exec 3<<E; sh <&4\ngit push\nE']) {
  assert.equal(decide(sub(cmd)).block, true, `a heredoc body naming an integration is denied, whoever reads it: ${JSON.stringify(cmd)}`);
}
for (const cmd of ['alias s=cat; echo git push | s', 'f() { grep x; }; echo git push | f']) {
  assert.equal(decide(sub(cmd)).block, false, `no shell reads the echo text: ${cmd}`);
}
// A wrapper or command name spelled in many raw characters (empty quote pairs) is still that name, so the command behind it is read.
{
  const e1 = "''".repeat(600);
  const e2 = '""'.repeat(600);
  for (const cmd of ['env' + e1 + ' git push', 'sudo' + e1 + ' git push', 'nohup' + e1 + ' git push', 'exec' + e1 + ' git push',
    'eval' + e1 + ' git push', 'command' + e1 + ' git push', 'timeout' + e1 + ' 5 git push', "sudo -u''" + e1 + ' bob git push',
    'e' + e2 + 'nv git push', "sh -c 'env" + e2 + " git push'", 'cat <<E | sh\nenv' + e1 + ' git push\nE']) {
    assert.equal(decide(sub(cmd)).block, true, `a long-spelled name is read as its name: ${cmd.slice(0, 40)}…`);
  }
  for (const cmd of ['f' + "''".repeat(40) + '() { sh; }; echo git push | f', 'function f' + "''".repeat(40) + ' { sh; }; echo git push | f']) {
    assert.equal(decide(sub(cmd)).block, true, `a long-spelled function name is read as its name: ${cmd}`);
  }
}
// A quoted word's text past an unquoted `NAME=` or command-string option prefix is read as a command line.
for (const cmd of ["alias g='git push origin x'", "export PROMPT_COMMAND='git push'", "env -S'git push origin x'", "env --split-string='git push'",
  "su -c'git push'", "su --command='git push'"]) {
  assert.equal(decide(sub(cmd)).block, true, `the text past the prefix is read: ${cmd}`);
}
// `git pull` merges or rebases, `git subtree push` pushes, and a git alias defined inline runs the verb it names.
for (const cmd of ['git pull', 'git pull --rebase origin main', 'git -C ../wt pull', 'git subtree push --prefix=x origin main', 'git subtree -P x push origin main',
  'git -c alias.p=push p origin x', "git -c alias.X='!git push' X", 'git -c alias.m=merge m x', 'git -c alias.r=rebase r main', 'git -c alias.l=pull l',
  'git -c Alias.P=push p', "git -c alias.s='subtree push' s -P x o m", "sh -c 'git pull'"]) {
  assert.equal(decide(sub(cmd)).block, true, `an integration is denied: ${cmd}`);
}
for (const cmd of ['git subtree split -P x', 'git -c alias.l=log l', 'git -c alias.p=push status', "git -c alias.X='!git log' X"]) {
  assert.equal(decide(sub(cmd)).block, false, `no integration: ${cmd}`);
}
// Git ignores an alias whose name is a git command, so a typed guarded subcommand integrates whatever an inline alias of that name says.
for (const cmd of ['git -c alias.merge=log merge x', 'git -c alias.push=status push origin main', 'git -c alias.rebase=log rebase main',
  "git -c alias.pull='!echo hi' pull", 'git -c alias.Merge=log merge x', 'git -c ALIAS.PUSH=status push', 'git -c alias.subtree=log subtree push -P d o m']) {
  assert.equal(decide(sub(cmd)).block, true, `a typed guarded subcommand integrates over its alias: ${cmd}`);
}
// An inline alias value is read as a git command line: past git's global options, and through an alias it names to the end of the chain.
// A chain that does not end (a loop) is denied.
for (const cmd of ["git -c alias.x='--no-pager push' x", "git -c alias.x='-p merge' x y", 'git -c alias.a=b -c alias.b=push a',
  "git -c alias.a=b -c alias.b='!git push' a", "git -c alias.a='--no-pager b' -c alias.b=rebase a main", 'git -c alias.a=b -c alias.b=a a']) {
  assert.equal(decide(sub(cmd)).block, true, `an alias value that integrates as a git command line: ${cmd}`);
}
// An alias defined inside an alias value is followed, the words a middle link adds reach the next link, a value is split the way git's
// split_cmdline splits it (quotes group and are removed, a backslash escapes the next character), an unclosed quote is denied, and a `!`
// value is judged with the words git appends to it.
for (const cmd of ["git -c alias.a='-c alias.b=push b' a", "git -c alias.a='b push -P d o m' -c alias.b=subtree a", `git -c alias.x='"push"' x`,
  "git -c alias.x='pu\\sh' x", `git -c alias.x='"pu\\sh"' x`, `git -c alias.x='"push' x`, "git -c alias.x='!git' x push",
  "git -c alias.a=b -c alias.b='!git' a push", "git -c alias.a='b push' -c alias.b='!git' a"]) {
  assert.equal(decide(sub(cmd)).block, true, `an alias chain read the way git reads it integrates: ${cmd}`);
}
for (const cmd of ["git -c alias.x='--no-pager log' x", 'git -c alias.a=b -c alias.b=log a', "git -c alias.a=b -c alias.b='!git log' a",
  "git -c alias.a='-c alias.b=status b' a", `git -c alias.x='"log"' x`, "git -c alias.a='b push -P d o m' -c alias.b=log a"]) {
  assert.equal(decide(sub(cmd)).block, false, `an alias chain that does not integrate: ${cmd}`);
}
// git's split_cmdline separates words only on space, tab, newline, and carriage return, so a vertical tab, form feed, or Unicode space
// stays inside a word (`-c a.b=x\vy` is one `-c` value) and the guarded verb after it runs. A tab separates, so `y` is the subcommand
// and git fails with "'y' is not a git command": nothing integrates.
for (const cmd of ['git -c alias.p=$\'-c a.b=x\\vy push\' p', 'git -c alias.p=$\'-c a.b=x\\fy push\' p', `git -c alias.p='-c a.b=x${String.fromCharCode(0xa0)}y push' p`,
  `git -c alias.p='-c a.b=x${String.fromCharCode(0x2028)}y push' p`]) {
  assert.equal(decide(sub(cmd)).block, true, `a word git's split_cmdline keeps whole: ${JSON.stringify(cmd)}`);
}
assert.equal(decide(sub('git -c alias.p=$\'-c a.b=x\\ty push\' p')).block, false, 'a tab separates words in an alias value');
// A `!` value is a shell command line, so it is read the way merge-guard reads any command line: shell quoting hides no verb.
for (const cmd of [`git -c alias.x='!git "pu"sh' x`, "git -c alias.x='!git pu\\sh' x", `git -c alias.x="!git p''ush" x`]) {
  assert.equal(decide(sub(cmd)).block, true, `a \`!\` value read as a shell command line integrates: ${cmd}`);
}
// Git hands the appended words to the shell through "$@", so a quote, `)`, or `<<` in one is a plain character and changes nothing.
for (const cmd of [`git -c alias.x='!git "pu"sh' x "'"`, `git -c alias.x='!git "pu"sh' x '"'`, `git -c alias.x='!git "pu"sh' x ')'`,
  `git -c alias.x='!git "pu"sh' x '<<'`, `git -c alias.x='!git pu\\sh' x "'"`, `git -c alias.x='!git "pu"sh origin main; :' x "'"`]) {
  assert.equal(decide(sub(cmd)).block, true, `a word git appends to a \`!\` value is no shell text: ${cmd}`);
}
// A wrapper value option that takes its value as a separate word (macOS `env -P altpath`, `xargs -J replstr`) is skipped with it.
for (const cmd of ['env -P /usr/bin git merge x', 'env -P/usr/bin git merge x', 'env -iP /usr/bin git push', 'sudo env -P /usr/bin git push',
  '/usr/bin/env -P /usr/bin git rebase main', 'xargs -J % git push origin', 'xargs -R 2 -I % git push %', 'xargs -S 255 -I % git merge %']) {
  assert.equal(decide(sub(cmd)).block, true, `a wrapper value word is no command word: ${cmd}`);
}
// An ANSI-C quoted text is decoded before it is read as a command line.
for (const cmd of ["bash -c $'git\\x20push'", "bash -c $'git\\tpush'", "bash -c $'true\\ngit push'", "bash -c $'true\\x0agit push'"]) {
  assert.equal(decide(sub(cmd)).block, true, `an ANSI-C text is decoded: ${cmd}`);
}
// The API merge call is read per scanned command too.
assert.equal(decide(sub("sh -c 'GH_TOKEN=x gh api -X PUT /repos/o/r/pulls/1/merge'")).block, true, 'a gh api merge in quoted text behind NAME= is denied');
assert.equal(decide(sub('sudo tea api -X POST /repos/o/r/pulls/1/merge')).block, true, 'a tea api merge behind a wrapper is denied');
// A leading word that runs the command after it is skipped, as ledger-guard skips it.
for (const cmd of ['env A=1 git push', 'sudo git push', 'nohup git push', 'xargs git push', 'exec git push', 'eval git merge x',
  'command git push', 'sudo -u bob git rebase main', 'timeout 5 git push', 'env -u X git merge y']) {
  assert.equal(decide(sub(cmd)).block, true, `a guarded verb behind a wrapper is denied: ${cmd}`);
}
for (const cmd of ['arch -arm64 git push', 'arch -x86_64 git push', 'arch -arm64e git push', 'arch -arch arm64 git push', 'caffeinate -i git push',
  'caffeinate -t 5 git push', 'flock /tmp/l git push', 'flock -w 5 /tmp/l git push', 'flock -x /tmp/l git push', 'chronic git push', 'unbuffer git push',
  'unbuffer -p git push', 'ionice -c 2 -n 7 git push', 'ionice -c2 git push', 'taskset 0x1 git push', 'taskset -c 0,1 git push', 'nice -n 5 arch -arm64 git merge x']) {
  assert.equal(decide(sub(cmd)).block, true, `a guarded verb behind a wrapper is denied: ${cmd}`);
}
for (const cmd of ['sudo git status', 'env A=1 git log', 'xargs echo push', 'eval echo git merge', 'flock /tmp/push git status', 'taskset -c 0 echo push']) {
  assert.equal(decide(sub(cmd)).block, false, `a wrapped command with no guarded verb is allowed: ${cmd}`);
}

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

// --- the shared scanner reads the command (ADR 0135) ---
const ctl = (command) => ({ tool_input: { command } });
// a guarded verb after a git option value holding any shell construct
for (const cmd of [
  'git -C $(case x in a) y;; esac)/wt merge s',
  'git -C "$(echo "a b")" merge x',
  'git -C $(a $(b $(c))) merge x',
  'git -C $(a $(b $(c $(d)))) push',
  'git -C "a\nb" rebase x',
  'git -C $(echo a # )\n) merge x',
  'git -C $(echo ")") merge x',
  'git -C ${a:-$(b)} merge x',
  'git -c a=${a:-$(b)} push',
  'rtk git -C $(case x in a) y;; esac)/wt merge s',
  'rtk proxy -- git -C "$(echo "a b")" push',
  'echo $(git merge x)',
  'echo `git push`',
  '(git push)',
  'x=$(git rebase main)',
  'cat <(git push)',
  'cat <<E\n$(git merge x)\nE',
  'cat <<E\n`git push`\nE',
  "cat <<'E'\n$(git merge x)\nE",
  'x=1 git push',
]) {
  assert.equal(decide(sub(cmd)).block, true, `a subagent is denied: ${JSON.stringify(cmd)}`);
  assert.equal(decide(ctl(cmd)).block, false, `the controller is not: ${JSON.stringify(cmd)}`);
}
for (const cmd of [
  'git -C $(a $(b $(c))) log --grep push',
  'git log --grep merge',
  'git -C $(case x in a) y;; esac)/wt log --grep push',
  'git commit -m "wip" -- merge push',
  'echo "unterminated',
  'git -C $(echo ")") status',
]) assert.equal(decide(sub(cmd)).block, false, `a subagent may run: ${JSON.stringify(cmd)}`);
// the text of a quoted word is a command line too, whatever program receives it
for (const cmd of ['sh -c "git merge x"', 'ssh host "git push"', 'watch "git rebase main"', "bash -c 'cd x; git push'", 'x "y \\"z `git push`\\""']) {
  assert.equal(decide(sub(cmd)).block, true, `a quoted verb is denied: ${cmd}`);
  assert.equal(decide(ctl(cmd)).block, false, `the controller is not: ${cmd}`);
}
// a backslash-escaped word is a command line too, as its quoted spelling is (#1027)
for (const cmd of ['dash -c git\\ push', 'eval git\\ push', 'echo x | sh -c git\\ -C\\ y\\ merge\\ z', 'dash -c dash\\ -c\\ git\\\\\\ push']) {
  assert.equal(decide(sub(cmd)).block, true, `an escaped verb is denied: ${cmd}`);
  assert.equal(decide(ctl(cmd)).block, false, `the controller is not: ${cmd}`);
}
for (const cmd of ['git commit -m fix\\ git\\ push\\ bug', 'cat a\\ \\(1\\).txt']) {
  assert.equal(decide(sub(cmd)).block, false, `an escaped word reads as its quoted spelling: ${cmd}`);
}
{
  // An escape nested past MAX_QUOTED_DEPTH shell levels is unreadable, and the raw-text rule denies it.
  const esc = (s) => 'sh -c ' + s.replace(/[\\ ]/g, '\\$&');
  let s = 'git push';
  for (let k = 0; k <= require('../plugin/hooks/shell-words.js').MAX_QUOTED_DEPTH; k++) s = esc(s);
  assert.equal(require('../plugin/hooks/shell-words.js').scan(s, { quoted: true }).readable, false, 'an escape past the depth limit is unreadable');
  assert.equal(decide(sub(s)).block, true, 'and the unreadable-command rule denies it');
}
// dash runs `((…))` as nested subshells, so the guard also reads a command as dash reads it (#1062)
for (const cmd of ['dash -c "((git push))"', 'dash -c \\(\\(git\\ push\\)\\)', '((git push))']) {
  assert.equal(decide(sub(cmd)).block, true, `a (( verb is denied: ${cmd}`);
  assert.equal(decide(ctl(cmd)).block, false, `the controller is not: ${cmd}`);
}
for (const cmd of ['echo $((1 + 2))', '(( i++ ))', 'git log --grep "((push))"']) {
  assert.equal(decide(sub(cmd)).block, false, `arithmetic or a (( pattern keeps its verdict: ${cmd}`);
}
// every re-read level is read as dash reads it too, so a `((` escaped for a second shell level opens subshells there
for (const cmd of [
  'dash -c "dash -c \\\\(\\\\(git\\\\ push\\\\)\\\\)"',
  'dash -c dash\\ -c\\ \\\\\\(\\\\\\(git\\\\\\ push\\\\\\)\\\\\\)',
  'eval eval\\ \\\\\\(\\\\\\(git\\\\\\ push\\\\\\)\\\\\\)',
]) {
  assert.equal(decide(sub(cmd)).block, true, `a (( verb escaped for a second level is denied: ${cmd}`);
  assert.equal(decide(ctl(cmd)).block, false, `the controller is not: ${cmd}`);
}
// a run of backslashes in quoted text is no re-read level: an escaped word that escapes no whitespace, operator, backtick, or `$` spells no command line
for (const cmd of ["git commit -m 'escape \\\\\\\\n before push'", "git log --oneline -S'\\\\\\\\x' -- src/push.js", "git commit -m 'match \\\\\\\\$ before push'",
  "git commit -m 'match \\\\\\\\` before push'"]) {
  assert.equal(decide(sub(cmd)).block, false, `a backslash run keeps its verdict: ${cmd}`);
}
assert.equal(decide(sub('grep -E "x|git merge" file')).block, true, 'the known quoted false positive stays');
// The false-positive class: any quoted word whose text names a guarded integration is denied, read as a command line or, when
// it reads as none (a parenthesis, an apostrophe), by the raw-text rule.
for (const cmd of [
  'grep -rn "git merge" docs/',
  "rg 'git (merge|push)' plugin/",
  'git commit -m "fix(hooks): run-trace records a git merge behind rtk"',
  'git commit -m "docs: explain why git push is the controller\'s job"',
  'git commit -m "git push fails behind rtk"',
  'gh pr create --body "Run git push after review (see #12)"',
  'git commit -m "docs: use gh pr merge (not curl)"',
]) assert.equal(decide(sub(cmd)).block, true, `a quoted word naming a guarded integration is denied: ${cmd}`);
assert.match(decide(sub('git commit -m "git push fails behind rtk"')).reason, /quoted word/, 'the deny message names the quoted-word trigger');
// an unreadable command is denied only when its raw text holds `git` and later a guarded verb
for (const cmd of ['git merge "x', 'git -C $(a merge x', 'echo "a; git push', 'sh -c "git merge x', 'git ${ push', "git pull; echo '"]) {
  assert.equal(decide(sub(cmd)).block, true, `an unreadable git … verb is denied: ${cmd}`);
}
for (const cmd of ['echo "unterminated', 'merge push git "x', 'forgit push "x', 'git-merge "x']) {
  assert.equal(decide(sub(cmd)).block, false, `an unreadable command with no git … verb is allowed: ${cmd}`);
}
// a quoted text that does not read as a command line is judged by the raw-text rule alone
assert.equal(decide(sub('echo "git merge \'x"')).block, true, 'a quoted text holding git … merge that does not read is denied');
assert.equal(decide(sub('bash -c "git pull; echo don\'t"')).block, true, 'a quoted text holding git … pull that does not read is denied');
assert.equal(decide(sub('echo "it\'s a push"')).block, false, 'a quoted text with no git word is allowed');

// the guard fails closed when the scanner cannot be used (INV-0140)
{
  const brokenInstall = /broken|install/i;
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-guard-noscanner-'));
  try {
    const lone = path.join(dir, 'merge-guard.js');
    fs.copyFileSync(hookPath, lone); // no sibling shell-words.js: the require throws
    const { decide: loneDecide } = require(lone);
    const v = loneDecide(sub('echo hi'));
    assert.equal(v.block, true, 'an unloadable scanner denies the call');
    assert.match(v.reason, brokenInstall, 'and names the broken install');
    assert.equal(loneDecide(ctl('echo hi')).block, false, 'the controller is never denied');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const words = require('../plugin/hooks/shell-words.js');
  const realScan = words.scan;
  words.scan = () => { throw new Error('boom'); };
  try {
    const v = decide(sub('echo hi'));
    assert.equal(v.block, true, 'a scan that throws denies the call');
    assert.match(v.reason, brokenInstall);
    assert.equal(decide(ctl('git merge x')).block, false, 'the controller is never denied');
  } finally {
    words.scan = realScan;
  }
}

// a run of nested-substitution commands four times as long takes about four times the time against a same-run baseline (ADR 0086)
{
  // timePair repeats each sample to about 25 ms and takes the best of three, so neither a descheduled call nor a sub-millisecond
  // baseline sets the reading.
  const { timePair } = require('./linear-time');
  const nestedHeredocs = (d) => {
    let s = '';
    for (let k = d; k >= 1; k--) s = `cat <<E${k}\n$(${s})\nE${k}\n`;
    return s;
  };
  // Four times the input takes about four times as long when linear and sixteen times when quadratic; the ceiling sits at
  // nine, between them, loose for scheduler noise.
  const grows = (label, make, n) => {
    const [base, big] = timePair((cmd) => decide(sub(cmd)), make(n), make(4 * n));
    assert.ok(big < base * 9, `${label}: time grows linearly: ${n} repeats took ${base} ns, ${4 * n} took ${big} ns`);
  };
  grows('nested substitutions', (n) => 'git -C $(a $(b $(c))) log; echo "$(x $(y))" ;'.repeat(n), 2000);
  grows('nested heredocs', nestedHeredocs, 400);
  grows('many (( runs', (n) => 'echo "((x))" ((y)) \\(\\(z\\)\\);'.repeat(n), 2000);
  grows('many (( runs escaped for a second level', (n) => 'dash -c dash\\ -c\\ \\\\\\(\\\\\\(x\\\\\\ y\\\\\\)\\\\\\); eval "eval \\\\(\\\\(z\\\\)\\\\)";'.repeat(n), 2000);
  grows('many backslash-escaped words', (n) =>'echo ' + 'a\\ git\\ push\\ b '.repeat(n), 2000);
  grows('nested alias values', (n) => 'alias a="$( '.repeat(n) + 'x' + ' )"'.repeat(n), 2000);
  grows('long-spelled wrappers', (n) => ('env' + "''".repeat(600) + ' true; ').repeat(n), 20);
  // A sink is read once per command, however many heredocs it holds, and a tee sink's operands once.
  grows('one file sink holding many heredocs', (n) => 'cat > f ' + '<<E '.repeat(n) + '\n' + 'git push\nE\n'.repeat(n), 400);
  grows('a tee sink with many operands', (n) => 'tee -a ' + 'f '.repeat(n) + '<<E >/dev/null\ngit push\nE', 2000);
  grows('many file sinks', (n) => 'cat >> f <<E\nfix: git push\nE\n'.repeat(n), 400);
  // A message sink's options and git's `-c` values are read once for an editor.
  grows('a git message sink with many options', (n) => 'git ' + '-c a.b=c '.repeat(n) + 'commit ' + '-q '.repeat(n) + '-F - <<E\nfix: git push\nE', 2000);
  grows('a gh message sink with many options', (n) => 'gh pr create ' + '-l x '.repeat(n) + '--body-file - <<E\nfix: git push\nE', 2000);
  // A sink's text is read line by line for the base line rule, a long `rtk` lead-in and many lines included.
  grows('a sink body of many git lines', (n) => 'cat > f <<E\nfix: git push\n' + 'git log\n'.repeat(n) + 'E', 2000);
  grows('a sink body line of many rtk words', (n) => 'cat > f <<E\nfix: git push\n' + 'rtk '.repeat(n) + 'x\nE', 2000);
}

// a long run of newlines before a `tea`/`gh`/`git` lead-in must not backtrack quadratically (the comment
// above API_CALL owns why). Measured against the same run's own 2000-newline baseline through timePair (AGENTS.md, ADR 0086,
// ADR 0149): 10x the input costs ~10x when linear and ~100x when quadratic, so the 50x ceiling falsifies only the latter.
{
  const { timePair } = require('./linear-time');
  const run = (n) => {
    decide(sub('\n'.repeat(n) + 'tea api -X POST ' + M));
    decide(sub('\n'.repeat(n) + 'gh pr merge 5'));
    decide(sub('\n'.repeat(n) + 'git status'));
  };
  const [base, big] = timePair(run, 2000, 20000);
  assert.ok(big < 50 * base, `a long run of newlines must scale linearly: 2000 took ${base} ns, 20000 took ${big} ns`);
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
