'use strict';

// run-supervision.js: the detached watcher that ends a supervised command's process group, and removes its worktree, when the verb that started it dies (ADR 0150, INV-0153).

const { spawnSync } = require('child_process');

// Ends a run: on POSIX its process group gets `signal`; on Windows `taskkill /pid <pid> /t /f` ends the process and every
// child it started. A run that already exited is no error. This function runs in the watcher process too (as its source text), so it names nothing outside itself
// but `process` and `spawnSync`.
// simplicity: a process whose parent already exited is outside the taskkill tree, and one that changes its own process group
// escapes the POSIX group kill; upgrade: a Windows job object or a POSIX cgroup/subreaper if one bites.
function endRun(pid, { signal = 'SIGKILL' } = {}) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    else process.kill(-pid, signal);
  } catch { /* already gone */ }
}

// Runs `fn` while holding the repository's worktree-registry lock, a directory in its common git dir that `mkdir` creates
// atomically and that holds its owner's pid. Two runs creating, removing, or pruning worktrees at once corrupt each other's
// view of the registry: a `worktree add` reads the other's half-written `commondir`, and a `prune` unregisters a worktree
// still being created. A lock whose owner's pid is gone is a killed holder's. A waiter takes it over by renaming its pid file
// to a name of its own, so only one waiter wins it; it removes the lock when the won file still names the dead pid, and
// renames the file back when a live holder took the lock meanwhile. The lock directory stays in place throughout, so no
// `mkdir` succeeds while another run holds it. A lock with no pid file is a holder between its `mkdir` and its pid write,
// and is stale after 10 s: a waiter then claims it by creating the pid file, which the holder also creates exclusively. A wait past 120 s runs `fn` unlocked rather than refusing. The watcher runs this function as
// source text, so it names nothing outside itself but `process`, `Date`, and `Atomics`.
// simplicity: a polling lock; pids are not proof of identity (a pid reused by an unrelated process keeps a dead holder's lock
// until the wait expires); upgrade: a lock file with a process start time.
function withWorktreeLock(cwd, fn) {
  const fs = require('fs');
  const path = require('path');
  const common = require('child_process').spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (common.status !== 0) return fn();
  const lock = path.join(path.resolve(cwd, common.stdout.trim()), 'superdev-worktree.lock');
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  const ownerOf = (dir) => { try { return Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8')); } catch { return null; } };
  const pidFile = path.join(lock, 'pid');
  const writePid = () => fs.writeFileSync(pidFile, String(process.pid), { flag: 'wx' });
  const takeOver = () => {
    const pid = ownerOf(lock);
    if (pid) {
      if (alive(pid)) return false;
      const won = `${pidFile}.taken-${process.pid}`;
      try { fs.renameSync(pidFile, won); } catch { return false; }
      let owner;
      try { owner = Number(fs.readFileSync(won, 'utf8')); } catch { return false; }
      if (owner === pid) {
        fs.rmSync(lock, { recursive: true, force: true });
        return false;
      }
      try { fs.renameSync(won, pidFile); } catch { /* the lock's owner already left */ }
      return false;
    }
    try { if (Date.now() - fs.statSync(lock).mtimeMs <= 10000) return false; } catch { return false; }
    try { writePid(); return true; } catch { return false; }
  };
  const until = Date.now() + 120000;
  let held = false;
  while (!held && Date.now() < until) {
    try {
      fs.mkdirSync(lock);
    } catch (e) {
      if (e.code !== 'EEXIST') break;
      held = takeOver();
      if (!held) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      continue;
    }
    // A waiter that claimed this pid-less lock first holds it, and this run waits on. Any other failed write still holds it.
    try { writePid(); held = true; } catch (e) { held = e.code !== 'EEXIST'; }
  }
  try { return fn(); } finally { if (held) try { fs.rmSync(lock, { recursive: true, force: true }); } catch { /* already gone */ } }
}

// The watcher's body, run as `node -e` in a detached process with an IPC channel from the supervising verb. It starts each
// requested command as `sh -c` in a group of its own, so the command exists only once the watcher does and a verb killed
// first starts nothing. It reports `{code, signal}` or `{error}`, and sends nothing once the channel is closed. The closed
// channel is the one way a run ends when its verb goes: an interrupted verb closes it and exits, and any other death of the
// verb, SIGKILL included, closes it too. A command message the verb sent is read before the close, so the watcher knows
// every command it started. On the close it sends the running command's group the signal the argv names (`test` sends
// SIGTERM, so a runner that traps it finishes its cleanup; `fail-to-pass` sends SIGKILL), repeats that signal on the group
// once the leader is gone until the group is empty (at most 5 s), and removes the worktree the argv names (fail-to-pass).
function watchMain() {
  const cp = require('child_process');
  const [cwd, dir, signal, noHooksJson] = process.argv.slice(1);
  const noHooks = noHooksJson ? JSON.parse(noHooksJson) : [];
  let run = null;
  let last = null; // the pid (and group) of the last command started, kept after it exits while its group has members
  let dead = false;
  const finish = () => {
    if (dir) {
      withWorktreeLock(cwd, () => {
        const gone = cp.spawnSync('git', [...noHooks, '-C', cwd, 'worktree', 'remove', '--force', dir], { stdio: 'ignore' });
        if (gone.status !== 0) {
          require('fs').rmSync(dir, { recursive: true, force: true });
          cp.spawnSync('git', [...noHooks, '-C', cwd, 'worktree', 'prune'], { stdio: 'ignore' });
        }
      });
    }
    process.exit(0);
  };
  // The callback takes the error of a write to a channel the verb closed before the watcher read the close, which would
  // otherwise crash the watcher before it ends the run.
  const send = (m) => { if (!dead) process.send(m, () => {}); };
  process.on('disconnect', () => {
    dead = true;
    if (!last) return finish();
    if (process.platform === 'win32') { if (run) endRun(last, { signal }); return finish(); }
    // A process the command forks while the signal goes out can join the group after the signal passed it, and a leader
    // that ends on the signal leaves it behind holding the caller's output. The leader may already be gone when the channel
    // closes (it exited on its own just before), so the last command's group decides, not `run`. Once the leader is gone
    // nothing is left to finish a cleanup, so the group gets the signal again until it is empty, for at most 5 s.
    const pid = last;
    endRun(pid, { signal });
    const until = Date.now() + 5000;
    const poll = setInterval(() => {
      let alive = true;
      try { process.kill(-pid, 0); } catch { alive = false; }
      if (alive && !run) endRun(pid, { signal });
      if (!alive || Date.now() > until) { clearInterval(poll); finish(); }
    }, 50);
  });
  process.on('message', (m) => {
    if (dead) return;
    if (m.end) { if (run) endRun(run.pid); return; }
    let child;
    try {
      child = cp.spawn('sh', ['-c', m.command], { cwd: m.cwd, stdio: 'inherit', detached: true, windowsHide: true });
    } catch (e) { return send({ error: e.code || e.message }); }
    run = child;
    last = child.pid;
    child.on('error', (e) => { run = null; send({ error: e.code || e.message }); });
    child.on('exit', (code, signal) => {
      // A sweep ends what the command left behind in its group, so nothing outlives a run whose worktree goes next.
      if (m.sweep) endRun(child.pid);
      run = null;
      // An empty group takes no late fork, and its id may name an unrelated group once the pid is reused, so nothing signals it later.
      try { process.kill(-child.pid, 0); } catch { if (last === child.pid) last = null; }
      send({ code, signal });
    });
  });
}

// Starts the watcher. `stdio` is the command's own three descriptors; `cleanup` is `{cwd, dir, noHooks}` for a worktree to
// remove, `noHooks` the git config arguments that run no hook while the watcher removes it;
// `signal` is what the watcher sends the command's group when the verb dies.
// `run(command, cwd, sweep)` resolves `{code, signal}` or `{error}`. `detach()` closes the channel, which hands the running
// command to the watcher as a dead verb does; no run settles after it, and the promise it returns resolves once the watcher
// has exited, which is after it removed the worktree.
function superviseRuns(stdio, cleanup, signal) {
  const cp = require('child_process');
  const src = `const {spawnSync}=require('child_process');const endRun=${endRun};const withWorktreeLock=${withWorktreeLock};(${watchMain})()`;
  const watcher = cp.spawn(process.execPath, ['-e', src, ...(cleanup ? [cleanup.cwd, cleanup.dir] : ['', '']), signal, JSON.stringify(cleanup ? cleanup.noHooks : [])], { stdio: [...stdio, 'ipc'], detached: true, windowsHide: true });
  watcher.on('error', () => {});
  let detached = false;
  const sup = {
    end: () => { try { watcher.send({ end: true }); } catch { /* the channel is closed */ } },
    stop: () => watcher.kill('SIGKILL'),
    detach: () => new Promise((resolve) => {
      detached = true;
      if (watcher.exitCode !== null || watcher.signalCode !== null) return resolve();
      watcher.once('exit', () => resolve());
      if (watcher.connected) watcher.disconnect();
    }),
    run: (command, cwd, sweep) => new Promise((resolve) => {
      const settle = (m) => { watcher.off('message', settle); watcher.off('exit', onExit); if (!detached) resolve(m); };
      const onExit = () => settle({ error: 'watcher-exited' });
      watcher.on('message', settle);
      watcher.on('exit', onExit);
      try { watcher.send({ command, cwd, sweep }); } catch { settle({ error: 'watcher-exited' }); }
    }),
  };
  return sup;
}

module.exports = { endRun, watchMain, superviseRuns, withWorktreeLock };
