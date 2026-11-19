'use strict';

// red-evidence.js: the `red-evidence` verb, the scope review's red-evidence reading (`references/review-scope-mode.md`'s
// `### 4.2 Red evidence`): the ledger's red suite record and the check status of a pull-request head, read and judged without a
// write to the run, the ledger, or git.

const path = require('path');
const { fail } = require('./refusal.js');
const { readLines, getHeader } = require('./ledger.js');
const { drivePath } = require('./drive-path.js');
const { traceFlags } = require('./trace-window.js');
const { gitSpawn } = require('./git-spawn.js');
const { isTestPath, verificationCommandsOf } = require('./verification.js');
const { VERIFICATION, gitReads, runEvents, rangeBase, failedRuns, failedRecord, coverageRefusal, pathRunPassed } = require('./suite-base-get.js');

// The ledger's suite record as `{ result, sha }`, or null where the ledger holds none; refuses an unreadable record.
function suiteRecord(root) {
  const raw = getHeader(readLines(root), 'Suite');
  if (!raw) return null;
  const m = raw.match(/^(\S+)\s+@\s+(\S+)(?:\s+whole)?$/);
  if (!m) fail(`red-evidence: unreadable suite record: ${raw}`);
  return { result: m[1], sha: m[2] };
}

const RUN_KINDS = ['full', 'whole', 'path', 'focused'];

// Whether the runs recorded at commit `c` cover the red record `from` whose failed test files are `files`: no failed run at `c`,
// then each failed file passed alone or inside a focused run's path set on a clean tree there. A record with no failed file is
// covered by a focused run over every path of the scope's range at `c`; where the focused fence repeats the full fence, that
// run is a full run, so each test file changed since the record needs its own passing `path` run (`rangeBase` is read lazily).
// A run whose result or tree reads `unknown` is no pass and covers nothing (INV-0009).
function covers(g, events, c, from, files, rangeBase) {
  if (failedRuns(events, c, RUN_KINDS)) return false;
  const focused = events.filter((e) => e.fields[0] === 'focused' && e.fields[2] === c);
  if (files.length) return files.every((file) => pathRunPassed(g, events, c, file) || coverageRefusal(g, [file], focused) === null);
  const config = g.fileAt(c, VERIFICATION);
  if (config === null) return false;
  const { full, focused: foc } = verificationCommandsOf(config);
  if (foc && foc !== full) {
    const paths = g.changed(rangeBase(), c);
    return Boolean(paths) && coverageRefusal(g, paths, focused) === null;
  }
  const since = g.changed(from, c);
  if (!since) return false;
  return since.filter((p) => isTestPath(config, p) && g.fileAt(c, p) !== null).every((p) => pathRunPassed(g, events, c, p));
}

// The lines the local suite record raises: `red <sha> files=<failed files>` where the record reads red at the tip or at an ancestor
// of it, or `covered <sha> by <commit>` where a later commit on the tip's ancestry holds the passing runs that close it. The
// `Failed` record names files only where it carries the record's own full SHA.
function localLines(g, root, branch, base, record) {
  const tip = g.commit(branch);
  if (!tip) fail(`red-evidence: branch "${branch}" does not resolve to a commit`);
  if (record.result !== 'red') return [];
  if (record.sha !== tip && !g.isAncestor(record.sha, tip)) return [];
  const failed = failedRecord(root);
  const files = failed && failed.sha === record.sha ? failed.files : [];
  const events = runEvents(root);
  let from;
  const resolveBase = () => (from = from || rangeBase(g, root, branch, base));
  const list = gitSpawn(['rev-list', '--reverse', '--topo-order', `${record.sha}..${tip}`], g.cwd);
  const later = list.status === 0 ? list.stdout.split('\n').filter(Boolean) : [];
  const closer = later.find((c) => g.isAncestor(record.sha, c) && covers(g, events, c, record.sha, files, resolveBase));
  return [closer ? `covered ${record.sha} by ${closer}` : `red ${record.sha} files=${files.join(' ')}`];
}

// `red-evidence --root <run-root> --branch <branch> --base <base-ref>`, run in the scope checkout: prints one line per finding,
// `none` where it read and found nothing, and `nothing-to-read` where the ledger holds no suite record.
function verbRedEvidence(cwd, args) {
  const { flags } = traceFlags('red-evidence', args, ['--root', '--branch', '--base', '--ci-head', '--ci-file'], false);
  for (const need of ['--root', '--branch', '--base']) if (!flags[need]) fail(`red-evidence needs ${need} <value>`);
  if (Boolean(flags['--ci-head']) !== Boolean(flags['--ci-file'])) fail('red-evidence takes --ci-head and --ci-file together or neither');
  const root = path.resolve(cwd, drivePath(flags['--root']));
  const g = gitReads(cwd);
  const record = suiteRecord(root);
  if (!record) {
    console.log('nothing-to-read');
    return;
  }
  const lines = localLines(g, root, flags['--branch'], flags['--base'], record);
  console.log(lines.length ? lines.join('\n') : 'none');
}

module.exports = { verbRedEvidence };
