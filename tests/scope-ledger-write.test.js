'use strict';

// Suite for how the ledger writers write (INV-0202, INV-0117): two verbs changing one ledger at once each land their change, a verb
// never waits on its own lock, and a write that fails leaves the previous file and no temporary file. Real processes throughout.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { scopePath, sliceJson, writeDod } = require('./scope-setup');
const { assertSpawnDecided } = require('./spawn-verdict');

const digestPath = require.resolve('../plugin/lib/run-digest.js');
const made = [];
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-ledger-write-'));
  made.push(cwd);
  const root = path.join(cwd, '.superdev', 'scopes', 'demo');
  writeDod(root);
  const f = { cwd, root };
  const r = sc(f, ['init', 'feat/demo', 'implementing'], sliceJson);
  assert.strictEqual(r.status, 0, 'init: ' + r.stderr);
  return f;
}

function sc(f, argv, input = '') {
  const r = spawnSync(process.execPath, [scopePath, ...argv], { cwd: f.cwd, input, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
  assertSpawnDecided(r, 'scope.js ' + argv[0]);
  return r;
}

// Runs each argv in its own process at once and resolves with every result.
function together(f, argvs) {
  return Promise.all(argvs.map((argv) => new Promise((resolve) => {
    const p = spawn(process.execPath, [scopePath, ...argv], { cwd: f.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d; });
    const guard = setTimeout(() => p.kill('SIGKILL'), 120000);
    p.on('exit', (status, signal) => { clearTimeout(guard); resolve({ status, signal, stderr }); });
  })));
}

// Orders a race between two scope.js processes with a preload this function writes into `cwd` and loads into the two children
// alone. The first stops at `pause`: `read`, right after it reads the ledger text, or `absent`, right after it finds no ledger.
// The second then runs until it exits or finds the run's lock held, and only then does the first go on. Resolves with both results.
async function ordered(cwd, pause, firstArgv, firstInput, secondArgv, secondInput = '') {
  const paused = path.join(cwd, 'order-paused');
  const go = path.join(cwd, 'order-go');
  const blocked = path.join(cwd, 'order-blocked');
  const preload = path.join(cwd, 'order.js');
  fs.writeFileSync(preload, `const fs = require('fs'); const role = process.env.ORDER_ROLE;
const readFileSync = fs.readFileSync; const existsSync = fs.existsSync; const openSync = fs.openSync;
const nap = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
const hold = () => {
  if (existsSync(${JSON.stringify(paused)})) return;
  fs.writeFileSync(${JSON.stringify(paused)}, '');
  while (!existsSync(${JSON.stringify(go)})) nap();
};
if (role === 'read') fs.readFileSync = function (file, enc) {
  const out = readFileSync.apply(fs, arguments);
  if (String(file).endsWith('ledger.md') && enc === 'utf8') hold();
  return out;
};
if (role === 'absent') fs.existsSync = function (file) {
  const out = existsSync.apply(fs, arguments);
  if (String(file).endsWith('ledger.md') && !out) hold();
  return out;
};
if (role === 'second') fs.openSync = function (file) {
  try { return openSync.apply(fs, arguments); } catch (e) {
    if (e.code === 'EEXIST' && String(file).endsWith('digest.lock')) fs.writeFileSync(${JSON.stringify(blocked)}, '');
    throw e;
  }
};
`);
  const child = (role, argv, input) => {
    const p = spawn(process.execPath, ['-r', preload, scopePath, ...argv], { cwd, env: { ...process.env, ORDER_ROLE: role }, stdio: ['pipe', 'ignore', 'pipe'] });
    p.stdin.end(input);
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d; });
    const guard = setTimeout(() => p.kill('SIGKILL'), 120000);
    const out = new Promise((resolve) => p.on('exit', (status, signal) => { clearTimeout(guard); resolve({ status, signal, stderr }); }));
    out.done = false;
    out.then(() => { out.done = true; });
    return out;
  };
  const until = async (done) => { while (!done()) await new Promise((r) => setTimeout(r, 10)); };
  const first = child(pause, firstArgv, firstInput);
  await until(() => fs.existsSync(paused) || first.done);
  const second = child('second', secondArgv, secondInput);
  await until(() => second.done || fs.existsSync(blocked));
  fs.writeFileSync(go, '');
  return Promise.all([first, second]);
}

const ledgerText = (f) => fs.readFileSync(path.join(f.root, 'ledger.md'), 'utf8');
const leftovers = (f) => fs.readdirSync(f.root).filter((n) => n.includes('.tmp-'));
const rootUser = typeof process.getuid === 'function' && process.getuid() === 0;

test('Concurrent writers of different slice rows and of different headers each land.', async () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) {
    const rs = await together(f, [
      ['slice', '01', 'in-review', '--range', `a${i}`, '--root', f.root],
      ['slice', '02', 'blocked', '--range', `b${i}`, '--root', f.root],
      ['pr', 'set', `#${100 + i}`, '--root', f.root],
      ['docs', 'set', `pass${i}`, '--root', f.root],
    ]);
    for (const r of rs) assert.strictEqual(r.status, 0, `round ${i}: ${r.stderr}`);
    for (const r of rs) assert.ok(!/changed outside scope\.js/.test(r.stderr), `round ${i} reports no tamper: ${r.stderr}`);
    const text = ledgerText(f);
    assert.ok(/\| 01 .*in-review \| a\d+ \|/.test(text) && text.includes(`| a${i} |`), `round ${i}: row 01 landed`);
    assert.ok(text.includes(`| b${i} |`), `round ${i}: row 02 landed`);
    assert.ok(text.includes(`**PR:** #${100 + i}`), `round ${i}: PR header landed`);
    assert.ok(text.includes(`**Docs:** pass${i}`), `round ${i}: Docs header landed`);
  }
  assert.ok(!fs.existsSync(path.join(f.root, 'digest.lock')), 'no lock left');
  const next = sc(f, ['docs', 'set', 'last', '--root', f.root]);
  assert.strictEqual(next.stderr, '', 'the digest matches the ledger the writers left');
});

test('A re-init over a `planned` ledger racing a `step set` loses neither: the new ledger\'s anchor lands, and so does the step.', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-ledger-write-'));
  made.push(cwd);
  const f = { cwd, root: path.join(cwd, '.superdev', 'scopes', 'demo') };
  assert.strictEqual(sc(f, ['init', 'feat/demo', 'planned'], sliceJson).status, 0, 'planned init');
  const spec = JSON.stringify({ ...JSON.parse(sliceJson), anchor: '#512' });
  const rs = await ordered(cwd, 'read', ['init', 'feat/demo', 'planned'], spec, ['step', 'set', 'review', '--root', f.root]);
  for (const r of rs) assert.strictEqual(r.status, 0, r.stderr);
  const text = ledgerText(f);
  assert.ok(text.includes('**Anchor:** #512') && text.includes('**Step:** review'), `the re-init and the step both landed:\n${text}`);
});

test('Two adopts into one run root at once: one writes the ledger and the other refuses, so neither replaces the other\'s ledger.', async () => {
  const f = fixture();
  const body = sc(f, ['publish', '--root', f.root]).stdout;
  const root = path.join(f.cwd, 'adopted', 'demo');
  writeDod(root);
  const rs = await ordered(f.cwd, 'absent', ['adopt', '--root', root], body, ['adopt', '--root', root], body);
  assert.deepStrictEqual(rs.map((r) => r.status === 0).sort(), [false, true], `one adopt writes, one refuses: ${rs.map((r) => r.stderr).join(' | ')}`);
  assert.match(rs.find((r) => r.status !== 0).stderr, /ledger already exists/);
});

// A hold that waits on itself never returns.
test('A nested hold runs inside its outer hold: the lock file stays the outer holder\'s own (same token, never moved aside), the inner exit leaves it in place, the outer exit removes it, and the digest follows the ledger.', () => {
  const f = fixture();
  const lockFile = path.join(f.root, 'digest.lock');
  const code = `const fs = require('fs'); const { withRunLock } = require(${JSON.stringify(digestPath)}); const lock = ${JSON.stringify(lockFile)}; const root = ${JSON.stringify(f.root)};` +
    `const seen = []; const ino = () => fs.statSync(lock).ino;` +
    `withRunLock(root, () => { const token = fs.readFileSync(lock, 'utf8'); const i0 = ino();` +
    `withRunLock(root, () => { seen.push(fs.readFileSync(lock, 'utf8') === token && ino() === i0); });` +
    `seen.push(fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === token && ino() === i0); });` +
    `seen.push(!fs.existsSync(lock)); console.log(JSON.stringify(seen));`;
  const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL' });
  assertSpawnDecided(r, 'nested hold');
  assert.strictEqual(r.status, 0, 'the nested hold returned: ' + r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), [true, true, true], 'inside the inner hold and after it the outer lock stands unmoved; after the outer hold it is gone');
  const w = sc(f, ['pr', 'set', '#7', '--root', f.root]);
  assert.strictEqual(w.status, 0, w.stderr);
  assert.strictEqual(sc(f, ['pr', 'set', '#8', '--root', f.root]).stderr, '', 'no tamper after a single write');
});

test('A failed write leaves the previous ledger and no temporary file; `stage set` appends no `step clear` for it.', () => {
  if (!rootUser) {
    const f = fixture();
    assert.strictEqual(sc(f, ['step', 'set', 'implement', '--root', f.root]).status, 0);
    const before = ledgerText(f);
    const trace = () => fs.readFileSync(path.join(f.root, 'trace.log'), 'utf8');
    const traceBefore = trace();
    fs.chmodSync(f.root, 0o555);
    try {
      const r = sc(f, ['stage', 'set', 'merged', '--root', f.root]);
      assert.notStrictEqual(r.status, 0, 'the write failed');
      assert.strictEqual(ledgerText(f), before, 'the previous ledger stands');
      assert.deepStrictEqual(leftovers(f), [], 'no temporary file');
      assert.strictEqual(trace(), traceBefore, 'no step clear line for a write that failed');
    } finally {
      fs.chmodSync(f.root, 0o755);
    }
    assert.strictEqual(sc(f, ['stage', 'set', 'merged', '--root', f.root]).status, 0);
    assert.ok(!/\*\*Step:\*\*/.test(ledgerText(f)), 'the step is cleared in the ledger');
    assert.match(trace().slice(traceBefore.length), / step clear/, 'the clear is traced once the ledger shows it');
  }
});

test('dod-merge replaces dod.md whole; a failed write leaves the previous dod.md and no temporary file.', () => {
  if (!rootUser) {
    const f = fixture();
    const dod = path.join(f.root, 'dod.md');
    const before = fs.readFileSync(dod, 'utf8');
    fs.chmodSync(f.root, 0o555);
    try {
      const r = sc(f, ['dod-merge', '--root', f.root], '- [ ] A new criterion\n');
      assert.notStrictEqual(r.status, 0, 'the write failed');
      assert.strictEqual(fs.readFileSync(dod, 'utf8'), before, 'the previous dod.md stands');
      assert.deepStrictEqual(leftovers(f), [], 'no temporary file');
    } finally {
      fs.chmodSync(f.root, 0o755);
    }
    const ok = sc(f, ['dod-merge', '--root', f.root], '- [ ] A new criterion\n');
    assert.strictEqual(ok.status, 0, ok.stderr);
    assert.strictEqual(fs.readFileSync(dod, 'utf8'), '- [ ] A new criterion\n', 'dod.md is replaced whole');
    assert.deepStrictEqual(leftovers(f), [], 'no temporary file after the write');
  }
});

test('A rename the system refuses removes the temporary file and keeps the target.', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-ledger-write-'));
  made.push(dir);
  const target = path.join(dir, 'ledger.md');
  fs.mkdirSync(path.join(target, 'inner'), { recursive: true });
  const atomicPath = require.resolve('../plugin/lib/atomic-write.js');
  const code = `const { writeFileAtomic } = require(${JSON.stringify(atomicPath)}); try { writeFileAtomic(${JSON.stringify(target)}, 'x'); process.exit(3); } catch { process.exit(0); }`;
  const r = spawnSync(process.execPath, ['-e', code], { timeout: 20000, killSignal: 'SIGKILL' });
  assertSpawnDecided(r, 'refused rename');
  assert.strictEqual(r.status, 0, 'the refused rename threw');
  assert.deepStrictEqual(fs.readdirSync(dir), ['ledger.md'], 'no temporary file beside the target');
});
