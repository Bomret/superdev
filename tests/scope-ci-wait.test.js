'use strict';

// Suite for plugin/scripts/scope.js's `ci --wait`: the one bounded wait on a commit's named checks, which re-runs a read
// script and judges each read like the plain `ci` verb (INV-0192, ADR 0280). Every case runs the real CLI as a child
// process against one repository, built once; a read script is a fixture `sh` file that counts its calls in a temp
// file and answers by call number. Every case asserts on read counts and verdicts, never on elapsed time (ADR 0086).

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { scopePath, verif } = require('./scope-setup');

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-ci-wait-')));
const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
g('init', '-q', '-b', 'main');
g('config', 'user.email', 'test@example.com');
g('config', 'user.name', 'test');
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
const named = commitWith(CI('- `test`\n- `lint`'));

let caseNo = 0;
// A read script answering call n (1-based) with `answers[n - 1]`, the last answer repeating: `{ out, exit, hang }`. It
// appends each call's `<sha>` substitution to `shas`, and counts calls in `count`.
function readScript(answers) {
  const d = path.join(dir, `..`, path.basename(dir) + `-case-${++caseNo}`);
  fs.mkdirSync(d);
  const count = path.join(d, 'count');
  const shas = path.join(d, 'shas');
  const arms = answers.map((a, i) => {
    const n = i === answers.length - 1 ? '*' : String(i + 1);
    const body = [
      a.out ? `printf '%s' '${a.out.replace(/'/g, "'\\''")}'` : ':',
      a.err ? `printf '%s\\n' '${a.err}' >&2` : ':',
      a.hang ? `sleep 1000 & echo $! > '${d}/child'; wait` : ':',
      `exit ${a.exit || 0}`,
    ].join('; ');
    return `  ${n}) ${body} ;;`;
  });
  const file = path.join(d, 'read.sh');
  fs.writeFileSync(file, [
    `n=$(( $(cat '${count}' 2>/dev/null || echo 0) + 1 )); echo $n > '${count}'`,
    `printf '%s\\n' '<sha>' >> '${shas}'`,
    'case $n in',
    ...arms,
    'esac',
    '',
  ].join('\n'));
  const reads = () => Number(fs.existsSync(count) ? fs.readFileSync(count, 'utf8').trim() : 0);
  return { file, d, reads, shas: () => fs.readFileSync(shas, 'utf8').split('\n').filter(Boolean) };
}

// The verb through the real CLI: resolves `{ code, signal, out, err }`.
function wait(args, o = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scopePath, 'ci', ...args], { cwd: dir, stdio: [o.stdinOpen ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    if (o.onStart) o.onStart(child);
    // A verb that never exits is killed at this qualitative ceiling, so the case fails instead of hanging the suite.
    const ceiling = o.killAfterMs ? setTimeout(() => child.kill('SIGKILL'), o.killAfterMs) : null;
    child.on('close', (code, signal) => {
      clearTimeout(ceiling);
      resolve({ code, signal, out, err });
    });
  });
}
const lines = (...pairs) => pairs.map((p) => p.join('\t')).join('\n') + '\n';
const GREEN = lines(['test', 'success', 'https://ci/1'], ['lint', 'success', 'https://ci/2']);

const cases = [];
const it = (label, fn) => cases.push(fn().then(() => null, (e) => { e.message = `${label}: ${e.message}`; return e; }));

// Every named check green on the first read: exit 0, the plain verb's green line naming the full SHA, one read.
it('green first', async () => {
  const s = readScript([{ out: GREEN }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '1']);
  assert.equal(r.code, 0, JSON.stringify(r));
  assert.match(r.out, new RegExp(`^ci: green ${named}$`, 'm'));
  assert.equal(s.reads(), 1);
});

// Pending, then green on the next read 30 s later: exit 0 after the second read, before the deadline.
it('pending then green', async () => {
  const s = readScript([{ out: lines(['test', 'in_progress'], ['lint', 'success']) }, { out: GREEN }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '61']);
  assert.equal(r.code, 0, JSON.stringify(r));
  assert.match(r.out, /^ci: green /m);
  assert.equal(s.reads(), 2);
});

// Pending, then a green final read at the deadline: exit 0.
it('green final read', async () => {
  const s = readScript([{ out: lines(['test', 'queued']) }, { out: GREEN }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '1']);
  assert.equal(r.code, 0, JSON.stringify(r));
  assert.equal(s.reads(), 2);
});

// A failed named check ends the wait at the first read that shows it: exit 4, naming the check and its link.
it('failed', async () => {
  const s = readScript([{ out: lines(['test', 'failure', 'https://ci/9'], ['lint', 'in_progress']) }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '61']);
  assert.equal(r.code, 4, JSON.stringify(r));
  assert.match(r.out, /^failed\ttest\tfailure\thttps:\/\/ci\/9$/m);
  assert.equal(s.reads(), 1);
});

// No named checks, a malformed `## CI`, or an unresolvable `--sha`: exit 2 after at most one read.
const noneSha = commitWith(CI('`none`'));
const malformed = commitWith(CI('none\n\n- `lint`'));
for (const [label, sha] of [['none', noneSha], ['malformed', malformed], ['unresolvable', 'deadbeef'.repeat(5)]]) {
  it(`cannot judge ${label}`, async () => {
    const s = readScript([{ out: GREEN }]);
    const r = await wait(['--sha', sha, '--wait', '--read', s.file, '--timeout', '61']);
    assert.equal(r.code, 2, JSON.stringify(r));
    assert.match(r.out, /^ci: cannot-judge /m);
    assert.ok(s.reads() <= 1, String(s.reads()));
  });
}

// Every named check finished, none green, none pending: exit 3 at once.
it('finished not green', async () => {
  const s = readScript([{ out: lines(['test', 'skipped'], ['lint', 'neutral']) }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '61']);
  assert.equal(r.code, 3, JSON.stringify(r));
  assert.match(r.out, /^finished\ttest\tskipped$/m);
  assert.equal(s.reads(), 1);
});

// Still pending at the deadline: exactly one final read, then exit 3 naming each pending or missing check.
it('deadline', async () => {
  const s = readScript([{ out: lines(['test', 'in_progress']) }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '1']);
  assert.equal(r.code, 3, JSON.stringify(r));
  assert.match(r.out, new RegExp(`^ci: not-green ${named}$`, 'm'));
  assert.match(r.out, /^pending\ttest\tin_progress$/m);
  assert.match(r.out, /^pending\tlint\tmissing$/m);
  assert.equal(s.reads(), 2);
});

// Two failed reads, then a green one: exit 0. A failed read's partial stdout is never judged, though it reads green.
it('two failed then green', async () => {
  const s = readScript([{ out: GREEN, exit: 1 }, { out: GREEN, exit: 1 }, { out: GREEN }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '61']);
  assert.equal(r.code, 0, JSON.stringify(r));
  assert.equal(s.reads(), 3);
});

// Three failed reads in a row, at 0, 30, and 60 s under --timeout 61: exit 5 with the last read's stderr.
it('three failed', async () => {
  const s = readScript([{ out: GREEN, err: 'boom 1', exit: 1 }, { err: 'boom 2', exit: 1 }, { err: 'boom 3', exit: 7 }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '61']);
  assert.equal(r.code, 5, JSON.stringify(r));
  assert.match(r.out, new RegExp(`^ci: read-failed ${named}$`, 'm'));
  assert.match(r.out, /boom 3/);
  assert.doesNotMatch(r.out, /^ci: green/m);
  assert.equal(s.reads(), 3);
});

// A successful read resets the count: failed, failed, pending, then a failed final read exits 3, not 5.
it('reset', async () => {
  const s = readScript([{ exit: 1 }, { exit: 1 }, { out: lines(['test', 'queued'], ['lint', 'success']) }, { exit: 1 }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '61']);
  assert.equal(r.code, 3, JSON.stringify(r));
  assert.match(r.out, /^pending\ttest\tqueued$/m);
  assert.equal(s.reads(), 4);
});

// A failed final read with no successful read before it names that no check report was read.
it('failed final, nothing read', async () => {
  const s = readScript([{ exit: 1 }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '1']);
  assert.equal(r.code, 3, JSON.stringify(r));
  assert.match(r.out, /\(no check report read\)/);
  assert.equal(s.reads(), 2);
});

// A read that hangs is ended at its bound (10 s under --timeout 1), with the child it started, and counts as failed.
it('hang', async () => {
  const s = readScript([{ out: GREEN, hang: true }, { out: lines(['test', 'queued']) }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '1']);
  assert.equal(r.code, 3, JSON.stringify(r));
  assert.equal(s.reads(), 2);
  const child = Number(fs.readFileSync(path.join(s.d, 'child'), 'utf8'));
  assert.throws(() => process.kill(child, 0), /ESRCH/);
});

// `--sha HEAD` puts the full hex SHA into the script; text such as `$(...)` in `--sha` never reaches the shell.
// The fixture's last commit, so `HEAD` names it.
const head = commitWith(CI('- `test`\n- `lint`\n'));
it('sha substitution', async () => {
  const s = readScript([{ out: GREEN }]);
  const r = await wait(['--sha', 'HEAD', '--wait', '--read', s.file, '--timeout', '1']);
  assert.equal(r.code, 0, JSON.stringify(r));
  assert.match(r.out, new RegExp(`^ci: green ${head}$`, 'm'));
  assert.deepEqual(s.shas(), [head]);
  const t = readScript([{ out: GREEN }]);
  const marker = path.join(t.d, 'pwned');
  const q = await wait(['--sha', `$(touch ${marker})`, '--wait', '--read', t.file, '--timeout', '1']);
  assert.equal(q.code, 2, JSON.stringify(q));
  assert.ok(!fs.existsSync(marker));
  assert.equal(t.reads(), 0);
});
it('sha substitution named', async () => {
  const s = readScript([{ out: GREEN }]);
  const r = await wait(['--sha', named.slice(0, 10), '--wait', '--read', s.file, '--timeout', '1']);
  assert.equal(r.code, 0, JSON.stringify(r));
  assert.deepEqual(s.shas(), [named]);
});

// SIGTERM or SIGHUP ends the running read and its children, prints `ci: stopped <sha>`, and exits 6.
for (const sig of ['SIGTERM', 'SIGHUP']) {
  it(`stopped ${sig}`, async () => {
    const s = readScript([{ hang: true }]);
    const childFile = path.join(s.d, 'child');
    const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '61'], {
      onStart: (child) => {
        const poll = setInterval(() => {
          if (fs.existsSync(childFile) && fs.readFileSync(childFile, 'utf8').trim()) {
            clearInterval(poll);
            child.kill(sig);
          }
        }, 50);
        // A verb that exits before the read starts ends the poll, so the case fails instead of hanging.
        child.on('exit', () => clearInterval(poll));
      },
    });
    assert.equal(r.code, 6, JSON.stringify(r));
    assert.match(r.out, new RegExp(`^ci: stopped ${named}$`, 'm'));
    assert.doesNotMatch(r.out, /^ci: (green|not-green|failed|cannot-judge)/m);
    const child = Number(fs.readFileSync(childFile, 'utf8'));
    assert.throws(() => process.kill(child, 0), /ESRCH/);
  });
}

// Started with stdin left open, `--wait` still runs and exits.
it('stdin open', async () => {
  const s = readScript([{ out: GREEN }]);
  const r = await wait(['--sha', named, '--wait', '--read', s.file, '--timeout', '1'], { stdinOpen: true, killAfterMs: 120000 });
  assert.equal(r.code, 0, JSON.stringify(r));
});

// Each usage refusal exits 1 and names the problem.
{
  const s = readScript([{ out: GREEN }]);
  for (const [label, args, re] of [
    ['wait without read', ['--sha', named, '--wait'], /--read/],
    ['read without wait', ['--sha', named, '--read', s.file], /--wait/],
    ['missing read file', ['--sha', named, '--wait', '--read', path.join(dir, 'nope.sh')], /cannot be read/],
    ['timeout zero', ['--sha', named, '--wait', '--read', s.file, '--timeout', '0'], /--timeout/],
    ['timeout text', ['--sha', named, '--wait', '--read', s.file, '--timeout', '1.5'], /--timeout/],
  ]) {
    it(`usage ${label}`, async () => {
      const r = await wait(args, { stdinOpen: true, onStart: (c) => c.stdin.end() });
      assert.equal(r.code, 1, JSON.stringify(r));
      assert.match(r.err, re);
    });
  }
}

Promise.all(cases).then((errors) => {
  fs.rmSync(dir, { recursive: true, force: true });
  for (let i = 1; i <= caseNo; i++) fs.rmSync(path.join(dir, '..', path.basename(dir) + `-case-${i}`), { recursive: true, force: true });
  const failed = errors.filter(Boolean);
  if (failed.length) {
    for (const e of failed) console.error(e.stack || e.message);
    process.exit(1);
  }
  console.log('scope-ci-wait: ok');
});
