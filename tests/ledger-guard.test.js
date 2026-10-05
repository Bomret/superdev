'use strict';

// Suite for plugin/hooks/ledger-guard.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported decide() directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

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
// unterminated groups and long runs of them resolve without catastrophic backtracking (qualitative bound, ADR 0086)
{
  const t0 = Date.now();
  bash('> $('.repeat(5000));
  bash('cp ' + '$( '.repeat(5000));
  bash('> '.repeat(5001) + '`');
  bash('> '.repeat(5000) + '${');
  bash('cp ' + '${ '.repeat(5000));
  bash('tee ' + '${'.repeat(5000));
  bash('tee ' + '${'.repeat(20000));
  bash('>${ '.repeat(20000));
  bash('tee ' + '${"'.repeat(20000));
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 5000, 'substitution runs must resolve quickly, took ' + elapsed + 'ms');
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

// require.main guard: requiring this hook must never run main()'s stdin/decide dispatch, and
// spawning it directly (as Claude Code's hook invocation does) must still decide exactly as before
// the guard was added.
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

// argv[2] === '--selftest' is a global-process condition, not "this file was invoked directly": a
// parent process invoked as `node <parent>.js --selftest` that requires this hook must not run this
// hook's own selftest as a side effect (issue #442 finding 1). Guarded by an env marker so that, if
// the guard is broken, the recursively-triggered inner selftest doesn't spawn a further generation
// of itself — it proves the leak exactly once instead of nesting indefinitely.
if (!process.env.SUPERDEV_ARGV_GUARD_TEST) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-guard-argv-'));
  const wrapper = path.join(dir, 'req.js');
  fs.writeFileSync(wrapper, `require(${JSON.stringify(hookPath)});`);
  try {
    const outer = cp.spawnSync(process.execPath, [wrapper, '--selftest'], {
      encoding: 'utf8', timeout: 5000,
      env: Object.assign({}, process.env, { SUPERDEV_ARGV_GUARD_TEST: '1' }),
    });
    assertSpawnDecided(outer, 'a parent process requiring ledger-guard.js under --selftest');
    assert.equal(outer.status, 0, 'a parent whose own argv[2] is --selftest still exits cleanly when it requires ledger-guard.js');
    assert.equal(outer.stdout, '', "and never runs ledger-guard.js's own selftest as a side effect");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('ledger-guard tests ok');
