'use strict';

// abandon.js: the `abandon` verb (ADR 0288, INV-0211). `abandon inventory` prints everything local a run owns, marks what
// would lose work, and ends in a `token <hex>` line that hashes every item line. It writes nothing. `computeInventory` is the
// in-process function `abandon apply` (`abandon-apply.js`) recomputes the inventory with.
//
// An item line is tab-separated: `<kind>\t<subject>\t<tip>\t<mark>...`. The tip is a commit id, a content hash, or `-`. A mark
// is `dirty`, `status=<hash>`, `uncontained <n>`, `loss`, `pages=<n>`, `files=<n>`, `kept-checked-out`, `stale`, `stage=<stage>`, or
// `unknown <reason>`: a read that failed or timed out never reads as safe (INV-0009). A containment test with a local read a
// signal ended marks its branch `unknown <verb> signal <signal>`, and a `git remote` read with no verdict lists the tracking ref
// at tip `-`, marked `unknown remote not read: <reason>` (ADR 0290). Items print in removal order.
//
// A run root is one target. The other two have no run root: an intent file (`--intent-file`, one `intent-file` item) and named
// prototype branches (`--prototype prototype/<slug>`, a `prototype-worktree` item where git registers
// `<main>/.superdev/prototypes/<slug>`, and a `prototype-branch` item). `--prototype` joins `--root` or an intent file, or
// stands alone as the form for an intent record target. The verb lists and deletes only the names it was given.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { localRead, listWorktrees } = require('./git-spawn.js');
const { fail, readPresent } = require('./refusal.js');
const { takeOption, takeRootOption } = require('./options.js');
const { CHANGE_TYPES, STAGES, SLUG_RE, readLedgerHeader } = require('./ledger.js');
const { mainWorkTree } = require('./main-work-tree.js');
const { drivePath } = require('./drive-path.js');
const { realish } = require('./discard.js');
const { resolveRemote } = require('./remote.js');
const { readLock, STALENESS_MS } = require('./run-lock.js');
const { judgeContainment } = require('./containment.js');
const { namesBase, isNamedRemote } = require('./branch-delete.js');
const { gitCall, lastLine, shownRemote, boundEnded } =require('./push.js');
const { configuredRemote, refName, seenRef } = require('./run-state-ref.js');

// Every read made through `localCall` carries the local-read bound and a kill signal (INV-0009, ADR 0290): a read that is
// ended carries no verdict.
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
// A subject or mark on an item line holds no tab or line break.
const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, '?');

function localCall(args, cwd) {
  return localRead(args, cwd, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] });
}

// Why a git call read nothing, for an `unknown` mark.
function whyNot(result, remote) {
  if (result.signal != null) return `timed-out (signal ${result.signal})`;
  if (result.error) return `could not start (${result.error.code || result.error.message})`;
  return lastLine(result, remote);
}

function makeItem(kind, subject, tip, marks = [], extra = {}) {
  const t = tip || '-';
  const line = [kind, clean(subject), t, ...marks.map(clean)].join('\t');
  return { kind, subject, tip: t, marks, line, ...extra };
}

const unknown = (reason) => `unknown ${reason}`;

// A `--prototype` value: `prototype/<slug>` with a slug `SLUG_RE` accepts, checked before any git process runs, as is a name
// equal to `--base`. A remote-qualified spelling of base needs the resolved remote, so `prototypeItems` checks it again.
const PROTOTYPE_PREFIX = 'prototype/';
const isPrototypeName = (v) => v.startsWith(PROTOTYPE_PREFIX) && SLUG_RE.test(v.slice(PROTOTYPE_PREFIX.length));

function parseArgs(sub, args) {
  const opts = {};
  const flags = { '--root': 'root', '--base': 'base', '--remote': 'remote', '--intent-file': 'intentFile', ...(sub === 'apply' ? { '--token': 'token' } : {}) };
  const ownFlag = (v) => Object.hasOwn(flags, v) || v === '--prototype';
  const prefix = `abandon ${sub}: `;
  const rest = [...args];
  const prototypes = [];
  while (rest.length) {
    const flag = rest[0];
    if (!ownFlag(flag)) fail(`abandon ${sub}: unrecognized argument "${flag}"`);
    if (flag === '--prototype') {
      const value = rest[1];
      if (value === undefined || value === '' || value.startsWith('--')) fail(`${prefix}--prototype needs a value`);
      if (!isPrototypeName(value)) fail(`${prefix}--prototype ${value} is no prototype branch: it must be ${PROTOTYPE_PREFIX}<slug>`);
      if (prototypes.includes(value)) fail(`${prefix}--prototype ${value} given twice`);
      prototypes.push(value);
      rest.splice(0, 2);
      continue;
    }
    opts[flags[flag]] = flag === '--root' ? takeRootOption(rest, prefix) : takeOption(rest, flag, prefix, ownFlag);
  }
  if (opts.root !== undefined && opts.intentFile !== undefined) fail(`abandon ${sub}: --root and --intent-file are mutually exclusive`);
  if (opts.root === undefined && opts.intentFile === undefined && !prototypes.length) fail(`abandon ${sub} needs --root <run-root>, --intent-file <path>, or --prototype <branch>`);
  if (opts.base === undefined) fail(`abandon ${sub} needs --base <base-ref>`);
  for (const name of prototypes) if (namesBase(name, opts.base, null)) fail(`${prefix}--prototype ${name} names the base branch ${opts.base}; abandon never removes base`);
  opts.prototypes = prototypes;
  return opts;
}

// The marks of one branch tip: `uncontained <n>` where base lacks commits of it, `unknown <reason>` where the test could not
// judge, a local read a signal ended included (its `unread` field, ADR 0290). The test runs against the local base alone, so
// it fetches and writes nothing; a squash-merged branch whose base was not pulled reads uncontained, which keeps its commits.
function containmentMarks(cwd, base, tip) {
  const judged = judgeContainment(cwd, base, tip, null);
  if (judged.unread) return [unknown(`${judged.unread.verb} signal ${judged.unread.signal}`)];
  if (judged.verdict === 'contained') return [];
  if (judged.verdict === 'could-not-resolve') return [unknown('the tip does not resolve to a commit here')];
  const count = localCall(['rev-list', '--count', '--end-of-options', `${base}..${tip}`], cwd);
  if (count.status !== 0 || !/^\d+$/.test(count.stdout.trim())) return [unknown(`commits past base not counted: ${whyNot(count)}`)];
  return [`uncontained ${count.stdout.trim()}`];
}

// A directory's files, recursively, as one hash over relative paths and contents, and their count.
function walkFiles(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  files.sort();
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(`${path.relative(dir, f)}\0`).update(fs.readFileSync(f)).update('\0');
  return { count: files.length, hash: h.digest('hex').slice(0, 16) };
}

// One hash over a worktree's `status --porcelain -z` text and the content of every changed path that is not a deletion, in
// porcelain order, so a further edit to a file already listed as changed moves it. A symlink hashes its target text. A
// directory entry (a nested repository or a submodule) hashes its own HEAD and its own status hash, recursively, and throws
// where either read fails, so the caller marks the tree unknown.
function statusHash(porcelain, dir) {
  const h = crypto.createHash('sha256').update(porcelain).update('\0');
  const entries = porcelain.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.length < 4) continue;
    const xy = e.slice(0, 2);
    const file = path.join(dir, e.slice(3));
    if (/[RC]/.test(xy)) i++;
    if (xy.includes('D')) continue;
    const stat = fs.lstatSync(file);
    h.update(`${e.slice(3)}\0`);
    if (stat.isSymbolicLink()) h.update(fs.readlinkSync(file));
    else if (stat.isFile()) h.update(fs.readFileSync(file));
    else if (stat.isDirectory()) h.update(nestedHash(file));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

// The state of a nested repository: its HEAD (`unborn` where git reports none, exit 1) and the hash of its own status. A HEAD
// or status read that ended by signal, error, or any other exit throws.
function nestedHash(dir) {
  const head = localCall(['rev-parse', '--verify', '--quiet', 'HEAD'], dir);
  if (head.status !== 0 && (head.signal != null || head.error || head.status !== 1)) throw new Error(`nested repository HEAD not read: ${whyNot(head)}`);
  const status = localCall(['status', '--porcelain', '-z', '--untracked-files=all'], dir);
  if (status.status !== 0) throw new Error(`nested repository status not read: ${whyNot(status)}`);
  return `${head.status === 0 ? head.stdout.trim() : 'unborn'}\0${statusHash(status.stdout, dir)}`;
}

// The item of one registered worktree that exists: its HEAD, and `dirty` with a `status=` hash where it holds changes.
function worktreeItem(kind, dir) {
  const head = localCall(['rev-parse', 'HEAD'], dir);
  const status = localCall(['status', '--porcelain', '-z', '--untracked-files=all'], dir);
  const marks = [];
  if (status.status !== 0) marks.push(unknown(`status not read: ${whyNot(status)}`));
  else if (status.stdout) {
    try {
      marks.push('dirty', `status=${statusHash(status.stdout, dir)}`);
    } catch (e) {
      marks.push('dirty', unknown(`changed files not read (${e.code || e.message})`));
    }
  }
  return makeItem(kind, dir, head.status === 0 ? head.stdout.trim() : null, head.status === 0 ? marks : [unknown(`HEAD not read: ${whyNot(head)}`), ...marks]);
}

function stagedItem(kind, dir, unit = 'pages') {
  if (!fs.existsSync(dir)) return null;
  try {
    const { count, hash } = walkFiles(dir);
    return makeItem(kind, dir, hash, [`${unit}=${count}`, ...(count > 0 ? ['loss'] : [])]);
  } catch (e) {
    return makeItem(kind, dir, null, [unknown(`cannot read the ${unit} (${e.code || e.message})`)]);
  }
}

function fileItem(file, kind = 'file') {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (e) {
    return e.code === 'ENOENT' ? null : makeItem(kind, file, null, [unknown(`cannot read (${e.code})`)]);
  }
  try {
    return makeItem(kind, file, stat.isFile() ? sha(fs.readFileSync(file)).slice(0, 16) : null, stat.isFile() ? [] : [unknown('not a regular file')]);
  } catch (e) {
    return makeItem(kind, file, null, [unknown(`cannot read (${e.code || e.message})`)]);
  }
}

// The local read of one ref's commit: `{ tip }`, `{}` where the ref is absent (exit 1), or `{ why }` where the call ended by
// signal, error, or any other exit.
function readTip(cwd, ref) {
  const r = localCall(['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`], cwd);
  if (r.status === 0) return { tip: r.stdout.trim() };
  if (r.signal != null || r.error || r.status !== 1) return { why: `tip not read: ${whyNot(r)}` };
  return {};
}

// The ls-remote read of one remote ref: `{ tip }`, `{ gone: true }`, or `{ why }`.
function readRemoteRef(cwd, remote, ref) {
  const r = gitCall(['ls-remote', '--end-of-options', remote, ref], cwd, true);
  if (r.signal != null) return { why: `ls-remote was ${boundEnded(cwd, r.signal)}` };
  if (r.status !== 0) return { why: `ls-remote failed: ${lastLine(r, remote)}` };
  const hit = r.stdout.split('\n').map((l) => l.split('\t')).find((p) => p[1] === ref);
  return hit ? { tip: hit[0].trim() } : { gone: true };
}

// The one `intent-file` item of `--intent-file`: the path must resolve, after symlinks, to `<main>/.superdev/brainstorm/<slug>.md`.
// A file already gone lists nothing.
function intentItem(cwd, mwt, arg) {
  const dir = realish(path.join(mwt, '.superdev', 'brainstorm'));
  const p = realish(path.resolve(cwd, drivePath(arg)));
  const name = path.basename(p);
  if (path.dirname(p) !== dir || !name.endsWith('.md') || !SLUG_RE.test(name.slice(0, -3))) fail(`abandon: ${arg} is no intent file: it must resolve to ${dir}${path.sep}<slug>.md`);
  return fileItem(p, 'intent-file');
}

// The items of the named prototype branches, each a `prototype-worktree` item (where git registers its detour worktree) then a
// `prototype-branch` item (where the branch exists).
function prototypeItems(mwt, base, remote, names) {
  const items = [];
  const listed = names.length ? listWorktrees(mwt) : null;
  const protos = realish(path.join(mwt, '.superdev', 'prototypes'));
  for (const name of names) {
    if (namesBase(name, base, remote)) fail(`abandon: --prototype ${name} names the base branch ${base}; abandon never removes base`);
    const treePath = path.join(protos, name.slice(PROTOTYPE_PREFIX.length));
    if (listed.failure) items.push(makeItem('prototype-worktree', treePath, null, [unknown(listed.failure)]));
    else {
      const t = listed.trees.find((x) => realish(drivePath(x.path)) === treePath);
      if (t && !fs.existsSync(treePath)) items.push(makeItem('prototype-worktree', treePath, null, ['stale']));
      else if (t) items.push(worktreeItem('prototype-worktree', treePath));
    }
    const ref = `refs/heads/${name}`;
    const read = readTip(mwt, ref);
    if (read.tip) items.push(makeItem('prototype-branch', ref, read.tip, containmentMarks(mwt, base, read.tip)));
    else if (read.why) items.push(makeItem('prototype-branch', ref, null, [unknown(read.why)]));
  }
  return items;
}

// The inventory of a target with no run root: an intent file, prototype branches, or both.
function detourInventory(cwd, { base, remote: given, intentFile, prototypes }) {
  const mwt = mainWorkTree(cwd);
  if (mwt === null) fail(`abandon: not inside a git repository (cwd: ${cwd})`);
  const remote = resolveRemote(cwd, given);
  const items = [];
  if (intentFile !== undefined) {
    const it = intentItem(cwd, mwt, intentFile);
    if (it) items.push(it);
  }
  items.push(...prototypeItems(mwt, base, remote, prototypes));
  const lines = items.map((i) => i.line);
  return { items, lines, token: sha(`${lines.join('\n')}\n`), root: null, remote, mainTree: mwt };
}

// Refuses a run that cannot be abandoned and returns what the inventory reads from: the run root, its scope, ledger values,
// and the repository's main working tree.
function checkRun(cwd, rootArg, base, given) {
  const mwt = mainWorkTree(cwd);
  if (mwt === null) fail(`abandon: not inside a git repository (cwd: ${cwd})`);
  const scopes = realish(path.join(mwt, '.superdev', 'scopes'));
  const root = realish(path.resolve(cwd, drivePath(rootArg)));
  if (path.dirname(root) !== scopes) fail(`abandon: ${rootArg} is no run root: it must be ${scopes}${path.sep}<scope>`);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`abandon: ${root} is not a directory`);
  const ledgerFile = path.join(root, 'ledger.md');
  const text = readPresent(ledgerFile, 'utf8');
  if (text === null) fail(`abandon: no ledger at ${ledgerFile}`);
  const stage = readLedgerHeader(text, 'Stage');
  if (!stage || !STAGES.includes(stage)) fail(`abandon: the ledger at ${ledgerFile} names ${stage ? `stage ${stage}` : 'no stage'}, which is no stage of a run`);
  if (stage === 'shipped' || stage === 'closed') fail(`abandon: the run at ${root} is at stage ${stage}; run /superdev:wrap-up for a ${stage} run`);
  const scope = path.basename(root);
  const branch = readLedgerHeader(text, 'Branch');
  if (!branch) fail(`abandon: the ledger at ${ledgerFile} carries no **Branch:** line`);
  const remote = resolveRemote(cwd, given);
  if (namesBase(branch, base, remote)) fail(`abandon: the **Branch:** line names the base branch ${base}; abandon never removes base`);
  const type = branch.split('/')[0];
  if (branch !== `${type}/${scope}` || !CHANGE_TYPES.includes(type)) fail(`abandon: the **Branch:** line ${branch} is not <type>/${scope}`);
  const lock = readLock(path.join(root, 'run.lock'), 'abandon');
  if (lock && lock.age < STALENESS_MS) {
    const staleAt = new Date(Date.now() - lock.age + STALENESS_MS).toISOString();
    fail(`abandon: the run lock ${path.join(root, 'run.lock')} is under an hour old (${lock.text.replace(/\s+/g, ' ')}); it goes stale at ${staleAt}. Abandon cannot tell a stopped session from a live one and offers no override`);
  }
  return { mwt, root, scope, stage, branch, remote, lock };
}

// The inventory of a run: `{ items, lines, token, root, scope, branch, remote, stateRemote, mainTree, stage }`. A refusal throws
// as `fail` does. `base` is the run's base ref and `given` the `--remote` value, or undefined.
function computeInventory(cwd, { root: rootArg, base, remote: given, intentFile, prototypes = [] }) {
  if (rootArg === undefined) return detourInventory(cwd, { base, remote: given, intentFile, prototypes });
  const run = checkRun(cwd, rootArg, base, given);
  const { mwt, root, scope, stage, branch, remote, lock } = run;
  const items = [];
  // A `git remote` read with no verdict (ADR 0290) leaves the tracking ref unread: it is listed at tip `-`, marked unknown.
  let named = false;
  let remoteUnread = null;
  try {
    named = remote ? isNamedRemote(mwt, remote) : false;
  } catch (e) {
    if (!e.noVerdict) throw e;
    remoteUnread = e.message;
  }

  // Worktrees: every one git registers under the run root, the scopetree last; the others elsewhere only hold branches.
  const listed = listWorktrees(mwt);
  const inside = [];
  const outside = new Map();
  if (listed.failure) {
    items.push(makeItem('worktree', root, null, [unknown(listed.failure)]));
  } else {
    for (const t of listed.trees) {
      const p = realish(drivePath(t.path));
      if (p.startsWith(root + path.sep)) inside.push({ ...t, path: p });
      else if (t.branch) outside.set(t.branch, p);
    }
  }
  const scopetree = path.join(root, 'scopetree');
  inside.sort((a, b) => (a.path === scopetree) - (b.path === scopetree) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const t of inside) {
    if (!fs.existsSync(t.path)) {
      items.push(makeItem('worktree', t.path, null, ['stale']));
      continue;
    }
    items.push(worktreeItem('worktree', t.path));
    const staged = stagedItem('kb-staged', path.join(t.path, '.superdev', 'kb-pending'));
    if (staged) items.push(staged);
  }
  // A tree directory of the run that git no longer registers, such as one whose registration was pruned with its files
  // left: the run root's removal takes it, so its files are listed as loss.
  const unregistered = [];
  if (!listed.failure) {
    const registered = new Set(inside.map((t) => t.path));
    const isDir = (p) => fs.existsSync(p) && fs.lstatSync(p).isDirectory();
    const slicetrees = path.join(root, 'slicetrees');
    const ids = isDir(slicetrees) ? fs.readdirSync(slicetrees).sort() : [];
    for (const dir of [...ids.map((id) => path.join(slicetrees, id)), scopetree]) {
      if (!registered.has(dir) && isDir(dir)) unregistered.push(stagedItem('unregistered-tree', dir, 'files'));
    }
  }

  // Branches. A branch of this run checked out outside the run root's worktrees stays where it is checked out.
  const branchMarks = (name, tip) => [...(outside.has(name) ? ['kept-checked-out'] : []), ...containmentMarks(mwt, base, tip)];
  const sliceRefs = localCall(['for-each-ref', '--format=%(refname)%09%(objectname)', `refs/heads/slice/${scope}/`], mwt);
  if (sliceRefs.status !== 0) items.push(makeItem('slice-branch', `refs/heads/slice/${scope}/`, null, [unknown(`branches not listed: ${whyNot(sliceRefs)}`)]));
  else {
    for (const l of sliceRefs.stdout.split('\n').filter(Boolean).sort()) {
      const [ref, tip] = l.split('\t');
      items.push(makeItem('slice-branch', ref, tip, branchMarks(ref.slice('refs/heads/'.length), tip)));
    }
  }
  const localRef = `refs/heads/${branch}`;
  const local = readTip(mwt, localRef);
  if (local.tip) items.push(makeItem('scope-branch', localRef, local.tip, branchMarks(branch, local.tip)));
  else if (local.why) items.push(makeItem('scope-branch', localRef, null, [unknown(local.why)]));
  const trackingRef = named || remoteUnread ? `refs/remotes/${remote}/${branch}` : null;
  const tracking = named ? readTip(mwt, trackingRef) : {};
  if (remoteUnread) items.push(makeItem('scope-tracking', trackingRef, null, [unknown(`remote not read: ${remoteUnread}`)]));
  else if (tracking.tip) items.push(makeItem('scope-tracking', trackingRef, tracking.tip, containmentMarks(mwt, base, tracking.tip)));
  else if (tracking.why) items.push(makeItem('scope-tracking', trackingRef, null, [unknown(tracking.why)]));
  if (remote) {
    const ref = `refs/heads/${branch}`;
    const read = readRemoteRef(mwt, remote, ref);
    const subject = `${shownRemote(remote)} ${ref}`;
    if (read.why) items.push(makeItem('scope-remote', subject, null, [unknown(read.why)], { remote, ref }));
    else if (read.tip) items.push(makeItem('scope-remote', subject, read.tip, containmentMarks(mwt, base, read.tip), { remote, ref }));
  }

  // The run-state ref on the remote the run-state push uses, and its local seen ref.
  const stateRemote = configuredRemote(mwt).remote || null;
  const stateRef = refName(scope);
  if (stateRemote && stateRef) {
    const read = readRemoteRef(mwt, stateRemote, stateRef);
    const subject = `${shownRemote(stateRemote)} ${stateRef}`;
    if (read.why) items.push(makeItem('run-state-ref', subject, null, [unknown(read.why)], { remote: stateRemote, ref: stateRef }));
    else if (read.tip) items.push(makeItem('run-state-ref', subject, read.tip, [], { remote: stateRemote, ref: stateRef }));
    const seen = seenRef(stateRemote, scope);
    const seenTip = readTip(mwt, seen);
    if (seenTip.tip) items.push(makeItem('run-state-seen', seen, seenTip.tip));
    else if (seenTip.why) items.push(makeItem('run-state-seen', seen, null, [unknown(seenTip.why)]));
  }

  // Drafts, captures, the design sketch, staged pages, the lock, the unregistered trees, and the run root last.
  const sd = path.join(mwt, '.superdev');
  for (const f of [`dod-draft-${scope}.md`, `slice-draft-${scope}.md`, `captures-${scope}.patch`, path.join('design', `${scope}.html`)]) {
    const it = fileItem(path.join(sd, f));
    if (it) items.push(it);
  }
  const pending = stagedItem('kb-pending', path.join(sd, 'kb-pending', scope));
  if (pending) items.push(pending);
  if (lock) items.push(makeItem('lock', path.join(root, 'run.lock'), sha(lock.text).slice(0, 16), ['stale']));
  items.push(...prototypeItems(mwt, base, remote, prototypes));
  items.push(...unregistered);
  items.push(makeItem('run-root', root, null, [`stage=${stage}`]));

  const lines = items.map((i) => i.line);
  const token = sha(`${lines.join('\n')}\n`);
  return { items, lines, token, root, scope, branch, remote, stateRemote, mainTree: mwt, stage };
}

function verbAbandon(cwd, args) {
  const [sub, ...rest] = args;
  if (sub === 'inventory') {
    const inv = computeInventory(cwd, parseArgs(sub, rest));
    console.log([...inv.lines, `token ${inv.token}`].join('\n'));
    return;
  }
  if (sub === 'apply') {
    require('./abandon-apply.js').verbApply(cwd, parseArgs(sub, rest));
    return;
  }
  fail(`abandon: ${sub ? `unknown subverb "${sub}"` : 'needs a subverb'}; use abandon inventory or abandon apply`);
}

module.exports = { verbAbandon, computeInventory, readTip };
