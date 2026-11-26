'use strict';

// abandon-apply.js: the `abandon apply` verb (ADR 0288, INV-0211). It recomputes the inventory, deletes nothing where the
// inventory's hash differs from `--token`, and otherwise removes each item the inventory listed, in removal order: worktrees,
// slice branches, the remote scope branch, its tracking ref, the local scope branch, the run-state ref, drafts, staged pages,
// and the run root last, its ledger the very last file. Every step tolerates an item already gone, every branch goes under a
// lease on the tip the inventory read, and the run root stays while any item reads kept or failed, so a rerun finds the run.
//
// An outcome line is `<kind> <word> <subject> ...`, the word one of `deleted`, `gone`, `kept-moved`, `kept-checked-out`,
// `failed`, `timed-out`, `credential-rejected`, or `not-reached` (`branch-delete.js`'s words). A line carries no remote URL.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { listWorktrees } = require('./git-spawn.js');
const { realish } = require('./discard.js');
const { namesBase, deleteRemote, DONE_WORDS, GATE_EXIT, KEPT_EXIT } = require('./branch-delete.js');
const { gitCall, lastLine, shownRemote } = require('./push.js');
const { deleteRunState } = require('./run-state-ref.js');
const { computeInventory, readTip } = require('./abandon.js');

const word = (line) => line.split(' ')[1];
const branchOf = (ref) => ref.replace(/^refs\/heads\//, '');
// A path in a hand command, single-quoted so a copy-paste survives spaces.
const q = (p) => `'${String(p).replace(/'/g, `'\\''`)}'`;

// The worktree at `item.subject`, removed with its changes, a locked one included (`--force` twice: the token bound the
// operator's confirmation). A stale registration, whose directory is gone, reads gone and leaves the prune to clear it.
function removeWorktree(ctx, item) {
  const p = item.subject;
  const byHand = `git worktree remove --force --force ${q(p)}`;
  if (item.tip === '-' && item.marks.some((m) => m.startsWith('unknown'))) return `worktree failed ${p}: the inventory could not list worktrees; run by hand: git worktree list, then ${byHand} for each tree of the run`;
  if (!fs.existsSync(p)) return `worktree gone ${p}`;
  if (realish(p) !== p || !p.startsWith(ctx.root + path.sep)) return `worktree failed ${p}: it does not resolve inside the run root ${ctx.root}; run by hand: ${byHand}`;
  const r = gitCall(['worktree', 'remove', '--force', '--force', p], ctx.mainTree);
  if (r.status === 0) return `worktree deleted ${p} was ${item.tip}`;
  return fs.existsSync(p) ? `worktree failed ${p}: ${lastLine(r)}; run by hand: ${byHand}` : `worktree deleted ${p} was ${item.tip}`;
}

// One ref deleted under a lease on the inventoried tip: a ref already gone reads gone, one that moved reads kept-moved.
function leasedDelete(ctx, label, ref, tip, shown, byHand) {
  if (tip === '-') return `${label} failed ${shown}: the inventory could not read its tip; run by hand: ${byHand}`;
  const moved = (at) => `${label} kept-moved ${shown} is at ${at}, past the inventoried tip ${tip}; run by hand: ${byHand}`;
  const now = readTip(ctx.mainTree, ref);
  if (now.why) return `${label} failed ${shown}: ${now.why}; run by hand: ${byHand}`;
  if (!now.tip) return `${label} gone ${shown}`;
  if (now.tip !== tip) return moved(now.tip);
  const r = gitCall(['update-ref', '-d', '--end-of-options', ref, tip], ctx.mainTree);
  if (r.status === 0) return `${label} deleted ${shown} was ${tip}`;
  const again = readTip(ctx.mainTree, ref);
  if (again.tip === undefined && !again.why) return `${label} gone ${shown}`;
  if (again.tip && again.tip !== tip) return moved(again.tip);
  return `${label} failed ${shown}: ${lastLine(r)}; run by hand: ${byHand}`;
}

// A local branch of the run: kept where a worktree outside the run still has it checked out, and never base.
function removeBranch(ctx, item) {
  const name = branchOf(item.subject);
  const byHand = `git branch -D ${name}`;
  const label = item.kind === 'slice-branch' ? 'slice-branch' : 'local';
  if (namesBase(name, ctx.base, ctx.remote)) return `${label} failed ${name} names the base branch ${ctx.base}; abandon never removes base`;
  if (ctx.listFailure) return `${label} failed ${name}: worktrees not listed (${ctx.listFailure}), so a checked-out branch cannot be ruled out; run by hand: ${byHand}`;
  const at = ctx.checkedOut.get(name);
  if (at) return `${label} kept-checked-out ${name} is checked out at ${at} and stays there; run by hand: switch that tree to another branch, then ${byHand}`;
  return leasedDelete(ctx, label, item.subject, item.tip, name, byHand);
}

// A draft or capture in `.superdev/`, removed as a file or a link and never followed.
function removeFile(ctx, item) {
  const p = item.subject;
  const byHand = `rm ${q(p)}`;
  if (realish(path.dirname(p)) !== ctx.realSd) return `file failed ${p}: it is not directly inside ${ctx.realSd}; run by hand: ${byHand}`;
  try {
    fs.lstatSync(p);
  } catch (e) {
    return e.code === 'ENOENT' ? `file gone ${p}` : `file failed ${p}: ${e.code}; run by hand: ${byHand}`;
  }
  try {
    fs.rmSync(p, { force: true });
    return `file deleted ${p} was ${item.tip}`;
  } catch (e) {
    return `file failed ${p}: ${e.code || e.message}; run by hand: ${byHand}`;
  }
}

// The staged pages of the scope. The directory removes only where it resolves, links included, to its own name under
// `<main>/.superdev/kb-pending/`: a link that leads elsewhere is refused and its target stays untouched.
function removePending(ctx, item) {
  const p = item.subject;
  const byHand = `rm -r ${q(p)}`;
  try {
    fs.lstatSync(p);
  } catch (e) {
    return e.code === 'ENOENT' ? `kb-pending gone ${p}` : `kb-pending failed ${p}: ${e.code}; run by hand: ${byHand}`;
  }
  if (realish(p) !== path.join(ctx.realSd, 'kb-pending', ctx.scope)) return `kb-pending failed ${p}: it does not resolve to ${path.join(ctx.realSd, 'kb-pending', ctx.scope)}, so nothing was removed; run by hand: ${byHand}`;
  try {
    fs.rmSync(p, { recursive: true, force: true });
    return `kb-pending deleted ${p} was ${item.tip}`;
  } catch (e) {
    return `kb-pending failed ${p}: ${e.code || e.message}; run by hand: ${byHand}`;
  }
}

// The run root, ledger last. Everything inside it resolves under it: `rmSync` removes a link, never its target.
function removeRoot(ctx, item) {
  const p = item.subject;
  const byHand = `rm -r ${q(p)}`;
  if (realish(p) !== path.join(realish(path.join(ctx.mainTree, '.superdev', 'scopes')), ctx.scope)) return `run-root failed ${p}: it does not resolve to its own name under ${path.join(ctx.realSd, 'scopes')}; run by hand: ${byHand}`;
  try {
    for (const name of fs.readdirSync(p)) if (name !== 'ledger.md') fs.rmSync(path.join(p, name), { recursive: true, force: true });
    fs.rmSync(path.join(p, 'ledger.md'), { force: true });
    fs.rmdirSync(p);
    return `run-root deleted ${p}`;
  } catch (e) {
    return `run-root failed ${p}: ${e.code || e.message}; run by hand: ${byHand}`;
  }
}

// `run-state: ...` lines of `deleteRunState` as outcome words: no remote or no code-management.md reads not-reached.
function runStateLine(ctx, item) {
  const text = deleteRunState(ctx.root, ctx.mainTree);
  const ref = item ? item.ref : '';
  if (text.startsWith('run-state: deleted')) return `run-state deleted ${shownRemote(ctx.stateRemote)} ${ref}${item ? ` was ${item.tip}` : ''}`;
  if (text.startsWith('run-state: no ref')) return `run-state gone ${shownRemote(ctx.stateRemote)} ${ref}`;
  const why = text.replace(/^run-state: /, '');
  if (/^not deleted, (no docs\/agents\/code-management\.md|docs\/agents\/code-management\.md has no Remote)/.test(why)) return `run-state not-reached ${why}`;
  return `run-state failed ${why}; run by hand: git push --delete ${shownRemote(ctx.stateRemote || 'the remote')} refs/superdev/${ctx.scope}`;
}

// Removes the items of `inv` and returns the outcome lines. A later item kind joins by adding a phase here, before the run
// root, which only runs once every earlier line reads done.
function removeItems(inv, base) {
  const realSd = realish(path.join(inv.mainTree, '.superdev'));
  const ctx = { ...inv, base, realSd, checkedOut: new Map() };
  const of = (kind) => inv.items.filter((i) => i.kind === kind);
  const lines = [];
  const run = (fn, items) => items.forEach((i) => lines.push(fn(ctx, i)));

  run(removeWorktree, of('worktree'));
  const pruned = gitCall(['worktree', 'prune'], inv.mainTree);
  if (pruned.status !== 0) lines.push(`worktree failed prune: ${lastLine(pruned)}; run by hand: git worktree prune`);
  const listed = listWorktrees(inv.mainTree);
  ctx.listFailure = listed.failure;
  for (const t of listed.trees || []) if (t.branch) ctx.checkedOut.set(t.branch, realish(t.path));
  run(removeBranch, of('slice-branch'));

  // The remote first: the tracking ref goes only once the remote branch reads deleted or gone.
  const remoteItem = of('scope-remote')[0];
  let remoteLine = null;
  if (!inv.remote) remoteLine = 'remote not-reached no remote is configured or given';
  else if (!remoteItem) remoteLine = `remote gone ${shownRemote(inv.remote)} ${inv.branch} is already absent`;
  else if (remoteItem.tip === '-') remoteLine = `remote failed ${shownRemote(inv.remote)} ${inv.branch}: the inventory could not read the remote tip; run by hand: git push --delete ${shownRemote(inv.remote)} ${remoteItem.ref}`;
  else remoteLine = deleteRemote(inv.mainTree, inv.remote, inv.branch, remoteItem.tip);
  lines.push(remoteLine);
  for (const t of of('scope-tracking')) {
    lines.push(['deleted', 'gone'].includes(word(remoteLine))
      ? leasedDelete(ctx, 'tracking', t.subject, t.tip, t.subject, `git update-ref -d ${t.subject}`)
      : `tracking not-reached ${t.subject} is kept beside the remote branch, which reads ${word(remoteLine)}`);
  }
  run(removeBranch, of('scope-branch'));
  lines.push(runStateLine(ctx, of('run-state-ref')[0]));
  run(removeFile, of('file'));
  run(removePending, of('kb-pending'));

  const done = lines.every((l) => DONE_WORDS.includes(word(l)));
  const root = of('run-root')[0];
  if (done) lines.push(removeRoot(ctx, root));
  else lines.push(`run-root not-reached ${root.subject} stays, ledger included, until every item above reads deleted, gone, or not-reached; run the same command again after the kept or failed items are settled`);
  return lines;
}

function verbApply(cwd, opts) {
  if (opts.token === undefined) fail('abandon apply needs --token <hex>');
  const inv = computeInventory(cwd, opts);
  if (inv.token !== opts.token) {
    console.log(['token-mismatch', ...inv.lines, `token ${inv.token}`].join('\n'));
    process.exitCode = GATE_EXIT;
    return;
  }
  const lines = removeItems(inv, opts.base);
  console.log(lines.join('\n'));
  if (!lines.every((l) => DONE_WORDS.includes(word(l)))) process.exitCode = KEPT_EXIT;
}

module.exports = { verbApply };
