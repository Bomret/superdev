'use strict';

// Suite for the Bash write targets of the run trace (ADR 0117, ADR 0160): the files a command writes, resolved against the directory it
// runs in. Calls `bashTargets` of plugin/lib/bash-writes.js in-process.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { bashTargets } = require('../plugin/lib/bash-writes.js');
const { assertSpawnDecided, boundFromSamples } = require('./spawn-verdict');
const { A, B, S3, trace, reset, run, edit, bash, hookPath, cleanup } = require('./run-trace-setup');

// Quoted `>` is data, not a redirect; a quoted redirect target still records.
reset();
const S3src = path.join(S3, 'src');
bash('git commit -m "fix a -> b thing"', S3src);
bash('echo "x > y"', S3src);
bash('grep "a>b" f', S3src);
assert.equal(trace(A).length, 0, 'a quoted > records no edit');
bash('echo x > "a b.txt"', S3src);
assert.deepEqual(trace(A), [['03', 'main', 'edit', 'impl', 'src/a\\x20b.txt']]);

// sed -i operand parsing: script is never a target.
for (const cmd of ['sed -i "" s/a/b/ f.js', "sed -i '' s/a/b/ f.js", 'sed -e s/a/b/ -i f.js', 'sed --in-place s/a/b/ f.js', 'sed -i.bak s/a/b/ f.js', 'sed --in-place=.bak s/a/b/ f.js', 'sed -i -e s/a/b/ f.js', 'sed -i -f s.sed f.js', 'sed --expression=s/a/b/ -i f.js']) {
  assert.deepEqual(bashTargets(cmd, S3src), [path.join(S3src, 'f.js')], cmd);
}

// A separator or `>` inside quotes never splits a command or becomes a target (ADR 0117).
assert.deepEqual(bashTargets('sed -i "s/Connection;/IDbConnection _ => null!;/" libs/A.Test/Foo.cs', '/r'), [path.resolve('/r', 'libs/A.Test/Foo.cs')]);
assert.deepEqual(bashTargets("sed -i 's/a/b/; s/x/y/' x.cs", '/r'), [path.resolve('/r', 'x.cs')]);
assert.deepEqual(bashTargets('tee out.log 2>/dev/null', '/r'), [path.resolve('/r', 'out.log')]);
assert.deepEqual(bashTargets('tee out.log>/dev/null', '/r'), [path.resolve('/r', 'out.log')]);
assert.deepEqual(bashTargets('tee "q;w.log"', '/r'), [path.resolve('/r', 'q;w.log')]);
for (const cmd of ['cp a b >/dev/null', 'cp a b 2>&1', 'cp a b < in.txt', 'mv a b', 'install -m 644 a b']) {
  assert.deepEqual(bashTargets(cmd, '/r'), [path.resolve('/r', 'b')], cmd);
}
// A heredoc or here-string operator takes its delimiter with it; an fd number is a whole-digit word; an escaped `>` is text.
assert.deepEqual(bashTargets("tee out << 'EOF'\nx\nEOF", '/r'), [path.resolve('/r', 'out')]);
assert.deepEqual(bashTargets('tee -a f <<- END\n\tx\n\tEND', '/r'), [path.resolve('/r', 'f')]);
assert.deepEqual(bashTargets('tee f <<< hello', '/r'), [path.resolve('/r', 'f')]);
assert.deepEqual(bashTargets('tee log2>x', '/r').sort(), [path.resolve('/r', 'log2'), path.resolve('/r', 'x')].sort());
assert.deepEqual(bashTargets('tee a\\>b', '/r'), [path.resolve('/r', 'a>b')]);
assert.deepEqual(bashTargets('echo a\\ \\>\\ b', '/r'), [], 'backslash-escaped text is data: no edit');
for (const cmd of ['git commit -m "fix\n\n- a -> b\n- c | d\n- e > f"', "git commit -m 'x\ny > z'"]) {
  assert.deepEqual(bashTargets(cmd, '/r'), [], cmd);
}
// A `<<` inside a multi-line quoted message opens no heredoc, so the rest of the command is still read.
assert.deepEqual(bashTargets('git commit -m "fix\n- a -> b\n- use x << y\n"', '/r'), []);
assert.deepEqual(bashTargets('git commit -m "fix\n- a -> b\n- use x << y\n" && tee out', '/r'), [path.resolve('/r', 'out')]);
// A process substitution is no target; `>|` is a noclobber redirect, not a pipe.
assert.deepEqual(bashTargets('tee >(cat) f', '/r'), [path.resolve('/r', 'f')]);
assert.deepEqual(bashTargets('echo x >|clob', '/r'), [path.resolve('/r', 'clob')]);
// An escaped quote outside quotes opens no quote carry: later heredoc bodies stay masked.
assert.deepEqual(bashTargets('echo it\\\'s\ncat > f <<EOF\nfoo > bar\nEOF', '/r'), [path.resolve('/r', 'f')]);
assert.deepEqual(bashTargets("echo $'it\\'s'\ncat > f <<EOF\nfoo > bar\nEOF", '/r'), [path.resolve('/r', 'f')]);
// An escaped `<` makes `\<<EOF` a literal plus a redirect, no heredoc; `<<\EOF` and `\\<<EOF` still open one.
assert.deepEqual(bashTargets('echo \\<<EOF\necho hi > out.txt', '/r'), [path.resolve('/r', 'out.txt')]);
assert.deepEqual(bashTargets('cat > f <<\\EOF\nfoo > bar\nEOF', '/r'), [path.resolve('/r', 'f')]);
assert.deepEqual(bashTargets('cat > f \\\\<<EOF\nfoo > bar\nEOF', '/r'), [path.resolve('/r', 'f')]);

// `$$` is the PID: the second `$` opens no ANSI-C quote, so the `'` is a plain quote and later lines are still read.
assert.deepEqual(bashTargets("echo $$'a\\' '<<EOF' \\'\necho hi > out.txt", '/r'), [path.resolve('/r', 'out.txt')]);
assert.deepEqual(bashTargets("echo $$$$'a\\' '<<EOF' \\'\necho hi > out.txt", '/r'), [path.resolve('/r', 'out.txt')]);
assert.deepEqual(bashTargets("echo $$$'it\\'s'\ncat > f <<EOF\nfoo > bar\nEOF", '/r'), [path.resolve('/r', 'f')]);

// A `cd` inside a subshell or substitution moves nothing outside it; a brace group runs in the current shell.
assert.deepEqual(bashTargets('(cd sub); echo > b', '/r'), [path.resolve('/r', 'b')]);
assert.deepEqual(bashTargets('echo $(cd sub); echo > b', '/r'), [path.resolve('/r', 'b')]);
assert.deepEqual(bashTargets('{ cd sub; }; echo > b', '/r'), [path.resolve('/r', 'sub/b')]);
assert.deepEqual(bashTargets('(cd sub; echo > b)', '/r'), [path.resolve('/r', 'sub/b')]);
// A backtick body runs where its backtick stands, before the `cd` that follows it.
assert.deepEqual(bashTargets('echo `cat > f`; cd a', '/r'), [path.resolve('/r', 'f')]);
// A heredoc body expands when its opener's command runs, before the `cd` that follows on the line.
assert.deepEqual(bashTargets('cat <<EOF; cd a\n$(echo > x)\nEOF', '/r'), [path.resolve('/r', 'x')]);
// `$[ … ]` is arithmetic: its `>` is no redirect.
assert.deepEqual(bashTargets('echo $[1>2]', '/r'), []);
// The substitutions and backtick groups a `$[ … ]` holds run, so their writes record.
assert.deepEqual(bashTargets('echo $[1+$(echo x > f)]', '/r'), [path.resolve('/r', 'f')]);
assert.deepEqual(bashTargets('echo $[1+`echo x > g`]', '/r'), [path.resolve('/r', 'g')]);
// bash reads quotes inside `$[ … ]`, so a quoted `]` closes nothing and the substitution after it runs.
assert.deepEqual(bashTargets("echo $[ ']' + $(cat a > b) + '' ]", '/r'), [path.resolve('/r', 'b')]);
assert.deepEqual(bashTargets('echo $[ "]" + $(cat a > c) ]', '/r'), [path.resolve('/r', 'c')]);
// bash reads quotes inside `$(( … ))` too, so a quoted `)` closes nothing and the substitution after it runs.
assert.deepEqual(bashTargets('echo $(( ")" + $(cat a > d) ))', '/r'), [path.resolve('/r', 'd')]);
// An unreadable `cd` inside a subshell, a substitution, or an uncalled function body leaves the outer shell's relative `cd` resolving
// against its own directory; a subshell after an outer unreadable `cd` starts at the end directory and resolves its own `cd`.
assert.deepEqual(bashTargets('(cd ~ && ls) ; cd sub && echo x > f.txt ; cd ..', '/s', '/s'), [path.resolve('/s', 'sub/f.txt')]);
assert.deepEqual(bashTargets('cd "$X" && (cd sub && echo x > f.txt)', '/s', '/e'), [path.resolve('/e', 'sub/f.txt')]);
assert.deepEqual(bashTargets('echo $(cd ~) ; cd sub && echo x > f ; cd ..', '/s', '/s'), [path.resolve('/s', 'sub/f')]);
assert.deepEqual(bashTargets('f() { cd ~; } ; cd sub && echo x > f ; cd ..', '/s', '/s'), [path.resolve('/s', 'sub/f')]);
// A call of a function whose body holds a `cd` runs that `cd` in the outer shell: the call resolves as an unreadable `cd` does.
assert.deepEqual(bashTargets('f() { cd sub; } ; f ; echo x > f.txt', '/s', '/s/sub'), [path.resolve('/s/sub', 'f.txt')]);
assert.deepEqual(bashTargets('f() { cd ~; } ; f ; cd sub && echo x > f.txt', '/s', '/h/sub'), [path.resolve('/h/sub', 'f.txt')]);
// A quoted or escaped command word calls the function it unquotes to.
assert.deepEqual(bashTargets('f() { cd sub; } ; "f" ; echo x > a', '/s', '/s/sub'), [path.resolve('/s/sub', 'a')]);
assert.deepEqual(bashTargets('f() { cd sub; } ; \\f ; echo x > a', '/s', '/s/sub'), [path.resolve('/s/sub', 'a')]);
// `command` and `builtin` run the `cd`, `pushd`, or `popd` they name; `command -v` and `-V` look the name up and move nothing.
assert.deepEqual(bashTargets('command cd a; echo x > g', '/s', '/s/a'), [path.resolve('/s/a', 'g')], 'command cd');
assert.deepEqual(bashTargets('builtin cd a; echo x > g', '/s', '/s/a'), [path.resolve('/s/a', 'g')], 'builtin cd');
assert.deepEqual(bashTargets('command -p -- pushd a; echo x > g', '/s', '/s/a'), [path.resolve('/s/a', 'g')], 'command -p -- pushd');
assert.deepEqual(bashTargets('command -v cd a; echo x > g', '/s', '/s'), [path.resolve('/s', 'g')], 'command -v cd moves nothing');
assert.deepEqual(bashTargets('f() { builtin cd a; } ; f ; echo x > g', '/s', '/s/a'), [path.resolve('/s/a', 'g')], 'a body builtin cd makes a call move');
// A body's command word reads as `cdCall` reads it: `\cd`, `'cd'`, and `eval cd` make a call move as a bare `cd` does.
for (const c of ['\\cd /x', "'cd' /x", 'eval cd /x']) {
  assert.deepEqual(bashTargets(`f() { ${c}; }; f; tee g`, '/r', '/end'), [path.resolve('/end', 'g')], 'a body ' + c + ' makes a call move');
}
// A `cd`'s own redirect opens before the `cd` runs, against the directory before it.
assert.deepEqual(bashTargets('cd a > out; echo x > g', '/s', '/s/a'), [path.resolve('/s', 'out'), path.resolve('/s/a', 'g')], 'cd a > out');
// A pipeline stage runs in a subshell, so its `cd` moves nothing after the pipeline.
assert.deepEqual(bashTargets('cd sub | cat ; cd sub && echo > f', '/s', '/s/sub'), [path.resolve('/s/sub', 'f')]);
assert.deepEqual(bashTargets('ls | cd sub ; cd sub && echo > f', '/s', '/s/sub'), [path.resolve('/s/sub', 'f')]);
assert.deepEqual(bashTargets('cd sub |& cat ; cd sub && echo > f', '/s', '/s/sub'), [path.resolve('/s/sub', 'f')]);
assert.deepEqual(bashTargets('f() { cd sub; } ; f | cat ; echo x > a', '/s', '/s'), [path.resolve('/s', 'a')]);
// A compound pipeline stage and an `&` job are shell instances of their own: their `cd` moves only themselves.
assert.deepEqual(bashTargets('{ cd sub; } | cat ; cd sub && echo x > f', '/s', '/s/sub'), [path.resolve('/s/sub', 'f')]);
assert.deepEqual(bashTargets('if true; then cd sub; fi | cat ; cd sub && echo x > f', '/s', '/s/sub'), [path.resolve('/s/sub', 'f')]);
assert.deepEqual(bashTargets('cat a | while read l; do cd sub; done ; cd sub && echo x > f', '/s', '/s/sub'), [path.resolve('/s/sub', 'f')]);
assert.deepEqual(bashTargets('cd sub & cd sub && echo x > a', '/s', '/s/sub'), [path.resolve('/s/sub', 'a')]);
assert.deepEqual(bashTargets('cat a | { cd sub; echo y > g; }', '/s', '/s'), [path.resolve('/s/sub', 'g')]);
assert.deepEqual(bashTargets('cd sub && echo x > f & echo y > g', '/s', '/s'), [path.resolve('/s/sub', 'f'), path.resolve('/s', 'g')]);
// A coprocess runs in a subshell of its own, so its `cd` moves nothing after it.
assert.deepEqual(bashTargets('coproc cd a; echo x > f', '/s', '/s'), [path.resolve('/s', 'f')], 'coproc cd');
assert.deepEqual(bashTargets('coproc { cd a; }; echo x > f', '/s', '/s'), [path.resolve('/s', 'f')], 'coproc { cd; }');
// Sibling subshells do not share a directory: the `group` id tells them apart.
assert.deepEqual(bashTargets('(cd a); (echo > x)', '/r'), [path.resolve('/r', 'x')]);
assert.deepEqual(bashTargets('(cd a); ( (echo x > f) )', '/s', '/e'), [path.resolve('/s', 'f')], 'a nested subshell after a sibling cd');
// A write behind a wrapper records as the bare write does: bashTargets reads the command word through segWords (ADR 0160).
assert.deepEqual(bashTargets('command -p cp a.js c.js', '/r'), [path.resolve('/r', 'c.js')], 'command -p cp (triage #1230)');
for (const w of ['command --', 'command -p --', 'sudo -E', 'sudo -u root', 'sudo -uroot', 'env -i', 'env -u X', 'env -iu X', 'nice -n 5',
  'nice -5', 'exec', 'exec -a x', 'nohup', 'timeout -k 2 5s --', 'time -p', 'rtk', 'rtk proxy', 'sudo env -i nice', 'nice sudo -E command -p']) {
  assert.deepEqual(bashTargets(w + ' cp a b', '/r'), [path.resolve('/r', 'b')], w + ' cp');
}
assert.deepEqual(bashTargets('rtk git mv a b', '/r'), [path.resolve('/r', 'b')], 'rtk git mv');
// A wrapper that runs no operand records no write and no run; the segment's redirect still records (ADR 0160).
for (const w of ['command -v', 'command -V', 'command -pv', 'command -p -v', 'command -x', 'env -S x', 'env --split-string=x', 'env -Sx',
  'sudo -l', 'sudo -V', 'sudo -h', 'sudo --help', 'env --help', 'nice --help', 'timeout --help']) {
  assert.deepEqual(bashTargets(w + ' cp a b', '/r'), [], w + ' cp');
  assert.deepEqual(bashTargets(w + ' cp a b > out', '/r'), [path.resolve('/r', 'out')], w + ' cp > out');
}
// `sudo -e` (sudoedit) writes the files it names.
assert.deepEqual(bashTargets('sudo -e f', '/r'), [path.resolve('/r', 'f')], 'sudo -e f');
assert.deepEqual(bashTargets('sudo -u root --edit a b', '/r'), [path.resolve('/r', 'a'), path.resolve('/r', 'b')], 'sudo --edit a b');
assert.deepEqual(bashTargets('sudoedit f', '/r'), [path.resolve('/r', 'f')], 'sudoedit f');
// One word reader: a word reads as bash reads it, and a word bash expands names no path (ADR 0160).
for (const c of ['tee {a,b}.js', 'echo > a{1..3}', 'echo > [ab]', 'echo x > >(cat)', 'tee "$X"', 'tee "a$(b)"', 'tee a*']) {
  assert.deepEqual(bashTargets(c, '/r'), [], c);
}
assert.deepEqual(bashTargets('tee a\\ b', '/r'), [path.resolve('/r', 'a b')], 'an escaped space');
assert.deepEqual(bashTargets('tee "a\\b"', '/r'), [path.resolve('/r', 'a\\b')], 'a backslash bash keeps inside double quotes');
assert.deepEqual(bashTargets('tee "a"b', '/r'), [path.resolve('/r', 'ab')], 'a quoted part joined to a bare one');
// A wrapper option that changes directory hides where the command writes: no edit, while its redirect records (INV-0161).
for (const c of ['sudo -D /x cp a b', 'sudo -D/x cp a b', 'sudo --chdir=/x cp a b', 'sudo -iD /x cp a b', 'sudo -i cp a b', 'sudo -R /x cp a b',
  'env -C /x cp a b', 'env -C/x cp a b', 'env --chdir=/x cp a b', 'env -iC /x cp a b']) {
  assert.deepEqual(bashTargets(c, '/r'), [], c);
}
assert.deepEqual(bashTargets('sudo -uD cp a b', '/r'), [path.resolve('/r', 'b')], 'sudo -uD is user D');
assert.deepEqual(bashTargets('env -uC cp a b', '/r'), [path.resolve('/r', 'b')], 'env -uC unsets C');
assert.deepEqual(bashTargets('sudo -D /x cmd > log', '/r'), [path.resolve('/r', 'log')], 'the redirect opens in the shell');
// A `git -C` the hook cannot read hides where git writes; a value option ending the command throws nothing.
assert.deepEqual(bashTargets('git -C "$D" mv a b', '/r'), [], 'git -C "$D"');
assert.deepEqual(bashTargets('git -C ~ mv a b', '/r'), [], 'git -C ~');
assert.deepEqual(bashTargets('tee f; git -C', '/r'), [path.resolve('/r', 'f')], 'a trailing git -C');
// A segment's redirect opens in the shell's directory, never git's `-C`.
assert.deepEqual(bashTargets('git -C sub status > out', '/r'), [path.resolve('/r', 'out')], 'git -C sub status > out');
// Only a `cd` that runs in this shell moves the base; a quoted or escaped `cd` word is `cd`, and `eval cd` moves as an unreadable cd.
assert.deepEqual(bashTargets('sudo cd /x; cp a b', '/r'), [path.resolve('/r', 'b')], 'sudo cd');
assert.deepEqual(bashTargets('nice cd /x; cp a b', '/r'), [path.resolve('/r', 'b')], 'nice cd');
for (const c of ['command cd /x', 'builtin cd /x', '\\cd /x', "'cd' /x", 'X=1 cd /x', 'time cd /x']) {
  assert.deepEqual(bashTargets(c + '; cp a b', '/r'), [path.resolve('/x', 'b')], c);
}
assert.deepEqual(bashTargets('eval cd /x && tee f', '/r', '/e'), [path.resolve('/e', 'f')], 'eval cd');
// An `eval` whose first argument's value, past one leading `--`, starts with the word `cd`, `pushd`, or `popd` moves as an unreadable cd.
for (const c of ['eval "cd /x"', "eval 'cd /x'", 'eval -- cd /x']) assert.deepEqual(bashTargets(c + '; tee g', '/r', '/e'), [path.resolve('/e', 'g')], c);
// `command` and `builtin` read the command word after them as bash reads it.
assert.deepEqual(bashTargets('command \\cd /x; tee g', '/r', '/e'), [path.resolve('/x', 'g')], 'command \\cd');
// Every reader skips an assignment by one rule, an array element and `+=` included.
assert.deepEqual(bashTargets('a[1]=x cd /d; tee f', '/r'), [path.resolve('/d', 'f')], 'a[1]=x cd');
assert.deepEqual(bashTargets('a[1]=x tee f', '/r'), [path.resolve('/r', 'f')], 'a[1]=x tee');
assert.deepEqual(bashTargets('f() { cd sub; }; a[1]=x f; tee g', '/r', '/end'), [path.resolve('/end', 'g')], 'a[1]=x f calls f');
// A function body's literal `cd` moves the body's later writes; an unreadable one moves them to the ending directory (ADR 0160).
assert.deepEqual(bashTargets('f() { cd /etc; echo > a; }', '/r'), [path.resolve('/etc', 'a')], 'a body cd');
assert.deepEqual(bashTargets('f() { cd /etc; }; g() { echo > b; }', '/r'), [path.resolve('/r', 'b')], 'one body\'s cd moves no other body');
assert.deepEqual(bashTargets('f() { cd "$X"; echo > a; }', '/r', '/e'), [path.resolve('/e', 'a')], 'an unreadable body cd');
// A `cd` in a subshell, a pipeline stage, an `&` job, or a substitution inside a body moves only that instance.
for (const c of ['f() { (cd /a); tee z; }', 'f() { cd /a | cat; tee z; }', 'f() { cd /a & tee z; }', 'f() { x=$(cd /a); tee z; }']) {
  assert.deepEqual(bashTargets(c, '/r', '/end'), [path.resolve('/r', 'z')], c);
}
assert.deepEqual(bashTargets('f() { cd /a; (tee z); }', '/r', '/end'), [path.resolve('/a', 'z')], 'a body subshell starts where the body is');
// A nested body starts where it is defined, in its enclosing body, and its instances stay that body's own.
for (const c of ['f() { cd /a; ( g() { true; }; tee z ); }', 'f() { cd /a; ( g() { true; }; ( tee z ) ); }']) {
  assert.deepEqual(bashTargets(c, '/r', '/e'), [path.resolve('/a', 'z')], c);
}
assert.deepEqual(bashTargets('f() { cd /a; g() { tee z; }; tee y; }', '/r', '/e'), [path.resolve('/a', 'z'), path.resolve('/a', 'y')], 'a nested body starts in its enclosing body');
// A call made inside a body, at any depth, to a function that moves the directory moves as an unreadable `cd` does.
for (const c of ['g() { cd /b; }; f() { cd /a; g; tee z; }', 'f() { cd /a; g() { cd /b; }; g; tee z; }']) {
  assert.deepEqual(bashTargets(c, '/r', '/e'), [path.resolve('/e', 'z')], c);
}
// A recursive or mutually recursive definition ends the walk: each case runs in a child under a bound taken from this run, so a hang
// fails by its kill (INV-0009) and a finished run pins its recorded targets.
const recursiveBound = boundFromSamples(() => cp.spawnSync(process.execPath, ['-e', '0']));
const recursive = (c) => cp.spawnSync(process.execPath, ['-e',
  `process.stdout.write(JSON.stringify(require(${JSON.stringify(path.resolve(__dirname, '../plugin/lib/bash-writes.js'))}).bashTargets(process.argv[1], '/r', '/e')))`, c],
  { encoding: 'utf8', timeout: recursiveBound });
for (const [c, want] of [['f() { f; }; f', []], ['f() { cd /a; f; tee z; }; f', [path.resolve('/e', 'z')]], ['f() { g; }; g() { f; cd /a; }; f', []]]) {
  const r = recursive(c);
  assertSpawnDecided(r, c);
  assert.equal(r.status, 0, c);
  assert.deepEqual(JSON.parse(r.stdout), want, c);
}
// A body inside a shell-read heredoc or a backtick group is its own body: an outer body's `cd` moves none of its writes.
for (const c of ['f() { cd /a; }; bash <<E\ng() { tee z; }\nE', 'f() { cd /a; }; echo `g() { tee z; }`']) {
  assert.deepEqual(bashTargets(c, '/r', '/e'), [path.resolve('/r', 'z')], c);
}
// git is read through gitSubcommand: every -C composes, every global value option is skipped, an alias never hides a builtin,
// and a print-and-exit option runs no subcommand (ADR 0160).
assert.deepEqual(bashTargets('git -C a -C b mv x y', '/r'), [path.resolve('/r', 'a/b/y')], 'git -C a -C b');
for (const g of ['git --namespace n', 'git --config-env a=B', 'git --shallow-file f', 'git --git-dir=.git', 'git -c alias.mv=log']) {
  assert.deepEqual(bashTargets(g + ' mv a b', '/r'), [path.resolve('/r', 'b')], g + ' mv');
}
for (const g of ['git --exec-path', 'git --version', 'git -v', 'git --help', 'git -h', 'git --man-path', 'git --html-path', 'git --info-path']) {
  assert.deepEqual(bashTargets(g + ' mv a b', '/r'), [], g + ' mv');
}
assert.deepEqual(bashTargets('git --exec-path=/x mv a b', '/r'), [path.resolve('/r', 'b')], 'git --exec-path=<dir> mv');
assert.deepEqual(bashTargets('tee f; git -c', '/r'), [path.resolve('/r', 'f')], 'a trailing git -c');
// `<>` opens its target for writing, creating it.
assert.deepEqual(bashTargets('exec 3<>f', '/r'), [path.resolve('/r', 'f')]);
// An unquoted heredoc body's substitutions are scanned, so a write inside one records beside the redirect.
assert.deepEqual(bashTargets('cat <<EOF > f\n$(echo > x)\nEOF', '/r').sort(), [path.resolve('/r', 'f'), path.resolve('/r', 'x')].sort());
// A heredoc body a known shell reads on stdin is a command line (#1016): its writes record, and its `cd` moves only the child shell.
assert.deepEqual(bashTargets("bash <<'E'\necho x > f\nE", '/r'), [path.resolve('/r', 'f')]);
assert.deepEqual(bashTargets('cat <<E | sh\ncp a f\nE', '/r'), [path.resolve('/r', 'f')]);
// A delimiter line ending in the `)` of its substitution closes both, as bash reads it.
assert.deepEqual(bashTargets('x=$(cat > f <<E\nx\nE)', '/r'), [path.resolve('/r', 'f')]);
assert.deepEqual(bashTargets('bash <<E\ncd a; echo x > f\nE\necho > g', '/r'), [path.resolve('/r', 'a/f'), path.resolve('/r', 'g')]);
assert.deepEqual(bashTargets("cat > n <<'E'\necho x > f\nE", '/r'), [path.resolve('/r', 'n')], 'a body no shell reads is data');

// The command word must be in command position: arguments named like a command record nothing.
for (const cmd of ['npm install lodash', 'echo cp a b', 'grep sed x']) {
  reset();
  bash(cmd, S3src);
  assert.equal(trace(A).length, 0, cmd);
}
for (const cmd of ['FOO=1 cp a b', 'sudo cp a b', 'env FOO=1 time cp a b', 'git mv a b']) {
  reset();
  bash(cmd, S3src);
  assert.deepEqual(trace(A).map((l) => l[4]), ['src/b'], cmd);
}

// cp -t DIR sources
reset();
fs.mkdirSync(path.join(S3, 'src', 'd'), { recursive: true });
bash('cp -t d a.js b.js', S3src);
bash('mv --target-directory=d c.js', S3src);
assert.deepEqual(trace(A).map((l) => l[4]), ['src/d/a.js', 'src/d/b.js', 'src/d/c.js']);

// git mv must be the subcommand, not a later word: `git add mv x` records nothing.
reset();
bash('git add mv x', S3src);
assert.equal(trace(A).length, 0, 'git add mv x records nothing (mv is not subcommand)');
fs.mkdirSync(path.join(S3, 'src', 'sub'), { recursive: true });
bash('git -C sub mv ../d/c.js w.js', S3src);
assert.deepEqual(trace(A).map((l) => l[4]), ['src/sub/w.js'], 'git -C <dir> mv still records');

// The shared scanner reads the command: a redirect in a substitution records its own target (#947).
assert.deepEqual(bashTargets('echo $(cat a > b)', '/r'), [path.resolve('/r', 'b')]);
assert.deepEqual(bashTargets('echo `cat a > b`', '/r'), [path.resolve('/r', 'b')]);
// A `>` in awk's quoted program is data (#968), and so is one in arithmetic or a `case` pattern (#988).
for (const cmd of ["awk 'NR>2680' f", "awk -F: '$1>2280 && $1<2620' f", 'echo $((x>0))', 'case $x in 0) echo a;; esac', 'case x in\n  0)\n    echo a;;\nesac']) {
  assert.deepEqual(bashTargets(cmd, '/r'), [], cmd);
}
// An fd redirect or duplication records no descriptor path, and a write to /dev/null records nothing.
for (const cmd of ['cmd 2>/dev/null', 'cmd >&2', 'cmd 2>&1', 'cmd >/dev/null 2>&1', 'cmd &>/dev/null']) {
  assert.deepEqual(bashTargets(cmd, '/r'), [], cmd);
}
assert.deepEqual(bashTargets('cmd 2>err.log', '/r'), [path.resolve('/r', 'err.log')]);
assert.deepEqual(bashTargets('cmd &>all.log', '/r'), [path.resolve('/r', 'all.log')]);
// A heredoc opener followed by a backslash-newline continuation: the body is data and the continued words are read (#950).
assert.deepEqual(bashTargets('cat <<EOF \\\n> f\nx > not\nEOF', '/r'), [path.resolve('/r', 'f')]);
// A `#` in the middle of a word starts no comment (#954); a `#` at a word start does.
assert.deepEqual(bashTargets('echo a#b > f', '/r'), [path.resolve('/r', 'f')]);
assert.deepEqual(bashTargets('echo a # b > f', '/r'), []);
// An unreadable command records nothing.
assert.deepEqual(bashTargets('echo "unclosed > f', '/r'), []);
assert.deepEqual(bashTargets('echo $(cat > f', '/r'), []);
assert.deepEqual(bashTargets('cat <<EOF > f\nbody', '/r'), []);
// `cd` and `git -C` still re-base what the scanner returns.
assert.deepEqual(bashTargets('cd sub && tee f', '/r'), [path.resolve('/r', 'sub', 'f')]);
assert.deepEqual(bashTargets('git -C sub mv a b', '/r'), [path.resolve('/r', 'sub', 'b')]);
// ARG and stripHeredocs are no exports.
assert.equal(require(hookPath).ARG, undefined);
assert.equal(require(hookPath).stripHeredocs, undefined);

// Linear time (ADR 0086): four times the input takes about four times as long when linear and sixteen times when quadratic, against
// a same-run baseline; the ceiling sits at nine, between them. A long command; one shell command holding many heredoc process
// substitutions, whose words are read once, not once per substitution; commands at a rising subshell depth, where each subshell
// instance starts in the directory of the one around it, read in constant time, not by a walk over every depth; and many pipeline
// stages that each move, flat and nested in brace groups, whose instances are each met once; an unclosed `{` before many
// commas, whose brace-list test reads each span once; and many function bodies at a rising subshell depth, whose own trackers
// stop at the first instance the outer tracker knows instead of walking every depth.
{
  const { timePair } = require('./linear-time');
  for (const [label, make] of [
    ['a long command', (n) => 'echo $(echo $(cat a > b)) "x > y" | tee c; '.repeat(n / 4)],
    ['many heredoc process substitutions', (n) => 'sh ' + '<(cat <<E\nx\nE\n) '.repeat(n / 2)],
    ['nested $(', (d) => 'echo ' + '$('.repeat(d) + 'echo x' + ')'.repeat(d)],
    ['nested "$( with a shell-fed heredoc', (d) => 'cat <<E | sh\ntrue\nE\necho ' + '"$('.repeat(d) + 'echo x' + ')"'.repeat(d)],
    ['many moving pipeline stages', (n) => 'cd a | cat ; '.repeat(n / 4) + 'echo x > f'],
    ['nested moving pipeline stages', (d) => '{ cd a | cat ; '.repeat(d / 4) + 'echo x > f ;' + ' }'.repeat(d / 4)],
    ['an unclosed brace list', (n) => 'echo x > {' + ','.repeat(n)],
    ['many function bodies at depth', (n) => '( '.repeat(n / 8) + Array.from({ length: n / 8 }, (_, k) => `f${k}() { ( ( cd /a ) ); tee z${k}; }; `).join('') + ' )'.repeat(n / 8)],
  ]) {
    const [base, big] = timePair((c) => bashTargets(c, '/r'), make(4000), make(16000), 9);
    assert.ok(big < base * 9, `${label}: time grows linearly: ${base} ns, four times the input ${big} ns`);
  }
}


cleanup();
