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

// The command runs under `sh` from PATH, and a run ends through `endRun` (ADR 0150, INV-0153).
{
  const { spawnSync } = require('node:child_process');
  const scope = require('../plugin/scripts/scope.js');

  // A CRLF `verification.md` yields the command an LF one does.
  const doc = (nl) => ['# V', '', '```sh', 'echo a', 'echo b', '```', '', '```sh', 'echo f {paths}', '```', ''].join(nl);
  assert.deepEqual(scope.verificationCommandsOf(doc('\r\n'), true), scope.verificationCommandsOf(doc('\n'), true), 'CRLF reads as LF');
  assert.equal(scope.verificationCommandsOf(doc('\r\n'), true).full, 'echo a\necho b', 'no carriage return stays in the command');

  // On win32, ending a run is `taskkill /pid <pid> /t /f`; an exited run is no error, on either platform.
  // Each case overrides `process.platform` and replaces `child_process.spawnSync` before a fresh require of run-supervision.js,
  // which binds the stub at load; both are restored afterwards.
  const cp = require('node:child_process');
  const supervisionPath = require.resolve('../plugin/lib/run-supervision.js');
  const platformDesc = Object.getOwnPropertyDescriptor(process, 'platform');
  const realSpawnSync = cp.spawnSync;
  const killDesc = Object.getOwnPropertyDescriptor(process, 'kill');
  const withEndRun = (platform, stubSpawn, fn) => {
    Object.defineProperty(process, 'platform', { ...platformDesc, value: platform });
    cp.spawnSync = stubSpawn;
    delete require.cache[supervisionPath];
    try { fn(require(supervisionPath).endRun); } finally {
      Object.defineProperty(process, 'platform', platformDesc);
      cp.spawnSync = realSpawnSync;
      delete require.cache[supervisionPath];
    }
  };
  const calls = [];
  withEndRun('win32', (cmd, args) => { calls.push([cmd, ...args]); return { status: 128 }; }, (endRun) => endRun(4242));
  assert.deepEqual(calls, [['taskkill', '/pid', '4242', '/t', '/f']], 'win32 ends the process tree through taskkill');
  const gone = [];
  withEndRun('win32', () => { gone.push('called'); throw new Error('gone'); }, (endRun) => assert.doesNotThrow(() => endRun(4242), 'a failed win32 kill is no error'));
  assert.deepEqual(gone, ['called'], 'the throwing spawner was the one called');
  const killed = [];
  withEndRun('linux', () => { throw new Error('POSIX never spawns'); }, (endRun) => {
    assert.doesNotThrow(() => endRun(2 ** 22 + 12345), 'a POSIX kill of an exited run is no error');
    const realKill = process.kill;
    process.kill = (pid, sig) => { killed.push([pid, sig]); };
    try { endRun(77); } finally { process.kill = realKill; }
  });
  assert.deepEqual(killed, [[-77, 'SIGKILL']], 'POSIX ends the process group');
  assert.equal(Object.getOwnPropertyDescriptor(process, 'kill')?.value, killDesc?.value, 'process.kill restored');

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
