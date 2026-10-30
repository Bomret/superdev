'use strict';

// ledger.js: the ledger's vocabulary and line primitives (ADR 0022): the constants, the stage rank, and the readers and writers of `ledger.md`'s header lines, bullets, and table rows.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');

// references/scope-mode.md `## The change type` — the eleven Conventional Commits types.
const CHANGE_TYPES = ['feat', 'fix', 'refactor', 'docs', 'perf', 'test', 'build', 'ci', 'chore', 'style', 'revert'];
// references/scope-mode.md `## The scope slug`.
const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
// references/plan-contract.md status vocabulary.
const SLICE_STATUSES = ['todo', 'in-progress', 'in-review', 'blocked', 'merged'];
// references/run-state.md `## The ledger` — the suite record's result vocabulary (INV-0017). `none`
// records a repository with no test command configured; `denied` a run the permission classifier
// denied a verification dispatch for.
const SUITE_RESULTS = ['green', 'red', 'denied', 'none'];
// references/scope-mode.md `## The stage never moves backwards`: a write is allowed exactly when
// it does not lower the stage's rank. `reviewed` and `documented-unreviewed` share a rank — the
// chain can do either doc pass first — so a same-rank move between them needs its own allowlist;
// every other same-rank move (e.g. reviewed → documented-unreviewed) refuses, and `closed` is
// terminal in the way rank already gives it: nothing outranks `closed`.
// `planned` (ADR 0079): the scope branch and scopetree a plan cut, before any slice has run — ranked
// below `implementing` so `stage set implementing` moves forward out of it, and no write moves back
// to it once a run leaves it. `init` is the only writer of this value.
// `submitted` (issue #682): the pull request is open and the chain has ended — ranked above
// `documented`/`documented-unreviewed` so it is reachable from either, and below `shipped` so the
// merge hand-off still moves forward out of it.
const STAGE_RANK = {
  planned: -1,
  implementing: 0,
  merged: 1,
  reviewed: 2,
  'documented-unreviewed': 2,
  documented: 3,
  submitted: 4,
  shipped: 5,
  closed: 6,
};
const STAGES = Object.keys(STAGE_RANK);
// The sanctioned same-rank move: `/superdev:review` writes `reviewed` over `documented-unreviewed`
// when its fix loop landed commits (scope-mode.md).
const SANCTIONED_SAME_RANK = new Set(['documented-unreviewed>reviewed']);

function stageMoveAllowed(cur, next) {
  if (cur === next) return true;
  // `closed` is reached from `shipped` alone: wrap-up is the only writer, and it gates on `shipped`.
  if (next === 'closed') return cur === 'shipped';
  const rc = STAGE_RANK[cur];
  const rn = STAGE_RANK[next];
  if (rn > rc) return true;
  if (rn === rc) return SANCTIONED_SAME_RANK.has(cur + '>' + next);
  return false;
}

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
// widen what is accepted: `**Stage:** closed (rolled back)` reads as `closed` and satisfies the prune
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
const TOKEN_HEADERS = new Set(['Stage', 'Branch', 'Step', 'Docs', 'PR']);

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
// case (run-state `## The ledger`), never a parse error.
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

// The ids of the ledger rows at `in-progress`, in table order, read from the ledger's content. The
// run-trace hook (ADR 0117) attributes a scopetree edit to the one id this returns, and to `scope` for
// any other count.
function inProgressSlices(content) {
  const lines = splitLines(content);
  return tableRowIndexes(lines)
    .map((i) => splitRow(lines[i]))
    .filter((cells) => cells[5] === 'in-progress')
    .map((cells) => cells[0]);
}

// Where `insertHeader` inserts a header line that was absent: after the *whole* header block,
// never spliced between one of `names`' header lines and any bullets that immediately follow it — a
// hand-edited ledger can carry a bullet glued directly to a header line.
// `readBullets`'s own `- ` prefix test is the shape to skip past; `-1` (nothing found) means "no such
// header at all", the same signal `Math.max` already gave its caller.
function lastHeaderLineIndex(lines, names) {
  let end = Math.max(...names.map((n) => lines.findIndex((l) => headerRe(n).test(l))));
  if (end < 0) return -1;
  while (end + 1 < lines.length && lines[end + 1].startsWith('- ')) end++;
  return end;
}

// The ledger's header lines. An absent one is inserted after the last present entry of this list
// (`insertHeader`), so placement does not depend on which verb writes the header.
const APPENDED_HEADERS = ['Stage', 'Step', 'Branch', 'Anchor', 'Docs', 'PR', 'Suite', 'Rerun', 'Base', 'Deploy'];

// The bullet list under a header line, if any: `**Degraded:**` (scope-findings `## Degraded passes`) and
// `**Unresolved:**` (scope-findings `## Unresolved defects`) carry one each, in the same shape. Read by both status
// branches below — an in-flight scope prints them inline with its tally, a shipped one prints them
// alone — and by `get degraded`/`get unresolved`/`get deferred`/`get minors`, and by `get denials`, which counts the
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

// Inserts an absent header after the last present `APPENDED_HEADERS` line (and any bullets glued to it), or by
// `setHeader`'s title-anchored fallback when the ledger carries none.
function insertHeader(lines, name, value) {
  const last = lastHeaderLineIndex(lines, APPENDED_HEADERS);
  if (last < 0) return setHeader(lines, name, value);
  lines.splice(last + 1, 0, `**${name}:** ${value}`);
  return lines;
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

// One rule for every slice id before it becomes part of a `reports/<id>/` path: an id that is empty, absolute,
// or holds a path separator or a `..` segment is refused, naming the id (triage #1342).
function checkSliceId(id) {
  if (typeof id !== 'string' || id.trim() === '' || /[\\/]/.test(id) || id === '..') {
    fail(`slice id "${id}" is refused: a slice id is non-empty and holds no path separator and no ".." segment`);
  }
  return id;
}

module.exports = {
  checkSliceId, CHANGE_TYPES, SLUG_RE, SLICE_STATUSES, SUITE_RESULTS, STAGES, stageMoveAllowed,
  ledgerPath, readLines, splitLines, writeLines, headerRe, getHeader, readLedgerHeader, inProgressSlices,
  readBullets, insertHeader, setHeader, tableRowIndexes, sanitizeCell, splitRow,
};
