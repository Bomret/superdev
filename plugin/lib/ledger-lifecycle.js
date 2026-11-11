'use strict';

// ledger-lifecycle.js: the verbs that create a ledger and move a run along, `init`, `stage`, `step`, and `slice`.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const {
  checkSliceId, CHANGE_TYPES, SLUG_RE, SLICE_STATUSES, STAGES, stageMoveAllowed,
  ledgerPath, readLines, writeLines, headerRe, getHeader, insertHeader, setHeader, tableRowIndexes, sanitizeCell, splitRow,
} = require('./ledger.js');
const { mainWorkTree } = require('./main-work-tree.js');
const { appendTrace } = require('./trace-log.js');
const { readSide, writeSide, withRunLock } = require('./run-digest.js');
const { checkRun } = require('./run-check.js');

// Appended, never read-concat-written: two `init` calls racing each other on the same fresh
// repository at worst leave a duplicate line, where a rewrite could truncate the file.
function ensureSuperdevIgnored(cwd) {
  const gi = path.join(cwd, '.gitignore');
  let giText = '';
  try {
    giText = fs.readFileSync(gi, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (!giText.split('\n').some((l) => l.trim() === '.superdev/' || l.trim() === '.superdev')) {
    fs.appendFileSync(gi, (giText && !giText.endsWith('\n') ? '\n' : '') + '.superdev/\n', 'utf8');
  }
}

// `init`'s entry stage (Critical review finding, ADR 0079): the caller states which stage its own
// ledger enters at, because only the caller knows who is writing it — a default would guess wrong for
// every caller but one. `/superdev:plan` cuts the branch and scopetree itself and enters at `planned`;
// run init's own `fresh` path (no plan ever ran, or an append onto a ledger that was never `planned`)
// enters straight at `implementing`, because no further plan step follows it. No other stage is a valid
// entry point, so `init` refuses anything else by name rather than accepting the full `STAGES` set.
const INIT_ENTRY_STAGES = ['planned', 'implementing'];

// `init` owns a closed ledger's rotation (ADR 0079/0080, ADR 0106): `scope.js` is the sole ledger read and write path
// (ADR 0022), the rotation is a ledger operation, and `references/run-init.md` merely describes it
// rather than instructing a reader to perform it by hand. Renamed aside to `ledger-<stage>-<date>.md`,
// `date +%FT%H%M%S` precision — fine enough that two same-day rotations essentially never collide, and
// the loop below still never overwrites one that does. Nothing is deleted, so ADR 0007's seven-day
// trail and `scope-prune`'s contained-or-gone reap rule (ADR 0053) both stand unchanged. The run's
// `trace.log` moves aside first, to `trace-<stage>-<date>.log` under the same name stem, so the new run's
// trace holds only its own lines. A trace that cannot be moved stops init with the ledger still in place;
// a ledger that cannot be moved puts the moved trace back and stops init, so both files stay in place —
// and when the trace cannot go back either, init stops naming the stranded trace's path; a run that
// recorded no trace rotates its ledger alone.
function rotateFinishedLedger(root, stage, log) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '');
  let stem = `${stage}-${stamp}`;
  const taken = (s) => fs.existsSync(path.join(root, `ledger-${s}.md`)) || fs.existsSync(path.join(root, `trace-${s}.log`));
  for (let n = 2; taken(stem); n++) stem = `${stage}-${stamp}-${n}`;
  const trace = path.join(root, 'trace.log');
  const traceDest = path.join(root, `trace-${stem}.log`);
  let traceMoved = false;
  try {
    fs.renameSync(trace, traceDest);
    traceMoved = true;
  } catch (e) {
    if (e.code !== 'ENOENT') fail(`cannot move the ${stage} run's trace.log aside (${e.code}) — the ledger stays in place`);
  }
  const dest = path.join(root, `ledger-${stem}.md`);
  try {
    fs.renameSync(ledgerPath(root), dest);
  } catch (e) {
    // The trace goes back, so a refused rotation leaves both files as they were. A trace that cannot go
    // back is named by path, so the operator can move it back by hand.
    if (traceMoved) {
      try {
        fs.renameSync(traceDest, trace);
      } catch (back) {
        fail(`cannot move the ${stage} run's ledger.md aside (${e.code}), and cannot move its trace back (${back.code}) — the ledger stays in place; move ${traceDest} back to ${trace} by hand`);
      }
    }
    fail(`cannot move the ${stage} run's ledger.md aside (${e.code}) — the ledger and its trace stay in place`);
  }
  // Both files left their names: the new run's ledger and trace start with no digest, and the writes that follow seal them.
  withRunLock(root, () => {
    const side = readSide(root);
    delete side.ledger;
    delete side.trace;
    writeSide(root, side);
  });
  log(`rotated ${stage} ledger to ${dest}`);
}

function validateLabel(label) {
  const cut = label.indexOf('/');
  if (cut < 0) fail(`label "${label}" has no "/" — a feature label is <type>/<slug>`);
  const type = label.slice(0, cut);
  const slug = label.slice(cut + 1);
  if (!type) fail(`label "${label}" has an empty type segment`);
  if (!slug) fail(`label "${label}" has an empty slug segment`);
  if (!CHANGE_TYPES.includes(type)) fail(`label type "${type}" is not a change type (${CHANGE_TYPES.join(', ')})`);
  if (!SLUG_RE.test(slug)) fail(`label slug "${slug}" fails the scope-slug charset [a-zA-Z0-9][a-zA-Z0-9_-]*`);
  return { type, slug };
}

// `log` takes init's own stdout lines; `open` passes one that drops them, since its stdout is its outcome.
// `checked` is true where the caller (`open`) has already checked the run's digest, so the check runs once per verb.
function verbInit(cwd, label, stage, stdinJson, log = console.log, checked = false) {
  if (!INIT_ENTRY_STAGES.includes(stage)) {
    fail(`init needs an entry stage, one of ${INIT_ENTRY_STAGES.join('|')} — got "${stage || ''}"`);
  }
  const { slug } = validateLabel(label);
  const workTree = mainWorkTree(cwd) || cwd;
  const root = path.join(workTree, '.superdev', 'scopes', slug);
  // `init` names no `--root`, so it checks the run's digest itself, once, before it reads or writes a file of the run (ADR 0227).
  if (!checked) checkRun(root);
  // The real double-init signal is an existing ledger.md, not the run-root directory: run init
  // writes dod.md into the run root before calling init, so the directory legitimately exists
  // on every fresh run. A ledger at stage `planned` is the one exception (ADR 0079): it names a
  // scope branch a plan cut but no slice has started on, so a re-init over it — an append-mode
  // plan revising it, or `/superdev:plan`'s own §6 filling in the slice table §2 left empty —
  // regenerates the ledger instead of refusing.
  let priorStage;
  let priorStep = null;
  if (fs.existsSync(ledgerPath(root))) {
    const priorLines = readLines(root);
    priorStage = getHeader(priorLines, 'Stage');
    priorStep = getHeader(priorLines, 'Step');
    if (priorStage === 'shipped') {
      // A shipped run is finished only when wrap-up closes it (ADR 0106); re-initialising it would
      // rotate away a ledger verify-ship and wrap-up still read.
      fail(
        `ledger already exists at stage "shipped": ${ledgerPath(root)} — finish that run first with ` +
          '/superdev:verify-ship and /superdev:wrap-up',
      );
    } else if (priorStage !== 'closed' && priorStage !== 'planned') {
      fail(`ledger already exists: ${ledgerPath(root)}`);
    } else if (priorStage === 'planned') {
      log(`ledger already exists at stage "planned" (no slice has run) — overwriting`);
    }
  }

  let spec;
  try {
    spec = JSON.parse(stdinJson);
  } catch {
    fail('stdin is not JSON — expected {"anchor": "...", "slices": [...]}');
  }
  if (!spec || typeof spec.anchor !== 'string' || !Array.isArray(spec.slices)) {
    fail('stdin JSON must carry an "anchor" string and a "slices" array');
  }

  const seenIds = new Set();
  const rows = spec.slices.map((s) => {
    for (const k of ['id', 'issue', 'title', 'type']) {
      if (typeof s[k] !== 'string' || !s[k]) fail(`slice row missing "${k}"`);
    }
    // tableRowIndexes drops any row whose first cell is `id` (the header row) — a slice actually
    // named that would be written but invisible to every reader, so refuse it here.
    checkSliceId(s.id);
    if (/^id$/i.test(s.id)) fail(`slice id "${s.id}" is reserved (it reads as the table header row)`);
    if (seenIds.has(s.id)) fail(`duplicate slice id "${s.id}"`);
    seenIds.add(s.id);
    const dep = s['depends-on'] || '—';
    const status = s.status || 'todo';
    if (!SLICE_STATUSES.includes(status)) fail(`slice ${s.id} has unknown status "${status}"`);
    return (
      `| ${sanitizeCell(s.id)} | ${sanitizeCell(s.issue)} | ${sanitizeCell(s.title)} | ${sanitizeCell(s.type)} | ` +
      `${sanitizeCell(dep)} | ${status} | ${sanitizeCell(s.range || '—')} |`
    );
  });

  if (priorStage === 'closed') {
    // A closed run's ledger — ADR 0007's seven-day trail keeps it on disk past merge, so a new
    // feature reusing a retired label (ADR 0083) lands here. Rotate aside rather than refuse. Done only
    // after every refusal above, so a refused init leaves the finished ledger untouched.
    rotateFinishedLedger(root, priorStage, log);
  }

  // Ensure .superdev/ is git-ignored in the main working tree that holds it — but after every
  // refusal above, so a refused init leaves the repo untouched.
  ensureSuperdevIgnored(workTree);

  const doc = [
    `# Ledger — ${slug}`,
    '',
    `**Stage:** ${stage}`,
    `**Branch:** ${label}`,
    // Not sanitizeCell: the Anchor is a header line, not a table cell, and no header reader
    // unescapes `\|` — only the one-line shape matters here.
    `**Anchor:** ${spec.anchor.replace(/(\r\n|\r|\n)+/g, ' ')}`,
    '',
    '| id | issue | title | type | depends-on | status | range |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ];
  // A planned rewrite keeps the standing step (ADR 0147): `/superdev:plan`'s step survives its own re-init.
  if (priorStage === 'planned' && stage === 'planned' && priorStep !== null) insertHeader(doc, 'Step', priorStep);
  fs.mkdirSync(root, { recursive: true });
  writeLines(root, doc);
  log(root);
  return root;
}

// Set-only: the read path is `get stage`. Returns true when the write closed a standing step.
function verbStage(root, sub, value) {
  const lines = readLines(root);
  if (sub !== 'set') fail(`unknown stage subcommand "${sub}" — use set`);
  if (!STAGES.includes(value)) fail(`unknown stage "${value}" (${STAGES.join(', ')})`);
  const cur = getHeader(lines, 'Stage');
  if (cur === null) fail('ledger carries no **Stage:** line — fix the ledger by hand first');
  if (cur !== value) {
    if (!STAGES.includes(cur)) fail(`ledger carries unknown stage "${cur}" — fix the ledger by hand first`);
    if (!stageMoveAllowed(cur, value)) {
      const allowed = STAGES.filter((s) => s !== cur && stageMoveAllowed(cur, s));
      fail(`stage "${cur}" does not move to "${value}" — allowed: ${allowed.join(', ') || 'none (terminal)'}`);
    }
  }
  // A new stage completes whatever step was open (ADR 0140); a same-stage write leaves it.
  let closed = false;
  if (cur !== value) {
    const at = lines.findIndex((l) => headerRe('Step').test(l));
    if (at >= 0) {
      lines.splice(at, 1);
      closed = true;
      // The trace records the clear as a `step clear` line, so the review-step window reads step lines alone.
      appendTrace(root, { kind: 'ledger', fields: ['step', 'clear'] });
    }
  }
  writeLines(root, setHeader(lines, 'Stage', value));
  return closed;
}

// The chain step a command has started and not yet completed (ADR 0140, run-state `## The ledger`).
// Returns whether the caller traces the call: `set` always (a repeated step is a new start), `clear` only when a step stood.
const STEPS = ['plan', 'implement', 'review', 'document', 'submit', 'ship', 'verify-ship', 'wrap-up'];
function verbStep(root, sub, value) {
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe('Step').test(l));
  if (sub === 'clear') {
    if (at < 0) return false;
    lines.splice(at, 1);
    writeLines(root, lines);
    return true;
  }
  // `block` records a stop with the step standing (ADR 0147): the ledger stays, so a resumed run reads its own step.
  if (sub === 'block') {
    if (value !== undefined) fail('step block takes no argument');
    return at >= 0;
  }
  if (sub !== 'set') fail(`unknown step subcommand "${sub}" — use set|clear|block`);
  if (!STEPS.includes(value)) fail(`unknown step "${value}" (${STEPS.join(', ')})`);
  // Every `set` records a start of its own (ADR 0147), so it returns true even when the ledger line is unchanged.
  if (at >= 0) {
    if (getHeader(lines, 'Step') === value) return true;
    setHeader(lines, 'Step', value);
  } else {
    insertHeader(lines, 'Step', value);
  }
  writeLines(root, lines);
  return true;
}

function verbSlice(root, id, status, range) {
  checkSliceId(id);
  if (!SLICE_STATUSES.includes(status)) fail(`unknown slice status "${status}" (${SLICE_STATUSES.join(', ')})`);
  const lines = readLines(root);
  const rows = tableRowIndexes(lines);
  for (const i of rows) {
    const cells = splitRow(lines[i]);
    if (cells[0] === id) {
      if (cells.length !== 7) fail(`slice row "${id}" does not carry the 7 ledger columns`);
      // Rebuild the row preserving every other cell verbatim — splitRow unescaped them, so
      // re-sanitizing on the way back out keeps the round-trip lossless.
      cells[5] = status;
      if (range !== undefined) cells[6] = range;
      lines[i] = '| ' + cells.map(sanitizeCell).join(' | ') + ' |';
      writeLines(root, lines);
      return;
    }
  }
  fail(`no slice row with id "${id}" in ${ledgerPath(root)}`);
}

module.exports = { verbInit, verbStage, verbStep, verbSlice, validateLabel, STEPS };
