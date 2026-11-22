'use strict';

// run-state.js: the anchor's published snapshot of a ledger, rendered by `publish` and read back by `adopt` (ADR 0042).

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { checkSliceId, SLICE_STATUSES, STAGES, APPENDED_HEADERS, headerRe, ledgerPath, readLines, splitLines, writeLines, getHeader, readBullets, tableRowIndexes, splitRow } = require('./ledger.js');
const { maskFencedLines } = require('./md-sections.js');
const { validateLabel, STEPS } = require('./ledger-lifecycle.js');
const { checkDocsValue, checkPrValue, checkDeployValue } = require('./ledger-records.js');
const { checkDodWritten } = require('./dod-gate.js');
const { withRunLock } = require('./run-digest.js');

// scope.js performs no store I/O here — slice-store I/O stays in-agent (ADR 0022). `publish`
// renders the ledger as a single `## Run state` section; `adopt` reverses that, reconstructing a
// ledger from a whole anchor body. The ledger stays the single source of truth; the snapshot is a
// mirror.
//
// The payload's boundary is marked, never inferred. Bounding it by heading structure — reading the
// section as ending at the next heading, the way kb-patch.js's merge() bounds a knowledge-base
// section — cannot be made correct: two fix cycles moved the failure between a bare `#`-led line
// inside the payload silently truncating it, and refusing whenever content past a heading still
// looked like ledger data, which made an unrelated table or a stray "**Degraded:**" mention
// elsewhere on the anchor permanently un-adoptable — a truncated ledger is itself a well-formed
// ledger, so nothing in the payload distinguishes the two cases. A marked boundary removes the
// question rather than answering it: `adopt` disregards every heading in the body, so heading
// structure carries no meaning for it, and the two markers alone bound the payload.
const RUN_STATE_OPEN = '<!-- superdev:run-state -->';
const RUN_STATE_CLOSE = '<!-- /superdev:run-state -->';

// The ledger rendered as a `## Run state` section: its `# Ledger — <slug>` title line dropped,
// every other byte — including the blank line that followed the title and the trailing blank line
// writeLines leaves — wrapped unchanged between the two markers. Pure: its text feeds
// adoptLines below with no filesystem or process I/O in between.
function publishText(root) {
  const lines = readLines(root);
  return ['## Run state', RUN_STATE_OPEN, ...lines.slice(1), RUN_STATE_CLOSE].join('\n');
}

function verbPublish(root) {
  console.log(publishText(root));
}

// The payload between the two markers, out of a whole anchor body. Only the markers bound it —
// heading structure, and what the payload's own content looks like, play no part. The marker scan
// runs on maskFencedLines()'s output, so a marker shown inside a fenced illustrative example (an
// HTML comment renders invisibly, so a fence is the only way to show one to a human at all — a
// snippet in documentation, a snapshot quoted in an issue comment) is never read as the real payload
// boundary, and a body carrying only such a fenced example — no real markers anywhere — refuses as
// carrying no opening marker rather than silently adopting the example as live state. An unterminated
// fence refuses outright, the same posture kb-patch.js's own extractSection()/merge() take, rather
// than guess where it would have closed and risk masking a real marker past it. Refuses when the
// opening marker is missing, when it appears more than once (which payload to adopt cannot be
// resolved), when the closing marker is missing, or when no closing marker follows the opening one.
function extractRunState(body) {
  const lines = splitLines(body);
  const masked = maskFencedLines(lines, 'anchor body', 'adopted');
  const openIdxs = [];
  const closeIdxs = [];
  masked.forEach((line, i) => {
    const t = line.trim();
    if (t === RUN_STATE_OPEN) openIdxs.push(i);
    else if (t === RUN_STATE_CLOSE) closeIdxs.push(i);
  });
  if (openIdxs.length === 0) fail(`anchor body carries no "${RUN_STATE_OPEN}" marker`);
  if (openIdxs.length > 1) {
    fail(`anchor body carries "${RUN_STATE_OPEN}" ${openIdxs.length} times — which run state to adopt cannot be resolved`);
  }
  if (closeIdxs.length === 0) fail(`anchor body carries no "${RUN_STATE_CLOSE}" marker`);
  const start = openIdxs[0];
  const end = closeIdxs.find((i) => i > start);
  if (end === undefined) {
    fail(`anchor body's "${RUN_STATE_CLOSE}" marker appears before its "${RUN_STATE_OPEN}" marker`);
  }
  return lines.slice(start + 1, end);
}

// The payload validated against the schema this file already owns, and turned back into ledger
// lines. Pure — no filesystem access — so every refusal is reachable without a
// ledger on disk. `**Branch:**` is what the ledger heading is reconstructed from, so its absence is
// the one schema failure that matters (ADR 0042); `Stage` and the slice table get the same checks
// `stage set` and `slice` already apply.
function adoptLines(root, body, shipped = false) {
  const payload = extractRunState(body);
  const branch = getHeader(payload, 'Branch');
  if (!branch) fail('the run-state payload carries no **Branch:** line — cannot reconstruct the ledger heading');
  const { slug } = validateLabel(branch);
  const rootSlug = path.basename(root);
  if (rootSlug !== slug) fail(`run root "${rootSlug}" does not match the branch slug "${slug}" — refusing to adopt`);
  const stage = getHeader(payload, 'Stage');
  if (stage !== null && !STAGES.includes(stage)) fail(`run-state payload carries unknown stage "${stage}"`);
  const step = getHeader(payload, 'Step');
  if (step !== null && !STEPS.includes(step)) fail(`run-state payload carries unknown step "${step}"`);
  // `closed` is terminal (`## The stage never moves backwards`), and `shipped` is a stage
  // run-init.md stops at (a run awaiting wrap-up), and it rotates aside only `closed`. Plain `adopt` refuses both,
  // the same posture every other schema invariant here takes, rather than trust that its caller
  // always checks first. The `shipped` parameter is the `--shipped` opt-in: it adopts a `shipped`
  // payload and no other, for a command recreating a shipped original's missing run root
  // (shipped-run.md's `## Adopting a shipped original`, ADR 0124).
  if (shipped) {
    if (stage === null) fail('--shipped adopts only a run-state payload at stage "shipped", and this one carries no **Stage:** line');
    if (stage !== 'shipped') fail(`--shipped adopts only a run-state payload at stage "shipped", not "${stage}"`);
  } else if (stage === null) {
    fail('the run-state payload carries no **Stage:** line — a ledger adopted without one could never move its stage');
  } else if (stage === 'shipped' || stage === 'closed') {
    fail(`run-state payload carries stage "${stage}" — a finished run has nothing to adopt`);
  }
  const sliceIds = [];
  for (const i of tableRowIndexes(payload)) {
    const cells = splitRow(payload[i]);
    if (cells.length !== 7) fail('run-state payload carries a slice row without the 7 ledger columns');
    const id = checkSliceId(cells[0]);
    if (!SLICE_STATUSES.includes(cells[5])) fail(`run-state payload's slice row "${id}" has unknown status "${cells[5]}" (${SLICE_STATUSES.join(', ')})`);
    if (sliceIds.includes(id)) fail(`run-state payload names slice id "${id}" in more than one row`);
    sliceIds.push(id);
  }
  // The writers' own value rules, applied to each header's raw text before getHeader's token normalization, and a header line
  // the ledger's writers would never write twice.
  for (const name of [...APPENDED_HEADERS, 'Degraded', 'Unresolved', 'Deferred', 'Minors']) {
    if (payload.filter((l) => headerRe(name).test(l)).length > 1) fail(`run-state payload carries more than one **${name}:** line`);
  }
  const raw = (name) => { const m = payload.map((l) => l.match(headerRe(name))).find(Boolean); return m ? m[1].trim() : null; };
  if (raw('PR')) checkPrValue(raw('PR'));
  if (raw('Docs')) checkDocsValue(raw('Docs'));
  if (raw('Deploy')) checkDeployValue(raw('Deploy'));
  // A `**Minors:**` bullet names a slice by id (`minors add` enforces it). The anchor body is editable by anyone
  // with issue access and the controller derives `reports/<id>/progress.md` from the bullet, so adopt refuses
  // any bullet the payload's slice table does not hold, the way it refuses an unknown stage.
  for (const b of readBullets(payload, 'Minors')) {
    try { checkSliceId(b); } catch (e) { fail(`run-state payload's **Minors:** bullet: ${e.message}`); }
    if (!sliceIds.includes(b)) fail(`run-state payload's **Minors:** bullet "${b}" is no id in its slice table`);
  }
  return [`# Ledger — ${slug}`, ...payload];
}

function verbAdopt(root, body, shipped) {
  const lines = adoptLines(root, body, shipped);
  // A snapshot at `implementing` or later needs the Definition of Done run init wrote from the anchor (triage #4).
  // `--shipped` writes its `dod.md` after the adopt (shipped-run.md's `## Adopting a shipped original`), so it passes.
  if (!shipped && STAGES.indexOf(getHeader(lines, 'Stage')) > STAGES.indexOf('planned')) checkDodWritten(root);
  fs.mkdirSync(root, { recursive: true });
  // The absence check and the write share one hold (INV-0202), so of two adopts at once one writes and the other refuses.
  withRunLock(root, () => {
    if (fs.existsSync(ledgerPath(root))) fail(`ledger already exists: ${ledgerPath(root)}`);
    writeLines(root, lines);
  });
}

module.exports = { publishText, verbPublish, verbAdopt };
