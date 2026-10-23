'use strict';

// suite-base-get.js: the ledger's `**Suite:**` and `**Base:**` records, their reuse and range-base reads, and the `get` read verb.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const {
  SUITE_RESULTS, readLines, headerRe, getHeader, readBullets, insertHeader, writeLines, tableRowIndexes, splitRow,
} = require('./ledger.js');
const { isTestPath } = require('./verification.js');
const { gitSpawn, resolveCommit, fileAt } = require('./git-spawn.js');
const { readTrace } = require('./trace-log.js');
const { DENIAL_PREFIX, RESET_PREFIX } = require('./ledger-records.js');

// `**Suite:**` records the last full-suite run: its result, the commit it ran on, and its kind
// (`references/scope-mode.md` `## The ledger`, INV-0017, ADR 0105 — a later step reuses a green record
// whose commit is the scope branch's current tip instead of running the suite again). Set-only: the
// read half is `get suite`. `sha` must resolve to a commit in the caller's repository — a refusal here
// is what keeps a typo or a stale sha from being trusted as a real record later. The record carries the
// *resolved* full commit, never the literal argument: a ref like `HEAD` moves, and a short sha never
// string-matches the branch tip's full sha that a later reuse compares it against (INV-0017). `whole`
// marks a run of the repository's whole-repo command rather than its (possibly affected-form) full
// command — a step that needs a whole-repo run reuses only a record carrying it (ADR 0105).
function verbSuite(cwd, root, sub, result, sha, whole) {
  if (sub !== 'set') fail(`unknown suite subcommand "${sub}" — use set`);
  if (!SUITE_RESULTS.includes(result)) fail(`unknown suite result "${result}" (${SUITE_RESULTS.join('|')})`);
  if (!sha) fail('suite set needs a <sha>');
  const commit = resolveCommit(sha, cwd);
  if (!commit) fail(`sha "${sha}" does not resolve to a commit in this repository`);
  const lines = readLines(root);
  const value = `${result} @ ${commit}${whole ? ' whole' : ''}`;
  const at = lines.findIndex((l) => headerRe('Suite').test(l));
  if (at >= 0) {
    lines[at] = `**Suite:** ${value}`;
    writeLines(root, lines);
    return;
  }
  writeLines(root, insertHeader(lines, 'Suite', value));
}

// INV-0017's reuse rule: a green suite record is reusable on the exact commit it was recorded on, and
// only where the run trace backs it (the latest matching `run` line there reads `pass` and `clean`).
// No slice store commits its own records on the scope branch (ADR 0110), so a commit since the record
// can change what a suite run exercises. The one exception is a Markdown-only range (ADR 0128): see
// `carryRefusal`. Reads via `fail()` (a thrown refusal, exit 1) for "not reusable" — the same channel
// every other verb already uses to report a no — and prints `reusable` (exit 0) when it is.
// `whole` is INV-0017's kind gate (ADR 0105): a step that needs a whole-repo run passes it, and refuses
// a record with no kind even when it is green and tip-matched; a step content with either kind omits it.
function verbSuiteReusable(cwd, root, branch, whole) {
  const raw = getHeader(readLines(root), 'Suite');
  if (!raw) fail('no suite record to reuse');
  const m = raw.match(/^(\S+)\s+@\s+(\S+)(?:\s+(whole))?$/);
  if (!m) fail(`unreadable suite record: ${raw}`);
  const [, result, recordedSha, kind] = m;
  if (result !== 'green') fail(`suite record is ${result}, not green — not reusable`);
  if (whole && kind !== 'whole') fail('suite record carries no kind — a whole-repo run needs one');
  const tip = resolveCommit(branch, cwd);
  if (!tip) fail(`branch "${branch}" does not resolve to a commit`);
  // The run trace backs the record (ADR 0117, INV-0017): the latest `run` line of the matching kind at
  // the recorded commit, compared against the full sha, must read `pass` and `clean`.
  // For a plain check, either `full` or `whole` kind is accepted; for --whole, only `whole`.
  // simplicity: exact full-sha match, so an abbreviated sha in a trace line never backs reuse; upgrade: prefix match if a writer abbreviates
  const acceptedKinds = whole ? ['whole'] : ['full', 'whole'];
  let traceRaw = '';
  try {
    traceRaw = fs.readFileSync(path.join(root, 'trace.log'), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const events = readTrace(traceRaw).filter((e) => e.kind === 'run');
  const runs = events.filter((e) => acceptedKinds.includes(e.fields[0]) && e.fields[2] === recordedSha);
  const kindList = acceptedKinds.join(' or ');
  if (!runs.length) fail(`no ${kindList} run recorded at ${recordedSha} in the run trace — not reusable`);
  const [, result2, , tree] = runs[runs.length - 1].fields;
  if (result2 !== 'pass' || tree !== 'clean') fail(`latest ${kindList} run at ${recordedSha} is ${result2} on a ${tree} tree — not reusable`);
  if (tip !== recordedSha) {
    const why = carryRefusal(cwd, recordedSha, tip, events);
    if (why) fail(`suite record @ ${recordedSha} predates tip ${tip}: ${why} — not reusable`);
  }
  console.log('reusable');
}

// ADR 0128: a green record at `from` also covers `to` when `from` is an ancestor of `to`, every path
// changed between them is Markdown, the latest test-command run at `to` passed on a clean tree, and no
// full, whole, or path run at `to` failed. Returns the reason the carry fails, or null when it holds.
function carryRefusal(cwd, from, to, events) {
  if (gitSpawn(['merge-base', '--is-ancestor', from, to], cwd).status !== 0) return 'it is not an ancestor of the tip';
  const diff = gitSpawn(['diff', '--name-only', '--no-renames', '-z', from, to], cwd);
  if (diff.status !== 0) return 'git could not list the paths changed since';
  const paths = diff.stdout.split('\0').filter(Boolean);
  const other = paths.find((p) => !p.endsWith('.md'));
  if (other) return `${other} changed since and is not Markdown`;
  const VERIFICATION = 'docs/agents/verification.md';
  if (paths.includes(VERIFICATION)) return `${VERIFICATION} is the verification configuration`;
  // The test paths come from the tip commit, never a working tree; no file there means the defaults.
  const config = fileAt(to, VERIFICATION, cwd);
  if (config === null) return 'git could not read the tip\'s verification configuration';
  const test = paths.find((p) => isTestPath(config, p));
  if (test) return `${test} is a test path`;
  const at = events.filter((e) => ['focused', 'full', 'whole'].includes(e.fields[0]) && e.fields[2] === to);
  if (!at.length) return 'no test run recorded at the tip';
  // A failed full, whole, or path run (a test file named directly) at the tip is never hidden by a later pass.
  const red = events.find((e) => ['full', 'whole', 'path'].includes(e.fields[0]) && e.fields[2] === to && e.fields[1] === 'fail');
  if (red) return `a ${red.fields[0]} run at the tip failed`;
  const [kind, result, , tree] = at[at.length - 1].fields;
  if (result !== 'pass' || tree !== 'clean') return `the latest ${kind} run at the tip is ${result} on a ${tree} tree`;
  return null;
}

// `**Base:**` records the remote base tip the base step merged into the scope branch
// (`references/scope-mode.md` `## Bringing the scope branch to base`). `base resolve` prints the scope's
// range base (`## The scope's range base`): the newer of `merge-base(base, branch)` and the recorded tip,
// where the recorded tip counts only when it resolves and is an ancestor of the branch. Two candidates
// where neither holds the other, or no usable record, print the merge-base. Like `suite set`, `base set`
// records the resolved full commit and refuses a value that resolves to none.
function verbBaseSet(cwd, root, sha) {
  if (!sha) fail('base set needs a <sha>');
  const commit = resolveCommit(sha, cwd);
  if (!commit) fail(`sha "${sha}" does not resolve to a commit in this repository`);
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe('Base').test(l));
  if (at >= 0) {
    lines[at] = `**Base:** ${commit}`;
    writeLines(root, lines);
    return;
  }
  writeLines(root, insertHeader(lines, 'Base', commit));
}

function verbBaseResolve(cwd, root, branch, base) {
  const tip = resolveCommit(branch, cwd);
  if (!tip) fail(`branch "${branch}" does not resolve to a commit`);
  const found = gitSpawn(['merge-base', '--end-of-options', base, tip], cwd);
  const mb = found.status === 0 ? found.stdout.trim() : '';
  if (!mb) fail(`no merge-base of "${base}" and "${branch}"`);
  const isAnc = (a, b) => gitSpawn(['merge-base', '--is-ancestor', a, b], cwd).status === 0;
  const raw = getHeader(readLines(root), 'Base');
  const rec = raw ? resolveCommit(raw, cwd) : null;
  let out = mb;
  if (rec && isAnc(rec, tip) && isAnc(mb, rec)) out = rec;
  console.log(out);
}

function verbGet(root, field) {
  if (field === 'slices') {
    // The read half of `slice`: every table row as tab-separated
    // id/issue/title/type/depends-on/status/range, one line per slice.
    const lines = readLines(root);
    for (const i of tableRowIndexes(lines)) {
      const cells = splitRow(lines[i]);
      if (cells.length !== 7) fail(`slice row does not carry the 7 ledger columns: ${lines[i].trim()}`);
      console.log(cells.join('\t'));
    }
    return;
  }
  const bulletFields = { unresolved: 'Unresolved', degraded: 'Degraded', deferred: 'Deferred', minors: 'Minors' };
  if (bulletFields[field]) {
    // The read half of `unresolved add`/`degraded add`/`deferred add`: every bullet, one per line, so a
    // caller (`/superdev:submit-pr`'s gate and its pull-request body step) never has to split a joined
    // string back apart — a bullet containing a comma stays intact this way, unlike `status`'s
    // `, `-joined line.
    const lines = readLines(root);
    for (const b of readBullets(lines, bulletFields[field])) console.log(b);
    return;
  }
  if (field === 'denials') {
    // The count half of `degraded add-denial`: how many denied verification dispatches this run has
    // absorbed, which is what an unattended run caps at two (ADR 0041). A ledger with no `**Degraded:**`
    // line, or one carrying only the other degraded shape, counts zero. The count starts after the last
    // `degraded reset-denials` marker, so a reset returns the budget without removing a bullet (ADR 0044).
    const bullets = readBullets(readLines(root), 'Degraded');
    const lastReset = bullets.map((b) => b.startsWith(RESET_PREFIX)).lastIndexOf(true);
    console.log(String(bullets.slice(lastReset + 1).filter((b) => b.startsWith(DENIAL_PREFIX)).length));
    return;
  }
  if (field === 'suite') {
    // The read half of `suite set`: `<result> <sha>`, with a trailing ` whole` when the record carries
    // that kind, or nothing on a ledger with no record — never the "absent" token the other header
    // fields print, because a caller (`references/run-handoff.md`) tests for output at all rather than
    // parsing a sentinel value.
    const v = getHeader(readLines(root), 'Suite');
    if (v === null) return;
    const m = v.match(/^(\S+) @ (\S+)(?: (whole))?$/);
    console.log(m ? `${m[1]} ${m[2]}${m[3] ? ' whole' : ''}` : v);
    return;
  }
  if (field === 'step') {
    console.log(getHeader(readLines(root), 'Step') || 'none');
    return;
  }
  const names = { stage: 'Stage', branch: 'Branch', anchor: 'Anchor', docs: 'Docs', pr: 'PR' };
  const name = names[field];
  if (!name) fail(`unknown field "${field}" — use stage|step|branch|anchor|docs|pr|slices|unresolved|degraded|deferred|minors|denials|suite`);
  const v = getHeader(readLines(root), name);
  console.log(v === null ? 'absent' : v);
}

module.exports = { verbSuite, verbSuiteReusable, verbBaseSet, verbBaseResolve, verbGet };
