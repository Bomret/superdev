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
const { decide } = require(hookPath);
// The shell-word token the base (338163f6) hook carried, kept here for the differential block below.
const ARG = /(?:[^\s"'\\$`]|\$(?![({])|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|\$\((?:[^()\\]|\\.|\((?:[^()\\]|\\.)*\))*\)|\$\{(?:[^{}\\"'`]|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|`(?:[^`\\]|\\.)*`)*\}|`(?:[^`\\]|\\.)*`)+/.source;

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

// Letter case and the `\` separator never change which file a path names (NTFS, APFS; INV-0141).
assert.equal(file('.Superdev/Scopes/x/Ledger.md').block, true, 'mixed-case ledger path denied');
assert.equal(file('.superdev\\scopes\\x\\TRACE.LOG').block, true, 'backslash upper-case trace path denied');
assert.equal(bash("echo x > 'C:\\repo\\.superdev\\scopes\\x\\ledger.md'").block, true, 'quoted backslash ledger write denied');
assert.equal(bash('echo x > .SUPERDEV/Scopes/x/LEDGER.MD').block, true, 'upper-case Bash ledger write denied');
assert.equal(file('.superdev/scopes/x/dod.md').block, false, 'dod.md still passes');
assert.equal(file('.superdev/brainstorm/a.md').block, false, 'brainstorm still passes');

// Bash shell writes into a scopes ledger → deny, quoted/escaped forms included.
assert.equal(bash('echo "**Stage:** merged" > ' + L).block, true, 'redirect > denied');
assert.equal(bash('echo bullet >> /abs/' + L).block, true, 'append >> denied');
assert.equal(bash('echo x > ".superdev/scopes/demo/ledger.md"').block, true, 'double-quoted redirect denied');
assert.equal(bash("echo x >> '.superdev/scopes/demo/ledger.md'").block, true, 'single-quoted append denied');
assert.equal(bash('echo x > .superdev/scopes/my\\ demo/ledger.md').block, true, 'backslash-escaped path denied');
assert.equal(bash('echo x > $(printf %s .superdev/scopes/a/ledger.md)').block, true, 'redirect to a command substitution holding spaces denied');
// a redirect target behind nested substitutions or arithmetic is denied
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
// a ledger path crossing a space inside a balanced substitution is one word
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
  // A heredoc body no shell reads is data: prose naming cp, tee, and ledger/trace paths passes; a real write still blocks.
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
  'rtk ed @', 'rtk sed -i p @', 'rtk proxy cp a @', 'rtk -v run ed @', 'sudo -- ed @', 'sudo truncate -s 0 @', 'nice sort -o @ @', 'eval cp /tmp/x @', 'eval ed @',
  // An ANSI-C `$'…'` word is a quoted string, so a shell reads its content as a command line.
  "bash -c $'perl -pi -e x @'", "sh -c $'sed -i x @'", "bash -c $'sudo ed @'", 'bash -c $"perl -pi -e x @"',
  // `truncate -r REF FILE` sizes FILE from REF, so FILE is written; the reference file is only read.
  'truncate -r /tmp/ref @', 'truncate --reference=/tmp/ref @', 'truncate --reference /tmp/ref @', 'truncate -r /tmp/ref -c @',
  // A wrapper's long option may take a separate value.
  'sudo --user bob ed @', 'sudo --user bob perl -pi -e x @', 'env --unset HOME perl -pi -e x @', 'nice --adjustment 5 ed @',
  'timeout --signal KILL 5 ed @', 'xargs --max-args 1 ed @', 'sudo --group staff --user bob ed @',
  // macOS `env -P altpath` takes a separate value word, so the word after it is no command word.
  'env -P /bin ed @', 'env -P /bin perl -pi -e x @', 'env -iP /bin ed @', 'sudo env -P /bin truncate -s 0 @',
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
  // `((c))` reads as arithmetic in bash and as nested subshells in dash, so the guard also reads the command with `((` spread to `( (`.
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
      'echo "$(cat @)"', 'x=$(sort @)', "bash -c 'for f in @; do cat $f; done'",
      'rg x @', "rg --pre-glob '*.md' x @", 'sudo cat @', 'env sed -n 1p @', 'nice sort @', 'nice -n 5 sort @', 'xargs cat < @', 'sudo -u bob cat @', 'timeout 5 grep a @', "bash -c 'sudo cat @'",
      "bash -c 'env sed -n 1p @'", "bash -c $'sed -n 1p @'", "bash -c $'cat @'", 'sudo sort -o /tmp/x @', 'env FOO=1 grep ed @', 'command -v sed',
      'truncate -r @ /tmp/x', 'truncate --reference=@ /tmp/x', 'truncate --reference @ /tmp/x', 'truncate -r @ -s 0 /tmp/x', 'sudo --user bob cat @',
      'env -P /bin cat @', 'env -P /bin grep ed @', 'env --unset HOME grep ed @', 'nice --adjustment 5 cat @', 'stdbuf -oL grep x @', 'stdbuf -o L cat @', 'exec cat @', 'doas cat @', 'builtin command cat @',
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

// Every wrapper run-trace reads a test run behind is skipped here too: an editor behind it is refused.
{
  const traceSrc = fs.readFileSync(path.join(path.dirname(hookPath), 'run-trace.js'), 'utf8');
  const traceNames = /^const WRAPPERS = \/\^\(\?:([^)]*)\)\$\/;$/m.exec(traceSrc)[1].split('|').concat('timeout');
  assert.ok(traceNames.length >= 7, 'run-trace\'s list is read: ' + traceNames);
  for (const name of traceNames) {
    const cmd = name + ' perl -pi -e x ' + L;
    assert.equal(bash(cmd).block, true, 'an editor behind run-trace\'s wrapper is refused: ' + cmd);
  }
}
// The wrapper forms run-trace's write reader reads with their options (ADR 0160): an editor behind each is refused too.
for (const w of ['command -p', 'command --', 'sudo -E', 'sudo -u root', 'env -i', 'env -iu X', 'nice -n 5', 'exec -a x', 'nohup',
  'timeout -k 2 5s --', 'time -p', 'rtk proxy', 'sudo env -i nice']) {
  const cmd = w + ' perl -pi -e x ' + L;
  assert.equal(bash(cmd).block, true, 'an editor behind a wrapper with options is refused: ' + cmd);
}

// Fail-closed, pinned: the flag search covers every word after the first sed/perl, so a trailing `-i` on a
// grep of the word `sed` still blocks.
assert.equal(bash('grep sed ' + L + ' -i').block, true, 'a flag after the file blocks, fail-closed');

// The refusal names every ledger-writing verb in scope.js's usage text: every top-level verb there except the read-only ones.
{
  const READ_ONLY = new Set(['get', 'trace', 'status', 'publish', 'root', 'staging', 'dod-line', 'collisions', 'citations', 'test', 'fail-to-pass']);
  const scopeJs = path.join(path.dirname(hookPath), '..', 'scripts', 'scope.js');
  const help = cp.spawnSync(process.execPath, [scopeJs, '--help'], { encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(help, 'scope.js --help');
  const verbs = [...new Set(help.stdout.split('\n').map((l) => /^  ([a-z][a-z-]*)\b/.exec(l)).filter(Boolean).map((m) => m[1]))].filter((v) => !READ_ONLY.has(v));
  assert.ok(verbs.length >= 10, 'the usage text yields the ledger-writing verbs: ' + verbs);
  const { reason } = file(L);
  const named = /\(([^)]*) verbs\)/.exec(reason)[1].split('/');
  for (const v of verbs) assert.ok(named.includes(v), 'refusal names verb ' + v);
}

// The shared scanner (ADR 0135) reads the command: substitutions at any depth, separators inside them, nested `${…}`.
{
  const D = '/.superdev/scopes/x/ledger.md';
  for (const c of [
    'echo x > $(a $(b $(c d)))' + D,
    'tee $(echo a | tr a b)' + D,
    'cp new $(echo a; echo b)' + D,
    'cp new $(echo a && echo b)' + D,
    'echo x > ${X:-${Y:-a b}}' + D,
    'tee ${X:-${Y:-a b}}' + D,
    'install -m 644 new $(a $(b $(c d)))' + D,
    'sed -i s/a/b/ $(a $(b $(c d)))' + D,
  ]) assert.equal(bash(c).block, true, 'denied: ' + c);
  // A heredoc opener followed by a backslash-newline, and a mid-word `#`, leave the next line a command (#950, #954).
  assert.equal(bash('cat <<x\\\necho hi > .superdev/scopes/x/ledger.md').block, true, 'a heredoc opener with a backslash-newline: redirect denied');
  assert.equal(bash(": #'\ncp src .superdev/scopes/x/ledger.md\n'").block, true, 'a mid-word # opens no comment: cp denied');
  // Quoted text is read as a command line (INV-0141).
  assert.equal(bash('sh -c "echo x > .superdev/scopes/x/ledger.md"').block, true, 'sh -c redirect denied');
  assert.equal(bash("ssh host 'echo x > .superdev/scopes/x/ledger.md'").block, true, 'ssh host quoted redirect denied');
  assert.equal(bash('watch "tee .superdev/scopes/x/ledger.md"').block, true, 'watch quoted tee denied');
  assert.equal(bash("echo '$(perl -pi -e x .superdev/scopes/x/ledger.md)'").block, true, 'a quoted substitution is read as a command line');
  // A run-state path spelled with a doubled slash, a `.` segment, or a `<name>/..` segment is the same path (#1030).
  for (const c of ['cp a .superdev//scopes/x/ledger.md', 'cp a ./.superdev/./scopes/x/ledger.md', 'cp a .superdev/kb-pending/../scopes/x/ledger.md',
    'echo x > .superdev//scopes/x/trace.log', 'cp -r d/. .superdev//scopes/x/', 'echo "unterminated .superdev//scopes/x/ledger.md',
    'sh -c "cp a .superdev/./scopes/x/ledger.md; \'"', 'cp a .superdev/a/b/../../scopes/x/ledger.md']) {
    assert.equal(bash(c).block, true, 'a non-canonical run-state path denied: ' + c);
  }
  for (const c of ['cp a .superdev/scopes/../kb-pending/x.md', 'cp a ../../.superdev-other/scopes/x/ledger.md']) {
    assert.equal(bash(c).block, false, 'a path that leaves the run-state directory reads: ' + c);
  }
  // A backslash-escaped word is read as a command line, as its quoted spelling is (#1027).
  for (const c of ['dash -c cp\\ a\\ .superdev/scopes/x/ledger.md', 'eval cp\\ a\\ .superdev/scopes/x/ledger.md', 'dash -c cp\\ a\\ .superdev/scopes/x/trace.log']) {
    assert.equal(bash(c).block, true, 'an escaped write denied: ' + c);
  }
  assert.equal(bash('cat a\\ \\(1\\).txt .superdev/scopes/x/ledger.md').block, false, 'an escaped word that writes nothing reads');
  // An unreadable command is denied only when its text names a ledger path.
  assert.equal(bash('echo "unterminated .superdev/scopes/x/ledger.md').block, true, 'unreadable naming a ledger denied');
  assert.equal(bash('echo "unterminated').block, false, 'unreadable naming none allowed');
  assert.equal(bash('git status $(').block, false, 'unclosed substitution naming none allowed');
  assert.equal(bash('cat <<EOF\nno delimiter line').block, false, 'a heredoc with no delimiter line, naming none, allowed');
  assert.equal(bash('cat <<EOF\nrm .superdev/scopes/x/ledger.md').block, true, 'a heredoc with no delimiter line naming a ledger denied');
  // A text that reads as no command line is denied only when it names a ledger and holds a write form: prose naming a ledger passes.
  assert.equal(bash('sh -c "cp a .superdev/scopes/x/ledger.md; \'"').block, true, 'broken quoted text holding a write denied');
  assert.equal(bash('git commit -m "fix: don\'t rewrite .superdev/scopes/x/ledger.md by hand"').block, false, 'a commit message naming a ledger allowed');
  assert.equal(bash('tea issues create --body "The guard (ledger-guard) refuses writes to .superdev/scopes/x/ledger.md."').block, false, 'an issue body naming a ledger allowed');
  // Arithmetic `((…))` runs nothing in bash but nested subshells in dash: denied when the dash reading writes a ledger.
  assert.equal(bash('((cp a .superdev/scopes/x/ledger.md))').block, true, 'arithmetic command naming a ledger denied');
  assert.equal(bash('((sed -i x .superdev/scopes/x/ledger.md))').block, true, 'arithmetic sed -i naming a ledger denied');
  assert.equal(bash('echo $((1 + 2))').block, false, 'arithmetic naming none allowed');
  // `$[ … ]` is arithmetic too, and bash runs the substitutions it holds (`echo $[1+$(echo 2)]` prints 3).
  for (const c of ['echo $[1+$(cp a @)]', 'echo $[1+$(echo x > @)]', 'echo $[1+$(echo x | tee @)]', 'echo $[1+$(mv a @)]', 'echo $[1+$(truncate -s 0 @)]',
    'echo $[1+$(dd of=@)]', 'echo $[1+$(sort -o @ @)]', 'echo $[1+$(perl -pi -e x @)]', 'echo $[1+`cp a @`]']) {
    assert.equal(bash(c.replaceAll('@', '.superdev/scopes/x/ledger.md')).block, true, 'a ledger write inside $[…] denied: ' + c);
  }
  assert.equal(bash('echo $[1>2] .superdev/scopes/x/ledger.md').block, false, 'the `>` of $[…] is no redirect');
  // The dash reading spreads an escaped `\(\(` too, so the re-read text of an escaped word opens subshells (#1062).
  assert.equal(bash('dash -c \\(\\(cp\\ a\\ .superdev/scopes/x/ledger.md\\)\\)').block, true, 'an escaped (( write denied');
  // Every re-read level is read as dash reads it, so a `((` escaped for a second shell level opens subshells there too.
  assert.equal(bash('dash -c dash\\ -c\\ \\\\\\(\\\\\\(cp\\\\\\ a\\\\\\ .superdev/scopes/x/ledger.md\\\\\\)\\\\\\)').block, true, 'a (( write escaped for a second level denied');
  // A run of backslashes in quoted text is no re-read level.
  for (const c of ["grep -c '\\\\\\\\t' @", "grep -c '\\\\\\\\$' @", "grep -c '\\\\\\\\`' @"]) {
    assert.equal(bash(c.replaceAll('@', '.superdev/scopes/x/ledger.md')).block, false, 'a backslash run in a quoted pattern beside a ledger read allowed: ' + c);
  }
  assert.equal(bash('(( i++ )) ; cat .superdev/scopes/x/ledger.md').block, false, 'arithmetic beside a read allowed');
  // dash runs `((…))` as two nested subshells, so the guard reads a command twice: as written, and with every `((` that is no `$((` rewritten
  // to `( (`. A `((` that reads as no command (`grep "((" L`, prose in a quoted text) stays allowed; `$((1 + 2))` is untouched.
  for (const c of ['grep "((" @', 'grep -n "foo((" @', 'awk "/((/" @', 'echo "a (( b" ; cat @', 'echo $((1 + 2)) @', 'echo $(((1 + 2) * 3)) @', "grep '((' @",
    'git commit -m "fix ((x)) in @"', 'echo "((note)) about @"', 'gh pr create --body "uses (( in docs; reads @"', 'git commit -m "fix: don\'t rewrite @ by hand"']) {
    assert.equal(bash(c.replaceAll('@', '.superdev/scopes/x/ledger.md')).block, false, 'a read with a `((` that runs nothing allowed: ' + c);
  }
  // `echo sh "((cp a L))"` reads as the quoted text `cp a L`, a write, so it is denied (a known over-deny: echo only prints it). The rewrite
  // reads no shell name, so `echo sh -c "((x" ; cat L` reads only the redirect-free `cat`; the quoted `((x` reads as no command and holds no write form.
  assert.equal(bash('echo sh "((cp a .superdev/scopes/x/ledger.md))"').block, true, 'a quoted `((cp a L))` is read as the command it holds (known over-deny)');
  assert.equal(bash('echo sh -c "((x" ; cat .superdev/scopes/x/ledger.md').block, false, 'a quoted unclosed `((x` with a read of a ledger allowed');
  for (const c of ['dash -c "((cp a @))"', 'find . -exec dash -c "((cp a @))" \\;', 'find . -execdir dash -c "((cp a @))" \\;', 'arch -arm64 dash -c "((cp a @))"',
    'caffeinate -i dash -c "((cp a @))"', 'ionice dash -c "((cp a @))"', 'watch dash -c "((cp a @))"', 'parallel dash -c ::: "((cp a @))"',
    'busybox sh -c "((cp a @))"', 'rtk proxy dash -c "((cp a @))"',
    // The text of a quoted word is rewritten too, so a shell that runs it (eval, a pipe into a shell) is read as dash reads it.
    'eval "((cp a @))"', "eval '((cp a @))'", 'command eval "((cp a @))"', 'dash -c "eval \'((cp a @))\'"', 'eval "eval \'((cp a @))\'"', 'echo "((cp a @))" | dash',
    // A backslash-newline inside the quoted word joins a ledger path split across it: `\\` in double quotes is one backslash, so the evaluated text holds `\<NL>`.
    'eval "((cp a .superdev/scopes/x/ledger.m\\\\\nd))"', 'eval "((cp a .superdev/scopes/x/\\\\\nledger.md))"', 'echo "((cp a .superdev/scopes/x/ledger.m\\\\\nd))" | dash',
    // A text that passes through more than one shell is unescaped once per level: a doubled or tripled backslash inside nested quoting still names the ledger.
    'dash -c "cp a .superdev/scopes/x/led\\\\ger.md"', 'eval "cp a .superdev/scopes/x/led\\\\ger.md"', 'dash -c "((cp a .superdev/scopes/x/led\\\\ger.md))"',
    'eval "((cp a .superdev/scopes/x/led\\\\ger.md))"', 'dash -c "cp a .superdev/scopes/x/led\\\\\\ger.md"', 'dash -c "cp a .superdev/scopes/x/led\\\\\\\\ger.md"',
    'echo "((cp a .superdev/scopes/x/led\\\\ger.md))" | dash',
    '(( x )) && cp a @', 'true; ((cp a @))', 'if true; then ((cp a @)); fi', '{ ((sed -i x @)); }', '((cp a @', '(((cp a @)))',
    'echo hi\n((cp a @))', 'echo # "\n((cp a @))', 'echo "$(echo \'"\')"; ((cp a @))', 'case x in x) ((cp a @));; esac', 'echo x;;\n((cp a @))']) {
    assert.equal(bash(c.replaceAll('@', '.superdev/scopes/x/ledger.md')).block, true, 'a command dash runs that writes a ledger denied: ' + c);
  }
  // Accepted over-denies: an unreadable text naming a ledger is refused (fail closed), so a bash `for ((…))` loop and a mid-word unquoted `foo((`
  // that name a ledger are denied although both only read it.
  for (const c of ['for ((i=0;i<3;i++)); do cat @; done', 'grep -n foo(( @']) {
    assert.equal(bash(c.replaceAll('@', '.superdev/scopes/x/ledger.md')).block, true, 'known over-deny: ' + c);
  }
  // A failed quoted text naming a ledger is denied when it holds `patch` or a bare `>`, even in prose (WRITE_FORM boundary).
  assert.equal(bash('git commit -m "patch .superdev/scopes/x/ledger.md; \'"').block, true, 'a failed quoted text with `patch` denied');
  assert.equal(bash('git commit -m "a -> b in .superdev/scopes/x/ledger.md; \'"').block, true, 'a failed quoted text with a bare `>` denied');
  // A `$"…"` locale string is read as a double-quoted span.
  assert.equal(bash('bash -c $"perl -pi -e x .superdev/scopes/x/ledger.md"').block, true, 'a $"…" command string denied');
  // Substitutions in an unquoted heredoc body run.
  assert.equal(bash('cat <<EOF\n$(cp a .superdev/scopes/x/ledger.md)\nEOF').block, true, 'a substitution in an unquoted heredoc body denied');
  assert.equal(bash("cat <<'EOF'\n$(cp a .superdev/scopes/x/ledger.md)\nEOF").block, false, 'a quoted heredoc body is data');
  // A heredoc body a known shell reads on stdin is a command line (#1016), in every write form.
  {
    const LX = '.superdev/scopes/x/ledger.md';
    const writes = ['echo x > ' + LX, 'echo x >> ' + LX, 'cp a ' + LX, 'tee ' + LX + ' < a', 'sed -i s/a/b/ ' + LX, 'mv a ' + LX, 'truncate -s 0 ' + LX];
    const feeds = [(s) => 'bash <<E\n' + s + '\nE', (s) => "sh <<'E'\n" + s + '\nE', (s) => 'bash <<"E"\n' + s + '\nE', (s) => 'dash <<-E\n\t' + s + '\n\tE',
      (s) => 'bash << E\n' + s + '\nE', (s) => '/bin/zsh <<E\n' + s + '\nE', (s) => 'env ksh <<E\n' + s + '\nE', (s) => 'cat <<E | sh\n' + s + '\nE',
      (s) => 'bash -s <<E\n' + s + '\nE', (s) => 'sh /dev/stdin <<E\n' + s + '\nE', (s) => 'source /dev/stdin <<E\n' + s + '\nE',
      (s) => '. /dev/stdin <<E\n' + s + '\nE', (s) => 'eval "$(cat <<E\n' + s + '\nE\n)"', (s) => 'x=$(bash <<E\n' + s + '\nE\n)',
      (s) => 'cat <<A; bash <<B\ndata\nA\n' + s + '\nB',
      // A compound or grouped pipeline element feeds every later element.
      (s) => '{ cat <<E; } | sh\n' + s + '\nE', (s) => '{ cat <<E\n' + s + '\nE\n} | sh', (s) => 'if true; then cat <<E; fi | sh\n' + s + '\nE',
      (s) => 'for i in 1; do cat <<E; done | bash\n' + s + '\nE', (s) => 'cat <<E | (bash)\n' + s + '\nE', (s) => 'cat <<E | { bash; }\n' + s + '\nE',
      // A shell the line reaches indirectly: a function, an alias, xargs, or a descriptor a shell reads.
      (s) => 'f() { cat <<E; } ; f | sh\n' + s + '\nE', (s) => 'function f { cat <<E; }; f | sh\n' + s + '\nE', (s) => 'f() { sh; }; cat <<E | f\n' + s + '\nE',
      (s) => 'alias s=sh; cat <<E | s\n' + s + '\nE', (s) => 'cat <<E | xargs sh -c\n' + s + '\nE', (s) => 'cat <<E | xargs -I{} sh -c {}\n' + s + '\nE',
      (s) => 'exec 3<<E; sh <&3\n' + s + '\nE', (s) => 'sh /dev/fd/3 3<<E\n' + s + '\nE'];
    for (const w of writes) for (const f of feeds) assert.equal(bash(f(w)).block, true, 'a shell-fed heredoc write denied: ' + JSON.stringify(f(w)));
    // A shell the body reaches through a process substitution it is written into, a `$(cat)` command string, or a moved descriptor.
    for (const c of ['cat <<E > >(sh)', 'cat <<E >(sh)', 'cat <<E 1> >(bash)', 'cat <<E | tee >(sh)', 'cat <<E | sh -c "$(cat)"',
      'cat <<E | bash -c "$(cat)"', 'cat <<E | eval "$(cat)"', 'f() { eval "$(cat)"; }; cat <<E | f', 'exec 3<<E; sh <&3-']) {
      assert.equal(bash(c + '\ncp a ' + LX + '\nE').block, true, 'a heredoc body a shell reads is denied: ' + c);
    }
    // A heredoc body no shell reads is data, whatever run-state path it names, for the controller and a subagent alike.
    for (const c of ["cat > notes.md <<'E'", '{ cat <<E; } | grep x', 'f() { cat <<E; }; f | grep x', 'alias s=cat; cat <<E | s', 'cat <<E | xargs echo',
      'exec 3<<E; cat <&3', 'cat 3<<-E', 'git commit -F - <<E', "git commit -F - <<'E'", 'gh pr create --body-file - <<E',
      "node scope.js deferred add - --root /abs/.superdev/scopes/x <<'SUPERDEV_TEXT_EOF'"]) {
      const body = c.endsWith('SUPERDEV_TEXT_EOF\'') ? '\nfinding: a write to /abs/' + LX + ' is allowed\nSUPERDEV_TEXT_EOF' : '\ncp a ' + LX + '\nE';
      assert.equal(bash(c + body).block, false, 'a heredoc body no shell reads is data: ' + c);
      assert.equal(decide({ agent_id: 'a1', tool_input: { command: c + body } }).block, false, 'a heredoc body no shell reads is data, for a subagent: ' + c);
    }
    // Every quoted-heredoc shape the shipped prose prescribes passes with a body naming a ledger: scope.js's `-` verbs (review,
    // document, run-handoff.md, scope-mode.md), the tick's criterion and note files and a store's `title=$(cat <<…)` with a
    // `--description-file -` body (issue-tracker-*.md, code-management-forgejo.md), a progress-log append (slice-reviewer.md),
    // and a commit message.
    const S = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"';
    const B = "\nfix: a write to /abs/" + LX + " is denied, `$(x)`\nSUPERDEV_TEXT_EOF";
    for (const c of [S + " deferred add - --root /abs/.superdev/scopes/x <<'SUPERDEV_TEXT_EOF'" + B,
      "cat <<'SUPERDEV_TEXT_EOF' | " + S + ' unresolved add - --root /abs/.superdev/scopes/x' + B,
      S + " degraded add-denial - --root /abs/.superdev/scopes/x <<'SUPERDEV_TEXT_EOF'" + B,
      S + " degraded reset-denials - --root /abs/.superdev/scopes/x <<'SUPERDEV_TEXT_EOF'" + B,
      S + " deferred resolve - --root /abs/.superdev/scopes/x <<'SUPERDEV_TEXT_EOF'" + B,
      "cat > /tmp/match.txt <<'SUPERDEV_TEXT_EOF'" + B,
      "title=$(cat <<'SUPERDEV_TEXT_EOF'" + B + '\n)\ntea issues create -t "$title" --description-file - <<\'SUPERDEV_TEXT_EOF\'' + B,
      "tea pr create --base main --head feat/x --title \"$title\" --description-file - <<'SUPERDEV_TEXT_EOF'" + B,
      "cat >> /abs/.superdev/scopes/x/reports/02/progress.md <<'SUPERDEV_TEXT_EOF'" + B, "git commit -F - <<'SUPERDEV_TEXT_EOF'" + B]) {
      assert.equal(bash(c).block, false, 'a prescribed heredoc shape passes: ' + JSON.stringify(c));
      assert.equal(decide({ agent_id: 'a1', tool_input: { command: c } }).block, false, 'a prescribed heredoc shape passes, for a subagent: ' + JSON.stringify(c));
    }
  }
  // A here-string, and the text `echo` or `printf` writes, that a known shell reads on stdin is read as a command line.
  {
    const LX = '.superdev/scopes/x/ledger.md';
    for (const w of ['echo x > ' + LX, 'cp a ' + LX, 'tee ' + LX, 'sed -i s/a/b/ ' + LX]) {
      for (const c of ["bash <<<'" + w + "'", 'bash <<<"' + w + '"', 'bash <<< "' + w + '"', "sh <<<$'" + w + "'", 'cat <<<"' + w + '" | sh']) {
        assert.equal(bash(c).block, true, 'a here-string write denied: ' + c);
      }
    }
    for (const c of ['echo cp a ' + LX + ' | sh', "printf 'true\\ncp a " + LX + "' | sh", 'echo echo x \\> ' + LX + ' | sh', 'sh < <(echo echo x \\> ' + LX + ')',
      '{ echo cp a ' + LX + '; } | sh', 'echo cp a ' + LX + ' | (sh)']) {
      assert.equal(bash(c).block, true, 'echo or printf text a shell reads denied: ' + c);
    }
    assert.equal(bash('cat <<<"cp a ' + LX + '"').block, false, 'a here-string no shell reads is data');
    assert.equal(bash('echo cp a ' + LX).block, false, 'echo text no shell reads is data');
  }
  // Writers outside the in-place editors: vim scripts, curl and wget output, ditto, xxd, tar extraction, a recursive copy into a
  // run root, and an interpreter's inline script naming a ledger (fail closed: such a script that only reads is denied too).
  {
    const RR = '.superdev/scopes/x';
    for (const c of ['vim -es -c wq @', 'vi -e -s @', 'ex -s @', 'vim +wq @', 'vim -c wq @', 'nvim --headless -c wq @', 'curl -o @ https://x', 'curl --output @ https://x',
      'curl -sSLo @ https://x', 'curl -o@ https://x', 'curl --output=@ https://x', 'wget -O @ https://x', 'wget -qO @ https://x', 'wget -O@ https://x',
      'wget --output-document=@ https://x', 'wget --output-document @ https://x', 'ditto a @', 'xxd -r hex @', 'xxd -r - @', 'tar -xf a.tar -C ' + RR,
      'tar xf a.tar -C ' + RR + '/', 'tar -x -f a.tar --directory=' + RR, 'tar -xf a.tar --directory ' + RR, 'tar -xf a.tar @', 'cp -r d/. ' + RR + '/',
      'cp -R d/ ' + RR, 'cp -a d/. ' + RR + '/.', 'rsync -a d/ ' + RR + '/', 'ditto d ' + RR, 'python3 -c "open(\'@\',\'w\').write(\'x\')"',
      'python -c "open(\'@\',\'w\')"', 'node -e "require(\'fs\').writeFileSync(\'@\',\'x\')"', 'perl -e \'open(F,">@")\'', 'ruby -e \'File.write("@","x")\'',
      'python3 -c \'print(open("@").read())\'', 'python3 <<E\nopen("@","w").write("x")\nE', "node <<<'require(\"fs\").writeFileSync(\"@\",\"x\")'",
      'python3 - <<E\nopen("@","w")\nE', 'python3 -W ignore <<E\nopen("@","w")\nE', 'python3 -c "import sys; open(sys.stdin.read(),\'w\')" <<<@']) {
      assert.equal(bash(c.replace(/@/g, RR + '/ledger.md')).block, true, 'a writer denied: ' + JSON.stringify(c));
    }
    for (const c of ['curl -o /tmp/x https://x/@', 'wget -O /tmp/x https://x', 'tar -xf a.tar -C /tmp', 'cp -r d/. /tmp/', 'tar -cf /tmp/a.tar ' + RR,
      'cp -r ' + RR + ' /tmp/', 'python3 script.py', 'xxd @', 'xxd @ /tmp/x', 'vim --version', 'cat @',
      // An interpreter running a script file reads its stdin as data: the sanctioned `scope.js … -` write takes prose naming a ledger.
      "node scope.js deferred add - --root /r <<'E'\na write to @ is denied\nE", 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" dod-line - <<<"@"',
      'python3 tools/x.py <<E\n@\nE']) {
      assert.equal(bash(c.replace(/@/g, RR + '/ledger.md')).block, false, 'allowed: ' + JSON.stringify(c));
    }
    // A stdin operand (`-`, /dev/stdin, /dev/fd/0, /proc/self/fd/0) is no script file, and an option's value is no operand.
    const W = '<<E\nopen("/abs/@","w")\nE';
    for (const c of ['python3 /dev/stdin ' + W, 'node /dev/stdin ' + W, 'perl /dev/fd/0 ' + W, 'ruby /proc/self/fd/0 ' + W, 'node - ' + W,
      'node -r ./a.js ' + W, 'node --require ./a.js ' + W, 'node --require=./a.js ' + W, 'node --import ./a.mjs ' + W, 'node --loader ./l.mjs ' + W,
      'ruby -I ./lib ' + W, 'ruby -r ./a.rb ' + W, 'ruby -C ./d ' + W, 'ruby -wI ./lib ' + W, 'python3 -X a.b ' + W, 'python3 -W ignore::x.y ' + W,
      'python3 -bW ignore::x.y ' + W, 'python3 -m json.tool ' + W, 'perl -I ./lib ' + W, 'perl -M Foo::Bar ' + W, 'perl -m Foo::Bar ' + W, 'python3 -- /dev/stdin ' + W]) {
      assert.equal(bash(c.replace(/@/g, RR + '/ledger.md')).block, true, 'an interpreter reading its script from stdin denied: ' + JSON.stringify(c));
    }
    for (const c of ['node -r ./a.js scope.js deferred add - ' + W, 'ruby -I ./lib tools/x.rb ' + W, 'python3 -W ignore tools/x.py ' + W, 'perl -Ilib tools/x.pl ' + W]) {
      assert.equal(bash(c.replace(/@/g, RR + '/ledger.md')).block, false, 'a script file past option values reads stdin as data: ' + JSON.stringify(c));
    }
    // A text piped or fed to an interpreter that reads its script from stdin is judged by the interpreter rule: naming a ledger denies.
    // `@B` is the line's heredoc body, written after the line.
    const B = (line) => line.replace('@B', '<<E') + '\nopen("@","w")\nE';
    for (const c of [B('cat @B | python3'), B('cat @B | node -'), B('cat @B | perl /dev/stdin'), B('cat @B | ruby'),
      B('cat @B | python3 -c "import sys; exec(sys.stdin.read())"'), "echo \"open('@','w')\" | python3 -", "printf '%s' \"open('@','w')\" | node",
      "python3 <<<\"open('@','w')\"", 'cat <<<"open(\'@\',\'w\')" | python3', B('{ cat @B; } | python3'), B('cat @B | (python3)'),
      B('cat @B | env python3'), B('f() { python3; }; cat @B | f'), "sh -c 'cat <<E | python3\nopen(\"@\")\nE'"]) {
      assert.equal(bash(c.replace(/@/g, RR + '/ledger.md')).block, true, 'text fed to an interpreter reading stdin denied: ' + JSON.stringify(c));
    }
    for (const c of [B('cat @B | python3 tools/x.py'), B('cat @B | node scope.js deferred add - --root /r'), 'echo @ | node scope.js dod-line -',
      'cat <<E | python3\nprint(1)\nE', B('cat @B | grep open')]) {
      assert.equal(bash(c.replace(/@/g, RR + '/ledger.md')).block, false, 'text fed to a script file, or naming no ledger, allowed: ' + JSON.stringify(c));
    }
  }
  // Every command-position writer is read behind `rtk proxy`, as commandStart skips it.
  for (const c of ['rtk proxy cp a @', 'rtk proxy cp ledger.md .superdev/scopes/x/', 'rtk proxy cp -t .superdev/scopes/x ledger.md', 'rtk proxy install a @',
    'rtk proxy install -t .superdev/scopes/x ledger.md', 'rtk proxy ln -sf a @', 'rtk proxy rsync a @', 'rtk proxy patch @ p.diff', 'rtk proxy ex -s @',
    'rtk proxy mv a @', 'rtk proxy tee @']) {
    assert.equal(bash(c.replace('@', '.superdev/scopes/x/ledger.md')).block, true, 'a writer behind rtk proxy denied: ' + c);
  }
  // The wrappers arch, caffeinate, flock, chronic, unbuffer, ionice, and taskset run the command after their options.
  for (const c of ['arch -arm64 cp a @', 'arch -arch x86_64 tee @', 'caffeinate -t 5 cp a @', 'flock /tmp/l cp a @', 'flock -w 5 /tmp/l mv a @',
    'chronic cp a @', 'unbuffer -p tee @', 'ionice -c 3 cp a @', 'taskset -c 0 tee @', 'taskset 0x1 cp a @']) {
    assert.equal(bash(c.replace('@', '.superdev/scopes/x/ledger.md')).block, true, 'a write behind a wrapper denied: ' + c);
  }
  // `<>` opens its target for reading and writing, so it is a write: `cat <> L` is a known fail-closed false positive.
  {
    const LX = '.superdev/scopes/x/ledger.md';
    for (const c of ['echo x 1<> ' + LX, 'exec 3<> ' + LX + '; echo x >&3', 'exec 4<>' + LX, "bash -c 'echo x 1<>" + LX + "'", "echo 'exec 3<>" + LX + "' | sh",
      "eval 'exec 3<>" + LX + "'", 'x=$(exec 3<>' + LX + ')', "echo a | xargs sh -c 'exec 3<>" + LX + "'", 'rtk proxy cat 3<>' + LX, 'cat <> ' + LX]) {
      assert.equal(bash(c).block, true, 'a <> redirect denied: ' + c);
    }
  }
  // A quoted word's text past an unquoted `NAME=` or command-string option prefix is read as a command line.
  for (const c of ["export PROMPT_COMMAND='cp a .superdev/scopes/x/ledger.md'", "alias w='echo x > .superdev/scopes/x/ledger.md'"]) {
    assert.equal(bash(c).block, true, 'the text past the prefix is read: ' + c);
  }
  // An ANSI-C quoted text is decoded before it is read as a command line.
  for (const c of ["bash -c $'cp\\x20a\\x20.superdev/scopes/x/ledger.md'", "bash -c $'true\\ncp a .superdev/scopes/x/ledger.md'"]) {
    assert.equal(bash(c).block, true, 'an ANSI-C write is decoded: ' + c);
  }
  // Allowed: names no ledger.
  for (const c of ['echo x > $(a $(b $(c d)))/out', 'tee $(echo a | tr a b)/out', 'sh -c "echo x > /tmp/out"', 'cat <<x\\\necho hi > /tmp/out']) {
    assert.equal(bash(c).block, false, 'allowed: ' + c);
  }
}

// INV-0140: with the shared scanner unloadable, or throwing, a Bash call is denied and an Edit or Write call still decides alone.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-guard-'));
  const copy = path.join(dir, 'ledger-guard.js');
  fs.copyFileSync(hookPath, copy);
  const probe = (label, stub) => {
    const scanner = path.join(dir, 'shell-words.js');
    fs.rmSync(scanner, { force: true });
    if (stub !== null) fs.writeFileSync(scanner, stub);
    const run = (tool_input) => {
      const r = cp.spawnSync(process.execPath, [copy], { input: JSON.stringify({ tool_input }), encoding: 'utf8', timeout: 10000 });
      assertSpawnDecided(r, 'ledger-guard.js with ' + label);
      return r;
    };
    const denied = run({ command: 'echo hi' });
    assert.equal(denied.status, 2, 'a Bash call is denied with ' + label);
    assert.match(denied.stderr, /broken/, 'the denial names the broken install with ' + label);
    assert.equal(run({ file_path: 'src/index.js' }).status, 0, 'an Edit of a non-ledger path is allowed with ' + label);
    assert.equal(run({ file_path: L }).status, 2, 'an Edit of a ledger is still denied with ' + label);
  };
  probe('no shell-words.js', null);
  probe('a shell-words.js that throws on load', "throw new Error('boom');");
  probe('a scan that throws', "exports.scan = () => { throw new Error('boom'); };");
  fs.rmSync(dir, { recursive: true, force: true });
}

// Linear time (ADR 0086): a command four times as long takes about four times as long when linear and sixteen times when quadratic,
// against a baseline measured in the same run; the ceiling sits at nine, between them, so a memory knee or load noise in one reading
// stays below it. The size grows until one run takes about 25 ms, and timePair repeats each sample to that length too.
{
  const { timePair, cpuNs } = require('./linear-time');
  const once = (c) => {
    const t0 = cpuNs();
    bash(c);
    return cpuNs() - t0;
  };
  const quadruples = (label, make, cap) => {
    let n = 1500;
    while (n < cap && once(make(n)) < 25e6) n *= 2;
    const [base, big] = timePair(bash, make(n), make(n * 4));
    assert.ok(big < 9 * base, label + ' stays about linear: ' + base + 'ns at ' + n + ', four times the input ' + big + 'ns');
  };
  for (const unit of ['$(a ', '$(tee ', 'x=$(echo ']) {
    quadruples(unit, (n) => 'echo x > ' + unit.repeat(n) + ')'.repeat(n) + '/.superdev/scopes/x/ledger.md', 200000);
  }
  // An unclosed `((` run names a ledger once, and repeated `((` between statements, unquoted or in a quoted word, are rewritten and read once each.
  for (const make of [(n) => 'cat .superdev/scopes/x/ledger.md ' + '(('.repeat(n), (n) => 'cat .superdev/scopes/x/ledger.md ; ' + 'echo ((;'.repeat(n),
    (n) => 'cat .superdev/scopes/x/ledger.md ; ' + 'echo "((x))" ((y));'.repeat(n),
    // Many process substitutions of one shell command: its words are read once, not once per substitution.
    (n) => 'cat .superdev/scopes/x/ledger.md ; sh ' + '<(echo a) '.repeat(n), (n) => 'cat .superdev/scopes/x/ledger.md ; sh ' + '<(cat <<E\nx\nE\n) '.repeat(n)]) {
    quadruples(JSON.stringify(make(2)), make, 1e7);
  }
  quadruples('many backslash-escaped words', (n) => 'cat .superdev/scopes/x/ledger.md ; ' + 'echo a\\ cp\\ b ; '.repeat(n), 1e6);
  // A path of many `<name>/..` segments, and a long word beside a doubled slash, are collapsed in one pass each.
  quadruples('many dot-dot segments', (n) => 'cp a ' + 'x/'.repeat(n) + '../'.repeat(n) + '.superdev//scopes/x/ledger.md', 200000);
  quadruples('a long word beside a doubled slash', (n) => 'echo // ' + 'a'.repeat(n) + ' .superdev/scopes/', 1e7);
  // A word holding many run-state directory prefixes and no ledger name is tested for a ledger path once, not once per prefix.
  quadruples('a run of run-state prefixes', (n) => 'echo x > ' + '.superdev/scopes/'.repeat(n), 200000);
  // A line running a stdin interpreter is read once for the texts that feed it: many heredocs, many `echo` commands, many
  // interpreters, and an interpreter with many option values.
  for (const make of [(n) => 'python3 - ; ' + 'cat <<E\nx .superdev/scopes/x\nE\n'.repeat(n), (n) => 'python3 - ; ' + 'echo .superdev/scopes/x ; '.repeat(n),
    (n) => 'python3 -X a.b ; '.repeat(n) + 'cat <<E\n.superdev/scopes/x\nE', (n) => 'python3 ' + '-W x '.repeat(n) + '<<E\n.superdev/scopes/x\nE']) {
    quadruples(JSON.stringify(make(2)), make, 1e6);
  }
}

console.log('ledger-guard tests ok');
