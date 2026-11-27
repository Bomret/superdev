'use strict';

// test-slots.js: the repository's pool of Test slots, which the `test`, `fail-to-pass`, and `prepare` verbs hold while their command runs (ADR 0291, INV-0212).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { gitSpawn } = require('./git-spawn.js');
const { drivePath } = require('./drive-path.js');
const { operatorCount } = require('./operator-config.js');

const POLL_MS = 200;
const GRACE_MS = 10000; // a slot directory with no record, or a record that does not parse, is a claim still being written until then
const BOOT_MARGIN_MS = 600000; // two boot stamps closer than this name one boot: a wall-clock step moves a stamp by that much at most
const RECORD = 'record.json';

const bootStamp = () => Date.now() - os.uptime() * 1000;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const groupAlive = (pgid) => process.platform !== 'win32' && pgid > 0 && alive(-pgid);
const olderThanGrace = (p) => { try { return Date.now() - fs.statSync(p).mtimeMs > GRACE_MS; } catch { return false; } };
const parse = (text) => { try { const r = JSON.parse(text); return r && typeof r === 'object' && r.pid > 0 ? r : null; } catch { return null; } };

// The record's holder still holds the slot: a record of this boot whose verb lives, or, on POSIX, whose command's group still
// has a member. Windows has no process group, so there the verb's pid alone decides.
const held = (r) => Math.abs(r.boot - bootStamp()) <= BOOT_MARGIN_MS && (alive(r.pid) || groupAlive(r.group));

// The pool directory of the repository `cwd` is in, in its git common dir, so every checkout and worktree shares it; null outside a repository.
function poolDir(cwd) {
  const common = gitSpawn(['rev-parse', '--git-common-dir'], cwd, { timeout: 60000, killSignal: 'SIGKILL' });
  if (common.status !== 0) return null;
  return path.join(path.resolve(cwd, drivePath(common.stdout.trim())), 'superdev-test-slots');
}

// Frees slot `dir` when it is stale, so the next claim can take it; reports the holder that keeps it otherwise. A stale record
// is taken by renaming it to a name of this waiter's own, so one waiter wins it; the slot goes only when the won file is still
// the record this waiter judged, and the file goes back otherwise. A slot with no record past the grace is taken by creating the
// record, which a holder also creates exclusively.
function judge(dir) {
  const file = path.join(dir, RECORD);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code !== 'ENOENT') return { holder: null };
    if (!olderThanGrace(dir)) return { holder: null };
    fs.rmSync(dir, { recursive: true, force: true });
    return { holder: null, freed: true };
  }
  const r = parse(text);
  if (r && held(r)) return { holder: r };
  if (!r && !olderThanGrace(file)) return { holder: null };
  const won = `${file}.taken-${process.pid}`;
  try { fs.renameSync(file, won); } catch { return { holder: r }; }
  let same = false;
  try { same = fs.readFileSync(won, 'utf8') === text && (r || olderThanGrace(won)); } catch { return { holder: r }; }
  if (same) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { holder: r, freed: true };
  }
  try { fs.renameSync(won, file); } catch { /* the slot's holder already left */ }
  return { holder: r };
}

// Writes `record` to `file` whole: through a file of this process's own, renamed over it, so no reader sees half a record.
function writeRecord(file, record) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record));
  fs.renameSync(tmp, file);
}

// Waits for, then holds, one of the repository's test slots. Resolves `{ release, setGroup }`: `setGroup(pgid)` records the
// process group of each command the caller starts, `release()` frees the slot. A waiter prints one stderr line, once, naming the
// run that holds the slot it waits on; a SIGINT, SIGTERM, or SIGHUP ends it at once, holding nothing. Outside a repository, or
// where the pool cannot be written, the caller runs with no slot and one stderr line says so.
async function acquireSlot(cwd, { kind, tree }) {
  const none = { release: () => {}, setGroup: () => {} };
  const pool = poolDir(cwd);
  if (!pool) {
    process.stderr.write(`${kind}: not in a git repository; the run takes no test slot\n`);
    return none;
  }
  try { fs.mkdirSync(pool, { recursive: true }); fs.accessSync(pool, fs.constants.W_OK); } catch (e) {
    process.stderr.write(`${kind}: the test slot pool ${pool} cannot be written (${e.code || e.message}); the run takes no test slot\n`);
    return none;
  }
  const count = operatorCount(cwd, 'verification', 'testSlots', 1, 1, 64);
  const record = { pid: process.pid, group: null, boot: bootStamp(), kind, tree };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const onSignal = (sig) => process.exit(128 + os.constants.signals[sig]);
  for (const sig of signals) process.on(sig, onSignal);
  let said = false;
  try {
    for (;;) {
      let shown = null;
      let freed = false;
      for (let n = 1; n <= count; n++) {
        const dir = path.join(pool, String(n));
        const file = path.join(dir, RECORD);
        try {
          fs.mkdirSync(dir);
        } catch (e) {
          if (e.code !== 'EEXIST') throw e;
          const j = judge(dir);
          if (j.freed) freed = true;
          else if (!shown) shown = { holder: j.holder, file };
          continue;
        }
        // A waiter that claimed this record-less slot first holds it, and this run waits on.
        try { fs.writeFileSync(file, JSON.stringify(record), { flag: 'wx' }); } catch { continue; }
        const slot = {
          setGroup: (pgid) => { record.group = pgid; try { writeRecord(file, record); } catch { /* the slot is still held by its pid */ } },
          release: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ } },
        };
        return slot;
      }
      if (!said && shown) {
        said = true;
        const h = shown.holder;
        process.stderr.write(`${kind}: waiting for a test slot; held by ${h ? `${h.kind} in ${h.tree} (pid ${h.pid})` : 'a run whose record is not written yet'}, record ${shown.file}\n`);
      }
      // A slot that judging just freed is claimed at once, with no wait.
      if (!freed) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  } catch (e) {
    process.stderr.write(`${kind}: the test slot pool ${pool} cannot be written (${e.code || e.message}); the run takes no test slot\n`);
    return none;
  } finally {
    for (const sig of signals) process.off(sig, onSignal);
  }
}

module.exports = { acquireSlot };
