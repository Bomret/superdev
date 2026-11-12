'use strict';

// suite-base-get.js: the ledger's `**Suite:**` and `**Base:**` records, their reuse and range-base reads, and the `get` read verb.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const {
  SUITE_RESULTS, readLines, headerRe, getHeader, readBullets, insertHeader, writeLines, tableRowIndexes, splitRow,
} = require('./ledger.js');
const { isTestPath, completeSelector, verificationCommandsOf, prepareCommandOf, configuredTestPaths } = require('./verification.js');
const { gitSpawn, resolveCommit, fileAt } = require('./git-spawn.js');
const { readTrace, decodePaths, untraceField } = require('./trace-log.js');
const { DENIAL_PREFIX, RESET_PREFIX } = require('./ledger-records.js');
const { rootRelative, lazyToplevel } = require('./run-tree.js');

const VERIFICATION = 'docs/agents/verification.md';

// The run configuration of a `verification.md` text (ADR 0230): each part as the readers yield it, in a form that
// compares by string. Prose and every other section are no part of it.
function runConfiguration(raw) {
  const { full, focused, whole } = verificationCommandsOf(raw, true);
  const tests = configuredTestPaths(raw);
  return [
    ['full command', JSON.stringify(full)],
    ['focused command', JSON.stringify(focused)],
    ['whole-repo command', JSON.stringify(whole)],
    ['prepare command', JSON.stringify(prepareCommandOf(raw))],
    ['test paths', JSON.stringify(tests && tests.map((re) => re.source))],
    ['complete-selector declaration', JSON.stringify(completeSelector(raw))],
  ];
}

// Whether `verification.md`'s run configuration differs between commits `from` and `to`: null where it agrees, or the
// reason the carry refuses. `toText` is `to`'s text where the caller already read it.
function configRefusal(g, from, to, toText) {
  const before = g.fileAt(from, VERIFICATION);
  if (before === null) return 'git could not read the recorded commit\'s verification configuration';
  const after = toText === undefined ? g.fileAt(to, VERIFICATION) : toText;
  if (after === null) return 'git could not read the tip\'s verification configuration';
  const a = runConfiguration(before);
  const b = runConfiguration(after);
  const part = a.find(([, v], i) => v !== b[i][1]);
  return part ? `${VERIFICATION} changed its ${part[0]}` : null;
}

// The first failed full, whole, or path run recorded at commit `to`, or undefined: a failure there is never hidden by a later pass.
function failedRunAt(events, to) {
  return events.find((e) => ['full', 'whole', 'path'].includes(e.fields[0]) && e.fields[2] === to && e.fields[1] === 'fail');
}

// Whether the latest full or whole run at commit `tip` (whole only, for a `whole` gate) passed on a clean tree.
function passedAtTip(events, tip, whole) {
  const kinds = whole ? ['whole'] : ['full', 'whole'];
  const runs = events.filter((e) => kinds.includes(e.fields[0]) && e.fields[2] === tip);
  if (!runs.length) return false;
  const [, result, , tree] = runs[runs.length - 1].fields;
  return result === 'pass' && tree === 'clean';
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

// `**Suite:**` records the last full-suite run: its result, the commit it ran on, and its kind
// (`references/run-state.md` `## The ledger`, INV-0017, ADR 0105 — a later step reuses a green record
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
  upsertHeader(root, 'Suite', `${result} @ ${commit}${whole ? ' whole' : ''}`);
}

// Writes `value` as the ledger's one `**<name>:**` record, in place or as a new header line.
function upsertHeader(root, name, value) {
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe(name).test(l));
  if (at >= 0) {
    lines[at] = `**${name}:** ${value}`;
    writeLines(root, lines);
    return;
  }
  writeLines(root, insertHeader(lines, name, value));
}

// `file` as typed (`./x`, relative to a subdirectory, absolute), reduced to a root-relative path that is a blob at `tip`;
// refuses a file the tip does not hold.
function tipBlob(cwd, file, tip) {
  const rel = rootRelative(path.resolve(cwd, file), lazyToplevel(cwd));
  const listed = rel ? gitSpawn(['ls-tree', '--full-tree', tip, '--', rel], cwd) : null;
  if (!listed || listed.status !== 0 || !/^\d+ blob /.test(listed.stdout)) fail(`${file} is not a file at the tip ${tip}`);
  return rel;
}

// The commit `branch` resolves to; refuses a branch that resolves to none.
function tipOf(g, branch) {
  const tip = g.commit(branch);
  if (!tip) fail(`branch "${branch}" does not resolve to a commit`);
  return tip;
}

// How many runs of `kinds` the trace `events` record as failed at `sha`.
const failedRuns = (events, sha, kinds) => events.filter((e) => kinds.includes(e.fields[0]) && e.fields[2] === sha && e.fields[1] === 'fail').length;

// The refusal text of a red record, with each route's reason.
const redRefusal = (why) => `suite record is red, not green (${why}) — not reusable`;

// INV-0017's reuse rule: a green suite record is reusable on the exact commit it was recorded on, and
// only where the run trace backs it (the latest matching `run` line there reads `pass` and `clean`).
// No slice store commits its own records on the scope branch (ADR 0110), so a commit since the record
// can change what a suite run exercises. The exceptions are a Markdown-only range (ADR 0128) and, under the complete-selector
// declaration, a range a focused run covered (ADR 0175): see `carryRefusal`. A red record at the tip, or at an
// ancestor of it followed by Markdown-only commits, is the rerun's (ADR 0172, ADR 0189): see `reusableOnRerun`. Reads via `fail()` (a thrown refusal, exit 1) for "not reusable" — the same channel
// every other verb already uses to report a no — and prints `reusable` (exit 0) when it is.
// `whole` is INV-0017's kind gate (ADR 0105): a step that needs a whole-repo run passes it, and refuses
// a record with no kind even when it is green and tip-matched; a step content with either kind omits it.
function verbSuiteReusable(cwd, root, branch, whole, base) {
  const g = gitReads(cwd);
  const raw = getHeader(readLines(root), 'Suite');
  const m = raw && raw.match(/^(\S+)\s+@\s+(\S+)(?:\s+(whole))?$/);
  if (raw && !m) fail(`unreadable suite record: ${raw}`);
  // ADR 0182: a passing full-suite run at the exact tip meets the gate, whoever wrote it. A record at the tip that is not
  // green decides on its own below, so a red record there stays the rerun's (ADR 0172). An accepted run becomes the record,
  // `whole` where a whole run passed at the tip, so `get suite` names the commit the gate passed on (ADR 0186).
  const exactTip = g.commit(branch);
  if (exactTip && (!m || m[2] !== exactTip || m[1] === 'green')) {
    const events = runEvents(root);
    if (passedAtTip(events, exactTip, whole)) {
      const value = `green @ ${exactTip}${passedAtTip(events, exactTip, true) ? ' whole' : ''}`;
      if (raw !== value) upsertHeader(root, 'Suite', value);
      console.log('reusable');
      return;
    }
  }
  if (!raw) fail('no suite record to reuse');
  const [, result, recordedSha, kind] = m;
  if (result === 'red') {
    // Each route returns its refusal reason, or null where it accepts. A red record whose failures a fix cycle since
    // repaired carries to a later tip (ADR 0237) where the rerun does not; a refusal names both routes' reasons.
    const why = reusableOnRerun(g, root, branch, recordedSha, kind, whole, base);
    if (why) {
      const failed = failedRecord(root);
      if (!failed || failed.sha !== recordedSha) fail(redRefusal(why));
      const fixWhy = reusableAfterFix(g, root, branch, recordedSha, kind, whole, failed.files);
      if (fixWhy) fail(redRefusal(`${why}; repaired-failure carry: ${fixWhy}`));
    }
    console.log('reusable');
    return;
  }
  if (result !== 'green') fail(`suite record is ${result}, not green — not reusable`);
  if (whole && kind !== 'whole') fail('suite record carries no kind — a whole-repo run needs one');
  const tip = tipOf(g, branch);
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
    const why = carryRefusal(g, recordedSha, tip, events);
    if (why) fail(`suite record @ ${recordedSha} predates tip ${tip}: ${why} — not reusable`);
  }
  console.log('reusable');
}

// ADR 0172: a red record at commit R is reusable once the ledger records one rerun for R, the rerun's test file
// alone passed (and never failed) on a clean tree there after the failed full run, a focused run over paths passed
// clean there, and exactly one full run (a whole run for `--whole`) at R failed, under R's complete-selector
// declaration. Whether the failure was one test file is the controller's reading, quoted in the triage record; this
// checks the trace and ledger.
// The focused run's path set must cover every path the scope's range changed up to R: `base` is the base branch, and the
// range base is the one `base resolve` prints. Without `base` the range cannot be judged and the record stays red.
// R is the tip, or (ADR 0189) an ancestor of it where every path changed since R passes the Markdown-only rule at the tip.
// Returns the reason the route refuses, or null where it accepts.
function reusableOnRerun(g, root, branch, recordedSha, kind, whole, base) {
  const tip = tipOf(g, branch);
  if (whole && kind !== 'whole') return 'the record carries no kind — a whole-repo run needs one';
  const events = runEvents(root);
  if (tip !== recordedSha) {
    if (!g.isAncestor(recordedSha, tip)) return 'the failed run is neither at the tip nor an ancestor of it';
    const since = g.changed(recordedSha, tip);
    if (!since) return 'git could not list the paths changed since the failed run';
    const why = markdownRefusal(g, recordedSha, tip, events, since);
    if (why) return `the failed run predates the tip and ${why}`;
  }
  const raw = getHeader(readLines(root), 'Rerun');
  const rm = raw && raw.match(/^(\S+) @ (\S+) (\S+)$/);
  if (!rm || rm[2] !== recordedSha) return 'no rerun recorded for the failed run\'s commit';
  const config = g.fileAt(recordedSha, VERIFICATION);
  if (config === null) return 'git could not read the failed run\'s verification configuration';
  if (!completeSelector(config)) return `${VERIFICATION} carries no complete-selector declaration`;
  const at = events.filter((e) => e.fields[2] === recordedSha);
  const kinds = whole ? ['whole'] : ['full', 'whole'];
  const failed = failedRuns(at, recordedSha, kinds);
  if (failed !== 1) return `${failed} failed full runs at the failed run's commit, the rerun covers exactly one`;
  const top = g.top;
  const file = rootRelative(rm[1], top);
  // The directory the run was made in (the eighth field), decoded from its trace encoding; undefined where the line has none.
  const runDir = (e) => (e.fields[7] === undefined ? undefined : untraceField(e.fields[7]));
  const ofFile = (e) => {
    if (e.fields[0] !== 'path') return false;
    // A name is as typed, relative to the directory the run was made in: resolve it against that
    // directory when the directory is relative and inside the tree. A line with no directory field reads root-relative;
    // a directory outside the tree makes the run one of no file in it.
    const raw = runDir(e);
    const dir = raw === undefined ? null : rootRelative(raw, top);
    if (raw !== undefined && dir === null) return false;
    const files = decodePaths(e.fields[4]).map((p) => rootRelative(dir && !/^([\\/]|[A-Za-z]:[\\/])/.test(p) ? path.posix.join(dir, p.replace(/\\/g, '/')) : p, top));
    return files.length === 1 && files[0] === file;
  };
  // Only a run at the tree root counts as the rerun (ADR 0232): a line with no directory field reads as not at the root.
  const isAlone = (e) => ofFile(e) && runDir(e) === '.';
  const other = at.find((e) => e.fields[0] === 'path' && e.fields[1] === 'fail' && !ofFile(e));
  if (other) return 'a path run of another test file at the failed run\'s commit failed';
  // The file and the range then passed: only runs the trace records after the failed full run count.
  const after = at.slice(at.findIndex((e) => kinds.includes(e.fields[0]) && e.fields[1] === 'fail') + 1);
  const alone = after.filter(isAlone);
  if (!alone.length) return `no run of ${rm[1]} alone recorded at the failed run's commit after the failed full run`;
  if (after.filter(ofFile).some((e) => e.fields[1] !== 'pass' || e.fields[3] !== 'clean')) return `a run of ${rm[1]} alone at the failed run's commit after the failed full run failed or ran on a dirty tree`;
  const foc = after.filter((e) => e.fields[0] === 'focused');
  const lastFocused = foc[foc.length - 1];
  if (!lastFocused) return 'no focused run recorded at the failed run\'s commit after the failed full run';
  if (lastFocused.fields[1] !== 'pass' || lastFocused.fields[3] !== 'clean') return 'the latest focused run at the failed run\'s commit failed or ran on a dirty tree';
  if (!decodePaths(lastFocused.fields[4]).length) return 'the latest focused run at the failed run\'s commit carries no recorded path set';
  if (!base) return 'the scope\'s range cannot be judged without --base <base-branch>';
  // A range base `base resolve` cannot name is this route's refusal, so the repaired-failure carry is still tried.
  let from;
  try {
    from = rangeBase(g, root, branch, base);
  } catch (err) {
    if (!err.isRefusal) throw err;
    return err.message;
  }
  const changed = g.changed(from, recordedSha);
  if (!changed) return 'git could not list the paths the scope\'s range changed';
  const uncovered = coverageRefusal(g, changed, foc);
  if (uncovered) return uncovered;
  return null;
}

// The ledger's `**Failed:**` record, `<file>... @ <sha>`, as `{ files, sha }`, or null where it is absent or unreadable.
function failedRecord(root) {
  const raw = getHeader(readLines(root), 'Failed');
  const m = raw && raw.match(/^(.+?) @ (\S+)$/);
  return m ? { files: m[1].split(' ').filter(Boolean), sha: m[2] } : null;
}

// ADR 0237: a red record at commit R, whose failed full run the ledger's `**Failed:**` record names the failing test files
// of, carries to a later tip T under T's complete-selector declaration when R is an ancestor of T, exactly one full run
// failed at R, each named file passed on a clean tree at T in a `path` run from the tree root, and the complete-selector
// carry from R to T holds: a passing clean focused run at T covers every path changed since R, and no full, whole, or path
// run at T failed. Every test outside the named files passed at R, and the focused run selects every test the change
// since R reaches. Which files failed is the controller's reading of the failed run's output. Returns the reason the
// route refuses, or null where it accepts.
function reusableAfterFix(g, root, branch, from, kind, whole, files) {
  if (whole || kind === 'whole') return 'a repaired failure carries a full run only, never a whole-repo one';
  const tip = tipOf(g, branch);
  if (tip === from) return 'the failed run is at the tip';
  if (!g.isAncestor(from, tip)) return 'the failed run is not an ancestor of the tip';
  const events = runEvents(root);
  const failedFull = failedRuns(events, from, ['full', 'whole']);
  if (failedFull !== 1) return `${failedFull} failed full runs at the failed run's commit, the record names the failures of exactly one`;
  const paths = g.changed(from, tip);
  if (!paths) return 'git could not list the paths changed since the failed run';
  const why = completeRefusal(g, from, tip, events, paths);
  if (why === undefined) return `${VERIFICATION} carries no complete-selector declaration`;
  if (why) return why;
  const top = g.top;
  for (const file of files) {
    const passed = events.some((e) => e.fields[0] === 'path' && e.fields[2] === tip && e.fields[1] === 'pass' && e.fields[3] === 'clean'
      && e.fields[7] !== undefined && untraceField(e.fields[7]) === '.'
      && decodePaths(e.fields[4]).map((p) => rootRelative(p, top)).includes(file));
    if (!passed) return `no passing clean run of ${file} from the tree root at the tip`;
  }
  return null;
}

// `suite failed <test-file>...` (ADR 0237): the ledger's one `**Failed:**` record, `<file>... @ <tip>`, naming the test files
// a full run at the tip failed in, with the tip the checkout's HEAD. Each file is reduced to a root-relative path that is a
// blob at the tip. A record for another tip is replaced. Returns the recorded paths.
function verbSuiteFailed(cwd, root, files) {
  if (!files.length) fail('suite failed needs at least one <test-file>');
  if (files.some((f) => !f || /\s/.test(f))) fail('suite failed: each test file names one token');
  const tip = resolveCommit('HEAD', cwd);
  if (!tip) fail('HEAD does not resolve to a commit in this repository');
  const rels = [...new Set(files.map((file) => tipBlob(cwd, file, tip)))];
  upsertHeader(root, 'Failed', `${rels.join(' ')} @ ${tip}`);
  return rels;
}

// `suite rerun <test-file> <triage-ref>` (ADR 0172): the ledger's one `**Rerun:**` record, `<file> @ <tip> <ref>`, with the
// tip the checkout's HEAD. A tip that already carries a record refuses a second; a record for another tip is replaced.
function verbSuiteRerun(cwd, root, file, ref) {
  if (!file || !ref) fail('suite rerun needs a <test-file> and a <triage-ref>');
  if (/\s/.test(file) || /\s/.test(ref)) fail('suite rerun: the test file and the triage record each name one token');
  const tip = resolveCommit('HEAD', cwd);
  if (!tip) fail('HEAD does not resolve to a commit in this repository');
  file = tipBlob(cwd, file, tip);
  const raw = getHeader(readLines(root), 'Rerun');
  const rm = raw && raw.match(/^\S+ @ (\S+) \S+$/);
  if (rm && rm[1] === tip) fail(`the ledger already records a rerun for ${tip}: ${raw}`);
  upsertHeader(root, 'Rerun', `${file} @ ${tip} ${ref}`);
}

// The root-relative paths changed from `from` to `to`, renames split into both sides and deletions included, or
// null where git cannot list them. `diff.relative` is forced off so a subdirectory's cwd never narrows or rebases
// the list (triage #1004, #1015).
function changedPaths(cwd, from, to) {
  const diff = gitSpawn(['-c', 'diff.relative=false', 'diff', '--name-only', '--no-renames', '-z', from, to], cwd);
  return diff.status === 0 ? diff.stdout.split('\0').filter(Boolean) : null;
}

// The git reads of one `suite reusable` or `base resolve` call, each asked of git once per call: the commit a ref resolves to,
// a file's text at a commit, the paths changed between two commits, whether one commit is an ancestor of another, and the tree
// root. No such call writes to the repository, so a repeated read has the first one's answer.
function gitReads(cwd) {
  const memo = new Map();
  const once = (key, read) => {
    if (!memo.has(key)) memo.set(key, read());
    return memo.get(key);
  };
  return {
    cwd,
    commit: (ref) => once(`commit ${ref}`, () => resolveCommit(ref, cwd)),
    fileAt: (commit, rel) => once(`file ${commit} ${rel}`, () => fileAt(commit, rel, cwd)),
    changed: (from, to) => once(`changed ${from} ${to}`, () => changedPaths(cwd, from, to)),
    isAncestor: (a, b) => once(`ancestor ${a} ${b}`, () => gitSpawn(['merge-base', '--is-ancestor', a, b], cwd).status === 0),
    top: lazyToplevel(cwd),
  };
}

// ADR 0175: under the tip's complete-selector declaration, a green record at `from` carries to `to` when a passing
// clean focused run at the tip named every changed path itself. A directory the run named covers no file under it.
// Returns undefined where no declaration applies (the caller's Markdown reason stands), null where the carry
// holds, or the reason it fails. Judged from the record's own commit only; nothing is written.
function completeRefusal(g, from, to, events, paths) {
  const config = g.fileAt(to, VERIFICATION);
  if (config === null) return 'git could not read the tip\'s verification configuration';
  const declared = completeSelector(config);
  if (!declared) return undefined;
  const { focused } = verificationCommandsOf(config);
  if (!focused || !focused.includes('{paths}')) return 'the verification configuration declares the selector complete but its focused command takes no {paths}';
  if (paths.includes(VERIFICATION)) {
    const changed = configRefusal(g, from, to, config);
    if (changed) return changed;
  }
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
  return coverageRefusal(g, paths, at);
}

// Whether one passing clean focused run among `at` (a tip's focused runs) covers every path in `paths`: null where one
// does, or the reason none does. Coverage counts only runs after the last failed focused run in `at`.
function coverageRefusal(g, paths, at) {
  const top = g.top;
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

// ADR 0128 as amended by ADR 0189: a green record at `from` also covers `to` when `from` is an ancestor of `to`,
// every path changed between them is Markdown, none is a test path, the run configuration agrees at both (ADR 0230), no full,
// whole, path, or focused run recorded at `to` failed, and the latest run at `to`, if any, does not read unknown.
// No run at `to` is needed. Under the complete-selector declaration the two carries also chain: the record covers `to`
// when a commit M on the ancestry path from `from` to `to` passes the complete-selector carry from `from`, and M..`to`
// passes this Markdown-only rule. Returns the reason the carry fails, or null when it holds; where the chain fails on a
// Markdown-only tail, the tail's own reason.
function carryRefusal(g, from, to, events) {
  if (!g.isAncestor(from, to)) return 'it is not an ancestor of the tip';
  const paths = g.changed(from, to);
  if (!paths) return 'git could not list the paths changed since';
  const other = paths.find((p) => !p.endsWith('.md'));
  if (!other) return markdownRefusal(g, from, to, events, paths);
  const complete = completeRefusal(g, from, to, events, paths);
  if (complete === undefined) return `${other} changed since and is not Markdown`;
  if (complete === null) return null;
  // Children before parents (`--topo-order`, never commit dates). A tail with a non-Markdown path rules out every ancestor
  // of its commit unjudged: an ancestor's tail holds every path the commit's does, short of a revert. A commit on
  // another line of history is still judged. The first refusing Markdown-only tail ends the walk.
  const list = gitSpawn(['rev-list', '--topo-order', '--parents', '--ancestry-path', `${from}..${to}`], g.cwd);
  const rows = list.status === 0 ? list.stdout.split('\n').filter(Boolean).map((l) => l.split(' ')) : [];
  const ruledOut = new Set();
  for (const [mid, ...parents] of rows) {
    if (mid === to) continue;
    const tail = ruledOut.has(mid) ? null : g.changed(mid, to);
    if (!tail || tail.some((p) => !p.endsWith('.md'))) {
      parents.forEach((p) => ruledOut.add(p));
      continue;
    }
    const why = markdownRefusal(g, mid, to, events, tail);
    if (why !== null) return why;
    const head = g.changed(from, mid);
    if (head && completeRefusal(g, from, mid, events, head) === null) return null;
  }
  return complete;
}

// The Markdown-only rule over `paths`, changed from `from` to `to`: null where it holds, or the reason it fails.
function markdownRefusal(g, from, to, events, paths) {
  const other = paths.find((p) => !p.endsWith('.md'));
  if (other) return `${other} changed since and is not Markdown`;
  // The test paths come from the tip commit, never a working tree; no file there means the defaults.
  const config = g.fileAt(to, VERIFICATION);
  if (config === null) return 'git could not read the tip\'s verification configuration';
  if (paths.includes(VERIFICATION)) {
    const changed = configRefusal(g, from, to, config);
    if (changed) return changed;
  }
  const test = paths.find((p) => isTestPath(config, p));
  if (test) return `${test} is a test path`;
  // No recorded run at the tip is fine. A failed full, whole, path, or focused run there is never hidden by a later
  // pass, and a latest run reading unknown refuses; a passing run on a dirty tree refuses nothing.
  const at = events.filter((e) => ['focused', 'full', 'whole', 'path'].includes(e.fields[0]) && e.fields[2] === to);
  const red = at.find((e) => e.fields[1] === 'fail');
  if (red) return `a ${red.fields[0]} run at the tip failed`;
  if (at.length && at[at.length - 1].fields[1] === 'unknown') return `the latest ${at[at.length - 1].fields[0]} run at the tip is unknown`;
  return null;
}

// `**Base:**` records the remote base tip the base step merged into the scope branch
// (`references/scope-branch.md` `## Bringing the scope branch to base`). `base resolve` prints the scope's
// range base (`## The scope's range base`): the newer of `merge-base(base, branch)` and the recorded tip,
// where the recorded tip counts only when it resolves and is an ancestor of the branch. Two candidates
// where neither holds the other, or no usable record, print the merge-base. Like `suite set`, `base set`
// records the resolved full commit and refuses a value that resolves to none.
function verbBaseSet(cwd, root, sha) {
  if (!sha) fail('base set needs a <sha>');
  const commit = resolveCommit(sha, cwd);
  if (!commit) fail(`sha "${sha}" does not resolve to a commit in this repository`);
  upsertHeader(root, 'Base', commit);
}

// The scope's range base: what `base resolve` prints. Refuses where the branch or the merge-base does not resolve.
function rangeBase(g, root, branch, base) {
  const tip = g.commit(branch);
  if (!tip) fail(`branch "${branch}" does not resolve to a commit`);
  const found = gitSpawn(['merge-base', '--end-of-options', base, tip], g.cwd);
  const mb = found.status === 0 ? found.stdout.trim() : '';
  if (!mb) fail(`no merge-base of "${base}" and "${branch}"`);
  const raw = getHeader(readLines(root), 'Base');
  const rec = raw ? g.commit(raw) : null;
  let out = mb;
  if (rec && g.isAncestor(rec, tip) && g.isAncestor(mb, rec)) out = rec;
  return out;
}

function verbBaseResolve(cwd, root, branch, base) {
  console.log(rangeBase(gitReads(cwd), root, branch, base));
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
    // fields print, because a caller (`references/test-selection.md`'s carry run) tests for output at all rather than
    // parsing a sentinel value.
    const v = getHeader(readLines(root), 'Suite');
    if (v === null) return;
    const m = v.match(/^(\S+) @ (\S+)(?: (whole))?$/);
    console.log(m ? `${m[1]} ${m[2]}${m[3] ? ' whole' : ''}` : v);
    return;
  }
  if (field === 'failed') {
    // The read half of `suite failed`: `<file>... @ <sha>`, the test files a failed full run at `<sha>` failed in, or
    // nothing on a ledger with no record, as `get suite` prints (`references/test-selection.md`'s `## The carry run`).
    const rec = failedRecord(root);
    if (rec) console.log(`${rec.files.join(' ')} @ ${rec.sha}`);
    return;
  }
  if (field === 'step') {
    console.log(getHeader(readLines(root), 'Step') || 'none');
    return;
  }
  const names = { stage: 'Stage', branch: 'Branch', anchor: 'Anchor', docs: 'Docs', pr: 'PR' };
  const name = names[field];
  if (!name) fail(`unknown field "${field}" — use stage|step|branch|anchor|docs|pr|slices|unresolved|degraded|deferred|minors|denials|suite|failed`);
  const v = getHeader(readLines(root), name);
  console.log(v === null ? 'absent' : v);
}

module.exports = { verbSuite, verbSuiteRerun, verbSuiteFailed, verbSuiteReusable, verbBaseSet, verbBaseResolve, verbGet };
