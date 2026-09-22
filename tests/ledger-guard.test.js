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
// Codex's apply_patch tool shares the Bash shape's `tool_input.command` field, but carries the
// patch envelope text instead of a shell command — tool_name: 'apply_patch' is what disambiguates
// the two (verified 2026-09-22 against https://learn.chatgpt.com/docs/hooks: "tool_name: canonical
// tool name (e.g. 'Bash' or 'apply_patch')", "Bash and apply_patch use tool_input.command").
const applyPatch = (command) => decide({ tool_name: 'apply_patch', tool_input: { command } });
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

// Codex's apply_patch shape: tool_input.command carries the patch envelope text, never a shell
// command — target paths come from its own `*** Add File:` / `*** Update File:` / `*** Delete
// File:` / `*** Move to:` headers (verified 2026-09-22 against the apply_patch grammar at
// https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/assets/tools/apply_patch.lark,
// which names these four headers; it leaves the filename rule as a bare `/(.+)/`, so it does not
// itself settle whether a target path is relative or absolute).
assert.equal(applyPatch(`*** Begin Patch\n*** Update File: ${L}\n@@\n-old\n+new\n*** End Patch\n`).block, true, 'apply_patch updating the ledger denied');
assert.equal(applyPatch(`*** Begin Patch\n*** Add File: ${L}\n+line\n*** End Patch\n`).block, true, 'apply_patch adding the ledger denied');
assert.equal(applyPatch(`*** Begin Patch\n*** Delete File: ${L}\n*** End Patch\n`).block, true, 'apply_patch deleting the ledger denied');
assert.equal(applyPatch('*** Begin Patch\n*** Update File: notes.md\n*** Move to: ' + L + '\n@@\n-a\n+b\n*** End Patch\n').block, true, 'apply_patch moving a file onto the ledger denied');
assert.ok(/scope\.js/.test(applyPatch(`*** Begin Patch\n*** Update File: ${L}\n@@\n-old\n+new\n*** End Patch\n`).reason), 'apply_patch denial names scope.js');
assert.equal(applyPatch('*** Begin Patch\n*** Update File: .superdev/scopes/demo/dod.md\n@@\n-a\n+b\n*** End Patch\n').block, false, 'apply_patch touching dod.md passes');
assert.equal(applyPatch('*** Begin Patch\n*** Add File: run.lock\n+lock\n*** End Patch\n').block, false, 'apply_patch touching run.lock passes');
assert.equal(applyPatch('*** Begin Patch\n*** Update File: .superdev/brainstorm/notes.md\n@@\n-a\n+b\n*** End Patch\n').block, false, 'apply_patch touching a brainstorm file passes');

// A header target is a whole shell/patch word too: trailing whitespace, a tab, or a trailing \r
// from a CRLF envelope must not let the path dodge the `ledger.md$` suffix test.
assert.equal(applyPatch(`*** Begin Patch\n*** Update File: ${L}  \n@@\n-old\n+new\n*** End Patch\n`).block, true, 'apply_patch target with trailing spaces still denied');
assert.equal(applyPatch(`*** Begin Patch\r\n*** Update File: ${L}\r\n@@\r\n-old\r\n+new\r\n*** End Patch\r\n`).block, true, 'apply_patch target on a CRLF envelope still denied');
assert.equal(applyPatch(`*** Begin Patch\n*** Update File: ${L}\t\n@@\n-old\n+new\n*** End Patch\n`).block, true, 'apply_patch target with a trailing tab still denied');

// A multi-file envelope: only one header among several names the ledger — the scan must not stop
// at (or be fooled by) the other, unrelated headers.
assert.equal(applyPatch(`*** Begin Patch\n*** Add File: a.txt\n+x\n*** Update File: ${L}\n@@\n-old\n+new\n*** Delete File: b.txt\n*** End Patch\n`).block, true, 'multi-file envelope with the ledger among unrelated files still denied');

// A `*** Move to:` target buried between unrelated hunks, before and after — proves the loop scans
// every header rather than returning on the first.
assert.equal(applyPatch(`*** Begin Patch\n*** Update File: unrelated1.md\n@@\n-a\n+b\n*** Update File: notes.md\n*** Move to: ${L}\n@@\n-a\n+b\n*** Update File: unrelated2.md\n@@\n-c\n+d\n*** End Patch\n`).block, true, 'a Move to target sandwiched between unrelated hunks still denied');

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
