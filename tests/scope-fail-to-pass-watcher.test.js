'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb (ADR 0134): the watcher of an interrupted run. It writes only inside
// its own temporary directory (INV-0154).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scopePath } = require('./scope-setup');

// The watcher of an interrupted `fail-to-pass` between its two runs: the first command has exited and its group is empty, so
// a pid reused since could name an unrelated group. The watcher signals nothing then, and still removes the worktree. The
// watcher's own `process.kill` calls are recorded by a preload, since "between the runs" is no instant a verb can be stopped at
// deterministically.
{
  const { spawn } = require('node:child_process');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-watch-'));
  (async () => {
    try {
      const log = path.join(D, 'kills');
      const pre = path.join(D, 'pre.js');
      fs.writeFileSync(pre, `const k=process.kill;process.kill=(p,s)=>{if(s!==0)require('fs').appendFileSync(${JSON.stringify(log)},p+' '+s+'\\n');return k(p,s)};`);
      const dir = path.join(D, 'wt');
      fs.mkdirSync(dir);
      const src = `require(${JSON.stringify(scopePath)}).watchMain()`;
      const w = spawn(process.execPath, ['-r', pre, '-e', src, D, dir, 'SIGKILL'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      const exited = new Promise((res) => w.on('exit', res));
      // A watcher that exits before it replies (a crash on load) fails the test instead of leaving the await unsettled.
      const replied = new Promise((res) => { w.on('message', (m) => { if (m.code !== undefined) res(); }); w.send({ command: 'true', cwd: D, sweep: true }); });
      await Promise.race([replied, exited.then((c) => { throw new Error('the watcher exited (' + c + ') before it replied'); })]);
      w.disconnect();
      // The bound's timer is unref'd, so a watcher that exits in time leaves no pending timer holding this suite open.
      await Promise.race([exited, new Promise((_, rej) => setTimeout(() => { w.kill('SIGKILL'); rej(new Error('the watcher outlasted its bound')); }, 20000).unref())]);
      const killed = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
      // The sweep after the command's exit signals its group once; nothing follows the disconnect.
      assert.equal(killed.trim().split('\n').filter(Boolean).length, 1, 'only the sweep signals the empty group: ' + killed);
      assert.equal(fs.existsSync(dir), false, 'the worktree is removed');
    } finally {
      fs.rmSync(D, { recursive: true, force: true });
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}
