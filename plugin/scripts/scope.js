#!/usr/bin/env node
'use strict';

// scope.js: the run-state CLI (ADR 0022). Owns every ledger.md write and read in the chain.
// Verbs: init, stage, slice, degraded, unresolved, deferred, get, status, base-lock. Exit nonzero with a
// one-line stderr reason on any refusal. hooks/ledger-guard.js makes this the only ledger write path.
// `base-lock` is the one verb that touches no ledger: it guards the base-branch design-docs commit
// (ADR 0058).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
// `adopt`'s marker scan needs the exact fence-masking rule kb-patch.js's own extractSection() uses
// (ADR 0022's second-reader lesson: a masking rule restated by hand drifts from the one it copies),
// so it requires the function rather than growing a second copy. A marker shown inside a fenced
// illustrative example — documentation, an issue comment quoting a snapshot — would otherwise be
// read as the real payload boundary.
const { maskFencedLines } = require('./kb-patch.js');

// references/scope-mode.md `## The change type` — the eleven Conventional Commits types.
const CHANGE_TYPES = ['feat', 'fix', 'refactor', 'docs', 'perf', 'test', 'build', 'ci', 'chore', 'style', 'revert'];
// references/scope-mode.md `## The scope slug`.
const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
// references/plan-contract.md status vocabulary.
const SLICE_STATUSES = ['todo', 'in-progress', 'in-review', 'blocked', 'merged'];
// references/scope-mode.md `## The stage never moves backwards`: a write is allowed exactly when
// it does not lower the stage's rank. `reviewed` and `documented-unreviewed` share a rank — the
// chain can do either doc pass first — so a same-rank move between them needs its own allowlist;
// every other same-rank move (e.g. reviewed → documented-unreviewed) refuses, and `documented`/
// `shipped` are terminal in the way rank already gives them: nothing outranks `shipped`, and
// `documented`'s only higher rank is `shipped` itself.
const STAGE_RANK = {
  implementing: 0,
  merged: 1,
  reviewed: 2,
  'documented-unreviewed': 2,
  documented: 3,
  shipped: 4,
};
const STAGES = Object.keys(STAGE_RANK);
// The sanctioned same-rank move: `/superdev:review` writes `reviewed` over `documented-unreviewed`
// when its fix loop landed commits (scope-mode.md).
const SANCTIONED_SAME_RANK = new Set(['documented-unreviewed>reviewed']);

function stageMoveAllowed(cur, next) {
  if (cur === next) return true;
  const rc = STAGE_RANK[cur];
  const rn = STAGE_RANK[next];
  if (rn > rc) return true;
  if (rn === rc) return SANCTIONED_SAME_RANK.has(cur + '>' + next);
  return false;
}

function fail(msg) {
  const err = new Error(msg);
  err.isRefusal = true;
  throw err;
}

// --- ledger primitives -------------------------------------------------------

function ledgerPath(root) {
  return path.join(root, 'ledger.md');
}

function readLines(root) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath(root), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') fail(`no ledger at ${ledgerPath(root)}`);
    throw e;
  }
  return splitLines(raw);
}

// Split on either ending. A `ledger.md` an editor or `core.autocrlf` wrote is CRLF, and splitting on
// `'\n'` alone leaves a trailing `\r` that `headerRe`'s `(.*)$` cannot span — JavaScript's `.` excludes
// `\r` as a line terminator, so every header would read as absent. Nothing here writes CRLF: `writeLines`
// joins with `'\n'`, so any verb that writes also normalises the file. A lone `\r` (classic Mac) is not
// handled, deliberately: it is extinct, and widening the split for it buys no live case.
function splitLines(raw) {
  return String(raw).split(/\r?\n/);
}

function writeLines(root, lines) {
  // Atomic write: a reader (or a concurrent scope.js invocation) never observes a partially
  // written ledger.md — write to a temp file in the same directory, then rename over it.
  const target = ledgerPath(root);
  const tmpFile = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpFile, lines.join('\n'), 'utf8');
  fs.renameSync(tmpFile, target);
}

function headerRe(name) {
  return new RegExp('^\\*\\*' + name + ':\\*\\*\\s*(.*)$');
}

// Normalisation is per header, because the values differ in kind (ADR 0022).
//
// A TOKEN header is a single word this file also writes: a hand-written or pre-CLI ledger may wrap it
// in markdown emphasis, or leave a sentence's period behind, and every spelling means the same token.
// It takes the first whitespace-delimited token before stripping that markup. Git forbids whitespace in
// a refname, and a stage name is one word, so first-token can never truncate a legal value. It does
// widen what is accepted: `**Stage:** shipped (rolled back)` reads as `shipped` and satisfies the prune
// gate. That matches the reader this replaced, so it costs nothing here — but the cut is a capture rule,
// not validation, and nothing downstream treats it as one. It only
// ever drops a trailing parenthetical or comment a hand-written ledger tacks on after the real token
// (e.g. `fix/demo (PR #99 open)`). Once cut to that token, stripping is safe: no legal value carries
// these markup characters — a stage name is from a fixed set, and git forbids `*` and `:` in a branch
// name and forbids a component ending in `.`.
//
// Every other header is PROSE. `Anchor` carries an issue title that reaches a pull request through
// `/superdev:review`, and a title may legitimately end in `.` or `:` or contain one, or carry internal
// whitespace. It is trimmed and otherwise taken as written.
const TOKEN_HEADERS = new Set(['Stage', 'Branch', 'Docs']);

function normalizeHeaderValue(name, raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null; // a header line present but empty is absent, not an empty value
  if (!TOKEN_HEADERS.has(name)) return trimmed;
  const token = trimmed.split(/\s+/)[0];
  // Two sequential strips rather than one alternation: one pass cannot remove a marker another marker
  // hides. In `` `shipped`. `` the trailing backtick sits behind the period, so an alternation anchored
  // at the end of the string never reaches it.
  const stripped = token.replace(/^[`*]+/, '').replace(/[`*.,;:]+$/, '');
  return stripped || null;
}

// A pre-CLI ledger may miss any header line; absence is the missing-optional-field
// case (scope-mode `## The ledger`), never a parse error.
function getHeader(lines, name) {
  const re = headerRe(name);
  for (const line of lines) {
    const m = line.match(re);
    if (m) return normalizeHeaderValue(name, m[1]);
  }
  return null;
}

// The reader `hooks/scope-prune.js` requires, so one implementation serves both (ADR 0022). Takes the
// ledger's content rather than a path, which keeps `fs` out of the contract — the hook reads the file
// itself, and a text-in reader needs no temp directory to test. Matching is line-anchored, so a
// value-less header can never capture the next line's token.
function readLedgerHeader(content, name) {
  return getHeader(splitLines(content), name);
}

// The bullet list under a header line, if any: `**Degraded:**` (scope-mode `## Degraded passes`) and
// `**Unresolved:**` (`## Unresolved defects`) carry one each, in the same shape. Read by both status
// branches below — an in-flight scope prints them inline with its tally, a shipped one prints them
// alone — and by `get degraded`/`get unresolved`/`get deferred`, and by `get denials`, which counts the
// `**Degraded:**` bullets carrying the denial prefix that follow the last reset marker.
function readBullets(lines, name) {
  const at = lines.findIndex((l) => headerRe(name).test(l));
  const bullets = [];
  if (at >= 0) {
    for (let i = at + 1; i < lines.length && lines[i].startsWith('- '); i++) {
      bullets.push(lines[i].slice(2));
    }
  }
  return bullets;
}

function setHeader(lines, name, value) {
  const re = headerRe(name);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      lines[i] = `**${name}:** ${value}`;
      return lines;
    }
  }
  // Absent line (pre-CLI ledger): insert after the title heading, or at the top.
  const at = lines.findIndex((l) => l.startsWith('# '));
  lines.splice(at >= 0 ? at + 1 : 0, 0, '', `**${name}:** ${value}`);
  return lines;
}

// Table rows are `| … |` lines minus the header row and its `|---|` separator.
function tableRowIndexes(lines) {
  const idx = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith('|') && !/^\|[\s:-]*(\|[\s:-]*)+\|?$/.test(l) && !/^\|\s*id\s*\|/i.test(l)) {
      idx.push(i);
    }
  }
  return idx;
}

// A `|` inside a cell value corrupts the row unless escaped, and a newline breaks the one
// line = one row assumption entirely. sanitizeCell makes a value safe to store as a cell;
// splitRow's unescape is its exact inverse, so a row-rebuild (verbSlice) that re-sanitizes
// the cells it read back is lossless.
function sanitizeCell(v) {
  return String(v).replace(/(\r\n|\r|\n)+/g, ' ').replace(/\|/g, '\\|');
}

function splitRow(line) {
  // '| a | b |' -> ['a', 'b']; a `\|` inside a cell doesn't split it, and comes back unescaped.
  const parts = line.split(/(?<!\\)\|/);
  return parts.slice(1, parts.length - 1).map((c) => c.trim().replace(/\\\|/g, '|'));
}

// --- verbs -------------------------------------------------------------------

// Appended, never read-concat-written: `base-lock acquire` calls this from two sessions that may be
// racing each other, and an append at worst leaves a duplicate line where a rewrite could truncate the
// file.
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

function verbInit(cwd, label, stdinJson) {
  const { slug } = validateLabel(label);
  const root = path.join(cwd, '.superdev', 'scopes', slug);
  // The real double-init signal is an existing ledger.md, not the run-root directory: run init
  // writes dod.md into the run root before calling init, so the directory legitimately exists
  // on every fresh run.
  if (fs.existsSync(ledgerPath(root))) fail(`ledger already exists: ${ledgerPath(root)}`);

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

  // Ensure .superdev/ is git-ignored before creating anything under it — but after every
  // refusal above, so a refused init leaves the repo untouched.
  ensureSuperdevIgnored(cwd);

  const doc = [
    `# Ledger — ${slug}`,
    '',
    '**Stage:** implementing',
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
  fs.mkdirSync(root, { recursive: true });
  writeLines(root, doc);
  console.log(root);
}

// Set-only: the read path is `get stage`.
function verbStage(root, sub, value) {
  const lines = readLines(root);
  if (sub !== 'set') fail(`unknown stage subcommand "${sub}" — use set`);
  if (!STAGES.includes(value)) fail(`unknown stage "${value}" (${STAGES.join(', ')})`);
  const cur = getHeader(lines, 'Stage');
  if (cur !== null && cur !== value) {
    if (!STAGES.includes(cur)) fail(`ledger carries unknown stage "${cur}" — fix the ledger by hand first`);
    if (!stageMoveAllowed(cur, value)) {
      const allowed = STAGES.filter((s) => s !== cur && stageMoveAllowed(cur, s));
      fail(`stage "${cur}" does not move to "${value}" — allowed: ${allowed.join(', ') || 'none (terminal)'}`);
    }
  }
  writeLines(root, setHeader(lines, 'Stage', value));
}

function verbSlice(root, id, status, range) {
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

// The write half of `readBullets`: append one bullet under `**<name>:**`, creating that line beside
// `**Stage:**` when the ledger has none yet (scope-mode `## Degraded passes`, `## Unresolved defects`).
// A newline in the text would break the one bullet = one line assumption the reader depends on. `verb`
// names the invoked subcommand verbatim (`degraded add`, `degraded reset-denials`, …), so a refusal
// names what the caller actually typed rather than a sibling subcommand's shape; `noun` names what the
// missing text is called there — `reset-denials` takes a reason, everything else a bullet.
function addBullet(root, name, verb, text, noun = 'bullet text') {
  if (!text) fail(`${verb} needs the ${noun}`);
  if (text.includes('\n')) fail(`${verb} text must not contain a newline`);
  const lines = readLines(root);
  let at = lines.findIndex((l) => headerRe(name).test(l));
  if (at < 0) {
    const stageAt = lines.findIndex((l) => headerRe('Stage').test(l));
    at = stageAt >= 0 ? stageAt + 1 : 0;
    lines.splice(at, 0, `**${name}:**`);
  }
  // Append after the last existing bullet under the line.
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith('- ')) end++;
  lines.splice(end, 0, `- ${text}`);
  writeLines(root, lines);
}

// A denied verification dispatch and a pass that could not reach what it needed share the `**Degraded:**`
// line and answer different questions, so the denial carries a prefix (scope-mode `## Degraded passes`,
// ADR 0041). `get denials` counts by that prefix, which is why it is structural rather than a convention
// each of the three recording callers would have to word identically. A reset marker carries a prefix of
// its own: the count runs from the last one, which returns the budget while every recorded denial stays
// on the line (ADR 0044).
const DENIAL_PREFIX = 'denied: ';
const RESET_PREFIX = 'denials reset: ';

function verbDegraded(root, sub, text) {
  if (sub === 'add-denial') {
    // The refusals are `addBullet`'s, named as `add-denial`'s: one bullet record, one set of rules.
    addBullet(root, 'Degraded', 'degraded add-denial', text && `${DENIAL_PREFIX}${text}`);
    return;
  }
  if (sub === 'reset-denials') {
    addBullet(root, 'Degraded', 'degraded reset-denials', text && `${RESET_PREFIX}${text}`, 'reason');
    return;
  }
  if (sub !== 'add') fail(`unknown degraded subcommand "${sub}" — use add|add-denial|reset-denials`);
  // `get denials` reads meaning from both prefixes, so a plain bullet able to carry one is a bullet able
  // to move the count. `add-denial` is only for the denied *verification* dispatches the cap counts
  // (scope-mode `## Degraded passes`); a denied Bash command or a denied *authoring* dispatch still
  // takes plain `add` (`skills/implement/SKILL.md`, `references/implement-full.md`) — so a text that quotes
  // such a denial verbatim, rather than getting routed to `add-denial`, reworks its wording instead.
  if (text.startsWith(DENIAL_PREFIX)) {
    fail(
      `degraded add text must not begin "${DENIAL_PREFIX}" — add-denial is for a denied verification ` +
        `dispatch; any other denial (a denied Bash command, a denied authoring dispatch) reworks its ` +
        `text instead of quoting "${DENIAL_PREFIX}" verbatim`
    );
  }
  if (text.startsWith(RESET_PREFIX)) fail(`degraded add text must not begin "${RESET_PREFIX}" — use degraded reset-denials`);
  addBullet(root, 'Degraded', 'degraded add', text);
}

function verbUnresolved(root, sub, text) {
  if (sub === 'clear') {
    const lines = readLines(root);
    const at = lines.findIndex((l) => headerRe('Unresolved').test(l));
    if (at < 0) return; // no such line — succeeds, changes nothing
    let end = at + 1;
    while (end < lines.length && lines[end].startsWith('- ')) end++;
    lines.splice(at, end - at);
    writeLines(root, lines);
    return;
  }
  if (sub !== 'add') fail(`unknown unresolved subcommand "${sub}" — use add|clear`);
  addBullet(root, 'Unresolved', 'unresolved add', text);
}

// `**Deferred:**` carries a finding `/superdev:review` handed to `/superdev:plan` rather than fixed: its
// remedy would add a capability the Definition of Done never named (ADR 0035). It has no `clear`, unlike
// the unresolved record it otherwise mirrors — a defect stops being true once a run re-verifies clean,
// while unplanned work stays unplanned until somebody plans it, so there is nothing for a later step to
// discover and undo.
function verbDeferred(root, sub, text) {
  if (sub !== 'add') fail(`unknown deferred subcommand "${sub}" — use add`);
  addBullet(root, 'Deferred', 'deferred add', text);
}

// `**Docs:**` records that a run performed its documentation pass in the controller's own context
// rather than through a dispatched doc-writer (ADR 0031). `/superdev:document` reads it to skip that
// dispatch; `/superdev:review` clears it when its fix loop lands commits, because those commits made the
// pass stale. The value names the pass rather than merely marking presence, so another arrangement can
// record its own kind without a second header.
function verbDocs(root, sub, value) {
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe('Docs').test(l));
  if (sub === 'clear') {
    if (at < 0) return; // no such line — succeeds, changes nothing
    lines.splice(at, 1);
    writeLines(root, lines);
    return;
  }
  if (sub !== 'set') fail(`unknown docs subcommand "${sub}" — use set|clear`);
  if (!value) fail('docs set needs a value');
  // `Docs` is a TOKEN_HEADERS entry: `get docs` reads back only the first whitespace-delimited
  // token, so a value with internal whitespace would write something `get docs` can never round-trip.
  if (/\s/.test(value)) fail('docs set value must not contain whitespace — "get docs" only reads back the first token');
  if (at >= 0) {
    lines[at] = `**Docs:** ${value}`;
    writeLines(root, lines);
    return;
  }
  // Absent: sit with the other header lines rather than above them, which is where `setHeader`'s
  // title-anchored fallback would put it.
  const last = Math.max(...['Stage', 'Branch', 'Anchor'].map((n) => lines.findIndex((l) => headerRe(n).test(l))));
  if (last < 0) {
    writeLines(root, setHeader(lines, 'Docs', value));
    return;
  }
  lines.splice(last + 1, 0, `**Docs:** ${value}`);
  writeLines(root, lines);
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
  const bulletFields = { unresolved: 'Unresolved', degraded: 'Degraded', deferred: 'Deferred' };
  if (bulletFields[field]) {
    // The read half of `unresolved add`/`degraded add`/`deferred add`: every bullet, one per line, so a
    // caller (`/superdev:ship`'s gate and its pull-request body step) never has to split a joined string
    // back apart — a bullet containing a comma stays intact this way, unlike `status`'s `, `-joined line.
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
  const names = { stage: 'Stage', branch: 'Branch', anchor: 'Anchor', docs: 'Docs' };
  const name = names[field];
  if (!name) fail(`unknown field "${field}" — use stage|branch|anchor|docs|slices|unresolved|degraded|deferred|denials`);
  const v = getHeader(readLines(root), name);
  console.log(v === null ? 'absent' : v);
}

// --- publish / adopt: the anchor's published snapshot (ADR 0042) -----------------------------
//
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
// writeLines leaves — wrapped unchanged between the two markers. Pure, so tests/scope.test.js's round
// trip can feed this straight into adoptLines below with no filesystem or process I/O in between.
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
// lines. Pure — no filesystem access — so tests/scope.test.js exercises every refusal without a
// ledger on disk. `**Branch:**` is what the ledger heading is reconstructed from, so its absence is
// the one schema failure that matters (ADR 0042); `Stage` and the slice table get the same checks
// `stage set` and `slice` already apply.
function adoptLines(root, body) {
  const payload = extractRunState(body);
  const branch = getHeader(payload, 'Branch');
  if (!branch) fail('the run-state payload carries no **Branch:** line — cannot reconstruct the ledger heading');
  const { slug } = validateLabel(branch);
  const rootSlug = path.basename(root);
  if (rootSlug !== slug) fail(`run root "${rootSlug}" does not match the branch slug "${slug}" — refusing to adopt`);
  const stage = getHeader(payload, 'Stage');
  if (stage !== null && !STAGES.includes(stage)) fail(`run-state payload carries unknown stage "${stage}"`);
  // `shipped` is terminal (`## The stage never moves backwards`): run-init.md's own decision tree
  // already treats a `shipped` snapshot as not adopted, but `adopt` refuses it too, the same posture
  // every other schema invariant here takes, rather than trust that its one caller always checks first.
  if (stage === 'shipped') fail('run-state payload carries stage "shipped" — a finished run has nothing to adopt');
  for (const i of tableRowIndexes(payload)) {
    if (splitRow(payload[i]).length !== 7) fail('run-state payload carries a slice row without the 7 ledger columns');
  }
  return [`# Ledger — ${slug}`, ...payload];
}

function verbAdopt(root, body) {
  if (fs.existsSync(ledgerPath(root))) fail(`ledger already exists: ${ledgerPath(root)}`);
  const lines = adoptLines(root, body);
  fs.mkdirSync(root, { recursive: true });
  writeLines(root, lines);
}

// Staged knowledge-base pages wait under .superdev/kb-pending/<scope>/ until /superdev:publish-kb sends
// them (ADR 0023). Nothing else in the chain reports them, and the safe failure this design chose — a
// missing page rather than a wrong one — is only safe while it stays visible. Keyed on scope, the same
// slug a run root uses. A scope with an empty directory is not pending: nothing waits there.
// A non-`.md` file under a scope's staging directory (a page written as `overview` or
// `overview.markdown` instead of `overview.md`) is invisible to `/superdev:publish-kb`'s file glob, so
// counting it as staged would be wrong and dropping it silently would be the exact loss this contract
// exists to prevent. `strays` carries it instead, so `verbStatus` can surface it.
function stagedPageCounts(cwd) {
  const dir = path.join(cwd, '.superdev', 'kb-pending');
  const counts = new Map();
  const strays = new Map();
  const loose = [];
  let dirents;
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return { counts, strays, loose };
  }
  // A file written straight into the staging root, not under a <scope>/ subdirectory, matches no
  // scope's page count and no publish-kb glob — the same silent loss `strays` closes one level down.
  for (const d of dirents) if (!d.isDirectory()) loose.push(d.name);
  const names = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  for (const scope of names.sort()) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(dir, scope));
    } catch {
      continue; // unreadable → report nothing rather than guess
    }
    const pages = entries.filter((f) => f.endsWith('.md')).length;
    const other = entries.filter((f) => !f.endsWith('.md'));
    if (pages > 0) counts.set(scope, pages);
    if (other.length > 0) strays.set(scope, other);
  }
  return { counts, strays, loose };
}

function pendingLine(scope, pages) {
  return `pending publish: ${pages} staged page${pages === 1 ? '' : 's'} — /superdev:publish-kb ${scope}`;
}

function strayLine(files) {
  return `${files.length} non-.md file${files.length === 1 ? '' : 's'} staged, ignored: ${files.join(', ')} — rename to .md so /superdev:publish-kb finds it`;
}

function looseLine(files) {
  return `${files.length} file${files.length === 1 ? '' : 's'} staged directly under .superdev/kb-pending, not in a scope directory: ${files.join(', ')} — move each under a <scope>/ subdirectory, named <title-slug>.md (or <title-slug>--<section-slug>.md for a patch), so /superdev:publish-kb finds it`;
}

function verbStatus(cwd) {
  const { counts: pending, strays, loose } = stagedPageCounts(cwd);
  const pendingShown = new Set();
  const straysShown = new Set();
  const scopesDir = path.join(cwd, '.superdev', 'scopes');
  let entries = [];
  try {
    entries = fs
      .readdirSync(scopesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => fs.existsSync(path.join(scopesDir, n, 'ledger.md')));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (entries.length === 0 && pending.size === 0 && strays.size === 0 && loose.length === 0) {
    console.log('No superdev runs found in this repo.');
    return;
  }
  // Oldest run root first.
  entries.sort((a, b) => {
    const sa = fs.statSync(path.join(scopesDir, a));
    const sb = fs.statSync(path.join(scopesDir, b));
    return (sa.birthtimeMs || sa.mtimeMs) - (sb.birthtimeMs || sb.mtimeMs);
  });

  // A scope's ledger and its staged pages are independent: a malformed or unreadable ledger still leaves
  // any staged pages waiting. Shared by every `ledger unreadable` exit below, so that scope is marked
  // shown and the fallback loop past this one never reports it a second time under `(no ledger)` — which
  // would be wrong anyway, since the ledger file exists; only its contents are unreadable.
  const out = [];
  function pushPendingAndStrays(scope) {
    const pages = pending.get(scope);
    if (pages) {
      out.push(`  ${pendingLine(scope, pages)}`);
      pendingShown.add(scope);
    }
    const strayFiles = strays.get(scope);
    if (strayFiles) {
      out.push(`  ${strayLine(strayFiles)}`);
      straysShown.add(scope);
    }
  }
  for (const scope of entries) {
    let lines;
    try {
      lines = readLines(path.join(scopesDir, scope));
    } catch {
      out.push(`${scope}: ledger unreadable`);
      pushPendingAndStrays(scope);
      continue;
    }
    try {
      const stage = getHeader(lines, 'Stage');
      const rows = tableRowIndexes(lines).map((i) => splitRow(lines[i]));
      if (rows.some((c) => c.length !== 7)) {
        out.push(`${scope}: ledger unreadable`);
        pushPendingAndStrays(scope);
        continue;
      }
      // A shipped scope is finished with, and `hooks/scope-prune.js` reaps its run root once the TTL
      // elapses (ADR 0007). It is not work in flight, so it collapses to one line here rather than
      // carrying a tally through a report that exists to show what is still moving. Its degrade record,
      // unresolved-defect record, deferred-finding record, and staged-page lines are the deliberate
      // exceptions below: a degraded pass is otherwise recorded only in the pull-request body, which the
      // same prune outlives it by (scope-mode `## Degraded passes`); an unresolved defect the same way
      // (`## Unresolved defects`); a deferred finding likewise, and it is the one record naming work
      // nobody has planned yet (ADR 0035); and a page nobody publishes is invisible everywhere else
      // (ADR 0023) — a shipped scope is exactly where any of them waits.
      if (stage === 'shipped') {
        out.push(`${scope}  (shipped)`);
        const shippedDegraded = readBullets(lines, 'Degraded');
        if (shippedDegraded.length) out.push(`  degraded: ${shippedDegraded.join(', ')}`);
        const shippedUnresolved = readBullets(lines, 'Unresolved');
        if (shippedUnresolved.length) out.push(`  unresolved: ${shippedUnresolved.join(', ')}`);
        const shippedDeferred = readBullets(lines, 'Deferred');
        if (shippedDeferred.length) out.push(`  deferred: ${shippedDeferred.join(', ')}`);
        pushPendingAndStrays(scope);
        continue;
      }
      const counts = { todo: 0, 'in-progress': 0, 'in-review': 0, blocked: 0, merged: 0 };
      const blocked = [];
      for (const c of rows) {
        if (counts[c[5]] !== undefined) counts[c[5]]++;
        if (c[5] === 'blocked') blocked.push(`${c[0]} ${c[2]}`);
      }
      const degraded = readBullets(lines, 'Degraded');
      const unresolved = readBullets(lines, 'Unresolved');
      out.push(`${scope}  (${rows.length} slices${stage ? `, stage: ${stage}` : ''})`);
      out.push(`  todo: ${counts.todo}  in-progress: ${counts['in-progress']}  in-review: ${counts['in-review']}  blocked: ${counts.blocked}  merged: ${counts.merged}`);
      if (blocked.length) out.push(`  blocked: ${blocked.join(', ')}`);
      if (degraded.length) out.push(`  degraded: ${degraded.join(', ')}`);
      if (unresolved.length) out.push(`  unresolved: ${unresolved.join(', ')}`);
      pushPendingAndStrays(scope);
    } catch {
      out.push(`${scope}: ledger unreadable`);
      pushPendingAndStrays(scope);
    }
  }
  // A pending scope with no readable ledger still has pages (or stray files) waiting: `_adhoc` never has
  // a run root, and a pruned or unreadable run leaves one behind too. Reporting only the scopes above
  // would hide exactly the pages, and the stray files, least likely to be remembered.
  const unreported = new Set([...pending.keys(), ...strays.keys()].filter((s) => !pendingShown.has(s) && !straysShown.has(s)));
  for (const scope of [...unreported].sort()) {
    out.push(`${scope}  (no ledger)`);
    const pages = pending.get(scope);
    if (pages) out.push(`  ${pendingLine(scope, pages)}`);
    const strayFiles = strays.get(scope);
    if (strayFiles) out.push(`  ${strayLine(strayFiles)}`);
  }
  if (loose.length > 0) out.push(looseLine(loose));
  console.log(out.join('\n'));
}

// --- containment test (ADR 0053, ADR 0065) ------------------------------------
//
// Whether `<base>` already holds `<branch>`'s work, on content rather than ancestry
// (`references/scope-mode.md` `## Containment`). Exported for a sibling script to `require` — the same
// shape `readLedgerHeader` already gives `hooks/scope-prune.js` and `hooks/worktree-sweep.js` — and no
// CLI verb, because this touches no ledger.
//
// A Containment verdict is one of three strings:
//   'contained'         — base already holds every byte of branch's work
//   'not-contained'     — branch carries content base does not hold, checked only after the refetch
//                          below has had its say
//   'could-not-resolve' — branch names no ref this repository can find at all: a different situation
//                          from "not contained" a consumer must warn about differently
//
// `hooks/scope-prune.js` mirrors the same git plumbing (`containedInBase`, `supportsWriteTree`,
// `qualifyBranchRefs`) without ADR 0065's refetch — it is a `Stop` hook firing on every finished turn,
// and a stale local base only defers a reap the TTL has already delayed. This export is not that hook:
// a not-contained verdict against the local base refetches `<base>` from `<remote>` and retests against
// `FETCH_HEAD` before it answers, because a code host squash-merges the pull request and the operator's
// clone learns nothing until somebody pulls.
//
// spawnSync throughout, never the throwing `git()`-style helper above: every git call here is a real
// answer to read off its exit status (a conflict, an unresolved ref, a git without `--write-tree`), not
// an error to propagate. A git call that cannot even start (no git on PATH) reads as `status !== 0` here
// exactly like a real nonzero exit, which keeps the fail-closed direction: this function never throws,
// and every path that cannot answer falls toward 'not-contained' or 'could-not-resolve', never toward
// 'contained'. The refetch alone also carries a `timeout` (below): a dropped VPN or a firewalled host
// leaves `git fetch` itself blocked on the network with nothing to read off, so the fail-closed exit
// status this comment describes never arrives on its own there.
//
// `--end-of-options` opens every args array below, ahead of `base`/`ref`/`branch` — every one of them a
// revision-shaped string, and nothing here requires it came from trusted config. Git's own option parser
// cannot otherwise tell `base = '--upload-pack=/some/script'` from a real option, and `git fetch` really
// does run whatever `--upload-pack` names.
function gitSpawn(args, cwd, opts) {
  return spawnSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', ...opts });
}

// Short enough to be tolerable inside an interactive command, and an order of magnitude past a healthy
// LAN or VPN round trip to the code host: a black-holed remote degrades to the local verdict in seconds,
// never in the minutes a kernel TCP timeout would otherwise take.
const FETCH_TIMEOUT_MS = 5000;

function refResolves(ref, cwd) {
  return gitSpawn(['rev-parse', '--verify', '--quiet', '--end-of-options', ref + '^{commit}'], cwd).status === 0;
}

// Bare name -> the ref `merge-tree`/`merge-base` can actually resolve: the bare name itself when a
// local `refs/heads/<name>` exists (gitrevisions(7) already walks to it), and `<remote>/<name>` for a
// name that survives only as a remote-tracking ref — mirroring `hooks/scope-prune.js`'s
// `qualifyBranchRefs`, because a bare name only ever resolves the unqualified `refs/remotes/<name>`
// shape on its own, never `refs/remotes/<remote>/<name>` (ADR 0053).
function qualifyBranch(branch, cwd) {
  if (refResolves(branch, cwd)) return branch;
  const refs = gitSpawn(['for-each-ref', '--format=%(refname)', 'refs/remotes'], cwd);
  if (refs.status !== 0) return branch;
  for (const raw of refs.stdout.split('\n')) {
    const ref = raw.trim();
    if (!ref.startsWith('refs/remotes/')) continue;
    const rest = ref.slice('refs/remotes/'.length);
    const cut = rest.indexOf('/');
    if (cut < 1) continue;
    if (rest.slice(cut + 1) === branch) return rest; // '<remote>/<branch>'
  }
  return branch;
}

// `--write-tree` needs git 2.38 (2022-10-02). Probing costs one `merge-tree` of `HEAD` with itself,
// whose result tree already exists, so the probe writes no object of its own.
function supportsWriteTree(cwd) {
  return gitSpawn(['merge-tree', '--write-tree', '--end-of-options', 'HEAD', 'HEAD'], cwd).status === 0;
}

// One local test against whatever `base` the caller hands (a branch name on the first pass,
// `FETCH_HEAD` on the second) — the tree comparison ADR 0053 states, or the ancestry fallback for a
// git without `--write-tree`.
function containedAgainst(ref, base, cwd, writeTreeSupported) {
  if (writeTreeSupported) {
    const merged = gitSpawn(['merge-tree', '--write-tree', '--end-of-options', base, ref], cwd);
    if (merged.status !== 0) return false;
    // `--verify` ahead of `--end-of-options`: bare `rev-parse` echoes an unrecognized flag back on
    // stdout instead of treating it as the end-of-options marker, which would corrupt the tree-hash
    // comparison below for every caller, not only an option-shaped `base`.
    const baseTree = gitSpawn(['rev-parse', '--verify', '--quiet', '--end-of-options', base + '^{tree}'], cwd);
    if (baseTree.status !== 0) return false;
    return merged.stdout.trim() === baseTree.stdout.trim();
  }
  return gitSpawn(['merge-base', '--is-ancestor', '--end-of-options', ref, base], cwd).status === 0;
}

// The exported test. `remote` is the name `docs/agents/code-management.md` config names; a caller with
// no such config passes its own default. Never throws, and safe on any `base`/`branch` string, not only
// one sourced from trusted config: an option-shaped value (`--upload-pack=...`, `-C<path>`) never runs
// as an argument to any git subcommand this function calls, and a genuinely unreachable `remote` degrades
// to the local verdict within `FETCH_TIMEOUT_MS` rather than blocking on the network indefinitely.
function testContainment(cwd, base, branch, remote = 'origin') {
  const ref = qualifyBranch(branch, cwd);
  if (!refResolves(ref, cwd)) return 'could-not-resolve';

  const writeTreeSupported = supportsWriteTree(cwd);
  if (containedAgainst(ref, base, cwd, writeTreeSupported)) return 'contained';

  // Not contained against the local base — refetch before answering (ADR 0065). A fetch that fails
  // (no remote configured, an unreachable host, a rejected credential) leaves the local verdict
  // standing rather than erroring. `timeout`/`killSignal` bound a black-holed host to the same short
  // wait: `spawnSync` otherwise blocks on the connect for as long as the kernel's own TCP timeout runs,
  // which is minutes, not the "leaves the first verdict standing" scope-mode.md already promises.
  const fetched = gitSpawn(['fetch', '--end-of-options', remote, base], cwd, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: FETCH_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (fetched.status !== 0) return 'not-contained';
  return containedAgainst(ref, 'FETCH_HEAD', cwd, writeTreeSupported) ? 'contained' : 'not-contained';
}

// --- base lock ---------------------------------------------------------------
//
// ADR 0058: `/superdev:plan` §6 and `/superdev:implement`'s run init both commit CONTEXT.md, the
// ADRs, and .claude/rules/ straight to the base branch from the invoking checkout. Two sessions can
// pass the `git rev-parse --abbrev-ref HEAD` check at the same moment and race on those files, so
// both acquire this lock first. It is repo-level, a sibling of .superdev/scopes/ rather than a run
// root's own artifact, because the files it guards belong to no scope.
//
// No hook backs it. The exclusive create below is atomic across processes by construction, which is
// the same backstop `hooks/run-lock.js` really rests on (`git worktree add -b`'s own refusal).
const BASE_LOCK_STALE_MS = 5 * 60 * 1000;

function baseLockPath(cwd) {
  return path.join(cwd, '.superdev', 'base.lock');
}

function writeBaseLock(file) {
  // 'wx' fails rather than truncating when the file is already there, which is the whole guarantee.
  fs.writeFileSync(file, `pid ${process.pid}\nacquired ${new Date().toISOString()}\n`, { encoding: 'utf8', flag: 'wx' });
}

function readBaseLockHolder(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n')[0] || null;
  } catch {
    return null;
  }
}

function verbBaseLock(cwd, sub) {
  const file = baseLockPath(cwd);
  if (sub === 'acquire') {
    // `.superdev/` has to exist before the exclusive create, but ignoring it is a side effect of a
    // *successful* create only — a refused acquire (below) must touch nothing else (dod.md's own
    // criterion), so the ignore write happens after each `writeBaseLock` that actually lands.
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      writeBaseLock(file);
      ensureSuperdevIgnored(cwd);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const ageMs = Date.now() - fs.statSync(file).mtimeMs;
      if (ageMs < BASE_LOCK_STALE_MS) {
        const holder = readBaseLockHolder(file);
        fail(
          `base lock held by another live session (${file}, ${Math.round(ageMs / 1000)}s old` +
            (holder ? `, ${holder}` : '') +
            ') — another /superdev:plan or /superdev:implement is committing design docs to the base branch. ' +
            'Retry once it finishes; a crashed session\'s lock is reclaimed after 5 minutes.'
        );
      }
      // Stale: unlink then re-create exclusively, so a second session reclaiming the same stale lock
      // at the same moment still loses the create rather than sharing it.
      try {
        fs.unlinkSync(file);
      } catch (e2) {
        if (e2.code !== 'ENOENT') throw e2;
      }
      try {
        writeBaseLock(file);
        ensureSuperdevIgnored(cwd);
      } catch (e2) {
        if (e2.code !== 'EEXIST') throw e2;
        fail(`base lock reclaimed by another live session while this one was clearing it (${file}) — retry.`);
      }
    }
    return;
  }
  if (sub === 'release') {
    try {
      fs.unlinkSync(file);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e; // absent is the released state, not an error
    }
    return;
  }
  fail(`unknown base-lock subcommand "${sub || ''}" — use acquire or release`);
}

// --- CLI ---------------------------------------------------------------------

function usage() {
  return [
    'usage: node scope.js <verb> …   (ledger CLI — the only ledger.md write path)',
    '  init <type>/<slug>                 stdin: {"anchor":"…","slices":[{id,issue,title,type,…}]}',
    '  stage set <value> --root <run-root>',
    '  slice <id> <status> [--range <r>]   --root <run-root>',
    '  degraded add|add-denial|reset-denials <text>   --root <run-root>',
    '  unresolved add <text>|clear   --root <run-root>',
    '  deferred add <text>   --root <run-root>',
    '  docs set <value>|clear   --root <run-root>',
    '  get stage|branch|anchor|docs|slices|unresolved|degraded|deferred|denials --root <run-root>',
    '  status                             scans <cwd>/.superdev/scopes/*/',
    '  publish --root <run-root>          prints the ledger as one "## Run state" section on stdout',
    '  adopt --root <run-root>            stdin: a whole anchor body; extracts and writes the section',
    '  base-lock acquire|release          guards <cwd>/.superdev/base.lock, the base-branch design-docs commit',
  ].join('\n');
}

function takeRoot(args) {
  const i = args.indexOf('--root');
  if (i < 0) fail('missing --root <run-root> (the absolute run-root path)');
  const root = args[i + 1];
  if (!root) fail('--root needs a path');
  args.splice(i, 2);
  return root;
}

function run(argv, cwd, stdinJson) {
  const args = argv.slice();
  const verb = args.shift();
  switch (verb) {
    case 'init':
      if (!args[0]) fail('init needs a <type>/<slug> label');
      verbInit(cwd, args[0], stdinJson);
      break;
    case 'stage': {
      const root = takeRoot(args);
      verbStage(root, args[0], args[1]);
      break;
    }
    case 'slice': {
      const root = takeRoot(args);
      let range;
      const ri = args.indexOf('--range');
      if (ri >= 0) {
        range = args[ri + 1];
        if (!range) fail('--range needs a value');
        args.splice(ri, 2);
      }
      if (!args[0] || !args[1]) fail('slice needs <id> <status>');
      verbSlice(root, args[0], args[1], range);
      break;
    }
    case 'degraded': {
      const root = takeRoot(args);
      verbDegraded(root, args[0], args.slice(1).join(' '));
      break;
    }
    case 'unresolved': {
      const root = takeRoot(args);
      verbUnresolved(root, args[0], args.slice(1).join(' '));
      break;
    }
    case 'deferred': {
      const root = takeRoot(args);
      verbDeferred(root, args[0], args.slice(1).join(' '));
      break;
    }
    case 'docs': {
      const root = takeRoot(args);
      verbDocs(root, args[0], args[1]);
      break;
    }
    case 'get': {
      const root = takeRoot(args);
      verbGet(root, args[0]);
      break;
    }
    case 'status':
      verbStatus(cwd);
      break;
    case 'publish': {
      const root = takeRoot(args);
      verbPublish(root);
      break;
    }
    case 'adopt': {
      const root = takeRoot(args);
      verbAdopt(root, stdinJson);
      break;
    }
    // No --root: the base lock is repo-level, resolved from cwd (the invoking checkout).
    case 'base-lock':
      verbBaseLock(cwd, args[0]);
      break;
    default:
      fail('unknown verb "' + (verb || '') + '"\n' + usage());
  }
}

function main() {
  const argv = process.argv.slice(2);
  const needsStdin = argv[0] === 'init' || argv[0] === 'adopt';
  const go = (stdinJson) => {
    try {
      run(argv, process.cwd(), stdinJson);
      // Let the process exit naturally on success, so stdout is guaranteed to flush first;
      // a refusal still exits nonzero below.
    } catch (e) {
      if (e.isRefusal) {
        process.stderr.write(e.message + '\n');
        process.exit(1);
      }
      throw e;
    }
  };
  if (needsStdin) {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => go(raw));
  } else {
    go('');
  }
}

// The CLI runs only when this file is executed directly. `hooks/scope-prune.js` requires it for
// `readLedgerHeader` (ADR 0022), a sibling script requires it for `testContainment` (ADR 0053, ADR
// 0065), and `tests/scope.test.js` requires it for `run`, `publishText`, and `SLUG_RE` besides (ADR
// 0059). An unguarded `main()` parses the *caller's* argv: measured, a requiring process dies with
// `unknown verb ""` and exit 1 before its own first statement, because a refusal calls process.exit.
// Had the caller's argv happened to start with `init`, the same path waits on stdin instead and hangs.
// Either way the require, not the CLI, is what fails.
if (require.main === module) main();

module.exports = { readLedgerHeader, run, publishText, SLUG_RE, testContainment };
