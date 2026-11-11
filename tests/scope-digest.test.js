'use strict';

// Suite for the run digest (ADR 0227, INV-0117, INV-0181): scope.js detects an outside edit of a run's ledger or trace after the fact.
// A sidecar in the run root seals both files; every scope.js verb that writes to a run checks it first, reports a mismatch once
// on stderr and as a `tamper` trace line, re-seals, and goes on. Real repositories, real processes, and real lock files throughout (INV-0009).

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { scopePath, sliceJson } = require('./scope-setup');
const { copyFixture, templateOnce } = require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');

const traceLogPath = require.resolve('../plugin/lib/trace-log.js');
const made = [];

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const template = templateOnce((dir) => {
  const repo = path.join(dir, 'repo');
  const origin = path.join(dir, 'origin');
  fs.mkdirSync(repo);
  fs.mkdirSync(origin);
  git(['init', '-q', '--bare', '-b', 'main'], origin);
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'test'], repo);
  fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), '# CM\n\n- **Remote:** `origin`. Confirm.\n');
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'init'], repo);
  git(['remote', 'add', 'origin', origin], repo);
}, 'scope-digest-template-');

// A repository with a run `demo` at `implementing`, made by the real `init` verb.
function fixture(stage = 'implementing') {
  const copy = copyFixture(template(), 'scope-digest-');
  made.push(copy);
  const repo = path.join(copy, 'repo');
  git(['remote', 'set-url', 'origin', path.join(copy, 'origin')], repo);
  const f = { repo, origin: path.join(copy, 'origin'), root: path.join(repo, '.superdev', 'scopes', 'demo') };
  const r = sc(f, ['init', 'feat/demo', stage], sliceJson);
  assert.strictEqual(r.status, 0, 'init: ' + r.stderr);
  return f;
}

function sc(f, argv, input = '') {
  const r = spawnSync(process.execPath, [scopePath, ...argv], { cwd: f.repo, input, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
  assertSpawnDecided(r, 'scope.js ' + argv[0]);
  return r;
}
// A writing verb that touches the ledger on every call.
let n = 0;
const write = (f) => sc(f, ['degraded', 'add', `note ${++n}`, '--root', f.root]);

const ledgerFile = (f) => path.join(f.root, 'ledger.md');
const traceFile = (f) => path.join(f.root, 'trace.log');
const traceText = (f) => (fs.existsSync(traceFile(f)) ? fs.readFileSync(traceFile(f), 'utf8') : '');
const tampers = (f) => traceText(f).split('\n').filter((l) => l.split(' ')[3] === 'tamper').map((l) => l.split(' ')[4]);
const warnings = (r) => r.stderr.split('\n').filter((l) => /was changed outside scope\.js/.test(l));
const sh = (cwd, script) => {
  const r = spawnSync('sh', ['-c', script], { cwd, encoding: 'utf8', timeout: 20000 });
  assertSpawnDecided(r, 'sh');
  assert.strictEqual(r.status, 0, script + ': ' + r.stderr);
};
const snapshot = (dir) => Object.fromEntries(fs.readdirSync(dir).filter((e) => fs.statSync(path.join(dir, e)).isFile()).map((e) => [e, fs.readFileSync(path.join(dir, e), 'utf8')]));
const sealOf = (file) => {
  const b = fs.readFileSync(file);
  return { size: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') };
};

// One tamper is reported once: the next writing verb warns once naming the file and appends one tamper line, and the one after that is silent.
function assertReportedOnce(f, file, label, expectOk = true) {
  const before = tampers(f).length;
  const r = write(f);
  if (expectOk) assert.strictEqual(r.status, 0, `${label}: the verb completes: ${r.stderr}`);
  assert.strictEqual(warnings(r).length, 1, `${label}: one warning: ${r.stderr}`);
  assert.ok(warnings(r)[0].includes(file), `${label}: the warning names ${file}`);
  assert.strictEqual(tampers(f).length, before + 1, `${label}: one tamper line`);
  assert.strictEqual(tampers(f).at(-1), file, `${label}: the tamper line names ${file}`);
  const again = write(f);
  assert.strictEqual(warnings(again).length, 0, `${label}: reported once: ${again.stderr}`);
  assert.strictEqual(tampers(f).length, before + 1, `${label}: no second tamper line`);
}

async function main() {
  // #ledger: an Edit-tool rewrite, a shell `sed -i`, an `echo >>` append, and a deletion.
  {
    const f = fixture();
    assert.strictEqual(write(f).stderr, '', 'a plain write warns of nothing');
    assert.ok(fs.existsSync(path.join(f.root, 'digest.json')), 'the run holds a digest sidecar');
    fs.writeFileSync(ledgerFile(f), fs.readFileSync(ledgerFile(f), 'utf8').replace('scope.js CLI', 'scope.js CLX'));
    assertReportedOnce(f, 'ledger.md', 'ledger rewrite');
    sh(f.root, "sed -i.bak 's/CLX/CLY/' ledger.md && rm ledger.md.bak");
    assertReportedOnce(f, 'ledger.md', 'ledger sed -i');
    sh(f.root, 'echo "extra" >> ledger.md');
    assertReportedOnce(f, 'ledger.md', 'ledger echo >>');
    fs.rmSync(ledgerFile(f));
    // `degraded add` refuses on a run with no ledger, after it reports the deletion.
    assertReportedOnce(f, 'ledger.md', 'ledger deletion', false);
  }
  {
    // `init` writes a ledger, so it completes over a deletion and reports it.
    const f = fixture();
    write(f);
    fs.rmSync(ledgerFile(f));
    const re = sc(f, ['init', 'feat/demo', 'implementing'], sliceJson);
    assert.strictEqual(re.status, 0, 'init completes after a ledger deletion: ' + re.stderr);
    assert.strictEqual(warnings(re).length, 1, 'init reports the deletion once: ' + re.stderr);
    assert.ok(fs.existsSync(ledgerFile(f)), 'init wrote the ledger');
    assert.deepStrictEqual(tampers(f), ['ledger.md'], 'one tamper line');
    assert.strictEqual(warnings(write(f)).length, 0, 'reported once');
  }
  {
    // #open: `open` names no `--root`. On an existing planned ledger it writes through `step set plan` without `init`, and checks first.
    const open = (f) => {
      git(['branch', '-f', 'feat/demo', 'main'], f.repo);
      return sc(f, ['open', 'feat/demo', '--base', 'main']);
    };
    const clean = fixture('planned');
    const ok = open(clean);
    assert.strictEqual(ok.status, 0, 'open over a planned ledger with no outside edit completes: ' + ok.stderr);
    assert.strictEqual(warnings(ok).length, 0, 'open reports nothing without an outside edit: ' + ok.stderr);
    assert.deepStrictEqual(tampers(clean), [], 'no tamper line');

    const f = fixture('planned');
    fs.writeFileSync(ledgerFile(f), fs.readFileSync(ledgerFile(f), 'utf8') + '\nedited from outside\n');
    const r = open(f);
    assert.strictEqual(r.status, 0, 'open completes over an edited planned ledger: ' + r.stderr);
    assert.strictEqual(warnings(r).length, 1, 'open reports the outside edit once: ' + r.stderr);
    assert.ok(warnings(r)[0].includes('ledger.md'), 'the warning names ledger.md');
    assert.deepStrictEqual(tampers(f), ['ledger.md'], 'one tamper line');
    assert.match(fs.readFileSync(ledgerFile(f), 'utf8'), /\*\*Step:\*\* plan/, 'open wrote the plan step');
    assert.strictEqual(warnings(write(f)).length, 0, 'reported once');
  }

  // #trace: the same four, on `trace.log`.
  {
    const f = fixture();
    write(f);
    fs.writeFileSync(traceFile(f), traceText(f).split('\n').slice(1).join('\n'));
    assertReportedOnce(f, 'trace.log', 'trace rewrite');
    sh(f.root, "sed -i.bak 's/ledger/LEDGER/' trace.log && rm trace.log.bak");
    assertReportedOnce(f, 'trace.log', 'trace sed -i');
    sh(f.root, 'echo "2026-01-01T00:00:00.000Z scope main edit impl x" >> trace.log');
    assertReportedOnce(f, 'trace.log', 'trace foreign append');
    fs.rmSync(traceFile(f));
    assertReportedOnce(f, 'trace.log', 'trace deletion');
  }

  // #both: each file is reported on its own.
  {
    const f = fixture();
    write(f);
    sh(f.root, 'echo a >> ledger.md; echo b >> trace.log');
    const r = write(f);
    assert.deepStrictEqual(warnings(r).map((w) => (w.includes('ledger.md') ? 'ledger.md' : 'trace.log')).sort(), ['ledger.md', 'trace.log']);
    assert.deepStrictEqual(tampers(f).sort(), ['ledger.md', 'trace.log']);
    assert.strictEqual(warnings(write(f)).length, 0);
  }

  // #no-digest: a run with no sidecar, or an unreadable one, is sealed on its first check and reports nothing.
  for (const [label, garble] of [['absent', null], ['unreadable', '{not json']]) {
    const f = fixture();
    write(f);
    const side = path.join(f.root, 'digest.json');
    if (garble === null) fs.rmSync(side);
    else fs.writeFileSync(side, garble);
    sh(f.root, 'echo "an old release wrote this" >> trace.log');
    const r = write(f);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stderr, '', `${label} sidecar: nothing reported`);
    assert.deepStrictEqual(tampers(f), [], `${label} sidecar: no tamper line`);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(side, 'utf8')).trace, sealOf(traceFile(f)), `${label} sidecar: sealed`);
    sh(f.root, 'echo "outside" >> ledger.md');
    assertReportedOnce(f, 'ledger.md', `${label} sidecar, then an edit`);
  }

  // #sanctioned: no tamper across ledger verbs, hook appends, parallel appenders, rotation, discard, and push then adopt.
  {
    const f = fixture();
    for (let i = 0; i < 4; i++) assert.strictEqual(write(f).stderr, '');
    sc(f, ['slice', '01', 'in-progress', '--root', f.root]);
    sc(f, ['step', 'set', 'implement', '--root', f.root]);
    // A hook append and eight parallel appenders, each its own process.
    const append = (tag, count) => new Promise((resolve) => {
      const code = `const { appendTrace } = require(${JSON.stringify(traceLogPath)});` +
        `for (let i = 0; i < ${count}; i++) appendTrace(${JSON.stringify(f.root)}, { slice: 's', agent: process.argv[1], kind: 'edit', fields: ['impl', 'f' + i] });`;
      const p = spawn(process.execPath, ['-e', code, tag], { stdio: 'ignore' });
      p.on('exit', (status) => resolve(status));
    });
    const statuses = await Promise.all(Array.from({ length: 8 }, (_, i) => append('a' + i, 25)));
    assert.deepStrictEqual(statuses, Array(8).fill(0));
    const lines = traceText(f).split('\n').filter(Boolean);
    assert.strictEqual(lines.filter((l) => l.split(' ')[3] === 'edit').length, 200, 'every parallel append landed whole');
    assert.ok(lines.every((l) => /^\d{4}-\d\d-\d\dT[\d:.]+Z \S+ \S+ \S+/.test(l)), 'no torn line');
    const r = write(f);
    assert.strictEqual(r.stderr, '', 'after hook and parallel appends: ' + r.stderr);
    assert.deepStrictEqual(tampers(f), []);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(f.root, 'digest.json'), 'utf8')).trace, sealOf(traceFile(f)));
    // The lock leaves nothing behind.
    assert.ok(!fs.existsSync(path.join(f.root, 'digest.lock')), 'no lock left');
  }
  {
    // init's rotation: a closed run's trace moves aside, and the new run starts a fresh digest.
    const f = fixture();
    for (const s of ['merged', 'reviewed', 'documented', 'submitted', 'shipped', 'closed']) {
      const r = sc(f, ['stage', 'set', s, '--root', f.root]);
      assert.strictEqual(r.status, 0, `stage ${s}: ${r.stderr}`);
    }
    const re = sc(f, ['init', 'feat/demo', 'implementing'], sliceJson);
    assert.strictEqual(re.status, 0, re.stderr);
    assert.strictEqual(re.stderr, '', 'init over a closed run reports no tamper');
    assert.ok(fs.readdirSync(f.root).some((e) => /^trace-closed-.*\.log$/.test(e)), 'the old trace moved aside');
    assert.strictEqual(write(f).stderr, '', 'the verb after the rotation reports no tamper');
    assert.deepStrictEqual(tampers(f), []);
  }
  {
    // discard removes the sidecar with the run.
    const f = fixture('planned');
    write(f);
    assert.ok(fs.existsSync(path.join(f.root, 'digest.json')));
    const r = sc(f, ['discard', '--root', f.root]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stderr, '');
    assert.ok(!fs.existsSync(f.root), 'the run root and its sidecar are gone');
  }
  {
    // push then adopt: the ref carries the trace's digest, and an adopted run reports no tamper.
    const f = fixture();
    write(f);
    sc(f, ['step', 'set', 'implement', '--root', f.root]);
    const body = sc(f, ['publish', '--root', f.root]).stdout;
    const cleared = sc(f, ['step', 'clear', '--root', f.root]);
    assert.match(cleared.stdout, /run-state: sent/, cleared.stdout + cleared.stderr);
    const ref = 'refs/superdev/demo';
    const pushedTrace = git(['show', `${ref}:trace.log`], f.origin) + '\n';
    const pushed = sealOf(traceFile(f));
    assert.strictEqual(git(['show', `${ref}:trace.digest`], f.origin), `${Buffer.byteLength(pushedTrace)} ${crypto.createHash('sha256').update(pushedTrace).digest('hex')}`, 'trace.digest matches the pushed trace');
    assert.strictEqual(pushed.size, Buffer.byteLength(pushedTrace), 'the pushed trace is the local one');
    for (const e of fs.readdirSync(f.root)) fs.rmSync(path.join(f.root, e), { recursive: true, force: true });
    const adopted = sc(f, ['adopt', '--root', f.root], body);
    assert.strictEqual(adopted.status, 0, adopted.stderr);
    assert.match(adopted.stdout, /run-state: fetched/, adopted.stdout);
    assert.strictEqual(adopted.stderr, '', 'adopt reports no tamper');
    assert.ok(!fs.existsSync(path.join(f.root, 'trace.digest')), 'the unpacked digest moves into the sidecar');
    const next = write(f);
    assert.strictEqual(next.stderr, '', 'the verb after adopt reports no tamper: ' + next.stderr);
    assert.deepStrictEqual(tampers(f), []);
    // An adopt that keeps the local trace keeps the local sidecar's trace digest: only the ledger, which adopt rebuilds, is sealed anew.
    const side = path.join(f.root, 'digest.json');
    const localTrace = JSON.parse(fs.readFileSync(side, 'utf8')).trace;
    fs.rmSync(ledgerFile(f));
    fs.writeFileSync(side, JSON.stringify({ trace: localTrace }) + '\n');
    const kept = sc(f, ['adopt', '--root', f.root], body);
    assert.strictEqual(kept.status, 0, kept.stderr);
    assert.match(kept.stdout, /kept the local trace\.log/, kept.stdout);
    assert.strictEqual(kept.stderr, '', 'an adopt that keeps its trace reports no tamper');
    assert.ok(JSON.parse(fs.readFileSync(side, 'utf8')).ledger, 'adopt sealed the ledger it rebuilt');
    assert.strictEqual(write(f).stderr, '', 'the verb after the keeping adopt reports no tamper');
  }

  // #lock: a lock a killed holder left is broken, and an append waiting on it lands.
  {
    const f = fixture();
    const lock = path.join(f.root, 'digest.lock');
    const append = () => {
      const code = `const { appendTrace } = require(${JSON.stringify(traceLogPath)}); process.exit(appendTrace(${JSON.stringify(f.root)}, { kind: 'edit', fields: ['impl', 'late'] }) ? 0 : 3);`;
      const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL' });
      assertSpawnDecided(r, 'append behind a lock');
      return r;
    };
    // An old lock is broken at once.
    fs.writeFileSync(lock, '');
    const old = new Date(Date.now() - 3600 * 1000);
    fs.utimesSync(lock, old, old);
    assert.strictEqual(append().status, 0, 'an append lands over an old lock');
    assert.ok(!fs.existsSync(lock), 'the old lock is gone');
    // A holder killed with its lock fresh: the append waits for the lock to age, then lands.
    const holder = spawn(process.execPath, ['-e', `require('fs').closeSync(require('fs').openSync(${JSON.stringify(lock)}, 'wx')); console.log('held'); setInterval(() => {}, 1000);`], { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise((resolve) => holder.stdout.once('data', resolve));
    holder.kill('SIGKILL');
    await new Promise((resolve) => holder.on('exit', resolve));
    assert.ok(fs.existsSync(lock), 'the killed holder left its lock');
    assert.strictEqual(append().status, 0, 'an append lands behind the killed holder\'s lock');
    assert.strictEqual(traceText(f).split('\n').filter((l) => l.includes(' edit impl late')).length, 2, 'both appends landed');
    assert.ok(!fs.existsSync(lock), 'the lock was broken and released');
    assert.strictEqual(write(f).stderr, '', 'no tamper after the broken lock');
  }

  // #lock-bound: a live holder that takes the lock again after every break (its lock never ages out) delays an event's appends by
  // one wait budget in all, not one per append. Each of the three appends meets a held lock. The first waits the budget and breaks the
  // lock; the two after it find the budget spent and wait none. A per-append limit would make each of the three wait as long as the first,
  // so the later two together would take about twice the first. The comparison is against the first append of the same run.
  {
    const f = fixture();
    const lock = path.join(f.root, 'digest.lock');
    const holder = spawn(process.execPath, ['-e',
      `const fs = require('fs'); const lock = ${JSON.stringify(lock)};` +
      `const take = () => { try { fs.closeSync(fs.openSync(lock, 'wx')); } catch { try { const now = new Date(); fs.utimesSync(lock, now, now); } catch {} } };` +
      `take(); console.log('held'); const t = setInterval(take, 5);` +
      `setTimeout(() => { clearInterval(t); process.exit(0); }, 9000);`], { stdio: ['ignore', 'pipe', 'ignore'] });
    let holderGone = false;
    holder.on('exit', () => { holderGone = true; });
    await new Promise((resolve) => holder.stdout.once('data', resolve));
    const code = `const { appendTrace } = require(${JSON.stringify(traceLogPath)}); const took = [];` +
      `for (let i = 0; i < 3; i++) { const from = process.hrtime.bigint();` +
      `if (!appendTrace(${JSON.stringify(f.root)}, { kind: 'edit', fields: ['impl', 'line' + i] })) process.exit(3);` +
      `took.push(Number(process.hrtime.bigint() - from) / 1e6); } console.log(JSON.stringify(took));`;
    const appender = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    appender.stdout.on('data', (d) => { out += d; });
    const guard = setTimeout(() => appender.kill('SIGKILL'), 60000);
    const status = await new Promise((resolve) => appender.on('exit', (s) => resolve(s)));
    clearTimeout(guard);
    assert.strictEqual(status, 0, 'the three-line event landed');
    const [first, second, third] = JSON.parse(out);
    assert.ok(first >= 500, `the first append waited behind the live holder: ${first} ms`);
    assert.ok(second + third < first, `the later appends waited none, one budget in all: ${first}, ${second}, ${third} ms`);
    assert.strictEqual(traceText(f).split('\n').filter((l) => /edit impl line\d/.test(l)).length, 3, 'all three lines are in the trace');
    holder.kill('SIGKILL');
    await new Promise((resolve) => (holderGone ? resolve() : holder.on('exit', resolve)));
  }

  // #lock-owner: a holder whose lock was broken after the stale bound removes no lock but its own, so the holder after it keeps its lock.
  {
    const f = fixture();
    const lock = path.join(f.root, 'digest.lock');
    const digestPath = require.resolve('../plugin/lib/run-digest.js');
    const nap = 'const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);';
    const run = (body) => spawn(process.execPath, ['-e',
      `const { withRunLock } = require(${JSON.stringify(digestPath)}); ${nap} withRunLock(${JSON.stringify(f.root)}, () => { ${body} });`], { stdio: ['ignore', 'pipe', 'ignore'] });
    const first = run("console.log('held'); nap(2600);");
    let firstGone = false;
    first.on('exit', () => { firstGone = true; });
    await new Promise((resolve) => first.stdout.once('data', resolve));
    const second = run("console.log('in'); nap(2500);");
    let secondIn = false;
    second.stdout.on('data', () => { secondIn = true; });
    await new Promise((resolve) => first.on('exit', resolve));
    assert.ok(secondIn, 'the second holder broke the old lock and was inside before the first ended');
    assert.ok(fs.existsSync(lock), 'the first holder left the second holder\'s lock alone');
    await new Promise((resolve) => second.on('exit', resolve));
    assert.ok(!fs.existsSync(lock), 'the second holder released its own lock');
  }

  // #adopt-race: a hook append that lands while adopt moves the trace into place is no tamper, however the two interleave. The test holds
  // the lock and watches whether the trace appears under it: adopt that moves the trace outside the lock exposes the gap, and the
  // append made in it is what the digest must still match.
  {
    const f = fixture();
    write(f);
    sc(f, ['step', 'set', 'implement', '--root', f.root]);
    assert.match(sc(f, ['step', 'clear', '--root', f.root]).stdout, /run-state: sent/);
    for (const e of fs.readdirSync(f.root)) fs.rmSync(path.join(f.root, e), { recursive: true, force: true });
    const lock = path.join(f.root, 'digest.lock');
    fs.closeSync(fs.openSync(lock, 'wx'));
    const stateRefPath = require.resolve('../plugin/lib/run-state-ref.js');
    const adopt = spawn(process.execPath, ['-e', `console.log(require(${JSON.stringify(stateRefPath)}).fetchRunState(${JSON.stringify(f.root)}, ${JSON.stringify(f.repo)}))`], { stdio: ['ignore', 'pipe', 'ignore'] });
    const done = new Promise((resolve) => adopt.on('exit', resolve));
    const until = Date.now() + 1200;
    let exposed = false;
    while (Date.now() < until) {
      if (fs.existsSync(traceFile(f))) { exposed = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (exposed) fs.appendFileSync(traceFile(f), '2026-01-01T00:00:00.000Z scope main edit impl raced\n');
    fs.rmSync(lock, { force: true });
    await done;
    assert.ok(fs.existsSync(traceFile(f)), 'adopt unpacked the trace');
    if (!exposed) {
      const code = `process.exit(require(${JSON.stringify(traceLogPath)}).appendTrace(${JSON.stringify(f.root)}, { kind: 'edit', fields: ['impl', 'raced'] }) ? 0 : 3);`;
      const late = spawnSync(process.execPath, ['-e', code], { timeout: 60000, killSignal: 'SIGKILL' });
      assertSpawnDecided(late, 'append after adopt');
      assert.strictEqual(late.status, 0);
    }
    assert.ok(traceText(f).includes('edit impl raced'), 'the raced append is in the trace');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(f.root, 'digest.json'), 'utf8')).trace, sealOf(traceFile(f)), 'the digest matches the trace with the append');
  }

  // #read-only: status, get, and trace leave every file of the run, its sidecar included, byte for byte, even over an outside edit.
  {
    const f = fixture();
    write(f);
    sh(f.root, 'echo "outside" >> ledger.md');
    const before = snapshot(f.root);
    for (const argv of [['status'], ['get', 'stage', '--root', f.root], ['trace', '--root', f.root], ['publish', '--root', f.root]]) {
      const r = sc(f, argv);
      assert.strictEqual(r.status, 0, argv[0] + ': ' + r.stderr);
      assert.strictEqual(warnings(r).length, 0, argv[0] + ' checks nothing');
    }
    assert.deepStrictEqual(snapshot(f.root), before, 'no file of the run changed');
    assert.ok(!fs.existsSync(path.join(f.root, 'digest.lock')));
    assertReportedOnce(f, 'ledger.md', 'the tamper those verbs left stands for the next writer');
  }

  // #gone: no hook registration or module named ledger-guard or ledger-writes remains.
  {
    const plugin = path.join(__dirname, '..', 'plugin');
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    assert.deepStrictEqual(walk(plugin).filter((p) => /ledger-guard|ledger-writes/.test(path.basename(p))), []);
    assert.doesNotMatch(fs.readFileSync(path.join(plugin, 'hooks', 'hooks.json'), 'utf8'), /ledger-guard/);
    assert.deepStrictEqual(fs.readdirSync(__dirname).filter((e) => /ledger-guard|ledger-writes/.test(e)), []);
  }
}

main().then(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
  console.log('scope-digest tests ok');
}, (e) => {
  console.error(e);
  process.exit(1);
});
