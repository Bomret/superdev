'use strict';

// Suite for plugin/hooks/run-trace.js (ADR 0117). Classification cases call the exported `record`
// and `bashTargets` in-process; the spawned hook covers the stdin-to-line contract, exit 0, and the
// git timeout.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');
const { inProgressSlices, appendTrace, isTestPath } = require('../plugin/scripts/scope.js');

const hookPath = require.resolve('../plugin/hooks/run-trace.js');
const { record, bashTargets, verificationKind, testRuns } = require(hookPath);

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
const A = runRoot('a', [['02', 'todo'], ['03', 'in-progress']]);
const B = runRoot('b', [['01', 'in-progress'], ['02', 'in-progress']]);
const trace = (root) => {
  try { return fs.readFileSync(path.join(root, 'trace.log'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').slice(1)); } catch { return []; }
};
const reset = () => [A, B].forEach((r) => fs.rmSync(path.join(r, 'trace.log'), { force: true }));

// Records one hook input in-process; returns the Missing RED note text, or '' (a test that expects none asserts '').
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

// inProgressSlices: ids at in-progress, table order.
assert.deepEqual(inProgressSlices(ledger([['01', 'merged'], ['02', 'in-progress'], ['03', 'in-progress']])), ['02', '03']);
assert.deepEqual(inProgressSlices('no table'), []);

// Slicetree edit: impl and test, attributed to the slice.
edit(path.join(S3, 'src', 'x.js'));
edit(path.join(S3, 'tests', 'x.test.js'));
assert.deepEqual(trace(A), [['03', 'main', 'edit', 'impl', 'src/x.js'], ['03', 'main', 'edit', 'test', 'tests/x.test.js']]);

// Agent id is named; NotebookEdit is recorded.
reset();
run({ tool_name: 'NotebookEdit', tool_input: { notebook_path: path.join(S3, 'n.ipynb') }, cwd: tmp, agent_id: 'ag1' });
assert.deepEqual(trace(A), [['03', 'ag1', 'edit', 'impl', 'n.ipynb']]);

// Scopetree: the one in-progress slice; none or two give `scope`.
reset();
edit(path.join(A, 'scopetree', 'f.js'));
assert.deepEqual(trace(A), [['03', 'main', 'edit', 'impl', 'f.js']]);
edit(path.join(B, 'scopetree', 'f.js'));
assert.deepEqual(trace(B), [['scope', 'main', 'edit', 'impl', 'f.js']], 'two in-progress rows record under scope');
fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'merged']]));
reset();
edit(path.join(A, 'scopetree', 'f.js'));
assert.deepEqual(trace(A), [['scope', 'main', 'edit', 'impl', 'f.js']], 'no in-progress row records under scope');
fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]));

// Two run roots: an edit lands only in its own run's trace.
reset();
edit(path.join(B, 'slicetrees', '02', 'x.js'));
assert.equal(trace(A).length, 0);
assert.deepEqual(trace(B), [['02', 'main', 'edit', 'impl', 'x.js']]);

// Outside every run root: nothing written, no trace.log created.
reset();
edit(path.join(tmp, 'elsewhere.js'));
edit(path.join(A, 'notes.md'));
bash('echo x > ' + path.join(tmp, 'plain.txt'));
assert.ok(!fs.existsSync(path.join(A, 'trace.log')) && !fs.existsSync(path.join(B, 'trace.log')));

// Shell writes: heredoc redirect, sed -i, cp into a slicetree.
reset();
bash(`cat > ${S3}/src/h.js <<'EOF'\n> ${S3}/src/inside-body.js\nEOF`);
bash(`sed -i 's/a/b/' ${S3}/tests/s.test.js`);
fs.writeFileSync(path.join(tmp, 'a.txt'), 'x');
bash(`cp ${tmp}/a.txt ${S3}/src/b.js`);
bash(`cp ${tmp}/a.txt ${S3}/src`);
bash(`cd ${S3}/src && echo y | tee c.js`);
bash(`git -C ${S3} apply p.patch`, tmp);
bash(`echo x >> y.js`, path.join(S3, 'src'));
assert.deepEqual(trace(A), [
  ['03', 'main', 'edit', 'impl', 'src/h.js'],
  ['03', 'main', 'edit', 'test', 'tests/s.test.js'],
  ['03', 'main', 'edit', 'impl', 'src/b.js'],
  ['03', 'main', 'edit', 'impl', 'src/a.txt'],
  ['03', 'main', 'edit', 'impl', 'src/c.js'],
  ['03', 'main', 'edit', 'impl', 'src/y.js'],
]);
reset();
fs.writeFileSync(path.join(tmp, 'p.patch'), '--- a/src/p.js\n+++ b/src/p.js\n@@\n');
bash(`git -C ${S3} apply ${tmp}/p.patch`);
assert.deepEqual(trace(A), [['03', 'main', 'edit', 'impl', 'src/p.js']]);

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
// Sibling subshells do not share a directory: the `group` id tells them apart.
assert.deepEqual(bashTargets('(cd a); (echo > x)', '/r'), [path.resolve('/r', 'x')]);
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

// With shell-words.js unloadable, or scan throwing, the hook records nothing; a control run records.
{
  const preload = path.join(tmp, 'preload.js');
  const write = path.join(S3, 'src', 'unloadable.js');
  // `setup` runs in-process first, scanner loadable; `events` are recorded in the spawned hook; returns the lines `events` added.
  const hookRuns = (patch, events, setup) => {
    fs.writeFileSync(preload, patch);
    reset();
    if (setup) setup();
    const before = trace(A).length;
    const evs = events || [{ tool_name: 'Bash', tool_input: { command: `echo x > ${write}` }, cwd: tmp }];
    const code = `const { record } = require(${JSON.stringify(hookPath)}); for (const e of ${JSON.stringify(evs)}) record(e);`;
    const r = cp.spawnSync(process.execPath, ['-r', preload, '-e', code], { encoding: 'utf8', timeout: 10000 });
    assertSpawnDecided(r, 'run-trace.js with a broken scanner');
    assert.equal(r.status, 0, r.stderr);
    return trace(A).slice(before).map((l) => l[2]);
  };
  const intercept = (body) => `const M = require('module'); const load = M._load; M._load = function (req, ...a) { if (/shell-words/.test(req)) { ${body} } return load.call(this, req, ...a); };`;
  const unloadable = intercept("throw new Error('gone');");
  assert.deepEqual(hookRuns(''), ['edit'], 'control: the write records');
  assert.deepEqual(hookRuns(unloadable), [], 'shell-words.js unloadable records nothing');
  assert.deepEqual(hookRuns(intercept('return { scan() { throw new Error("boom"); } };')), [], 'scan throwing records nothing');
  // A non-Bash event records nothing either (INV-0140): a bound slice-reviewer's hand-back and stop write no verdict and no end.
  const bound = () => {
    run({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_input: { prompt: `${S3}`, subagent_type: 'superdev:slice-reviewer', description: 'review' }, cwd: tmp });
    run({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_response: { status: 'async_launched', agentId: 'aur1' }, cwd: tmp });
  };
  const review = [
    { hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'aur1', agent_type: 'superdev:slice-reviewer', tool_input: { message: '### Verdict: specification ✅ | quality: approved' }, cwd: tmp },
    { hook_event_name: 'SubagentStop', agent_id: 'aur1', agent_type: 'superdev:slice-reviewer', cwd: tmp },
  ];
  assert.deepEqual(hookRuns('', review, bound), ['verdict', 'dispatch-end'], 'control: the review records its verdict and end');
  assert.deepEqual(hookRuns(unloadable, review, bound), [], 'shell-words.js unloadable records no verdict and no dispatch-end');
  reset();
}

// Linear time (ADR 0086): four times the input takes about four times as long when linear and sixteen times when quadratic, against
// a same-run baseline; the ceiling sits at nine, between them. A long command; one shell command holding many heredoc process
// substitutions, whose words are read once, not once per substitution; and commands at a rising subshell depth, where each subshell
// instance starts in the directory of the one around it, read in constant time, not by a walk over every depth.
{
  const { timePair } = require('./linear-time');
  for (const [label, make] of [
    ['a long command', (n) => 'echo $(echo $(cat a > b)) "x > y" | tee c; '.repeat(n / 4)],
    ['many heredoc process substitutions', (n) => 'sh ' + '<(cat <<E\nx\nE\n) '.repeat(n / 2)],
    ['nested $(', (d) => 'echo ' + '$('.repeat(d) + 'echo x' + ')'.repeat(d)],
    ['nested "$( with a shell-fed heredoc', (d) => 'cat <<E | sh\ntrue\nE\necho ' + '"$('.repeat(d) + 'echo x' + ')"'.repeat(d)],
  ]) {
    const [base, big] = timePair((c) => bashTargets(c, '/r'), make(4000), make(16000));
    assert.ok(big < base * 9, `${label}: time grows linearly: ${base} ns, four times the input ${big} ns`);
  }
}

// Test paths: defaults without a section; a configured section overrides; a malformed entry is skipped.
reset();
const vf = path.join(S3, 'docs', 'agents', 'verification.md');
for (const f of ['a.spec.ts', 'pkg/__tests__/z.js', 'test_x.py', 'lib/x_test.go', 'spec/y.rb', 'src/main.js']) edit(path.join(S3, f));
assert.deepEqual(trace(A).map((l) => l[3]), ['test', 'test', 'test', 'test', 'test', 'impl'], 'defaults');
fs.writeFileSync(vf, '# V\n\n## Test paths\n\n- `check/`\n- `bad entry with spaces`\n- `/abs/**`\n- `lib/**/*.t.js`\n- scripts/run.js\n\n## Other\n\n- `src/`\n');
reset();
for (const f of ['check/a.js', 'lib/q/r.t.js', 'scripts/run.js', 'tests/x.test.js', 'src/main.js', 'other/scripts/run.js']) edit(path.join(S3, f));
assert.deepEqual(trace(A).map((l) => l[3]), ['test', 'test', 'test', 'impl', 'impl', 'impl'], 'configured section overrides defaults, malformed entries skipped');
fs.writeFileSync(vf, '# V\n\n## Test paths\n\n- `bad entry`\n');
reset();
edit(path.join(S3, 'tests', 'x.test.js'));
assert.deepEqual(trace(A).map((l) => l[3]), ['test'], 'a section with no usable entry applies the defaults');
fs.rmSync(vf);
reset();
for (const f of ['services/api/tests/a.bats', 'src/test/java/FooTest.java', 'Libs/Weaver.Core.Tests/FooTests.cs', 'Libs/Weaver.Core.Test/Foo.cs', 'pkg/spec/x_spec.rb', 'src/latest/a.ts', 'contest/b.ts']) edit(path.join(S3, f));
assert.deepEqual(trace(A).map((l) => l[3]), ['test', 'test', 'test', 'test', 'test', 'impl', 'impl'], 'default directories match at any depth by whole segment, .Tests and .Test directories too');

// The hook and `scope.js suite reusable` share one classifier: every path gets the same kind from the
// hook's recorded edit as from `isTestPath` over the same verification.md text, defaults and configured.
{
  const same = ['services/api/tests/a.bats', 'Libs/Weaver.Core.Tests/FooTests.cs', 'pkg/__tests__/z.js', 'lib/x_test.go', 'check/a.js', 'lib/q/r.t.js', 'tests/x.test.js', 'src/main.js', 'contest/b.ts'];
  for (const text of ['', '# V\n\n## Test paths\n\n- `check/`\n- `lib/**/*.t.js`\n']) {
    if (text) fs.writeFileSync(vf, text);
    reset();
    for (const f of same) edit(path.join(S3, f));
    assert.deepEqual(trace(A).map((l) => l[3]), same.map((f) => (isTestPath(text, f) ? 'test' : 'impl')), 'hook and isTestPath agree: ' + (text ? 'configured' : 'defaults'));
  }
  fs.rmSync(vf);
}

// Test runs, reverts, restores (ADR 0117). S3 becomes a git repository so the run line carries a real sha.
const git = (...a) => cp.execFileSync('git', ['-C', S3, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
git('init', '-q');
git('add', '-A');
git('commit', '-q', '-m', 'base');
const sha = git('rev-parse', 'HEAD');
const post = (command, extra) => run(Object.assign({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, cwd: S3 }, extra));
const fail = (command) => post(command, { hook_event_name: 'PostToolUseFailure' });
const tail = (rows) => rows.map((l) => l.slice(2).join(' '));

reset();
post('bun run test');
fail('bun run test');
// The sentinel holds a character no hex sha contains, so a commit sha never matches it by chance.
post('GITEA_TOKEN=zz-secret-zz bun run test');
assert.deepEqual(tail(trace(A)), [`run full pass ${sha} clean -`, `run full fail ${sha} clean -`, `run full pass ${sha} clean -`], 'full command, both events; env value and command text never recorded');
assert.ok(!fs.readFileSync(path.join(A, 'trace.log'), 'utf8').includes('zz-secret-zz'));

reset();
post('node tests/x.test.js');
post('grep foo tests/x.test.js');
post('cat tests/x.test.js');
post('git diff tests/x.test.js');
post('bun run test:unit');
assert.deepEqual(tail(trace(A)), [`run path pass ${sha} clean tests/x.test.js`], 'a path run records; reads and a sibling command record nothing');

// A quoted note that begins with a test path is free text, never a path: a command writing it records no run.
reset();
post(`node scripts/note.js dod-line 3 "tests/x.test.js adopt block: a stage-less payload is refused"`);
assert.deepEqual(tail(trace(A)), [], 'a note argument starting with a test path records no run');
// A quoted test path that holds a space and names a file is still a path run.
fs.mkdirSync(path.join(S3, 'tests'));
fs.writeFileSync(path.join(S3, 'tests', 'x y.test.js'), '');
reset();
post(`node "tests/x y.test.js"`);
fs.rmSync(path.join(S3, 'tests'), { recursive: true });
assert.deepEqual(tail(trace(A)).map((l) => l.split(' ').slice(0, 2).join(' ')), ['run path'], 'a quoted test path with a space records');

// A compound configured command matches across the segments it spans, with the outcome rules of a direct run (#928).
const vfSaved = fs.readFileSync(vf, 'utf8');
fs.writeFileSync(vf, '# V\n\n```sh\nbun test && bash scripts/test-affected.sh\n```\n\n```sh\nbun test {paths}\n```\n');
reset();
post('bun test && bash scripts/test-affected.sh');
fail('bun test && bash scripts/test-affected.sh');
post('bun test');
post('bun test; bash scripts/test-affected.sh');
post('bun test && bash scripts/test-affected.sh || true');
assert.deepEqual(tail(trace(A)), [`run full pass ${sha} dirty -`, `run full fail ${sha} dirty -`, `run full unknown ${sha} dirty -`], 'a compound full command records one run; its prefix alone or a different joiner records none');
post('bun test && bash scripts/test-affected.sh --x');
assert.equal(trace(A).pop()[3], 'focused', 'a compound full run with a segment past its template narrows to focused');
reset();
fs.writeFileSync(vf, '# V\n\n```sh\ncd sub && bun test\n```\n');
post('cd sub && bun test');
assert.deepEqual(tail(trace(A)), [`run full pass ${sha} dirty -`], 'a compound configured command starting with cd matches');
post('cd sub && bun test && node tests/a.test.js');
assert.equal(trace(A).filter((l) => l[2] === 'run').pop()[7], 'sub/tests/a.test.js', 'a cd inside a matched compound still moves the base');
reset();
fs.writeFileSync(vf, '# V\n\n```sh\nbun test | tee out.log\n```\n');
post('bun test | tee out.log');
post('set -o pipefail; bun test | tee out.log');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown'], 'a pipe into a non-pass-through stage inside a compound reads unknown, as the same pipe run directly does');
reset();
fail('set -o pipefail; bun test | tee out.log');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown'], 'under pipefail a non-pass-through stage inside a compound hides the status, as a direct run does');
fs.writeFileSync(vf, '# V\n\n```sh\nbun test; bash x.sh\n```\n\n```sh\nbun test || true\n```\n');
reset();
fail('bun test; bash x.sh');
fail('bun test || true');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown'], 'an inner ; or || keeps the status unknown');

fs.writeFileSync(vf, '# V\n\n```sh\nbun test | tee out.log\n```\n');
reset();
post('rtk proxy bun test | tee out.log');
assert.equal(trace(A).filter((l) => l[2] === 'run').length, 1, 'rtk proxy <command> is <command>');
fs.writeFileSync(vf, '# V\n\n```sh\ncd sub; bun test\n```\n\n```sh\ncd sub && set -o pipefail && bun test | tail -5\n```\n');
reset();
post('cd sub; bun test');
fail('cd sub && set -o pipefail && bun test | tail -5');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['pass', 'fail'], 'a joiner before the test and a pipefail past the first segment do not hide the outcome');
fs.writeFileSync(vf, vfSaved);

// A wrapper never changes what a command is: `rtk` joins the wrappers.
reset();
post('rtk grep foo tests/x.test.js');
post('rtk -v bun run test');
post('rtk bun run test');
assert.deepEqual(tail(trace(A)), [`run full pass ${sha} clean -`, `run full pass ${sha} clean -`], 'rtk <test command>, with or without option words, is that run; rtk <search> is none');

reset();
for (const c of ['node tests/x.test.js | tail -5', 'node tests/x.test.js || true', 'node tests/x.test.js; true']) post(c);
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'unknown'], 'an exit status that hides the test reads unknown');
reset();
post('set -o pipefail; node tests/x.test.js | tail -5');
fail('set -o pipefail; node tests/x.test.js | tail -5');
assert.deepEqual(trace(A).map((l) => l[4]), ['pass', 'fail'], 'pipefail keeps the real outcome');

reset();
for (const c of ['set -o pipefail; bun run test 2>&1 | tail -5; echo done', 'set -o pipefail; bun run test 2>&1 | tail -5 || true']) post(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown'], 'a command after the pipeline hides the test status');

// Under pipefail only a pass-through pipe stage (tail, cat) keeps the test's status; any other stage decides it.
reset();
for (const c of ['set -o pipefail; bun run test 2>&1 | grep FAIL', 'set -o pipefail; bun run test | false', 'set -o pipefail; bun run test | head -20', 'set -o pipefail; bun run test | cat | grep x', 'set -o pipefail; set +o pipefail; bun run test | tail -5']) fail(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'], 'a pipe stage that can fail on its own hides the test status; +o pipefail turns it off');
reset();
for (const c of ['set -o pipefail; bun run test 2>&1 | tail -5', 'set -o pipefail; bun run test | cat | tail -5', 'set -euo pipefail; bun run test | tail -5', 'set +o pipefail; set -o pipefail; bun run test | tail -5', 'set -o pipefail; bun run test 2>&1 | tail -5\n', 'set -o pipefail; bun run test 2>&1 | tail -5;']) fail(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['fail', 'fail', 'fail', 'fail', 'fail', 'fail'], 'tail and cat stages, option groups, the last pipefail sign, and trailing separators keep the real outcome');

reset();
fs.writeFileSync(path.join(S3, 'src', 'dirty.js'), 'x');
post('bun run test');
assert.equal(trace(A)[0][6], 'dirty');
fs.rmSync(path.join(S3, 'src', 'dirty.js'));

// A git call killed at its bound records unknown for its field.
{
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nsleep 5\n', { mode: 0o755 });
  reset();
  const input = { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 };
  const r = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify(input), encoding: 'utf8', timeout: 10000, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, RUN_TRACE_GIT_BOUND_MS: '200' } });
  assertSpawnDecided(r, 'run-trace.js with a stalled git');
  assert.deepEqual(tail(trace(A)), ['run full pass unknown unknown -'], 'a killed git call records unknown');
}

reset();
post('git restore --source=main -- src/x.js');
post('git restore -- src/x.js');
post('git checkout HEAD -- src/x.js');
post('git checkout main -- src/x.js');
post('git checkout feature');
fail('git restore --source=main -- src/y.js');
assert.deepEqual(trace(A).map((l) => l.slice(2).join(' ')), ['revert src/x.js', 'restore src/x.js', 'restore src/x.js', 'revert src/x.js']);

// The tree comes from the effective directory at each segment, the input cwd only as the fallback.
{
  const S2 = path.join(A, 'slicetrees', '02');
  const git2 = (...a) => cp.execFileSync('git', ['-C', S2, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(S2, 'src', 'm.js'), 'm');
  fs.mkdirSync(path.join(S2, 'docs', 'agents'), { recursive: true });
  fs.copyFileSync(vf, path.join(S2, 'docs', 'agents', 'verification.md'));
  git2('init', '-q');
  git2('add', '-A');
  git2('commit', '-q', '-m', 'base2');
  const sha2 = git2('rev-parse', 'HEAD');
  assert.notEqual(sha, sha2);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-out-'));
  reset();
  bash(`cd ${S3} && bun run test`, outside);
  bash(`git -C ${S3} restore --source=main -- f`, outside);
  assert.deepEqual(trace(A).map((l) => l.join(' ')), [`03 main run full pass ${sha} clean -`, '03 main revert f']);
  reset();
  bash(`cd ${S2} && bun run test`, S3);
  assert.deepEqual(trace(A).map((l) => l.join(' ')), [`02 main run full pass ${sha2} clean -`], 'a cd into another tree records in that tree');
  fs.rmSync(outside, { recursive: true, force: true });
}

// A pass names the test only where the test is the command's sole command.
reset();
for (const c of ['true || bun run test', 'bun run test &', 'bun run test; echo done', 'npm run build && bun run test', 'cd src || bun run test']) post(c);
post('cd src && bun run test');
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'pass'], 'a pass outside the sole-command shape reads unknown');
reset();
fail('true || bun run test');
fail('bun run test &');
fail('cd src && bun run test');
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'fail']);

// A lone `&` separates commands; `&&`, `&>`, `2>&1`, `|&`, and a quoted `&` do not.
reset();
for (const c of ['bun run test & wait', 'bun run test & echo x']) post(c);
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown'], 'a background test names no outcome');
reset();
for (const c of ['bun run test &> out.log', 'set -o pipefail; bun run test 2>&1 | tail -5', 'bun run test |& tail -5', 'echo "a & b" && bun run test']) post(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['pass', 'pass', 'unknown', 'unknown']);
reset();
fail('bun run test & wait');
fail('bun run test &> out.log');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'fail']);

// A failed chain names fail only where the test is the command's failure.
reset();
fail('npm run build && bun run test');
fail('bun run test && echo done');
fail('cd src && bun run test');
fail('bun run test');
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'fail', 'fail']);

// `git restore --staged` touches only the index.
reset();
post('git restore --staged src/x.js');
post('git restore -S src/x.js');
post('git restore --staged --worktree src/x.js');
assert.deepEqual(trace(A).map((l) => l.join(' ')), ['03 main restore src/x.js']);

// A command that writes a file and runs a test records both events.
reset();
post('echo x > src/w.js && bun run test');
assert.deepEqual(trace(A).map((l) => l[2]), ['run', 'edit']);

// Focused and whole-repo commands classify by kind; the longest match wins.
fs.writeFileSync(vf, '# V\n\n```sh\nnx affected -t test\n```\n\n```sh\nnx test --fast\n```\n\n## Whole-repo command\n\n`nx run-many -t test`\n');
reset();
for (const c of ['nx affected -t test', 'nx test --fast', 'nx run-many -t test']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['full', 'focused', 'whole']);

// Command position (INV-0129): a test command quoted in an argument records no run; a real compound invocation does.
fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test --related {paths}\n```\n');
reset();
for (const c of ['tea pr create --description "Verified: bun run test passes"', 'gh pr comment 3 -b "ran bun run test"', "echo 'bun run test'", 'bun run test:unit']) post(c);
assert.deepEqual(trace(A), [], 'a quoted test command and a sibling script record no run');
reset();
for (const c of ['cd src && bun run test', 'FOO=1 bun run test', 'bun run test | tail', 'bun run test 2>&1', 'sudo bun run test']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['full', 'full', 'full', 'full', 'full'], 'real compound invocations record');

// `{paths}` stands for one or more path words: a substituted focused run is focused, never full.
{
  const v = { full: 'bun run test', focused: 'bun run test --related {paths}', whole: null };
  assert.equal(verificationKind('bun run test --related a.js', v), 'focused');
  assert.equal(verificationKind('FOO=1 bun run test', v), 'full');
  assert.equal(verificationKind('FOO="bun run test" echo x', v), null, 'an env value is no command');
}
// A configured command is normalized as a segment is: its env assignments and wrappers are not command words.
for (const full of ['CI=1 bun run test', 'time bun run test']) {
  const v = { full, focused: 'CI=1 bun run test --related {paths}', whole: null };
  assert.equal(verificationKind('bun run test', v), 'full', `${full}: bare invocation`);
  assert.equal(verificationKind('CI=1 bun run test', v), 'full', `${full}: env-prefixed invocation`);
  assert.equal(verificationKind('bun run test --related a.js', v), 'focused', `${full}: focused with {paths}`);
}
// A redirect is stripped outside quoted words only.
{
  const v = { full: 'bun run test', focused: null, whole: null };
  assert.equal(verificationKind('FOO="a>b" bun run test', v), 'full', 'a quoted env value holds its `>`');
  assert.equal(verificationKind('bun run test > out.txt', v), 'full');
  assert.equal(verificationKind('bun run test >out.txt 2>&1', v), 'full');
  assert.equal(verificationKind('echo "bun run test > x"', v), null);
}
// A full-template match whose command words run past the template is a narrowed run, never full (INV-0129).
{
  const v = { full: 'bun run test', focused: 'node scripts/run-tests.js --related {paths}', whole: null };
  assert.equal(verificationKind('bun run test --related plugin/hooks/a.js', v), 'focused');
  assert.equal(verificationKind('bun run test -- --related a.js', v), 'focused');
  assert.equal(verificationKind('bun run test 2>&1', v), 'full', 'a redirect adds no argument word');
  assert.equal(verificationKind('bun run test > out.txt', v), 'full');
}
// The same rule holds for a whole-repo match: `pnpm turbo test --filter=web` is a narrowed run, never `whole` (INV-0129).
{
  const v = { full: 'pnpm turbo test --affected', focused: null, whole: 'pnpm turbo test' };
  assert.equal(verificationKind('pnpm turbo test --affected', v), 'full');
  assert.equal(verificationKind('pnpm turbo test', v), 'whole');
  assert.equal(verificationKind('pnpm turbo test 2>&1', v), 'whole', 'a redirect adds no argument word');
  assert.equal(verificationKind('pnpm turbo test --filter=web', v), 'focused');
  assert.equal(verificationKind('pnpm turbo test --affected --filter=web', v), 'focused');
}
{
  const turbo = '# V\n\n```sh\npnpm turbo test --affected\n```\n\n## Whole-repo command\n\n`pnpm turbo test`\n';
  fs.writeFileSync(vf, turbo);
  reset();
  post('pnpm turbo test --filter=web');
  assert.deepEqual(trace(A).map((l) => l[3]), ['focused']);
  const root = fs.mkdtempSync(path.join(tmp, 'reuse-'));
  fs.writeFileSync(path.join(root, 'ledger.md'), ledger([['03', 'in-progress']]).replace('**Stage:** implementing', `**Stage:** implementing\n**Suite:** green @ ${sha} whole`));
  fs.copyFileSync(path.join(A, 'trace.log'), path.join(root, 'trace.log'));
  for (const extra of [[], ['--whole']]) {
    const r = cp.spawnSync(process.execPath, [require.resolve('../plugin/scripts/scope.js'), 'suite', 'reusable', '--branch', 'HEAD', '--root', root, ...extra], { cwd: S3, encoding: 'utf8', timeout: 10000 });
    assertSpawnDecided(r, 'scope.js suite reusable');
    assert.equal(r.status, 1, `a narrowed whole-template run is no reuse evidence ${extra.join(' ')}`);
    assert.ok(/no (full or whole|whole) run/.test(r.stderr), r.stderr);
  }
  fs.rmSync(root, { recursive: true, force: true });
  fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test --related {paths}\n```\n');
}
reset();
for (const c of ['bun run test --related a.js', 'bun run test --related a.js b.js', 'bun run test', 'bun run test --related']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['focused', 'focused', 'full', 'focused'], 'the longest template wins; argument words past the full template narrow the run');
fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nnode scripts/run-tests.js --related {paths}\n```\n');
reset();
post('node scripts/run-tests.js --related tests/a.test.js scripts/b.js');
assert.deepEqual(trace(A).map((l) => l[3]), ['focused'], 'a focused command that shares no prefix with the full one records focused');

// Command position: a subshell, brace group, `!`, a shell keyword, or `timeout` before the command does not hide it;
// a quoted (`bash -c "..."`) or indirect (`xargs`) mention still records nothing.
fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test --related {paths}\n```\n');
reset();
for (const c of ['(cd app && bun run test)', '{ bun run test; }', 'if bun run test; then echo ok; fi', 'timeout 60 bun run test',
  'timeout -k 5 1m bun run test', '! bun run test', 'while bun run test; do :; done']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['full', 'full', 'full', 'full', 'full', 'full', 'full'], 'command-position forms still record');
reset();
for (const c of ['bash -c "bun run test"', 'xargs bun run test', 'npx bun run test']) post(c);
assert.deepEqual(trace(A), [], 'a quoted or indirect test command records no run');

// A substitution inside the test's own command is no later stage; a command after a subshell run is.
reset();
post('bun run test $(cat x)');
post('(bun run test) && echo ok');
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['focused pass', 'full unknown'], 'the substitution word narrows the run and ends nothing');

// `!` inverts the exit status, so the outcome of a negated run names no pass or fail (INV-0017).
reset();
post('! bun run test');
post('if ! bun run test; then echo bad; fi');
fail('! bun run test');
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full unknown', 'full unknown', 'full unknown'], 'a negated run reads unknown on both events');
// The `!` holds behind a keyword and in front of a group.
reset();
for (const c of ['! { bun run test; }', '! time bun run test', '! (bun run test)']) fail(c);
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full unknown', 'full unknown', 'full unknown'], 'a negated group or keyword run reads unknown');
// A `!` before a group negates the group's last command, so any negated command ahead of the test makes its status unknown.
reset();
const negGroups = ['! { cd sub; bun run test; }', '! (cd sub && bun run test)', '! { set -e; bun run test; }', '! { true; bun run test; }', '! (true; bun run test)'];
for (const c of negGroups) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), negGroups.flatMap(() => ['full unknown', 'full unknown']), 'a run behind a negated group reads unknown on both events');

// Any unquoted `!` negation in the command line makes every test run of it unknown, wherever the negation lands.
reset();
const negLines = ['! case x in *) bun run test;; esac', '! case x in *) true; bun run test;; esac', '! if true; then bun run test; fi', '! while false; do :; done; bun run test',
  '! { cd sub; bun run test; }', '! [[ -n x ]] || bun run test'];
for (const c of negLines) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), negLines.flatMap(() => ['full unknown', 'full unknown']), 'a `!` anywhere in the line reads every run unknown');
// A `!` in quotes, in `[[ ]]` operands, or inside a word is no negation.
for (const c of ['[[ a != b ]] && bun run test', "echo '!' ; bun run test", '[[ ! -n x ]] && bun run test', 'echo a!b && bun run test']) {
  assert.deepEqual(testRuns(c, S3).map((r) => r.unknown), [false], c);
}

// A function definition runs nothing: its body records no run, restore, or `scope.js test` call.
reset();
for (const c of ['x() { bun run test; }', 'function x { bun run test; }', 'function x () { bun run test; }', 'x() { bun run test; }; x']) { post(c); fail(c); }
assert.deepEqual(trace(A), [], 'a test inside a function body records no run');

// A function header with a body that is no group records no run on either event.
reset();
for (const c of ['f() case x in *) bun run test;; esac', 'f() for i in 1; do bun run test; done', 'f() if true; then bun run test; fi', 'f() while false; do bun run test; done',
  'f() until true; do bun run test; done', 'f() select x in 1; do bun run test; done', 'f() [[ -n x ]]; bun run test', 'f() (( 1 )); bun run test']) { post(c); fail(c); }
assert.deepEqual(trace(A), [], 'a bare compound function body records no run');

// A run records pass or fail only in a plain list of simple commands: a test inside compound structure or a substitution reads unknown.
reset();
const compoundLines = ['case $(bun run test) in *) ;; esac', 'case "$(bun run test)" in *) ;; esac', 'case `bun run test` in *) ;; esac', 'case x in $(bun run test)) ;; esac',
  'if true; then bun run test; fi', 'for i in 1; do bun run test; done', '{ bun run test; }', '(bun run test)', '[[ -n x ]] && bun run test'];
for (const c of compoundLines) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), compoundLines.flatMap(() => ['full unknown', 'full unknown']), 'a run in compound structure reads unknown on both events');
// A coprocess runs asynchronously and the line exits at once, so the status is not the test's.
reset();
const asyncLines = ['coproc bun run test', 'time coproc bun run test', 'set -o pipefail; coproc bun run test | cat'];
for (const c of asyncLines) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), asyncLines.flatMap(() => ['full unknown', 'full unknown']), 'a coprocess run reads unknown on both events');
// A backtick body runs before the command it sits in, so its commands come first in the list as in the `$( )` spelling.
reset();
const tickLines = ['cd `echo nowhere` && bun run test', 'set `echo x`; bun run test | cat'];
for (const c of tickLines) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), tickLines.flatMap(() => ['full unknown', 'full unknown']), 'a run after a backtick body reads unknown on both events');
// A heredoc body's commands (`exit 1` in a substitution) are no test paths and leave no run of their own.
reset();
fail('cd tests <<EOF && bun run test\n$(exit 1)\nEOF');
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full unknown'], 'a heredoc body adds no run line');
// A plain list keeps its outcome.
reset();
for (const c of ['bun run test', 'cd sub && bun run test', 'set -o pipefail; bun run test | tail -5']) { post(c); fail(c); }
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full pass', 'full fail', 'full pass', 'full fail', 'full pass', 'full fail'], 'a plain list of simple commands keeps pass and fail');

// A function body's writes record at its definition, since a call of it later writes them; its `cd` moves nothing outside it.
assert.deepEqual(bashTargets('f() { echo x > out; }; f', S3), [path.join(S3, 'out')], 'a function body write records');
assert.deepEqual(bashTargets('function f { cp a out; }; f', S3), [path.join(S3, 'out')], 'a `function` body write records');
assert.deepEqual(bashTargets('f() { cd sub; }; echo > out', S3), [path.join(S3, 'out')], 'a function body cd moves nothing at definition');

// The wrappers `timeout` and `env` take `--` and their option flags before the command.
reset();
for (const c of ['timeout 5s -- bun run test', 'timeout -k 5 1m -- bun run test', 'env -i FOO=1 bun run test', 'env -u HOME bun run test', 'env -- bun run test']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['full', 'full', 'full', 'full', 'full'], 'wrapped runs record');

// `sudo` and `nice` take option words (and a value for `-u`, `-g`, `-C`, `-n`, attached or separate) before the command.
reset();
const OPTS = ['sudo -E bun run test', 'sudo -u root bun run test', 'sudo -uroot bun run test', 'sudo -iu root bun run test', 'sudo -g wheel -u root bun run test',
  'sudo --user root bun run test', 'sudo -- bun run test', 'nice bun run test', 'nice -n 5 bun run test', 'nice -n5 bun run test', 'nice --adjustment 5 bun run test', 'time -p bun run test',
  'sudo -D /x bun run test', 'sudo --chdir /x bun run test', 'sudo -p pw bun run test'];
for (const c of OPTS) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), OPTS.map(() => 'full'), 'a wrapper\'s option words and their values do not hide the run');
reset();
for (const c of ['sudo -u root bash -c "bun run test"', 'sudo -E echo "bun run test"', 'nice -n 5 xargs bun run test', 'command -v bun run test']) post(c);
assert.deepEqual(trace(A), [], 'a quoted, indirect, or lookup mention behind a wrapper records no run');

// A PreToolUse rewrite reaches PostToolUse: RTK's hook turns `bun run test` into `rtk bun run test`, and `rtk` passes the
// command's exit status through, so the run records with its outcome (docs/known-issues.md, #955).
reset();
const RTK = ['rtk bun run test', 'rtk --ultra-compact bun run test', `cd ${S3} && rtk bun run test`];
for (const c of RTK) post(c, c.startsWith('cd ') ? { cwd: tmp } : {});
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), RTK.map(() => 'full pass'), 'a run behind rtk records with its outcome');
reset();
fail('rtk bun run test');
assert.deepEqual(trace(A).map((l) => l.slice(3, 5).join(' ')), ['full fail'], 'a failed run behind rtk records fail');

// An escaped `)` ends a path word; only an unescaped closing `)` is dropped.
reset();
post('git restore src/a\\(1\\)');
post('(git restore src/b.js)');
// The trace field encodes each backslash as two.
assert.deepEqual(trace(A).map((l) => l.slice(2).join(' ')), ['restore src/a\\\\(1\\\\)', 'restore src/b.js']);

// `{paths}` matches embedded in a word, and after an optional `--`.
{
  const v = { full: 'make test', focused: 'make test FILES={paths}', whole: null };
  assert.equal(verificationKind('make test FILES=a.js', v), 'focused');
  assert.equal(verificationKind('make test', v), 'full');
  assert.equal(verificationKind('make test FILES=', v), 'focused', 'the placeholder needs a path, and the extra word narrows the full run');
  const w = { full: 'bun run test', focused: 'bun run test --related {paths}', whole: null };
  assert.equal(verificationKind('bun run test --related -- a.js', w), 'focused');
  assert.equal(verificationKind('bun run test --related -- ', w), 'focused');
}

// A focused run never backs a reused suite record (INV-0017), in either focused form.
for (const [template, command] of [['node scripts/run-tests.js --related {paths}', 'node scripts/run-tests.js --related tests/a.test.js'],
  ['bun run test --related {paths}', 'bun run test --related tests/a.test.js'],
  ['node scripts/run-tests.js --related {paths}', 'bun run test --related tests/a.test.js'],
  ['node scripts/run-tests.js --related {paths}', 'bun run test -- --related tests/a.test.js']]) {
  fs.writeFileSync(vf, `# V\n\n\`\`\`sh\nbun run test\n\`\`\`\n\n\`\`\`sh\n${template}\n\`\`\`\n`);
  reset();
  post(command);
  const root = fs.mkdtempSync(path.join(tmp, 'reuse-'));
  fs.writeFileSync(path.join(root, 'ledger.md'), ledger([['03', 'in-progress']]).replace('**Stage:** implementing', `**Stage:** implementing\n**Suite:** green @ ${sha}`));
  fs.copyFileSync(path.join(A, 'trace.log'), path.join(root, 'trace.log'));
  const r = cp.spawnSync(process.execPath, [require.resolve('../plugin/scripts/scope.js'), 'suite', 'reusable', '--branch', 'HEAD', '--root', root], { cwd: S3, encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(r, 'scope.js suite reusable');
  assert.equal(r.status, 1, `a focused run alone is no full-suite evidence (${template})`);
  assert.ok(/no full or whole run/.test(r.stderr), r.stderr);
  fs.rmSync(root, { recursive: true, force: true });
}

// No verification.md: no full run, still a path run.
fs.rmSync(vf);
reset();
post('bun run test');
post('node tests/x.test.js');
assert.deepEqual(tail(trace(A)).map((l) => l.split(' ').slice(0, 2).join(' ')), ['run path']);

// Missing RED note (ADR 0117): one note per test edit, on an impl edit or a passing run, behavior slices only.
{
  fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  const editOut = (f, extra) => runOut(Object.assign({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(S3, f) }, cwd: tmp }, extra));
  const postOut = (command, extra) => runOut(Object.assign({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, cwd: S3 }, extra));
  const T = 'tests/n.test.js';
  reset();
  assert.equal(editOut('src/first.js'), '', 'an impl edit before the first test edit gets no note');
  assert.equal(editOut(T), '', 'a test edit gets no note');
  const note = editOut('src/n.js');
  assert.ok(note.includes(T) && /failing test run/.test(note), 'the note names the test file and the missing failing run');
  assert.deepEqual(trace(A).filter((l) => l[2] === 'note'), [['03', 'main', 'note', T]], 'the note is recorded');
  assert.equal(editOut('src/n2.js'), '', 'one note per test edit');
  assert.equal(postOut('bun run test'), '', 'a later pass stays silent too');
  editOut(T);
  assert.ok(postOut('bun run test').includes(T), 'a passing run after a test edit with no failing run notes');
  assert.equal(runOut({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 }), '');
  reset();
  editOut(T);
  runOut({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 });
  assert.equal(editOut('src/n.js'), '', 'a failing run between the test edit and the impl edit');
  assert.equal(postOut('bun run test'), '');
  reset();
  editOut(T);
  postOut('node tests/n.test.js | tail -1');
  assert.ok(editOut('src/n.js').includes('Missing RED'), 'an unknown run is not a failing run');
  // A path with a space: the note line carries the edit line's field, and the text shows the real path.
  reset();
  const SP = 'tests/my file.test.js';
  editOut(SP);
  const spNote = editOut('src/n.js');
  assert.ok(spNote.includes(SP), 'the note text shows the real path');
  const spLines = trace(A);
  assert.equal(spLines.find((l) => l[2] === 'note')[3], spLines.find((l) => l[2] === 'edit' && l[3] === 'test')[4], 'the note field equals the edit field');
  // Two implementation targets in one command: one note.
  reset();
  editOut(T);
  const two = postOut(`touch ${S3}/src/a.js ${S3}/src/b.js; echo x | tee ${S3}/src/c.js ${S3}/src/d.js`);
  assert.equal(two.split('\n').length, 1, 'one note for two impl targets');
  assert.equal(trace(A).filter((l) => l[2] === 'note').length, 1);
  // A lone unknown run, then a pass: one note.
  reset();
  editOut(T);
  postOut('node tests/n.test.js | tail -1');
  assert.ok(postOut('bun run test').includes('Missing RED'));
  assert.equal(trace(A).filter((l) => l[2] === 'note').length, 1, 'one note across unknown then pass');
  // A `scope.js test` call records its own run (ADR 0127): the hook writes no run line, wrapped or piped, and still
  // sends the note after a foreground call that passed.
  const SCOPE = require.resolve('../plugin/scripts/scope.js');
  for (const c of [`node ${SCOPE} test full | tail -1`, `rtk node ${SCOPE} test focused a.ts`, `timeout 900 node ${SCOPE} test -- bun run test`, `cd ${S3} && node ${SCOPE} test full`, `FOO=1 node ${SCOPE} test whole 2>&1`, `node ${SCOPE} test -- node tests/n.test.js`, `node --no-warnings ${SCOPE} test -- node tests/n.test.js`,
    `node "${SCOPE}" test -- node tests/n.test.js`, `node '${SCOPE}' test full`, 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test -- node tests/n.test.js']) {
    reset();
    postOut(c);
    runOut({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: c }, cwd: S3 });
    assert.deepEqual(trace(A).filter((l) => l[2] === 'run'), [], 'the hook records no run for: ' + c);
  }
  reset();
  editOut(T);
  assert.ok(postOut(`node ${SCOPE} test full | tail -1`).includes('Missing RED'), 'a passing scope.js test run after a test edit notes');
  for (const q of [`node "${SCOPE}" test full`, 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full']) {
    reset();
    editOut(T);
    assert.ok(postOut(q).includes('Missing RED'), 'the quoted invocation notes too: ' + q);
  }
  // The verb records in the tree of the command it classifies, and a Node option may take a value: the note follows both.
  for (const [c, cwd] of [[`node ${SCOPE} test -- 'cd ${S3} && node tests/n.test.js'`, tmp], [`node -r ${path.join(tmp, 'm.js')} ${SCOPE} test full`, S3]]) {
    reset();
    editOut(T);
    assert.ok(runOut({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: c }, cwd }).includes('Missing RED'), 'a passing call notes: ' + c);
    assert.deepEqual(trace(A).filter((l) => l[2] === 'run'), [], 'the hook records no run for: ' + c);
  }
  // Only the script word of `node` counts: a test file that merely has `scope.js test` among its arguments is a direct run, recorded.
  for (const c of [`node tests/n.test.js scope.js test`, `node tests/n.test.js --file plugin/scripts/scope.js test`, `node -e 'x' ${SCOPE} test`]) {
    reset();
    postOut(c);
    assert.equal(trace(A).filter((l) => l[2] === 'run').length, c.includes('-e') ? 0 : 1, 'one run line for: ' + c);
  }
  // A mixed command records the direct runs around the `scope.js test` call, never the call itself.
  for (const c of [`node tests/n.test.js && node ${SCOPE} test full`, `bun run test; node ${SCOPE} test full`, `node ${SCOPE} test full; node tests/n.test.js`]) {
    reset();
    editOut(T);
    assert.ok(postOut(c).includes('Missing RED'), 'the note still follows: ' + c);
    const runs = trace(A).filter((l) => l[2] === 'run');
    assert.equal(runs.length, 1, 'one run line, the direct run, for: ' + c);
    assert.equal(runs[0][4], 'unknown', 'a direct run beside another command reads unknown: ' + c);
  }
  reset();
  editOut(T);
  appendTrace(A, { slice: '03', kind: 'run', fields: ['full', 'fail', 'unknown', 'unknown', '-'] });
  assert.equal(postOut(`node ${SCOPE} test full`), '', 'a failing run line from the verb satisfies the RED step');
  // A fail-to-pass run is no test run (ADR 0134): a call of its verb records no run line, and its outcome line is no failing run.
  reset();
  editOut(T);
  assert.equal(postOut(`node ${SCOPE} fail-to-pass abc..def`), '', 'a fail-to-pass call after a test edit notes nothing');
  assert.deepEqual(trace(A).filter((l) => l[2] === 'run'), [], 'and records no run line');
  appendTrace(A, { slice: '03', kind: 'fail-to-pass', fields: ['abc..def', 'fail-to-pass', 'control=0,put-back=1'] });
  assert.ok(editOut('src/n.js').includes('Missing RED'), 'an outcome line does not satisfy the RED step');
  reset();
  editOut(T);
  const bg = `node ${SCOPE} test full`;
  assert.equal(runOut({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: bg, run_in_background: true }, cwd: S3 }), '', 'a background call has run nothing yet');
  postOut(`echo node ${SCOPE} test full`);
  assert.equal(trace(A).filter((l) => l[2] === 'note').length, 0, 'an echo of the command is no run');
  // The same sequence on a mechanical slice, a docs slice, and a repository with no test command: no note.
  for (const type of ['mechanical', 'docs']) {
    fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]).replace('| 03 | #03 | t | behavior', `| 03 | #03 | t | ${type}`));
    reset();
    editOut(T);
    assert.equal(editOut('src/n.js'), '', type);
    assert.equal(postOut('bun run test'), '', type);
  }
  // An edit in a slicetree the ledger has no row for: no note.
  fs.mkdirSync(path.join(A, 'slicetrees', '04', 'src'), { recursive: true });
  reset();
  runOut({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(A, 'slicetrees', '04', T) }, cwd: tmp });
  assert.equal(runOut({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(A, 'slicetrees', '04', 'src', 'n.js') }, cwd: tmp }), '', 'no ledger row, no note');
  fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]));
  fs.rmSync(vf);
  reset();
  editOut(T);
  assert.equal(editOut('src/n.js'), '', 'no test command configured');

  // A slice title with an escaped pipe leaves the type cell where the ledger reader finds it: the note still fires.
  fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]).replace('| 03 | #03 | t |', '| 03 | #03 | a \\| b |'));
  reset();
  editOut(T);
  assert.ok(editOut('src/n.js').includes('Missing RED'), 'an escaped pipe in a title leaves the type readable');
  fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]));
  fs.rmSync(vf);
}

// A test run in a background Bash call returns before the test ran: its outcome is unknown, never pass.
{
  const vf2 = path.join(S3, 'docs', 'agents', 'verification.md');
  fs.writeFileSync(vf2, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  reset();
  run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test', run_in_background: true }, cwd: S3 });
  run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 });
  assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'pass'], 'only the foreground run records pass');
  fs.rmSync(vf2);
}

// Subagent dispatches: PreToolUse on Agent records `dispatch`, PostToolUse `completed` (or async_launched then SubagentStop) the `dispatch-end`.
const agentPre = (prompt, tu, type, description, cwd, session) => ({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: tu, tool_input: { prompt, subagent_type: type || 'superdev:implementer', description: description || 'build it' }, cwd: cwd || tmp, ...(session ? { session_id: session } : {}) });
const agentPost = (tu, response, cwd) => ({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: tu, tool_response: response, cwd: cwd || tmp });
// Dispatch prompts and the scope and slice each one attributes to (INV-0136). `{A}` and `{B}` stand for two run
// roots that hold a ledger, `{NOLEDGER}` for one that holds none. The `{A}.x` entry sits on scope.js's SLUG_RE
// boundary: a `.` ends the slug, so a slug pattern that admits it fails.
{
  const fixtures = [
    { "prompt": "Work in {A}/slicetrees/04 please", "root": "A", "slice": "04" },
    { "prompt": "Append to {A}/reports/04/progress.md", "root": "A", "slice": "04" },
    { "prompt": "{A}/slicetrees/04 and {A}/reports/04/progress.md", "root": "A", "slice": "04" },
    { "prompt": "{A}/slicetrees/04 and {A}/slicetrees/05", "root": "A", "slice": "scope" },
    { "prompt": "Review the scope at {A}/scopetree against {A}/dod.md", "root": "A", "slice": "scope" },
    { "prompt": "Work in {A}/. and {A}, then {A}/slicetrees/04.", "root": "A", "slice": "04" },
    { "prompt": "Work in {A}.x/slicetrees/04", "root": "A", "slice": "scope" },
    { "prompt": "no run root here", "root": null, "slice": null },
    { "prompt": "{A}/slicetrees/04 and {B}/slicetrees/01", "root": null, "slice": null },
    { "prompt": "{NOLEDGER}/slicetrees/01", "root": null, "slice": null }
  ];
  const roots = { A, B, NOLEDGER: path.join(tmp, '.superdev', 'scopes', 'nope') };
  assert.ok(fixtures.length > 0, 'the shared fixture list parses');
  fixtures.forEach((f, i) => {
    reset();
    run(agentPre(f.prompt.replace(/\{(A|B|NOLEDGER)\}/g, (_, k) => roots[k]), `fx${i}`));
    const got = [['A', A], ['B', B]].filter(([, r]) => trace(r).some((l) => l[2] === 'dispatch' && l[4] === `fx${i}`));
    assert.deepEqual(got.map(([k]) => k), f.root ? [f.root] : [], `fixture ${i} root: ${f.prompt}`);
    if (f.root) assert.equal(trace(f.root === 'A' ? A : B).find((l) => l[4] === `fx${i}`)[0], f.slice, `fixture ${i} slice: ${f.prompt}`);
  });
}
// The trace layout superdev-view's parse.ts reads: the hook writes exactly the shared lines, and the mod's
// suite parses the same lines into agents, so a layout change on either side fails one suite.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'mods', 'superdev-view', 'hooks', 'trace-fixtures.ts'), 'utf8');
  const lines = JSON.parse(src.slice(src.indexOf('/* trace:start */') + 17, src.indexOf('/* trace:end */')));
  reset();
  // scope.js writes the ledger lines: the run's init, its stage, and a slice merged and one blocked.
  const scopeCli = (args, input) => {
    const r = cp.spawnSync(process.execPath, [require.resolve('../plugin/scripts/scope.js'), ...args], { cwd: tmp, input: input || '', encoding: 'utf8', timeout: 10000 });
    assertSpawnDecided(r, `scope.js ${args[0]}`);
    assert.equal(r.status, 0, r.stderr);
  };
  fs.rmSync(path.join(A, 'ledger.md'));
  scopeCli(['init', 'feat/a', 'planned'], JSON.stringify({ anchor: '#1 — A', slices: [{ id: '04', issue: '#4', title: 't', type: 'behavior', 'depends-on': '—' }, { id: '05', issue: '#5', title: 't', type: 'behavior', 'depends-on': '—' }] }));
  scopeCli(['step', 'set', 'plan', '--root', A]);
  scopeCli(['step', 'clear', '--root', A]);
  scopeCli(['stage', '--root', A, 'set', 'implementing']);
  scopeCli(['step', 'set', 'implement', '--root', A]);
  scopeCli(['slice', '--root', A, '04', 'in-progress']);
  scopeCli(['slice', '--root', A, '05', 'in-progress']);
  run(agentPre(`Work in ${A}/slicetrees/04`, 'tu1', 'superdev:implementer', 'Build slice 04', undefined, 's1'));
  run(agentPost('tu1', { status: 'async_launched', agentId: 'ag1' }));
  run({ hook_event_name: 'SubagentStop', agent_id: 'ag1', agent_type: 'superdev:implementer', cwd: tmp });
  run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_use_id: 'sm1', tool_input: { to: 'ag1', message: 'go on' }, session_id: 's1', cwd: tmp });
  run({ hook_event_name: 'SubagentStop', agent_id: 'ag1', agent_type: 'superdev:implementer', cwd: tmp });
  scopeCli(['slice', '--root', A, '04', 'merged', '--range', 'a1b2c3d..e4f5a6b']);
  scopeCli(['slice', '--root', A, '05', 'blocked']);
  scopeCli(['step', 'set', 'review', '--root', A]);
  run(agentPre(`Review ${A}/scopetree`, 'tu2', 'superdev:final-reviewer', 'Final review', undefined, 's1'));
  run(agentPost('tu2', { status: 'completed', agentId: 'ag2', handbackReport: { text: 'Ready to merge? With fixes' } }));
  run(agentPre(`Work in ${A}/slicetrees/05`, 'tu3', 'superdev:implementer', 'Build slice 05', undefined, 's1'));
  run(agentPre(`Review ${A}/slicetrees/04`, 'tu4', 'superdev:slice-reviewer', 'Review slice 04', undefined, 's1'));
  run(agentPost('tu4', { status: 'async_launched', agentId: 'ag4' }));
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ag4', tool_input: { message: '### Verdict: specification ❌ | quality: changes-needed' }, cwd: tmp });
  run({ hook_event_name: 'SubagentStop', agent_id: 'ag4', agent_type: 'superdev:slice-reviewer', cwd: tmp });
  scopeCli(['step', 'block', '--root', A]);
  assert.deepEqual(trace(A).map((l) => l.join(' ')), lines, 'the hook writes the trace lines superdev-view parses');
  fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]));
}
{
  reset();
  const stop = (id, cwd) => run({ hook_event_name: 'SubagentStop', agent_id: id, agent_type: 'superdev:implementer', cwd: cwd || tmp });
  run(agentPre(`Work in ${A}/slicetrees/04 please`, 't1', 'superdev:implementer', 'two words'));
  assert.deepEqual(trace(A), [['04', 'main', 'dispatch', 'superdev:implementer', 't1', 'two\\x20words', '-']], 'a payload with no session id records `-` for it');
  run(agentPost('t1', { status: 'completed' }));
  assert.deepEqual(trace(A)[1], ['04', 'main', 'dispatch-end', 'superdev:implementer', 't1', 'completed'], 'a foreground dispatch ends on its PostToolUse');
  run(agentPre(`Append to ${A}/reports/04/progress.md`, 't2', 'superdev:slice-reviewer'));
  assert.deepEqual(trace(A)[2].slice(0, 5), ['04', 'main', 'dispatch', 'superdev:slice-reviewer', 't2']);
  run(agentPre(`${A}/slicetrees/04 and ${A}/reports/04/progress.md`, 't3'));
  assert.equal(trace(A)[3][0], '04', 'the slicetree and report path of one slice agree');
  run(agentPre(`${A}/slicetrees/04 and ${A}/slicetrees/05`, 't4'));
  assert.equal(trace(A)[4][0], 'scope', 'two slice ids in one run record under scope');
  assert.equal(trace(A).length, 5);
  run(agentPre('no run root here', 'n1'));
  run(agentPre(`${A}/slicetrees/04 and ${B}/slicetrees/01`, 'n2'));
  run(agentPre(`${path.join(tmp, '.superdev', 'scopes', 'nope')}/slicetrees/01`, 'n3'));
  run(agentPost('unknown', { status: 'completed' }));
  stop('unknown');
  assert.equal(trace(A).length, 5);
  assert.equal(trace(B).length, 0, 'a dispatch naming no run root or two records nothing');
  run(agentPre(`Work in ${A}/. and ${A}, then ${A}/slicetrees/04.`, 'p1'));
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch' && l[4] === 'p1').length, 1, 'trailing punctuation after a run root path still records the dispatch');

  // A background dispatch: async_launched binds the agentId, SubagentStop with it ends the dispatch.
  reset();
  run(agentPre(`${A}/slicetrees/04`, 'b1', 'superdev:slice-reviewer'));
  run(agentPost('b1', { status: 'async_launched', agentId: 'ag1' }));
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end').length, 0, 'a launch is no end');
  stop('other');
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end').length, 0, 'an unbound agent id ends nothing');
  stop('ag1');
  assert.deepEqual(trace(A).filter((l) => l[2] === 'dispatch-end'), [['04', 'main', 'dispatch-end', 'superdev:slice-reviewer', 'b1', 'completed']]);

  // A SubagentStop another hook blocked fires again: one dispatch still gets one end.
  stop('ag1');
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end').length, 1, 'a repeated SubagentStop writes no second end');

  // hooks.json registers run-trace.js for PreToolUse and PostToolUse on Agent.
  const registered = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;
  for (const ev of ['PreToolUse', 'PostToolUse']) {
    assert.ok(registered[ev].some((g) => g.matcher === 'Agent' && g.hooks.some((h) => h.command.includes('hooks/run-trace.js'))), `${ev} on Agent runs run-trace.js`);
  }

  // Parallel implementers for slices 01 and 02 ending in reverse order each end on their own slice.
  reset();
  run(agentPre(`${A}/slicetrees/01`, 'x1'));
  run(agentPre(`${A}/slicetrees/02`, 'x2'));
  run(agentPost('x2', { status: 'completed' }));
  run(agentPost('x1', { status: 'completed' }));
  assert.deepEqual(trace(A).filter((l) => l[2] === 'dispatch-end').map((l) => [l[0], l[4]]), [['02', 'x2'], ['01', 'x1']]);

  // A dispatch with no PostToolUse has no end yet; a PostToolUseFailure ends only its own dispatch.
  reset();
  run(agentPre(`${A}/slicetrees/01`, 'f1'));
  run(agentPre(`${A}/slicetrees/02`, 'f2'));
  run({ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'f2', error: 'boom', cwd: tmp });
  assert.deepEqual(trace(A).filter((l) => l[2] === 'dispatch-end').map((l) => [l[0], l[4], l[5]]), [['02', 'f2', 'failed']]);
  assert.deepEqual(trace(A).filter((l) => l[2] === 'dispatch').map((l) => [l[0], l[4]]), [['01', 'f1'], ['02', 'f2']]);

  // Another status, a non-object tool_response, and async_launched without an agentId each write no end and print nothing.
  reset();
  run(agentPre(`${A}/slicetrees/01`, 'm1'));
  run(agentPre(`${A}/slicetrees/01`, 'm2'));
  run(agentPre(`${A}/slicetrees/01`, 'm3'));
  assert.equal(spawnOut(agentPost('m1', { status: 'error' })), '');
  assert.equal(spawnOut(agentPost('m2', 'boom')), '');
  assert.equal(spawnOut(agentPost('m3', { status: 'async_launched' })), '');
  stop('undefined');
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end').length, 0);

  // A trace built from these events passes final-reviewer's check: the slice-reviewer dispatch-end follows the last implementer dispatch-end.
  reset();
  run(agentPre(`${A}/slicetrees/01`, 'k1'));
  run(agentPost('k1', { status: 'completed' }));
  run(agentPre(`${A}/slicetrees/01`, 'k2', 'superdev:slice-reviewer'));
  run(agentPost('k2', { status: 'completed' }));
  const ends = trace(A).filter((l) => l[2] === 'dispatch-end' && l[0] === '01');
  const typeOf = (tu) => trace(A).find((l) => l[2] === 'dispatch' && l[4] === tu)[3];
  assert.deepEqual(ends.map((l) => [l[4], typeOf(l[4])]), [['k1', 'superdev:implementer'], ['k2', 'superdev:slice-reviewer']], 'the review ends after the implementer');

  // Every Agent-tool event exits 0 with no decision, and a SubagentStart without a prompt writes nothing.
  assert.equal(spawnOut(agentPre(`${A}/slicetrees/01`, 'o1')), '');
  assert.equal(spawnOut(agentPost('o1', { status: 'completed' })), '');
  assert.equal(spawnOut({ hook_event_name: 'SubagentStart', agent_id: 'z', agent_type: 'superdev:implementer', cwd: tmp }), '');
  assert.equal(trace(A).filter((l) => l[4] === 'o1' && l[2] === 'dispatch-end').length, 1);
  assert.equal(trace(A).length, 6);
}

// Dispatch outcomes (ADR 0140, INV-0145): every dispatch gets one `dispatch-end` naming how it ended, shaped as the
// hook probe recorded the events (Claude Code 2.1.296): PostToolUseFailure and PermissionDenied on Agent carry the
// call's tool_use_id, TaskStop's PostToolUse carries the subagent's agent id as tool_input.task_id, and Stop,
// UserPromptSubmit, and SessionEnd carry the main session's session_id.
{
  const pre = (slice, tu, session, type) => run(agentPre(`${A}/slicetrees/${slice}`, tu, type, undefined, undefined, session));
  const bind = (tu, ag) => run(agentPost(tu, { status: 'async_launched', agentId: ag }));
  const boundary = (hook_event_name, session_id, extra) => run({ hook_event_name, session_id, cwd: tmp, ...extra });
  const ends = () => trace(A).filter((l) => l[2] === 'dispatch-end').map((l) => [l[4], l[5]]);
  const stopSub = (ag) => run({ hook_event_name: 'SubagentStop', agent_id: ag, agent_type: 'superdev:implementer', cwd: tmp });

  // completed: a foreground dispatch on its PostToolUse, a background one on its SubagentStop, each once.
  reset();
  pre('01', 'c1', 'S1');
  run(agentPost('c1', { status: 'completed' }));
  run(agentPost('c1', { status: 'completed' }));
  pre('01', 'c2', 'S1');
  bind('c2', 'agc2');
  stopSub('agc2');
  stopSub('agc2');
  assert.deepEqual(ends(), [['c1', 'completed'], ['c2', 'completed']], 'each completed dispatch ends once');
  assert.equal(trace(A).find((l) => l[2] === 'dispatch')[6], 'S1', 'the dispatch line ends with its session id');

  // failed and denied: matched by tool_use_id; a later end event for the dispatch writes nothing.
  reset();
  pre('01', 'x1', 'S1');
  pre('01', 'x2', 'S1');
  pre('01', 'x3', 'S1');
  run({ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'x1', error: 'boom', cwd: tmp });
  run({ hook_event_name: 'PermissionDenied', tool_name: 'Agent', tool_use_id: 'x2', cwd: tmp });
  run({ hook_event_name: 'PermissionDenied', tool_name: 'Agent', tool_use_id: 'nobody', cwd: tmp });
  run({ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'x2', cwd: tmp });
  run(agentPost('x1', { status: 'completed' }));
  assert.deepEqual(ends(), [['x1', 'failed'], ['x2', 'denied']], 'the first end wins, and a tool_use_id naming no dispatch writes nothing');

  // stopped: a TaskStop naming a bound agent ends its dispatch; one naming no bound agent writes nothing.
  reset();
  pre('01', 'k1', 'S1');
  bind('k1', 'agk1');
  const taskStop = (task_id) => run({ hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id }, tool_response: { task_id }, cwd: tmp });
  taskStop('agother');
  assert.deepEqual(ends(), [], 'a TaskStop naming no bound agent writes nothing');
  taskStop('agk1');
  assert.deepEqual(ends(), [['k1', 'stopped']]);
  stopSub('agk1');
  taskStop('agk1');
  assert.deepEqual(ends(), [['k1', 'stopped']], 'a later SubagentStop or TaskStop writes no second end');

  // unknown: at the session's Stop, a dispatch with no bind ends; a bound one and another session's stay open.
  reset();
  pre('01', 'u1', 'S1');
  pre('01', 'u2', 'S1');
  bind('u2', 'agu2');
  pre('02', 'u3', 'S2');
  boundary('Stop', 'S1');
  assert.deepEqual(ends(), [['u1', 'unknown']], 'only the unbound dispatch of the session ends');
  boundary('Stop', 'S1');
  assert.deepEqual(ends(), [['u1', 'unknown']], 'a second Stop writes nothing');
  pre('01', 'u4', 'S1');
  boundary('UserPromptSubmit', 'S1', { prompt: 'go' });
  assert.deepEqual(ends(), [['u1', 'unknown'], ['u4', 'unknown']], 'UserPromptSubmit ends it too');
  boundary('Stop', 'S1', { agent_id: 'agu2' });
  assert.equal(ends().length, 2, 'a Stop that names a subagent ends nothing');

  // session-end: SessionEnd ends the session's open dispatches, bound ones `session-end` and unbound ones `unknown`;
  // a dispatch line with no session id and another session's dispatch stay open.
  pre('01', 'u5', 'S1');
  appendTrace(A, { slice: '01', agent: 'main', kind: 'dispatch', fields: ['superdev:implementer', 'old1', 'legacy'] });
  boundary('SessionEnd', 'S1', { reason: 'other' });
  assert.deepEqual(ends().slice(2), [['u2', 'session-end'], ['u5', 'unknown']], 'SessionEnd ends the session\'s open dispatches');
  assert.equal(ends().length, 4, 'a dispatch of another session and one with no session id stay open');
  stopSub('agu2');
  boundary('SessionEnd', 'S1');
  assert.equal(ends().length, 4, 'a SubagentStop after a session-end end writes no second end');
  boundary('SessionEnd', 'S2');
  assert.deepEqual(ends().slice(4), [['u3', 'unknown']]);

  // resumed (issue #992): a SendMessage naming the agent of an ended, bound dispatch opens a new run of it, with its own
  // end; one naming a running dispatch or an unbound agent writes nothing. Shaped as the resume probe recorded the
  // events (Claude Code 2.1.296): PreToolUse on SendMessage carries tool_input.to = the agent id, and the resumed run fires
  // SubagentStart and SubagentStop again.
  reset();
  const send = (to, session_id = 'S1', tool_use_id = 'sm') => run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_use_id, tool_input: { to, message: 'go' }, session_id, cwd: tmp });
  const resumes = () => trace(A).filter((l) => l[2] === 'dispatch-resume');
  pre('01', 'm1', 'S1');
  bind('m1', 'agm1');
  send('agm1');
  assert.deepEqual(resumes(), [], 'a SendMessage to a running dispatch writes nothing');
  stopSub('agm1');
  send('agnobody');
  assert.deepEqual(resumes(), [], 'a SendMessage to an unbound agent id writes nothing');
  send('agm1', 'S2');
  assert.deepEqual(resumes(), [['01', 'main', 'dispatch-resume', 'm1', 'agm1', 'S2', 'sm']], 'a SendMessage to an ended dispatch reopens it on its slice, carrying its own tool_use_id');
  send('agm1');
  assert.equal(resumes().length, 1, 'a SendMessage to the reopened, running dispatch writes nothing');
  stopSub('agm1');
  assert.deepEqual(ends(), [['m1', 'completed'], ['m1', 'completed']], 'the resumed run ends with its own completed end');
  stopSub('agm1');
  assert.equal(ends().length, 2, 'a repeated SubagentStop writes no third end');
  send('agm1', 'S2');
  boundary('SessionEnd', 'S1');
  assert.equal(ends().length, 2, 'a session other than the resuming one ends nothing');
  boundary('SessionEnd', 'S2');
  assert.deepEqual(ends().slice(2), [['m1', 'session-end']], 'a session end with the resumed run open ends it session-end');
  assert.equal(spawnOut({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_input: { to: 5 }, cwd: tmp }), '', 'a malformed SendMessage writes nothing');

  // A SendMessage that fails or is denied leaves no subagent behind its resume line: it ends that run `failed` or `denied`.
  // A TaskStop ends a resumed run `stopped`. A failed SendMessage to a dispatch whose last run line is no resume writes nothing.
  reset();
  pre('01', 'n1', 'S1');
  bind('n1', 'agn1');
  const sendEnd = (hook_event_name, to, tool_use_id = 'sm') => run({ hook_event_name, tool_name: 'SendMessage', tool_use_id, tool_input: { to, message: 'go' }, cwd: tmp });
  sendEnd('PostToolUseFailure', 'agn1');
  assert.deepEqual(ends(), [], 'a failed SendMessage to a running dispatch ends nothing');
  stopSub('agn1');
  send('agn1');
  sendEnd('PostToolUseFailure', 'agn1');
  assert.deepEqual(ends(), [['n1', 'completed'], ['n1', 'failed']], 'a failed SendMessage ends the resumed run it opened');
  sendEnd('PostToolUseFailure', 'agn1');
  assert.equal(ends().length, 2, 'a second failure writes no third end');
  send('agn1');
  sendEnd('PermissionDenied', 'agn1');
  assert.deepEqual(ends().slice(2), [['n1', 'denied']], 'a denied SendMessage ends the resumed run it opened');
  send('agn1');
  run({ hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id: 'agn1' }, cwd: tmp });
  assert.deepEqual(ends().slice(3), [['n1', 'stopped']], 'a TaskStop ends a resumed run stopped');

  // A second SendMessage to a resumed, still-running dispatch opened no run: its failure or denial ends nothing, and the
  // run's own SubagentStop still writes `completed`.
  reset();
  pre('01', 'p1', 'S1');
  bind('p1', 'agp1');
  stopSub('agp1');
  send('agp1', 'S1', 'sm1');
  send('agp1', 'S1', 'sm2');
  sendEnd('PostToolUseFailure', 'agp1', 'sm2');
  sendEnd('PermissionDenied', 'agp1', 'sm2');
  assert.deepEqual(ends(), [['p1', 'completed']], 'a failed or denied second SendMessage ends no live run');
  stopSub('agp1');
  assert.deepEqual(ends(), [['p1', 'completed'], ['p1', 'completed']], 'the live run still ends with its own SubagentStop');

  // A foreground dispatch binds too: its completed PostToolUse carries the agentId (the resume probe, Claude Code 2.1.296,
  // saw the first run's SubagentStop fire before that PostToolUse). A SendMessage to that agent reopens the dispatch, the
  // resumed run's SubagentStop ends it, a turn boundary leaves the resumed run open, and a session end ends it.
  reset();
  pre('01', 'q1', 'S1');
  stopSub('agq1');
  run(agentPost('q1', { status: 'completed', agentId: 'agq1' }));
  run(agentPost('q1', { status: 'completed', agentId: 'agq1' }));
  assert.deepEqual(ends(), [['q1', 'completed']], 'the first run of a foreground dispatch ends once');
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-bind').length, 1, 'a foreground dispatch gets one bind');
  send('agq1', 'S1', 'smq1');
  assert.deepEqual(resumes(), [['01', 'main', 'dispatch-resume', 'q1', 'agq1', 'S1', 'smq1']], 'a SendMessage reopens a completed foreground dispatch');
  stopSub('agq1');
  assert.deepEqual(ends(), [['q1', 'completed'], ['q1', 'completed']], 'the resumed run of a foreground dispatch ends with its own completed end');
  send('agq1', 'S1', 'smq2');
  boundary('Stop', 'S1');
  assert.equal(ends().length, 2, 'a turn boundary leaves the resumed run open');
  boundary('SessionEnd', 'S1');
  assert.deepEqual(ends().slice(2), [['q1', 'session-end']], 'a session end with the resumed run open ends it session-end');

  // A payload outside every run root or malformed records nothing; the spawned hook exits 0 with no output.
  const before = fs.readFileSync(path.join(A, 'trace.log'), 'utf8');
  pre('01', 'z1', 'S9');
  const withZ = fs.readFileSync(path.join(A, 'trace.log'), 'utf8');
  for (const ev of ['Stop', 'UserPromptSubmit', 'SessionEnd']) {
    assert.equal(spawnOut({ hook_event_name: ev, session_id: 'S9', cwd: path.join(tmp, 'no', 'such', 'dir') }), '');
    assert.equal(spawnOut({ hook_event_name: ev, cwd: tmp }), '', `${ev} with no session id`);
    assert.equal(spawnOut({ hook_event_name: ev, session_id: 9, cwd: tmp }), '', `${ev} with a non-string session id`);
    assert.equal(spawnOut({ hook_event_name: ev, session_id: 'S9', cwd: 42 }), '', `${ev} with a malformed cwd`);
  }
  const away = path.join(tmp, 'no', 'such', 'dir');
  for (const ev of [{ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'z1' }, { hook_event_name: 'PermissionDenied', tool_name: 'Agent', tool_use_id: 'z1' }, { hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id: 'agz1' } }]) {
    assert.equal(spawnOut({ ...ev, session_id: 'S9', cwd: away }), '', `${ev.hook_event_name} ${ev.tool_name} outside every run root`);
  }
  assert.equal(spawnOut(null, '{"hook_event_name":"Stop"'), '');
  assert.equal(fs.readFileSync(path.join(A, 'trace.log'), 'utf8'), withZ, 'none of them wrote a line');
  assert.ok(withZ.startsWith(before));
  for (const ev of [{ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent' }, { hook_event_name: 'PermissionDenied', tool_name: 'Agent', tool_use_id: 7 }, { hook_event_name: 'PostToolUse', tool_name: 'TaskStop' }, { hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id: 5 } }]) {
    assert.equal(spawnOut({ ...ev, cwd: tmp }), '');
  }
  assert.equal(fs.readFileSync(path.join(A, 'trace.log'), 'utf8'), withZ, 'a malformed end event wrote nothing');

  // hooks.json runs the turn and session boundaries in every repository: one with no `.superdev/scopes` directory gets
  // nothing written, and the hook exits 0 silently.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-bare-'));
  cp.execFileSync('git', ['init', '-q', bare]);
  for (const ev of ['Stop', 'UserPromptSubmit', 'SessionEnd']) assert.equal(spawnOut({ hook_event_name: ev, session_id: 'S9', cwd: bare }), '', `${ev} in a repository with no run`);
  assert.deepEqual(fs.readdirSync(bare), ['.git'], 'the boundaries wrote nothing in a repository with no run');
  fs.rmSync(bare, { recursive: true, force: true });

  // hooks.json registers the end events for run-trace.js.
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;
  const runsTrace = (g) => g.hooks.some((h) => h.command.includes('hooks/run-trace.js'));
  for (const ev of ['PostToolUseFailure', 'PermissionDenied']) for (const tool of ['Agent', 'SendMessage']) assert.ok(hooks[ev].some((g) => g.matcher.split('|').includes(tool) && runsTrace(g)), `${ev} on ${tool} runs run-trace.js`);
  assert.ok(hooks.PostToolUse.some((g) => g.matcher.split('|').includes('TaskStop') && runsTrace(g)), 'PostToolUse on TaskStop runs run-trace.js');
  for (const ev of ['Stop', 'UserPromptSubmit', 'SessionEnd']) assert.ok(hooks[ev].some(runsTrace), `${ev} runs run-trace.js`);
  assert.ok(hooks.PreToolUse.some((g) => g.matcher === 'SendMessage' && runsTrace(g)), 'PreToolUse on SendMessage runs run-trace.js');
}

// Review verdicts (ADR 0136, INV-0142): a background slice-reviewer's report writes one `verdict` line
// carrying the review's tool_use_id, spec and quality verdicts, review cycle, and reviewed implementer.
{
  const { parseVerdict } = require(hookPath);
  const PASS = 'Findings: none.\n\n### Verdict: specification ✅ | quality: approved';
  const FAIL = '- Critical: x\n\n### Verdict: specification ❌   |   quality: changes-needed';
  assert.deepEqual(parseVerdict(PASS), { spec: 'pass', quality: 'approved' });
  assert.deepEqual(parseVerdict(FAIL), { spec: 'fail', quality: 'changes-needed' });
  assert.deepEqual(parseVerdict('no verdict here'), { spec: 'unknown', quality: 'unknown' });
  assert.deepEqual(parseVerdict('### Verdict: specification ✅ | quality: maybe'), { spec: 'pass', quality: 'unknown' }, 'a part it cannot read is unknown');
  assert.deepEqual(parseVerdict('### Verdict: spec good'), { spec: 'unknown', quality: 'unknown' }, 'a malformed line is unknown in both parts');
  assert.deepEqual(parseVerdict(`Cycle 0 said:\n${FAIL}\nNow fixed.\n\n**### Verdict: specification ✅️ | quality: approved** (all closed)  `), { spec: 'pass', quality: 'approved' }, 'the last verdict line decides; bold, a variation selector, and trailing text are tolerated');
  assert.deepEqual(parseVerdict(undefined), { spec: 'unknown', quality: 'unknown' });

  // The verdict line slice-reviewer.md prescribes parses, both ways: a reworded line fails here.
  const tpl = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'agents', 'slice-reviewer.md'), 'utf8').split('\n').find((l) => l.startsWith('### Verdict:'));
  assert.ok(tpl, 'slice-reviewer.md prescribes a `### Verdict:` line');
  const pick = (n) => tpl.replace(/(\S+) \/ (\S+)/g, (_, a, b) => (n ? b : a));
  assert.deepEqual(parseVerdict(pick(0)), { spec: 'pass', quality: 'approved' }, `parses ${pick(0)}`);
  assert.deepEqual(parseVerdict(pick(1)), { spec: 'fail', quality: 'changes-needed' }, `parses ${pick(1)}`);

  const handback = (ag, message, cwd) => run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: ag, agent_type: 'superdev:slice-reviewer', tool_input: { message }, cwd: cwd || tmp });
  const stop = (ag, last) => run({ hook_event_name: 'SubagentStop', agent_id: ag, agent_type: 'superdev:slice-reviewer', last_assistant_message: last, cwd: tmp });
  const bg = (slice, tu, type, ag) => { run(agentPre(`${A}/slicetrees/${slice}`, tu, type)); run(agentPost(tu, { status: 'async_launched', agentId: ag })); };
  const verdicts = () => trace(A).filter((l) => l[2] === 'verdict');

  reset();
  bg('04', 'i1', 'superdev:implementer', 'ai1');
  handback('ai1', PASS);
  stop('ai1', PASS);
  assert.equal(verdicts().length, 0, 'an implementer gets no verdict line');
  bg('04', 'r1', 'superdev:slice-reviewer', 'ar1');
  bg('05', 'i5', 'superdev:implementer', 'ai5');
  stop('ai5');
  bg('05', 'r5', 'superdev:slice-reviewer', 'ar5');
  handback('ar1', FAIL);
  assert.deepEqual(verdicts(), [['04', 'main', 'verdict', 'r1', 'fail', 'changes-needed', '0', 'i1']]);
  stop('ar1', FAIL);
  assert.equal(verdicts().length, 1, 'a hand-back and a stop give one verdict line');
  handback('ar5', PASS);
  stop('ar5');
  assert.deepEqual(verdicts()[1], ['05', 'main', 'verdict', 'r5', 'pass', 'approved', '0', 'i5'], 'another slice numbers its own cycles');
  bg('04', 'i2', 'superdev:implementer', 'ai2');
  stop('ai2');
  bg('04', 'r2', 'superdev:slice-reviewer', 'ar2'); // interrupted: no hand-back, no stop
  bg('04', 'r3', 'superdev:slice-reviewer', 'ar3');
  handback('ar3', 'Lean.\n### Verdict: specification ✅ | quality: approved');
  assert.deepEqual(verdicts()[2], ['04', 'main', 'verdict', 'r3', 'pass', 'approved', '1', 'i2'], 'an unfinished review does not advance the cycle; the last finished implementer is reviewed');
  handback('ar3', FAIL);
  assert.equal(verdicts().length, 3, 'a repeated hand-back writes no second line');

  // No implementer before the review records `-`; a report with no verdict line records unknown.
  bg('06', 'r6', 'superdev:slice-reviewer', 'ar6');
  handback('ar6', 'I could not finish.');
  assert.deepEqual(verdicts()[3], ['06', 'main', 'verdict', 'r6', 'unknown', 'unknown', '0', '-']);

  // A reviewer answering in plain text: the stop's last message carries the verdict.
  bg('07', 'r7', 'superdev:slice-reviewer', 'ar7');
  stop('ar7', PASS);
  assert.deepEqual(verdicts()[4], ['07', 'main', 'verdict', 'r7', 'pass', 'approved', '0', '-']);
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end' && l[4] === 'r7').length, 1, 'the stop still ends the dispatch');

  // Other reviewer types, a foreground reviewer, and a hand-back outside any run write nothing.
  bg('04', 's1', 'superdev:simplicity-reviewer', 'as1');
  handback('as1', PASS);
  bg('04', 'f1', 'superdev:final-reviewer', 'af1');
  handback('af1', PASS);
  run(agentPre(`${A}/slicetrees/04`, 'g1', 'superdev:slice-reviewer'));
  handback('ag-fg', PASS);
  run(agentPost('g1', { status: 'completed' }));
  handback('nobody', PASS);
  assert.equal(verdicts().length, 5, 'only bound slice-reviewer dispatches get a verdict line');
  assert.equal(trace(B).length, 0);

  // A malformed payload records nothing and prints nothing; the spawned hook exits 0.
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', cwd: tmp });
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ar6', tool_input: { message: 42 }, cwd: tmp });
  run({ hook_event_name: 'SubagentStop', agent_id: 'ar6', last_assistant_message: { x: 1 }, cwd: tmp });
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ar1', tool_input: { message: PASS }, cwd: path.join(tmp, 'no', 'such', 'dir') });
  assert.equal(verdicts().length, 5);
  assert.equal(spawnOut({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ar9', tool_input: { message: PASS }, cwd: tmp }), '');
  assert.equal(spawnOut(null, '{not json'), '');

  // `scope.js trace` (what `/superdev:status --trace` prints) shows each verdict line.
  const shown = cp.spawnSync(process.execPath, [require.resolve('../plugin/scripts/scope.js'), 'trace', '--root', A], { encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(shown, 'scope.js trace');
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(shown.stdout.split('\n').filter((l) => /\bverdict\b/.test(l)).length, 5, 'the timeline carries every verdict line');

  // hooks.json registers run-trace.js for PostToolUse on SubagentHandback.
  const registered = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.ok(registered.PostToolUse.some((g) => g.matcher.split('|').includes('SubagentHandback') && g.hooks.some((h) => h.command.includes('hooks/run-trace.js'))), 'PostToolUse on SubagentHandback runs run-trace.js');

  // Only a `completed` end finishes a dispatch: a stopped implementer is not the reviewed one, and a stopped reviewer is no
  // cycle. An end with no outcome field (a trace written before outcomes) reads `completed`.
  const taskStop = (task_id) => run({ hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id }, cwd: tmp });
  bg('08', 'i8a', 'superdev:implementer', 'ai8a');
  stop('ai8a');
  bg('08', 'i8b', 'superdev:implementer', 'ai8b');
  taskStop('ai8b');
  bg('08', 'r8a', 'superdev:slice-reviewer', 'ar8a');
  taskStop('ar8a');
  appendTrace(A, { slice: '08', agent: 'main', kind: 'dispatch', fields: ['superdev:slice-reviewer', 'r8old', 'legacy'] });
  appendTrace(A, { slice: '08', agent: 'main', kind: 'dispatch-end', fields: ['superdev:slice-reviewer', 'r8old'] });
  bg('08', 'r8b', 'superdev:slice-reviewer', 'ar8b');
  handback('ar8b', PASS);
  assert.deepEqual(verdicts()[5], ['08', 'main', 'verdict', 'r8b', 'pass', 'approved', '1', 'i8a'], 'a stopped reviewer is no cycle, a legacy end counts, a stopped implementer is not reviewed');

  // A foreground slice review reports through `tool_response.handbackReport` at PostToolUse; one dispatch gets one line.
  run(agentPre(`Review ${A}/slicetrees/09`, 'r9', 'superdev:slice-reviewer'));
  run(agentPost('r9', { status: 'completed', handbackReport: { text: PASS } }));
  assert.deepEqual(verdicts()[6], ['09', 'main', 'verdict', 'r9', 'pass', 'approved', '0', '-'], 'a foreground slice review records its verdict');
  run(agentPost('r9', { status: 'completed', handbackReport: { text: FAIL } }));
  assert.equal(verdicts().length, 7, 'a repeated report writes no second line');

  // A resumed slice-reviewer ends once per run and counts as one cycle.
  reset();
  bg('04', 'q1', 'superdev:slice-reviewer', 'aq1');
  stop('aq1');
  run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_input: { to: 'aq1', message: 'again' }, session_id: 'S1', cwd: tmp });
  stop('aq1');
  bg('04', 'q2', 'superdev:slice-reviewer', 'aq2');
  handback('aq2', PASS);
  assert.equal(verdicts().pop()[6], '1', 'a resumed reviewer counts once in the cycle');
}
// Final-review verdicts (INV-0146): `final-verdict <tool_use_id> <answer> <cycle>` for a final-reviewer inside an open review step.
{
  const { parseFinalVerdict } = require(hookPath);
  const tpl = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'agents', 'final-reviewer.md'), 'utf8').split('\n').find((l) => l.startsWith('Ready to merge?'));
  assert.ok(tpl, 'final-reviewer.md prescribes a `Ready to merge?` line');
  const options = /\[(.*)\]/.exec(tpl)[1].split('|').map((w) => w.trim());
  assert.deepEqual(options.map((w) => parseFinalVerdict(tpl.replace(/\[.*\]/, w))).sort(), ['no', 'with-fixes', 'yes'], `every answer ${tpl} offers parses`);
  assert.equal(parseFinalVerdict('Ready to merge? with-fixes'), 'with-fixes', 'a hyphen spells the answer');
  assert.equal(parseFinalVerdict('Ready to merge? WITH   FIXES'), 'with-fixes', 'any whitespace run and any case spell the answer');
  assert.equal(parseFinalVerdict('Ready to merge? With fixes'), 'with-fixes');
  assert.equal(parseFinalVerdict('Ready to merge? No\nReady to merge? **Yes**'), 'yes', 'the last line decides');
  assert.equal(parseFinalVerdict('Ready to merge? Maybe'), 'unknown');
  assert.equal(parseFinalVerdict(undefined), 'unknown');

  const fv = () => trace(A).filter((l) => l[2] === 'final-verdict');
  const step = (...fields) => appendTrace(A, { slice: 'scope', agent: 'main', kind: 'ledger', fields });
  const handback = (ag, message) => run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: ag, tool_input: { message }, cwd: tmp });
  const bgFinal = (tu, ag) => { run(agentPre(`Review ${A}/scopetree`, tu, 'superdev:final-reviewer')); run(agentPost(tu, { status: 'async_launched', agentId: ag })); };
  const stopAg = (ag) => run({ hook_event_name: 'SubagentStop', agent_id: ag, agent_type: 'superdev:final-reviewer', cwd: tmp });

  reset();
  bgFinal('f0', 'af0');
  handback('af0', 'Ready to merge? With fixes');
  assert.equal(fv().length, 0, 'a final review before any review step line records nothing');
  step('step', 'set', 'review');
  bgFinal('f1', 'af1');
  handback('af1', 'Ready to merge? With fixes');
  assert.deepEqual(fv(), [['scope', 'main', 'final-verdict', 'f1', 'with-fixes', '0']], 'the review that opens the loop is cycle 0');
  stopAg('af1');
  handback('af1', 'Ready to merge? Yes');
  assert.equal(fv().length, 1, 'the hand-back and the stop path give one line');
  run(agentPre(`Review ${A}/scopetree`, 'f2', 'superdev:final-reviewer'));
  run(agentPost('f2', { status: 'async_launched', agentId: 'af2' }));
  run({ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'f2', cwd: tmp });
  bgFinal('f3', 'af3');
  stopAg('af3');
  assert.deepEqual(fv()[1], ['scope', 'main', 'final-verdict', 'f3', 'unknown', '1'], 'a failed dispatch does not advance the cycle; an unreadable report is unknown');
  step('step', 'set', 'review'); // a repeated `step set review` is a new start (ADR 0147), with no clear between
  run(agentPre(`Review ${A}/scopetree`, 'f4', 'superdev:final-reviewer'));
  run(agentPost('f4', { status: 'completed', handbackReport: { text: 'Assessment\nReady to merge? Yes\nReasoning: ok' } }));
  assert.deepEqual(fv()[2], ['scope', 'main', 'final-verdict', 'f4', 'yes', '0'], 'a second review step line restarts the cycle; a foreground review reports through handbackReport');
  run(agentPost('f4', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 3, 'a repeated foreground report writes no second line');
  run(agentPre(`Review ${A}/scopetree`, 'f5', 'superdev:final-reviewer'));
  run(agentPost('f5', { status: 'completed', handbackReport: 'Ready to merge? No' }));
  assert.deepEqual(fv()[3], ['scope', 'main', 'final-verdict', 'f5', 'no', '1'], 'a plain string report is read too');
  // The review-step window reads step lines only: a step clear, a step block, or another step closes it; a stage line never does.
  step('stage', 'set', 'merged');
  step('stage', 'set', 'merged');
  run(agentPre(`Review ${A}/scopetree`, 'f6', 'superdev:final-reviewer'));
  run(agentPost('f6', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv()[4][3], 'f6', 'a same-value stage write keeps the review step');
  step('stage', 'set', 'reviewed');
  step('step', 'clear'); // what `scope.js stage set` mirrors when the stage change removes the step
  run(agentPre(`Review ${A}/scopetree`, 'f7', 'superdev:final-reviewer'));
  run(agentPost('f7', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 5, 'a stage write that clears the step closes the review step');
  step('step', 'set', 'review');
  step('step', 'set', 'document');
  run(agentPre(`Review ${A}/scopetree`, 'f8', 'superdev:final-reviewer'));
  run(agentPost('f8', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 5, 'another step closes the review step');
  step('step', 'set', 'review');
  step('step', 'clear');
  run(agentPre(`Review ${A}/scopetree`, 'f9', 'superdev:final-reviewer'));
  run(agentPost('f9', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 5, 'a step clear closes the review step');
  step('step', 'set', 'review');
  step('step', 'block', 'review');
  run(agentPre(`Review ${A}/scopetree`, 'f9b', 'superdev:final-reviewer'));
  run(agentPost('f9b', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 5, 'a step block closes the review step');
  step('step', 'set', 'review');
  run(agentPre(`Review ${A}/scopetree`, 'f10', 'superdev:final-reviewer'));
  run(agentPost('f10', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.deepEqual(fv()[5], ['scope', 'main', 'final-verdict', 'f10', 'no', '0'], 'a later review step reopens the window with a fresh cycle');
  // An `adopt` line, then the step, then a same-value stage write: the step stays open.
  reset();
  step('adopt');
  step('step', 'set', 'review');
  step('stage', 'set', 'merged');
  run(agentPre(`Review ${A}/scopetree`, 'g1', 'superdev:final-reviewer'));
  run(agentPost('g1', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 1, 'a stage line that kept the ledger step leaves the review step open');
  reset();
  step('adopt');
  step('step', 'set', 'review');
  step('stage', 'set', 'reviewed');
  step('step', 'clear');
  run(agentPre(`Review ${A}/scopetree`, 'g2', 'superdev:final-reviewer'));
  run(agentPost('g2', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 0, 'the step clear a stage write mirrors closes the review step');
  // A resumed final-reviewer ends once per run and counts as one cycle.
  reset();
  step('step', 'set', 'review');
  bgFinal('h1', 'ah1');
  stopAg('ah1');
  run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_input: { to: 'ah1', message: 'again' }, session_id: 'S1', cwd: tmp });
  stopAg('ah1');
  bgFinal('h2', 'ah2');
  handback('ah2', 'Ready to merge? Yes');
  assert.equal(fv().pop()[5], '1', 'a resumed final-reviewer counts once in the cycle');
}
// SubagentStop from a controller whose cwd is a subdirectory of the main checkout or a worktree of it.
{
  const R = fs.mkdtempSync(path.join(tmp, 'repo-'));
  const rg = (...a) => cp.execFileSync('git', ['-C', R, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  rg('init', '-q');
  fs.mkdirSync(path.join(R, 'plugin'));
  fs.writeFileSync(path.join(R, 'plugin', 'f'), 'x');
  const C = path.join(R, '.superdev', 'scopes', 'c');
  fs.mkdirSync(C, { recursive: true });
  fs.writeFileSync(path.join(C, 'ledger.md'), ledger([['07', 'in-progress']]));
  fs.writeFileSync(path.join(R, '.gitignore'), '.superdev\n');
  rg('add', '-A');
  rg('commit', '-q', '-m', 'base');
  const WT = path.join(tmp, 'wt-' + path.basename(R));
  rg('worktree', 'add', '-q', WT, '-b', 'wt');
  const hook = (ev, id, cwd, extra) => {
    if (ev === 'Dispatch') { run(agentPre(extra.prompt, 't-' + id, 'superdev:implementer', extra.description || 'd')); run(agentPost('t-' + id, { status: 'async_launched', agentId: id }, R)); return; }
    run(Object.assign({ hook_event_name: ev, agent_id: id, agent_type: 'superdev:implementer', description: 'd', cwd }, extra));
  };
  const ends = () => trace(C).filter((l) => l[2] === 'dispatch-end');
  hook('Dispatch', 'w1', tmp, { prompt: `${C}/slicetrees/07` });
  hook('SubagentStop', 'w1', path.join(R, 'plugin'));
  assert.deepEqual(ends().map((l) => l.slice(0, 2).concat(l[4])), [['07', 'main', 't-w1']], 'a subdirectory cwd of the main checkout records the end');
  hook('Dispatch', 'w2', tmp, { prompt: `${C}/slicetrees/07` });
  hook('SubagentStop', 'w2', WT);
  assert.equal(ends().length, 2, 'a worktree cwd records the end');
  assert.equal(ends()[1][4], 't-w2');

  // Windows backslash paths record like the forward-slash form; a newline in the description stays on one line.
  hook('Dispatch', 'w3', tmp, { prompt: `${C}/slicetrees/07`.replace(/\//g, '\\'), description: 'a\nb' });
  const d = fs.readFileSync(path.join(C, 'trace.log'), 'utf8').split('\n').filter((l) => l.includes(' t-w3 ') && l.includes(' dispatch '));
  assert.equal(d.length, 1, 'one line for the dispatch');
  assert.ok(d[0].includes(' dispatch superdev:implementer t-w3 a'), 'backslash prompt records the dispatch');
  assert.ok(d[0].endsWith(' a\\nb -'), 'newline escaped on one line, and no session id reads `-`');
}

// A git call that stalls while SubagentStop resolves the main checkout ends at the bound and records nothing.
{
  const R = fs.mkdtempSync(path.join(tmp, 'stall-'));
  const C = path.join(R, '.superdev', 'scopes', 'c');
  fs.mkdirSync(path.join(R, 'sub'), { recursive: true });
  fs.mkdirSync(C, { recursive: true });
  cp.execFileSync('git', ['init', '-q'], { cwd: R });
  fs.writeFileSync(path.join(C, 'ledger.md'), ledger([['07', 'in-progress']]));
  const ev = (name, cwd, extra) => Object.assign({ hook_event_name: name, agent_id: 'st1', agent_type: 'superdev:implementer', description: 'd', cwd }, extra);
  run(agentPre(`${C}/slicetrees/07`, 'tst1'));
  run(agentPost('tst1', { status: 'async_launched', agentId: 'st1' }, R));
  const bin = path.join(tmp, 'stall-bin');
  fs.mkdirSync(bin, { recursive: true });
  // exec leaves no grandchild holding the stdout pipe once the bound kills the stub.
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nexec sleep 20\n', { mode: 0o755 });
  const r = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify(ev('SubagentStop', path.join(R, 'sub'))), encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, RUN_TRACE_GIT_BOUND_MS: '200' } });
  assertSpawnDecided(r, 'run-trace.js SubagentStop with a stalled git');
  assert.deepEqual(trace(C).filter((l) => l[2] === 'dispatch-end'), [], 'a killed git call records no dispatch-end');
}

// SubagentStop from inside a submodule resolves the submodule's own checkout, never `.git/modules`.
{
  const gitIn = (cwd, ...a) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'protocol.file.allow=always', ...a], { cwd, stdio: 'ignore' });
  const lib = fs.mkdtempSync(path.join(tmp, 'lib-'));
  const sup = fs.mkdtempSync(path.join(tmp, 'sup-'));
  gitIn(lib, 'init', '-q');
  gitIn(lib, 'commit', '-q', '--allow-empty', '-m', 'x');
  gitIn(sup, 'init', '-q');
  gitIn(sup, 'submodule', 'add', '-q', lib, 'vendor/lib');
  const sub = path.join(sup, 'vendor', 'lib');
  const S = path.join(sub, '.superdev', 'scopes', 's');
  fs.mkdirSync(S, { recursive: true });
  fs.writeFileSync(path.join(S, 'ledger.md'), ledger([['09', 'in-progress']]));
  run(agentPre(`${S}/slicetrees/09`, 'tsm1'));
  run(agentPost('tsm1', { status: 'async_launched', agentId: 'sm1' }, sub));
  run({ hook_event_name: 'SubagentStop', agent_id: 'sm1', agent_type: 'superdev:implementer', cwd: sub });
  assert.deepEqual(trace(S).filter((l) => l[2] === 'dispatch-end').map((l) => l[4]), ['tsm1'], 'a submodule cwd records the end under the submodule checkout');
}

// The stdin-to-line contract through the spawned hook: an edit line, a run line, and the Missing RED output.
{
  reset();
  const ver = path.join(S3, 'docs', 'agents', 'verification.md');
  fs.writeFileSync(ver, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  assert.equal(spawnOut({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(S3, 'tests', 'sp.test.js') }, cwd: tmp }), '');
  const out = JSON.parse(spawnOut({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('Missing RED'), 'a passing run after a test edit prints the note as hook output');
  assert.deepEqual(trace(A).map((l) => l[2] + ' ' + l[3]), ['edit test', 'run full', 'note tests/sp.test.js']);
  fs.rmSync(ver);
}

// Failure modes: malformed stdin, unreadable ledger, no verification.md. Exit 0, no output, no line.
reset();
assert.equal(spawnOut(null, 'not json'), '');
assert.equal(spawnOut(null, ''), '');
run({ tool_name: 'Edit' });
fs.rmSync(path.join(A, 'ledger.md'));
edit(path.join(S3, 'x.js'));
edit(path.join(A, 'scopetree', 'x.js'));
assert.equal(trace(A).length, 0, 'an unreadable ledger records nothing');
fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['03', 'in-progress']]));
edit(path.join(S3, 'x.js'));
assert.equal(trace(A).length, 1, 'a missing verification.md still records, with defaults');

// The Missing RED remedy (agents/implementer.md): stage, revert to <base>, restore from the index. The
// uncommitted implementation survives, and a file absent at <base> goes away and comes back.
{
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-remedy-'));
  const g = (...a) => cp.execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  g('init', '-q');
  fs.writeFileSync(path.join(repo, 'impl.js'), 'old');
  g('add', '-A');
  g('commit', '-q', '-m', 'base');
  fs.writeFileSync(path.join(repo, 'impl.js'), 'new work');
  fs.writeFileSync(path.join(repo, 'added.js'), 'brand new');
  g('add', 'impl.js', 'added.js');
  g('restore', '--worktree', '--source=HEAD', '--', 'impl.js', 'added.js');
  assert.equal(fs.readFileSync(path.join(repo, 'impl.js'), 'utf8'), 'old', 'the revert shows the base');
  assert.equal(fs.existsSync(path.join(repo, 'added.js')), false, 'a path absent at base is deleted');
  g('restore', '--', 'impl.js', 'added.js');
  assert.equal(fs.readFileSync(path.join(repo, 'impl.js'), 'utf8'), 'new work', 'the restore returns the uncommitted implementation');
  assert.equal(fs.readFileSync(path.join(repo, 'added.js'), 'utf8'), 'brand new', 'the restore returns the new file');
  fs.rmSync(repo, { recursive: true, force: true });
}

// Requiring the hook prints nothing and dispatches nothing (INV-0068).
{
  const r = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], { input: JSON.stringify({ tool_input: { file_path: path.join(S3, 'q.js') } }), encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(r, 'requiring run-trace.js');
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, '', 'requiring run-trace.js prints nothing');
  assert.equal(trace(A).length, 1, 'requiring run-trace.js records nothing');
}

// Reading a large trace stays linear: the trace has no cap and every event re-reads it. The ceiling is
// relative to the same run's own baseline, a small trace read as often as it takes to cover the same
// line count, so scheduler noise scales both sides alike (ADR 0086).
{
  const { readTrace } = require('../plugin/scripts/scope.js');
  const line = '2026-01-01T00:00:00Z 02 implementer run test abc123 pass\n';
  const small = line.repeat(500);
  const large = line.repeat(50000);
  const time = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t); };
  readTrace(small);
  const baseline = time(() => { for (let i = 0; i < 100; i++) readTrace(small); });
  const big = time(() => readTrace(large));
  assert.ok(big < baseline * 20 + 5e7, 'reading a trace of 50000 lines costs a small multiple of reading the same lines in small traces');
}

fs.rmSync(tmp, { recursive: true, force: true });
