'use strict';

// Suite for plugin/hooks/test-guard.js (ADR 0181, INV-0174): a dispatched implementer's Bash call that runs the full or the
// whole-repo suite is refused, through `scope.js test` or directly, and so is a `test focused` where the focused command repeats
// the full one. Every other caller, and every call the guard cannot judge, passes.

const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { assertSpawnDecided } = require('./spawn-verdict');

const pluginRoot = path.resolve(__dirname, '..', 'plugin');
const hookPath = path.join(pluginRoot, 'hooks', 'test-guard.js');
const hooksJson = require(path.join(pluginRoot, 'hooks', 'hooks.json'));
const { decide } = require(hookPath);

const SCOPE = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"';

// A run root holding a ledger and one slicetree whose `docs/agents/verification.md` carries the given fences. The fixture is
// removed when the suite exits, pass or fail.
function fixture({ full = 'npm test', focused = 'npm test -- --related {paths}', whole = null } = {}) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'test-guard-')));
  process.on('exit', () => fs.rmSync(base, { recursive: true, force: true }));
  const runRoot = path.join(base, 'main', '.superdev', 'scopes', 's');
  const slicetree = path.join(runRoot, 'slicetrees', '01');
  fs.mkdirSync(path.join(slicetree, 'docs', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(slicetree, 'tests'));
  fs.writeFileSync(path.join(slicetree, 'tests', 'a.test.js'), '');
  fs.writeFileSync(path.join(runRoot, 'ledger.md'), '# Scope\n');
  const fence = (c) => '```sh\n' + c + '\n```\n\n';
  const wholeSection = whole ? `## Whole-repo command\n\n\`${whole}\`\n` : '';
  fs.writeFileSync(path.join(slicetree, 'docs', 'agents', 'verification.md'), `# Verification\n\n${fence(full)}${fence(focused)}${wholeSection}`);
  return { base, runRoot, slicetree };
}

const call = (command, cwd, agentType = 'superdev:implementer') => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  agent_id: 'a1',
  agent_type: agentType,
  session_id: 's',
  cwd,
  tool_input: { command },
});

const denied = (command, cwd, agentType) => decide(call(command, cwd, agentType)).block;

// --- the four refused shapes ---
{
  const { slicetree } = fixture({ whole: 'npm run test:all' });
  assert.strictEqual(denied(`${SCOPE} test full`, slicetree), true, 'test full is refused');
  assert.strictEqual(denied(`${SCOPE} test whole`, slicetree), true, 'test whole is refused');
  assert.strictEqual(denied(`${SCOPE} test focused`, slicetree), true, 'test focused with no path is refused');
  assert.strictEqual(denied(`${SCOPE} test focused 2>&1 | tail -20`, slicetree), true, 'a piped test focused with no path is refused');
  assert.strictEqual(denied('npm test', slicetree), true, 'the full command run directly is refused');
  assert.strictEqual(denied('cd . && npm test 2>&1 | tail -5', slicetree), true, 'a wrapped direct full run is refused');
  assert.strictEqual(denied('npm run test:all', slicetree), true, 'the whole-repo command run directly is refused');
  assert.strictEqual(denied(`${SCOPE} test -- npm test`, slicetree), true, 'the full command through test -- is refused');
  assert.strictEqual(denied(`${SCOPE} fail-to-pass abc..def -- npm test`, slicetree), true, 'the full command through fail-to-pass is refused');
  assert.strictEqual(denied(`${SCOPE} fail-to-pass abc..def -- 'npm test' 2>&1 | tail -5`, slicetree), true, 'a quoted, piped full command through fail-to-pass is refused');
  assert.strictEqual(denied(`${SCOPE} fail-to-pass abc..def -- npm run test:all`, slicetree), true, 'the whole-repo command through fail-to-pass is refused');
  const { reason } = decide(call(`${SCOPE} test full`, slicetree));
  assert.match(reason, /test focused <paths>/, 'the refusal names the run to make instead');
  assert.match(reason, /controller/, 'the refusal names who owns the full-suite run');
}

// --- a scope.js path held in a variable is the script, for `scope.js test` and `scope.js fail-to-pass` alike ---
{
  const { slicetree } = fixture({ whole: 'npm run test:all' });
  const S = 'S=/p/superdev/scripts/scope.js';
  for (const use of ['node $S', 'node "$S"', 'node ${S}']) {
    assert.strictEqual(denied(`${S}; ${use} test full`, slicetree), true, `${use} test full is refused`);
    assert.strictEqual(denied(`${S}; ${use} test whole`, slicetree), true, `${use} test whole is refused`);
    assert.strictEqual(denied(`${S}; ${use} test focused`, slicetree), true, `${use} test focused with no path is refused`);
    assert.strictEqual(denied(`${S}; ${use} test -- npm test`, slicetree), true, `${use} test -- with the full command is refused`);
    assert.strictEqual(denied(`${S}; ${use} fail-to-pass abc..def -- npm test`, slicetree), true, `${use} fail-to-pass over the full command is refused`);
    assert.strictEqual(denied(`${S}; ${use} test -- node tests/a.test.js`, slicetree), false, `${use} test -- over a test file passes`);
    assert.strictEqual(denied(`${S}; ${use} fail-to-pass abc..def -- node tests/a.test.js`, slicetree), false, `${use} fail-to-pass over a test file passes`);
  }
  assert.strictEqual(denied(`export ${S} && node "$S" test full`, slicetree), true, 'an exported variable names the script');
  assert.strictEqual(denied('S=/p/other.js; node $S test full', slicetree), false, 'a variable naming another script is no scope.js call');
  assert.strictEqual(denied('S=/p/other.js; node $S fail-to-pass abc..def -- npm test', slicetree), false, 'a variable naming another script is no fail-to-pass call');
  assert.strictEqual(denied('node $S test full', slicetree), false, 'a variable no segment assigned is no scope.js call');
  assert.strictEqual(denied(`node $S test full; ${S}`, slicetree), false, 'an assignment after the use does not name the script');
  assert.strictEqual(denied(`${S}; S=/p/other.js; node $S test full`, slicetree), false, 'a variable reassigned to another script is no scope.js call');
  assert.strictEqual(denied(`S=/p/other.js; ${S}; node $S test full`, slicetree), true, 'the last assignment decides');
}

// --- a focused command that repeats the full one ---
{
  const { slicetree } = fixture({ full: 'go test ./...', focused: 'go test ./...' });
  assert.strictEqual(denied(`${SCOPE} test focused tests/a.test.js`, slicetree), true, 'test focused with a path is refused where it repeats full');
  const { reason } = decide(call(`${SCOPE} test focused tests/a.test.js`, slicetree));
  assert.match(reason, /test -- <command>/, 'the refusal names the one-file run');
  assert.strictEqual(denied('go test ./...', slicetree), true, 'the repeated command run directly is refused');
  assert.strictEqual(denied(`${SCOPE} test -- go test ./internal/a`, slicetree), false, 'a one-package run through test -- passes');
}

// --- the implementer's own runs pass ---
{
  const { slicetree } = fixture();
  assert.strictEqual(denied(`${SCOPE} test focused tests/a.test.js`, slicetree), false, 'test focused with a path passes');
  assert.strictEqual(denied(`${SCOPE} test focused $(git diff --name-only HEAD)`, slicetree), false, 'test focused with a substituted path list passes');
  assert.strictEqual(denied('npm test -- --related tests/a.test.js', slicetree), false, 'a direct focused run passes');
  assert.strictEqual(denied(`${SCOPE} test -- node tests/a.test.js`, slicetree), false, 'a one-file run through test -- passes');
  assert.strictEqual(denied(`${SCOPE} fail-to-pass abc..def -- node tests/a.test.js`, slicetree), false, 'a fail-to-pass run over a test file passes');
  assert.strictEqual(denied('git status && ls', slicetree), false, 'a command that runs no test passes');
  assert.strictEqual(denied('grep -n "npm test" README.md', slicetree), false, 'a command naming the full command as text passes');
}

// --- a run verb with no command to judge fails open ---
{
  const { slicetree } = fixture();
  assert.strictEqual(denied(`${SCOPE} test --`, slicetree), false, 'test -- with nothing after the -- passes');
  assert.strictEqual(denied(`${SCOPE} fail-to-pass abc..def --`, slicetree), false, 'fail-to-pass with nothing after the -- passes');
  assert.strictEqual(denied(`${SCOPE} fail-to-pass abc..def`, slicetree), false, 'fail-to-pass with no -- passes');
}

// --- every other caller, and every call the guard cannot judge, passes ---
{
  const { slicetree, base } = fixture();
  assert.strictEqual(decide({ ...call(`${SCOPE} test full`, slicetree), agent_type: undefined }).block, false, 'the controller passes');
  assert.strictEqual(denied(`${SCOPE} test full`, slicetree, 'superdev:slice-reviewer'), false, 'another agent passes');
  assert.strictEqual(denied(`${SCOPE} test full`, base), false, 'a call outside every run tree passes');
  assert.strictEqual(decide(null).block, false, 'no input passes');
  assert.strictEqual(decide({ agent_type: 'superdev:implementer', tool_input: {} }).block, false, 'no command passes');
  assert.strictEqual(decide({ agent_type: 'superdev:implementer', tool_input: { command: 42 }, cwd: slicetree }).block, false, 'a non-string command passes');
}

// --- a verification.md with no focused fence leaves nothing to compare ---
{
  const { slicetree } = fixture();
  fs.writeFileSync(path.join(slicetree, 'docs', 'agents', 'verification.md'), '# Verification\n\n```sh\nnpm test\n```\n');
  assert.strictEqual(denied(`${SCOPE} test focused tests/a.test.js`, slicetree), false, 'test focused with a path passes with one fence');
  assert.strictEqual(denied(`${SCOPE} test full`, slicetree), true, 'test full is still refused with one fence');
}

// --- the hook as Claude Code runs it: registered for Bash, exit 2 with the reason on a refusal, exit 0 otherwise ---
{
  const groups = hooksJson.hooks.PreToolUse.filter((g) => new RegExp(`^(?:${g.matcher})$`).test('Bash'));
  assert.ok(groups.some((g) => g.hooks.some((h) => /hooks\/test-guard\.js"?$/.test(h.command))), 'hooks.json registers test-guard for Bash');
  const { slicetree } = fixture();
  const run = (input) => {
    const r = cp.spawnSync(process.execPath, [hookPath], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', timeout: 20000 });
    assertSpawnDecided(r, 'test-guard');
    return r;
  };
  const refused = run(call(`${SCOPE} test full`, slicetree));
  assert.strictEqual(refused.status, 2, 'a refusal exits 2');
  assert.match(refused.stderr, /^superdev: refused/, 'the refusal reaches stderr');
  assert.strictEqual(run(call(`${SCOPE} test focused tests/a.test.js`, slicetree)).status, 0, 'a passing call exits 0');
  assert.strictEqual(run('not json').status, 0, 'unreadable input exits 0');
}

// --- a library that will not load leaves every call passing ---
{
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'test-guard-nolib-')));
  process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'hooks'));
  fs.mkdirSync(path.join(tmp, 'lib'));
  fs.copyFileSync(hookPath, path.join(tmp, 'hooks', 'test-guard.js'));
  fs.writeFileSync(path.join(tmp, 'lib', 'test-runs.js'), "throw new Error('broken');\n");
  const { slicetree } = fixture();
  const r = cp.spawnSync(process.execPath, [path.join(tmp, 'hooks', 'test-guard.js')], {
    input: JSON.stringify(call(`${SCOPE} test full`, slicetree)), encoding: 'utf8', timeout: 20000,
  });
  assertSpawnDecided(r, 'test-guard without its library');
  assert.strictEqual(r.status, 0, 'a missing library lets the call pass');
}

console.log('test-guard: ok');
