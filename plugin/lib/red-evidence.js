'use strict';

// red-evidence.js: the `red-evidence` verb, the scope review's red-evidence reading (`references/review-scope-mode.md`'s
// `### 4.2 Red evidence`): the ledger's red suite record and the check status of a pull-request head, read and judged without a
// write to the run, the ledger, or git.

const fs = require('fs');
const path = require('path');
const { ciJudgment } = require('./ci.js');
const { fail } = require('./refusal.js');
const { readLines, getHeader } = require('./ledger.js');
const { drivePath } = require('./drive-path.js');
const { traceFlags } = require('./trace-window.js');
const { gitSpawn } = require('./git-spawn.js');
const { isTestPath, verificationCommandsOf } = require('./verification.js');
const { VERIFICATION, gitReads, runEvents, rangeBase, failedRuns, failedRecord, coverageRefusal, pathRunPassed, parseSuiteRecord, ancestorOrRefuse } = require('./suite-base-get.js');

// The ledger's suite record as `{ result, sha }`, or null where the ledger holds none; refuses an unreadable record.
function suiteRecord(root) {
  const raw = getHeader(readLines(root), 'Suite');
  if (!raw) return null;
  const record = parseSuiteRecord(raw);
  if (!record) fail(`red-evidence: unreadable suite record: ${raw}`);
  return record;
}

const RUN_KINDS = ['full', 'whole', 'path', 'focused'];

// Whether the runs recorded at commit `c` cover the red record `from` whose failed test files are `files`: no failed run at `c`,
// then each failed file passed alone or inside a focused run's path set on a clean tree there. A record with no failed file is
// covered by a focused run over every path of the scope's range at `c`; where the focused fence repeats the full fence, that
// run is a full run, so a passing run on a clean tree at `c` must be recorded and each test file changed since the record needs
// its own passing `path` run (`resolveBase` reads the range base lazily).
// A run whose result or tree reads `unknown` is no pass and covers nothing (INV-0009).
function covers(g, events, c, from, files, resolveBase) {
  if (failedRuns(events, c, RUN_KINDS)) return false;
  const focused = events.filter((e) => e.fields[0] === 'focused' && e.fields[2] === c);
  if (files.length) return files.every((file) => pathRunPassed(g, events, c, file) || coverageRefusal(g, [file], focused) === null);
  const config = g.fileAt(c, VERIFICATION);
  if (config === null) return false;
  const { full, focused: foc } = verificationCommandsOf(config);
  if (foc && foc !== full) {
    const paths = g.changed(resolveBase(), c);
    return Boolean(paths) && coverageRefusal(g, paths, focused) === null;
  }
  if (!events.some((e) => RUN_KINDS.includes(e.fields[0]) && e.fields[2] === c && e.fields[1] === 'pass' && e.fields[3] === 'clean')) return false;
  const since = g.changed(from, c);
  if (!since) return false;
  return since.filter((p) => isTestPath(config, p) && g.fileAt(c, p) !== null).every((p) => pathRunPassed(g, events, c, p));
}

// The lines the local suite record raises: `red <sha> files=<failed files>` where the record reads red at the tip or at an ancestor
// of it, or `covered <sha> by <commit>` where a later commit on the tip's ancestry holds the passing runs that close it. The
// `Failed` record names files only where it carries the record's own full SHA.
function localLines(ctx, record) {
  const { g, root, tip } = ctx;
  if (record.result !== 'red') return [];
  if (record.sha !== tip && !ancestorOrRefuse(g, record.sha, tip)) return [];
  const failed = failedRecord(root);
  const files = failed && failed.sha === record.sha ? failed.files : [];
  const closer = closerOf(ctx, record.sha, files);
  return [closer ? `covered ${record.sha} by ${closer}` : `red ${record.sha} files=${files.join(' ')}`];
}

// The first commit after `from` on the tip's ancestry (parents before children) whose recorded runs cover the red commit `from`
// whose failed test files are `files`, or undefined. Refuses where git cannot list the commits.
function closerOf(ctx, from, files) {
  const { g, tip, events, resolveBase } = ctx;
  const list = gitSpawn(['rev-list', '--reverse', '--topo-order', '--ancestry-path', `${from}..${tip}`], g.cwd);
  if (list.status !== 0) fail(`red-evidence: cannot list the commits from ${from} to ${tip}: ${(list.stderr || '').trim() || `git exited ${list.status}`}`);
  return list.stdout.split('\n').filter(Boolean).find((c) => covers(g, events, c, from, files, resolveBase));
}

// The lines the check status raises: the verdict line `ci: <verdict> <sha>` and, only for a failed verdict on a head that is the
// tip or an ancestor of it (INV-0191), `ci-failed <check> <link> <sha>` per failed named check. A malformed `## CI` section prints
// `ci-malformed` and no verdict. A head that is no ancestor of the tip says so on its verdict line and raises nothing. A failed
// head's checks name no test file, so a later commit on the tip's ancestry whose recorded runs cover a red record with no failed
// file closes them: `covered <sha> by <commit>` replaces the `ci-failed` lines.
function ciLines(ctx, head, file) {
  const { g, tip } = ctx;
  let input;
  try {
    input = fs.readFileSync(path.resolve(g.cwd, drivePath(file)), 'utf8');
  } catch (e) {
    fail(`red-evidence: cannot read --ci-file ${file}: ${e.code || e.message}`);
  }
  const judged = ciJudgment(g.cwd, head, input);
  if (judged.malformed) return ['ci-malformed'];
  const behind = judged.kind === 'failed' && !(judged.at === tip || ancestorOrRefuse(g, judged.at, tip));
  const lines = [`ci: ${judged.kind} ${judged.at}${judged.reason ? ' ' + judged.reason : ''}${behind ? ' (head is no ancestor of the tip)' : ''}`];
  if (judged.kind === 'failed' && !behind) {
    const closer = closerOf(ctx, judged.at, []);
    if (closer) lines.push(`covered ${judged.at} by ${closer}`);
    else for (const s of judged.standing.filter((x) => x.kind === 'failed')) lines.push(`ci-failed ${s.name} ${s.link || '-'} ${judged.at}`);
  }
  return lines;
}

// `red-evidence --root <run-root> --branch <branch> --base <base-ref> [--ci-head <sha> --ci-file <path>]`, run in the scope
// checkout: prints the local suite record's line, the CI lines, and `none` where it read and found no finding (a `red` or
// `ci-failed` line), and only `nothing-to-read` where the ledger holds no suite record and no CI input is given.
function verbRedEvidence(cwd, args) {
  const { flags } = traceFlags('red-evidence', args, ['--root', '--branch', '--base', '--ci-head', '--ci-file'], false);
  for (const need of ['--root', '--branch', '--base']) if (!flags[need]) fail(`red-evidence needs ${need} <value>`);
  if (Boolean(flags['--ci-head']) !== Boolean(flags['--ci-file'])) fail('red-evidence takes --ci-head and --ci-file together or neither');
  const root = path.resolve(cwd, drivePath(flags['--root']));
  const g = gitReads(cwd);
  const tip = g.commit(flags['--branch']);
  if (!tip) fail(`red-evidence: branch "${flags['--branch']}" does not resolve to a commit`);
  const record = suiteRecord(root);
  if (!record && !flags['--ci-head']) {
    console.log('nothing-to-read');
    return;
  }
  let from;
  const ctx = { g, root, tip, events: runEvents(root), resolveBase: () => (from = from || rangeBase(g, root, flags['--branch'], flags['--base'])) };
  const lines = [
    ...(record ? localLines(ctx, record) : []),
    ...(flags['--ci-head'] ? ciLines(ctx, flags['--ci-head'], flags['--ci-file']) : []),
  ];
  if (!lines.some((l) => /^(red|ci-failed) /.test(l))) lines.push('none');
  console.log(lines.join('\n'));
}

module.exports = { verbRedEvidence };
