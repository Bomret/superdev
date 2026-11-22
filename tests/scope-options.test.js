'use strict';

// Suite for the option reading of plugin/scripts/scope.js and the libs that parse their own arguments: a value-taking option refuses a
// missing value, another `--flag` in the value's place, and a repeat, naming the option (triage #343); `--root` passes through the Git Bash
// drive-path rule once (ADR 0150); `open --lock` takes lowercase hexadecimal (INV-0130); `source-set` takes at most one path (triage #253).
// In-process through `run`, except `open`, which runs the CLI over a real repository.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { call, scopePath, sliceJson } = require('./scope-setup');
const { assertSpawnDecided } = require('./spawn-verdict');

const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-options-')));
process.on('exit', () => fs.rmSync(T, { recursive: true, force: true }));
const real = path.join(T, 'real');
fs.mkdirSync(real);
fs.writeFileSync((fs.mkdirSync(path.join(real, '.superdev', 'scopes', 'x'), { recursive: true }), path.join(real, '.superdev', 'scopes', 'x', 'dod.md')), '- [ ] The fixture run is done\n');
assert.ok(call(['init', 'feat/x', 'planned'], sliceJson, real).ok, 'fixture run initialised');
const runRoot = path.join(real, '.superdev', 'scopes', 'x');

const refuses = (argv, option, why) => {
  const r = call(argv, '', real);
  assert.strictEqual(r.ok, false, `${why}: ${argv.join(' ')} refuses`);
  assert.ok(r.err.includes(option), `${why}: the refusal names ${option}: ${r.err}`);
  assert.strictEqual(r.err.split('\n').length, 1, `${why}: one line: ${r.err}`);
};

// #root-flag: a flag in `--root`'s place is no run, for the digest check and the verb alike.
{
  const r = call(['stage', '--root', '--tag', 'x'], '', real);
  assert.strictEqual(r.ok, false, 'stage --root --tag refuses');
  assert.ok(r.err.includes('--root'), `names --root: ${r.err}`);
  assert.ok(!r.err.includes('--tag"') && !/no run|ledger/.test(r.err), `reads no run named --tag: ${r.err}`);
  assert.ok(!fs.existsSync(path.join(real, '--tag')), 'nothing named --tag is created');
}

// #options: each listed option refuses a repeat and a flag in its value's place, naming it.
const R = ['--root', runRoot];
const cases = [
  [['stage', 'x'], '--root'],
  [['slice', '01', 'merged'], '--range'],
  [['reviewed', 'set'], '--branch'],
  [['reviewed', 'set', '--branch', 'b'], '--tip'],
  [['reviewed', 'check', '--branch', 'b'], '--base'],
  [['base', 'resolve', '--branch', 'b'], '--base'],
  [['deploy', 'set', 'a', 'b'], '--exit'],
  [['suite', 'reusable', '--branch', 'b'], '--base'],
  [['suite', 'reusable'], '--branch'],
  [['trace'], '--slice'],
  [['trace'], '--kind'],
  [['trace'], '--last'],
];
for (const [argv, option] of cases) {
  const base = argv.includes('--root') ? argv : [...argv, ...R];
  refuses([...base, option], option, 'missing value');
  refuses([...base, option, '--other'], option, 'flag as value');
  refuses([...base, option, 'v', option, 'w'], option, 'repeat');
}
refuses(['stage', 'x', '--root', runRoot, '--root', runRoot], '--root', 'repeat');
refuses(['stage', 'x', '--root'], '--root', 'missing value');

// Libs that parse their own arguments.
for (const option of ['--sha', '--root']) {
  refuses(['ci', '--sha', 'a', '--root', runRoot, option, 'z'], option, 'ci repeat');
  refuses(['ci', option], option, 'ci missing value');
  // A SHA may be option-shaped text that resolves to no commit (tests/scope-ci.test.js), so only the verb's own `--root` stands in its place.
  refuses(['ci', option, option === '--sha' ? '--root' : '--x'], option, 'ci flag as value');
}
for (const option of ['--match-file', '--verdict', '--note-file']) {
  const full = ['dod-line', '--match-file', 'a', '--verdict', 'met', '--note-file', 'b'];
  refuses([...full, option, 'c'], option, 'dod-line repeat');
  refuses(['dod-line', option, '--x'], option, 'dod-line flag as value');
}
refuses(['dod-tags', '--map-file', 'a', '--map-file', 'b'], '--map-file', 'dod-tags repeat');
refuses(['dod-tags', '--map-file'], '--map-file', 'dod-tags missing value');
refuses(['dod-open', ...R, '--tag', 'docs', '--tag', 'docs'], '--tag', 'dod-open repeat');
refuses(['dod-open', '--root', '--tag', 'docs'], '--root', 'dod-open flag as value');
refuses(['dod-open', ...R, '--root', runRoot], '--root', 'dod-open repeat');
for (const verb of ['untraced', 'fail-to-pass-check']) {
  for (const option of ['--root', '--slice']) {
    refuses([verb, '--root', runRoot, '--slice', '01', 'a..b', option, 'z'], option, `${verb} repeat`);
    refuses([verb, option, '--x'], option, `${verb} flag as value`);
  }
}
for (const option of ['--root', '--branch', '--base', '--ci-head', '--ci-file']) {
  refuses(['red-evidence', '--root', 'r', '--branch', 'b', '--base', 'c', '--ci-head', 'h', '--ci-file', 'f', option, 'z'], option, 'red-evidence repeat');
  refuses(['red-evidence', option, '--x'], option, 'red-evidence flag as value');
}
for (const option of ['--root', '--remote', '--base']) {
  refuses(['push', '--root', 'r', '--remote', 'o', '--base', 'm', option, 'z'], option, 'push repeat');
  // A remote or base may be option-shaped text that runs nothing (tests/scope-push.test.js), so only the verb's own options stand in a value's place.
  refuses(['push', option, option === '--root' ? '--remote' : '--root'], option, 'push flag as value');
}
// `--root` is a path, never free text: any option-shaped word in its place refuses, the verb's own options or not.
refuses(['push', '--root', '--tag', 'x', '--remote', 'o', '--base', 'm'], '--root', 'push root as unknown flag');
for (const option of ['--base', '--remote', '--lock']) {
  refuses(['open', 'feat/x', '--base', 'main', '--remote', 'o', '--lock', 'ab', option, 'cd'], option, 'open repeat');
  refuses(['open', 'feat/x', '--base', 'main', option, option === '--lock' ? '--remote' : '--lock'], option, 'open flag as value');
}
for (const option of ['--base', '--remote']) {
  refuses(['open', 'feat/x', '--base', 'main', option, '--tag'], option, 'open unknown flag as value');
}
refuses(['open', 'feat/x', '--base', 'main', '--lock', 'Session1'], '--lock', 'open uppercase nonce');
refuses(['open', 'feat/x', '--base', 'main', '--lock', 'ab\n'], '--lock', 'open newline nonce');

// #drive-path: with the platform overridden to win32 before a fresh require, `/c/…` reaches the run `C:/…` does. The `C:` entry under the
// process's working directory is a link to the directory holding the run, so the same text names the same directory both ways.
{
  fs.symlinkSync(real, path.join(T, 'C:'));
  const platformDesc = Object.getOwnPropertyDescriptor(process, 'platform');
  const cwdBefore = process.cwd();
  const logged = [];
  const origLog = console.log;
  const outcome = (run, argv) => {
    logged.length = 0;
    console.log = (s) => logged.push(String(s));
    try {
      run(argv, T, '');
      return { ok: true, out: logged.join('\n') };
    } catch (e) {
      if (!e.isRefusal) throw e;
      return { ok: false, out: e.message };
    } finally { console.log = origLog; }
  };
  const repo = path.join(real, 'repo');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: repo });
  process.chdir(T);
  Object.defineProperty(process, 'platform', { ...platformDesc, value: 'win32' });
  try {
    for (const p of [scopePath, require.resolve('../plugin/lib/options.js'), require.resolve('../plugin/lib/drive-path.js')]) delete require.cache[p];
    const { run } = require(scopePath);
    const rel = 'C:/.superdev/scopes/x';
    const msys = '/c/.superdev/scopes/x';
    for (const argv of [
      (r) => ['stage', 'set', 'implementing', '--root', r], // a writing verb, digest-checked
      (r) => ['state', '--root', r], // a reading verb
      (r) => ['dod-open', '--root', r], // a lib reader
      (r) => ['push', '--root', r, '--remote', 'origin', '--base', 'main'], // a verb that reads `--root` itself
      (r) => ['untraced', '--root', r, '--slice', '01', 'HEAD..HEAD'],
      (r) => ['fail-to-pass-check', '--root', r, '--slice', '01', 'HEAD..HEAD'],
    ]) {
      const a = outcome(run, argv(rel));
      const b = outcome(run, argv(msys));
      assert.strictEqual(b.ok, a.ok, `${argv(rel)[0]}: /c/ and C:/ agree: ${a.out} | ${b.out}`);
      assert.ok(!/no ledger|is not a directory|holds no ledger|carries no \*\*Branch/.test(b.out), `${argv(rel)[0]}: /c/ reaches the run: ${b.out}`);
    }
    // A real write under the `/c/` spelling reaches the same run.
    const written = outcome(run, ['stage', 'set', 'implementing', '--root', msys]);
    assert.strictEqual(written.ok, true, `stage set via /c/ succeeds: ${written.out}`);
    assert.match(fs.readFileSync(path.join(runRoot, 'ledger.md'), 'utf8'), /\*\*Stage:\*\* implementing/, 'the /c/ write reached the run');
    const ci = (r) => outcome(run, ['ci', '--sha', 'HEAD', '--root', r]);
    assert.strictEqual(ci('/c/repo').out, ci('C:/repo').out, 'ci: /c/ and C:/ name the same repository');
    assert.ok(/ci: cannot-judge [0-9a-f]{40}/.test(ci('/c/repo').out), `ci resolved HEAD in the repository: ${ci('/c/repo').out}`);
    // Not win32: the path is unchanged, so `/c/…` names no run.
    Object.defineProperty(process, 'platform', platformDesc);
    assert.strictEqual(outcome(run, ['state', '--root', msys]).ok, false, 'elsewhere /c/ stays /c/');
  } finally {
    Object.defineProperty(process, 'platform', platformDesc);
    process.chdir(cwdBefore);
  }
}

// #lock: `open` takes the lowercase hexadecimal nonce it prints, and refuses anything else before it writes `run.lock` (INV-0130).
{
  const D = fs.mkdtempSync(path.join(T, 'open-'));
  const repo = path.join(D, 'repo');
  fs.mkdirSync(repo);
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  const open = (...extra) => {
    const r = spawnSync(process.execPath, [scopePath, 'open', 'feat/lock-me', '--base', 'main', '--remote', 'none', ...extra], { cwd: repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
    assertSpawnDecided(r, 'scope.js open');
    return { status: r.status, out: r.stdout, err: r.stderr, word: r.stdout.split('\n')[0], nonce: (r.stdout.split('\n').find((l) => l.startsWith('lock ')) || '').slice(5) };
  };
  const lock = path.join(repo, '.superdev', 'scopes', 'lock-me', 'run.lock');
  const bad = open('--lock', 'Session1');
  assert.notStrictEqual(bad.status, 0, 'a non-hex nonce refuses');
  assert.ok(bad.err.includes('--lock'), `names --lock: ${bad.err}`);
  assert.ok(!fs.existsSync(lock), 'no run.lock is written');
  const upper = open('--lock', 'ABCDEF');
  assert.notStrictEqual(upper.status, 0, 'an uppercase-only nonce refuses');
  assert.ok(upper.err.includes('--lock'), `names --lock: ${upper.err}`);
  assert.ok(!fs.existsSync(lock), 'no run.lock is written for the uppercase nonce');
  const first = open();
  assert.strictEqual(first.status, 0, `first open: ${first.err}`);
  assert.match(first.nonce, /^[0-9a-f]+$/, 'the printed nonce is hexadecimal');
  assert.strictEqual(open('--lock', first.nonce).word, 'existing', 'a repeat with the printed nonce reads existing');
  const other = open('--lock', 'abc123');
  assert.strictEqual(other.word, 'locked', `a second session on a fresh lock reads locked: ${other.out}`);
  assert.strictEqual(fs.readFileSync(lock, 'utf8'), `plan ${first.nonce}\n`, 'the lock is unchanged');
}

// #source-set: a second path refuses with one line; one path and `--tests` keep their behavior.
{
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(T, 'ss-')));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  fs.mkdirSync(path.join(dir, 'a'));
  fs.mkdirSync(path.join(dir, 'b'));
  fs.writeFileSync(path.join(dir, 'a', 'x.js'), '1\n');
  fs.writeFileSync(path.join(dir, 'b', 'y.js'), '1\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'f'], { cwd: dir });
  const two = call(['source-set', 'a', 'b'], '', dir);
  assert.strictEqual(two.ok, false, 'two paths refuse');
  assert.ok(two.err.includes('source-set') && two.err.split('\n').length === 1, `one line: ${two.err}`);
  const one = call(['source-set', 'a'], '', dir);
  assert.ok(one.ok && one.out === 'a/x.js', `one path prints as before: ${one.out}`);
  assert.strictEqual(call(['source-set', '--tests', 'a'], '', dir).ok, false, '--tests still refuses a path');
}

process.exitCode = 0; // the in-process `ci` calls above set the verdict's exit status, which is no failure of this suite
console.log('scope-options: all checks passed');
