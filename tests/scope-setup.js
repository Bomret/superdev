'use strict';

// Shared setup of the scope suites (`tests/scope*.test.js`): the temporary directory the CLI runs in, the
// console-capture `call` helper, the `init` payload, and the `verification.md` text builder. Each suite requires
// it, so each suite runs on its own. It is no suite. `tmp` is created on first read, so a suite that needs only
// `verif` creates no directory.

const { copyFixture } = require('./fixture-git');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { run } = require('../plugin/scripts/scope.js');
const scopePath = require.resolve('../plugin/scripts/scope.js');

let dir;
const tmpDir = () => (dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-')));

// Capture console.log output per call, plus a direct process.stdout.write (dod-line's body mode
// writes its exact bytes that way, rather than through console.log's own added trailing newline).
// A refusal comes back as `{ ok: false, err, exitCode, out }`: the message, the exit status (undefined means 1), and what printed.
// `cwd` defaults to the suite's temporary directory.
const call = (argv, stdinJson, cwd) => {
  const logged = [];
  const orig = console.log;
  const origWrite = process.stdout.write;
  console.log = (s) => logged.push(String(s));
  process.stdout.write = (s) => {
    logged.push(String(s));
    return true;
  };
  try {
    run(argv, cwd || tmpDir(), stdinJson || '');
    return { ok: true, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message, exitCode: e.exitCode, out: logged.join('\n') };
    throw e;
  } finally {
    console.log = orig;
    process.stdout.write = origWrite;
  }
};

const sliceJson = JSON.stringify({
  anchor: '#187 — Run state owned by a deterministic CLI (scope.js)',
  slices: [
    { id: '01', issue: '#188', title: 'scope.js CLI', type: 'behavior', 'depends-on': '—' },
    { id: '02', issue: '#189', title: 'ledger-guard hook', type: 'behavior', 'depends-on': '01' },
  ],
});

// `verification.md` text: the first fence is the full command, the second the focused one, `extra` a trailing section.
const verif = (full, focused, extra = '') =>
  `# V\n\n\`\`\`sh\n${full}\n\`\`\`\n` + (focused ? `\n\`\`\`sh\n${focused}\n\`\`\`\n` : '') + extra;

// The fixture of the `fail-to-pass` suites (`tests/scope-fail-to-pass-*.test.js`): every scenario is a real repository (a base
// commit, a tip commit, a run root under `.superdev/scopes/`, and a scopetree at the tip, the cwd the verb runs from) inside
// one temporary directory of its own, `D`, which `done()` removes. `drive` runs a driver process that starts and signals
// verbs, created on first use.
const f2pFixture = () => {
  const assert = require('node:assert');
  const { spawnSync } = require('node:child_process');
  const { assertSpawnDecided } = require('./spawn-verdict');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-f2p-'));
  const git = (cwd, argv) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...argv], { cwd, encoding: 'utf8', timeout: 20000 });
    assertSpawnDecided(r, 'git ' + argv[0]);
    assert.equal(r.status, 0, 'git ' + argv.join(' ') + ': ' + r.stderr);
    return r.stdout.trim();
  };
  // A test script's first line records what the worktree holds when the command runs.
  const probe = 'ls -1 | tr "\\n" "|" >> "$F2P_LOG"; echo >> "$F2P_LOG"\n';
  let n = 0;
  const templates = new Map();
  const traceLines = (root) => {
    const file = path.join(root, 'trace.log');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').slice(1).join(' ')) : [];
  };
  const CMD = 'sh tests/t.sh';
  // `base` and `tip` map a path to its text, or to null to delete it at the tip; `rename` pairs move a base file at the tip.
  // `cmd` is the command the verb is handed after `--`; a run may hand another (`o.cmd`), or none (`o.noCommand`).
  const scenario = ({ base, tip, rename = [], bare = false, cmd = CMD }) => {
    const dir = path.join(D, 's' + ++n);
    const repo = path.join(dir, 'repo');
    // The repository of one (base, tip, rename) is built once, without a run root or worktree, and each scenario gets a copy.
    const key = JSON.stringify({ base, tip, rename });
    if (!templates.has(key)) {
      const tdir = path.join(D, 't' + templates.size);
      const trepo = path.join(tdir, 'repo');
      fs.mkdirSync(trepo, { recursive: true });
      const put = (files) => {
        for (const [rel, text] of Object.entries(files)) {
          const abs = path.join(trepo, rel);
          if (text === null) {
            fs.rmSync(abs, { recursive: true, force: true });
            continue;
          }
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, text);
        }
      };
      git(trepo, ['init', '-q', '-b', 'main']);
      put({ '.gitignore': '.superdev/\n', ...base });
      git(trepo, ['add', '-A']);
      git(trepo, ['commit', '-q', '-m', 'base']);
      const baseSha = git(trepo, ['rev-parse', 'HEAD']);
      for (const [from, to] of rename) {
        fs.mkdirSync(path.dirname(path.join(trepo, to)), { recursive: true });
        fs.renameSync(path.join(trepo, from), path.join(trepo, to));
      }
      put(tip);
      git(trepo, ['add', '-A']);
      git(trepo, ['commit', '-q', '--allow-empty', '-m', 'tip']);
      templates.set(key, { tdir, baseSha, tipSha: git(trepo, ['rev-parse', 'HEAD']) });
    }
    const { tdir, baseSha, tipSha } = templates.get(key);
    fs.renameSync(copyFixture(tdir, 'scope-f2p-copy-'), dir);
    const root = path.join(repo, '.superdev', 'scopes', 'demo');
    const tree = path.join(root, 'scopetree');
    // `bare`: a repository with no run root and no `.superdev/` directory.
    if (!bare) {
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, 'ledger.md'),
        '# Ledger — demo\n\n**Stage:** implementing\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 01 | #1 | t | behavior | — | in-progress | — |\n');
      git(repo, ['worktree', 'add', '-q', '-b', 'feat/demo', tree, tipSha]);
    }
    const log = path.join(dir, 'log');
    return {
      dir, repo, root, tree, baseSha, tipSha, log, cmd, range: `${baseSha}..${tipSha}`,
      run: (range, o = {}) => {
        const tail = o.noCommand ? [] : ['--', ...(o.argv || [o.cmd === undefined ? cmd : o.cmd])];
        const r = spawnSync(process.execPath, [scopePath, 'fail-to-pass', range, ...tail], { cwd: tree, encoding: 'utf8', timeout: 60000, ...o, env: { ...process.env, F2P_LOG: log, F2P_DIR: dir, ...o.env } });
        assertSpawnDecided(r, 'scope.js fail-to-pass ' + range);
        return r;
      },
      // The trace's lines without their timestamp. `trace` leaves out the control run's `run` line, which `runLines` reads,
      // and the command an outcome line ends with, which `rawTrace` keeps.
      trace: () => traceLines(root).filter((l) => l.split(' ')[2] !== 'run').map((l) => l.replace(/ \S+$/, '')),
      rawTrace: () => traceLines(root).filter((l) => l.split(' ')[2] !== 'run'),
      // The control run's `run` lines, without the duration and the arguments a `run` line ends with.
      runLines: () => traceLines(root).filter((l) => l.split(' ')[2] === 'run').map((l) => l.split(' ').slice(0, 8).join(' ')),
      rawRunLines: () => traceLines(root).filter((l) => l.split(' ')[2] === 'run'),
      ran: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
    };
  };
  // What the checkout that ran the verb holds: its HEAD, branches, worktrees, index, and working tree.
  const checkout = (cwd) => [
    git(cwd, ['rev-parse', 'HEAD']),
    git(cwd, ['for-each-ref']),
    git(cwd, ['worktree', 'list', '--porcelain']).replace(/^worktree .*\/fail-to-pass-.*$/gm, 'LEFTOVER'),
    git(cwd, ['status', '--porcelain=v1', '-uall']),
    git(cwd, ['diff', '--cached', '--name-only']),
  ];
  const leftover = (sc) => fs.readdirSync(sc.root).filter((e) => e.startsWith('fail-to-pass-'));
  // Polls until no process named in the pid files is alive (a file holds one pid per line), and fails on the last poll.
  const assertGone = (message, ...files) => {
    assert.ok(files.every((f) => fs.existsSync(f)), `${message}: the run started its processes`);
    const gone = spawnSync('bash', ['-c', 'for i in $(seq 100); do alive=; for f in "$@"; do kill -0 $(cat "$f") 2>/dev/null && alive=1; done; [ -z "$alive" ] && { echo gone; exit 0; }; sleep 0.1; done; echo alive', 'bash', ...files], { encoding: 'utf8', timeout: 30000 });
    assertSpawnDecided(gone, 'the liveness poll');
    assert.equal(gone.stdout.trim(), 'gone', message);
  };
  // No git hook runs, neither a hook file nor a config-based hook (`hook.<name>.command`, as hk installs them), which
  // `core.hooksPath` does not reach. The control proves the fixture's hooks are live: a plain `git worktree add` fires the
  // hook files, and the config hooks too where `git hook list` shows git supports them. A git without them ignores the keys.
  const hooked = (sc) => {
    const sentinel = path.join(path.dirname(sc.repo), 'hook-fired');
    for (const hook of ['post-checkout', 'reference-transaction', 'post-index-change']) {
      fs.writeFileSync(path.join(sc.repo, '.git', 'hooks', hook), `#!/bin/sh\necho ${hook} >> "${sentinel}"\n`, { mode: 0o755 });
    }
    for (const hook of ['post-checkout', 'reference-transaction', 'post-index-change', 'pre-commit', 'commit-msg']) {
      git(sc.repo, ['config', `hook.probe.${hook}.command`, `echo config:${hook} >> "${sentinel}"`]);
      git(sc.repo, ['config', `hook.probe.${hook}.event`, hook]);
    }
    const probeDir = path.join(path.dirname(sc.repo), 'hook-probe');
    git(sc.repo, ['worktree', 'add', '-q', '--detach', probeDir, sc.tipSha]);
    assert.ok(fs.existsSync(sentinel), 'a plain git worktree add fires the fixture hooks');
    const listed = spawnSync('git', ['hook', 'list', 'post-checkout'], { cwd: sc.repo, encoding: 'utf8' });
    if (listed.status === 0 && listed.stdout.includes('probe.post-checkout')) {
      assert.match(fs.readFileSync(sentinel, 'utf8'), /^config:post-checkout\b/m, 'a git with config-based hooks fires the fixture config hooks too');
    }
    git(sc.repo, ['worktree', 'remove', '--force', probeDir]);
    fs.rmSync(sentinel);
    return sentinel;
  };
  // The driver starts verbs and signals them: `signal` (one run, killed once its marker exists), `kill-beside` (a run
  // killed as a second one starts), and any other mode (two runs at once).
  let driver;
  const drive = (cfg) => {
    if (!driver) {
      driver = path.join(D, 'driver.js');
      fs.writeFileSync(driver, `
      const { spawn } = require('node:child_process');
      const fs = require('node:fs');
      const cfg = JSON.parse(process.argv[2]);
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const until = async (done) => { for (let i = 0; i < 600 && !done(); i++) await wait(50); if (!done()) throw new Error('timed out waiting'); };
      const left = () => fs.readdirSync(cfg.root).filter((e) => e.startsWith('fail-to-pass-'));
      const start = (env) => {
        const child = spawn(process.execPath, [cfg.scope, 'fail-to-pass', cfg.range, '--', cfg.cmd], { cwd: cfg.cwd, env: { ...process.env, ...cfg.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
        const out = { stdout: '', stderr: '' };
        child.stdout.on('data', (d) => (out.stdout += d));
        child.stderr.on('data', (d) => (out.stderr += d));
        out.exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
        out.child = child;
        return out;
      };
      (async () => {
        if (cfg.mode === 'signal') {
          const run = start({});
          await until(() => fs.existsSync(cfg.marker));
          run.child.kill(cfg.signal);
          const ended = await run.exited;
          const leftAtExit = left();
          await until(() => left().length === 0);
          const pid = Number(fs.readFileSync(cfg.pidfile, 'utf8'));
          await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } }).catch((e) => {
            try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
            throw e;
          });
          console.log(JSON.stringify({ ...ended, leftAtExit }));
        } else if (cfg.mode === 'kill-beside') {
          // A run whose test is running is killed (its watcher then removes the worktree) as a second run starts.
          const first = start({ F2P_HANG: '1' });
          await until(() => fs.existsSync(cfg.marker));
          const second = start({});
          first.child.kill('SIGKILL');
          const ended = await Promise.all([first.exited, second.exited]);
          await until(() => left().length === 0);
          await until(() => { const l = fs.readFileSync(cfg.shimLog, 'utf8').split('\\n').filter(Boolean); return l.filter((x) => x.startsWith('start')).length === l.filter((x) => x.startsWith('end')).length; });
          console.log(JSON.stringify({ first: ended[0], second: { ...ended[1], stdout: second.stdout, stderr: second.stderr } }));
        } else {
          const runs = [start({}), start({})];
          const ended = await Promise.all(runs.map((run) => run.exited));
          console.log(JSON.stringify(ended.map((e, i) => ({ ...e, stdout: runs[i].stdout, stderr: runs[i].stderr }))));
        }
      })().catch((e) => { console.error(e.stack); process.exit(1); });
    `);
    }
    const d = spawnSync(process.execPath, [driver, JSON.stringify({ scope: scopePath, ...cfg })], { encoding: 'utf8', timeout: 120000 });
    assertSpawnDecided(d, 'the interrupt driver');
    assert.equal(d.status, 0, d.stderr);
    return JSON.parse(d.stdout);
  };
  const done = () => fs.rmSync(D, { recursive: true, force: true });
  return { D, git, probe, CMD, scenario, checkout, leftover, assertGone, hooked, drive, done };
};

const cleanup = () => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
};

// The fixture of the `scope.js test` verb's suites (`tests/scope-test-verb-*.test.js`): a run root `demo` with slice 03's
// tree `S` (a git repository holding a stub `bats` on PATH), its own temporary directory `D`, and the helpers that
// run the verb, a bash driver, and read the run trace. `verif` writes `verification.md` and commits it. `end` removes `D`.
const verifText = verif;
const testVerbFixture = () => {
  const { spawnSync } = require('node:child_process');
  const { assertSpawnDecided } = require('./spawn-verdict');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-verb-'));
  const root = path.join(D, '.superdev', 'scopes', 'demo');
  const S = path.join(root, 'slicetrees', '03');
  fs.mkdirSync(path.join(S, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'),
    '# Ledger — demo\n\n**Stage:** implementing\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 03 | #3 | t | behavior | — | in-progress | — |\n');
  const bin = path.join(D, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'bats'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const env = Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH });
  const sh = (cwd, argv) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...argv], { cwd, encoding: 'utf8', timeout: 20000 });
    assertSpawnDecided(r, 'git ' + argv[0]);
    return r.stdout.trim();
  };
  const cli = (argv) => {
    const r = spawnSync(process.execPath, [scopePath, ...argv], { cwd: S, encoding: 'utf8', timeout: 20000 });
    assertSpawnDecided(r, 'scope.js ' + argv.join(' '));
    return r;
  };
  sh(S, ['init', '-q']);
  // A path run needs its file to exist (triage #1210); verif's commit takes it into the tree.
  fs.mkdirSync(path.join(S, 'services', 'x', 'tests'), { recursive: true });
  fs.writeFileSync(path.join(S, 'services', 'x', 'tests', 'a.bats'), '');
  const verif = (full, focused, whole) => {
    fs.writeFileSync(path.join(S, 'docs', 'agents', 'verification.md'),
      verifText(full, focused, whole ? `\n## Whole-repo command\n\n\`${whole}\`\n` : ''));
    sh(S, ['add', '-A']);
    sh(S, ['commit', '-q', '--allow-empty', '-m', 'v']);
  };
  const traceFile = path.join(root, 'trace.log');
  // The trace's lines without their timestamp, and a `run` line without its duration, which the duration case reads itself.
  const lines = () => (fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8').split('\n').filter(Boolean).map((l) => {
    const w = l.split(' ').slice(1);
    return (w[2] === 'run' && w.length >= 9 ? [...w.slice(0, 8), ...w.slice(9)] : w).join(' ');
  }) : []);
  const verb = (argv, o) => {
    const r = spawnSync(process.execPath, [scopePath, 'test', ...argv], Object.assign({ cwd: S, encoding: 'utf8', timeout: 20000, env }, o));
    assertSpawnDecided(r, 'scope.js test ' + argv.join(' '));
    return r;
  };
  const bash = (script, o) => {
    const r = spawnSync('bash', ['-c', script], Object.assign({ cwd: S, encoding: 'utf8', timeout: 30000, env }, o));
    assertSpawnDecided(r, 'bash driver');
    return r;
  };
  // An empty trace starts with no digest too: a trace deleted beside a present digest is a tamper (ADR 0227).
  const reset = () => { fs.rmSync(traceFile, { force: true }); fs.rmSync(path.join(root, 'digest.json'), { force: true }); };
  const end = () => fs.rmSync(D, { recursive: true, force: true });
  return { D, root, S, bin, env, sh, cli, verif, traceFile, lines, verb, bash, reset, end };
};

// The first-moment cases of the `test` verb (`tests/scope-test-verb-first-moment-*.test.js`), one signal per suite: a
// signal at the first moment the command is alive leaves nothing running, because the handlers and the watcher exist
// before the command starts, so no instant lacks a killer. Several rounds, because the instant is a race. Each round is
// its own bash driver, so the driver's bound covers one round's work, never the sum of every round's under machine load.
const firstMoment = (sig) => {
  const assert = require('node:assert');
  const { D, verif, bash, lines, reset, end } = testVerbFixture();
  try {
    reset();
    const k = path.join(D, 'q' + sig);
    fs.mkdirSync(k);
    // The whole command's output goes to /dev/null, so neither the leader nor a leaked child holds the driver open: a round ends
    // on its `alive` verdict. On the group's SIGTERM the leader forks a late child (`late`) and exits, so the child appears
    // after the group's signal and outlives the leader, and only the watcher's repeated signal on the group ends it.
    verif(`exec >/dev/null 2>&1; trap "sleep 30 & echo \\$! > ${k}/late; exit 0" TERM; echo $$ > ${k}/pid.$$.tmp; mv ${k}/pid.$$.tmp ${k}/pid; sleep 30 & echo $! > ${k}/spid; wait`, 'true');
    // The last round waits for the child before it signals, so at least one round has the child running whatever the race does.
    let withChild = 0;
    for (let n = 1; n <= 26; n++) {
      const waitFor = n === 26 ? 'spid' : 'pid';
      const out = bash(`alive() { for f in pid spid late; do [ -s ${k}/$f ] && kill -0 $(<${k}/$f) 2>/dev/null && return 0; done; return 1; };` +
        ` rm -f ${k}/pid ${k}/spid ${k}/late; node ${scopePath} test full & V=$!;` +
        ` while [ ! -s ${k}/${waitFor} ]; do sleep 0.01; done; [ -s ${k}/spid ] && echo running; kill -${sig} $V; wait $V;` +
        ` for i in $(seq 500); do alive || break; sleep 0.02; done; sleep 0.1; alive && { echo alive; exit 0; }; echo gone`);
      assert.equal(out.stdout.trim().split('\n').pop(), 'gone', 'SIG' + sig + ' right after the start, round ' + n + ': no child is left running: ' + out.stdout + out.stderr);
      assert.deepEqual(lines(), [], 'SIG' + sig + ' right after the start, round ' + n + ': no line is written');
      if (out.stdout.includes('running')) withChild++;
    }
    assert.ok(withChild >= 1, 'SIG' + sig + ': at least one round had the command\'s child running when the signal arrived');
  } finally {
    end();
  }
};

// The bound a network-bound case runs a git call under, taken from this run rather than fixed (AGENTS.md, ADR 0086,
// INV-0009), the way tests/publish-kb-setup.js's `hangBound()` does. A healthy git call under the same bound must
// clear it however busy the machine is, so this samples a healthy local fetch through tests/spawn-verdict.js's
// `boundFromSamples`. Measured once per process.
let fetchBoundMs;
const fetchBound = () => {
  if (fetchBoundMs) return fetchBoundMs;
  const { spawnSync } = require('node:child_process');
  const { assertSpawnDecided, boundFromSamples } = require('./spawn-verdict');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-fetch-bound-'));
  try {
    const git = (args, cwd) => {
      const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL' });
      assertSpawnDecided(r, `git ${args[0]}`);
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} exited ${r.status}: ${r.stderr}`);
    };
    const origin = path.join(root, 'origin');
    const repo = path.join(root, 'repo');
    fs.mkdirSync(origin);
    fs.mkdirSync(repo);
    git(['init', '-q', '--bare', '-b', 'main'], origin);
    git(['init', '-q', '-b', 'main'], repo);
    git(['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x'], repo);
    git(['remote', 'add', 'origin', origin], repo);
    git(['push', '-q', 'origin', 'main'], repo);
    return (fetchBoundMs = boundFromSamples(() => git(['fetch', '--no-tags', 'origin', 'main'], repo)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

// Writes `.superdev/info.json` into the main working tree `repo` (the operator configuration, ADR 0207): `content` is the file's
// text, or an object that is written as JSON.
const writeOperatorConfig = (repo, content) => {
  fs.mkdirSync(path.join(repo, '.superdev'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.superdev', 'info.json'), typeof content === 'string' ? content : JSON.stringify(content));
};


module.exports = {
  fetchBound,
  writeOperatorConfig,
  testVerbFixture,
  firstMoment,
  get tmp() {
    return tmpDir();
  },
  call,
  sliceJson,
  verif,
  f2pFixture,
  scopePath,
  run,
  cleanup,
};
