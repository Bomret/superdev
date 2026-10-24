'use strict';

// suite-base-get.js: the ledger's `**Suite:**` and `**Base:**` records, their reuse and range-base reads, and the `get` read verb.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const {
  SUITE_RESULTS, readLines, headerRe, getHeader, readBullets, insertHeader, writeLines, tableRowIndexes, splitRow,
} = require('./ledger.js');
const { isTestPath, completeSelector, verificationCommandsOf } = require('./verification.js');
const { gitSpawn, resolveCommit, fileAt } = require('./git-spawn.js');
const { readTrace, decodePaths } = require('./trace-log.js');
const { DENIAL_PREFIX, RESET_PREFIX } = require('./ledger-records.js');

const VERIFICATION = 'docs/agents/verification.md';

// The first failed full, whole, or path run recorded at commit `to`, or undefined: a failure there is never hidden by a later pass.
function failedRunAt(events, to) {
  return events.find((e) => ['full', 'whole', 'path'].includes(e.fields[0]) && e.fields[2] === to && e.fields[1] === 'fail');
}

// The run root's `run` trace events in trace order; none where no trace file exists yet.
function runEvents(root) {
  let raw = '';
  try {
    raw = fs.readFileSync(path.join(root, 'trace.log'), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return readTrace(raw).filter((e) => e.kind === 'run');
}

// A reader of the checkout's repository root, asked of git once on its first call: '' where git cannot answer, and then
// its `failed` property is true.
function lazyToplevel(cwd) {
  let root;
  const top = () => {
    if (root === undefined) {
      const t = gitSpawn(['rev-parse', '--show-toplevel'], cwd);
      top.failed = t.status !== 0;
      root = top.failed ? '' : t.stdout.trim();
    }
    return root;
  };
  top.failed = false;
  return top;
}

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
// can change what a suite run exercises. The exceptions are a Markdown-only range (ADR 0128) and, under the complete-selector
// declaration, a range a focused run covered (ADR 0175): see `carryRefusal`. A red record at the tip is the rerun's
// (ADR 0172): see `reusableOnRerun`. Reads via `fail()` (a thrown refusal, exit 1) for "not reusable" — the same channel
// every other verb already uses to report a no — and prints `reusable` (exit 0) when it is.
// `whole` is INV-0017's kind gate (ADR 0105): a step that needs a whole-repo run passes it, and refuses
// a record with no kind even when it is green and tip-matched; a step content with either kind omits it.
function verbSuiteReusable(cwd, root, branch, whole, base) {
  const raw = getHeader(readLines(root), 'Suite');
  if (!raw) fail('no suite record to reuse');
  const m = raw.match(/^(\S+)\s+@\s+(\S+)(?:\s+(whole))?$/);
  if (!m) fail(`unreadable suite record: ${raw}`);
  const [, result, recordedSha, kind] = m;
  if (result === 'red') return reusableOnRerun(cwd, root, branch, recordedSha, kind, whole, base);
  if (result !== 'green') fail(`suite record is ${result}, not green — not reusable`);
  if (whole && kind !== 'whole') fail('suite record carries no kind — a whole-repo run needs one');
  const tip = resolveCommit(branch, cwd);
  if (!tip) fail(`branch "${branch}" does not resolve to a commit`);
  // The run trace backs the record (ADR 0117, INV-0017): the latest `run` line of the matching kind at
  // the recorded commit, compared against the full sha, must read `pass` and `clean`.
  // For a plain check, either `full` or `whole` kind is accepted; for --whole, only `whole`.
  // simplicity: exact full-sha match, so an abbreviated sha in a trace line never backs reuse; upgrade: prefix match if a writer abbreviates
  const acceptedKinds = whole ? ['whole'] : ['full', 'whole'];
  const events = runEvents(root);
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

// ADR 0172: a red record at the tip is reusable once the ledger records one rerun for that tip, the rerun's test file
// alone passed (and never failed) on a clean tree there after the failed full run, a focused run over paths passed
// clean there, and exactly one full run (a whole run for `--whole`) at the tip failed, under the tip's complete-selector
// declaration. Whether the failure was one test file is the controller's reading, quoted in the triage record; this
// checks the trace and ledger.
// The focused run's path set must cover every path the scope's range changed: `base` is the base branch, and the range
// base is the one `base resolve` prints. Without `base` the range cannot be judged and the record stays red.
function reusableOnRerun(cwd, root, branch, recordedSha, kind, whole, base) {
  const red = (why) => fail(`suite record is red, not green (${why}) — not reusable`);
  const tip = resolveCommit(branch, cwd);
  if (!tip) fail(`branch "${branch}" does not resolve to a commit`);
  if (tip !== recordedSha) red('the failed run is not at the tip');
  if (whole && kind !== 'whole') red('the record carries no kind — a whole-repo run needs one');
  const raw = getHeader(readLines(root), 'Rerun');
  const rm = raw && raw.match(/^(\S+) @ (\S+) (\S+)$/);
  if (!rm || rm[2] !== tip) red('no rerun recorded for the tip');
  const config = fileAt(tip, VERIFICATION, cwd);
  if (config === null) red('git could not read the tip\'s verification configuration');
  if (!completeSelector(config)) red(`${VERIFICATION} carries no complete-selector declaration`);
  const at = runEvents(root).filter((e) => e.fields[2] === tip);
  const kinds = whole ? ['whole'] : ['full', 'whole'];
  const failed = at.filter((e) => kinds.includes(e.fields[0]) && e.fields[1] === 'fail').length;
  if (failed !== 1) red(`${failed} failed full runs at the tip, the rerun covers exactly one`);
  const top = lazyToplevel(cwd);
  const file = rootRelative(rm[1], top);
  const isAlone = (e) => {
    if (e.fields[0] !== 'path') return false;
    const files = (e.fields[4] || '').split(',').map((p) => rootRelative(p, top));
    return files.length === 1 && files[0] === file;
  };
  const other = at.find((e) => e.fields[0] === 'path' && e.fields[1] === 'fail' && !isAlone(e));
  if (other) red('a path run of another test file at the tip failed');
  // The file and the range then passed: only runs the trace records after the failed full run count.
  const after = at.slice(at.findIndex((e) => kinds.includes(e.fields[0]) && e.fields[1] === 'fail') + 1);
  const alone = after.filter(isAlone);
  if (!alone.length) red(`no run of ${rm[1]} alone recorded at the tip after the failed full run`);
  if (alone.some((e) => e.fields[1] !== 'pass' || e.fields[3] !== 'clean')) red(`a run of ${rm[1]} alone at the tip after the failed full run failed or ran on a dirty tree`);
  const foc = after.filter((e) => e.fields[0] === 'focused');
  const lastFocused = foc[foc.length - 1];
  if (!lastFocused) red('no focused run recorded at the tip after the failed full run');
  if (lastFocused.fields[1] !== 'pass' || lastFocused.fields[3] !== 'clean') red('the latest focused run at the tip failed or ran on a dirty tree');
  if (!decodePaths(lastFocused.fields[4]).length) red('the latest focused run at the tip carries no recorded path set');
  if (!base) red('the scope\'s range cannot be judged without --base <base-branch>');
  const changed = changedPaths(cwd, rangeBase(cwd, root, branch, base), tip);
  if (!changed) red('git could not list the paths the scope\'s range changed');
  const uncovered = coverageRefusal(cwd, changed, foc);
  if (uncovered) red(uncovered);
  console.log('reusable');
}

// `suite rerun <test-file> <triage-ref>` (ADR 0172): the ledger's one `**Rerun:**` record, `<file> @ <tip> <ref>`, with the
// tip the checkout's HEAD. A tip that already carries a record refuses a second; a record for another tip is replaced.
function verbSuiteRerun(cwd, root, file, ref) {
  if (!file || !ref) fail('suite rerun needs a <test-file> and a <triage-ref>');
  if (/\s/.test(file) || /\s/.test(ref)) fail('suite rerun: the test file and the triage record each name one token');
  const tip = resolveCommit('HEAD', cwd);
  if (!tip) fail('HEAD does not resolve to a commit in this repository');
  // The file as typed (`./x`, relative to a subdirectory, absolute) reduced to a root-relative path that is a blob at the tip.
  const rel = rootRelative(path.resolve(cwd, file), lazyToplevel(cwd));
  const listed = rel ? gitSpawn(['ls-tree', '--full-tree', tip, '--', rel], cwd) : null;
  if (!listed || listed.status !== 0 || !/^\d+ blob /.test(listed.stdout)) fail(`${file} is not a file at the tip ${tip}`);
  file = rel;
  const lines = readLines(root);
  const raw = getHeader(lines, 'Rerun');
  const rm = raw && raw.match(/^\S+ @ (\S+) \S+$/);
  if (rm && rm[1] === tip) fail(`the ledger already records a rerun for ${tip}: ${raw}`);
  const value = `${file} @ ${tip} ${ref}`;
  const at = lines.findIndex((l) => headerRe('Rerun').test(l));
  if (at >= 0) {
    lines[at] = `**Rerun:** ${value}`;
    writeLines(root, lines);
    return;
  }
  writeLines(root, insertHeader(lines, 'Rerun', value));
}

// The root-relative paths changed from `from` to `to`, renames split into both sides and deletions included, or
// null where git cannot list them. `diff.relative` is forced off so a subdirectory's cwd never narrows or rebases
// the list (triage #1004, #1015).
function changedPaths(cwd, from, to) {
  const diff = gitSpawn(['-c', 'diff.relative=false', 'diff', '--name-only', '--no-renames', '-z', from, to], cwd);
  return diff.status === 0 ? diff.stdout.split('\0').filter(Boolean) : null;
}

// A path as a focused run recorded it (as typed: `./x`, a directory, absolute) reduced to a root-relative
// POSIX path, or null where it names nothing inside the tree. `top` is the tree root, read once and lazily.
function rootRelative(p, top) {
  let s = p.replace(/\\/g, '/');
  if (process.platform === 'win32') s = s.replace(/^\/([a-zA-Z])\//, (m, d) => `${d.toUpperCase()}:/`);
  if (s.startsWith('/') || /^[A-Za-z]:\//.test(s)) {
    const root = top();
    if (!root) return null;
    s = path.posix.relative(root.replace(/\\/g, '/'), s);
  }
  s = path.posix.normalize(s).replace(/\/$/, '');
  if (s === '..' || s.startsWith('../')) return null;
  return s === '.' ? '' : s;
}

// ADR 0175: under the tip's complete-selector declaration, a green record at `from` carries to `to` when a passing
// clean focused run at the tip named every changed path itself. A directory the run named covers no file under it.
// Returns undefined where no declaration applies (the caller's Markdown reason stands), null where the carry
// holds, or the reason it fails. Judged from the record's own commit only; nothing is written.
function completeRefusal(cwd, from, to, events, paths) {
  const config = fileAt(to, VERIFICATION, cwd);
  if (config === null) return 'git could not read the tip\'s verification configuration';
  const declared = completeSelector(config);
  if (!declared) return undefined;
  const { focused } = verificationCommandsOf(config);
  if (!focused || !focused.includes('{paths}')) return 'the verification configuration declares the selector complete but its focused command takes no {paths}';
  if (paths.includes(VERIFICATION)) return `${VERIFICATION} is the verification configuration`;
  // A listed path covers itself and every path under it, a trailing `/` being optional.
  const own = declared.files.map((f) => path.posix.normalize(f).replace(/\/$/, ''));
  const sel = paths.find((p) => own.some((f) => p === f || p.startsWith(`${f}/`)));
  if (sel) return `${sel} is a selector file`;
  const red = failedRunAt(events, to);
  if (red) return `a ${red.fields[0]} run at the tip failed`;
  const at = events.filter((e) => e.fields[0] === 'focused' && e.fields[2] === to);
  if (!at.length) return 'no focused run recorded at the tip';
  const [, result, , tree] = at[at.length - 1].fields;
  if (result !== 'pass' || tree !== 'clean') return `the latest focused run at the tip is ${result} on a ${tree} tree`;
  return coverageRefusal(cwd, paths, at);
}

// Whether one passing clean focused run among `at` (a tip's focused runs) covers every path in `paths`: null where one
// does, or the reason none does. Coverage counts only runs after the last failed focused run in `at`.
function coverageRefusal(cwd, paths, at) {
  const top = lazyToplevel(cwd);
  const lastFail = at.map((e) => e.fields[1]).lastIndexOf('fail');
  const good = at.slice(lastFail + 1).filter((e) => e.fields[1] === 'pass' && e.fields[3] === 'clean');
  let sawSet = false;
  for (const e of good) {
    const set = new Set(decodePaths(e.fields[4]).map((p) => rootRelative(p, top)).filter((p) => p !== null));
    if (!set.size) continue;
    sawSet = true;
    // Only the path itself covers: a selector may reach fewer tests for a directory than for a file under it.
    if (paths.every((c) => set.has(c))) return null;
  }
  if (top.failed) return 'git could not find the repository root to resolve a recorded path';
  return sawSet ? 'the focused run at the tip covered fewer paths than changed since' : 'the focused run at the tip carries no recorded path set';
}

// ADR 0128: a green record at `from` also covers `to` when `from` is an ancestor of `to`, every path
// changed between them is Markdown, the latest test-command run at `to` passed on a clean tree, and no
// full, whole, or path run at `to` failed. Returns the reason the carry fails, or null when it holds.
function carryRefusal(cwd, from, to, events) {
  if (gitSpawn(['merge-base', '--is-ancestor', from, to], cwd).status !== 0) return 'it is not an ancestor of the tip';
  const paths = changedPaths(cwd, from, to);
  if (!paths) return 'git could not list the paths changed since';
  const other = paths.find((p) => !p.endsWith('.md'));
  if (other) {
    const complete = completeRefusal(cwd, from, to, events, paths);
    return complete === undefined ? `${other} changed since and is not Markdown` : complete;
  }
  if (paths.includes(VERIFICATION)) return `${VERIFICATION} is the verification configuration`;
  // The test paths come from the tip commit, never a working tree; no file there means the defaults.
  const config = fileAt(to, VERIFICATION, cwd);
  if (config === null) return 'git could not read the tip\'s verification configuration';
  const test = paths.find((p) => isTestPath(config, p));
  if (test) return `${test} is a test path`;
  const at = events.filter((e) => ['focused', 'full', 'whole'].includes(e.fields[0]) && e.fields[2] === to);
  if (!at.length) return 'no test run recorded at the tip';
  // A failed full, whole, or path run (a test file named directly) at the tip is never hidden by a later pass.
  const red = failedRunAt(events, to);
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

// The scope's range base: what `base resolve` prints. Refuses where the branch or the merge-base does not resolve.
function rangeBase(cwd, root, branch, base) {
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
  return out;
}

function verbBaseResolve(cwd, root, branch, base) {
  console.log(rangeBase(cwd, root, branch, base));
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

module.exports = { verbSuite, verbSuiteRerun, verbSuiteReusable, verbBaseSet, verbBaseResolve, verbGet };
