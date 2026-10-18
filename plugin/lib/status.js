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
