'use strict';

// ci.js: the `ci` verb, a commit's check status judged against the **Named check**s the `## CI` section of that commit's
// `docs/agents/verification.md` lists (ADR 0255, INV-0191), and its `--wait` form, the one bounded wait on those checks
// through a code-host read script (ADR 0280, INV-0192). It reads and writes nothing of a run.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { fail } = require('./refusal.js');
const { drivePath } = require('./drive-path.js');
const { endRun } = require('./run-supervision.js');
const { resolveCommit, fileAt } = require('./git-spawn.js');
const { takeOption, takeRootOption } = require('./options.js');
const { namedChecksOf } = require('./verification.js');

// The exit status of each **CI verdict**. A usage refusal exits 1.
const EXIT = { green: 0, 'cannot-judge': 2, 'not-green': 3, failed: 4 };
const FAILED = new Set(['failure', 'error', 'timed_out', 'cancelled', 'action_required', 'startup_failure']);
const FINISHED = new Set(['skipped', 'neutral', 'stale', 'warning']);

// One named check's standing from the states its input lines carry: green only when every line reads success; failed when
// any line fails; pending when a line reads any other state, or none exists; finished-not-green otherwise.
function judge(reports) {
  if (!reports.length) return { kind: 'pending', state: 'missing' };
  const failed = reports.find((r) => FAILED.has(r.state));
  if (failed) return { kind: 'failed', ...failed };
  const pending = reports.find((r) => r.state !== 'success' && !FINISHED.has(r.state));
  if (pending) return { kind: 'pending', ...pending };
  const finished = reports.find((r) => FINISHED.has(r.state));
  return finished ? { kind: 'finished', ...finished } : { kind: 'green' };
}

// `ci --sha <sha> [--root <path>]`: stdin holds `name<TAB>state[<TAB>link]` lines. Prints `ci: <verdict> <sha>`, with `(no check report read)` after it where no
// input line holds a name and a state, then one
// `<pending|finished|failed><TAB><name><TAB><state>[<TAB><link>]` line per named check that is not green, and sets the
// verdict's exit status.
function verbCi(cwd, args, input) {
  const sha = takeOption(args, '--sha', 'ci: ', (v) => v === '--root');
  const root = takeRootOption(args, 'ci: ');
  if (!sha) fail('ci needs --sha <sha>');
  if (args.includes('--read')) fail('ci: --read needs --wait');
  if (args.length) fail(`ci: unrecognized argument "${args[0]}"`);
  const repo = root ? path.resolve(cwd, root) : cwd;
  printJudgment(ciJudgment(repo, sha, input));
}

// Prints a judgment as the plain verb does, its verdict line then one line per named check that is not green, and sets its exit status.
function printJudgment(judged) {
  console.log(`ci: ${judged.kind} ${judged.at}${judged.reason ? ' ' + judged.reason : ''}`);
  process.exitCode = EXIT[judged.kind];
  for (const s of judged.standing) console.log([s.kind, s.name, s.state, ...(s.link ? [s.link] : [])].join('\t'));
}

// The exit status of a wait whose reads failed three times in a row, and of a wait a signal stopped.
const READ_FAILED_EXIT = 5;
const STOPPED_EXIT = 6;
const INTERVAL_MS = 30000;
const READ_MAX_MS = 120000;
const READ_MIN_MS = 10000;
const FAILED_READS_CAP = 3;

// One read: the script text, its `<sha>` placeholders already filled, run by bash as the leader of its own process
// group, so `stop` ends the read and every child it started. A read past `boundMs` is ended the same way. Resolves
// `{ ok, out, err }`: `ok` only for a read that exited 0 on its own.
function runRead(script, cwd, boundMs, onStart) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('bash', ['-c', script], { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      resolve({ ok: false, out: '', err: `the read could not start: ${e.message}` });
      return;
    }
    let out = '';
    let err = '';
    let killed = false;
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    const stop = () => { killed = true; endRun(child.pid); };
    const timer = setTimeout(stop, boundMs);
    onStart(stop);
    child.on('error', (e) => { err += `the read could not start: ${e.message}\n`; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      onStart(null);
      if (killed) err += `the read was ended at its ${Math.round(boundMs / 1000)} s bound\n`;
      else if (code !== 0) err += err ? '' : `the read exited ${signal || code}\n`;
      resolve({ ok: !killed && code === 0, out, err });
    });
  });
}

// `ci --sha <sha> --wait --read <script> [--timeout <s>] [--root <path>]`: re-runs the read script every 30 s and judges
// each read like the plain verb, ending at the first green, failed, or cannot-judge verdict, as soon as no named check is
// pending or missing, or with one final read at the deadline (default 3600 s). Three failed reads in a row exit 5 on a
// `ci: read-failed <sha>` line with that read's stderr; SIGTERM, SIGINT, or SIGHUP ends the running read's process
// group, prints `ci: stopped <sha>`, and exits 6. Reads no stdin.
async function verbCiWait(cwd, args) {
  const sha = takeOption(args, '--sha', 'ci: ', (v) => v === '--root');
  const root = takeRootOption(args, 'ci: ');
  const readPath = takeOption(args, '--read', 'ci: ');
  const timeoutText = takeOption(args, '--timeout', 'ci: ');
  const wi = args.indexOf('--wait');
  if (wi >= 0) args.splice(wi, 1);
  if (!sha) fail('ci needs --sha <sha>');
  if (!readPath) fail('ci: --wait needs --read <script>');
  if (args.length) fail(`ci: unrecognized argument "${args[0]}"`);
  if (timeoutText !== undefined && !/^[1-9][0-9]*$/.test(timeoutText)) fail(`ci: --timeout needs a positive whole number of seconds, not "${timeoutText}"`);
  let scriptText;
  try { scriptText = fs.readFileSync(path.resolve(cwd, drivePath(readPath)), 'utf8'); } catch (e) { fail(`ci: --read "${readPath}" cannot be read (${e.code || e.message})`); }
  const repo = root ? path.resolve(cwd, root) : cwd;

  // A head or a configuration that no read can change is judged before the first read.
  const before = ciJudgment(repo, sha, '');
  if (before.kind === 'cannot-judge') return printJudgment(before);
  const commit = before.at;
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) return printJudgment({ ...before, kind: 'cannot-judge', standing: [], reason: `(${sha} resolves to no full commit)` });
  const script = scriptText.split('<sha>').join(commit);

  let stopRead = null;
  let wake = null;
  let stopped = false;
  const onSignal = () => {
    stopped = true;
    if (stopRead) stopRead();
    if (wake) wake();
  };
  const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];
  for (const s of SIGNALS) process.on(s, onSignal);
  try {
    const deadline = Date.now() + Number(timeoutText || 3600) * 1000;
    let failedInRow = 0;
    let lastJudged = null;
    let final = false;
    for (;;) {
      const left = deadline - Date.now();
      if (left <= 0) final = true;
      const bound = Math.min(READ_MAX_MS, Math.max(READ_MIN_MS, left));
      const read = await runRead(script, repo, bound, (stop) => (stopRead = stop));
      if (stopped) break;
      if (read.ok) {
        failedInRow = 0;
        const judged = ciJudgment(repo, commit, read.out);
        lastJudged = judged;
        const settled = judged.kind !== 'not-green' || !judged.standing.some((s) => s.kind === 'pending');
        if (settled || final) return printJudgment(judged);
      } else {
        failedInRow += 1;
        if (failedInRow >= FAILED_READS_CAP) {
          console.log(`ci: read-failed ${commit}`);
          if (read.err.trim()) console.log(read.err.trimEnd());
          process.exitCode = READ_FAILED_EXIT;
          return;
        }
        if (final) return printJudgment(lastJudged || ciJudgment(repo, commit, ''));
      }
      const pause = Math.min(INTERVAL_MS, Math.max(0, deadline - Date.now()));
      if (pause === deadline - Date.now()) final = true;
      await new Promise((resolve) => {
        const t = setTimeout(resolve, pause);
        wake = () => { clearTimeout(t); resolve(); };
      });
      wake = null;
      if (stopped) break;
    }
    console.log(`ci: stopped ${commit}`);
    process.exitCode = STOPPED_EXIT;
  } finally {
    for (const s of SIGNALS) process.removeListener(s, onSignal);
  }
}

// The judgment of the check-status `input` lines (`name<TAB>state[<TAB>link]`) for commit `sha` in `repo`, against the named
// checks of that commit's `## CI` section: `{ kind, at, reason, standing, malformed }`, `kind` one of the **CI verdict**s, `at` the
// resolved commit (`sha` as given where it resolves to none), `standing` the named checks that are not green, and `malformed`
// true where the section holds both `none` and a name.
function ciJudgment(repo, sha, input) {
  const verdict = (kind, at, reason, malformed) => ({ kind, at, reason, standing: [], malformed: Boolean(malformed) });
  const commit = resolveCommit(sha, repo);
  if (!commit) return verdict('cannot-judge', sha, `(${sha} resolves to no commit)`);
  const text = fileAt(commit, 'docs/agents/verification.md', repo);
  if (text === null) return verdict('cannot-judge', commit, '(git cannot read docs/agents/verification.md at that commit)');
  const checks = namedChecksOf(text);
  if (checks.state === 'malformed') return verdict('cannot-judge', commit, '(## CI holds both none and a check name)', true);
  if (checks.state === 'none') return verdict('cannot-judge', commit, '(no named checks at that commit)');
  const byName = new Map(checks.names.map((n) => [n, []]));
  let read = false;
  for (const line of String(input || '').split('\n')) {
    const fields = line.replace(/\r$/, '').split('\t');
    if (fields.length < 2) continue;
    const checkName = fields[0].trim();
    const state = fields[1].trim().toLowerCase();
    if (!checkName || !state) continue;
    read = true;
    const reports = byName.get(checkName);
    if (reports) reports.push({ state, link: (fields[2] || '').trim() });
  }
  const standing = checks.names.map((name) => ({ name, ...judge(byName.get(name)) })).filter((s) => s.kind !== 'green');
  const name = standing.some((s) => s.kind === 'failed') ? 'failed' : standing.length ? 'not-green' : 'green';
  // No `name<TAB>state` line at all is a read that delivered nothing: still not green, and named as such.
  return { ...verdict(name, commit, read ? '' : '(no check report read)'), standing };
}

module.exports = { verbCi, verbCiWait, ciJudgment };
