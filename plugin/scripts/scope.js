#!/usr/bin/env node
'use strict';

// scope.js: the run-state CLI (ADR 0022). Owns every ledger.md write and read in the chain.
// Verbs: init, stage, step, slice, degraded, unresolved, deferred, docs, pr, deploy, suite, base, get, status,
// publish, adopt, trace, collisions, citations, root, staging, dod-line; `main()` also runs test and fail-to-pass. Exit
// nonzero with a one-line stderr reason on any refusal. hooks/ledger-guard.js makes this the only
// ledger write path.
// `root` and `dod-line` touch no ledger: `root` resolves a run root's absolute
// path, anchored to the repository's main working tree regardless of which checkout invoked it (ADR
// 0080); `dod-line` edits one Definition-of-Done checklist line handed to it on stdin, on behalf of a
// store seed's own fetch/write pair (references/dod-ticks.md, INV-0014).

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
// references/scope-mode.md `## The ledger` — the suite record's result vocabulary (INV-0017). `none`
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

// The type cell of the ledger row `id`, or null. The run-trace hook (ADR 0117) reads it through
// `splitRow`, so an escaped `\|` in a title never shifts the cells.
function sliceType(content, id) {
  const lines = splitLines(content);
  for (const i of tableRowIndexes(lines)) {
    const cells = splitRow(lines[i]);
    if (cells[0] === id) return cells[3];
  }
  return null;
}

// The fenced blocks of a document, read line by line. A fence opens on a line that starts, after at
// most three spaces of indentation, with three or more backticks or tildes and any info string (a
// backtick fence's info string holds no backtick, so an inline span such as ```x``` is no opener). It
// closes on a line with the same indentation limit, of the same character, at least as long as the
// opener. `blocks` holds each closed block's body, `outside` the text between blocks. An unclosed
// fence yields no block. scope.js and hooks/green-gate.js each carry this function, because the gate's
// decision never depends on scope.js loading (its scope.js require serves only the fail-silent trace
// write); tests/green-gate.test.js pins them byte-identical.
function fenceBlocks(raw) {
  const blocks = [];
  const outside = [];
  let open = null;
  let body = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!open) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) { open = m[1]; body = []; } else outside.push(line);
    } else if (/^ {0,3}(`+|~+)\s*$/.test(line) && line.trim()[0] === open[0] && line.trim().length >= open.length) {
      blocks.push(body.join('\n'));
      open = null;
    } else body.push(line);
  }
  return { blocks, outside: outside.join('\n') };
}

// The default test patterns, used where `docs/agents/verification.md` has no usable `## Test paths`.
const DEFAULT_TEST_PATHS = ['**/tests/', '**/test/', '**/__tests__/', '**/spec/', '**/*.Tests/', '**/*.Test/', '*.test.*', '*.spec.*', '*_test.*', 'test_*.py'];

// One glob entry -> a RegExp over a repo-relative path, or null for a malformed entry. `*` stays in a
// path segment, `**` crosses them, a trailing `/` names a directory. An entry holding a `/` is anchored
// at the repository root; one without matches a file name at any depth.
function globToRe(glob) {
  if (!glob || /\s/.test(glob) || glob.startsWith('/') || glob.split('/').includes('..')) return null;
  const dir = glob.endsWith('/');
  const body = dir ? glob.slice(0, -1) : glob;
  if (!body) return null;
  let re = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '*' && body[i + 1] === '*') {
      if (body[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const anchored = body.includes('/') || dir ? '^' : '^(?:.*/)?';
  return new RegExp(anchored + re + (dir ? '/' : '$'));
}

// The `## Test paths` entries of a `docs/agents/verification.md` text: list items, each one pattern
// optionally in a backtick span. Null where the section is absent or holds no usable entry.
function configuredTestPaths(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s+Test paths\s*$/.test(l));
  if (at < 0) return null;
  const res = [];
  for (let i = at + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) {
    const m = /^\s*[-*]\s+(?:`([^`]*)`|(\S+))\s*$/.exec(lines[i]);
    const re = m && globToRe(m[1] !== undefined ? m[1] : m[2]);
    if (re) res.push(re);
  }
  return res.length ? res : null;
}

// Whether repo-relative `rel` is a test path under the `verification.md` text given ('' for no file).
// The one classifier: hooks/run-trace.js reads its tree's file, `suite reusable` reads a commit's (ADR 0128).
function isTestPath(text, rel) {
  const res = configuredTestPaths(text) || DEFAULT_TEST_PATHS.map(globToRe);
  return res.some((re) => re.test(rel));
}

// The test commands a tree's `docs/agents/verification.md` configures, read the way
// `references/test-selection.md` and `hooks/green-gate.js` read it: the first fenced block (`fenceBlocks`) is the full
// command, the second the focused one, and the first backtick span under `## Whole-repo command` the
// whole-repo one. Each is whitespace-collapsed, or null when absent. The run-trace hook (ADR 0117)
// classes a Bash command against them.
function verificationCommands(tree, keepLines) {
  let raw;
  try { raw = fs.readFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), 'utf8'); } catch { return { full: null, focused: null, whole: null }; }
  return verificationCommandsOf(raw, keepLines);
}

// The same read over a `verification.md` text already in hand (the `fail-to-pass` verb reads a commit's, ADR 0134).
function verificationCommandsOf(raw, keepLines) {
  // `keepLines` keeps a fence's own newlines, for the runner that executes the command as written (ADR 0127).
  const norm = (t) => (t ? (keepLines ? t.trim() : t.replace(/\s+/g, ' ').trim()) || null : null);
  const { blocks, outside } = fenceBlocks(raw.replace(/\r\n?/g, '\n'));
  const sec = /^##\s+Whole-repo command\s*$([\s\S]*?)(?=^#{1,6}\s|(?![\s\S]))/m.exec(outside);
  const span = sec && /`([^`\n]+)`/.exec(sec[1]);
  return { full: norm(blocks[0]), focused: norm(blocks[1]), whole: norm(span && span[1]) };
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
const APPENDED_HEADERS = ['Stage', 'Step', 'Branch', 'Anchor', 'Docs', 'PR', 'Suite', 'Base', 'Deploy'];

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

// --- verbs -------------------------------------------------------------------

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
function rotateFinishedLedger(root, stage) {
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
  console.log(`rotated ${stage} ledger to ${dest}`);
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

function verbInit(cwd, label, stage, stdinJson) {
  if (!INIT_ENTRY_STAGES.includes(stage)) {
    fail(`init needs an entry stage, one of ${INIT_ENTRY_STAGES.join('|')} — got "${stage || ''}"`);
  }
  const { slug } = validateLabel(label);
  const workTree = mainWorkTree(cwd) || cwd;
  const root = path.join(workTree, '.superdev', 'scopes', slug);
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
      console.log(`ledger already exists at stage "planned" (no slice has run) — overwriting`);
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
    rotateFinishedLedger(root, priorStage);
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
  console.log(root);
  return root;
}

// Set-only: the read path is `get stage`.
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
  if (cur !== value) {
    const at = lines.findIndex((l) => headerRe('Step').test(l));
    if (at >= 0) {
      lines.splice(at, 1);
      // The trace records the clear as a `step clear` line, so the review-step window reads step lines alone.
      appendTrace(root, { kind: 'ledger', fields: ['step', 'clear'] });
    }
  }
  writeLines(root, setHeader(lines, 'Stage', value));
}

// The chain step a command has started and not yet completed (ADR 0140, scope-mode `## The ledger`).
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
// `unresolved add -`, `deferred add -`, `degraded add -`, `degraded add-denial -`, and `degraded
// reset-denials -` read their bullet text from stdin instead of a shell-interpolated argument
// (triage #680): the sentinel `-` as the sole word past the subcommand means "read stdin," one
// trailing newline stripped, exactly as `dod-line`'s own stdin path already strips it. `add-denial`
// quotes a classifier's own refusal text, and `reset-denials` an operator's own reason, either of
// which can carry a quote, a backtick, or a `$(` just as easily as any other bullet text. Any other
// subcommand, or any other shape of these subcommands' own arguments, keeps joining its positional
// words with spaces as it always has.
const BULLET_STDIN_SUBS = ['add', 'add-denial', 'reset-denials', 'resolve'];
function resolveBulletText(sub, rest, stdinJson) {
  if (BULLET_STDIN_SUBS.includes(sub) && rest.length === 1 && rest[0] === '-') return stdinJson.replace(/\r?\n$/, '');
  return rest.join(' ');
}

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
    if (at < 0) return false; // no such line — succeeds, changes nothing
    let end = at + 1;
    while (end < lines.length && lines[end].startsWith('- ')) end++;
    lines.splice(at, end - at);
    writeLines(root, lines);
    return true;
  }
  if (sub !== 'add') fail(`unknown unresolved subcommand "${sub}" — use add|clear`);
  addBullet(root, 'Unresolved', 'unresolved add', text);
  return true;
}

// `**Deferred:**` carries a finding a fix loop (the scope review's, or the full tier's per-slice loop) handed
// to `/superdev:plan` rather than fixed: its
// remedy would add a capability the Definition of Done never named (ADR 0035, ADR 0097). It has no `clear`, unlike
// the unresolved record it otherwise mirrors — a defect stops being true once a run re-verifies clean,
// while unplanned work stays unplanned until somebody plans it. `resolve` removes one finding instead: the
// one a later cycle of the same run fixed with a guard-rail remedy after all (ADR 0121). It matches the
// exact text `get deferred` printed, removes every identical bullet, and drops the line once none remain.
function verbDeferred(root, sub, text) {
  if (sub === 'resolve') {
    if (!text) fail('deferred resolve needs the bullet text');
    if (text.includes('\n')) fail('deferred resolve text must not contain a newline');
    const lines = readLines(root);
    const at = lines.findIndex((l) => headerRe('Deferred').test(l));
    let end = at + 1;
    while (at >= 0 && end < lines.length && lines[end].startsWith('- ')) end++;
    const kept = at < 0 ? [] : lines.slice(at + 1, end).filter((l) => l !== `- ${text}`);
    if (at < 0 || kept.length === end - at - 1) fail(`no deferred bullet reads exactly "${text}" in ${ledgerPath(root)}`);
    lines.splice(at, end - at, ...(kept.length ? [lines[at], ...kept] : []));
    writeLines(root, lines);
    return;
  }
  if (sub !== 'add') fail(`unknown deferred subcommand "${sub}" — use add|resolve`);
  addBullet(root, 'Deferred', 'deferred add', text);
}

// `**Docs:**` records that a run performed its documentation pass in the controller's own context
// rather than through a dispatched doc-writer (ADR 0031). `/superdev:document` reads it to skip that
// dispatch; `/superdev:review` and run handoff's fix loop clear it when their fix cycles land commits,
// because those commits made the pass stale. The value names the pass rather than merely marking presence,
// so another arrangement can record its own kind without a second header.
function verbDocs(root, sub, value) {
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe('Docs').test(l));
  if (sub === 'clear') {
    if (at < 0) return false; // no such line — succeeds, changes nothing
    lines.splice(at, 1);
    writeLines(root, lines);
    return true;
  }
  if (sub !== 'set') fail(`unknown docs subcommand "${sub}" — use set|clear`);
  if (!value) fail('docs set needs a value');
  // `Docs` is a TOKEN_HEADERS entry: `get docs` reads back only the first whitespace-delimited
  // token, so a value with internal whitespace would write something `get docs` can never round-trip.
  if (/\s/.test(value)) fail('docs set value must not contain whitespace — "get docs" only reads back the first token');
  if (at >= 0) {
    lines[at] = `**Docs:** ${value}`;
    writeLines(root, lines);
    return true;
  }
  writeLines(root, insertHeader(lines, 'Docs', value));
  return true;
}

// pr set: `**PR:**` records the pull request number `/superdev:submit-pr` opened, the moment it opens
// it, so `/superdev:ship` reads it back instead of a code-host lookup by head branch — a reused branch
// name (scope-mode.md's `## Cutting the scope branch` treats reuse as ordinary) leaves old, merged pull
// requests on the host under the same head, and a lookup by branch alone could adopt one of those
// instead (INV-0092). A ledger from before this header existed carries no line, and parses unchanged —
// `get pr` reports `absent`, the same as any other missing optional header (`## The ledger`).
function verbPr(root, sub, value) {
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe('PR').test(l));
  if (sub === 'clear') {
    if (at < 0) return false; // no such line — succeeds, changes nothing
    lines.splice(at, 1);
    writeLines(root, lines);
    return true;
  }
  if (sub !== 'set') fail(`unknown pr subcommand "${sub}" — use set|clear`);
  if (!value) fail('pr set needs a value');
  const digits = value.replace(/^#/, '');
  if (!/^\d+$/.test(digits)) fail(`pr set value must be a number, optionally led by "#" — got "${value}"`);
  const rendered = `#${digits}`;
  if (at >= 0) {
    lines[at] = `**PR:** ${rendered}`;
    writeLines(root, lines);
    return true;
  }
  writeLines(root, insertHeader(lines, 'PR', rendered));
  return true;
}

// deploy set/get: `**Deploy:**` records each deploy target's state for the run, so `/superdev:ship`
// can tell a finished deploy from a failed one and resume where it stopped (INV-0099) — the ledger is
// the record it reads rather than re-running or re-deriving a target's state from scratch. A target
// name is one word, the same as `docs/agents/deployment.md`'s targets table names it. The value is a
// comma-joined list of `<target> <state>[ exit <n>]` entries, in the order each target was first
// recorded — the same first-recorded ordering `## The ledger` gives the slice table.
const DEPLOY_STATES = ['pending', 'deployed', 'failed'];
const DEPLOY_ENTRY_RE = new RegExp(`^(\\S+) (${DEPLOY_STATES.join('|')})(?: exit (\\d+))?$`);

function parseDeployRecord(raw) {
  if (!raw) return [];
  return raw.split(', ').map((entry) => {
    const m = entry.match(DEPLOY_ENTRY_RE);
    if (!m) fail(`unreadable deploy record entry: "${entry}"`);
    const rec = { target: m[1], state: m[2] };
    if (m[3] !== undefined) rec.exit = m[3];
    return rec;
  });
}

function renderDeployRecord(records) {
  return records.map((r) => `${r.target} ${r.state}${r.exit !== undefined ? ` exit ${r.exit}` : ''}`).join(', ');
}

function verbDeploySet(root, target, state, exitCode) {
  if (!target) fail('deploy set needs a <target>');
  if (!/^[^\s,]+$/.test(target)) fail(`target "${target}" must be one word`);
  if (!DEPLOY_STATES.includes(state)) fail(`unknown deploy state "${state}" — use ${DEPLOY_STATES.join('|')}`);
  if (exitCode !== undefined && state !== 'failed') fail('--exit belongs only with failed');
  if (exitCode !== undefined && !/^\d+$/.test(exitCode)) fail(`--exit value must be a number — got "${exitCode}"`);
  const lines = readLines(root);
  const records = parseDeployRecord(getHeader(lines, 'Deploy'));
  const idx = records.findIndex((r) => r.target === target);
  const rec = { target, state };
  if (state === 'failed' && exitCode !== undefined) rec.exit = exitCode;
  if (idx >= 0) records[idx] = rec;
  else records.push(rec);
  const value = renderDeployRecord(records);
  const at = lines.findIndex((l) => headerRe('Deploy').test(l));
  if (at >= 0) {
    lines[at] = `**Deploy:** ${value}`;
    writeLines(root, lines);
    return;
  }
  writeLines(root, insertHeader(lines, 'Deploy', value));
}

function verbDeployGet(root) {
  const raw = getHeader(readLines(root), 'Deploy');
  if (raw === null) {
    console.log('absent');
    return;
  }
  for (const r of parseDeployRecord(raw)) {
    console.log(`${r.target} ${r.state}${r.exit !== undefined ? ` exit ${r.exit}` : ''}`);
  }
}

// --- dod-line: the Definition-of-Done checklist-line edit (references/dod-ticks.md, INV-0014) -----
//
// The one line edit every store's own `## Definition of Done ticks` section names (`plan-contract.md`
// → *Definition of Done ticks*). `dod-line` touches no ledger and makes no store call: a store seed
// takes the body out of its fetched response into a file, runs it through `dod-line`, and writes the
// result back only through the gated **Edit an issue's body** chain (`&&` on every exit status, `[ -s ]`
// on the output file). Two modes share
// one core (`transformDodLines` below) — the default, a whole markdown body on stdin/stdout, and
// `--line`, one checklist line in and one out, for the Jira seed's ADF text node, which is JSON, not
// markdown lines.
//
// A checklist line is `- [ ] <criterion>[ — <tag>][ — <verdict>: <note>]` (`plan-contract.md`'s line
// format). The tag is slice ids (`01`, `01, 02`), store refs (`#667`, `#672, #673`), a Jira issue key
// (`PROJ-12`, `PROJ-12, PROJ-13` — `references/issue-tracker-jira.md`'s own rewritten notation), or the
// literal `scope` — never free text. It is absent on a single-slice feature's own DoD (`plan-contract.md`'s
// `### Criterion tags`: "a single-slice feature carries no tags"), on a run from before tagging existed,
// or on one untagged line inside an otherwise tagged DoD (`references/dod-ticks.md`'s own "No tags at
// all"). A line with no note takes its tag from the *rightmost* ` — <tag>` at the end of the line,
// greedily handing everything else to the criterion: that is what keeps a criterion carrying its own
// " — " (`plan-contract.md`'s own worked example, "Reachable: none — entrance unchanged; … — scope")
// intact. A line with a note instead splits at the *leftmost* ` — <tag> — <verdict>: ` boundary, because
// the note itself is free text and may contain that same shape (a re-write's own earlier note, say) —
// everything past the leftmost boundary is the note, however many look-alike dashes it carries. Where
// no valid tag suffix exists in either shape, the whole rest of the line is the criterion and the tag is
// empty — rendered with no ` — <tag>` segment at all.
//
// `accepted` is the fourth verdict (ADR 0095): an operator's own decision that an unmet criterion stands
// accepted as unmet. It renders unticked, exactly like `not-met` and `ceiling` — the box never lies about
// what got verified — with its own `accepted:` label on the note.
const DOD_TAG_TOKEN = '(?:#?\\d+|[A-Z][A-Z0-9_]*-\\d+)';
const DOD_TAG_PATTERN = `(?:scope|${DOD_TAG_TOKEN}(?:,\\s*${DOD_TAG_TOKEN})*)`;
const DOD_VERDICTS = {
  met: { marker: 'x', label: 'met' },
  'not-met': { marker: ' ', label: 'not met' },
  ceiling: { marker: ' ', label: 'ceiling' },
  accepted: { marker: ' ', label: 'accepted' },
};
const DOD_NOTE_VERDICT_RE = '(?:met|not met|ceiling|accepted)';
// A checklist line's marker and its text past `] `. The leading `- ` is optional: a markdown body
// carries it, but the Jira ADF text node this feeds in `--line` mode carries only the bracket
// (`references/issue-tracker-jira.md`'s own text-node shape, "a `paragraph` or `listItem` node whose
// text begins `[ ] <criterion>`").
// Trailing whitespace is tolerated on either shape (an editor's or a store's own habit) and dropped
// only where a matched line is actually rewritten — an untouched line keeps its own trailing bytes.
const DOD_LINE_RE = /^(\s*(?:-\s*)?)\[[ xX]\]\s*(.*)$/;
const DOD_WITH_NOTE_TAG_RE = new RegExp(`^(.+?) — (${DOD_TAG_PATTERN}) — ${DOD_NOTE_VERDICT_RE}: (.*?)\\s*$`);
const DOD_WITH_NOTE_NO_TAG_RE = new RegExp(`^(.+?) — ${DOD_NOTE_VERDICT_RE}: (.*?)\\s*$`);
const DOD_NO_NOTE_TAG_RE = new RegExp(`^(.+) — (${DOD_TAG_PATTERN})\\s*$`);
// The `## Definition of Done` heading — any level, up to 3 leading spaces (CommonMark's own ATX limit)
// — that scopes body-mode matching to the checklist section alone (triage #679's C.3): a checkbox that
// happens to repeat a DoD criterion's text elsewhere in the same document is never a match candidate.
const DOD_SECTION_HEADING_RE = /^\s{0,3}(#{1,6})\s+Definition of Done\b/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+/;

// Whitespace-insensitive equality (`--match`'s own contract), collapsed within one physical line only:
// a `--match` argument itself carrying an embedded newline, or a run of spaces a web UI's autoformat
// left behind, still matches the same single-line criterion. A checklist line an editor reflowed onto
// two physical lines is a different, unmatched line — matching never joins lines.
function collapseWhitespace(s) {
  return s.trim().replace(/\s+/g, ' ');
}

// The checklist line's leading marker prefix (the `- ` a markdown body carries, absent from the bare
// `[ ]`/`[x]` a Jira ADF text node carries — `references/issue-tracker-jira.md`'s own text-node
// shape), its criterion, and its tag (empty when the line carries none — the untagged shapes above).
// Returns every plausible reading, not just one: an untagged criterion that merely ends in something
// shaped like a tag (`- [ ] Retries capped — 3`) reads as tagged `3` under the rightmost-tag rule above,
// so the whole-line-untagged reading is offered alongside it (triage #679's C.1) — a line matches when
// either reading's criterion equals `--match`, and rendering keeps whichever one matched. The same offer
// reaches the tag-with-note shape too: `<criterion> — <tag> — <verdict>: <note>` could also be
// `<criterion — tag> — <verdict>: <note>` with an empty tag, once the line already carries a note (Minor
// review find #4) — a tagged criterion that already carries a note is otherwise unreadable by its
// untagged spelling on a re-judge. A line offering two readings still counts once toward the match limit
// below. An empty array only when the line carries no task-list marker at all.
function parseDodLineReadings(line) {
  const m = line.match(DOD_LINE_RE);
  if (!m) return [];
  const [, prefix, rest] = m;
  const withTagNote = rest.match(DOD_WITH_NOTE_TAG_RE);
  if (withTagNote) {
    // The same C.1 offer as the no-note case below: `<criterion> — <tag> — <verdict>: <note>` could
    // also be `<criterion — tag> — <verdict>: <note>` with an empty tag, so a criterion that merely
    // ends in something tag-shaped is still readable once it already carries a note (Minor review find
    // #4) — matching runs after both readings, and a line offering two still counts once.
    const asUntagged = rest.match(DOD_WITH_NOTE_NO_TAG_RE);
    return asUntagged
      ? [
          { prefix, criterion: withTagNote[1], tag: withTagNote[2] },
          { prefix, criterion: asUntagged[1], tag: '' },
        ]
      : [{ prefix, criterion: withTagNote[1], tag: withTagNote[2] }];
  }
  const withNoteNoTag = rest.match(DOD_WITH_NOTE_NO_TAG_RE);
  if (withNoteNoTag) return [{ prefix, criterion: withNoteNoTag[1], tag: '' }];
  const tagNoNote = rest.match(DOD_NO_NOTE_TAG_RE);
  if (tagNoNote) {
    return [
      { prefix, criterion: tagNoNote[1], tag: tagNoNote[2] },
      { prefix, criterion: rest.trimEnd(), tag: '' },
    ];
  }
  return [{ prefix, criterion: rest.trimEnd(), tag: '' }];
}

function renderDodLine(prefix, criterion, tag, verdict) {
  const v = DOD_VERDICTS[verdict];
  const tagSuffix = tag ? ` — ${tag}` : '';
  return `${prefix}[${v.marker}] ${criterion}${tagSuffix}`;
}

// The `## Definition of Done` section's line range in a fence-masked body: from the heading whose text
// starts "Definition of Done" (any level, up to 3 leading spaces) up to the next heading of the same or
// a higher level, or to the end of the body. `null` when the body carries no such heading — a
// single-slice feature's own acceptance-only checklist, say — which is what sends body-mode matching
// back to scanning the whole body, as it always has (triage #679's C.3).
function dodSectionRange(masked) {
  let start = -1;
  let level = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const m = masked[i].match(DOD_SECTION_HEADING_RE);
    if (m) {
      start = i;
      level = m[1].length;
      break;
    }
  }
  if (start < 0) return null;
  let end = masked.length;
  for (let i = start + 1; i < masked.length; i += 1) {
    const m = masked[i].match(HEADING_RE);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return { start, end };
}

// The core: find the one non-fenced checklist line whose criterion equals `match` once both sides
// collapse whitespace, and replace it with the judged line. Matching runs on `maskFencedLines()`'s
// output (kb-patch.js's own fence rule), so a line inside a fenced illustrative example is never a
// candidate — the same posture `scope.js`'s own `adopt` marker scan already takes. Candidates are
// further scoped to the `## Definition of Done` section when the body carries one (`dodSectionRange`
// above) — `--line` mode's one-line input carries no heading, so it is unaffected. Refuses, changing
// nothing, on zero or on two-or-more matching lines; a line offering two matching readings (C.1 above)
// still counts once toward that limit.
function transformDodLines(lines, match, verdict, note) {
  const masked = maskFencedLines(lines, 'dod-line input', 'edited');
  const wanted = collapseWhitespace(match);
  const range = dodSectionRange(masked);
  const lo = range ? range.start : 0;
  const hi = range ? range.end : lines.length;
  const hits = [];
  for (let i = lo; i < hi; i += 1) {
    const readings = parseDodLineReadings(masked[i]);
    const reading = readings.find((r) => collapseWhitespace(r.criterion) === wanted);
    if (reading) hits.push({ index: i, reading });
  }
  if (hits.length === 0) fail(`no checklist line matches criterion "${match}"`);
  if (hits.length > 1) {
    fail(`${hits.length} checklist lines match criterion "${match}" — which one to edit cannot be resolved`);
  }
  const { index: i, reading } = hits[0];
  const { prefix, criterion, tag } = reading;
  const out = lines.slice();
  out[i] = `${renderDodLine(prefix, criterion, tag, verdict)} — ${DOD_VERDICTS[verdict].label}: ${note}`;
  return out;
}

function takeOption(args, flag) {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

// A caller-supplied file's text, one trailing newline stripped, exactly as `--line` mode already
// strips it off stdin. Report-derived text (a `"`, a backtick, a `$(`, an embedded newline) reaches
// `dod-line` this way rather than as a shell-interpolated argument (triage #680).
function readOptionFile(flag, filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    fail(`${flag} could not read "${filePath}": ${e.message}`);
  }
  return raw.replace(/\r?\n$/, '');
}

function verbDodLine(args, stdinRaw) {
  const match = takeOption(args, '--match');
  const matchFile = takeOption(args, '--match-file');
  const verdict = takeOption(args, '--verdict');
  const note = takeOption(args, '--note');
  const noteFile = takeOption(args, '--note-file');
  const lineIdx = args.indexOf('--line');
  const lineMode = lineIdx >= 0;
  if (lineMode) args.splice(lineIdx, 1);

  if (match !== undefined && matchFile !== undefined) fail('dod-line takes --match or --match-file, not both');
  if (note !== undefined && noteFile !== undefined) fail('dod-line takes --note or --note-file, not both');

  const resolvedMatch = matchFile !== undefined ? readOptionFile('--match-file', matchFile) : match;
  const resolvedNote = noteFile !== undefined ? readOptionFile('--note-file', noteFile) : note;

  if (!resolvedMatch) fail('dod-line needs --match <criterion text> or --match-file <path>');
  if (!DOD_VERDICTS[verdict]) {
    fail(`dod-line needs --verdict one of ${Object.keys(DOD_VERDICTS).join('|')} — got "${verdict || ''}"`);
  }
  if (resolvedNote === undefined) fail('dod-line needs --note <text> or --note-file <path>');
  if (/[\n\r]/.test(resolvedNote)) fail('dod-line --note must not contain a newline — it would inject a free-text line into the body');
  // The verb writes the verdict's own label itself, so a note already opening with it would carry it twice.
  const ownLabel = `${DOD_VERDICTS[verdict].label}:`;
  const noteText = resolvedNote.toLowerCase().startsWith(ownLabel)
    ? resolvedNote.slice(ownLabel.length).trimStart()
    : resolvedNote;

  if (lineMode) {
    const line = stdinRaw.replace(/\r?\n$/, '');
    const [out] = transformDodLines([line], resolvedMatch, verdict, noteText);
    console.log(out);
    return;
  }
  const out = transformDodLines(splitLines(stdinRaw), resolvedMatch, verdict, noteText);
  // process.stdout.write, not console.log: console.log always appends its own trailing newline, which
  // would double up on the one splitLines/join already reproduce when stdinRaw itself ended in one.
  process.stdout.write(out.join('\n'));
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
  const bulletFields = { unresolved: 'Unresolved', degraded: 'Degraded', deferred: 'Deferred' };
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
  if (!name) fail(`unknown field "${field}" — use stage|step|branch|anchor|docs|pr|slices|unresolved|degraded|deferred|denials|suite`);
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
  // (scope-mode.md's `## Adopting a shipped original`, ADR 0124).
  if (shipped) {
    if (stage === null) fail('--shipped adopts only a run-state payload at stage "shipped", and this one carries no **Stage:** line');
    if (stage !== 'shipped') fail(`--shipped adopts only a run-state payload at stage "shipped", not "${stage}"`);
  } else if (stage === null) {
    fail('the run-state payload carries no **Stage:** line — a ledger adopted without one could never move its stage');
  } else if (stage === 'shipped' || stage === 'closed') {
    fail(`run-state payload carries stage "${stage}" — a finished run has nothing to adopt`);
  }
  for (const i of tableRowIndexes(payload)) {
    if (splitRow(payload[i]).length !== 7) fail('run-state payload carries a slice row without the 7 ledger columns');
  }
  return [`# Ledger — ${slug}`, ...payload];
}

function verbAdopt(root, body, shipped) {
  if (fs.existsSync(ledgerPath(root))) fail(`ledger already exists: ${ledgerPath(root)}`);
  const lines = adoptLines(root, body, shipped);
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
  // Through the main working tree, as the scope scan is (ADR 0080): a staged page lives there whichever
  // checkout staged it (ADR 0119), so a scan from a scopetree or slicetree sees the same pages.
  const dir = path.join(mainWorkTree(cwd) || cwd, '.superdev', 'kb-pending');
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
  const scopesDir = scopesDirFor(cwd);
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
      const step = getHeader(lines, 'Step');
      const rows = tableRowIndexes(lines).map((i) => splitRow(lines[i]));
      if (rows.some((c) => c.length !== 7)) {
        out.push(`${scope}: ledger unreadable`);
        pushPendingAndStrays(scope);
        continue;
      }
      // A shipped or closed scope is finished with. `closed` is where `hooks/scope-prune.js` reaps its
      // run root once the TTL elapses (ADR 0106); a `shipped` one waits for
      // `/superdev:wrap-up` to close it. Neither is work in flight, so each collapses to one line here
      // rather than carrying a tally through a report that exists to show what is still moving. Its
      // degrade record, unresolved-defect record, deferred-finding record, and staged-page lines are the
      // deliberate exceptions below: a degraded pass is otherwise recorded only in the pull-request body,
      // which the same prune outlives it by (scope-mode `## Degraded passes`); an unresolved defect the
      // same way (`## Unresolved defects`); a deferred finding likewise, and it is the one record naming
      // work nobody has planned yet (ADR 0035); and a page nobody publishes is invisible everywhere else
      // (ADR 0023) — a finished scope is exactly where any of them waits.
      if (stage === 'shipped' || stage === 'closed') {
        out.push(`${scope}  (${stage}${step ? `, step: ${step}` : ''})`);
        const finishedDegraded = readBullets(lines, 'Degraded');
        if (finishedDegraded.length) out.push(`  degraded: ${finishedDegraded.join(', ')}`);
        const finishedUnresolved = readBullets(lines, 'Unresolved');
        if (finishedUnresolved.length) out.push(`  unresolved: ${finishedUnresolved.join(', ')}`);
        const finishedDeferred = readBullets(lines, 'Deferred');
        if (finishedDeferred.length) out.push(`  deferred: ${finishedDeferred.join(', ')}`);
        const finishedDeploy = getHeader(lines, 'Deploy');
        if (finishedDeploy) out.push(`  deploy: ${finishedDeploy}`);
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
      const deploy = getHeader(lines, 'Deploy');
      out.push(`${scope}  (${rows.length} slices${stage ? `, stage: ${stage}` : ''}${step ? `, step: ${step}` : ''})`);
      out.push(`  todo: ${counts.todo}  in-progress: ${counts['in-progress']}  in-review: ${counts['in-review']}  blocked: ${counts.blocked}  merged: ${counts.merged}`);
      if (blocked.length) out.push(`  blocked: ${blocked.join(', ')}`);
      if (degraded.length) out.push(`  degraded: ${degraded.join(', ')}`);
      if (unresolved.length) out.push(`  unresolved: ${unresolved.join(', ')}`);
      if (deploy) out.push(`  deploy: ${deploy}`);
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
// shape `readLedgerHeader` already gives `hooks/scope-prune.js` and `hooks/slicetree-sweep.js` — and no
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

// The full 40-hex commit `ref` resolves to in `cwd`, or `null` when it resolves to nothing —
// the one `rev-parse --verify` call both `refResolves` and `verbSuite` need, the latter for the
// resolved sha itself (INV-0017 needs the full commit on record, never a short sha or a moving ref
// like `HEAD`).
function resolveCommit(ref, cwd) {
  const result = gitSpawn(['rev-parse', '--verify', '--quiet', '--end-of-options', ref + '^{commit}'], cwd);
  return result.status === 0 ? result.stdout.trim() : null;
}

function refResolves(ref, cwd) {
  return resolveCommit(ref, cwd) !== null;
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
// git without `--write-tree`. Three answers, because the second tier runs on only one of the two
// negatives (ADR 0082):
//   'contained'    — base already holds every byte of the branch's work
//   'differs'      — the merge is clean and would still change base, so the branch carries content
//                    base does not hold; decisive, and the probe never runs
//   'inconclusive' — the comparison could not settle it: a conflict, an unreadable tree, or the
//                    ancestry fallback, which a squash-merge defeats by construction
function containedAgainst(ref, base, cwd, writeTreeSupported) {
  if (writeTreeSupported) {
    const merged = gitSpawn(['merge-tree', '--write-tree', '--end-of-options', base, ref], cwd);
    if (merged.status !== 0) return 'inconclusive';
    // `--verify` ahead of `--end-of-options`: bare `rev-parse` echoes an unrecognized flag back on
    // stdout instead of treating it as the end-of-options marker, which would corrupt the tree-hash
    // comparison below for every caller, not only an option-shaped `base`.
    const baseTree = gitSpawn(['rev-parse', '--verify', '--quiet', '--end-of-options', base + '^{tree}'], cwd);
    if (baseTree.status !== 0) return 'inconclusive';
    return merged.stdout.trim() === baseTree.stdout.trim() ? 'contained' : 'differs';
  }
  return gitSpawn(['merge-base', '--is-ancestor', '--end-of-options', ref, base], cwd).status === 0
    ? 'contained'
    : 'inconclusive';
}

// The scan the probe below refuses to start past. A cap on commits, never on wall clock: one
// repository state gives one verdict, where a machine-load-dependent bound gives two (ADR 0082).
const PROBE_COMMIT_CAP = 1000;

// A patch stream over a range of up to `PROBE_COMMIT_CAP` commits runs well past `spawnSync`'s own 1 MiB
// default, and an overrun reports as a failed call — a not-contained verdict the repository did not earn.
const PROBE_MAX_BUFFER = 256 * 1024 * 1024;

// `git patch-id --stable` over `input`, returning the set of patch ids it hashed. One id per commit
// for a `git log -p` stream, and exactly one for a plain diff. Empty on any failure, and on an empty
// diff, which reads as "no id to match" at both call sites.
function patchIds(input, cwd) {
  // stdin is `pipe` here alone: `gitSpawn`'s own default ignores it, and every other call in this
  // section writes nothing to git.
  const hashed = gitSpawn(['patch-id', '--stable'], cwd, {
    input,
    stdio: ['pipe', 'pipe', 'ignore'],
    maxBuffer: PROBE_MAX_BUFFER,
  });
  if (hashed.status !== 0) return new Set();
  return new Set(
    hashed.stdout
      .split('\n')
      .map((line) => line.trim().split(' ')[0])
      .filter(Boolean)
  );
}

// The second tier (ADR 0082). Whether base's history holds a commit whose diff equals the branch's
// cumulative diff from their merge base — the neighbouring, exactly decidable question the first tier
// cannot answer once base has edited the branch's files after taking its work. `hooks/scope-prune.js`
// is the second caller, which is why this is exported rather than kept private to `testContainment`.
//
// Fails closed throughout, per INV-0003: a failed `merge-base`, `diff`, `patch-id`, `rev-list`, or
// `log`, an unreadable count, or a range past the cap each answer `false`, leaving the first tier's
// verdict standing. `--end-of-options` opens every revision-taking call for the same reason the rest
// of this section carries it — neither ref is required to have come from trusted config.
function baseHistoryHasPatch(cwd, base, branch) {
  const found = gitSpawn(['merge-base', '--end-of-options', base, branch], cwd);
  if (found.status !== 0) return false;
  const mergeBase = found.stdout.trim();
  if (!mergeBase) return false;

  // The range leads with the merge-base hash, so it is option-shaped under no `base` at all.
  const range = `${mergeBase}..${base}`;
  const counted = gitSpawn(['rev-list', '--count', '--end-of-options', range], cwd);
  if (counted.status !== 0) return false;
  const gained = Number(counted.stdout.trim());
  if (!Number.isInteger(gained) || gained < 1 || gained > PROBE_COMMIT_CAP) return false;

  const diffed = gitSpawn(['diff', '--end-of-options', mergeBase, branch], cwd, {
    maxBuffer: PROBE_MAX_BUFFER,
  });
  if (diffed.status !== 0) return false;
  const [wanted] = patchIds(diffed.stdout, cwd);
  if (!wanted) return false;

  // One `log -p` piped into one `patch-id`, never a subprocess pair per commit: measured at 0.12s
  // against 1.0s over a 64-commit range (ADR 0082).
  const walked = gitSpawn(['log', '-p', '--no-color', '--end-of-options', range], cwd, {
    maxBuffer: PROBE_MAX_BUFFER,
  });
  if (walked.status !== 0) return false;
  return patchIds(walked.stdout, cwd).has(wanted);
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
  const local = containedAgainst(ref, base, cwd, writeTreeSupported);
  if (local === 'contained') return 'contained';
  if (local === 'inconclusive' && baseHistoryHasPatch(cwd, base, ref)) return 'contained';

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
  if (fetched.status !== 0) {
    // The discriminator ADR 0086 names: `spawnSync` sets `signal` exactly when the `timeout`/
    // `killSignal` above ended the fetch before it could return a status of its own — a killed process
    // carries "No verdict" (INV-0009), never a duration to eyeball. `fetched.status !== 0` alone covers
    // every ordinary refetch failure too (no remote configured, offline, a rejected credential, all
    // expected above) — this line fires only on the one case issue #591 needs to self-diagnose: the
    // fetch was actually killed by its own bound. An unkilled failure says nothing here; there was no
    // bound in play to have a finding about.
    if (fetched.signal != null) {
      process.stderr.write(`refetch ended by its own bound (signal ${fetched.signal}) — no verdict\n`);
    }
    return 'not-contained';
  }
  const fresh = containedAgainst(ref, 'FETCH_HEAD', cwd, writeTreeSupported);
  if (fresh === 'contained') return 'contained';
  if (fresh === 'inconclusive' && baseHistoryHasPatch(cwd, 'FETCH_HEAD', ref)) return 'contained';
  return 'not-contained';
}

// --- root: the run-root path resolver (ADR 0080) ------------------------------
//
// Every run root lives under the repository's main working tree, whatever checkout the command was
// invoked from: `git rev-parse --git-common-dir` names the shared git directory, and its parent is
// the main working tree. A submodule's shared git directory sits under the superproject's `.git/modules`,
// so its parent is no checkout; there the directory's own `core.worktree` names the checkout (`git
// worktree list` reports the git directory itself for a submodule, which is why it is not the source).
// This is what keeps a plan's scopetree, a slicetree, and the main checkout
// all naming the same run root for one scope. `verbInit` and `verbStatus` resolve their own run-root
// paths through this same function (review finding, ADR 0080) — building them from `cwd` directly, as
// `verbRoot` alone used to, is exactly the divergence that leaves a ledger `init` writes from inside a
// scopetree or slicetree invisible to a `root <slug>` call — or a `status` scan — made from the main
// working tree.
//
// Returns `null` rather than failing when `cwd` is not inside a git repository: `init` and `status`
// both tolerate that (a `status` scan of a plain, non-superdev directory reports "no runs found" rather
// than refusing), so they fall back to `cwd` itself on a `null`. `verbRoot` is the one caller that turns
// a `null` into a refusal — a bare path with no git repository behind it answers a question `root`'s one
// caller (`references/run-init.md`, `skills/plan/SKILL.md`) never asks outside a checkout.
//
// `opts.timeout` bounds each git spawn (a hook must not hang, INV-0009); a spawn killed at the bound
// carries no verdict and gives `null`.
function mainWorkTree(cwd, opts) {
  const commonDir = gitSpawn(['rev-parse', '--git-common-dir'], cwd, opts);
  if (commonDir.status !== 0) return null;
  const gitDir = path.resolve(cwd, commonDir.stdout.trim());
  const configured = gitSpawn(['config', '--file', path.join(gitDir, 'config'), '--get', 'core.worktree'], cwd, opts);
  // A spawn killed at its bound carries no verdict: no answer, never the parent-directory guess.
  if (configured.status === null) return null;
  return configured.status === 0 && configured.stdout.trim() ? path.resolve(gitDir, configured.stdout.trim()) : path.dirname(gitDir);
}

function scopesDirFor(cwd) {
  return path.join(mainWorkTree(cwd) || cwd, '.superdev', 'scopes');
}

// The main working tree joined with `.superdev/<area>/<slug>`, for a slug that cannot leave that area.
// Refuses outside a git repository rather than fall back to `cwd`, which would name a directory inside
// whatever checkout the caller happens to stand in.
function mainTreePath(cwd, verb, area, slug) {
  if (!slug) fail(`${verb} needs a <slug>`);
  if (slug.includes('/') || slug.includes('\\')) fail(`slug "${slug}" must not contain a path separator`);
  if (slug.startsWith('.')) fail(`slug "${slug}" must not start with "."`);
  const mwt = mainWorkTree(cwd);
  if (mwt === null) fail(`not inside a git repository (cwd: ${cwd})`);
  return path.join(mwt, '.superdev', area, slug);
}

function verbRoot(cwd, slug) {
  console.log(mainTreePath(cwd, 'root', 'scopes', slug));
}

// A scope's staging directory, where its staged knowledge-base pages wait for /superdev:publish-kb
// (ADR 0023, ADR 0119). `--count` prints the number of `.md` pages there instead, 0 for a missing
// directory: the same `.md`-only rule `stagedPageCounts` applies.
function verbStaging(cwd, args) {
  const count = args.includes('--count');
  const dir = mainTreePath(cwd, 'staging', 'kb-pending', args.filter((a) => a !== '--count')[0]);
  if (!count) {
    console.log(dir);
    return;
  }
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  console.log(String(entries.filter((f) => f.endsWith('.md')).length));
}

// --- run trace (ADR 0117, INV-0117) ------------------------------------------

// The run trace is `<run-root>/trace.log`, one event per line, space-separated:
//   <ISO-8601 UTC timestamp> <slice id|scope> <agent id|main> <kind> <kind fields...>
// `appendTrace` is its single writer. Kinds and their fields:
//   edit <test|impl> <path>
//   run <full|focused|whole|path> <pass|fail|unknown> <sha|unknown> <clean|dirty|unknown> [<files>]
//   revert <paths> / restore <paths>
//   note <test path>
//   dispatch <agent_type> <tool_use_id> <description> <session_id|-> / dispatch-bind <agent_type> <tool_use_id> <agent_id> /
//   dispatch-end <agent_type> <tool_use_id> <completed|failed|denied|stopped|unknown|session-end>   (an end with no outcome reads completed, ADR 0140)
//   dispatch-resume <tool_use_id> <agent_id> <session_id|-> <sendmessage_tool_use_id|->   (a SendMessage resumed the dispatch's subagent: a new run, with its own dispatch-end)
//   verdict <reviewer tool_use_id> <pass|fail|unknown> <approved|changes-needed|unknown> <cycle> <implementer tool_use_id|->   (ADR 0136; at most one per review in sequential delivery, and a reader takes the first per dispatch)
//   ledger <verb> <args>     (written only by the ledger-writing verbs of this CLI, after they succeed)
//   fail-to-pass <base>..<tip> <fail-to-pass|pass-to-pass|unknown> <reason>     (written only by `fail-to-pass`, which derives all three fields; no test run)
// Every field is escaped so none holds a control character or a line separator: no field can start
// a new line. No CLI verb takes a caller-chosen event; `trace` only reads.
function traceField(v) {
  // An absent or empty field renders `-`, so every line keeps its field positions.
  if (v === undefined || v === null || v === '') return '-';
  return String(v).replace(/[\\\x00-\x20\x7f\u0085\u2028\u2029]/g, (c) => {
    if (c === '\\') return '\\\\';
    if (c === ' ') return '\\x20';
    if (c === '\n') return '\\n';
    if (c === '\r') return '\\r';
    if (c === '\t') return '\\t';
    return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

// The exact inverse of `traceField`, for a reader that re-writes a field it read back (`-` stays `-`).
function untraceField(v) {
  return String(v).replace(/\\(x20|n|r|t|u[0-9a-f]{4}|\\)/g, (m, c) => {
    if (c === '\\') return '\\';
    if (c === 'x20') return ' ';
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    return String.fromCharCode(parseInt(c.slice(1), 16));
  });
}

// event: { slice?, agent?, kind, fields? }. One O_APPEND write per line, so concurrent writers never
// tear a line. A failed write is swallowed: the trace never blocks the work it records. Returns whether
// the line was written, for the one caller that tells its user (`scope.js test`).
function appendTrace(runRoot, event) {
  try {
    const parts = [new Date().toISOString(), event.slice || 'scope', event.agent || 'main', event.kind, ...(event.fields || [])];
    fs.appendFileSync(path.join(runRoot, 'trace.log'), parts.map(traceField).join(' ') + '\n', 'utf8');
    return true;
  } catch {
    // simplicity: silent by design (a recording failure must not fail a ledger verb); ceiling: a failed write loses that event; upgrade: add a stderr diagnostic if silent loss bites
    return false;
  }
}

// The trace's lines as events, oldest first: { ts, slice, agent, kind, fields }. Fields stay escaped
// (`untraceField` reverses one). The one reader of the line layout, shared by the hook and the verbs.
function readTrace(raw) {
  return raw.split('\n').filter(Boolean).map((l) => {
    const [ts, slice, agent, kind, ...fields] = l.split(' ');
    return { ts, slice, agent, kind, fields };
  });
}

function verbTrace(root, slice) {
  let raw = '';
  try {
    raw = fs.readFileSync(path.join(root, 'trace.log'), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  let lines = raw.split('\n').filter(Boolean);
  if (slice) lines = lines.filter((l) => readTrace(l)[0].slice === slice);
  console.log(lines.length ? lines.join('\n') : 'no trace: this run has recorded no events');
}

// --- test runner (ADR 0127, INV-0117) -----------------------------------------

// A word as the shell reads it back: left bare where it needs no quoting, so the hook's classifier reads it as typed.
const shellWord = (w) => (/^[\w@%+=:,./-]+$/.test(w) ? w : `'${w.replace(/'/g, "'\\''")}'`);
// A focused command template with every `{paths}` token replaced by the shell-quoted paths. A replacer function inserts
// its value literally, so a path holding a `$&`-style pattern stays a path.
const withPaths = (template, paths) => template.replace(/\{paths\}/g, () => paths.map(shellWord).join(' '));

// --- run supervision (ADR 0150, INV-0153) -------------------------------------------------------

// Ends a run: on POSIX its process group gets `signal`; on Windows `taskkill /pid <pid> /t /f` ends the process and every
// child it started. Platform and kill spawner are injectable so the suite runs either branch anywhere. A run that already
// exited is no error. This function runs in the watcher process too (as its source text), so it names nothing outside itself
// but `process` and `spawnSync`.
// simplicity: a process whose parent already exited is outside the taskkill tree, and one that changes its own process group
// escapes the POSIX group kill; upgrade: a Windows job object or a POSIX cgroup/subreaper if one bites.
function endRun(pid, { platform = process.platform, spawn = spawnSync, signal = 'SIGKILL' } = {}) {
  try {
    if (platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    else process.kill(-pid, signal);
  } catch { /* already gone */ }
}

// The watcher's body, run as `node -e` in a detached process with an IPC channel from the supervising verb. It starts each
// requested command as `sh -c` in a group of its own, so the command exists only once the watcher does and a verb killed
// first starts nothing. It reports `{code, signal}` or `{error}`, and sends nothing once the channel is closed. The closed
// channel is the one way a run ends when its verb goes: an interrupted verb closes it and exits, and any other death of the
// verb, SIGKILL included, closes it too. A command message the verb sent is read before the close, so the watcher knows
// every command it started. On the close it sends the running command's group the signal the argv names (`test` sends
// SIGTERM, so a runner that traps it finishes its cleanup; `fail-to-pass` sends SIGKILL), repeats that signal on the group
// once the leader is gone until the group is empty (at most 5 s), and removes the worktree the argv names (fail-to-pass).
function watchMain() {
  const cp = require('child_process');
  const [cwd, dir, signal] = process.argv.slice(1);
  let run = null;
  let last = null; // the pid (and group) of the last command started, kept after it exits while its group has members
  let dead = false;
  const finish = () => {
    if (dir) {
      const gone = cp.spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', cwd, 'worktree', 'remove', '--force', dir], { stdio: 'ignore' });
      if (gone.status !== 0) {
        require('fs').rmSync(dir, { recursive: true, force: true });
        cp.spawnSync('git', ['-C', cwd, 'worktree', 'prune'], { stdio: 'ignore' });
      }
    }
    process.exit(0);
  };
  // The callback takes the error of a write to a channel the verb closed before the watcher read the close, which would
  // otherwise crash the watcher before it ends the run.
  const send = (m) => { if (!dead) process.send(m, () => {}); };
  process.on('disconnect', () => {
    dead = true;
    if (!last) return finish();
    if (process.platform === 'win32') { if (run) endRun(last, { signal }); return finish(); }
    // A process the command forks while the signal goes out can join the group after the signal passed it, and a leader
    // that ends on the signal leaves it behind holding the caller's output. The leader may already be gone when the channel
    // closes (it exited on its own just before), so the last command's group decides, not `run`. Once the leader is gone
    // nothing is left to finish a cleanup, so the group gets the signal again until it is empty, for at most 5 s.
    const pid = last;
    endRun(pid, { signal });
    const until = Date.now() + 5000;
    const poll = setInterval(() => {
      let alive = true;
      try { process.kill(-pid, 0); } catch { alive = false; }
      if (alive && !run) endRun(pid, { signal });
      if (!alive || Date.now() > until) { clearInterval(poll); finish(); }
    }, 50);
  });
  process.on('message', (m) => {
    if (dead) return;
    if (m.end) { if (run) endRun(run.pid); return; }
    let child;
    try {
      child = cp.spawn('sh', ['-c', m.command], { cwd: m.cwd, stdio: 'inherit', detached: true, windowsHide: true });
    } catch (e) { return send({ error: e.code || e.message }); }
    run = child;
    last = child.pid;
    child.on('error', (e) => { run = null; send({ error: e.code || e.message }); });
    child.on('exit', (code, signal) => {
      // A sweep ends what the command left behind in its group, so nothing outlives a run whose worktree goes next.
      if (m.sweep) endRun(child.pid);
      run = null;
      // An empty group takes no late fork, and its id may name an unrelated group once the pid is reused, so nothing signals it later.
      try { process.kill(-child.pid, 0); } catch { if (last === child.pid) last = null; }
      send({ code, signal });
    });
  });
}

// Starts the watcher. `stdio` is the command's own three descriptors; `cleanup` is `{cwd, dir}` for a worktree to remove;
// `signal` is what the watcher sends the command's group when the verb dies.
// `run(command, cwd, sweep)` resolves `{code, signal}` or `{error}`. `detach()` closes the channel, which hands the running
// command to the watcher as a dead verb does; no run settles after it, and the promise it returns resolves once the watcher
// has exited, which is after it removed the worktree.
function superviseRuns(stdio, cleanup, signal) {
  const cp = require('child_process');
  const src = `const {spawnSync}=require('child_process');const endRun=${endRun};(${watchMain})()`;
  const watcher = cp.spawn(process.execPath, ['-e', src, ...(cleanup ? [cleanup.cwd, cleanup.dir] : ['', '']), signal], { stdio: [...stdio, 'ipc'], detached: true, windowsHide: true });
  watcher.on('error', () => {});
  let detached = false;
  const sup = {
    end: () => { try { watcher.send({ end: true }); } catch { /* the channel is closed */ } },
    stop: () => watcher.kill('SIGKILL'),
    detach: () => new Promise((resolve) => {
      detached = true;
      if (watcher.exitCode !== null || watcher.signalCode !== null) return resolve();
      watcher.once('exit', () => resolve());
      if (watcher.connected) watcher.disconnect();
    }),
    run: (command, cwd, sweep) => new Promise((resolve) => {
      const settle = (m) => { watcher.off('message', settle); watcher.off('exit', onExit); if (!detached) resolve(m); };
      const onExit = () => settle({ error: 'watcher-exited' });
      watcher.on('message', settle);
      watcher.on('exit', onExit);
      try { watcher.send({ command, cwd, sweep }); } catch { settle({ error: 'watcher-exited' }); }
    }),
  };
  return sup;
}

// `test full|whole`, `test focused [<path>…]`, `test -- <command>`: runs a test command under `sh`, streaming its output,
// and appends one `run` line carrying the command's own exit status (an Observed run). The run root, slice, commit, and
// tree state are read when the run starts; the line is written when the command finishes, `dirty` when HEAD moved, the tree
// was dirty at either end, or the trace recorded a change to the slice's files during the run. No option sets a field.
// A command ended by a signal, or a verb killed first, writes no line, and a verb that is killed or interrupted
// has its command's process group sent SIGTERM by the watcher, whatever ended the verb (`taskkill /t /f` on Windows), so a
// runner that ignores SIGTERM can outlive the verb.
// Outside every run tree, or for a command that cd's out of every run tree, the command runs and nothing is written. hooks/run-trace.js is required here, at call time, for the
// classifier it shares with the hook (it requires this file at load, so a top-level require would be a cycle).
// simplicity: a command that changes its own process group escapes the group kill; upgrade: a cgroup or subreaper if one bites.
function verbTest(cwd, args) {
  const rt = require('../hooks/run-trace.js');
  const free = args[0] === '--';
  let kind = args[0];
  let command;
  let files = [];
  let at = rt.locate(path.join(cwd, 'x'));
  let hidden = false; // the command's shape hides its status from the test
  let runCwd = cwd;
  // The tree a command classifies against outside every run tree: the repository's, else the cwd.
  const topOf = () => {
    const top = gitSpawn(['rev-parse', '--show-toplevel'], cwd);
    return top.status === 0 ? top.stdout.trim() : cwd;
  };
  if (free) {
    if (args.length < 2) fail('test --: needs a command');
    command = args.length === 2 ? args[1] : args.slice(1).map(shellWord).join(' ');
    let runs = rt.testRuns(command, cwd, at ? null : topOf());
    // From inside a run tree, a command that cd's out of every run tree classifies as it would outside one.
    if (at && !runs.length) runs = rt.testRuns(command, cwd, topOf());
    if (runs.length !== 1) fail(runs.length ? 'test --: the command holds more than one test run, run one per call' : `test --: not a test run, so nothing runs: ${command}`);
    // The classified run's own location decides, so a `cd` into a run tree records there from any cwd, and a `cd` out of
    // every run tree records nothing.
    if (runs[0].at.runRoot) {
      ({ kind, files, at } = runs[0]);
      hidden = runs[0].unknown || !runs[0].sole;
    } else at = null;
  } else {
    if (!['full', 'focused', 'whole'].includes(kind) || (kind !== 'focused' && args.length > 1)) fail(`test: unrecognized arguments (${usage().split('\n').find((l) => /^ {2}test /.test(l)).trim()})`);
    const paths = args.slice(1);
    if (kind === 'focused' && !paths.length) kind = 'full';
    const tree = at ? at.tree : topOf();
    runCwd = tree; // the template is read from the tree root, so it runs there
    const template = verificationCommands(tree, true)[kind];
    if (!template) fail(`test ${kind}: no ${kind} command is configured in docs/agents/verification.md`);
    command = kind === 'focused' ? withPaths(template, paths) : template;
  }
  const [sha, tree0] = at ? rt.treeState(at.tree) : [];
  // Where the trace ends now: a file change it records for this slice past this point happened during the run.
  const traceFile = at && path.join(at.runRoot, 'trace.log');
  let traceMark = 0;
  try { if (at) traceMark = fs.statSync(traceFile).size; } catch { /* no trace yet: from its start */ }
  // The watcher exists before the command does and starts it: when this process is interrupted or dies by any signal, even
  // SIGKILL, the watcher's channel closes and it ends the command's group (the process tree on Windows). A verb killed before
  // the watcher starts the command leaves nothing to end.
  const sup = superviseRuns(['inherit', 'inherit', 'inherit'], null, 'SIGTERM');
  // An interrupt ends the run the way a SIGKILL of the verb does: the closed channel makes the watcher end the command.
  const stop = (sig) => () => {
    sup.detach();
    process.exit(128 + require('os').constants.signals[sig]);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, stop(sig));
  sup.run(command, runCwd, false).then(({ code, signal, error }) => {
    sup.stop();
    if (error) {
      process.stderr.write(`test: cannot run sh: ${error}\n`);
      process.exit(127);
    }
    if (signal) {
      process.stderr.write(`test: the command ended by ${signal}; no run is recorded\n`);
      process.exit(128 + require('os').constants.signals[signal]);
    }
    if (at) {
      const [sha1, tree1] = rt.treeState(at.tree);
      // An edit, revert, or restore the trace recorded for this slice during the run changed the tree, even one undone
      // before the end. simplicity: a change no hook records (another process writing the tree) shows only at the two ends.
      let changed = false;
      try {
        changed = readTrace(fs.readFileSync(traceFile).subarray(traceMark).toString('utf8'))
          .some((e) => e.slice === at.slice && ['edit', 'revert', 'restore'].includes(e.kind));
      } catch { /* no trace: nothing recorded */ }
      // The commit and tree state the command ran against: a moved HEAD, a dirty tree at either end, or a recorded change
      // during the run is `dirty`.
      const tree = sha1 !== sha || tree0 === 'dirty' || tree1 === 'dirty' || changed ? 'dirty' : tree0 === 'unknown' || tree1 === 'unknown' ? 'unknown' : 'clean';
      const outcome = hidden ? 'unknown' : code === 0 ? 'pass' : 'fail';
      if (!appendTrace(at.runRoot, { slice: at.slice, kind: 'run', fields: [kind, outcome, sha, tree, files.join(',')] })) {
        process.stderr.write('test: the run line could not be written to the run trace\n');
      }
    }
    process.exit(code);
  });
}

// --- fail-to-pass run (ADR 0134, INV-0138, INV-0139) -------------------------------------------

// The floor of the bound on the run with the files put back (ADR 0142): 10 000 ms, or the positive whole number of
// milliseconds `SUPERDEV_FAIL_TO_PASS_FLOOR_MS` names. A value that is not a positive integer — empty, a word, zero,
// negative — reads as absent rather than as "kill immediately". That positive-integer rule is the one
// `SUPERDEV_PUBLISH_KB_TIMEOUT_MS` applies; the cap below is this override's own.
// A value above 2147483647 reads as absent too: Node's setTimeout fires a longer delay after 1 ms, which would kill
// the run at once under a bound it never ran under. A set value it rejects is named in one line on stderr, so the
// operator sees why the override took no effect; an unset or empty one says nothing. The verb reads the floor once.
const FAIL_TO_PASS_FLOOR_MS = 10000;
const MAX_TIMER_MS = 2147483647;

function failToPassFloorMs() {
  const raw = (process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS || '').trim();
  const n = /^\d+$/.test(raw) ? Number(raw) : 0;
  if (n > 0 && n <= MAX_TIMER_MS) return n;
  if (raw) process.stderr.write(`fail-to-pass: SUPERDEV_FAIL_TO_PASS_FLOOR_MS=${JSON.stringify(raw)} is not a whole number of milliseconds from 1 to ${MAX_TIMER_MS}; the floor stays ${FAIL_TO_PASS_FLOOR_MS} ms\n`);
  return FAIL_TO_PASS_FLOOR_MS;
}

// The domain shapes, named as CONTEXT.md names them. A **fail-to-pass run** is a performed test comparison over a
// commit range; its **outcome** is what the two runs showed, and the run trace carries it as a line of its own kind.
//
// @typedef {'fail-to-pass' | 'pass-to-pass' | 'unknown'} FailToPassOutcome
//   fail-to-pass: the tests passed against the changed code and failed with the range's other files put back.
//   pass-to-pass: they passed both times, so they do not discriminate what the range changed.
//   unknown:      the run could not judge (INV-0139): the tests did not pass against the changed code, or the run with the
//                 files put back outlasted its bound or ended by a signal (INV-0009), or a run's command could not start. No
//                 reviewer reads it as a verdict.
//
// @typedef {object} FailToPassRun
//   base, tip: the range's two full commits; `tip` is the commit the command and the test paths are read from.
//   command:   the one command string both runs use.
//   outcome:   FailToPassOutcome. reason: `control=<exit>,put-back=<exit>`, the two exit statuses and nothing else; for
//              `unknown`, `control=<exit or signal>` where the control did not pass, else
//              `control=0,put-back=<exit or signal>,bound=<ms>ms`, the bound ten times the control's duration or the floor,
//              whichever is larger (`failToPassFloorMs`; `SUPERDEV_FAIL_TO_PASS_FLOOR_MS` overrides the floor, ADR 0142).
//              A run whose command could not start reads `start-failed:<error code>` in place of its exit, and the second carries no bound.
//
// The trace line is `<ts> <slice|scope> main fail-to-pass <base>..<tip> <outcome> <reason>`. The slice is the one whose
// ledger row records exactly this range, else the one the run's directory attributes to, else `scope`.

// The id of the ledger row whose range cell names exactly `base..tip`, each side read as a commit (a row may carry
// abbreviated ones), or null.
function sliceOfRange(root, base, tip, cwd) {
  let lines;
  try { lines = splitLines(fs.readFileSync(ledgerPath(root), 'utf8')); } catch { return null; }
  for (const i of tableRowIndexes(lines)) {
    const cells = splitRow(lines[i]);
    const [lo, hi, ...more] = (cells[6] || '').split('..');
    if (lo && hi && !more.length && resolveCommit(lo, cwd) === base && resolveCommit(hi, cwd) === tip) return cells[0];
  }
  return null;
}

// A file's text at a commit: '' where the commit has no such file, null where git cannot say. The tip's own
// `docs/agents/verification.md` is read this way, never a working tree's. `rel` is a path from the tree root: `--full-tree`
// stops `ls-tree` resolving it against `cwd`, which can be any subdirectory of the checkout (`commit:rel` is root-relative already).
function fileAt(commit, rel, cwd) {
  const listed = gitSpawn(['ls-tree', '--full-tree', '--name-only', commit, '--', rel], cwd);
  if (listed.status !== 0) return null;
  if (!listed.stdout.trim()) return '';
  const shown = gitSpawn(['show', `${commit}:${rel}`], cwd);
  return shown.status === 0 ? shown.stdout : null;
}

// Makes `.superdev/` ignored for the repository whose main working tree is `main`, through the `info/exclude` of its common git
// dir, so no file of the checkout changes (`ensureSuperdevIgnored` writes the checkout's own `.gitignore`, which this verb never
// does). A repository that ignores it already, by any rule, is left alone.
function ignoreSuperdevLocally(main) {
  if (gitSpawn(['check-ignore', '-q', '--', '.superdev/x'], main).status !== 1) return;
  const common = gitSpawn(['rev-parse', '--git-common-dir'], main);
  if (common.status !== 0) return;
  const file = path.join(path.resolve(main, common.stdout.trim()), 'info', 'exclude');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* no exclude file yet */ }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, (text && !text.endsWith('\n') ? '\n' : '') + '.superdev/\n');
}

// `fail-to-pass <base>..<tip>`: the tests the range selects run in a throwaway worktree at the tip, then again with the
// files the range changed outside its test files put back as they stood at the base. Exit 0: an outcome was read and
// printed (`unknown` included); inside a run root its line is appended (a failed append is reported on stderr, the status
// stays 0), outside one no line exists. Exit 1: a refusal or an error (git could not create the worktree, clear what the
// first run left, or put the files back), message on stderr. Exit 2: no outcome and no line, because no test command is
// configured (nothing ran). An interrupt exits 128 plus the signal number.
async function verbFailToPass(cwd, args) {
  if (args.length !== 1) fail('fail-to-pass needs one <base>..<tip> range');
  const [baseRef, tipRef, ...extra] = args[0].split('..');
  if (!baseRef || !tipRef || extra.length) fail(`fail-to-pass: "${args[0]}" is not a <base>..<tip> range`);
  const base = resolveCommit(baseRef, cwd);
  if (!base) fail(`fail-to-pass: "${baseRef}" does not resolve to a commit`);
  const tip = resolveCommit(tipRef, cwd);
  if (!tip) fail(`fail-to-pass: "${tipRef}" does not resolve to a commit`);
  if (gitSpawn(['merge-base', '--is-ancestor', base, tip], cwd).status !== 0) fail(`fail-to-pass: "${baseRef}" is not an ancestor of "${tipRef}"`);
  // `diff.relative=false`: the listing is the whole range from the tree root, whatever the operator's config and cwd say.
  const diff = gitSpawn(['-c', 'diff.relative=false', 'diff', '--name-status', '--no-renames', '-z', base, tip], cwd, { maxBuffer: PROBE_MAX_BUFFER });
  if (diff.status !== 0) fail('fail-to-pass: git could not list the paths the range changes');
  const tokens = diff.stdout.split('\0').filter(Boolean);
  const changed = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) changed.push({ status: tokens[i], path: tokens[i + 1] });
  if (!changed.length) fail(`fail-to-pass: the range is empty: ${baseRef}..${tipRef} changes no file`);
  const config = fileAt(tip, 'docs/agents/verification.md', cwd);
  if (config === null) fail("fail-to-pass: git could not read the tip's verification configuration");
  const putBackChanges = changed.filter((c) => !isTestPath(config, c.path));
  if (!putBackChanges.length) fail('fail-to-pass: the range changes only test files, so nothing is put back');
  // references/test-selection.md: the focused command over the whole changed-path set where it carries `{paths}`, and the
  // full command for a fixed-subset or self-detecting focused command or where only the full command exists.
  const commands = verificationCommandsOf(config, true);
  const command = commands.focused && commands.focused.includes('{paths}')
    ? withPaths(commands.focused, changed.map((c) => c.path))
    : commands.full;
  if (!command) {
    process.stderr.write(`fail-to-pass: no test command is configured in docs/agents/verification.md at ${tipRef}; nothing ran\n`);
    process.exitCode = 2;
    return;
  }
  // The worktree sits beside `slicetrees/` in the run root, outside every tree the run trace attributes a run to, so its test
  // runs record no `run` line. Module resolution walks up from there to the main checkout's own `node_modules`, as it does
  // from the scope's own worktrees (the setup probe's placement). Outside a run root it sits under `.superdev/`, and no line
  // is written, `.superdev/` is git-ignored first through the repository's `info/exclude` (no file of the checkout changes), and
  // a `.superdev/` this call created is removed at exit. `mkdtemp` makes the directory unique to this invocation, so parallel runs never share one.
  const at = require('../hooks/run-trace.js').locate(path.join(cwd, 'x'));
  const main = at ? null : mainWorkTree(cwd) || cwd;
  const home = at ? at.runRoot : path.join(main, '.superdev');
  const madeHome = !at && !fs.existsSync(home);
  if (main) ignoreSuperdevLocally(main);
  fs.mkdirSync(home, { recursive: true });
  const dir = fs.mkdtempSync(path.join(home, 'fail-to-pass-'));
  // No git hook runs, whoever configured one: `core.hooksPath` names no directory for every git call below.
  const noHooks = ['-c', 'core.hooksPath=/dev/null'];
  // The worktree outlives no exit. The watcher holds a channel from this process and takes over when it closes, on an
  // interrupt or a kill past the signal handlers: it ends the running command's group (the process tree on Windows), then
  // removes the worktree.
  const sup = superviseRuns(['ignore', 2, 2], { cwd, dir }, 'SIGKILL');
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    sup.stop();
    const gone = spawnSync('git', [...noHooks, 'worktree', 'remove', '--force', dir], { cwd, stdio: 'ignore' });
    if (gone.status !== 0) {
      fs.rmSync(dir, { recursive: true, force: true });
      spawnSync('git', ['worktree', 'prune'], { cwd, stdio: 'ignore' });
    }
    // `rmdir` takes an empty directory only, so a `.superdev/` that holds anything else stays.
    if (madeHome) try { fs.rmdirSync(home); } catch { /* not empty, or already gone */ }
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    // The watcher ends the run as it does for a SIGKILLed verb, with SIGKILL, not SIGTERM: a runner that traps SIGTERM keeps
    // running and may write into the worktree. The verb exits once the watcher has ended the group and removed the worktree.
    process.on(sig, () => sup.detach().then(() => process.exit(128 + require('os').constants.signals[sig])));
  }
  process.on('exit', cleanup);
  // `--literal-pathspecs`: a changed path named `*.cfg` is that file, and never a glob over the test files it would also match.
  const git = (gitArgs, input) => spawnSync('git', [...noHooks, '--literal-pathspecs', ...gitArgs], { cwd: dir, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const step = (what, gitArgs, input) => { const r = git(gitArgs, input); if (r.status !== 0) fail(`fail-to-pass: git could not ${what}: ${r.stderr.trim()}`); };
  // The command runs in its own process group, which an interrupt ends with it. `limitMs`, where given, bounds the run: its
  // group is killed when the bound expires, and `expired` says so. The result carries the run's own duration in `ms`. A
  // command that cannot start (E2BIG on a long `{paths}` list, which spawn throws, or an error it emits) resolves with
  // `startError`, its error code, and no exit.
  const exec = async (limitMs) => {
    const started = performance.now();
    let expired = false;
    const timer = limitMs === undefined ? null : setTimeout(() => { expired = true; sup.end(); }, limitMs);
    // The sweep ends the group with its shell on every exit: one a signal ended, and one that exited and left a background
    // process. Nothing the run started outlives it, so nothing writes into the worktree the next step resets or the exit
    // handler removes.
    const { code, signal, error } = await sup.run(command, dir, true);
    clearTimeout(timer);
    if (error) return { startError: error };
    return { code, signal, expired, ms: performance.now() - started };
  };
  try {
    const added = spawnSync('git', [...noHooks, 'worktree', 'add', '-q', '--detach', dir, tip], { cwd, encoding: 'utf8' });
    if (added.status !== 0) fail(`fail-to-pass: git could not create the worktree: ${added.stderr.trim()}`);
    // Only a control that passed gives the second run a meaning (INV-0139); a control that did not pass records `unknown`,
    // and the second run never starts.
    const control = await exec();
    const status = (run) => (run.startError ? `start-failed:${run.startError}` : run.signal || run.code);
    const record = (outcome, reason) => {
      // The scope run's first `unknown` is an observation (references/scope-mode.md's `## Observations`), and the run root's
      // own trace says whether an earlier one exists, so the caller counts nothing. simplicity: two `unknown` outcomes
      // written in the same instant both read no earlier one and both say so; capture reads before it writes, so a
      // duplicate record is the worst case.
      const seenUnknown = () => {
        try { return readTrace(fs.readFileSync(path.join(at.runRoot, 'trace.log'), 'utf8')).some((e) => e.kind === 'fail-to-pass' && e.fields[1] === 'unknown'); } catch { return false; }
      };
      if (at && outcome === 'unknown' && !seenUnknown()) process.stderr.write("fail-to-pass: the scope run's first unknown outcome: capture an observation naming the environment gap (references/scope-mode.md, `## Observations`)\n");
      if (at && !appendTrace(at.runRoot, { slice: sliceOfRange(at.runRoot, base, tip, cwd) || at.slice, kind: 'fail-to-pass', fields: [`${base}..${tip}`, outcome, reason] })) {
        process.stderr.write('fail-to-pass: the outcome line could not be written to the run trace\n');
      }
      console.log(`${outcome} ${reason}`);
    };
    if (control.code !== 0) return record('unknown', `control=${status(control)}`);
    // The second run sees the base's files outside the test paths, the tip's test files, and nothing the control run left:
    // a tracked file it changed (`reset --hard` to the tip), an untracked or ignored one it wrote (`dist/`, `target/classes`, a
    // copy under an ignored `build/`; `clean -ffdx` takes every such path, a nested repository included). Dependencies resolve
    // from outside this worktree, so the clean leaves them alone.
    step('clear what the first run left', ['reset', '-q', '--hard', tip]);
    step('clear what the first run left', ['clean', '-ffdxq']);
    // The range's added paths are removed first, and the rest come back from the base. Restoring a path the base held as a file
    // where the tip has a directory (or the reverse) already drops the paths beneath it from the index, so a pathspec for an
    // added one, named afterwards, matches nothing and git refuses.
    const addedPaths = putBackChanges.filter((c) => c.status === 'A').map((c) => c.path);
    if (addedPaths.length) step('put the files back', ['rm', '-q', '-r', '--pathspec-from-file=-', '--pathspec-file-nul'], addedPaths.join('\0'));
    const restPaths = putBackChanges.filter((c) => c.status !== 'A').map((c) => c.path);
    if (restPaths.length) step('put the files back', ['restore', '--source=' + base, '--staged', '--worktree', '--pathspec-from-file=-', '--pathspec-file-nul'], restPaths.join('\0'));
    // The put-back is committed on the worktree's detached HEAD, so the second run, like the control, sees a tree that
    // matches its HEAD: a command that checks for a clean tree first reads the tests' own verdict. Identity and signing come
    // from `-c`, so an environment with no identity, or one that signs every commit, still commits; `noHooks` runs no hook.
    // `maintenance.auto` and `gc.auto` start no automatic maintenance, which would detach in the shared object store and
    // outlive the verb, its cwd in the worktree the exit handler removes.
    step('put the files back', ['-c', 'user.name=superdev', '-c', 'user.email=superdev@localhost', '-c', 'commit.gpgsign=false', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', 'commit', '-q', '-m', 'fail-to-pass put-back']);
    // Code missing the feature can hang, so the second run is bounded at ten times the duration the control took in this
    // invocation, or the floor, whichever is larger: a millisecond control would otherwise give a bound shorter than the
    // delays a loaded machine adds (ADR 0142).
    const bound = Math.max(Math.ceil(control.ms * 10), failToPassFloorMs());
    const putBack = await exec(bound);
    // A run whose bound expired, or that a signal ended, carries no verdict whether or not the kill landed (INV-0009).
    if (putBack.startError) return record('unknown', `control=0,put-back=${status(putBack)}`);
    if (putBack.expired || putBack.signal) return record('unknown', `control=0,put-back=${status(putBack)},bound=${bound}ms`);
    record(putBack.code === 0 ? 'pass-to-pass' : 'fail-to-pass', `control=${control.code},put-back=${putBack.code}`);
  } finally {
    cleanup();
  }
}

// --- collisions: a numbering collision found by number (ADR 0126, INV-0134) ---------------------
//
// An ADR number, in one `docs/adr` directory, or an invariant id in `docs/invariants.md`, that the
// branch added since `rangeBase` (a file renamed into the number counts as added) and that `base`
// already holds under another path, unless base kept that path from `rangeBase` and the branch no
// longer holds it (the scope's slug-only rename, or its replacement of the ADR, is none; a file base
// renamed or added is a different ADR, so both sides renaming one ADR to two paths collides), or, for
// an invariant, with other entry text. Two files with one
// number and different slugs never conflict in git, so only comparing numbers finds them. Reads git
// only and writes nothing. Each collision gets its own next free number, above every number its home
// carries on `base`, on `branch`, and on every `also` ref (other live plan runs).

const ADR_FILE_RE = /^(\d{4})-[^/]*\.md$/;
const INV_HEADING_RE = /^###\s+INV-(\d{4})\s*$/gm;
const REGISTER = 'docs/invariants.md';

function collisionRefusal(msg) {
  const err = new Error(msg);
  err.isRefusal = true;
  err.exitCode = 2;
  return err;
}

// Every ADR file in `ref`, as { home, number, file }: a file named NNNN-*.md directly inside a
// directory whose path is `docs/adr` or ends in `/docs/adr`.
function adrFiles(ref, cwd) {
  const r = gitSpawn(['ls-tree', '-r', '-z', '--name-only', '--end-of-options', ref], cwd);
  if (r.status !== 0) throw collisionRefusal(`collisions: cannot list the tree of "${ref}"`);
  const out = [];
  for (const file of r.stdout.split('\0')) {
    const home = path.posix.dirname(file);
    const m = path.posix.basename(file).match(ADR_FILE_RE);
    if (m && (home === 'docs/adr' || home.endsWith('/docs/adr'))) out.push({ home, number: m[1], file });
  }
  return out;
}

// The invariant entries `ref`'s register carries, id → entry text (its heading up to the next
// heading); an absent register carries none.
function registerEntries(ref, cwd) {
  const r = gitSpawn(['show', '--end-of-options', `${ref}:${REGISTER}`], cwd);
  const entries = new Map();
  if (r.status !== 0) return entries;
  for (const m of r.stdout.matchAll(INV_HEADING_RE)) {
    const rest = r.stdout.slice(m.index + m[0].length);
    const end = rest.search(/^#/m);
    entries.set(m[1], (end < 0 ? rest : rest.slice(0, end)).trim());
  }
  return entries;
}

function findCollisions(cwd, { base, branch, rangeBase, also = [] }) {
  for (const ref of [base, branch, rangeBase, ...also]) {
    if (!refResolves(ref, cwd)) throw collisionRefusal(`collisions: "${ref}" resolves to no commit`);
  }
  // Every ADR path the branch added since rangeBase; a file renamed into a number counts as added.
  // The pathspecs keep the diff to ADR files, so a large base diff costs nothing here.
  const r = gitSpawn(['diff', '-z', '--name-only', '--no-renames', '--diff-filter=A', '--end-of-options', rangeBase, branch, '--', ':(glob)docs/adr/*.md', ':(glob)**/docs/adr/*.md'], cwd);
  if (r.status !== 0) throw collisionRefusal(`collisions: cannot diff "${rangeBase}" against "${branch}"`);
  const addedSet = new Set(r.stdout.split('\0').filter(Boolean));
  // A base file at a path rangeBase already held is one base kept: when the branch no longer holds
  // that path, the scope deleted or renamed it, and after the merge only the scope's file holds the
  // number, so it is no partner. Every other base file at the number is a different ADR.
  const rangeBasePaths = new Set(adrFiles(rangeBase, cwd).map((a) => a.file));
  const branchAdrs = adrFiles(branch, cwd);
  const branchPaths = new Set(branchAdrs.map((a) => a.file));
  const replaced = (theirs) => rangeBasePaths.has(theirs.file) && !branchPaths.has(theirs.file);
  const baseAdrs = adrFiles(base, cwd);
  const everyAdr = [baseAdrs, branchAdrs, ...also.map((ref) => adrFiles(ref, cwd))].flat();
  const highest = new Map();
  for (const a of everyAdr) highest.set(a.home, Math.max(highest.get(a.home) || 0, Number(a.number)));
  const pad = (n) => String(n).padStart(4, '0');
  const found = [];
  for (const mine of branchAdrs.filter((a) => addedSet.has(a.file))) {
    const theirs = baseAdrs.find((a) => a.home === mine.home && a.number === mine.number && a.file !== mine.file && !replaced(a));
    if (!theirs) continue;
    const next = highest.get(mine.home) + 1;
    highest.set(mine.home, next);
    found.push({ kind: 'adr', home: mine.home, number: mine.number, scopePath: mine.file, basePath: theirs.file, next: pad(next) });
  }
  const baseEntries = registerEntries(base, cwd);
  const before = registerEntries(rangeBase, cwd);
  const branchEntries = registerEntries(branch, cwd);
  const alsoIds = also.flatMap((ref) => [...registerEntries(ref, cwd).keys()]);
  let top = Math.max(0, ...[...baseEntries.keys(), ...branchEntries.keys(), ...alsoIds].map(Number));
  // An entry identical on both sides is one taken in from base, the invariant analogue of the same path.
  const collides = ([id, text]) => !before.has(id) && baseEntries.has(id) && baseEntries.get(id) !== text;
  for (const entry of branchEntries) {
    if (!collides(entry)) continue;
    const [id] = entry;
    top += 1;
    found.push({ kind: 'inv', home: REGISTER, number: `INV-${id}`, scopePath: REGISTER, basePath: REGISTER, next: `INV-${pad(top)}` });
  }
  return found;
}

function verbCollisions(cwd, args) {
  const flags = { '--base': 'base', '--branch': 'branch', '--range-base': 'rangeBase' };
  const opts = { also: [] };
  for (let i = 0; i < args.length; ) {
    const flag = args[i];
    if (flag !== '--also' && !flags[flag]) { i++; continue; }
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw collisionRefusal(`collisions: ${flag} needs a value`);
    const value = args.splice(i, 2)[1];
    if (flag !== '--also' && opts[flags[flag]]) throw collisionRefusal(`collisions: ${flag} given twice`);
    if (flag === '--also') opts.also.push(value);
    else opts[flags[flag]] = value;
  }
  const missing = Object.keys(flags).find((f) => !opts[flags[f]]);
  if (missing) throw collisionRefusal(`collisions needs ${missing} <ref>`);
  if (args.length) throw collisionRefusal(`collisions: unrecognized argument "${args[0]}"`);
  const found = findCollisions(cwd, opts);
  for (const c of found) console.log([c.kind, c.home, c.number, c.scopePath, c.basePath, 'next', c.next].join(' '));
  if (found.length) process.exitCode = 1;
}

// --- citations: a citation of an old number that a renumber missed (ADR 0150, INV-0134) --------
//
// After the base step renumbers a colliding number, no line the branch added since `rangeBase` may
// still cite the old one. This reads the added lines of `rangeBase..branch` from committed history and
// reports each that cites an old id as `ADR NNNN`, `INV-NNNN`, or a link to `NNNN-<slug>.md`, matched
// on whole numbers. Bare numbers in plural prose ("ADRs 0126 and 0131") are no citation. The diff is
// asked for by command-line flags that override the repository's diff configuration (`diff.relative`,
// `diff.noprefix`, `diff.mnemonicPrefix`, `diff.external`, `diff.interHunkContext`, `color.diff`, a
// textconv driver, a `-diff` attribute made text by `--text`), so the
// parse reads one fixed format from any subdirectory.

const CITATION_ID_RE = /^(?:\d{4}|INV-\d{4})$/;

// A `+++` path, prefix included, as git prints it: raw, with a trailing tab when the path holds a
// space, or C-quoted whole.
function diffPath(raw) {
  if (!raw.startsWith('"')) return raw.replace(/\t$/, '');
  const esc = { n: '\n', t: '\t', '"': '"', '\\': '\\' };
  const bytes = [];
  const body = raw.slice(1, raw.lastIndexOf('"'));
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== '\\') { bytes.push(...Buffer.from(c)); continue; }
    const oct = body.slice(i + 1, i + 4).match(/^[0-7]{3}/);
    if (oct) { bytes.push(parseInt(oct[0], 8)); i += 3; } else bytes.push(...Buffer.from(esc[body[++i]] ?? body[i]));
  }
  return Buffer.from(bytes).toString('utf8');
}

function citationPattern(id) {
  const num = id.replace('INV-', '');
  return id.startsWith('INV-') ? new RegExp(`\\bINV-${num}(?!\\d)`) : new RegExp(`\\bADR\\s+${num}(?!\\d)|(?<!\\d)${num}-[^\\s/)]*\\.md`);
}

function findCitations(cwd, { rangeBase, branch, ids }) {
  for (const ref of [rangeBase, branch]) {
    if (!refResolves(ref, cwd)) throw collisionRefusal(`citations: "${ref}" resolves to no commit`);
  }
  const patterns = ids.map((id) => [id, citationPattern(id)]);
  const r = gitSpawn(
    ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-relative', '--submodule=short', '-M', '-U0', '--inter-hunk-context=0', '--text',
      '--src-prefix=a/', '--dst-prefix=b/', '--end-of-options', rangeBase, branch],
    cwd,
    { maxBuffer: 1 << 30 }
  );
  if (r.status !== 0) throw collisionRefusal(`citations: cannot diff "${rangeBase}" against "${branch}"`);
  const found = [];
  let file = null;
  let oldLeft = 0;
  let newLeft = 0;
  let line = 0;
  for (const text of r.stdout.split('\n')) {
    if (oldLeft > 0 || newLeft > 0) {
      // Inside a hunk the counts say which lines are content, so an added line that starts `++ ` is no header.
      if (text.startsWith('+')) {
        newLeft--;
        for (const [id, re] of patterns) if (re.test(text.slice(1))) found.push(`${file}:${line} ${id}`);
        line++;
      } else if (text.startsWith('-')) oldLeft--;
      else if (text.startsWith(' ')) { oldLeft--; newLeft--; line++; }
      continue;
    }
    if (text.startsWith('+++ ')) file = text.startsWith('+++ /dev/null') ? null : diffPath(text.slice(4)).slice(2);
    const h = text.match(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (h && file !== null) {
      oldLeft = h[1] === undefined ? 1 : Number(h[1]);
      newLeft = h[3] === undefined ? 1 : Number(h[3]);
      line = Number(h[2]);
    }
  }
  return found;
}

function verbCitations(cwd, args) {
  const flags = { '--range-base': 'rangeBase', '--branch': 'branch' };
  const opts = {};
  for (let i = 0; i < args.length; ) {
    const flag = args[i];
    if (!flags[flag]) { i++; continue; }
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw collisionRefusal(`citations: ${flag} needs a value`);
    const value = args.splice(i, 2)[1];
    if (opts[flags[flag]]) throw collisionRefusal(`citations: ${flag} given twice`);
    opts[flags[flag]] = value;
  }
  const missing = Object.keys(flags).find((f) => !opts[flags[f]]);
  if (missing) throw collisionRefusal(`citations needs ${missing} <ref>`);
  const unknown = args.find((a) => a.startsWith('--'));
  if (unknown) throw collisionRefusal(`citations: unrecognized flag "${unknown}"`);
  const ids = args;
  if (!ids.length) throw collisionRefusal('citations needs at least one <id>');
  const bad = ids.find((id) => !CITATION_ID_RE.test(id));
  if (bad) throw collisionRefusal(`citations: "${bad}" is no id: use a four-digit ADR number or INV-NNNN`);
  const found = findCitations(cwd, { ...opts, ids: [...new Set(ids)] });
  if (found.length) {
    console.log(found.join('\n'));
    process.exitCode = 1;
  }
}

// --- CLI ---------------------------------------------------------------------

function usage() {
  return [
    'usage: node scope.js <verb> …   (ledger CLI — the only ledger.md write path)',
    '  --help, -h                         this text, with any verb; reads no stdin',
    '  init <type>/<slug> <stage>          stage is planned|implementing (ADR 0079, no default) —',
    '                                      stdin: {"anchor":"…","slices":[{id,issue,title,type,…}]}',
    '  stage set <value> --root <run-root>',
    '  step set plan|implement|review|document|submit|ship|verify-ship|wrap-up   --root <run-root>   the step a command has started, traced on every call; a stage set clears it',
    '  step clear   --root <run-root>',
    '  step block   --root <run-root>   a stop with the step standing: traced as `step block <step>`, the ledger unchanged; nothing when no step stands',
    '  slice <id> <status> [--range <r>]   --root <run-root>',
    '  degraded add|add-denial|reset-denials <text>   --root <run-root>',
    '  unresolved add <text>|clear   --root <run-root>',
    '  deferred add <text>   --root <run-root>',
    '  deferred resolve <text>   --root <run-root>',
    '  docs set <value>|clear   --root <run-root>',
    '  pr set <n>|clear   --root <run-root>          <n> is a pull-request number, "#" optional',
    '  deploy set <target> pending|deployed|failed [--exit <n>]   --root <run-root>',
    '  deploy get   --root <run-root>      one line per recorded target, first-recorded order, or "absent"',
    '  suite set <green|red|denied|none> <sha> [--whole]   --root <run-root>',
    '  suite reusable --branch <b> [--whole]   --root <run-root>   exits 0 (reusable) or 1',
    '  base set <sha>   --root <run-root>   records the merged base tip',
    '  base resolve --branch <b> --base <base-ref>   --root <run-root>   prints the scope\'s range base',
    '  get stage|step|branch|anchor|docs|pr|slices|unresolved|degraded|deferred|denials|suite --root <run-root>',
    '  trace [--slice <id>] --root <run-root>   prints the run trace, oldest first (read-only)',
    '  test full|whole                    runs the configured command, records the run line the command\'s own exit status makes',
    '  test focused [<path>…]             {paths} takes the paths; none runs the full command, recorded full',
    '  test -- <command>                  runs a command the run trace classes as a test run, recorded as a direct run is',
    '  fail-to-pass <base>..<tip>         runs the range\'s tests twice in a throwaway worktree at <tip>, the second time with the',
    '                                     files it changed outside its test files put back as at <base>; prints the outcome',
    '                                     (fail-to-pass|pass-to-pass|unknown) on stdout and the command output on stderr, and inside',
    '                                     a run root appends the outcome as its own trace line, never a test run; the second run is',
    '                                     bounded at ten times the first run\'s duration or a floor of 10000 ms',
    '                                     (SUPERDEV_FAIL_TO_PASS_FLOOR_MS overrides the floor), and `unknown` (the first run did not pass,',
    '                                     or the second outlasted its bound or was ended by a signal, or a run could not start)',
    '                                     names its reason;',
    '                                     exits 0 (an outcome was read and printed; a failed trace append is reported on stderr),',
    '                                     1 (a refusal or an error, message on stderr, no outcome), 2 (no outcome: no test command',
    '                                     is configured so nothing ran), or 128 plus the signal number (interrupted)',
    '  status                             scans <cwd>/.superdev/scopes/*/',
    '  publish --root <run-root>          prints the ledger as one "## Run state" section on stdout',
    '  adopt [--shipped] --root <run-root>   stdin: a whole anchor body; extracts and writes the section;',
    '                                     --shipped adopts a "shipped" payload, and refuses every other stage',
    '  collisions --base <ref> --branch <ref> --range-base <ref> [--also <ref> …]',
    '                                     one line per numbering collision; exits 0 (none), 1 (found), 2 (error)',
    '  citations --range-base <ref> --branch <ref> <id>…',
    '                                     one <path>:<line> <id> line per line the range adds that cites an old number',
    '                                     (<id>: a four-digit ADR number or INV-NNNN); exits 0 (none), 1 (found), 2 (error)',
    '  root <slug>                        prints <main-worktree>/.superdev/scopes/<slug>, resolved via git',
    '  staging <scope> [--count]          prints <main-worktree>/.superdev/kb-pending/<scope>, or its .md count',
    '  dod-line --match <text>|--match-file <path> --verdict met|not-met|ceiling|accepted',
    '            --note <text>|--note-file <path> [--line]',
    '                                     stdin: a body (default) or one checklist line (--line);',
    '                                     stdout: the same, with the matching line judged',
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
  // Set by a ledger-writing verb once its write succeeded; a refused verb throws before it is set.
  let ledgerEvent = null;
  switch (verb) {
    case 'init':
      if (!args[0]) fail('init needs a <type>/<slug> label');
      ledgerEvent = { root: verbInit(cwd, args[0], args[1], stdinJson), fields: ['init', args[0], args[1]] };
      break;
    case 'stage': {
      const root = takeRoot(args);
      verbStage(root, args[0], args[1]);
      ledgerEvent = { root, fields: ['stage', args[0], args[1]] };
      break;
    }
    case 'step': {
      const root = takeRoot(args);
      const changed = verbStep(root, args[0], args[1]);
      // `block` names the standing step, which the ledger holds.
      if (changed) ledgerEvent = { root, fields: ['step', args[0], ...(args[0] === 'block' ? [getHeader(readLines(root), 'Step')] : args[1] ? [args[1]] : [])] };
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
      ledgerEvent = { root, slice: args[0], fields: ['slice', args[0], args[1], ...(range ? [range] : [])] };
      break;
    }
    case 'degraded': {
      const root = takeRoot(args);
      const sub = args[0];
      verbDegraded(root, sub, resolveBulletText(sub, args.slice(1), stdinJson));
      ledgerEvent = { root, fields: ['degraded', sub] }; // bullet text is free text and stays out of the trace
      break;
    }
    case 'unresolved': {
      const root = takeRoot(args);
      const sub = args[0];
      const changed = verbUnresolved(root, sub, resolveBulletText(sub, args.slice(1), stdinJson));
      if (changed) ledgerEvent = { root, fields: ['unresolved', sub] }; // bullet text is free text and stays out of the trace
      break;
    }
    case 'deferred': {
      const root = takeRoot(args);
      const sub = args[0];
      verbDeferred(root, sub, resolveBulletText(sub, args.slice(1), stdinJson));
      ledgerEvent = { root, fields: ['deferred', sub] }; // bullet text is free text and stays out of the trace
      break;
    }
    case 'docs': {
      const root = takeRoot(args);
      const changed = verbDocs(root, args[0], args[1]);
      if (changed) ledgerEvent = { root, fields: ['docs', args[0], ...(args[1] ? [args[1]] : [])] };
      break;
    }
    case 'pr': {
      const root = takeRoot(args);
      const changed = verbPr(root, args[0], args[1]);
      if (changed) ledgerEvent = { root, fields: ['pr', args[0], ...(args[1] ? [args[1]] : [])] };
      break;
    }
    case 'deploy': {
      const root = takeRoot(args);
      const sub = args[0];
      if (sub === 'get') {
        verbDeployGet(root);
        break;
      }
      if (sub !== 'set') fail(`unknown deploy subcommand "${sub}" — use set|get`);
      let exitCode;
      const ei = args.indexOf('--exit');
      if (ei >= 0) {
        exitCode = args[ei + 1];
        if (exitCode === undefined) fail('--exit needs a value');
        args.splice(ei, 2);
      }
      verbDeploySet(root, args[1], args[2], exitCode);
      ledgerEvent = { root, fields: ['deploy', 'set', args[1], args[2], ...(exitCode !== undefined ? ['--exit', exitCode] : [])] };
      break;
    }
    case 'suite': {
      const root = takeRoot(args);
      let whole = false;
      const wi = args.indexOf('--whole');
      if (wi >= 0) {
        whole = true;
        args.splice(wi, 1);
      }
      if (args[0] === 'reusable') {
        let branch;
        const bi = args.indexOf('--branch');
        if (bi >= 0) {
          branch = args[bi + 1];
          if (!branch) fail('--branch needs a value');
          args.splice(bi, 2);
        }
        if (!branch) fail('suite reusable needs --branch <branch>');
        // Everything but the leading `reusable` must already be stripped — an unrecognized flag (a
        // mistyped `--whole`) left over here would silently drop the whole-repo gate instead of
        // refusing it, and a no-kind record would then pass a `--whole` check it must fail (INV-0017).
        if (args.length > 1) fail(`suite reusable: unrecognized argument "${args[1]}"`);
        verbSuiteReusable(cwd, root, branch, whole);
        break;
      }
      // `set <result> <sha>` is the whole shape — an unrecognized fourth token (a mistyped `--whole`,
      // or `--kind whole`) must refuse rather than silently write a no-kind record.
      if (args.length > 3) fail(`suite ${args[0]}: unrecognized argument "${args[3]}"`);
      verbSuite(cwd, root, args[0], args[1], args[2], whole);
      ledgerEvent = { root, fields: ['suite', args[0], args[1], args[2], ...(whole ? ['--whole'] : [])] };
      break;
    }
    case 'base': {
      const root = takeRoot(args);
      const take = (flag) => {
        const i = args.indexOf(flag);
        if (i < 0) return undefined;
        const v = args[i + 1];
        if (!v) fail(`${flag} needs a value`);
        args.splice(i, 2);
        return v;
      };
      if (args[0] === 'resolve') {
        const branch = take('--branch');
        const base = take('--base');
        if (!branch) fail('base resolve needs --branch <branch>');
        if (!base) fail('base resolve needs --base <base-ref>');
        if (args.length > 1) fail(`base resolve: unrecognized argument "${args[1]}"`);
        verbBaseResolve(cwd, root, branch, base);
        break;
      }
      if (args[0] !== 'set') fail(`unknown base subcommand "${args[0]}" — use set|resolve`);
      if (args.length > 2) fail(`base set: unrecognized argument "${args[2]}"`);
      verbBaseSet(cwd, root, args[1]);
      ledgerEvent = { root, fields: ['base', 'set', args[1]] };
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
      verbAdopt(root, stdinJson, args.includes('--shipped'));
      ledgerEvent = { root, fields: ['adopt'] };
      break;
    }
    case 'trace': {
      const root = takeRoot(args);
      const si = args.indexOf('--slice');
      if (si >= 0 && !args[si + 1]) fail('--slice needs an id');
      verbTrace(root, si >= 0 ? args[si + 1] : undefined);
      break;
    }
    // No --root: collisions reads git only and touches no ledger (ADR 0126).
    case 'collisions':
      verbCollisions(cwd, args);
      break;
    // No --root: root resolves the run-root path itself, from cwd (ADR 0080).
    case 'root':
      verbRoot(cwd, args[0]);
      break;
    // No --root: staging resolves a staging directory, not a run root, and touches no ledger (ADR 0119).
    case 'staging':
      verbStaging(cwd, args);
      break;
    // No --root: citations reads git only and touches no ledger (ADR 0150).
    case 'citations':
      verbCitations(cwd, args);
      break;
    // No --root: dod-line touches no ledger, and makes no store call (references/dod-ticks.md).
    case 'dod-line':
      verbDodLine(args, stdinJson);
      break;
    default:
      fail('unknown verb "' + (verb || '') + '"\n' + usage());
  }
  if (ledgerEvent) appendTrace(ledgerEvent.root, { slice: ledgerEvent.slice, kind: 'ledger', fields: ledgerEvent.fields });
}

// True for `unresolved add -`, `deferred add -`, and `degraded add -` (any `--root <path>` position
// tolerated), which is what tells `main()` to wait on stdin before dispatching — the same sentinel
// `resolveBulletText` reads once the ledger root is known.
const BULLET_STDIN_VERBS = ['degraded', 'unresolved', 'deferred'];
function isBulletStdinInvocation(argv) {
  if (!BULLET_STDIN_VERBS.includes(argv[0])) return false;
  const rest = argv.slice(1);
  const ri = rest.indexOf('--root');
  if (ri >= 0) rest.splice(ri, 2);
  return rest.length === 2 && BULLET_STDIN_SUBS.includes(rest[0]) && rest[1] === '-';
}

// `--help` / `-h` asks for usage unless it is the value of a flag that takes one or the text of a bullet
// verb (`unresolved add -h`): those are data, and usage text standing in for them would be written on.
const VALUE_FLAGS = ['--root', '--range', '--exit', '--branch', '--slice', '--match', '--match-file', '--note', '--note-file', '--verdict'];
function asksForHelp(argv) {
  // After `test --` every word belongs to the command.
  if (argv[0] === 'test' && argv.includes('--')) argv = argv.slice(0, argv.indexOf('--'));
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (VALUE_FLAGS.includes(argv[i])) i++;
    else rest.push(argv[i]);
  }
  if (BULLET_STDIN_VERBS.includes(rest[0]) && BULLET_STDIN_SUBS.includes(rest[1]) && rest[2] !== '-') rest.length = 2; // `-` reads stdin: no text on the command line
  return rest.includes('--help') || rest.includes('-h');
}

function main() {
  const argv = process.argv.slice(2);
  // Checked before any verb reads stdin, so `dod-line --help` and its stdin siblings never wait on input.
  if (asksForHelp(argv)) {
    console.log(usage());
    return;
  }
  const needsStdin =
    argv[0] === 'init' || argv[0] === 'adopt' || argv[0] === 'dod-line' || isBulletStdinInvocation(argv);
  const go = (stdinJson) => {
    // A refusal prints its message and exits nonzero; any other error is a bug and propagates.
    const settle = (e) => {
      if (e.isRefusal) {
        process.stderr.write(e.message + '\n');
        process.exit(e.exitCode || 1);
      }
      throw e;
    };
    try {
      if (argv[0] === 'test') verbTest(process.cwd(), argv.slice(1));
      else if (argv[0] === 'fail-to-pass') verbFailToPass(process.cwd(), argv.slice(1)).catch(settle);
      else run(argv, process.cwd(), stdinJson);
      // Let the process exit naturally on success, so stdout is guaranteed to flush first;
      // a refusal still exits nonzero below.
    } catch (e) {
      settle(e);
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
// The exports come first: `verbTest` lazily requires hooks/run-trace.js, which requires this file back for them (ADR 0127).
module.exports = { endRun, watchMain, verificationCommandsOf, appendTrace, untraceField, readTrace, sliceType, readLedgerHeader, inProgressSlices, verificationCommands, isTestPath, run, publishText, SLUG_RE, testContainment, baseHistoryHasPatch, mainWorkTree, CHANGE_TYPES, refResolves, findCollisions };

if (require.main === module) main();
