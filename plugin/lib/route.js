'use strict';

// route.js: the `route` verb, where a shipped run goes next, judged from `dod.md`, the anchor's Definition of Done on stdin, and the
// facts the caller read through the backend documents (references/shipped-run.md's `## Routing a shipped run`, ADR 0263, INV-0116,
// INV-0196). It reads the run root and git, makes no backend call, and writes nothing. The caller's text reaches the output only as
// a validated repair key.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { fail, readPresent } = require('./refusal.js');
const { fileAt } = require('./git-spawn.js');
const { parseDodLineReadings, dodCriterionLines, collapseWhitespace } = require('./dod-line.js');
const { readCriterion } = require('./dod-open.js');
const { readDeployRecord } = require('./ledger-records.js');

const CONTROL_RE = new RegExp('[\\x00-\\x1f\\x7f-\\x9f\\u2028\\u2029]');
const POSTURE_RE = /^Posture:\s*`?(none|manual|auto)`?\s*$/m;

// A key or target name: one non-empty line with no control character, and no option-shaped word that is a missing value.
function checkName(flag, value) {
  if (value === undefined || value === '' || value.startsWith('--')) fail(`route ${flag} needs a value`);
  if (CONTROL_RE.test(value)) fail(`route ${flag} value must hold no newline or control character`);
  return value;
}

// The flags of one call: `{ merge, targets, open, closed, failed, none }`.
function parseFlags(args) {
  const out = { merge: null, targets: [], open: [], closed: [], failed: false, none: false };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === '--repairs-failed') out.failed = true;
    else if (flag === '--repairs-none') out.none = true;
    else if (flag === '--target') out.targets.push(checkName(flag, args[++i]));
    else if (flag === '--merge') {
      if (out.merge !== null) fail('route --merge given twice');
      out.merge = checkName(flag, args[++i]);
      if (!/^[0-9a-fA-F]{7,64}$/.test(out.merge)) fail('route --merge takes a commit hash');
    } else if (flag === '--repair') {
      const state = args[++i];
      if (state !== 'open' && state !== 'closed') fail('route --repair takes open|closed <key>');
      out[state].push(checkName(`--repair ${state}`, args[++i]));
    } else fail(`route: unrecognized argument "${flag}"`);
  }
  return out;
}

// The posture at the merge commit: `none` with no commit, no deployment.md there, or no `Posture:` line. A commit git does not hold is
// refused, since reading it as `none` would route a manual run to wrap-up.
function postureAt(cwd, merge) {
  if (!merge) return 'none';
  const has = spawnSync('git', ['cat-file', '-e', `${merge}^{commit}`], { cwd, encoding: 'utf8' });
  if (has.error || has.status !== 0) fail(`route: merge commit ${merge} is not in this repository; fetch base first`);
  const text = fileAt(merge, 'docs/agents/deployment.md', cwd);
  if (text === null) fail(`route: git cannot read docs/agents/deployment.md at ${merge}`);
  const m = POSTURE_RE.exec(text);
  return m ? m[1] : 'none';
}

// True when a listed target is not recorded `deployed`: an absent or unreadable record counts as not recorded.
function anyUndeployed(root, targets) {
  let records = null;
  try {
    records = readDeployRecord(root);
  } catch (e) {
    if (!e.isRefusal) throw e;
  }
  const deployed = new Set((records || []).filter((r) => r.state === 'deployed').map((r) => r.target));
  return targets.some((t) => !deployed.has(t));
}

// A Definition of Done's checklist lines, or null where it yields none (empty, fence-broken, or no checklist).
function criterionLinesOrNull(text, label) {
  try {
    const lines = dodCriterionLines(text, label, 'read');
    return lines.length ? lines : null;
  } catch (e) {
    if (!e.isRefusal) throw e;
    return null;
  }
}

const keysOf = (line) => new Set(parseDodLineReadings(line).map((r) => collapseWhitespace(r.criterion)));
const verdictOf = (line) => parseDodLineReadings(line)[0].verdict;

// `route --root <run-root> [--merge <sha>] [--target <name>]… [--repair open|closed <key>]… [--repairs-failed] [--repairs-none]`
// with the anchor's Definition of Done on stdin. Prints the verdict line, then one `repair <key> is open; finish its chain first`
// line per open repair on a `repair` verdict, then `hand-sync` where a `dod.md` line has no matching anchor line.
function verbRoute(cwd, root, args, anchorText) {
  const flags = parseFlags(args);
  const posture = postureAt(cwd, flags.merge);
  // One read of dod.md serves the criteria and the pairing: null where it is missing, fence-broken, or holds no criterion line.
  const dodText = readPresent(path.join(root, 'dod.md'), 'utf8');
  const dodLines = dodText === null ? null : criterionLinesOrNull(dodText, 'dod.md');
  const anchor = criterionLinesOrNull(anchorText, 'the anchor');
  const fromDod = dodLines !== null;
  const criteria = (fromDod ? dodLines : anchor || []).map(readCriterion);

  let unpaired = false;
  let differs = false;
  if (fromDod && anchor) {
    for (const line of dodLines) {
      const keys = keysOf(line);
      const hit = anchor.find((a) => [...keysOf(a)].some((k) => keys.has(k)));
      if (!hit) unpaired = true;
      else if (verdictOf(hit) !== verdictOf(line)) differs = true;
    }
  }

  const out = [];
  const observed = criteria.filter((c) => c.label === 'not-met' && c.citation);
  if (observed.length) {
    if (flags.failed) out.push('repair');
    else if (flags.open.length) out.push('repair', ...flags.open.map((k) => `repair ${k} is open; finish its chain first`));
    else if (flags.closed.some((k) => observed.some((c) => !c.cited.includes(k)))) out.push('re-verify');
    else if (flags.closed.length || flags.none) out.push('repair');
    else out.push('needs-repairs');
  } else {
    const manualUndeployed = posture === 'manual' && anyUndeployed(root, flags.targets);
    const noLedger = !fs.existsSync(path.join(root, 'ledger.md'));
    const settled = fromDod && anchor !== null && criteria.every((c) => c.settled);
    out.push(settled && !differs && !manualUndeployed && !noLedger ? 'wrap-up' : 'verify-ship');
  }
  if (unpaired) out.push('hand-sync');
  console.log(out.join('\n'));
}

module.exports = { verbRoute };
