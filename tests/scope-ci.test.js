'use strict';

// Suite for plugin/scripts/scope.js's `ci` verb: a commit's check status, read as `name<TAB>state` lines on stdin, judged
// against the named checks of the `## CI` section of `docs/agents/verification.md` at that commit (ADR 0255, INV-0191).
// The verb only reads, so every case shares one repository, built once, with one commit per `verification.md` text.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { run, scopePath, verif } = require('./scope-setup');
const { verificationCommandsOf } = require('../plugin/lib/verification.js');

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-ci-')));
const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
g('init', '-q', '-b', 'main');
g('config', 'user.email', 'test@example.com');
g('config', 'user.name', 'test');
// One commit per `verification.md` text (null: no file at that commit); returns its full SHA.
const commitWith = (text) => {
  const file = path.join(dir, 'docs', 'agents', 'verification.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (text === null) fs.rmSync(file, { force: true });
  else fs.writeFileSync(file, text);
  g('add', '-A');
  g('commit', '-q', '--allow-empty', '-m', 'c');
  return g('rev-parse', 'HEAD');
};

const CI = (body) => verif('node t.js', 'node t.js --related {paths}', `\n## CI\n\n${body}\n`);
const named = commitWith(CI('- `test (ubuntu)`\n- `lint`'));
const twice = commitWith(CI('- `lint`\n- `lint`\r\n- `test (ubuntu)`').replace(/\n/g, '\r\n'));
const noneSha = commitWith(CI('`none`'));
const bareNone = commitWith(CI('none'));
const both = commitWith(CI('none\n\n- `lint`'));
const noSection = commitWith(verif('node t.js'));
const noFile = commitWith(null);
const fenced = commitWith(CI('- `lint`\n\n```sh\nnode evil.js\n```'));

// The verb in-process: its stdout lines and the exit code it set.
const ci = (sha, input, extra = []) => {
  const logged = [];
  const orig = console.log;
  console.log = (s) => logged.push(String(s));
  process.exitCode = undefined;
  try {
    run(['ci', ...(sha ? ['--sha', sha] : []), ...extra], dir, input);
    return { ok: true, code: process.exitCode || 0, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, code: e.exitCode || 1, err: e.message };
    throw e;
  } finally {
    console.log = orig;
    process.exitCode = undefined;
  }
};

const lines = (...pairs) => pairs.map((p) => p.join('\t')).join('\n') + '\n';

try {
  // Every named check has only success lines: green, exit 0, and nothing named as missing.
  {
    const r = ci(named, lines(['lint', 'success'], ['test (ubuntu)', 'success'], ['test (ubuntu)', 'success']));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^ci: green /);
    assert.doesNotMatch(r.out, /pending|missing/);
  }

  // One success and one failure for a name judge failed (exit 4), naming the check and its state.
  {
    const r = ci(named, lines(['lint', 'success'], ['lint', 'failure'], ['test (ubuntu)', 'success']));
    assert.equal(r.code, 4, r.out);
    assert.match(r.out, /^ci: failed /);
    assert.match(r.out, /^failed\tlint\tfailure$/m);
  }

  // Every failing state judges failed.
  for (const state of ['failure', 'error', 'timed_out', 'cancelled', 'action_required', 'startup_failure']) {
    const r = ci(named, lines(['lint', state], ['test (ubuntu)', 'success']));
    assert.equal(r.code, 4, state + ': ' + r.out);
  }

  // One success and one in_progress judge pending (exit 3).
  {
    const r = ci(named, lines(['lint', 'success'], ['lint', 'in_progress'], ['test (ubuntu)', 'success']));
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /^ci: not-green /);
    assert.match(r.out, /^pending\tlint\tin_progress$/m);
  }

  // A named check with no line judges pending, named as missing.
  {
    const r = ci(named, lines(['lint', 'success']));
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /^pending\ttest \(ubuntu\)\tmissing$/m);
  }

  // skipped, neutral, stale, and warning judge finished-not-green, named apart from pending.
  for (const state of ['skipped', 'neutral', 'stale', 'warning']) {
    const r = ci(named, lines(['lint', state], ['test (ubuntu)', 'queued']));
    assert.equal(r.code, 3, state + ': ' + r.out);
    assert.match(r.out, new RegExp(`^finished\\tlint\\t${state}$`, 'm'));
    assert.match(r.out, /^pending\ttest \(ubuntu\)\tqueued$/m);
  }

  // A link in a third field is printed beside a failed check.
  {
    const r = ci(named, 'lint\tfailure\thttps://ci.example/1\ntest (ubuntu)\tsuccess\n');
    assert.match(r.out, /^failed\tlint\tfailure\thttps:\/\/ci\.example\/1$/m);
  }

  // Lines for unlisted names change no verdict; a line without a TAB is no match.
  {
    const r = ci(named, lines(['lint', 'success'], ['test (ubuntu)', 'success'], ['deploy', 'failure']) + 'lint failure\n');
    assert.equal(r.code, 0, r.out);
  }

  // A CRLF input and a duplicated name in a CRLF section judge the same as clean input.
  {
    const r = ci(twice, 'lint\tsuccess\r\ntest (ubuntu)\tsuccess\r\n');
    assert.equal(r.code, 0, r.out);
    const p = ci(twice, 'lint\tsuccess\r\n');
    assert.equal(p.code, 3, p.out);
    assert.equal(p.out.split('\n').filter((l) => l.startsWith('pending')).length, 1, p.out);
  }

  // Empty stdin with named checks judges pending.
  {
    const r = ci(named, '');
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /^pending\tlint\tmissing$/m);
  }

  // Cannot judge (exit 2), never pending or green: an unresolvable SHA, `none` (span or bare word), no section, no file,
  // and a section holding both `none` and a name.
  for (const [label, sha] of [['unresolvable', 'deadbeef'.repeat(5)], ['none span', noneSha], ['bare none', bareNone], ['no section', noSection], ['no file', noFile], ['none and a name', both]]) {
    const r = ci(sha, lines(['lint', 'success'], ['test (ubuntu)', 'success']));
    assert.equal(r.code, 2, label + ': ' + JSON.stringify(r));
    assert.match(r.out, /^ci: cannot-judge /, label);
  }

  // A fenced block inside `## CI` leaves the full and focused commands unchanged, and names no check.
  {
    const raw = execFileSync('git', ['show', `${fenced}:docs/agents/verification.md`], { cwd: dir, encoding: 'utf8' });
    assert.deepEqual(verificationCommandsOf(raw), { full: 'node t.js', focused: 'node t.js --related {paths}', whole: null });
    const first = raw.replace(/```sh\nnode t\.js --related \{paths\}\n```\n/, '');
    assert.equal(verificationCommandsOf(first).focused, null, 'the CI fence never becomes the focused command');
    assert.equal(ci(fenced, lines(['lint', 'success'])).code, 0);
  }

  // Usage: no --sha refuses.
  {
    const r = ci(null, '');
    assert.equal(r.ok, false);
    assert.match(r.err, /--sha/);
  }

  // `--root` names the repository to read; an MSYS-shaped path is accepted the way the other verbs accept one.
  {
    const r = ci(named, lines(['lint', 'success'], ['test (ubuntu)', 'success']), ['--root', dir]);
    assert.equal(r.code, 0, r.out);
  }

  // The verb leaves a run's ledger byte-identical, and through the real CLI reads its stdin and sets its exit status.
  {
    const root = path.join(dir, '.superdev', 'scopes', 's');
    fs.mkdirSync(root, { recursive: true });
    const ledger = path.join(root, 'ledger.md');
    fs.writeFileSync(ledger, '# Ledger\n\n**Stage:** implementing\n');
    const before = fs.readFileSync(ledger);
    const res = spawnSync(process.execPath, [scopePath, 'ci', '--sha', named, '--root', root], { cwd: dir, encoding: 'utf8', timeout: 30000, input: lines(['lint', 'failure'], ['test (ubuntu)', 'success']) });
    assertSpawnDecided(res, 'ci');
    assert.equal(res.status, 4, res.stderr);
    assert.ok(before.equals(fs.readFileSync(ledger)));
    assert.ok(!fs.existsSync(path.join(root, 'trace.log')));
  }

  console.log('scope-ci: ok');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
