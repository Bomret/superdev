#!/usr/bin/env node
'use strict';

// scope.js: the run-state CLI (ADR 0022). Owns every ledger.md write and read in the chain.
// Verbs: init, stage, slice, degraded, unresolved, get, status. Exit nonzero with a one-line stderr
// reason on any refusal. hooks/ledger-guard.js makes this the only ledger write path.

const fs = require('fs');
const path = require('path');

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
const TOKEN_HEADERS = new Set(['Stage', 'Branch']);

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
// alone — and by `get degraded`/`get unresolved`.
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
  // The real double-init signal is an existing ledger.md, not the run-root directory: Phase 0
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

  // Ensure .superdev/ is git-ignored before creating anything under it.
  const gi = path.join(cwd, '.gitignore');
  let giText = '';
  try {
    giText = fs.readFileSync(gi, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (!giText.split('\n').some((l) => l.trim() === '.superdev/' || l.trim() === '.superdev')) {
    fs.writeFileSync(gi, giText + (giText && !giText.endsWith('\n') ? '\n' : '') + '.superdev/\n', 'utf8');
  }

  const seenIds = new Set();
  const rows = spec.slices.map((s) => {
    for (const k of ['id', 'issue', 'title', 'type']) {
      if (typeof s[k] !== 'string' || !s[k]) fail(`slice row missing "${k}"`);
    }
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

  const doc = [
    `# Ledger — ${slug}`,
    '',
    '**Stage:** implementing',
    `**Branch:** ${label}`,
    `**Anchor:** ${sanitizeCell(spec.anchor)}`,
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

function verbStage(root, sub, value) {
  const lines = readLines(root);
  if (sub === 'get') {
    const v = getHeader(lines, 'Stage');
    console.log(v === null ? 'absent' : v);
    return;
  }
  if (sub !== 'set') fail(`unknown stage subcommand "${sub}" — use get|set`);
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
// A newline in the text would break the one bullet = one line assumption the reader depends on.
function addBullet(root, name, verb, text) {
  if (!text) fail(`${verb} add needs the bullet text`);
  if (text.includes('\n')) fail(`${verb} add text must not contain a newline`);
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

function verbDegraded(root, sub, text) {
  if (sub !== 'add') fail(`unknown degraded subcommand "${sub}" — use add`);
  addBullet(root, 'Degraded', 'degraded', text);
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
  addBullet(root, 'Unresolved', 'unresolved', text);
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
  if (field === 'unresolved' || field === 'degraded') {
    // The read half of `unresolved add`/`degraded add`: every bullet, one per line, so a caller
    // (`/superdev:ship`'s gate and its pull-request body step) never has to split a joined string back
    // apart — a bullet containing a comma stays intact this way, unlike `status`'s `, `-joined line.
    const lines = readLines(root);
    for (const b of readBullets(lines, field === 'unresolved' ? 'Unresolved' : 'Degraded')) console.log(b);
    return;
  }
  const names = { stage: 'Stage', branch: 'Branch', anchor: 'Anchor' };
  const name = names[field];
  if (!name) fail(`unknown field "${field}" — use stage|branch|anchor|slices|unresolved|degraded`);
  const v = getHeader(readLines(root), name);
  console.log(v === null ? 'absent' : v);
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
      // unresolved-defect record, and staged-page lines are the deliberate exceptions below: a degraded
      // pass is otherwise recorded only in the pull-request body, which the same prune outlives it by
      // (scope-mode `## Degraded passes`); an unresolved defect the same way (`## Unresolved defects`);
      // and a page nobody publishes is invisible everywhere else (ADR 0023) — a shipped scope is exactly
      // where any of them waits.
      if (stage === 'shipped') {
        out.push(`${scope}  (shipped)`);
        const shippedDegraded = readBullets(lines, 'Degraded');
        if (shippedDegraded.length) out.push(`  degraded: ${shippedDegraded.join(', ')}`);
        const shippedUnresolved = readBullets(lines, 'Unresolved');
        if (shippedUnresolved.length) out.push(`  unresolved: ${shippedUnresolved.join(', ')}`);
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

// --- CLI ---------------------------------------------------------------------

function usage() {
  return [
    'usage: node scope.js <verb> …   (ledger CLI — the only ledger.md write path)',
    '  init <type>/<slug>                 stdin: {"anchor":"…","slices":[{id,issue,title,type,…}]}',
    '  stage get|set <value> --root <run-root>',
    '  slice <id> <status> [--range <r>]   --root <run-root>',
    '  degraded add <text>   --root <run-root>',
    '  unresolved add <text>|clear   --root <run-root>',
    '  get stage|branch|anchor|slices|unresolved|degraded --root <run-root>',
    '  status                             scans <cwd>/.superdev/scopes/*/',
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
    case 'get': {
      const root = takeRoot(args);
      verbGet(root, args[0]);
      break;
    }
    case 'status':
      verbStatus(cwd);
      break;
    default:
      fail('unknown verb "' + (verb || '') + '"\n' + usage());
  }
}

function main() {
  if (process.argv.includes('--selftest')) {
    selftest();
    return;
  }
  const argv = process.argv.slice(2);
  const needsStdin = argv[0] === 'init';
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

// --- selftest ----------------------------------------------------------------

function selftest() {
  const assert = require('node:assert');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-'));

  // Capture console.log output per call.
  const call = (argv, stdinJson) => {
    const logged = [];
    const orig = console.log;
    console.log = (s) => logged.push(String(s));
    try {
      run(argv, tmp, stdinJson || '');
      return { ok: true, out: logged.join('\n') };
    } catch (e) {
      if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
      throw e;
    } finally {
      console.log = orig;
    }
  };

  const sliceJson = JSON.stringify({
    anchor: '#187 — Run state owned by a deterministic CLI (scope.js)',
    slices: [
      { id: '01', issue: '#188', title: 'scope.js CLI', type: 'behavior', 'depends-on': '—' },
      { id: '02', issue: '#189', title: 'ledger-guard hook', type: 'behavior', 'depends-on': '01' },
    ],
  });

  try {
    // init: valid label creates root + schema-shaped ledger.
    let r = call(['init', 'feat/demo'], sliceJson);
    assert.ok(r.ok, 'init should pass: ' + (r.err || ''));
    const root = path.join(tmp, '.superdev', 'scopes', 'demo');
    const text = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(text.includes('**Stage:** implementing'), 'ledger carries Stage');
    assert.ok(text.includes('**Branch:** feat/demo'), 'ledger carries Branch');
    assert.ok(text.includes('**Anchor:** #187'), 'ledger carries Anchor');
    assert.ok(text.includes('| id | issue | title | type | depends-on | status | range |'), 'ledger carries the 7-column table');
    assert.ok(text.includes('| 01 | #188 | scope.js CLI | behavior | — | todo | — |'), 'ledger carries slice rows');
    assert.ok(fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8').includes('.superdev/'), '.superdev/ git-ignored');

    // init: a slice already reported merged (ADR 0004 — a second run over an appended feature must
    // never re-dispatch it) writes `merged` into the ledger table, alongside a sibling with no status
    // that still defaults to `todo`.
    const mergedSliceJson = JSON.stringify({
      anchor: '#187 — Run state owned by a deterministic CLI (scope.js)',
      slices: [
        { id: '01', issue: '#188', title: 'scope.js CLI', type: 'behavior', 'depends-on': '—', status: 'merged' },
        { id: '02', issue: '#189', title: 'ledger-guard hook', type: 'behavior', 'depends-on': '01' },
      ],
    });
    r = call(['init', 'feat/appended'], mergedSliceJson);
    assert.ok(r.ok, 'init should pass with a merged slice: ' + (r.err || ''));
    const appendedText = fs.readFileSync(
      path.join(tmp, '.superdev', 'scopes', 'appended', 'ledger.md'),
      'utf8',
    );
    assert.ok(
      appendedText.includes('| 01 | #188 | scope.js CLI | behavior | — | merged | — |'),
      'ledger writes the merged status verbatim: ' + appendedText,
    );
    assert.ok(
      appendedText.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | todo | — |'),
      'a sibling with no status still defaults to todo: ' + appendedText,
    );

    // init: a slice list that is entirely merged (a second run over a fully-shipped appended feature,
    // ADR 0004) writes `merged` into every row — nothing defaults to `todo`. Isolated in its own root
    // so its 2-of-2-merged tally doesn't collide with the shipped-scope tally assertion below.
    const allMergedJson = JSON.stringify({
      anchor: '#187 — Run state owned by a deterministic CLI (scope.js)',
      slices: [
        { id: '01', issue: '#188', title: 'scope.js CLI', type: 'behavior', 'depends-on': '—', status: 'merged' },
        { id: '02', issue: '#189', title: 'ledger-guard hook', type: 'behavior', 'depends-on': '01', status: 'merged' },
      ],
    });
    const fullyShipped = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-fully-shipped-'));
    const origFullyShipped = console.log;
    console.log = () => {};
    try {
      run(['init', 'feat/fully-shipped'], fullyShipped, allMergedJson);
    } finally {
      console.log = origFullyShipped;
    }
    const allMergedText = fs.readFileSync(
      path.join(fullyShipped, '.superdev', 'scopes', 'fully-shipped', 'ledger.md'),
      'utf8',
    );
    assert.ok(
      allMergedText.includes('| 01 | #188 | scope.js CLI | behavior | — | merged | — |')
        && allMergedText.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | merged | — |'),
      'every row seeds merged, none defaults to todo: ' + allMergedText,
    );
    fs.rmSync(fullyShipped, { recursive: true, force: true });

    // init: a run root whose ledger.md already exists is refused (the real double-init signal).
    r = call(['init', 'feat/demo'], sliceJson);
    assert.ok(!r.ok && /already exists/.test(r.err), 'existing ledger refused');

    // init: a run root directory that exists but holds no ledger.md yet (Phase 0 writes dod.md
    // before calling init) is tolerated — init still writes the ledger into it.
    const preexistingRoot = path.join(tmp, '.superdev', 'scopes', 'preexisting');
    fs.mkdirSync(preexistingRoot, { recursive: true });
    fs.writeFileSync(path.join(preexistingRoot, 'dod.md'), '# DoD\n', 'utf8');
    r = call(['init', 'feat/preexisting'], sliceJson);
    assert.ok(r.ok, 'init tolerates a pre-existing dir with no ledger.md: ' + (r.err || ''));
    assert.ok(fs.existsSync(path.join(preexistingRoot, 'ledger.md')), 'ledger written into the pre-existing dir');
    assert.ok(fs.existsSync(path.join(preexistingRoot, 'dod.md')), 'dod.md untouched');

    // init: invalid labels refused naming the failing segment, no root created.
    for (const [label, re] of [
      ['zap/demo2', /type/],
      ['feat/Bad Slug', /slug/],
      ['nodelimiter', /no "\/"/],
      ['/demo2', /empty type/],
      ['feat/', /empty slug/],
      ['feat/-lead', /slug/],
    ]) {
      r = call(['init', label], sliceJson);
      assert.ok(!r.ok, `init "${label}" should refuse`);
      assert.ok(re.test(r.err), `refusal for "${label}" names the segment: ${r.err}`);
    }
    assert.ok(!fs.existsSync(path.join(tmp, '.superdev', 'scopes', 'demo2')), 'no root created on refusal');

    // init: duplicate slice ids refused.
    const dupJson = JSON.stringify({
      anchor: '#1 — anchor',
      slices: [
        { id: '01', issue: '#1', title: 'a', type: 'behavior' },
        { id: '01', issue: '#2', title: 'b', type: 'behavior' },
      ],
    });
    r = call(['init', 'feat/dup'], dupJson);
    assert.ok(!r.ok && /duplicate slice id/.test(r.err), 'duplicate slice id refused');
    assert.ok(!fs.existsSync(path.join(tmp, '.superdev', 'scopes', 'dup')), 'no root created on duplicate id');

    // stage: get, unknown value, backwards, terminal, sanctioned move.
    const R = ['--root', root];
    assert.strictEqual(call(['stage', 'get', ...R]).out, 'implementing', 'stage get');
    r = call(['stage', 'set', 'polished', ...R]);
    assert.ok(!r.ok && /unknown stage/.test(r.err), 'unknown stage refused');
    assert.ok(call(['stage', 'set', 'merged', ...R]).ok, 'implementing → merged');
    r = call(['stage', 'set', 'implementing', ...R]);
    assert.ok(!r.ok, 'backwards move refused');
    assert.ok(call(['stage', 'set', 'documented-unreviewed', ...R]).ok, 'merged → documented-unreviewed');
    assert.ok(call(['stage', 'set', 'reviewed', ...R]).ok, 'sanctioned reviewed over documented-unreviewed');
    assert.ok(call(['stage', 'set', 'documented', ...R]).ok, 'reviewed → documented');
    r = call(['stage', 'set', 'reviewed', ...R]);
    assert.ok(!r.ok, 'documented is terminal for earlier stages');
    assert.ok(call(['stage', 'set', 'shipped', ...R]).ok, 'documented → shipped (ship\'s own write)');
    r = call(['stage', 'set', 'documented', ...R]);
    assert.ok(!r.ok, 'shipped is terminal');
    assert.ok(call(['stage', 'set', 'shipped', ...R]).ok, 'same-value write is a no-op, not a refusal');

    // stage: forward moves may skip ranks — the chain prose instructs it (review.md "anything else →
    // write reviewed", document.md "anything else → write documented-unreviewed") — and a forward move
    // out of documented-unreviewed reaching documented (no fix cycle ran) is allowed too. Each gets its
    // own scratch scope so it doesn't disturb the pipeline walk above.
    const mkStageRoot = (slug) => {
      assert.ok(call(['init', 'feat/' + slug], sliceJson).ok);
      return path.join(tmp, '.superdev', 'scopes', slug);
    };
    let sr = mkStageRoot('stage-fwd-reviewed');
    assert.ok(call(['stage', 'set', 'reviewed', '--root', sr]).ok, 'implementing → reviewed (skip forward) allowed');

    sr = mkStageRoot('stage-fwd-docunrev');
    assert.ok(call(['stage', 'set', 'documented-unreviewed', '--root', sr]).ok, 'implementing → documented-unreviewed (skip forward) allowed');

    sr = mkStageRoot('stage-fwd-doc');
    assert.ok(call(['stage', 'set', 'documented-unreviewed', '--root', sr]).ok);
    assert.ok(call(['stage', 'set', 'documented', '--root', sr]).ok, 'documented-unreviewed → documented (no fix cycle) allowed');

    // stage: still-refused same-rank and backwards moves.
    sr = mkStageRoot('stage-back-docunrev');
    assert.ok(call(['stage', 'set', 'reviewed', '--root', sr]).ok);
    r = call(['stage', 'set', 'documented-unreviewed', '--root', sr]);
    assert.ok(!r.ok, 'reviewed → documented-unreviewed refused (only the reverse pair is sanctioned)');

    sr = mkStageRoot('stage-back-reviewed');
    assert.ok(call(['stage', 'set', 'reviewed', '--root', sr]).ok);
    assert.ok(call(['stage', 'set', 'documented', '--root', sr]).ok);
    r = call(['stage', 'set', 'reviewed', '--root', sr]);
    assert.ok(!r.ok, 'documented → reviewed refused');

    sr = mkStageRoot('stage-back-documented');
    assert.ok(call(['stage', 'set', 'documented', '--root', sr]).ok);
    assert.ok(call(['stage', 'set', 'shipped', '--root', sr]).ok);
    r = call(['stage', 'set', 'documented', '--root', sr]);
    assert.ok(!r.ok, 'shipped → documented refused');

    // slice: unknown id/status refused; a valid call updates exactly that row.
    r = call(['slice', '01', 'polished', ...R]);
    assert.ok(!r.ok && /unknown slice status/.test(r.err), 'unknown slice status refused');
    r = call(['slice', '99', 'merged', ...R]);
    assert.ok(!r.ok && /no slice row/.test(r.err), 'unknown slice id refused');
    assert.ok(call(['slice', '01', 'merged', ...R]).ok, 'valid slice update');
    const after = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(after.includes('| 01 | #188 | scope.js CLI | behavior | — | merged | — |'), 'row 01 updated');
    assert.ok(after.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | todo | — |'), 'row 02 untouched');

    // slice --range: writes the range cell when given, leaves it alone (— above) without it.
    assert.ok(call(['slice', '02', 'merged', '--range', 'abc123..def456', ...R]).ok, 'slice with --range');
    const withRange = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(withRange.includes('| 02 | #189 | ledger-guard hook | behavior | 01 | merged | abc123..def456 |'), 'range cell written');

    // writeLines writes atomically (temp file + rename) — no leftover temp file survives a write.
    assert.deepStrictEqual(fs.readdirSync(root).filter((n) => n.includes('.tmp-')), [], 'no stray temp file left behind');

    // degraded: creates the line when absent, appends when present.
    assert.ok(call(['degraded', 'add', 'first pass degraded (2026-08-06)', ...R]).ok, 'degraded add creates');
    assert.ok(call(['degraded', 'add', 'second pass degraded (2026-08-06)', ...R]).ok, 'degraded add appends');
    const deg = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(/\*\*Degraded:\*\*\n- first pass degraded \(2026-08-06\)\n- second pass degraded \(2026-08-06\)/.test(deg), 'both bullets under one line');

    // unresolved: creates the line when absent, appends when present — mirrors degraded add.
    assert.ok(call(['unresolved', 'add', 'suite still red at the three-strike cap (2026-08-12)', ...R]).ok, 'unresolved add creates');
    assert.ok(call(['unresolved', 'add', 'operator declined the fix (2026-08-12)', ...R]).ok, 'unresolved add appends');
    const unres = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(
      /\*\*Unresolved:\*\*\n- suite still red at the three-strike cap \(2026-08-12\)\n- operator declined the fix \(2026-08-12\)/.test(unres),
      'both bullets under one line'
    );

    // get unresolved / get degraded: one bullet per line, mirroring `get slices`.
    assert.strictEqual(
      call(['get', 'degraded', ...R]).out,
      'first pass degraded (2026-08-06)\nsecond pass degraded (2026-08-06)',
      'get degraded prints one bullet per line'
    );
    assert.strictEqual(
      call(['get', 'unresolved', ...R]).out,
      'suite still red at the three-strike cap (2026-08-12)\noperator declined the fix (2026-08-12)',
      'get unresolved prints one bullet per line'
    );

    // degraded add / unresolved add: a bullet containing a newline is refused — unescaped, it would
    // write arbitrary extra ledger lines, including a second **Stage:** line.
    const beforeNewlineDeg = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    r = call(['degraded', 'add', 'line one\nline two', ...R]);
    assert.ok(!r.ok && /newline/.test(r.err), 'degraded add with a newline refused: ' + r.err);
    assert.strictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), beforeNewlineDeg, 'nothing written on refusal');
    r = call(['unresolved', 'add', 'line one\nline two', ...R]);
    assert.ok(!r.ok && /newline/.test(r.err), 'unresolved add with a newline refused: ' + r.err);
    assert.strictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), beforeNewlineDeg, 'nothing written on refusal');

    // unresolved add: no text refuses with a one-line message and writes nothing.
    const beforeNoText = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    r = call(['unresolved', 'add', '', ...R]);
    assert.ok(!r.ok && /needs the bullet text/.test(r.err), 'unresolved add with no text refused');
    assert.strictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), beforeNoText, 'nothing written on refusal');

    // unresolved: an unknown subcommand refuses, naming the two that exist.
    r = call(['unresolved', 'zap', 'x', ...R]);
    assert.ok(!r.ok && /unknown unresolved subcommand.*add\|clear/.test(r.err), 'unknown unresolved subcommand refused: ' + r.err);

    // unresolved clear: removes the line and its bullets entirely.
    assert.ok(call(['unresolved', 'clear', ...R]).ok, 'unresolved clear');
    const cleared = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(!/\*\*Unresolved:\*\*/.test(cleared), 'the line is gone');
    assert.ok(!/suite still red/.test(cleared), 'its bullets are gone too');

    // unresolved clear: on a ledger with no such line, succeeds and changes nothing.
    const beforeNoopClear = fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
    assert.ok(call(['unresolved', 'clear', ...R]).ok, 'clearing an absent line still succeeds');
    assert.strictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), beforeNoopClear, 'and changes nothing');

    // unresolved clear: the two adjacency cases — nothing beside the block gets touched.
    // Case 1: **Unresolved:** and its bullets are the file's last lines (no trailing table, no
    // blank line after).
    const tailRoot = path.join(tmp, '.superdev', 'scopes', 'unresolved-tail');
    fs.mkdirSync(tailRoot, { recursive: true });
    const tailText =
      '# Ledger — unresolved-tail\n\n**Stage:** merged\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #1 | x | behavior | — | merged | — |\n\n' +
      '**Unresolved:**\n- suite still red at the three-strike cap (2026-08-12)\n- second bullet\n';
    fs.writeFileSync(path.join(tailRoot, 'ledger.md'), tailText, 'utf8');
    assert.ok(call(['unresolved', 'clear', '--root', tailRoot]).ok, 'clear on a trailing Unresolved block');
    assert.strictEqual(
      fs.readFileSync(path.join(tailRoot, 'ledger.md'), 'utf8'),
      '# Ledger — unresolved-tail\n\n**Stage:** merged\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n' +
        '| 01 | #1 | x | behavior | — | merged | — |\n\n',
      'the block and only the block is gone; the table above is untouched'
    );

    // Case 2: **Unresolved:**'s last bullet is immediately followed by the slice table header
    // row, with no blank-line separator.
    const gluedRoot = path.join(tmp, '.superdev', 'scopes', 'unresolved-glued');
    fs.mkdirSync(gluedRoot, { recursive: true });
    const gluedText =
      '# Ledger — unresolved-glued\n\n**Stage:** merged\n\n' +
      '**Unresolved:**\n- suite still red at the three-strike cap (2026-08-12)\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #1 | x | behavior | — | merged | — |\n';
    fs.writeFileSync(path.join(gluedRoot, 'ledger.md'), gluedText, 'utf8');
    assert.ok(call(['unresolved', 'clear', '--root', gluedRoot]).ok, 'clear on an Unresolved block glued to the table');
    assert.strictEqual(
      fs.readFileSync(path.join(gluedRoot, 'ledger.md'), 'utf8'),
      '# Ledger — unresolved-glued\n\n**Stage:** merged\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n' +
        '| 01 | #1 | x | behavior | — | merged | — |\n',
      'the block is gone and the table header sits exactly where it did, no stray blank line'
    );

    // get: prints the value; absent header reported as absent.
    assert.strictEqual(call(['get', 'branch', ...R]).out, 'feat/demo', 'get branch');
    assert.ok(/#187/.test(call(['get', 'anchor', ...R]).out), 'get anchor');
    const slices = call(['get', 'slices', ...R]).out.split('\n');
    assert.strictEqual(slices.length, 2, 'get slices prints one line per row');
    assert.strictEqual(slices[0], '01\t#188\tscope.js CLI\tbehavior\t—\tmerged\t—', 'get slices is tab-separated');

    // cell escaping: a `|` or a newline in a title must not corrupt the ledger row, and must
    // round-trip losslessly through get slices and a slice row-rebuild.
    const pipeJson = JSON.stringify({
      anchor: '#1 — anchor',
      slices: [{ id: '01', issue: '#1', title: 'add a|b parser', type: 'behavior' }],
    });
    let pr = call(['init', 'feat/pipe-title'], pipeJson);
    assert.ok(pr.ok, 'init with a `|` in the title should pass: ' + (pr.err || ''));
    const pipeRoot = path.join(tmp, '.superdev', 'scopes', 'pipe-title');
    const P2 = ['--root', pipeRoot];
    let pipeSlices = call(['get', 'slices', ...P2]).out.split('\n');
    assert.strictEqual(pipeSlices[0], '01\t#1\tadd a|b parser\tbehavior\t—\ttodo\t—', 'get slices restores the literal |');
    assert.ok(call(['slice', '01', 'merged', ...P2]).ok, 'slice row-rebuild survives an escaped |');
    pipeSlices = call(['get', 'slices', ...P2]).out.split('\n');
    assert.strictEqual(pipeSlices[0], '01\t#1\tadd a|b parser\tbehavior\t—\tmerged\t—', 'title with | intact after row-rebuild');
    let ps = call(['status']);
    assert.ok(ps.ok && !/ledger unreadable/.test(ps.out.split('\n').find((l) => l.startsWith('pipe-title')) || ''), 'status reads the pipe-title ledger fine');

    const newlineJson = JSON.stringify({
      anchor: '#2 — anchor',
      slices: [{ id: '01', issue: '#2', title: 'line one\nline two', type: 'behavior' }],
    });
    pr = call(['init', 'feat/newline-title'], newlineJson);
    assert.ok(pr.ok, 'init with a newline in the title should pass: ' + (pr.err || ''));
    const nlRoot = path.join(tmp, '.superdev', 'scopes', 'newline-title');
    const N2 = ['--root', nlRoot];
    let nlSlices = call(['get', 'slices', ...N2]).out.split('\n');
    assert.strictEqual(nlSlices.length, 1, 'a collapsed newline title stays one ledger row');
    assert.strictEqual(nlSlices[0], '01\t#2\tline one line two\tbehavior\t—\ttodo\t—', 'newline runs collapse to one space');
    assert.ok(call(['slice', '01', 'merged', ...N2]).ok, 'slice row-rebuild survives a collapsed newline');
    ps = call(['status']);
    assert.ok(ps.ok && !/ledger unreadable/.test(ps.out.split('\n').find((l) => l.startsWith('newline-title')) || ''), 'status reads the newline-title ledger fine');

    // The scope-slug and change-type rules live here as code (SLUG_RE, CHANGE_TYPES) but
    // hooks/run-lock.js extracts with the same charset and references/scope-mode.md states it
    // in prose — one fact in three syntaxes, kept equal (took over from drift-check's retired
    // scope-slug contract row).
    assert.strictEqual(SLUG_RE.source, '^[a-zA-Z0-9][a-zA-Z0-9_-]*$', 'SLUG_RE itself is pinned');
    const charset = SLUG_RE.source.slice(1, -1); // drop the ^…$ anchors
    const repo = path.join(__dirname, '..');
    const runLock = fs.readFileSync(path.join(repo, 'hooks', 'run-lock.js'), 'utf8');
    assert.ok(runLock.includes(charset), 'run-lock.js extracts with the SLUG_RE charset');
    const scopeMode = fs.readFileSync(path.join(repo, 'references', 'scope-mode.md'), 'utf8');
    assert.ok(scopeMode.includes('`' + charset + '`'), 'scope-mode.md states the SLUG_RE charset');

    // A pre-CLI ledger (hand-written, no Branch/Anchor/Degraded/Unresolved lines) parses unchanged.
    const preRoot = path.join(tmp, '.superdev', 'scopes', 'precli');
    fs.mkdirSync(preRoot, { recursive: true });
    const preCliText =
      '# Ledger — precli\n\n**Stage:** merged\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n' +
      '| 01 | #10 | old slice | mechanical | — | merged | abc..def |\n';
    fs.writeFileSync(path.join(preRoot, 'ledger.md'), preCliText, 'utf8');
    const P = ['--root', preRoot];
    assert.strictEqual(call(['stage', 'get', ...P]).out, 'merged', 'pre-CLI stage readable');
    assert.strictEqual(call(['get', 'branch', ...P]).out, 'absent', 'absent Branch reported as absent');
    assert.strictEqual(readLedgerHeader(preCliText, 'Unresolved'), null, 'a missing Unresolved line reads as absent rather than raising');
    assert.ok(call(['unresolved', 'clear', ...P]).ok, 'clearing an absent Unresolved line on a pre-CLI ledger still succeeds');
    assert.ok(call(['stage', 'set', 'reviewed', ...P]).ok, 'pre-CLI ledger writable');

    // status: renders every scope; an unreadable ledger is reported while others render.
    const badRoot = path.join(tmp, '.superdev', 'scopes', 'broken');
    fs.mkdirSync(badRoot, { recursive: true });
    fs.writeFileSync(path.join(badRoot, 'ledger.md'), '| 01 | not | enough | cells |\n', 'utf8');
    const st = call(['status']);
    assert.ok(st.ok, 'status runs');
    // A shipped scope is not work in flight — `scope-prune` is about to reap it (ADR 0007) — so it
    // collapses to one line and drops its tally and blocked list. Its degrade record survives that
    // collapse: `scope-prune` reaps the run root seven days later, and the pull-request body is
    // otherwise the only surviving copy of a pass that ran degraded. Its staged-page lines survive too,
    // and are asserted with the rest of the kb cases below.
    assert.ok(st.out.includes('demo  (shipped)'), 'a shipped scope collapses to one line: ' + st.out);
    assert.ok(!st.out.includes('demo  (2 slices'), 'a shipped scope carries no slice count');
    assert.ok(
      !st.out.includes('todo: 0  in-progress: 0  in-review: 0  blocked: 0  merged: 2'),
      "a shipped scope's tally is not printed"
    );
    assert.ok(
      st.out.includes('  degraded: first pass degraded (2026-08-06), second pass degraded (2026-08-06)'),
      "a shipped scope's degrade record survives the collapse: " + st.out
    );
    assert.ok(st.out.includes('precli  (1 slices, stage: reviewed)'), 'status shows pre-CLI scope');
    assert.ok(st.out.includes('broken: ledger unreadable'), 'unreadable ledger reported');

    // status: an `unresolved:` line for a scope that has one, and none for a scope that does not.
    // No scope carries one yet — the demo scope's line was cleared above.
    assert.ok(!/unresolved:/.test(st.out), 'no unresolved line when no scope has one: ' + st.out);
    // A shipped scope's collapsed status still carries its unresolved bullets, as it carries its
    // degraded ones (the demo scope above is shipped).
    assert.ok(call(['unresolved', 'add', 'suite still red at the three-strike cap (2026-08-12)', ...R]).ok);
    const stShippedUnresolved = call(['status']).out;
    assert.ok(
      stShippedUnresolved.includes('  unresolved: suite still red at the three-strike cap (2026-08-12)'),
      "a shipped scope's unresolved record survives the collapse: " + stShippedUnresolved
    );

    // An in-flight scope still prints everything it printed before: tally, blocked slices, and its
    // degrade record. The collapse is scoped to `shipped` alone.
    const flightRoot = path.join(tmp, '.superdev', 'scopes', 'inflight');
    fs.mkdirSync(flightRoot, { recursive: true });
    fs.writeFileSync(
      path.join(flightRoot, 'ledger.md'),
      '# Ledger — inflight\n\n**Stage:** merged\n**Degraded:**\n- doc pass denied (2026-08-11)\n' +
        '**Unresolved:**\n- fix declined by the operator (2026-08-12)\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n' +
        '| 01 | #20 | one | behavior | — | merged | a..b |\n' +
        '| 02 | #21 | two | behavior | — | blocked | — |\n',
      'utf8'
    );
    const stFlight = call(['status']);
    assert.ok(stFlight.out.includes('inflight  (2 slices, stage: merged)'), 'an in-flight scope keeps its header');
    assert.ok(stFlight.out.includes('todo: 0  in-progress: 0  in-review: 0  blocked: 1  merged: 1'), 'and its tally');
    assert.ok(stFlight.out.includes('  blocked: 02 two'), 'and its blocked slices');
    assert.ok(stFlight.out.includes('  degraded: doc pass denied (2026-08-11)'), 'and its degrade record');
    assert.ok(stFlight.out.includes('  unresolved: fix declined by the operator (2026-08-12)'), 'and its unresolved record');

    // status with zero scopes.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-empty-'));
    const logged = [];
    const orig = console.log;
    console.log = (s) => logged.push(String(s));
    try {
      run(['status'], empty, '');
    } finally {
      console.log = orig;
    }
    assert.strictEqual(logged.join('\n'), 'No superdev runs found in this repo.', 'zero-scope message');
    fs.rmSync(empty, { recursive: true, force: true });

    // status: staged knowledge-base pages awaiting /superdev:publish-kb (ADR 0023). Nothing else
    // reports them, and a page nobody publishes is a page no reader sees.
    const kbDir = path.join(tmp, '.superdev', 'kb-pending');
    assert.ok(!/pending publish/.test(st.out), 'nothing staged adds no line at all');

    fs.mkdirSync(path.join(kbDir, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(kbDir, 'demo', 'overview.md'), '---\ntitle: Overview\naction: upsert\n---\n', 'utf8');
    fs.writeFileSync(path.join(kbDir, 'demo', 'legacy.md'), '---\ntitle: Legacy\naction: delete\n---\n', 'utf8');
    fs.mkdirSync(path.join(kbDir, '_adhoc'), { recursive: true });
    fs.writeFileSync(path.join(kbDir, '_adhoc', 'guide.md'), '---\ntitle: Guide\naction: upsert\n---\n', 'utf8');
    fs.mkdirSync(path.join(kbDir, 'nothing-here'), { recursive: true });

    // A scope with a malformed ledger (see `broken` below) can still hold staged pages. Its pending
    // line belongs beside its `ledger unreadable` line, once — never a second time under `(no ledger)`,
    // because the ledger file exists; only its rows are malformed.
    fs.mkdirSync(path.join(kbDir, 'broken'), { recursive: true });
    fs.writeFileSync(path.join(kbDir, 'broken', 'p.md'), '---\ntitle: P\naction: upsert\n---\n', 'utf8');

    // A non-`.md` file in a staging directory (a page written as `overview` or `overview.markdown`)
    // must be surfaced, never silently skipped — that is exactly the silent loss the staged-page
    // filename contract exists to prevent. Cover both a scope with a run root and one without.
    fs.writeFileSync(path.join(kbDir, 'demo', 'draft.markdown'), 'stray\n', 'utf8');
    fs.mkdirSync(path.join(kbDir, 'stray-only'), { recursive: true });
    fs.writeFileSync(path.join(kbDir, 'stray-only', 'notes.txt'), 'stray\n', 'utf8');

    // A .md file written straight into the staging root, not under a <scope>/ subdirectory, is the same
    // silent-loss failure one level up: it counts in no scope's pages and matches no publish-kb glob.
    fs.writeFileSync(path.join(kbDir, 'orphan.md'), '---\ntitle: Orphan\naction: upsert\n---\n', 'utf8');

    const stKb = call(['status']);
    assert.ok(stKb.ok, 'status runs with staged pages');
    assert.ok(
      stKb.out.includes('  pending publish: 2 staged pages — /superdev:publish-kb demo'),
      'a scope with a run root carries its pending line: ' + stKb.out,
    );
    assert.ok(stKb.out.includes('_adhoc  (no ledger)'), 'a pending scope with no run root is reported');
    assert.ok(
      stKb.out.includes('  pending publish: 1 staged page — /superdev:publish-kb _adhoc'),
      'one page is singular',
    );
    assert.ok(!/nothing-here/.test(stKb.out), 'an empty staging directory is not pending');
    assert.ok(stKb.out.includes('broken: ledger unreadable'), 'the rest of the report is unchanged');

    // `demo` is shipped, so it collapses — but its staged-page lines are the exception that survives.
    // A page nobody publishes is invisible everywhere else (ADR 0023), and a shipped scope is exactly
    // where one waits, so collapsing these away would reintroduce the silent loss reporting prevents.
    // Asserted on the collapsed header specifically, not merely on the lines being present somewhere.
    const demoBlock = stKb.out.split('\n');
    const demoAt = demoBlock.findIndex((l) => l === 'demo  (shipped)');
    assert.ok(demoAt >= 0, 'the shipped scope still collapses with pages staged: ' + stKb.out);
    const demoLines = [];
    for (let i = demoAt + 1; i < demoBlock.length && demoBlock[i].startsWith('  '); i++) demoLines.push(demoBlock[i]);
    assert.ok(
      demoLines.some((l) => l.includes('pending publish: 2 staged pages')),
      "a shipped scope's pending line survives the collapse: " + demoLines.join(' | '),
    );
    assert.ok(
      demoLines.some((l) => l.includes('draft.markdown')),
      "a shipped scope's stray line survives the collapse: " + demoLines.join(' | '),
    );
    assert.ok(
      !demoLines.some((l) => l.startsWith('  todo:')),
      'and its tally still does not print',
    );
    assert.ok(
      stKb.out.includes('draft.markdown') && /ignored/.test(stKb.out),
      'a non-.md file under a scope with a run root is surfaced, not silently skipped: ' + stKb.out,
    );
    assert.ok(
      stKb.out.includes('stray-only') && stKb.out.includes('notes.txt'),
      'a scope with only stray files (no .md pages, no ledger) is still surfaced: ' + stKb.out,
    );
    assert.ok(
      stKb.out.includes('orphan.md') && /staged directly/.test(stKb.out),
      'a .md file staged directly under kb-pending (no scope directory) is surfaced, not silently dropped: ' + stKb.out,
    );
    assert.ok(
      stKb.out.includes('  pending publish: 1 staged page — /superdev:publish-kb broken'),
      'a malformed ledger still reports its own pending pages: ' + stKb.out,
    );
    assert.ok(!stKb.out.includes('broken  (no ledger)'), 'not reported a second time — its ledger file exists');

    // pages staged with no run root anywhere: the report is the pending blocks, not the zero-scope line.
    const only = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-kbonly-'));
    fs.mkdirSync(path.join(only, '.superdev', 'kb-pending', '_adhoc'), { recursive: true });
    fs.writeFileSync(path.join(only, '.superdev', 'kb-pending', '_adhoc', 'p.md'), 'x\n', 'utf8');
    const onlyLog = [];
    const origOnly = console.log;
    console.log = (s) => onlyLog.push(String(s));
    try {
      run(['status'], only, '');
    } finally {
      console.log = origOnly;
    }
    assert.ok(
      onlyLog.join('\n').includes('pending publish: 1 staged page — /superdev:publish-kb _adhoc'),
      'staged pages alone still produce a report',
    );
    assert.ok(
      !onlyLog.join('\n').includes('No superdev runs found'),
      'the zero-scope message never hides pending pages',
    );
    fs.rmSync(only, { recursive: true, force: true });

    // main()'s success path lets the process exit naturally instead of forcing process.exit(0),
    // so stdout flushes before exit. `call()` above bypasses main() entirely, so this needs a
    // real subprocess.
    const cp = require('child_process');
    const spawnEmpty = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-spawn-'));
    const spawned = cp.spawnSync(process.execPath, [__filename, 'status'], { cwd: spawnEmpty, encoding: 'utf8' });
    assert.strictEqual(spawned.status, 0, 'CLI process exits 0 on success');
    assert.strictEqual(spawned.stdout.trim(), 'No superdev runs found in this repo.', 'CLI process flushes stdout');
    fs.rmSync(spawnEmpty, { recursive: true, force: true });

    // --- readLedgerHeader: one reader, normalisation per header kind (ADR 0022) ---
    //
    // `hooks/scope-prune.js` carried its own copy of this and drifted on four axes. The hook now
    // requires the export below, so these cases are the definition for both readers.

    // Token headers — `Stage` and `Branch` — are single tokens. A hand-written ledger may wrap one in
    // markup or leave a period behind; every spelling reads as the bare token.
    for (const [line, expected, label] of [
      ['**Stage:** shipped', 'shipped', 'a plain value'],
      ['**Stage:** `shipped`', 'shipped', 'a backticked value'],
      ['**Stage:** **shipped**', 'shipped', 'an emphasised value'],
      ['**Stage:** `shipped`.', 'shipped', 'a backticked value with a trailing period'],
      ['**Stage:** shipped.', 'shipped', 'a plain value with a trailing period'],
    ]) {
      assert.strictEqual(readLedgerHeader(`# ledger\n\n${line}\n`, 'Stage'), expected, `Stage: ${label}`);
    }

    // The strip must never turn one stage into another.
    for (const [line, expected] of [
      ['**Stage:** documented-unreviewed', 'documented-unreviewed'],
      ['**Stage:** `reviewed`', 'reviewed'],
      ['**Stage:** not-shipped', 'not-shipped'],
    ]) {
      assert.strictEqual(readLedgerHeader(`# ledger\n\n${line}\n`, 'Stage'), expected, `Stage stays ${expected}`);
      assert.notStrictEqual(readLedgerHeader(`# ledger\n\n${line}\n`, 'Stage'), 'shipped', `${expected} is never shipped`);
    }

    assert.strictEqual(
      readLedgerHeader('# ledger\n\n**Branch:** `fix/x`\n', 'Branch'),
      'fix/x',
      'Branch is a token header too'
    );

    // A TOKEN header value is one word — git forbids whitespace in a refname — so trailing content after
    // the first whitespace run is never part of the value. A hand-written ledger that tacks on a
    // parenthetical or a comment must not widen the capture past that token: a value carrying trailing
    // content matches nothing in a branch set, and the veto that reads it (`branchPresent` in
    // hooks/scope-prune.js) reads a live, unmerged branch as gone.
    for (const [line, expected, label] of [
      ['**Branch:** fix/demo (PR #99 open)', 'fix/demo', 'a trailing parenthetical'],
      // A tab, not only a space: `split(' ')` passes every other row here and reads this one as the
      // whole line, which lands back on the delete path as a branch that matches nothing.
      ['**Branch:** fix/demo\t(PR open)', 'fix/demo', 'a tab-separated trailing note'],
      ['**Branch:** fix/demo   # note', 'fix/demo', 'a trailing comment'],
    ]) {
      assert.strictEqual(readLedgerHeader(`# ledger\n\n${line}\n`, 'Branch'), expected, `Branch: ${label}`);
    }

    // Prose headers — `Anchor` — carry a title that reaches a pull request through /superdev:review.
    // Take the rest of the line and trim; a uniform strip would eat the last character of a title
    // ending in punctuation.
    assert.strictEqual(
      readLedgerHeader('# ledger\n\n**Anchor:** #208 — Epic: one reader, shared.\n', 'Anchor'),
      '#208 — Epic: one reader, shared.',
      'Anchor keeps its internal colon and its trailing period'
    );

    // A header line present but empty is absent, for every header — and never reaches past its own
    // line. `\s` matches a newline, so a reader that is not line-anchored captures the NEXT header's
    // token here, which on `Branch` reads as a branch that exists nowhere.
    const valueless = '# ledger\n\n**Stage:** shipped\n**Branch:**\n**Anchor:** #208 — Epic\n';
    assert.strictEqual(readLedgerHeader(valueless, 'Branch'), null, 'an empty Branch line is absent');
    assert.strictEqual(readLedgerHeader(valueless, 'Stage'), 'shipped', 'and its neighbours still read');
    assert.strictEqual(readLedgerHeader(valueless, 'Anchor'), '#208 — Epic', 'including the one after it');
    assert.strictEqual(readLedgerHeader('# ledger\n\n**Stage:**   \n', 'Stage'), null, 'whitespace-only is absent');
    assert.strictEqual(readLedgerHeader('# ledger\n', 'Stage'), null, 'a missing line is absent');

    // The verbs report an empty header as `absent`, not as an empty line.
    const emptyRoot = path.join(tmp, '.superdev', 'scopes', 'emptyhdr');
    fs.mkdirSync(emptyRoot, { recursive: true });
    fs.writeFileSync(path.join(emptyRoot, 'ledger.md'), valueless, 'utf8');
    assert.strictEqual(call(['get', 'branch', '--root', emptyRoot]).out, 'absent', 'get branch reports absent');

    // `status` collapses a shipped scope whose stage line carries markup — it does not today.
    const markupRoot = path.join(tmp, '.superdev', 'scopes', 'markupstage');
    fs.mkdirSync(markupRoot, { recursive: true });
    fs.writeFileSync(
      path.join(markupRoot, 'ledger.md'),
      '# Ledger — markupstage\n\n**Stage:** `shipped`\n\n' +
        '| id | issue | title | type | depends-on | status | range |\n' +
        '|---|---|---|---|---|---|---|\n' +
        '| 01 | #1 | one | behavior | — | merged | a..b |\n',
      'utf8'
    );
    assert.ok(
      call(['status']).out.includes('markupstage  (shipped)'),
      'a backticked stage still collapses: ' + call(['status']).out
    );

    // Requiring the module must run no CLI code. Unguarded, `main()` parses the *caller's* argv and a
    // refusal calls process.exit — measured, a requiring process dies with `unknown verb ""` and exit 1.
    // A subprocess, because requiring this file from inside itself returns the half-built module.
    const requirer = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-selftest-require-'));
    const probe = path.join(requirer, 'probe.js');
    fs.writeFileSync(
      probe,
      `const m = require(${JSON.stringify(__filename)});\n` +
        "process.stdout.write(typeof m.readLedgerHeader + '|' + m.readLedgerHeader('**Stage:** `shipped`', 'Stage'));\n",
      'utf8'
    );
    const required = cp.spawnSync(process.execPath, [probe], { cwd: requirer, encoding: 'utf8', timeout: 10000 });
    assert.strictEqual(required.status, 0, 'requiring the module exits 0 rather than hanging or erroring');
    assert.strictEqual(required.stdout, 'function|shipped', 'the export works from a requiring process');
    assert.strictEqual(required.stderr, '', 'requiring the module prints no usage and no refusal');
    fs.rmSync(requirer, { recursive: true, force: true });

    // --- CRLF: a ledger an editor or `core.autocrlf` wrote reads exactly like an LF one ---
    //
    // Splitting on `'\n'` alone leaves a trailing `\r` on every line, and `headerRe`'s `(.*)$` cannot
    // span it — JavaScript's `.` excludes `\r` as a line terminator. Every header then reads as the
    // missing-optional-field case: `get stage` prints `absent`, `/superdev:ship` sees no stage, and
    // `hooks/scope-prune.js` never sees `shipped`, so it never reaps that run root. Silently, since the
    // Stop hook prints nothing either way. Nothing superdev writes is CRLF — `writeLines` joins with
    // `'\n'` — so this only reaches a maintainer whose editor or git config produced the file.
    const ledgerBody = (nl) =>
      ['# Ledger — crlf', '', '**Stage:** shipped', '**Branch:** fix/crlf', '**Anchor:** #219 — Epic: a title.',
       '**Degraded:**', '- a denied pass', '**Unresolved:**', '- suite still red at the cap', '',
       '| id | issue | title | type | depends-on | status | range |',
       '|---|---|---|---|---|---|---|',
       '| 01 | #219 | one | behavior | — | merged | a..b |', ''].join(nl);

    for (const [label, nl] of [['CRLF', '\r\n'], ['LF', '\n']]) {
      const text = ledgerBody(nl);
      assert.strictEqual(readLedgerHeader(text, 'Stage'), 'shipped', `${label}: Stage reads`);
      assert.strictEqual(readLedgerHeader(text, 'Branch'), 'fix/crlf', `${label}: Branch reads`);
      assert.strictEqual(readLedgerHeader(text, 'Anchor'), '#219 — Epic: a title.', `${label}: Anchor reads whole`);
      assert.strictEqual(readLedgerHeader(text, 'Unresolved'), null, `${label}: the Unresolved header line itself carries no value — its bullets are read separately`);
    }

    // A ledger mixing both endings — a file half-rewritten by a different editor.
    const mixed = '# Ledger — crlf\r\n\r\n**Stage:** shipped\n**Branch:** fix/crlf\r\n';
    assert.strictEqual(readLedgerHeader(mixed, 'Stage'), 'shipped', 'mixed endings: LF line reads');
    assert.strictEqual(readLedgerHeader(mixed, 'Branch'), 'fix/crlf', 'mixed endings: CRLF line reads');

    // Through the verbs and the report, not only the reader: the table and the degrade list too.
    const crlfRoot = path.join(tmp, '.superdev', 'scopes', 'crlfscope');
    fs.mkdirSync(crlfRoot, { recursive: true });
    fs.writeFileSync(path.join(crlfRoot, 'ledger.md'), ledgerBody('\r\n'), 'utf8');
    const CR = ['--root', crlfRoot];
    assert.strictEqual(call(['get', 'stage', ...CR]).out, 'shipped', 'get stage on a CRLF ledger');
    assert.strictEqual(call(['get', 'branch', ...CR]).out, 'fix/crlf', 'get branch on a CRLF ledger');
    assert.strictEqual(call(['get', 'anchor', ...CR]).out, '#219 — Epic: a title.', 'get anchor on a CRLF ledger');
    assert.strictEqual(
      call(['get', 'slices', ...CR]).out,
      '01\t#219\tone\tbehavior\t—\tmerged\ta..b',
      'the slice table parses under CRLF, with no stray carriage return in the last cell'
    );
    const crlfStatus = call(['status']).out;
    assert.ok(crlfStatus.includes('crlfscope  (shipped)'), 'status reads the stage of a CRLF ledger: ' + crlfStatus);
    // `includes` cannot see a trailing `\r`, so assert on the whole line: a stray carriage return in the
    // degrade bullet would leave the line unequal while still "including" the text.
    assert.ok(
      crlfStatus.split('\n').includes('  degraded: a denied pass'),
      'its degrade record renders as an exact line, with no stray carriage return: ' + JSON.stringify(crlfStatus)
    );
    assert.ok(
      crlfStatus.split('\n').includes('  unresolved: suite still red at the cap'),
      'its unresolved record renders as an exact line too, with no stray carriage return: ' + JSON.stringify(crlfStatus)
    );

    // A shipped scope collapses and carries no tally, so the criterion "its stage AND its tally" needs a
    // scope that is still in flight. Same ledger, one stage earlier.
    const crlfLive = path.join(tmp, '.superdev', 'scopes', 'crlflive');
    fs.mkdirSync(crlfLive, { recursive: true });
    fs.writeFileSync(path.join(crlfLive, 'ledger.md'), ledgerBody('\r\n').replace('**Stage:** shipped', '**Stage:** merged'), 'utf8');
    const liveStatus = call(['status']).out.split('\n');
    assert.ok(liveStatus.includes('crlflive  (1 slices, stage: merged)'), 'an in-flight CRLF scope keeps its header: ' + liveStatus.join(' | '));
    assert.ok(
      liveStatus.includes('  todo: 0  in-progress: 0  in-review: 0  blocked: 0  merged: 1'),
      'and its tally, byte-identical to the LF rendering'
    );

    // A write leaves the file readable, and normalises it to LF.
    assert.ok(call(['slice', '01', 'merged', '--range', 'c..d', ...CR]).ok, 'a verb writes to a CRLF ledger');
    const rewritten = fs.readFileSync(path.join(crlfRoot, 'ledger.md'), 'utf8');
    assert.ok(!rewritten.includes('\r'), 'a ledger scope.js wrote carries LF endings only');
    assert.strictEqual(call(['get', 'stage', ...CR]).out, 'shipped', 'and it still reads afterwards');

    // a bullet containing a comma survives intact through `get unresolved` — a status report that joins
    // bullets with `, ` corrupts a comma-bearing bullet on the read side; `get` must not do that. A
    // fresh scope, added last, so it doesn't show up in an earlier `status` scan of `tmp` that asserts no
    // scope carries an unresolved line.
    const commaJson = JSON.stringify({ anchor: '#1 — anchor', slices: [{ id: '01', issue: '#1', title: 'a', type: 'behavior' }] });
    assert.ok(call(['init', 'feat/comma-bullet'], commaJson).ok);
    const commaRoot = path.join(tmp, '.superdev', 'scopes', 'comma-bullet');
    const CB = ['--root', commaRoot];
    assert.ok(call(['unresolved', 'add', 'suite red: a, b, and c all fail', ...CB]).ok);
    assert.strictEqual(
      call(['get', 'unresolved', ...CB]).out,
      'suite red: a, b, and c all fail',
      'a comma inside a bullet survives intact'
    );

    console.log('scope selftest ok');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// The CLI runs only when this file is executed directly. `hooks/scope-prune.js` requires it for
// `readLedgerHeader` (ADR 0022), and an unguarded `main()` parses the *caller's* argv: measured, a
// requiring process dies with `unknown verb ""` and exit 1 before its own first statement, because a
// refusal calls process.exit. Had the caller's argv happened to start with `init`, the same path waits
// on stdin instead and hangs. Either way the require, not the CLI, is what fails.
if (require.main === module) main();

module.exports = { readLedgerHeader };
