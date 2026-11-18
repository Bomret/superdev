'use strict';

// ci.js: the `ci` verb, a commit's check status judged against the **Named check**s the `## CI` section of that commit's
// `docs/agents/verification.md` lists (ADR 0255, INV-0191). It reads and writes nothing of a run.

const path = require('path');
const { fail } = require('./refusal.js');
const { resolveCommit, fileAt } = require('./git-spawn.js');
const { drivePath } = require('./drive-path.js');
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

// `ci --sha <sha> [--root <path>]`: stdin holds `name<TAB>state[<TAB>link]` lines. Prints `ci: <verdict> <sha>`, then one
// `<pending|finished|failed><TAB><name><TAB><state>[<TAB><link>]` line per named check that is not green, and sets the
// verdict's exit status.
function verbCi(cwd, args, input) {
  const take = (flag) => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const v = args[i + 1];
    if (!v) fail(`ci: ${flag} needs a value`);
    args.splice(i, 2);
    return v;
  };
  const sha = take('--sha');
  const root = take('--root');
  if (!sha) fail('ci needs --sha <sha>');
  if (args.length) fail(`ci: unrecognized argument "${args[0]}"`);
  const repo = root ? path.resolve(cwd, drivePath(root)) : cwd;
  const verdict = (name, sha, reason) => {
    console.log(`ci: ${name} ${sha}${reason ? ' ' + reason : ''}`);
    process.exitCode = EXIT[name];
  };
  const commit = resolveCommit(sha, repo);
  if (!commit) return verdict('cannot-judge', sha, `(${sha} resolves to no commit)`);
  const text = fileAt(commit, 'docs/agents/verification.md', repo);
  if (text === null) return verdict('cannot-judge', commit, '(git cannot read docs/agents/verification.md at that commit)');
  const checks = namedChecksOf(text);
  if (checks.state === 'malformed') return verdict('cannot-judge', commit, '(## CI holds both none and a check name)');
  if (checks.state === 'none') return verdict('cannot-judge', commit, '(no named checks at that commit)');
  const byName = new Map(checks.names.map((n) => [n, []]));
  for (const line of String(input || '').split('\n')) {
    const fields = line.replace(/\r$/, '').split('\t');
    if (fields.length < 2) continue;
    const reports = byName.get(fields[0].trim());
    if (reports) reports.push({ state: fields[1].trim().toLowerCase(), link: (fields[2] || '').trim() });
  }
  const standing = checks.names.map((name) => ({ name, ...judge(byName.get(name)) })).filter((s) => s.kind !== 'green');
  const name = standing.some((s) => s.kind === 'failed') ? 'failed' : standing.length ? 'not-green' : 'green';
  verdict(name, commit);
  for (const s of standing) console.log([s.kind, s.name, s.state, ...(s.link ? [s.link] : [])].join('\t'));
}

module.exports = { verbCi };
