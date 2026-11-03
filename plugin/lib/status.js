'use strict';

// status.js: the `status` and `staging` verbs, the report of every run and staged knowledge-base page the repository holds.

const fs = require('fs');
const path = require('path');
const { readLines, getHeader, readBullets, tableRowIndexes, splitRow } = require('./ledger.js');
const { mainWorkTree, scopesDirFor, mainTreePath } = require('./main-work-tree.js');

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

// The report is markdown. A name read off disk or out of a ledger row is escaped, so a `|` keeps its table
// row whole and a `_` or `*` prints as itself; a file name prints as code.
function esc(text) {
  return String(text).replace(/[\\`*_[\]<>|]/g, '\\$&');
}

// A note's detail keeps its markdown, so only a `|` is escaped, to keep the row whole.
function cell(text) {
  return String(text).replace(/\|/g, '\\|');
}

function code(names) {
  return names.map((n) => `\`${n}\``).join(', ');
}

function pendingLine(scope, pages) {
  return `${pages} staged page${pages === 1 ? '' : 's'} — \`/superdev:publish-kb ${scope}\``;
}

function strayLine(files) {
  return `${files.length} non-\`.md\` file${files.length === 1 ? '' : 's'} staged, ignored: ${code(files)} — rename to \`.md\` so \`/superdev:publish-kb\` finds it`;
}

function looseLine(files) {
  return `${files.length} file${files.length === 1 ? '' : 's'} staged directly under \`.superdev/kb-pending\`, not in a scope directory: ${code(files)} — move each under a \`<scope>/\` subdirectory, named \`<title-slug>.md\` (or \`<title-slug>--<section-slug>.md\` for a patch), so \`/superdev:publish-kb\` finds it`;
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

  // The report is markdown, printed as-is by /superdev:status: one table row per scope, then one row per
  // note a scope carries, in a second table. A scope's ledger and its staged pages are independent: a malformed or unreadable
  // ledger still leaves any staged pages waiting. Shared by every `ledger unreadable` exit below, so that
  // scope is marked shown and the fallback loop past this one never reports it a second time under
  // `no ledger` — which would be wrong anyway, since the ledger file exists; only its contents are unreadable.
  const rows = [];
  const notes = [];
  const row = (scope, stage, tally) => rows.push(`| ${[scope, stage, ...(tally || ['', '', '', '', '', ''])].map(esc).join(' | ')} |`);
  const note = (scope, kind, detail) => notes.push(`| ${esc(scope)} | ${kind} | ${cell(detail)} |`);
  function pushPendingAndStrays(scope) {
    const pages = pending.get(scope);
    if (pages) {
      note(scope, 'pending publish', pendingLine(scope, pages));
      pendingShown.add(scope);
    }
    const strayFiles = strays.get(scope);
    if (strayFiles) {
      note(scope, 'stray files', strayLine(strayFiles));
      straysShown.add(scope);
    }
  }
  function pushRecords(scope, lines) {
    for (const [label, header] of [['degraded', 'Degraded'], ['unresolved', 'Unresolved'], ['deferred', 'Deferred'], ['minors', 'Minors']]) {
      const bullets = readBullets(lines, header);
      if (bullets.length) note(scope, label, bullets.join(', '));
    }
    const deploy = getHeader(lines, 'Deploy');
    if (deploy) note(scope, 'deploy', deploy);
  }
  for (const scope of entries) {
    let lines;
    try {
      lines = readLines(path.join(scopesDir, scope));
    } catch {
      row(scope, 'ledger unreadable');
      pushPendingAndStrays(scope);
      continue;
    }
    try {
      const stage = getHeader(lines, 'Stage');
      const step = getHeader(lines, 'Step');
      const stageCell = `${stage || ''}${step ? `, step: ${step}` : ''}`;
      const slices = tableRowIndexes(lines).map((i) => splitRow(lines[i]));
      if (slices.some((c) => c.length !== 7)) {
        row(scope, 'ledger unreadable');
        pushPendingAndStrays(scope);
        continue;
      }
      // A shipped or closed scope is finished with. `closed` is where `hooks/scope-prune.js` reaps its
      // run root once the TTL elapses (ADR 0106); a `shipped` one waits for
      // `/superdev:wrap-up` to close it. Neither is work in flight: a shipped scope's row carries no tally
      // and no blocked list, and a closed scope gets no row at all. Its degrade record, unresolved-defect record, deferred-finding record, Minor queue,
      // and staged-page notes are the deliberate exceptions: a degraded pass is otherwise recorded only in
      // the pull-request body, which the same prune outlives it by (scope-findings `## Degraded passes`); an
      // unresolved defect the same way (scope-findings `## Unresolved defects`); a deferred finding likewise,
      // and it is the one record naming work nobody has planned yet (ADR 0035); and a page nobody publishes
      // is invisible everywhere else (ADR 0023) — a finished scope is exactly where any of them waits.
      if (stage === 'shipped' || stage === 'closed') {
        if (stage === 'shipped') row(scope, stageCell);
        pushRecords(scope, lines);
        pushPendingAndStrays(scope);
        continue;
      }
      const counts = { todo: 0, 'in-progress': 0, 'in-review': 0, blocked: 0, merged: 0 };
      const blocked = [];
      for (const c of slices) {
        if (counts[c[5]] !== undefined) counts[c[5]]++;
        if (c[5] === 'blocked') blocked.push(`${esc(c[0])} ${esc(c[2])}`);
      }
      row(scope, stageCell, [slices.length, counts.todo, counts['in-progress'], counts['in-review'], counts.blocked, counts.merged]);
      if (blocked.length) note(scope, 'blocked', blocked.join(', '));
      pushRecords(scope, lines);
      pushPendingAndStrays(scope);
    } catch {
      row(scope, 'ledger unreadable');
      pushPendingAndStrays(scope);
    }
  }
  // A pending scope with no readable ledger still has pages (or stray files) waiting: `_adhoc` never has
  // a run root, and a pruned or unreadable run leaves one behind too. Reporting only the scopes above
  // would hide exactly the pages, and the stray files, least likely to be remembered.
  const unreported = new Set([...pending.keys(), ...strays.keys()].filter((s) => !pendingShown.has(s) && !straysShown.has(s)));
  for (const scope of [...unreported].sort()) {
    row(scope, 'no ledger');
    const pages = pending.get(scope);
    if (pages) note(scope, 'pending publish', pendingLine(scope, pages));
    const strayFiles = strays.get(scope);
    if (strayFiles) note(scope, 'stray files', strayLine(strayFiles));
  }
  if (loose.length > 0) notes.push(`|  | loose files | ${looseLine(loose)} |`);
  const out = [];
  if (rows.length) out.push('| Run | Stage | Slices | todo | in-progress | in-review | blocked | merged |', '|---|---|---|---|---|---|---|---|', ...rows);
  if (rows.length && notes.length) out.push('');
  if (notes.length) out.push('| Run | Note | Detail |', '|---|---|---|', ...notes);
  // Every run root is closed and carries no note: nothing is left to show.
  if (out.length === 0) out.push('No open superdev runs in this repo.');
  console.log(out.join('\n'));
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

module.exports = { verbStatus, verbStaging };
