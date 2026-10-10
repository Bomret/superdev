'use strict';

// Suite for plugin/hooks/ledger-guard.js. Requires the hook (silent: its require.main guard keeps
// main() from running) and calls its exported decide() directly.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');

const hookPath = require.resolve('../plugin/hooks/ledger-guard.js');
const { decide, ARG } = require(hookPath);

const file = (file_path) => decide({ tool_input: { file_path } });
const bash = (command) => decide({ tool_input: { command } });
const L = '.superdev/scopes/demo/ledger.md';

// Edit/Write on a scopes ledger → deny, message names scope.js.
assert.equal(file(L).block, true, 'relative ledger path denied');
assert.equal(file('/abs/repo/' + L).block, true, 'absolute ledger path denied');
assert.ok(/scope\.js/.test(file(L).reason), 'denial names scope.js');
// Edit/Write elsewhere → allow.
assert.equal(file('.superdev/scopes/demo/dod.md').block, false, 'dod.md passes');
assert.equal(file('.superdev/brainstorm/notes.md').block, false, 'brainstorm passes');
assert.equal(file('docs/ledger.md').block, false, 'a ledger.md outside .superdev/scopes passes');
assert.equal(file('src/index.js').block, false, 'ordinary file passes');

// Bash shell writes into a scopes ledger → deny, quoted/escaped forms included.
assert.equal(bash('echo "**Stage:** merged" > ' + L).block, true, 'redirect > denied');
assert.equal(bash('echo bullet >> /abs/' + L).block, true, 'append >> denied');
assert.equal(bash('echo x > ".superdev/scopes/demo/ledger.md"').block, true, 'double-quoted redirect denied');
assert.equal(bash("echo x >> '.superdev/scopes/demo/ledger.md'").block, true, 'single-quoted append denied');
assert.equal(bash('echo x > .superdev/scopes/my\\ demo/ledger.md').block, true, 'backslash-escaped path denied');
assert.equal(bash('echo x > $(printf %s .superdev/scopes/a/ledger.md)').block, true, 'redirect to a command substitution holding spaces denied');
// a redirect target whose substitution ARG cannot balance is still judged on its raw text
for (const target of ['$((1+(2)))/@', '$(a$(b$(c)))/@', '/x$((1*(2)))/@', '$((1+(2)))"/my dir/@"', '$((1+(2)))/my\\ dir/@', "$(a$(b$(c)))'/x y/@'", 'x$((1+(2)))"/a b/@"']) {
  assert.equal(bash('echo x > ' + target.replace('@', L)).block, true, 'redirect behind an unbalanced substitution denied: ' + target);
}
// a write verb's target whose substitution sits inside the ledger path is denied for every verb
for (const verb of ['cat new | tee @', 'cat new | tee -a @', 'cp new @', 'mv new @', 'install -m 644 new @', "sed -i 's/a/b/' @"]) {
  for (const sub of ['$((1+(2)))', '$(a$(b$(c)))']) {
    for (const p of ['.superdev/scopes/' + sub + '/ledger.md', '.superdev/scopes/s' + sub + '/ledger.md', '.superdev/scopes/demo/' + sub + 'ledger.md']) {
      assert.equal(bash(verb.replace('@', p)).block, true, 'write verb behind an unbalanced substitution denied: ' + verb + ' ' + p);
    }
  }
}
// a ledger path crossing a space inside a balanced substitution is read by ARG alone: RAW_ARG splits it
for (const verb of ['cat new | tee @', 'cat new | tee -a @', 'cp new @', 'mv new @', 'install -m 644 new @', "sed -i 's/a/b/' @"]) {
  for (const sub of ['$(echo a b)', '${X:-a b}', '`echo a b`']) {
    const target = '.superdev/scopes/' + sub + '/' + 'ledger.md';
    assert.equal(bash(verb.replace('@', target)).block, true, 'write verb behind a balanced substitution holding spaces denied: ' + verb + ' ' + target);
  }
}
// a quoted or backticked `}` inside an unquoted parameter expansion does not close it
for (const sub of ['${X:-"a } b"}', "${X:-'a } b'}", '${X:-"}"}', '${X:-`a } b`}']) {
  assert.equal(bash('> ' + sub + '/' + L).block, true, 'redirect behind a quoted brace denied: ' + sub);
}
// unterminated groups and long runs of them resolve without catastrophic backtracking (qualitative bound, ADR 0086).
// ARG excludes `{` inside `${…}`; with that exclusion dropped (`[^}\\"'`]`), the block took 18s with its last
// three runs at 20000 repeats, under the 120s ceiling. At 60000 repeats each of those three runs took over 120s on
// its own (216s, 266s, and 223s) and the whole block took 710s, measured 2026-10-09 at load averages between 60 and
// 125 on 8 cores. As shipped they take well under a second each.
{
  const t0 = Date.now();
  bash('> $('.repeat(5000));
  bash('cp ' + '$( '.repeat(5000));
  bash('> '.repeat(5001) + '`');
  bash('> '.repeat(5000) + '${');
  bash('cp ' + '${ '.repeat(5000));
  bash('tee ' + '${'.repeat(5000));
  bash('tee ' + '${'.repeat(60000));
  bash('>${ '.repeat(60000));
  bash('tee ' + '${"'.repeat(60000));
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 120000, 'substitution runs must resolve quickly, took ' + elapsed + 'ms');
}
// Multiple heredocs on one line: every opener must be recognized and its body masked (RED test for finding 2).
{
  const T = '.superdev/scopes/demo/trace.log';
  assert.equal(bash("cat <<A <<B\nfirst\nA\nsecond\nB\necho done").block, false, 'two heredocs on one line, no ledger write, passes');
  assert.equal(bash("cat <<A <<B\nfirst\nA\nsecond\nB\ncp /tmp/x " + L).block, true, 'two heredocs on one line with ledger write after, denied');
  assert.equal(bash("cat <<A <<B\nfirst\nA\ncp file " + L + "\nB\necho done").block, false, 'second heredoc body with cp+ledger is masked; real write must follow');
  assert.equal(bash("cat <<A <<B\nfirst\nA\necho y > " + T + "\nB\necho done").block, false, 'second heredoc body with trace redirect is masked; real write must follow');
  assert.equal(bash("cat > notes.md <<A <<B\nfirst\nA\nsecond\nB").block, false, 'two heredocs writing to notes.md passes');
}
assert.equal(bash('echo x > "$(dirname .superdev/scopes/a/ledger.md)/other"').block, true, 'a substitution-bearing redirect target is judged on its text, so this write to another file is a deliberate fail-closed');
assert.equal(bash('cat new.md | tee ' + L).block, true, 'tee denied');
assert.equal(bash('cat new.md | tee -a "' + L + '"').block, true, 'tee -a quoted denied');
assert.equal(bash("sed -i '' 's/merged/reviewed/' " + L).block, true, 'sed -i denied');
assert.equal(bash('sed -i.bak "s/a/b/" "' + L + '"').block, true, 'sed -i.bak quoted denied');
assert.equal(bash('cp new.md ' + L).block, true, 'cp denied');
assert.equal(bash('mv new.md "' + L + '"').block, true, 'mv quoted denied');
assert.equal(bash('install -m 644 new.md ' + L).block, true, 'install denied');
assert.equal(bash('cp a b').block, false, 'cp elsewhere allowed');

// Compound commands: a write elsewhere followed by a pure ledger read stays allowed — the target
// scan is bounded to the writing command's own segment.
assert.equal(bash('cp a b && cat ' + L).block, false, 'cp elsewhere then a ledger read passes');
assert.equal(bash('mv x y; grep Stage ' + L).block, false, 'mv elsewhere then a ledger grep passes');
assert.equal(bash('echo hi | tee /tmp/log; cat ' + L).block, false, 'tee elsewhere then a ledger read passes');
assert.equal(bash('cat x; cp new.md ' + L).block, true, 'cp into the ledger after another command still denied');
assert.equal(bash('true && mv new.md ' + L).block, true, 'mv into the ledger after && still denied');
assert.equal(bash('echo x | tee /tmp/log ' + L).block, true, 'tee with the ledger as a later target still denied');

// scope.js invocations and reads → allow.
assert.equal(bash('node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set merged --root /abs/.superdev/scopes/demo').block, false, 'scope.js passes');
assert.equal(bash('node scripts/scope.js init feat/demo < slices.json').block, false, 'scope.js init with stdin redirect-in passes');
assert.equal(bash('node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" adopt --root /abs/.superdev/scopes/demo').block, false, 'scope.js adopt passes — the write it makes is the sanctioned one');
assert.equal(bash('cat ' + L).block, false, 'read passes');
assert.equal(bash('grep Stage ' + L).block, false, 'grep passes');
assert.equal(bash('sed -n "1,5p" ' + L).block, false, 'sed without -i passes');
assert.equal(bash('echo hi > /tmp/out.txt').block, false, 'redirect elsewhere passes');
assert.equal(bash('bun run test').block, false, 'unrelated bash passes');

// ARG mirrors merge-guard's token (comment at the declaration); hooks stay standalone, so pin the
// copy against the canonical one instead of sharing it — silent drift would be a bug.
{
  const sibling = fs.readFileSync(path.join(path.dirname(hookPath), 'merge-guard.js'), 'utf8');
  const m = sibling.match(/^const ARG = \/(.*)\/\.source;$/m);
  assert.ok(m, 'merge-guard.js declares its ARG token where this pin expects it');
  assert.equal(ARG, m[1], 'ledger-guard ARG is byte-identical to merge-guard ARG');
}

// require.main guard: requiring this hook never runs main()'s stdin/decide dispatch, and
// spawning it directly (as Claude Code's hook invocation does) decides.
{
  const payload = JSON.stringify({ tool_input: { file_path: L } });
  const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
    input: payload, encoding: 'utf8', timeout: 5000,
  });
  assertSpawnDecided(required, 'requiring ledger-guard.js');
  assert.equal(required.status, 0, 'requiring ledger-guard.js never blocks');
  assert.equal(required.stdout, '', 'requiring ledger-guard.js prints nothing');
  assert.equal(required.stderr, '', 'requiring ledger-guard.js runs no decision');

  const spawned = cp.spawnSync(process.execPath, [hookPath], { input: payload, encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(spawned, 'spawning ledger-guard.js directly');
  assert.equal(spawned.status, 2, 'spawning ledger-guard.js directly still blocks a ledger edit');
  assert.match(spawned.stderr, /scope\.js/, 'and still reports the ledger-guard reason');
}

// The run trace (ADR 0117) is hook-written: every write shape refused for the ledger is refused for it.
{
  const T = '.superdev/scopes/demo/trace.log';
  assert.equal(file(T).block, true, 'Edit/Write of trace.log denied');
  assert.ok(/trace/.test(file(T).reason) && /hook-written/.test(file(T).reason), 'denial names the run trace as hook-written');
  for (const c of ['echo x > ' + T, 'echo x >> ' + T, 'echo x | tee ' + T, 'sed -i s/a/b/ ' + T, 'cp /tmp/x ' + T, 'mv /tmp/x ' + T]) {
    assert.equal(bash(c).block, true, 'denied: ' + c);
  }
  assert.equal(bash('cat ' + T).block, false, 'a read passes');
  assert.equal(bash('node scope.js trace --root /r/.superdev/scopes/demo').block, false, 'a scope.js call passes');
  // A heredoc body is data: prose naming cp, tee, and ledger/trace paths passes; a real write still blocks.
  const prose = 'cp and tee write ' + L + ' and ' + T;
  assert.equal(bash("cat > notes.md <<'EOF'\n" + prose + '\nEOF').block, false, 'quoted heredoc body passes');
  assert.equal(bash('cat > notes.md <<-EOF\n\t' + prose + '\n\tEOF').block, false, 'indented heredoc body passes');
  assert.equal(bash("cat > " + T + " <<'EOF'\nhello\nEOF").block, true, 'a real heredoc write to trace.log is refused');
  assert.equal(bash("cat > notes.md <<'EOF'\nx\nEOF\necho y > " + L).block, true, 'a write after the heredoc is still refused');
  for (const opener of ['cat <<< x', 'echo "<<EOF"', "echo '<<EOF'", 'x=$((1 << 2))']) {
    assert.equal(bash(opener + '\ncp /tmp/x ' + T).block, true, 'a non-heredoc << is no opener: ' + opener);
    assert.equal(bash(opener + '\ncp /tmp/x ' + L).block, true, 'ledger too: ' + opener);
  }
}

// Finding 2: shell comments containing `<<` must not open phantom heredocs. A `#` that starts a word
// masks the rest of its line before the heredoc opener scan, so `# x <<EOF` is treated as a comment,
// not an opener. Quoted `#` and `$#` stay unmasked, so real heredocs still open.
{
  const T = '.superdev/scopes/demo/trace.log';
  assert.equal(bash('# this is a comment <<EOF\ncp /tmp/x ' + L).block, true, 'a real write after a comment with phantom << is denied');
  assert.equal(bash('# comment <<EOF\necho y > ' + T).block, true, 'write to trace.log after comment with phantom << is denied');
  assert.equal(bash('cmd=$(echo x) # trailing comment <<EOF\ncp /tmp/x ' + L).block, true, 'real write after inline comment with phantom << is denied');
  assert.equal(bash('echo "#string" <<EOF\ndata\nEOF\ncp /tmp/x ' + L).block, true, 'real write after a real heredoc (quoted # does not start a comment) is denied');
  assert.equal(bash("echo '#string' <<EOF\ndata\nEOF\ncp /tmp/x " + L).block, true, 'real write after a real heredoc with single-quoted # is denied');
}

// An escaped quote outside quotes opens no quote carry: the later heredoc body stays masked and is allowed.
assert.equal(bash('echo it\\\'s\ncat > notes.md <<EOF\necho x > .superdev/scopes/x/ledger.md\nEOF').block, false, 'escaped quote leaves heredoc body masked');

// `$$` is the PID, so its second `$` never opens an ANSI-C quote: the `'` starts a plain quote and the later writes stay seen.
assert.equal(bash("echo $$'a\\' '<<EOF' \\'\ncp /tmp/x .superdev/scopes/x/ledger.md").block, true, 'PID before a plain quote: cp denied');
assert.equal(bash("echo $$'a\\' '<<EOF' \\'\necho hi > .superdev/scopes/x/ledger.md").block, true, 'PID before a plain quote: redirect denied');
assert.equal(bash("echo $$$$'a\\' '<<EOF' \\'\ncp /tmp/x .superdev/scopes/x/ledger.md").block, true, 'two PIDs before a plain quote: cp denied');
assert.equal(bash("echo $$$'a\\' <<EOF'\ncat > notes.md <<EOF\necho x > .superdev/scopes/x/ledger.md\nEOF").block, false, 'PID then ANSI-C quote still reads as ANSI-C');

// Every in-place edit form is refused for the ledger and the run trace, plain and wrapped; read-only inspection passes.
const INPLACE_DENY = [
  "sed -i 's/a/b/' @", "sed -i.bak 's/a/b/' @", "sed -Ei 's/a/b/' @", "sed -i -E 's/a/b/' @", "sed --in-place 's/a/b/' @",
  "sed --in-place=.bak 's/a/b/' @", "perl -pi -e 's/a/b/' @", "perl -i -pe 's/a/b/' @", "perl -i.bak -pe 's/a/b/' @",
  "perl -pi.bak -e 's/a/b/' @", "perl -0777 -pi -e 's/a/b/' @", 'echo x >| @', 'echo x >|@', 'echo x > @',
  "gsed -i 's/a/b/' @", "gsed --in-place 's/a/b/' @", "ruby -pi -e 'x' @", "ruby -i -pe 'x' @", "ruby -i.bak -pe 'x' @",
  'ed @', 'ex @', 'ed -s @', 'printf "w\\nq\\n" | ed @', 'ex -sc wq @',
  'sh -c "sed -i s/a/b/ @"', "sh -c 'sed -i s/a/b/ @'", "bash -c 'perl -pi -e x @'", 'bash -c "perl -pi -e x @"',
  "bash -c 'gsed -i x @'", "bash -c 'ruby -pi -e x @'", 'bash -c "ed @"', 'sh -c "/usr/bin/sed -i s/a/b/ @"',
  "\\sed -i 's/a/b/' @", "\\perl -pi -e x @", "\\gsed -i x @", '\\ed @', "FOO=1 sed -i 's/a/b/' @", 'FOO=1 BAR=2 perl -pi -e x @', 'FOO=1 ed @',
  "sh -c 'FOO=1 sed -i x @'", 'bash -c "FOO=1 BAR=2 perl -pi -e x @"', "bash -c 'FOO=1 ed @'", "sh -c '\\sed -i x @'",
  "awk -i inplace '{print}' @", 'gawk -i inplace 1 @', 'awk -iinplace 1 @', 'awk --include inplace 1 @', 'awk --include=inplace 1 @',
  'sort -o @ @', 'sort --output=@ @', 'sort --output @ @', 'sort -ro @ @', 'sort -o@ @', 'sort @ -o @',
  'truncate -s 0 @', 'truncate --size=0 @', 'truncate -s0 @', 'dd of=@', 'dd if=/dev/null of=@', 'dd of=@ if=/dev/null',
  "sh -c 'awk -i inplace 1 @'", "sh -c 'sort -o @ @'", "bash -c 'truncate -s 0 @'", 'sh -c "dd of=@"',
  '\\awk -i inplace 1 @', '\\dd of=@', 'FOO=1 truncate -s 0 @', 'FOO=1 sort -o @ @', "sh -c 'FOO=1 dd of=@'",
  // The operator's choice: the segment-wide check refuses a quoted ` -i` inside a sed script, fail-closed.
  "sed -n 's/ -i//p' @",
  // A GNU unique-prefix abbreviation of --in-place from --in- on.
  "sed --in-pl 's/a/b/' @", "sed --in- x @", "sed --in-pl=.bak x @", "gsed --in-p x @",
  // awk's -i is an option only before the program text, after other options too.
  'awk -F: -i inplace 1 @', 'awk -v x=1 -i inplace 1 @', 'awk -f p.awk -i inplace @',
  // A `;` or `&&` inside a quoted shell string does not hide the editor from the target.
  "bash -c 'for f in @; do perl -pi -e x $f; done'", 'sh -c "cd /x && perl -pi -e x @"', "sh -c 'cd /x; sort -o @ @'",
  // A process substitution runs its command, so a searcher or any other reader around it does not exempt the edit inside.
  'grep a <(sed -i p @)', "rg a <(perl -pi -e 1 @)", 'grep a @ >(sed -i p @)', 'cat <(perl -pi -e 1 @)', 'cat <(truncate -s 0 @)',
  'cat <(sort -o @ @)', 'echo <(dd of=@)', 'cat >(sed -i p @)', 'diff <(sort @) >(sed -i p @)',
  // `rg --pre CMD` runs CMD on every searched file, so a searcher holding --pre is no read; its value is read as a command.
  "rg --pre 'sed -i p' @", "rg @ --pre 'sed -i p'", "rg --pre='perl -pi -e 1' x @", "rg --pre 'perl -pi -e 1' x @", "rg x @ --pre='sed -i p'",
  // A tool behind a prefix wrapper is in command position, at the top level and inside a shell string.
  'sudo perl -pi -e x @', 'sudo ed @', 'sudo -u bob perl -pi -e x @', 'env perl -pi -e x @', 'env FOO=1 ed @', 'env -u X ex @', 'xargs perl -pi -e x < @',
  'xargs -n 1 ed @', 'nice ed @', 'nice -n 5 ed @', 'nohup ed @', 'command ed @', 'time ed @', 'timeout 5 ed @', 'timeout -s KILL 5 perl -pi -e x @', 'sudo env nice ed @',
  'rtk ed @', 'rtk sed -i p @', 'sudo -- ed @', 'sudo truncate -s 0 @', 'nice sort -o @ @',
  // An ANSI-C `$'…'` word is a quoted string, so a shell reads its content as a command line.
  "bash -c $'perl -pi -e x @'", "sh -c $'sed -i x @'", "bash -c $'sudo ed @'", 'bash -c $"perl -pi -e x @"',
  // `truncate -r REF FILE` sizes FILE from REF, so FILE is written; the reference file is only read.
  'truncate -r /tmp/ref @', 'truncate --reference=/tmp/ref @', 'truncate --reference /tmp/ref @', 'truncate -r /tmp/ref -c @',
  // A wrapper's long option may take a separate value.
  'sudo --user bob ed @', 'sudo --user bob perl -pi -e x @', 'env --unset HOME perl -pi -e x @', 'nice --adjustment 5 ed @',
  'timeout --signal KILL 5 ed @', 'xargs --max-args 1 ed @', 'sudo --group staff --user bob ed @',
  // exec, doas, stdbuf, and builtin run the command that follows.
  'exec ed @', 'exec perl -pi -e x @', 'exec -a name ed @', 'doas ed @', 'doas -u bob perl -pi -e x @', 'stdbuf -oL ed @', 'stdbuf -o L sed -i x @',
  'stdbuf -i0 -oL -eL perl -pi -e x @', 'builtin exec ed @', 'builtin command ed @', 'sudo exec ed @',
  // A command passed as one string to su, flock, or env -S is a command line.
  'su -c "ed @"', "su -c 'perl -pi -e x @'", 'su root -c "ed @"', 'su --command="ed @"', "flock /tmp/lock -c 'perl -pi -e x @'",
  'flock /tmp/lock --command "ed @"', 'env -S "ed @"', "env -S 'perl -pi -e x @'", 'env --split-string="ed @"', 'sudo su -c "ed @"',
  // An escaped quote inside a shell string is a quote of the command line the shell reads.
  'bash -c "\\"perl\\" -pi -e x @"', 'sh -c "\\"sed\\" -i x @"', 'bash -c "\\"ed\\" @"', 'bash -c "sudo \\"perl\\" -pi -e x @"',
  // `>&` redirects standard output to a file.
  'echo x >& @', 'echo x &> @', 'echo x &>> @', 'cat y >&@',
  // A short-option cluster may end on the option that takes the command string or the value.
  'su -lc "ed @"', "su -lc 'perl -pi -e x @'", 'flock -xc "ed @" /tmp/l', 'flock /tmp/l -xc "ed @"', 'env -vS "ed @"', 'env -iS "ed @"',
  'sudo -iu bob ed @', 'sudo -Eu bob perl -pi -e x @', 'xargs -rn 1 ed @', 'env -iu X ed @',
  // tee, cp, mv, install, and ln are read as a command behind a wrapper or a path prefix, and a copy into the run root
  // under a run-state name, or a link that names a run-state file, writes it.
  'echo x | sudo tee @', 'echo x | command tee -a @', 'xargs tee @', '/usr/bin/tee @', 'sudo cp /tmp/x @', 'sudo mv /tmp/x @',
  'sudo install -m 644 /tmp/x @', 'env FOO=1 tee -a @', 'timeout 5 cp /tmp/x @', 'exec tee @',
  'ln -s /tmp/x @', 'ln -sf /tmp/x @', 'sudo ln -s /tmp/x @', 'ln -s @ /tmp/alias', 'ln @ /tmp/alias',
  // A value option's attached value (`sudo -uroot`) is one word, so the command word follows it; the cluster is read as getopt reads it.
  'sudo -uroot ed @', 'sudo -uroot perl -pi -e x @', 'sudo -uuser ed @', 'xargs -dn ed @', 'sudo -uroot tee @', 'sudo -uroot cp /tmp/x @',
  'sudo -iuroot ed @', 'xargs -n1 ed @', 'sudo -u root ed @',
  // patch writes the files it names and rsync its destination; cp -s and cp -l make a second name for a source the way ln does.
  'patch @ < /tmp/p', 'patch -p1 @ /tmp/p', 'sudo patch @ < /tmp/p', 'rsync /tmp/x @', 'rsync -av /tmp/x @', 'rsync -at /tmp/x @', 'sudo rsync /tmp/x @',
  'cp -s @ /tmp/a', 'cp -l @ /tmp/a', 'cp --symbolic-link @ /tmp/a', 'cp --link @ /tmp/a', 'cp -sf @ /tmp/a', 'sudo cp -s @ /tmp/a',
  'patch -o @ /tmp/x', 'patch -o@ /tmp/x', 'patch @ < /tmp/p',
];
// A copy into the run root under a run-state name writes that file, whichever way the directory is given.
const RUN_ROOT = '.superdev/scopes/demo';
const INTO_ROOT = ['cp -t R /tmp/B', 'cp --target-directory=R /tmp/B', 'cp --target-directory R /tmp/B', 'cp -tR /tmp/B', 'cp -at R /tmp/B', 'cp /tmp/B R/',
  'cp /tmp/B R', 'mv -t R /tmp/B', 'install -t R /tmp/B', 'sudo cp -t R /tmp/B', 'install -m 644 /tmp/B R/', 'ln -s /tmp/B R/B', 'ln -st R /tmp/B'];
// Each form plain, wrapped in the openers the word-level check strips, and inside `sh -c` / `bash -c` (with a quote
// character the form does not use).
const wrap = (c) => {
  const q = !c.includes("'") ? "'" : !c.includes('"') ? '"' : null;
  const shells = q ? ['sh', 'bash'].flatMap((sh) => [sh + ' -c ' + q + c + q, sh + ' -c ' + q + '(' + c + ')' + q]) : [];
  return [c, '(' + c + ')', 'echo $(' + c + ')', '`' + c + '`', '{ ' + c + '; }', 'echo "$(' + c + ')"', 'x=$(' + c + ')', 'x=`' + c + '`', 'FOO="$(' + c + ')"', 'echo "`' + c + '`"', 'cat <(' + c + ')', 'cat >(' + c + ')', ...shells];
};
{
  for (const target of [L, '.superdev/scopes/demo/trace.log']) {
    for (const f of INPLACE_DENY) {
      for (const c of wrap(f.replaceAll('@', target))) {
        assert.equal(bash(c).block, true, 'denied: ' + c);
      }
    }
    const base = path.basename(target);
    for (const c of INTO_ROOT) assert.equal(bash(c.replaceAll('R', RUN_ROOT).replaceAll('B', base)).block, true, 'denied: ' + c.replaceAll('R', RUN_ROOT).replaceAll('B', base));
    for (const c of ['cp -t R /tmp/other.md', 'cp /tmp/other.md R/', 'mv -t R /tmp/notes.md', 'cp -t /tmp/dir @', 'cp -t /tmp/dir/ @ /tmp/y', 'ln -s /tmp/a /tmp/b']) {
      assert.equal(bash(c.replaceAll('R', RUN_ROOT).replaceAll('@', target)).block, false, 'passes: ' + c.replaceAll('R', RUN_ROOT).replaceAll('@', target));
    }
    for (const c of ['sed -n 1,5p @', "perl -ne 'print if /a/' @", "perl -Mstrict -ne 'print' @", 'cat @', 'grep a @', 'grep -i sed @', 'grep -i perl @',
      "ruby -ne 'print if /a/' @", 'grep ed @', 'grep ex @', 'sh -c "sed -n 1,5p @"', "bash -c 'perl -ne print @'", 'sh -c "grep sed @"', 'grep "sed -i" @',
      "\\sed -n 1p @", 'FOO=1 sed -n 1p @', "FOO=1 perl -ne print @", 'FOO=1 grep ed @', "sh -c 'FOO=1 sed -n 1p @'", "sh -c 'FOO=1 grep -i sed @'",
      "awk '{print}' @", 'awk -f x.awk @', 'sort @', 'sort -r @', 'sort -u @ > /tmp/x', 'sort -o /tmp/x @', 'sort --output=/tmp/x @', 'dd if=@ of=/tmp/x',
      'dd if=@', 'truncate -s 0 /tmp/x', 'grep awk @', 'grep truncate @', 'grep sort @', 'grep dd @', "sh -c 'sort -o /tmp/x @'",
      "sh -c 'dd if=@ of=/tmp/x'", 'FOO=1 sort @', "\\awk '{print}' @",
      "awk '/ -i inplace/' @", "awk -F: '/ -i inplace/' @", "awk '/ --include inplace/' @",
      "echo '$(perl -pi -e x @)'", "echo '`perl -pi -e x @`'", 'echo "$(cat @)"', 'x=$(sort @)', "bash -c 'for f in @; do cat $f; done'",
      'rg x @', "rg --pre-glob '*.md' x @", 'sudo cat @', 'env sed -n 1p @', 'nice sort @', 'nice -n 5 sort @', 'xargs cat < @', 'sudo -u bob cat @', 'timeout 5 grep a @', "bash -c 'sudo cat @'",
      "bash -c 'env sed -n 1p @'", "bash -c $'sed -n 1p @'", "bash -c $'cat @'", 'sudo sort -o /tmp/x @', 'env FOO=1 grep ed @', 'command -v sed',
      'truncate -r @ /tmp/x', 'truncate --reference=@ /tmp/x', 'truncate --reference @ /tmp/x', 'truncate -r @ -s 0 /tmp/x', 'sudo --user bob cat @',
      'env --unset HOME grep ed @', 'nice --adjustment 5 cat @', 'stdbuf -oL grep x @', 'stdbuf -o L cat @', 'exec cat @', 'doas cat @', 'builtin command cat @',
      'su -c "cat @"', "su -c 'grep sed @'", 'flock /tmp/lock -c "cat @"', 'env -S "cat @"', 'echo x >& /tmp/y', 'cat @ >& /tmp/y', 'cat @ 2>&1', 'bash -c "\\"cat\\" @"',
      'grep -c "sed -i" @', 'grep -c x @',
      'su -lc "cat @"', 'flock -xc "cat @" /tmp/l', 'flock /tmp/l -xc "cat @"', 'env -iS "cat @"', 'sudo -iu bob cat @', 'sudo -Eu bob grep ed @',
      'sudo -uroot cat @', 'sudo -uroot grep ed @', 'xargs -dn cat < @', 'rsync @ /tmp/x', 'rsync -av @ /tmp/x', 'patch /tmp/x < /tmp/p', 'patch -p1 < @', 'patch /tmp/x < @', 'patch -p1 <@', 'sudo patch -p1 < @', 'cp -s /tmp/a /tmp/b', 'cp -l /tmp/a /tmp/b',
      'cp @ /tmp/x', 'tee /tmp/x < @', 'sudo cp @ /tmp/x', 'sudo tee /tmp/x < @', 'cat @ | tee /tmp/x', 'cp /tmp/a /tmp/b', 'mv /tmp/a /tmp/b', 'sudo tee /tmp/x',
      'grep tee @', 'echo cp @', 'echo ln @', 'ln -s /tmp/a /tmp/b',
      'cat <(grep x @)', 'diff <(sort @) <(sort /tmp/x)', 'grep a <(cat /tmp/x)', 'cat <(sed -n 1p @)', 'cat <(perl -ne print @)', 'cat <(sort -o /tmp/x @)',
    ]) {
      assert.equal(bash(c.replaceAll('@', target)).block, false, 'passes: ' + c.replaceAll('@', target));
    }
  }
}

// Differential: the guard refuses every in-place form the slice base (338163f6) refused, except a segment whose
// command word is a read-only searcher (grep, egrep, fgrep, rg), the documented exception.
{
  // The base's whole in-place rule, verbatim from 338163f6 plugin/hooks/ledger-guard.js: SED_SEGMENT and its `\s-i` test.
  const SED_SEGMENT = /(^|[;&|\n])([^;&|\n]*\bsed\b[^;&|\n]*)/gm;
  const baseWords = (t) => [...(t.match(new RegExp(ARG, 'g')) || []), ...(t.match(/(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/g) || [])];
  const baseRefs = (w) => /\.superdev\/scopes\/.*(?:ledger\.md|trace\.log)/.test(w.replace(/\\(.)/g, '$1').replace(/["']/g, ''));
  const baseRefuses = (cmd) => {
    let m;
    SED_SEGMENT.lastIndex = 0;
    while ((m = SED_SEGMENT.exec(cmd))) {
      if (/\s-i/.test(m[2]) && baseWords(m[2]).some(baseRefs)) return true;
    }
    return false;
  };
  const baseShapes = ['sudo sed -i x @', 'find @ -name ledger.md -exec sed -i x {} \\;', 'xargs sed -i x @ < list', 'xargs sed -i x < @', 'busybox sed -i x @'];
  const wrapped = ['(sed -i x @)', 'echo $(sed -i x @)', '`sed -i x @`', 'bash -c "(sed -i x @)"', '(perl -pi -e x @)', '{ sed -i x @; }'];
  let compared = 0;
  for (const target of [L, '.superdev/scopes/demo/trace.log']) {
    for (const f of [...INPLACE_DENY, ...wrapped, ...baseShapes]) {
      for (const c of wrap(f.replaceAll('@', target))) {
        if (baseRefuses(c)) {
          compared++;
          assert.equal(bash(c).block, true, 'base refused, so refused: ' + c);
        }
      }
    }
    for (const c of [...wrapped, ...baseShapes]) assert.equal(bash(c.replaceAll('@', target)).block, true, 'wrapped or base form denied: ' + c.replaceAll('@', target));
    for (const c of baseShapes) assert.equal(baseRefuses(c.replaceAll('@', target)), true, 'the base refused: ' + c.replaceAll('@', target));
    for (const c of ['grep -i sed @', 'grep "sed -i" @', 'FOO=1 grep -i sed @', 'sh -c "FOO=1 grep -i sed @"', 'rg -i sed @', 'egrep -i sed @']) {
      const cmd = c.replaceAll('@', target);
      assert.equal(baseRefuses(cmd), true, 'the base refused the searcher exception: ' + cmd);
      assert.equal(bash(cmd).block, false, 'the searcher exception passes: ' + cmd);
    }
  }
  assert.ok(compared > 100, 'the corpus exercises the base rule: ' + compared);
}

// Long runs of wrapper openers resolve without catastrophic backtracking (qualitative bound, ADR 0086). inplaceHits
// stops reading nested command lines past 8 levels; without that cap the `$(sed -i ` run recursed for 26s and then
// overflowed the stack with a RangeError (measured 2026-10-09), which fails this block at any ceiling.
{
  const t0 = Date.now();
  for (const run of ['(sed -i ', '$(sed -i ', '`sed -i ', 'sh -c "', "sh -c '", 'grep -i sed ']) bash(run.repeat(20000) + L);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 120000, 'wrapper runs must resolve quickly, took ' + elapsed + 'ms');
}

// The two hooks agree on the wrapper names they share (each keeps its own copy, hooks stay standalone): every wrapper
// run-trace reads a test run behind is a wrapper or keyword here.
{
  const traceSrc = fs.readFileSync(path.join(path.dirname(hookPath), 'run-trace.js'), 'utf8');
  const guardSrc = fs.readFileSync(hookPath, 'utf8');
  const traceNames = /^const WRAPPERS = \/\^\(\?:([^)]*)\)\$\/;$/m.exec(traceSrc)[1].split('|').concat('timeout');
  const guardNames = [...guardSrc.matchAll(/^ {2}\['([a-z]+)', new Set\(/gm)].map((m) => m[1]);
  const keywords = /^const KEYWORD = \/\^\(\?:([^)]*)\)\$\/;$/m.exec(guardSrc)[1].split('|');
  assert.ok(traceNames.length >= 7 && guardNames.length >= 11, 'both lists are read: ' + traceNames + ' / ' + guardNames);
  for (const name of traceNames) assert.ok(guardNames.includes(name) || keywords.includes(name), 'ledger-guard knows the wrapper run-trace knows: ' + name);
  for (const name of traceNames) {
    const cmd = name + ' perl -pi -e x ' + L;
    assert.equal(bash(cmd).block, true, 'an editor behind run-trace\'s wrapper is refused: ' + cmd);
  }
  // The value-option sets and the option reader are copies too: each name run-trace lists takes the same options here, and both
  // readers find the same command word. `time` is a KEYWORD here, so it has no set to compare.
  const lift = (src, re) => new Function('return ' + re.exec(src)[1])();
  const traceOpts = lift(traceSrc, /^const WRAPPER_VALUE_OPTS = (new Map\(\[[\s\S]*?\n\]\));$/m);
  const guardOpts = lift(guardSrc, /^const WRAPPER = (new Map\(\[[\s\S]*?\n\]\));$/m);
  const optionEnd = lift(traceSrc, /^(function optionEnd[\s\S]*?\n\})$/m);
  const optionWords = lift(guardSrc, /^(function optionWords[\s\S]*?\n\})$/m);
  assert.ok(traceOpts.size >= 4, 'run-trace\'s option sets are read: ' + [...traceOpts.keys()]);
  for (const [name, opts] of traceOpts) {
    if (name === 'time') continue;
    assert.deepEqual([...opts].sort(), [...guardOpts.get(name)].sort(), 'the value options of ' + name + ' agree');
  }
  const sudo = guardOpts.get('sudo');
  for (const ws of [['-iu', 'bob'], ['-uroot'], ['-n5'], ['-n', '5'], ['--user=x'], ['--user', 'x'], ['--'], ['-E'], ['-D', '/x'], ['--chdir', '/x']]) {
    const nice = new Set(['-n', '--adjustment']);
    for (const opts of [sudo, nice]) {
      assert.equal(optionEnd(ws, 0, opts) + 1, optionWords(ws[0], opts), 'both readers take the same words of ' + ws.join(' '));
    }
  }
}

// Fail-closed, pinned: the flag search covers every word after the first sed/perl, so a trailing `-i` on a
// grep of the word `sed` still blocks.
assert.equal(bash('grep sed ' + L + ' -i').block, true, 'a flag after the file blocks, fail-closed');

// The refusal names every ledger-writing verb in scope.js's usage text: every top-level verb there except the read-only ones.
{
  const READ_ONLY = new Set(['get', 'trace', 'status', 'publish', 'root', 'staging', 'dod-line', 'collisions', 'test', 'fail-to-pass']);
  const scopeJs = path.join(path.dirname(hookPath), '..', 'scripts', 'scope.js');
  const help = cp.spawnSync(process.execPath, [scopeJs, '--help'], { encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(help, 'scope.js --help');
  const verbs = [...new Set(help.stdout.split('\n').map((l) => /^  ([a-z][a-z-]*)\b/.exec(l)).filter(Boolean).map((m) => m[1]))].filter((v) => !READ_ONLY.has(v));
  assert.ok(verbs.length >= 10, 'the usage text yields the ledger-writing verbs: ' + verbs);
  const { reason } = file(L);
  const named = /\(([^)]*) verbs\)/.exec(reason)[1].split('/');
  for (const v of verbs) assert.ok(named.includes(v), 'refusal names verb ' + v);
}

console.log('ledger-guard tests ok');
