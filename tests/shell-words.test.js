'use strict';

// Suite for plugin/hooks/shell-words.js, the shared Bash shell-word scanner (ADR 0135).
require('./fixture-git.js');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { assertSpawnDecided } = require('./spawn-verdict.js');
const { timePair } = require('./linear-time.js');
const { scan, gitSubcommand, rawNamesVerb, WRAPPER, optionWords, MAX_QUOTED_DEPTH, dashReading, drivePath } = require(path.join(__dirname, '..', 'plugin', 'hooks', 'shell-words.js'));

const cmds = (s, opts) => {
  const r = scan(s, opts);
  assert.equal(r.readable, true, `readable: ${s} (${r.reason})`);
  return r.commands;
};
const vals = (c) => c.words.map((w) => w.value);
const allVals = (s, opts) => cmds(s, opts).map(vals);
const unreadable = (s) => assert.equal(scan(s).readable, false, `unreadable: ${JSON.stringify(s)}`);

// --- the reproduction and gitSubcommand ---
assert.equal(gitSubcommand(cmds('git -C $(case x in a) y;; esac)/wt merge s')[0].words).subcommand, 'merge');
{
  const g = gitSubcommand(cmds('git -C "$(echo "a b")" merge x')[0].words);
  assert.equal(g.subcommand, 'merge');
  assert.deepEqual(g.values, ['$(echo "a b")'], 'the -C value is one word');
}
assert.equal(cmds('git -C "$(echo "a b")" merge x')[0].words[2].quoted, true);
assert.equal(gitSubcommand(['rtk', '-v', 'proxy', 'git', '-c', 'a=b', '--git-dir=/g', '--work-tree', '/w', '--no-pager', 'merge']).subcommand, 'merge');
assert.deepEqual(gitSubcommand(['git', '-C', 'p', '--git-dir=/g', '--namespace', 'n', 'push']).values, ['p', '/g', 'n']);
assert.equal(gitSubcommand(['echo', 'git', 'merge']), null, 'a command that is not git reads as null');

// --- rawNamesVerb: the raw-text rule for a command the scanner cannot read ---
{
  const VERB = /(?<![-\w])merge(?![-\w])/;
  assert.equal(rawNamesVerb('git -C x merge "y', VERB), true, 'git, then the verb');
  assert.equal(rawNamesVerb('merge then git "y', VERB), false, 'the verb before git does not count');
  assert.equal(rawNamesVerb('git-merge "x', VERB), false, 'git and the verb are whole words');
  // A global or sticky regex keeps no state between calls: the same text reads the same every time.
  const sticky = /(?<![-\w])merge(?![-\w])/g;
  for (let k = 0; k < 3; k++) assert.equal(rawNamesVerb('git merge x', sticky), true, 'a global verb regex reads the same on call ' + k);
  // A lead word other than git: `gh` or `tea`, then `pr merge`.
  const LEAD = /(?<![-\w])(?:gh|tea)(?![-\w])/g;
  for (let k = 0; k < 3; k++) assert.equal(rawNamesVerb('tea pr merge "x', /pr\s+merge/, LEAD), true, 'a global lead regex reads the same on call ' + k);
  assert.equal(rawNamesVerb('gh pr view "x', /pr\s+merge/, LEAD), false, 'the lead word without the verb');
}

// A backtick body is rescanned after its backslash-newline joins: `bash -n` accepts this fragment (it never parses the body),
// and the scanner reads the joined `pq' a#b …` body, finds an unterminated quote, and fails closed (INV-0140).
unreadable("\\\" `p\\\nq' a#b >/dev/null`");

// --- the shared prefix-wrapper table and its option reader ---
for (const [ws, n] of [[['-iu', 'bob'], 2], [['-uroot'], 1], [['-n', '5'], 1], [['--user=x'], 1], [['--user', 'x'], 2],
  [['--'], 1], [['-E'], 1], [['-D', '/x'], 2], [['--chdir', '/x'], 2]]) {
  assert.equal(optionWords(ws[0], WRAPPER.get('sudo')), n, 'sudo ' + ws.join(' ') + ' takes ' + n + ' word(s)');
}
assert.equal(optionWords('-n', WRAPPER.get('nice')), 2, 'nice -n takes its value');
assert.equal(optionWords('-n5', WRAPPER.get('nice')), 1, 'nice -n5 carries its value');
assert.equal(optionWords('-n', WRAPPER.get('nohup')), 1, 'a wrapper with no value options takes one word');
assert.equal(optionWords('-arm64e', WRAPPER.get('arch')), 1, "arch reads -arm64e whole, not as a cluster ending in -e's value");
assert.equal(optionWords('-arch', WRAPPER.get('arch')), 2, 'arch -arch takes its value');
assert.equal(gitSubcommand(['git', '-C']).subcommand, null);
assert.equal(gitSubcommand(['rtk', '-v', 'proxy', '--skip-env', '--', 'git', 'push']).subcommand, 'push', 'rtk options after the runner');
assert.equal(gitSubcommand(['rtk', 'proxy', 'rtk', 'run', '--', 'git', 'push']).subcommand, 'push', 'an rtk behind an rtk');
assert.equal(gitSubcommand(['rtk', 'log', 'git', 'push']), null, 'an rtk subcommand that runs nothing');
assert.equal(gitSubcommand(['rtk', '-C', '/wt', 'git', 'push']), null, 'an rtk option takes no value');
{
  const g = gitSubcommand(['x=1', 'rtk', 'git', '-C', 'p', '--work-tree=/w', '--git-dir', '/g', '--no-pager', '-c', 'a=b', 'merge', '--abort']);
  assert.equal(g.index, 11, 'index is the subcommand word position');
  assert.deepEqual(g.options, [
    { name: '-C', value: 'p' }, { name: '--work-tree', value: '/w' }, { name: '--git-dir', value: '/g' }, { name: '-c', value: 'a=b' },
  ], 'options are the value-taking global options in order');
  assert.equal(gitSubcommand(['git', '-C']).index, -1, 'no subcommand: index -1');
}

// --- one word across nested constructs ---
assert.deepEqual(allVals('echo $(a $(b $(c))) z')[0], ['echo', '$(a $(b $(c)))', 'z']);
assert.deepEqual(allVals('echo "a\nb" c')[0], ['echo', 'a\nb', 'c'], 'a newline inside a quoted value');
assert.deepEqual(allVals('echo $(case x in a) y;; esac) z')[0], ['echo', '$(case x in a) y;; esac)', 'z'], 'a case pattern paren');
assert.deepEqual(allVals('echo $(echo a # )\n) z')[0], ['echo', '$(echo a # )\n)', 'z'], 'a comment paren');
assert.deepEqual(allVals('echo $(echo ")") z')[0], ['echo', '$(echo ")")', 'z'], 'a quoted )');
assert.deepEqual(allVals('echo ${a:-$(b)} z')[0], ['echo', '${a:-$(b)}', 'z'], 'a ${…} holding a $(…)');
assert.deepEqual(allVals("echo $'a\\'b' z")[0], ['echo', "a'b", 'z']);
// `$'…'` decodes every ANSI-C escape bash decodes; an unknown one keeps its backslash.
assert.equal(allVals("echo $'\\n\\t\\r\\a\\b\\e\\E\\f\\v\\\\\\\"\\?\\x41\\x4a2\\101\\u00e9\\U0001F600\\cA\\z'")[0][1],
  '\n\t\r\x07\b\x1b\x1b\f\v\\"?AJ2Aé\u{1F600}\x01\\z');
for (const s of ["bash -c $'git\\x20push'", "bash -c $'git\\tpush'", "bash -c $'true\\ngit push'", "bash -c $'true\\x0agit push'", "bash -c $'git\\040push'"]) {
  assert.equal(allVals(s, { quoted: true }).some((ws) => ws[0] === 'git' && ws[1] === 'push'), true, 'an ANSI-C text decodes to a command line: ' + s);
}
assert.deepEqual(allVals('echo a\\ b')[0], ['echo', 'a b']);
assert.deepEqual(allVals('echo $((1 + (2))) z')[0], ['echo', '$((1 + (2)))', 'z']);
assert.deepEqual(allVals('echo a\\\nb')[0], ['echo', 'ab'], 'backslash-newline joins');

// --- nested commands ---
assert.deepEqual(allVals('a $(b c) d'), [['a', '$(b c)', 'd'], ['b', 'c']]);
assert.deepEqual(allVals('a `b c` d'), [['a', '`b c`', 'd'], ['b', 'c']]);
assert.deepEqual(allVals('(a; b) && c'), [['a'], ['b'], ['c']]);
assert.deepEqual(allVals('a <(b) >(c)'), [['a', '<(b)', '>(c)'], ['b'], ['c']]);
{
  const [outer, inner] = cmds('echo $(cat < f)');
  assert.deepEqual(vals(outer), ['echo', '$(cat < f)']);
  assert.equal(inner.redirects[0].op, '<', 'a redirect inside a substitution stays with the nested command');
  assert.equal(outer.redirects.length, 0);
}
assert.deepEqual(allVals('then git merge x'), [['git', 'merge', 'x']], 'a leading keyword is dropped');
assert.deepEqual(allVals('if a; then git merge x; fi'), [['a'], ['git', 'merge', 'x']]);
// INCOMPLETE_COMPOUND: no compound-grammar check, so a fragment cut after `then` or `do` reads.
for (const s of ['if a; then', 'while a; do']) assert.equal(scan(s).readable, true, s);
assert.deepEqual(allVals('f() { git merge x; }'), [['git', 'merge', 'x']]);
assert.deepEqual(allVals('case x in a|b) c;; *) d;; esac; e'), [['c'], ['d'], ['e']]);

// --- comments and heredocs ---
assert.deepEqual(allVals('echo a#b # c ) ( \' "\nz'), [['echo', 'a#b'], ['z']], 'a # mid-word is plain, a # at a word start is a comment');
assert.deepEqual(allVals('cat <<E\n) \' "\nE\nz'), [['cat'], ['z']]);
assert.deepEqual(allVals("cat <<-'E' <<F\n\t$x\n\tE\nb\nF\nz"), [['cat'], ['z']], 'quoted and <<- delimiters, several on a line');
assert.deepEqual(allVals('cat <<E \\\n x\nbody\nE\nz'), [['cat', 'x'], ['z']], 'a backslash-newline after the opener joins before the heredoc is read');
assert.deepEqual(allVals('echo $(cat <<E\nx )\nE\n) z')[0], ['echo', '$(cat <<E\nx )\nE\n)', 'z']);

// Inside `$( … )` and `<( … )` a line that starts with the delimiter and a `)` ends the body, and the `)` closes the substitution
// (bash 3.2 and 5 agree); inside a `( … )` subshell it does not.
assert.deepEqual(allVals('x=$(cat > f <<E\nx\nE)'), [['x=$(cat > f <<E\nx\nE)'], ['cat']]);
assert.deepEqual(allVals('x=$(cat <<-E\n\tx\n\tE);echo z').map((ws) => ws[0]), ['x=$(cat <<-E\n\tx\n\tE)', 'cat', 'echo']);
assert.deepEqual(allVals('cat <(cat <<E\nx\nE)').length, 2);
unreadable('( cat <<E\nx\nE)\necho z');
unreadable('x=$(cat <<A <<B\nx\nA)\nB\n)');

// --- a heredoc body a known shell reads on stdin is a command line (#1016); any other receiver's body stays data ---
{
  const runsPush = (s, opts) => allVals(s, opts).some((ws) => ws[0] === 'git' && ws[1] === 'push');
  for (const s of ['bash <<E\ngit push\nE', "bash <<'E'\ngit push\nE", 'bash <<"E"\ngit push\nE', 'bash <<-E\n\tgit push\n\tE',
    'bash << E\ngit push\nE', 'sh <<E\ngit push\nE', 'zsh <<E\ngit push\nE', 'dash <<E\ngit push\nE', 'ksh <<E\ngit push\nE',
    '/bin/bash <<E\ngit push\nE', 'env bash <<E\ngit push\nE', 'cat <<E | sh\ngit push\nE', 'bash -s <<E\ngit push\nE',
    'bash -s -- a <<E\ngit push\nE', 'sh /dev/stdin <<E\ngit push\nE', 'source /dev/stdin <<E\ngit push\nE', '. /dev/stdin <<E\ngit push\nE',
    '. /dev/fd/0 <<E\ngit push\nE', 'x=$(bash <<E\ngit push\nE\n)', 'cat <<A; bash <<B\ndata\nA\ngit push\nB', 'bash <<E\necho \\$(git push)\nE']) {
    assert.equal(runsPush(s), true, 'a shell reads the body: ' + JSON.stringify(s));
  }
  for (const s of ['bash -c "$(cat <<E\ngit push\nE\n)"', 'eval "$(cat <<E\ngit push\nE\n)"', "eval \"$(cat <<'E'\ngit push\nE\n)\"", 'eval $(cat <<E\ngit push\nE\n)']) {
    assert.equal(runsPush(s, { quoted: true }), true, 'a body fed through $(cat …) into a command line: ' + JSON.stringify(s));
  }
  for (const s of ['cat <<E\ngit push\nE', "cat <<'E'\ngit push\nE", 'bash -c true <<E\ngit push\nE', 'bash script.sh <<E\ngit push\nE',
    'ssh host <<E\ngit push\nE', 'python3 <<E\ngit push\nE', 'x=$(cat <<E\ngit push\nE\n)', 'cat <<A; bash <<B\ngit push\nA\ndata\nB']) {
    assert.equal(runsPush(s, { quoted: true }), false, 'the body is data: ' + JSON.stringify(s));
  }
  // A here-string, and the text `echo` or `printf` writes, that a known shell reads on stdin is quoted text read as a command line.
  for (const s of ["bash <<<'git push'", 'bash <<<"git push"', 'bash <<< "git push"', "sh <<<$'git\\x20push'", 'cat <<<"git push" | sh',
    'echo git push | sh', 'echo "git" "push" | sh', 'sh < <(echo git push origin x)', ". <(echo 'git push')", "printf 'true\\ngit push' | sh",
    "printf 'git\\x20push' | sh", "echo -e 'true\\ngit push' | bash", 'echo git push | tr a a | sh']) {
    assert.equal(runsPush(s, { quoted: true }), true, 'a shell reads the text: ' + JSON.stringify(s));
  }
  for (const s of ['cat <<<"git push"', 'grep x <<<"git push"', 'echo git push | cat', 'diff <(echo git push) f', 'sh -c true < <(echo git push)']) {
    assert.equal(runsPush(s, { quoted: true }), false, 'the text is data: ' + JSON.stringify(s));
  }
  assert.deepEqual(cmds('echo echo x \\> f | sh', { quoted: true }).find((c) => c.level === 1).redirects.map((r) => r.op + r.target.value), ['>f'],
    'an escaped redirect in echo text is a redirect to the shell that reads it');
  // A quoted word with an unquoted `NAME=` or command-string option prefix is read as a command line past the prefix too.
  for (const s of ["alias g='git push origin x'", "export PROMPT_COMMAND='git push'", "env -S'git push origin x'", "env --split-string='git push'",
    "su -c'git push'", "su --command='git push'", "su -lc'git push'"]) {
    assert.equal(runsPush(s, { quoted: true }), true, 'the text past the prefix is a command line: ' + JSON.stringify(s));
  }
  // The body keeps its redirect, and a body a shell reads runs in a child shell: one subshell level down.
  const r = scan('bash <<E\ngit push\nE');
  assert.equal(r.commands[0].redirects[0].body, 'git push\n');
  assert.equal(r.commands.find((c) => c.words[0].value === 'git').nest, 1);
}

// --- backslash-newline joins where bash joins it ---
assert.deepEqual(allVals('echo A # c \\\ngit merge s'), [['echo', 'A'], ['git', 'merge', 's']], 'a comment ends at its newline, backslash or not');
assert.deepEqual(allVals("cat <<'E'\nfoo\\\nE\ngit merge s\nE"), [['cat'], ['git', 'merge', 's'], ['E']], 'a quoted delimiter keeps backslash-newline literal in the body');
assert.deepEqual(allVals('cat <<E\nfoo\\\nE\ngit merge s\nE\necho z'), [['cat'], ['echo', 'z']], 'an unquoted delimiter joins the body lines');
assert.deepEqual(allVals("echo 'a\\\nb'")[0], ['echo', 'a\\\nb'], 'single quotes keep backslash-newline');
assert.deepEqual(allVals('echo "a\\\nb"')[0], ['echo', 'ab'], 'double quotes join it');
assert.deepEqual(allVals('echo a \\\n b')[0], ['echo', 'a', 'b'], 'unquoted, it separates nothing and joins nothing');
assert.deepEqual(allVals('echo $(a\\\nb c)')[1], ['ab', 'c'], 'inside a substitution');
assert.deepEqual(allVals('echo \\\\\\\n# x\ngit merge s')[1], ['git', 'merge', 's'], 'an escaped backslash before the continuation');

// --- compound shapes ---
assert.deepEqual(allVals('a=(1 2) b=x git merge s'), [['a=(1 2)', 'b=x', 'git', 'merge', 's']], 'an array assignment');
assert.deepEqual(allVals('declare -a x=(1 $(git merge s))')[1], ['git', 'merge', 's'], 'a substitution inside an array');
assert.equal(scan('echo a=(1 2)').readable, false, 'an array after a plain command word is a syntax error');
assert.deepEqual(allVals('[[ ( a == b ) ]] && git merge s'), [['[[', '(', 'a', '==', 'b', ')', ']]'], ['git', 'merge', 's']], '[[ ]] holds parens as words');
assert.deepEqual(allVals('[[ a < b ]]'), [['[[', 'a', '<', 'b', ']]']], '[[ ]] holds < as a word');
assert.equal(scan('[[ a == b ]]; echo ( x').readable, false, 'parens are plain only inside [[ ]]');
assert.deepEqual(allVals('echo $((cmd) ) z')[0], ['echo', '$((cmd) )', 'z'], '$(( falls back to $( ( when it is no arithmetic');
assert.deepEqual(allVals('echo $((cmd) )')[1], ['cmd'], 'the fallback reads the subshell');
assert.deepEqual(allVals('((a) ) && git merge s').pop(), ['git', 'merge', 's'], '(( falls back to two subshells');
assert.deepEqual(allVals('coproc git merge s'), [['git', 'merge', 's']], 'coproc is a reserved word');
assert.deepEqual(allVals('coproc NAME { git zz x; }'), [['git', 'zz', 'x']], 'coproc NAME { … } drops the name');
assert.deepEqual(allVals('coproc NAME (git zz x)'), [['git', 'zz', 'x']], 'coproc NAME ( … ) drops the name');
assert.deepEqual(allVals('coproc NAME git zz x'), [['NAME', 'git', 'zz', 'x']], 'coproc NAME cmd: the name is the command');

// `$$` is the PID parameter: both dollars are consumed before any `$'` check
assert.deepEqual(allVals("echo $$'a\\' x"), [['echo', '$$a\\', 'x']], '$$ then a single-quoted word');
assert.deepEqual(allVals("echo $$$$'a b' x"), [['echo', '$$$$a b', 'x']], '$$$$ then a single-quoted word');
assert.deepEqual(allVals("echo $$$'a\\'b' x"), [['echo', "$$a'b", 'x']], 'an odd run leaves the last $ to open $\'…\'');
assert.deepEqual(allVals('echo "$$"x'), [['echo', '$$x']], '$$ inside double quotes');

// `nest`: 0 in the current shell, +1 per subshell or substitution
{
  const nests = (s, opts) => cmds(s, opts).map((c) => `${c.words[0].value}:${c.nest}`);
  assert.deepEqual(nests('cd a; echo x'), ['cd:0', 'echo:0']);
  assert.deepEqual(nests('(cd a); echo x'), ['cd:1', 'echo:0'], 'a subshell');
  assert.deepEqual(nests('echo $(cd a); echo x'), ['echo:0', 'cd:1', 'echo:0'], 'a substitution');
  assert.deepEqual(nests('echo `cd a`; echo x'), ['echo:0', 'echo:0', 'cd:1'], 'a backtick group (its commands follow the text that holds it)');
  assert.deepEqual(nests('cat <(cd a) >(cd b)'), ['cat:0', 'cd:1', 'cd:1'], 'process substitutions');
  assert.deepEqual(nests('{ cd a; }; echo x'), ['cd:0', 'echo:0'], 'a brace group runs in the current shell');
  assert.deepEqual(nests('if a; then cd b; fi; f() { cd c; }'), ['a:0', 'cd:0', 'cd:0'], 'compound bodies');
  assert.deepEqual(nests('a | cd b'), ['a:0', 'cd:0'], 'a pipeline stays at the enclosing nest');
  assert.deepEqual(nests('(a $(b `c`))'), ['a:1', 'b:2', 'c:3'], 'two and more levels');
  assert.deepEqual(nests('echo "$(cd a)"'), ['echo:0', 'cd:1'], 'a substitution in double quotes');
  assert.deepEqual(nests('cat <<E\n$(cd a)\nE'), ['cat:0', 'cd:1'], 'a substitution in a heredoc body');
  const q = cmds('(sh -c "cd a; (cd b)")', { quoted: true });
  assert.deepEqual(q.map((c) => [c.words[0].value, c.level, c.nest]), [['sh', 0, 1], ['cd', 1, 0], ['cd', 1, 1]], 'quoted text counts nest within itself');
}

// `sep`: the operator that follows a command in its own text or group, `''` for the last one
{
  const seps = (s) => cmds(s).map((c) => `${c.words[0].value}${c.sep === '' ? '.' : c.sep.replace('\n', '\\n')}`);
  assert.deepEqual(seps('a && b || c; d | e |& f & g\nh'), ['a&&', 'b||', 'c;', 'd|', 'e|&', 'f&', 'g\\n', 'h.']);
  assert.deepEqual(seps('echo $(a | b) | c'), ['echo|', 'a|', 'b.', 'c.'], 'a group ends its own commands');
  assert.deepEqual(seps('a;\nb'), ['a;', 'b.'], 'the first operator wins');
  assert.deepEqual(seps('echo >|f; g'), ['echo;', 'g.'], 'a `>|` redirect is no pipe');
  assert.deepEqual(seps('cat <<E\nx\nE\ng'), ['cat\\n', 'g.'], 'a heredoc body is no operator');
}

// a subshell's last command takes the operator after its `)`
{
  const seps = (s) => cmds(s).map((c) => `${c.words[0].value}${c.sep}`);
  assert.deepEqual(seps('(a | b) && c'), ['a|', 'b&&', 'c']);
  assert.deepEqual(seps('echo $(a) | c'), ['echo|', 'a', 'c'], 'a substitution keeps its own end');
}

// `negated`: the command follows a `!`
{
  const neg = (s) => cmds(s).map((c) => `${c.words[0].value}${c.negated ? '!' : ''}`);
  assert.deepEqual(neg('! a; b'), ['a!', 'b']);
  assert.deepEqual(neg('if ! a; then b; fi'), ['a!', 'b']);
  assert.deepEqual(neg('a && ! b | c'), ['a', 'b!', 'c']);
  // The `!` reaches the first command behind a keyword, `time` and its options, and every command of a group it precedes.
  assert.deepEqual(neg('! time a'), ['a!']);
  assert.deepEqual(neg('! time -p a'), ['a!']);
  // Every command of a negated group is marked, nested groups included, and none after the group closes.
  assert.deepEqual(neg('! { a; b; }'), ['a!', 'b!']);
  assert.deepEqual(neg('! (a; b)'), ['a!', 'b!']);
  assert.deepEqual(neg('! { a; (b; c); }; d'), ['a!', 'b!', 'c!', 'd']);
  assert.deepEqual(neg('! (a; { b; }); c'), ['a!', 'b!', 'c']);
  assert.deepEqual(neg('{ a; }; b'), ['a', 'b']);
  assert.deepEqual(neg('! ( ! a )'), ['a!'], 'a nested `!` stays');
  assert.deepEqual(neg('(a); b'), ['a', 'b'], 'a group with no `!` is no negation');
  // A newline ends the negation a dropped keyword or group left behind.
  assert.deepEqual(neg('! { a; }\nb'), ['a!', 'b']);
  assert.deepEqual(neg('! time\nb'), ['b']);
  assert.deepEqual(neg('! {\na\n}\nb'), ['a!', 'b']);
}

// `negation`: the scan result says whether the text holds an unquoted `!` as a reserved word, wherever its negation lands
{
  const negation = (s) => scan(s).negation;
  for (const s of ['! a', '! case x in *) a;; esac', '! if a; then b; fi', '! while a; do :; done; b', '! { cd d; a; }', '! [[ -n x ]] || a', 'x && ! a', 'echo `! a`', 'echo $(! a)']) assert.strictEqual(negation(s), true, s);
  for (const s of ['echo "!"; a', "echo '!'; a", '[[ a != b ]] && a', '[[ ! -n x ]] && a', 'echo $((!x)); a', 'echo a!b', 'echo !', 'echo "! a"', 'echo \\! a']) assert.strictEqual(negation(s), false, s);
}

// A `!` inside `[[ … ]]` reads true except as the first word (`[[ ! … ]]`): the doc names the over-read.
assert.strictEqual(scan('[[ a && ! b ]] && c').negation, true);

// `compound`: the text holds compound structure the scanner drops at the top level (reserved words, groups, `[[`, `((`, a function header)
{
  const compound = (s) => scan(s).compound;
  for (const s of ['if a; then b; fi', 'case x in *) a;; esac', 'case $(a) in *) ;; esac', 'for i in 1; do a; done', 'for ((i=0;i<1;i++)); do a; done', 'while a; do b; done', 'until a; do b; done',
    'select x in 1; do a; done', '{ a; }', '(a)', '[[ -n x ]] && a', '((x)); a', 'f() { a; }', 'function f { a; }', 'coproc a', 'time coproc a', 'x && (a; b)', 'echo `if a; then b; fi`']) assert.strictEqual(compound(s), true, s);
  for (const s of ['a && b', 'echo $(a)', 'echo `a`', 'cat <(a)', 'echo $((1+2))', '! a', 'time a', 'echo "if a; then b; fi"', "echo '{ a; }'", 'echo { a }', 'echo "$(a)"']) assert.strictEqual(compound(s), false, s);
}

// `fnBare`: a function header followed by a body that is no `{ … }` or `( … )` group
{
  const fnBare = (s) => scan(s).fnBare;
  for (const s of ['f() case x in *) a;; esac', 'f() for i in 1; do a; done', 'f() if a; then b; fi', 'f() while a; do b; done', 'f() until a; do b; done', 'f() select x in 1; do a; done',
    'f() [[ -n x ]]', 'f() (( x ))', 'function f case x in *) a;; esac', 'f()\ncase x in *) a;; esac']) assert.strictEqual(fnBare(s), true, s);
  for (const s of ['f() { a; }', 'f() ( a )', 'function f { a; }', 'function f () { a; }', 'f()\n{\na\n}', 'a; b']) assert.strictEqual(fnBare(s), false, s);
}

// `fn`: the command sits in a function body
{
  const fn = (s) => cmds(s).map((c) => `${c.words[0].value}${c.fn ? '^' : ''}`);
  assert.deepEqual(fn('x() { a; }; b'), ['a^', 'b']);
  assert.deepEqual(fn('function x { a; b; }; c'), ['a^', 'b^', 'c']);
  assert.deepEqual(fn('function x () { a; }; b'), ['a^', 'b']);
  assert.deepEqual(fn('x()\n{\na\n}\nb'), ['a^', 'b']);
  assert.deepEqual(fn('x() { { a; }; (b); echo $(c); }; d'), ['a^', 'b^', 'echo^', 'c^', 'd']);
  assert.deepEqual(fn('x() ( a ); b'), ['a^', 'b']);
  assert.deepEqual(fn('{ a; }; b'), ['a', 'b'], 'a plain group is no function body');
  assert.deepEqual(fn('x() { cat <<E\n$(a)\nE\n}; b'), ['cat^', 'a^', 'b']);
  assert.deepEqual(fn('x() { echo `a`; }; b'), ['echo^', 'b', 'a^'], 'a backtick group follows the text that holds it');
}

// `at`: where the command starts, so a backtick group's commands sort to the spot of their backtick
{
  const order = (s) => [...cmds(s)].sort((x, y) => x.at - y.at).map((c) => c.words[0].value);
  assert.deepEqual(order('echo `cat > f`; cd a'), ['echo', 'cat', 'cd']);
  assert.deepEqual(order('echo `a \\`b\\``; c'), ['echo', 'a', 'b', 'c']);
}

// `group`: one id per subshell instance, equal for the commands of one instance
{
  const grp = (s) => cmds(s).map((c) => c.group);
  const [a, b] = grp('(cd a); (echo x)');
  assert.notEqual(a, b, 'sibling subshells differ');
  const [c, d, e] = grp('(a $(b); c)');
  assert.equal(c, e, 'one subshell, one id');
  assert.notEqual(c, d);
  const [f, g] = grp('a; b');
  assert.equal(f, g, 'the current shell shares one id');
  assert.notEqual(grp('a; (b)')[0], grp('a; (b)')[1]);
}

// `inst`: the chain of shell instances a command runs in, innermost first; null for the shell the scan starts from
{
  const ids = (n) => { const a = []; for (; n; n = n.up) a.push(n.id); return a; };
  const inst = (s) => cmds(s).map((c) => ids(c.inst));
  assert.deepEqual(inst('a; b && c'), [[], [], []], 'the current shell is no instance');
  const [x, y] = inst('a | b');
  assert.notDeepEqual(x, y, 'each pipeline stage is an instance of its own');
  const [p, q, r] = inst('cat | { cd a; echo; }');
  assert.deepEqual(q, r, 'a compound stage is one instance');
  assert.notDeepEqual(p, q);
  const [j, k, o] = inst('cd a && echo & echo');
  assert.deepEqual([j.length, o.length], [1, 0], 'an `&` job is an instance, the command after it is not');
  assert.deepEqual(j, k, 'an and-or list runs in one job');
  const [s, t] = inst('(cd a); ( (echo) )');
  assert.equal(t.length, 2, 'a nested subshell names its parent');
  assert.notEqual(t[1], s[0], 'sibling subshells differ');
  assert.deepEqual(inst('echo $(cd a | cat)').slice(1).map((c) => c.length), [2, 2], 'a stage inside a substitution sits in it');
  const [c1, c2, c3] = inst('coproc { cd a; echo; }; echo');
  assert.deepEqual([c1.length, c3.length], [1, 0], 'a coprocess is an instance, the command after it is not');
  assert.deepEqual(c1, c2, 'a coprocess body is one instance');
}

// a locale string `$"…"` reads like a double-quoted string, without the `$`
{
  const [c] = cmds('bash -c $"perl -pi -e x f"');
  assert.equal(c.words[2].value, 'perl -pi -e x f', 'the $ is dropped');
  assert.equal(c.words[2].spans[0].quote, 'double');
  assert.equal(c.words[2].quoted, true);
}
assert.deepEqual(allVals('echo a$"b $(c)"d')[0], ['echo', 'ab $(c)d'], 'a locale string inside a word');
assert.deepEqual(allVals('echo "a$"b')[0], ['echo', 'a$b'], 'inside double quotes `$"` is a literal $ and a closing quote');
assert.deepEqual(allVals('sh -c $"git zz x"', { quoted: true }).map((w) => w[0]), ['sh', 'git'], 'quoted reading sees the text');

// --- a heredoc body with an unquoted delimiter expands substitutions; a quoted delimiter keeps it literal ---
assert.deepEqual(allVals('cat <<E\n$(git zz x)\nE'), [['cat'], ['git', 'zz', 'x']], 'a $(…) in an unquoted heredoc body');
assert.deepEqual(allVals('cat <<E\n`git zz x`\nE'), [['cat'], ['git', 'zz', 'x']], 'a backtick group in an unquoted heredoc body');
assert.deepEqual(allVals('cat <<E\nfoo "$(git zz x)" ${a:-$(b)} \'q\n$((1+(2))) \\$(c)\nE\nz').map((w) => w[0]), ['cat', 'git', 'b', 'z'], 'double-quote rules, no closing quote');
assert.deepEqual(allVals("cat <<'E'\n$(git zz x)\nE"), [['cat']], 'a single-quoted delimiter keeps the body literal');
assert.deepEqual(allVals('cat <<"E"\n$(git zz x)\nE'), [['cat']], 'a double-quoted delimiter keeps the body literal');
assert.deepEqual(allVals('cat <<\\E\n$(git zz x)\nE'), [['cat']], 'a backslash delimiter keeps the body literal');
assert.deepEqual(allVals('cat <<E\n$(git \\\nzz x)\nE'), [['cat'], ['git', 'zz', 'x']], 'a continuation joins inside the body');
unreadable('cat <<E\n$(git zz x\nE\n)');
assert.equal(gitSubcommand(cmds('x=1 git zz x')[0].words).subcommand, 'zz', 'leading assignment words are skipped');
assert.equal(gitSubcommand(['x=1', 'y=2', 'rtk', 'git', 'zz']).subcommand, 'zz');
assert.equal(gitSubcommand(['x=1']), null);
assert.deepEqual(allVals('time -p git merge s'), [['git', 'merge', 's']], 'time -p is a reserved word with its option');
assert.deepEqual(allVals('time -x'), [['-x']], 'only -p belongs to time');
assert.equal(scan('git zz s () { :; }').readable, false, 'a function name is one word');
assert.deepEqual(allVals('function f () { git merge s; }'), [['git', 'merge', 's']]);
assert.deepEqual(allVals('function f { git merge s; }; f'), [['git', 'merge', 's'], ['f']], 'the no-parens function form drops its header');
assert.deepEqual(allVals('function f\n{ git merge s; }'), [['git', 'merge', 's']], 'the brace on the next line');
assert.deepEqual(allVals('sh -c "function f { git merge s; }; f"', { quoted: true }).map((w) => w.join(' ')), ['sh -c function f { git merge s; }; f', 'git merge s', 'f']);
assert.equal(scan('function f (x) { :; }').readable, false, 'parens after a function name hold nothing');
assert.deepEqual(allVals('[[ $x =~ ^(a|b)$ ]] && git merge s'), [['[[', '$x', '=~', '^(a|b)$', ']]'], ['git', 'merge', 's']], '| inside [[ ( ) ]] is a word character');
assert.deepEqual(allVals('[[ ( a && b ) ]]'), [['[[', '(', 'a', '&&', 'b', ')', ']]']], '& inside [[ ( ) ]] is a word character');
assert.deepEqual(allVals('for ((i=0;i<3;i++)); do git merge s; done'), [['git', 'merge', 's']], 'an arithmetic for');
assert.deepEqual(allVals('for ((;;)) do git merge s; break; done'), [['git', 'merge', 's'], ['break']]);
assert.equal(scan('for ((i=0;i<3;i++) ); do :; done').readable, false, 'an arithmetic for that does not close');
assert.deepEqual(allVals('time -p -- git merge s'), [['git', 'merge', 's']], 'time -p --');
assert.deepEqual(allVals('time -- git merge s'), [['git', 'merge', 's']], 'time --');

// --- redirects ---
{
  const [c] = cmds('a 2>/dev/null >&2 &>f >>g <<< h 3<&-');
  assert.deepEqual(c.redirects.map((r) => [r.fd, r.op, r.target.value]), [['2', '>', '/dev/null'], [null, '>&', '2'], [null, '&>', 'f'], [null, '>>', 'g'], [null, '<<<', 'h'], ['3', '<&', '-']]);
  assert.deepEqual(vals(c), ['a']);
}
assert.equal(cmds('echo $((1>2)) x')[0].redirects.length, 0, '$((…)) carries no redirect');
// `$[ … ]` is arithmetic like `$(( … ))`: its `>` is no redirect, and the substitutions and backtick groups it holds run.
assert.equal(cmds('echo $[1>2] x')[0].redirects.length, 0, '$[…] carries no redirect');
assert.deepEqual(allVals('echo $[1+$(git push)] z'), [['echo', '$[1+$(git push)]', 'z'], ['git', 'push']], 'a substitution in $[…] is read');
assert.deepEqual(allVals('echo $[1+`git push`]').map((w) => w[0]), ['echo', 'git'], 'a backtick group in $[…] is read');
assert.deepEqual(allVals('echo $[a[1]+$(b)]')[1], ['b'], 'nested brackets in $[…] balance');
assert.deepEqual(allVals("echo $[ ']' + $(git push) ]")[1], ['git', 'push'], 'a quoted ] in $[…] closes nothing');
// bash reads quotes inside `$(( … ))` and `(( … ))` too: a quoted `)` closes nothing, and the substitution after it runs.
assert.deepEqual(allVals('echo $(( ")" + $(git push) ))')[1], ['git', 'push'], 'a double-quoted ) in $((…)) closes nothing');
assert.deepEqual(allVals("echo $(( ')' + $(git push) ))")[1], ['git', 'push'], 'a single-quoted ) in $((…)) closes nothing');
assert.deepEqual(allVals('(( ")" + $(git push) ))')[0], ['git', 'push'], 'a quoted ) in ((…)) closes nothing');
assert.equal(cmds('case x in a>b) c;; esac').length, 1);
assert.equal(cmds('case x in a<b) c;; esac')[0].redirects.length, 0, 'a case pattern carries no redirect');
assert.equal(cmds('echo 2 > f')[0].words.length, 2, 'a digit word apart from the operator is a word');

// --- quoted text as a command line ---
assert.deepEqual(allVals('sh -c "git merge x"', { quoted: true }), [['sh', '-c', 'git merge x'], ['git', 'merge', 'x']]);
assert.equal(cmds('sh -c "git merge x"', { quoted: true })[1].level, 1);
assert.deepEqual(allVals('sh -c "git merge x"'), [['sh', '-c', 'git merge x']], 'quoted text is read only on request');
{
  // A quoted text that is no command line leaves the scan readable and comes back in `failedQuoted`, so a
  // caller applies its raw-text rule to those texts alone.
  const r = scan("sh -c \"git merge s\n'\"", { quoted: true });
  assert.equal(r.readable, true);
  assert.deepEqual(r.failedQuoted, ["git merge s\n'"], 'the failed text still shows its first line to the caller');
  assert.deepEqual(r.commands.map(vals), [['sh', '-c', "git merge s\n'"]]);
}
{
  const r = scan('grep "it\'s" f', { quoted: true });
  assert.equal(r.readable, true, 'quoted text that is no command line leaves the scan readable');
  assert.deepEqual(r.failedQuoted, ["it's"]);
  assert.deepEqual(r.commands.map(vals), [['grep', "it's", 'f']]);
}
{
  const r = scan('git commit -m "fix(merge-guard): stop"', { quoted: true });
  assert.equal(r.readable, true);
  assert.deepEqual(r.failedQuoted, ['fix(merge-guard): stop']);
  assert.deepEqual(r.commands.map(vals), [['git', 'commit', '-m', 'fix(merge-guard): stop']]);
  assert.equal(gitSubcommand(r.commands[0].words).subcommand, 'commit');
}
assert.equal(scan('git commit -m "don\'t push"', { quoted: true }).readable, true);
{
  // A level-2 failure keeps the level-1 commands and returns the level-2 text.
  const r = scan('sh -c "sh -c \\"git merge x; (\\""', { quoted: true });
  assert.equal(r.readable, true);
  assert.deepEqual(r.failedQuoted, ['git merge x; (']);
  assert.deepEqual(r.commands.map(vals), [['sh', '-c', 'sh -c "git merge x; ("'], ['sh', '-c', 'git merge x; (']]);
}
{
  // A failed text comes back whole; the backtick body it queued before failing is not read as a command.
  const r = scan('sh -c "echo \\`git merge x\\` \'"', { quoted: true });
  assert.equal(r.readable, true);
  assert.deepEqual(r.failedQuoted, ["echo `git merge x` '"]);
  assert.deepEqual(r.commands.map(vals), [['sh', '-c', "echo `git merge x` '"]]);
}
// bash strips the backslash of an escaped double quote inside a backtick body that sits in double quotes.
assert.deepEqual(allVals('echo "`echo \\"(\\"`"'), [['echo', '`echo "("`'], ['echo', '(']]);
assert.deepEqual(scan('sh -c "git merge x"', { quoted: true }).failedQuoted, [], 'no failed text: an empty list');
assert.deepEqual(scan('grep "it\'s" f').failedQuoted, [], 'no quoted reading, no failed text');
assert.equal(scan('grep "it\'s" f').readable, true, 'quoted text is read only on request');
{
  const wrap = (s) => 'sh -c "' + s.replace(/[\\"$`]/g, '\\$&') + '"';
  let s = 'git merge x';
  for (let k = 1; k <= MAX_QUOTED_DEPTH + 1; k++) {
    s = wrap(s);
    const r = scan(s, { quoted: true });
    assert.equal(r.readable, k <= MAX_QUOTED_DEPTH, `quoted depth ${k}`);
    if (r.readable) assert.equal(r.commands.filter((c) => vals(c)[0] === 'git').length, 1, `the git command is found at depth ${k}`);
  }
}

// --- dashReading: a command as dash reads it, each `((` that is no `$((` spread into nested subshells (#1062) ---
assert.equal(dashReading('((git push))'), '( (git push))');
assert.equal(dashReading('dash -c "(((a)))"'), 'dash -c "( ( (a)))"');
assert.equal(dashReading('dash -c \\(\\(git\\ push\\)\\)'), 'dash -c \\(\\ \\(git\\ push\\)\\)', 'an escaped run spreads with an escaped space');
assert.equal(dashReading('a \\\n((b))'), 'a ( (b))', 'a backslash-newline is joined first');
for (const c of ['echo $((1 + 2))', 'echo $(((1) * 2))', 'git status', 'echo (a)']) assert.equal(dashReading(c), null, `${c}: nothing to spread`);

// --- unreadable ---
for (const s of ["echo 'a", 'echo "a', 'echo $(a', 'echo ${a', 'echo `a', 'echo $((1', 'cat <<E\nx', 'cat <<E', 'echo )', 'echo (a', 'case x in a) b', 'a &&', 'a >', "echo $'a", 'echo $(a "b)"']) unreadable(s);
for (const s of ['', ' ', '\\', '$', '$(', '`', '<<', '"', "'", '))))', '${', '$((', ';;', '\u0000', '\ud800']) {
  assert.doesNotThrow(() => scan(s), JSON.stringify(s));
  assert.doesNotThrow(() => scan(s, { quoted: true }));
}
assert.equal(scan(null).readable, false, 'a non-string never throws');

// --- linear time against a same-run baseline (ADR 0086) ---
{
  const unit = 'git -C $(a $(b $(c))) x;';
  for (const reps of [5000, 20000]) assert.equal(scan(unit.repeat(reps)).readable, true);
  const [base, big] = timePair(scan, unit.repeat(5000), unit.repeat(20000));
  // Four times the input takes about four times as long when linear and sixteen times as long when quadratic;
  // the ceiling sits between them, loose for scheduler noise.
  assert.ok(big < base * 9, `scan time grows linearly: ${base} ns, four times the input ${big} ns`);
}

// --- nesting costs linear time and memory, with and without quoted-text reading ---
{
  // Four times the input takes about four times as long when linear and sixteen times as long when quadratic;
  // the ceiling sits between them, loose for scheduler noise. A quadratic memory cost aborts the run instead.
  const quadruples = (label, make, opts, verdict) => {
    if (verdict !== undefined) assert.equal(scan(make(20000), opts).readable, verdict, `${label}: verdict`);
    const [base, big] = timePair((s) => scan(s, opts), make(5000), make(20000));
    assert.ok(big < base * 9, `${label}: time grows linearly: ${base} ns, four times the input ${big} ns`);
  };
  quadruples('nested $(', (d) => '$('.repeat(d) + 'a' + ')'.repeat(d), undefined, true);
  quadruples('nested $( in double quotes', (d) => '"$('.repeat(d) + 'a' + ')"'.repeat(d), undefined, true);
  quadruples('nested ${…$(', (d) => '${a:-$('.repeat(d) + 'a' + ')}'.repeat(d), undefined, true);
  // An `alias` argument is read for its name and a capped prefix of its value, never its whole value.
  quadruples('nested alias values', (d) => 'alias a="$( '.repeat(d) + 'x' + ' )"'.repeat(d), undefined, true);
  quadruples('nested alias words', (d) => 'alias "$( '.repeat(d) + 'x' + ' )"'.repeat(d), undefined, true);
  // Every here-string's text joins `texts`, charged to the heredoc re-read budget before it is built: a nest of them reads unreadable.
  quadruples('nested here-strings', (d) => 'cat <<<"$( '.repeat(d) + 'x' + ' )"'.repeat(d), undefined, false);
  quadruples('quoted text, many commands', (d) => 'sh -c "git -C $(a $(b)) x";'.repeat(d / 5), { quoted: true }, true);
  quadruples('ANSI-C escapes', (d) => "bash -c $'" + 'g\\x20\\101\\n\\u00e9\\cA'.repeat(d / 4) + "'", { quoted: true }, true);
  // `$((` and `((` that do not close as arithmetic read again as subshells; every rewind spends from a
  // budget in proportion to the input, so a nest of them stays linear (unreadable once the budget is gone).
  const rewinds = (label, make) => {
    const [base, big] = timePair(scan, make(500), make(2000));
    assert.ok(big < base * 9, `${label}: time grows linearly: ${base} ns, four times the input ${big} ns`);
  };
  rewinds('nested $(( that fall back', (d) => '$(('.repeat(d) + 'a' + ') )'.repeat(d));
  rewinds('nested $(( that fall back, after a command', (d) => 'git merge x; ' + '$(('.repeat(d) + 'a' + ') )'.repeat(d));
  rewinds('nested (( that fall back', (d) => '(('.repeat(d) + 'a' + ') )'.repeat(d));
  assert.equal(scan('$(('.repeat(3) + 'a' + ') )'.repeat(3)).readable, true, 'a shallow nest of fallbacks still reads');
  // Quoted-text reading requeues every quoted word; nested double-quoted substitutions made that explode.
  for (const d of [100, 400]) {
    const s = '"$('.repeat(d) + 'a' + ')"'.repeat(d);
    assert.doesNotThrow(() => scan(s, { quoted: true }), `${d} nested quoted substitutions`);
    assert.equal(scan(s).readable, true);
  }
  assert.equal(scan('"$("a")"', { quoted: true }).readable, true, 'a shallow nested quote still reads');
}

// --- heredocs nested through substitutions: every body re-read spends from one budget for the whole scan ---
{
  // Each level's body holds the next level's heredoc, so re-reading every body at every level costs quadratic time.
  const nestedHeredocs = (d) => {
    let s = '';
    for (let k = d; k >= 1; k--) s = `cat <<E${k}\n$(${s})\nE${k}\n`;
    return s;
  };
  assert.equal(scan(nestedHeredocs(3)).commands.length, 3, 'a shallow nest of heredocs reads');
  // Four times the input takes about four times as long when linear and sixteen times as long when quadratic.
  const [base, big] = timePair(scan, nestedHeredocs(500), nestedHeredocs(2000));
  assert.ok(big < base * 9, `nested heredocs: time grows linearly: ${base} ns, four times the input ${big} ns`);
  assert.equal(scan(nestedHeredocs(3200)).readable, false, 'a deep nest of heredocs reads as unreadable, without throwing');
}

// --- shell-fed heredoc bodies read in linear time: many on a line, a long pipeline, and a nest of them ---
{
  const nestedFed = (d) => {
    let s = 'git push\n';
    for (let k = d; k >= 1; k--) s = `bash <<E${k}\n${s}E${k}\n`;
    return s;
  };
  assert.equal(allVals(nestedFed(3)).some((ws) => ws[0] === 'git'), true, 'a shallow nest of shell-fed bodies reads');
  for (const [label, make] of [
    ['many shell-fed heredocs', (d) => 'bash <<E\ngit push\nE\n'.repeat(d)],
    ['a long pipeline into a shell', (d) => 'cat <<E ' + '| cat '.repeat(d) + '| sh\ngit push\nE'],
    ['a pipeline of heredocs into a shell', (d) => 'cat <<E | '.repeat(d) + 'sh\n' + 'x\nE\n'.repeat(d)],
    ['nested shell-fed heredocs', nestedFed],
    ['many here-strings into a shell', (d) => "bash <<<'git push'; ".repeat(d)],
    ['many echo texts into a shell', (d) => 'echo git push | sh; '.repeat(d)],
    ['one long printf text into a shell', (d) => "printf '" + 'git push\\n'.repeat(d) + "' | sh"],
    ['many echo process substitutions into a shell', (d) => 'sh ' + '<(echo a) '.repeat(d)],
    ['many heredoc process substitutions into a shell', (d) => 'sh ' + '<(cat <<E\nx\nE\n) '.repeat(d)],
    ['nested groups each piped into a shell', (d) => '{ '.repeat(d) + 'cat <<E; ' + '} | sh; '.repeat(d) + '\nx\nE\n'],
    ['nested subshells each piped into a shell', (d) => '( '.repeat(d) + 'echo a' + ' ) | sh'.repeat(d)],
    ['a long pipeline of group elements into a shell', (d) => '{ cat <<E; } | '.repeat(d) + 'sh\n' + 'x\nE\n'.repeat(d)],
    // A shell reached indirectly: every function body, call, alias, and numbered heredoc is read once, not once per other one.
    ['many function bodies with heredocs, called into grep', (d) => 'f() { cat <<E; }; f | grep x\nx\nE\n'.repeat(d)],
    ['many function bodies with heredocs, then calls into a shell', (d) => 'f() { cat <<E; }\nx\nE\n'.repeat(d) + 'f | grep x; '.repeat(d) + 'f | sh'],
    ['many function bodies holding a shell, called into a pipeline', (d) => 'f() { sh; }; cat <<E | f\nx\nE\n'.repeat(d)],
    ['many aliases of a shell', (d) => 'alias s=sh; cat <<E | s\nx\nE\n'.repeat(d)],
    ['many heredocs into xargs sh -c', (d) => 'cat <<E | xargs sh -c\nx\nE\n'.repeat(d)],
    ['many numbered heredocs a shell reads', (d) => 'exec 3<<E; sh <&3\nx\nE\n'.repeat(d)],
    ['many heredocs into a process substitution', (d) => 'cat <<E > >(sh)\nx\nE\n'.repeat(d)],
    ['many heredocs into a $(cat) command string', (d) => 'cat <<E | sh -c "$(cat)"\nx\nE\n'.repeat(d)],
    ['nested $(cat) command strings', (d) => 'eval "$(cat; '.repeat(d) + 'x' + ')"'.repeat(d)],
    // A closed subshell hands its heredocs to the frame around it; a nest of them moves each heredoc a logarithmic number of times.
    ['heredocs handed out of nested subshells', (d) => 'cat <<E; ' + '( cat <<E; '.repeat(d) + ')'.repeat(d) + ' | sh\n' + 'x\nE\n'.repeat(d + 1)],
    ['many closed subshells holding a heredoc', (d) => '(cat <<E) ; '.repeat(d) + 'sh\n' + 'x\nE\n'.repeat(d)],
  ]) {
    const [base, big] = timePair((s) => scan(s, { quoted: true }), make(500), make(2000));
    assert.ok(big < base * 9, `${label}: time grows linearly: ${base} ns, four times the input ${big} ns`);
  }
  assert.equal(scan(nestedFed(3000)).readable, false, 'a deep nest of shell-fed bodies reads as unreadable, without throwing');
}

// --- texts: every heredoc body and here-string text, whatever command receives it ---
{
  const texts = (c) => scan(c).texts.map((t) => t.text);
  assert.deepEqual(texts("cat <<'E' 3<<-F; cat <<<'b c'\na\nE\n\td\n\tF"), ['a\n', '\td\n', 'b c'], 'bodies as written and here-string texts');
  assert.deepEqual(texts('echo "$(cat <<<x)" `cat <<E\ny\nE\n`'), ['x', 'y\n'], 'in substitutions and backtick groups too');
  assert.deepEqual(texts('cat <<E\nE'), [], 'an empty body is no text');
  assert.deepEqual(scan('tee -a f <<E >g\nx\nE').texts[0].cmd.words.map((w) => w.value), ['tee', '-a', 'f'], 'each text names its receiving command');
  // `alone`: the receiving command stands alone on the line, in the current shell, piping into nothing.
  for (const c of ['cat > f <<E\nx\nE', 'a; cat > f <<E && b\nx\nE', 'echo | cat > f <<E\nx\nE', '! cat > f <<<x']) {
    assert.equal(scan(c).texts[0].alone, true, 'alone: ' + JSON.stringify(c));
  }
  for (const c of ['cat > f <<E | sh\nx\nE', 'cat > f <<E |& sh\nx\nE', '{ cat > f <<E; }\nx\nE', '(cat > f <<E)\nx\nE', 'x=$(cat > f <<E\nx\nE\n)',
    'f() { cat > f <<E; }\nx\nE', 'if a; then cat > f <<E; fi\nx\nE', 'while a; do cat > f <<<x; done']) {
    assert.equal(scan(c).texts[0].alone, false, 'not alone: ' + JSON.stringify(c));
  }
  assert.equal(scan("sh -c 'cat > f <<<x'", { quoted: true }).texts[0].alone, false, 'not alone: a command read from quoted text');
}

// --- depth ---
for (const open of ['$(', '"$(', '${a:-$(', '(', '$((']) {
  const deep = open.repeat(10000);
  assert.doesNotThrow(() => scan(deep), `10000 x ${open}`);
  assert.equal(scan(deep).readable, false);
}
{
  const r = scan('$('.repeat(10000) + 'a' + ')'.repeat(10000));
  assert.equal(r.readable, true, '10000 nested $( levels read');
  assert.equal(r.commands.length, 10001);
}

// --- seeded differential test against `bash -n` ---
// The scanner's readable verdict must match `bash -n` on the `bash` on the path. Shapes on which bash 3.2
// and bash 5 disagree, and which this suite therefore leaves out (INV-0009 aside), by name:
//  - CASE_PAREN_IN_SUBSTITUTION: a `case` pattern `)` inside `$(…)`; bash 3.2 balances parens in `$(…)`
//    naively and rejects it. Generated only on bash 4 or newer.
//  - COMMENT_PAREN_IN_SUBSTITUTION: a comment holding `)` or a quote inside `$(…)`, or ending in a
//    backslash there; bash 3.2 does not skip comments there. Generated only on bash 4 or newer.
//  - SINGLE_QUOTE_IN_BRACE: a single quote inside `${…}`; it is literal in some versions inside double
//    quotes. Never generated.
//  - UNPARSED_BODY: bash 3.2 matches the delimiters of `$(…)`, `${…}`, and a backtick group, and parses the
//    body at expansion time, so a damaged fragment whose body stays delimited yet malformed passes `bash -n`
//    there. On bash 3.2 a damaged fragment that bash accepts is skipped; a damaged fragment bash rejects, and
//    every undamaged fragment, must still match.
//  - BACKTICK_BODY_UNPARSED: `bash -n` never parses a backtick body, on bash 3.2 and 5.3 alike (a body with an
//    unterminated quote passes); the body fails when it runs. A damaged fragment holding a backtick that bash
//    accepts is skipped on every bash when the scanner reads it unreadable and reads it readable with the
//    backtick groups removed (the body is the reason); one the scanner reads as readable, or unreadable
//    for another reason, agrees with bash and is compared.
//  - INCOMPLETE_COMPOUND: a fragment cut inside `for ((…)); do … done` lacks its `do` or `done`; bash rejects
//    it, and the scanner does no compound-grammar check (as with `if a; then`, `while a; do`), so it reads
//    the words that are there. Skipped when the scanner reads such a fragment as readable.
//  - DAMAGED_ARITHMETIC_FALLBACK: a damaged `$((…))` that lost a `)` falls back to `$( (…)`, which `bash -n` accepts
//    without parsing the body (`bash -n -c '(1+(2))'` is a syntax error on bash 3.2 and 5.3 alike); the scanner
//    reads the `(` after the opener as unexpected. Skipped when bash accepts, the scanner reports `unexpected (`,
//    and a `$((` is left once every well-formed `$((…))` (one nesting level) is removed.
//  - PAREN_IN_BRACE_IN_SUBSTITUTION: bash 3.2 counts a `(` or `)` inside a `${…}` that sits inside `$(…)`.
//    On bash 3.2 a damaged fragment holding both `$(` and `${` is skipped.
//  - BRACE_GROUP_IN_SUBSTITUTION: a `}` of a function body or brace group inside `$(…)` that sits inside
//    `${…}` closes the `${` early on bash 3.2. A function definition is generated inside `$(…)` only on
//    bash 4 or newer.
//  - SUBSTITUTION_OR_GROUP: `$((` reads as arithmetic first and falls back to `$( (` on bash. The generator
//    writes `$( (` with a space.
//  - PID_PARAMETER_BEFORE_QUOTE: `$$'…'` (the PID parameter, then a single-quoted word) inside `$(…)` or
//    `${…}`; bash 3.2 reads `$'` there as an ANSI-C quote. Generated only on bash 4 or newer.
//  - HEREDOC_SUBSTITUTION_IN_SUBSTITUTION: a heredoc body holding a substitution inside `$(…)`; bash 3.2
//    balances that body's parens naively. Generated only on bash 4 or newer.
//  - HEREDOC_AT_EOF: a heredoc with no delimiter line; bash accepts it with a warning, the scanner reads
//    it as unreadable. A fragment holding a heredoc is never truncated or damaged.
{
  const bashRun = (frag) => {
    const r = cp.spawnSync('bash', ['-n', '-c', frag], { encoding: 'utf8', timeout: 20000 });
    assert.ok(!(r.error && r.error.code === 'ENOENT'), 'the differential test needs `bash` on the path, and found none');
    assertSpawnDecided(r, 'bash -n');
    return r.status === 0;
  };
  const probe = cp.spawnSync('bash', ['-c', 'echo ${BASH_VERSINFO[0]} $BASH_VERSION'], { encoding: 'utf8', timeout: 20000 });
  assert.ok(!(probe.error && probe.error.code === 'ENOENT'), 'the differential test needs `bash` on the path, and found none');
  assertSpawnDecided(probe, 'bash version probe');
  const [majorText, bashVersion] = (probe.stdout || '').trim().split(' ');
  const major = Number(majorText);
  assert.ok(major >= 1, 'the differential test needs `bash` on the path, and found none');
  console.log(`shell-words.test.js: bash -n agreement fuzz compares against bash ${bashVersion}`);
  const newBash = major >= 4;

  // The scanner reads the fragment unreadable because of a backtick body: it is unreadable, and readable once
  // the backtick groups are removed. A fragment unreadable for another reason is not skipped.
  const backtickOnlyUnreadable = (frag) => frag.includes('`') && !scan(frag).readable && scan(frag.replace(/`(?:\\[\s\S]|[^`\\])*`/g, '')).readable;
  // A well-formed backtick body next to an unbalanced `$(` outside it: unreadable for the `$(`, so not a skip.
  assert.equal(scan('echo `ls` $(x').readable, false, 'unbalanced $( outside a backtick body is unreadable');
  assert.equal(backtickOnlyUnreadable('echo `ls` $(x'), false, 'the backtick skip does not cover an unbalanced $( outside the body');
  assert.equal(backtickOnlyUnreadable("echo `a'b`"), true, 'the backtick skip covers an unterminated quote inside the body');

  // The scanner reads `unexpected (` and a `$((` stays after the well-formed `$((…))` spans go: the damaged-arithmetic shape.
  const damagedArithmetic = (frag) => { const r = scan(frag); return !r.readable && r.reason === 'unexpected (' && frag.replace(/\$\(\((?:[^()]|\([^()]*\))*\)\)/g, '').includes('$(('); };
  assert.equal(scan('echo $((1+(2)) x)').reason, 'unexpected (', 'a damaged $((…) reads as unexpected (');
  assert.equal(damagedArithmetic('echo $((1+(2)) x)'), true, 'the arithmetic skip covers the damaged $((…)');
  assert.equal(damagedArithmetic('echo $((1+2)) ( x'), false, 'the arithmetic skip does not cover an unrelated ( beside a well-formed $((…))');
  assert.equal(damagedArithmetic('echo $((1+(2))) ( x'), false, 'the arithmetic skip does not cover an unrelated ( beside a nested well-formed $((…))');
  assert.equal(backtickOnlyUnreadable("echo `a\\`'b`"), true, 'an escaped backtick does not end the removed backtick span');

  const mulberry32 = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const generate = (rand) => {
    const pick = (a) => a[Math.floor(rand() * a.length)];
    let heredoc = false;
    const atom = () => pick(['a', 'b-c', "'x y'", '"x y"', '"a)b"', "'('", '\\(', '\\"', "$'a\\'b'", ...(newBash ? ["$$'a\\'", "$$$$'a b'"] : []), '$"x y"', '"it\'s"', '$((1+(2)))', '$x', '${x:-y}', 'a#b', '2>/dev/null', '>&2', 'x\\\ny', '"p\\\nq"', "'p\\\nq'"]);
    const word = (d, inSub) => {
      const r = rand();
      if (d <= 0 || r < 0.4) return atom();
      if (r < 0.55) return `$( ${seq(d - 1, true)})`;
      if (r < 0.7) return `"p $( ${seq(d - 1, true)}) q"`;
      if (r < 0.8) return `\`${simple(0)}\``;
      if (r < 0.9) return `\${v:-$( ${seq(d - 1, true)})}`;
      return `\${v:-"${atom().replace(/["\\]/g, '')} $( ${seq(d - 1, true)})"}`;
    };
    const simple = (d, inSub) => {
      const n = 1 + Math.floor(rand() * 3);
      const ws = [];
      for (let k = 0; k < n; k++) ws.push(word(d, inSub));
      // A backslash-newline between words, inside a word, or inside double quotes is a continuation.
      return (ws.join(rand() < 0.2 ? ' \\\n ' : ' ') + (rand() < 0.2 ? ' >/dev/null' : '')).replace(/^(2>|>&)/, 'x $1');
    };
    // Array assignments and `[[ … ]]`, which hold parens and operators that read as syntax elsewhere.
    const compound = (d, inSub) => pick([
      ...(inSub && !newBash ? [] : [
        () => `function fn { ${simple(d - 1, true)}; }`,
        () => `function fn () { ${simple(d - 1, true)}; }`,
      ]),
      () => 'v=(1 "2" $x)',
      () => 'v+=(a "b c")',
      () => `declare -a w=(1 $( ${seq(d - 1, true)}))`,
      () => 'a=1 v=(x)',
      () => '[[ ( a == b ) ]]',
      () => '[[ a < b && ( c > d || -z "$x" ) ]]',
      () => `[[ $( ${seq(d - 1, true)}) == *"a)"* ]]`,
      () => '[[ $x =~ ^(a|b)$ && ( c && d ) ]]',
      () => `for ((i=0;i<3;i++)); do ${simple(d - 1, true)}; done`,
    ])();
    const piece = (d, inSub) => {
      const r = rand();
      if (d > 0 && r < 0.12) return compound(d, inSub);
      if (r < 0.5 || d <= 0) return simple(d, inSub);
      if (r < 0.55) return `( ${seq(d - 1, inSub)})`;
      if (r < 0.65) return `${simple(d, inSub)} && ${simple(d, inSub)}`;
      if (r < 0.72) return `${simple(d, inSub)} | ${simple(d, inSub)}`;
      if (r < 0.82 && (!inSub || newBash)) return `case ${word(d, inSub)} in a) ${simple(d - 1, inSub)};; b|c) ${simple(d - 1, inSub)};; *) ;; esac`;
      if (r < 0.9) {
        // A comment ends at its newline, even when it ends in a backslash.
        const c = pick(inSub && !newBash ? ['# note'] :['# ) \' ( "', '# end \\', '# \\\\']);
        return `${simple(d, inSub)} ${c}\n`;
      }
      heredoc = true;
      const q = pick(['E', "'E'", '"E"', '\\E']);
      let body = inSub && !newBash ? 'text' : ') \' ( "';
      // An unquoted-delimiter body expands substitutions, so a body may hold them. A quoted-delimiter body stays literal.
      if (q === 'E' && (!inSub || newBash) && rand() < 0.5) body = pick(['x $( a b ) y', 'x `a b` y', '"q $( a "b c" ) " \' (', 'x ${v:-$( a )} y', 'x $(( 1 + (2) )) \\$( z']);
      // A body line ending in a backslash joins the next line only under an unquoted delimiter.
      if (rand() < 0.3 && (!inSub || newBash)) return `cat <<${q}\n${body} \\\nE\n${q === 'E' ? 'E\n' : ''}`;
      return rand() < 0.5 ? `cat <<${q}\n${body}\nE\n` : `cat <<-${q} <<F\n\t${body}\n\tE\n${body}\nF\n`;
    };
    const seq = (d, inSub) => {
      const n = 1 + Math.floor(rand() * 2);
      let out = '';
      for (let k = 0; k < n; k++) {
        const p = piece(d, inSub);
        out += (k && !out.endsWith('\n') ? '; ' : '') + p;
      }
      return out;
    };
    let frag = seq(3, false);
    // Damage: drop one balancing character, or cut the fragment short. A heredoc fragment stays whole
    // (HEREDOC_AT_EOF).
    const mode = rand();
    const chars = '\'"()}`';
    // A fragment may instead end in a token that opens something and never closes it; bash 3.2 rejects it
    // whatever came before (so UNPARSED_BODY never applies to it).
    let damaged = true;
    if (!heredoc && mode < 0.25) {
      const spots = [];
      for (let k = 0; k < frag.length; k++) if (chars.includes(frag[k])) spots.push(k);
      if (spots.length) { const k = pick(spots); frag = frag.slice(0, k) + frag.slice(k + 1); }
    } else if (!heredoc && mode < 0.35) frag = frag.slice(0, Math.floor(rand() * frag.length));
    else if (mode < 0.6) { frag += pick(["'", '"', ')', '$(', '${', '`', ' &&', ' >', '\n(']); damaged = false; } else damaged = false;
    return { frag, damaged };
  };

  const SEED = 20261010;
  const rand = mulberry32(SEED);
  let readable = 0;
  let total = 0;
  let skipped = 0;
  let unreadableCompared = 0;
  for (let k = 0; k < 600; k++) {
    const { frag, damaged } = generate(rand);
    total++;
    const expected = bashRun(frag);
    if (damaged && expected && backtickOnlyUnreadable(frag)) { skipped++; continue; } // BACKTICK_BODY_UNPARSED
    if (!newBash && damaged && (expected || (frag.includes('$(') && frag.includes('${')))) { skipped++; continue; }
    const got = scan(frag);
    // INCOMPLETE_COMPOUND: a fragment cut inside `for ((…)); do … done` lacks its `do` or `done`; bash rejects it, and the
    // scanner balances brackets and quotes without checking compound grammar, so it reads the words that are there.
    if (damaged && !expected && got.readable && frag.includes('for ((')) { skipped++; continue; }
    // DAMAGED_ARITHMETIC_FALLBACK: a damaged `$((…))` that lost a `)` falls back to `$( (…)` on bash, which accepts it;
    // the scanner reads the `(` after the arithmetic opener as unexpected.
    if (damaged && expected && damagedArithmetic(frag)) { skipped++; continue; }
    if (expected) readable++; else unreadableCompared++;
    assert.equal(got.readable, expected, `scan disagrees with bash -n (bash ${major}; bash says ${expected ? 'readable' : 'unreadable'}; seed ${SEED}, fragment ${k}): ${JSON.stringify(frag)} (${got.reason || ''})`);
  }
  assert.ok(readable > total * 0.3 && readable < total * 0.95, `the generator mixes readable and unreadable fragments (${readable} of ${total}, ${skipped} skipped)`);
  // The skips on an old bash must leave unreadable verdicts to compare, or the test checks readable ones only.
  assert.ok(unreadableCompared >= 200, `unreadable verdicts compared: ${unreadableCompared} of ${total} (${skipped} skipped)`);
}

// drivePath: a Git Bash drive path becomes a Windows one on win32 only (ADR 0150).
for (const [from, to] of [['/c/Users/x', 'C:/Users/x'], ['/C/x', 'C:/x'], ['/c', 'C:/'], ['/tmp/x', '/tmp/x'], ['/dev/null', '/dev/null'], ['/cc/x', '/cc/x'], ['c/x', 'c/x'], ['C:/x', 'C:/x']]) {
  assert.equal(drivePath(from, 'win32'), to, `win32: ${from}`);
  for (const platform of ['darwin', 'linux']) assert.equal(drivePath(from, platform), from, `${platform}: ${from}`);
}

console.log('shell-words.test.js: ok');
