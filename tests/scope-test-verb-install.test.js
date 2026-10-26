'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb, the install it runs from: the `sh` it starts, `endRun`, the win32
// watcher, and an install missing or breaking a module (ADR 0139, ADR 0150, INV-0153, INV-0159).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertSpawnDecided } = require('./spawn-verdict');

const scopePath = require.resolve('../plugin/scripts/scope.js');

// The command runs under `sh` from PATH, and a run ends through `endRun`, whose platform and kill spawner are injectable
// (ADR 0150, INV-0153).
{
  const { spawnSync } = require('node:child_process');
  const scope = require('../plugin/scripts/scope.js');

  // A CRLF `verification.md` yields the command an LF one does.
  const doc = (nl) => ['# V', '', '```sh', 'echo a', 'echo b', '```', '', '```sh', 'echo f {paths}', '```', ''].join(nl);
  assert.deepEqual(scope.verificationCommandsOf(doc('\r\n'), true), scope.verificationCommandsOf(doc('\n'), true), 'CRLF reads as LF');
  assert.equal(scope.verificationCommandsOf(doc('\r\n'), true).full, 'echo a\necho b', 'no carriage return stays in the command');

  // On win32, ending a run is `taskkill /pid <pid> /t /f`; an exited run is no error, on either platform.
  const calls = [];
  scope.endRun(4242, { platform: 'win32', spawn: (cmd, args) => { calls.push([cmd, ...args]); return { status: 128 }; } });
  assert.deepEqual(calls, [['taskkill', '/pid', '4242', '/t', '/f']], 'win32 ends the process tree through taskkill');
  assert.doesNotThrow(() => scope.endRun(4242, { platform: 'win32', spawn: () => { throw new Error('gone'); } }), 'a failed win32 kill is no error');
  assert.doesNotThrow(() => scope.endRun(2 ** 22 + 12345, { platform: 'linux' }), 'a POSIX kill of an exited run is no error');

  // `scope.js test` starts the command as `sh -c`, found on PATH.
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-sh-'));
  try {
    const bin = path.join(D, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'sh'), '#!/bin/sh\necho SH-STUB\nexec /bin/sh "$@"\n', { mode: 0o755 });
    fs.mkdirSync(path.join(D, 'docs', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(D, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\necho ran\n```\n');
    assertSpawnDecided(spawnSync('git', ['init', '-q'], { cwd: D }), 'git init');
    const r = spawnSync(process.execPath, [scopePath, 'test', 'full'], { cwd: D, encoding: 'utf8', timeout: 20000, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH } });
    assertSpawnDecided(r, 'scope.js test under a stub sh');
    assert.match(r.stdout, /SH-STUB/, 'the command ran under the PATH sh: ' + r.stdout + r.stderr);
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}

// On win32 the watcher ends a running command through `taskkill` when its channel closes, and leaves an exited one alone.
// The watcher runs from its own source text, as `superviseRuns` builds it, with the platform set to win32 and the kill
// spawner replaced by one that logs its argv. A bounded driver process holds the IPC channel, sends the run, and closes it.
{
  const { spawnSync } = require('node:child_process');
  const scope = require('../plugin/scripts/scope.js');
  // Runs a command under the win32 watcher and closes the channel: while it runs (`exitFirst` false) or once it exited,
  // leaving a background `sleep` in its group, which the POSIX branch would still signal and taskkill no longer reaches.
  // The test ends that group itself, since the logged taskkill kills nothing.
  const watch = (D, exitFirst) => {
    const log = path.join(D, 'kill.log');
    const src = `Object.defineProperty(process,'platform',{value:'win32'});const spawnSync=(c,a)=>{require('fs').appendFileSync(${JSON.stringify(log)},[c,...a].join(' ')+'\\n');return {status:0}};const endRun=${scope.endRun};(${scope.watchMain})()`;
    const driver = `const cp=require('child_process'),fs=require('fs');
      const [src,cwd,exitFirst]=process.argv.slice(1);
      const w=cp.spawn(process.execPath,['-e',src,'','','SIGTERM'],{stdio:['ignore','ignore','ignore','ipc']});
      w.on('exit',(code)=>process.stdout.write(String(code)));
      if (exitFirst==='1') w.on('message',()=>w.disconnect());
      else { const t=setInterval(()=>{ if (fs.existsSync(cwd+'/pid')) { clearInterval(t); w.disconnect(); } },20); }
      w.send({command:exitFirst==='1'?'sleep 30 & echo $$ > pid.tmp && mv pid.tmp pid':'echo $$ > pid.tmp && mv pid.tmp pid && exec sleep 30',cwd});`;
    const r = spawnSync(process.execPath, ['-e', driver, src, D, exitFirst ? '1' : '0'], { encoding: 'utf8', timeout: 20000 });
    const pid = fs.existsSync(path.join(D, 'pid')) ? fs.readFileSync(path.join(D, 'pid'), 'utf8').trim() : null;
    if (pid) try { process.kill(-Number(pid), 'SIGKILL'); } catch { /* already gone */ }
    assertSpawnDecided(r, 'the win32 watcher driver');
    return { exit: r.stdout, pid, log: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
  };
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-watch-win32-'));
  try {
    const running = watch(fs.mkdtempSync(path.join(D, 'a-')), false);
    assert.equal(running.exit, '0', 'the watcher exits once the channel closes');
    assert.equal(running.log, `taskkill /pid ${running.pid} /t /f\n`, 'a running command ends through taskkill');
    const exited = watch(fs.mkdtempSync(path.join(D, 'b-')), true);
    assert.equal(exited.exit, '0', 'the watcher exits once the channel closes after its command exited');
    assert.equal(exited.log, '', 'an exited command gets no taskkill, even with a process it left running');
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}

// An install missing lib/shell-words.js, which the command classifier needs, refuses `test -- <command>` as no test run with its usual
// one-line refusal, never a stack trace (INV-0159).
{
  const { spawnSync } = require('node:child_process');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-no-scanner-'));
  try {
    const plugin = path.dirname(path.dirname(scopePath));
    const install = path.join(D, 'install');
    for (const dir of ['scripts', 'lib']) fs.cpSync(path.join(plugin, dir), path.join(install, dir), { recursive: true, filter: (src) => path.basename(src) !== 'shell-words.js' });
    assert.ok(!fs.existsSync(path.join(install, 'lib', 'shell-words.js')), 'the install lacks the scanner');
    const verb = (argv) => {
      const r = spawnSync(process.execPath, [path.join(install, 'scripts', 'scope.js'), 'test', ...argv], { cwd: D, encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(r, 'scope.js test ' + argv.join(' ') + ' without the scanner');
      return r;
    };
    const r = verb(['--', 'echo', 'hi']);
    assert.notEqual(r.status, 0, 'a command no classifier can read is refused');
    assert.match(r.stderr, /not a test run, so nothing runs/, 'the refusal names the command as no test run');
    assert.ok(!/\n\s+at /.test(r.stderr), 'the refusal carries no stack trace');
    assert.ok(!r.stdout.includes('hi'), 'and nothing runs');
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}

// An install whose lib/test-runs.js fails to load for any reason but a missing module stays visible: `test -- <command>` exits nonzero
// with that error, and the one-line "not a test run" refusal does not cover it up.
{
  const { spawnSync } = require('node:child_process');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-broken-classifier-'));
  try {
    const plugin = path.dirname(path.dirname(scopePath));
    const install = path.join(D, 'install');
    for (const dir of ['scripts', 'lib']) fs.cpSync(path.join(plugin, dir), path.join(install, dir), { recursive: true });
    fs.writeFileSync(path.join(install, 'lib', 'test-runs.js'), "'use strict';\nthrow new Error('classifier-load-boom');\n");
    const r = spawnSync(process.execPath, [path.join(install, 'scripts', 'scope.js'), 'test', '--', 'echo', 'hi'], { cwd: D, encoding: 'utf8', timeout: 20000 });
    assertSpawnDecided(r, 'scope.js test -- with a classifier that throws on load');
    assert.notEqual(r.status, 0, 'a classifier that throws on load fails the verb');
    assert.match(r.stderr, /classifier-load-boom/, 'the load error is visible');
    assert.ok(!/not a test run/.test(r.stderr), 'the refusal does not hide it');
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}
