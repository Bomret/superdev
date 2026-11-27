'use strict';

// prototype-branch.js: the `prototype push` verb, which pushes a run's local `prototype/<slug>` branches to the remote
// as `prototype/<scope>/<slug>`, never by force, and records each pushed branch with its commit in the ledger's
// `**Prototypes:**` header, a push its bound ended included once an ls-remote reads the remote branch at that commit,
// and its `--delete` flag, which deletes every recorded branch under a lease on its recorded
// commit (ADR 0287, INV-0210). A read with no verdict (ADR 0290) stops a push after recording what it pushed, and marks
// its branch `unknown` under `--delete`.

const { resolveCommit } = require('./git-spawn.js');
const { resolveRemote } = require('./remote.js');
const { fail } = require('./refusal.js');
const { takeOption, takeRootOption } = require('./options.js');
const { SLUG_RE, readLines, writeLines, getHeader, headerRe, insertHeader } = require('./ledger.js');
const { withRunLock } = require('./run-digest.js');
const { gitCall, lastLine, shownRemote, boundEnded, CREDENTIAL_RE } = require('./push.js');

const HEADER = 'Prototypes';

// Exit 0 when every branch pushed; push.js's not-pushed exit when none did; this one when some did and some did not.
const NOT_PUSHED_EXIT = 3;
const SOME_PUSHED_EXIT = 5;

function parseArgs(args) {
  const rest = [...args];
  const opts = { branches: [], del: false };
  while (rest.length) {
    const word = rest[0];
    if (word === '--root') opts.root = takeRootOption(rest, 'prototype push: ');
    else if (word === '--remote') opts.remote = takeOption(rest, '--remote', 'prototype push: ', (v) => v === '--root' || v === '--remote' || v === '--delete');
    else if (word === '--delete' && !opts.del) opts.del = Boolean(rest.shift());
    else opts.branches.push(rest.shift());
  }
  if (opts.root === undefined) fail('prototype push needs --root <run-root>');
  if (opts.del) {
    if (opts.branches.length) fail(`prototype push --delete takes no branch argument, and got "${opts.branches[0]}"`);
    return opts;
  }
  if (opts.remote === undefined) fail('prototype push needs --remote <remote>');
  if (!opts.branches.length) fail('prototype push needs at least one prototype branch');
  return opts;
}

// The scope slug: the ledger's `**Branch:**` label after its `<type>/`. It never comes from an argument.
function scopeOf(root) {
  const branch = getHeader(readLines(root), 'Branch');
  const cut = branch ? branch.indexOf('/') : -1;
  const scope = cut >= 0 ? branch.slice(cut + 1) : '';
  if (!SLUG_RE.test(scope)) fail(`prototype push: the ledger under ${root} carries no **Branch:** line naming a <type>/<scope> label`);
  return scope;
}

// The prototype's slug out of either spelling, `prototype/<slug>` or `prototype/<scope>/<slug>`; any other name is
// refused before any git process runs.
function slugOf(name, scope) {
  for (const prefix of [`prototype/${scope}/`, 'prototype/']) {
    if (name.startsWith(prefix) && SLUG_RE.test(name.slice(prefix.length))) return name.slice(prefix.length);
  }
  fail(`prototype push: "${name}" names no prototype branch — a prototype branch is prototype/<slug> or prototype/${scope}/<slug>, <slug> matching [a-zA-Z0-9][a-zA-Z0-9_-]*`);
}

function verbPrototypePush(cwd, args) {
  const { root, remote, branches, del } = parseArgs(args);
  if (del) {
    verbPrototypeDelete(cwd, root, remote);
    return [];
  }
  const scope = scopeOf(root);
  const slugs = [...new Set(branches.map((b) => slugOf(b, scope)))];
  const pushed = [];
  const lines = [];
  // A read with no verdict (ADR 0290) stops the push at that slug: every slug pushed before it is printed and recorded first,
  // and the refusal is the verb's one stderr line.
  const report = () => {
    if (pushed.length) record(root, pushed);
    if (lines.length) console.log(lines.join('\n'));
  };
  for (const slug of slugs) {
    let outcome;
    try {
      outcome = pushOne(cwd, remote, scope, slug);
    } catch (e) {
      if (e.noVerdict) report();
      throw e;
    }
    lines.push(outcome.line);
    if (outcome.commit) pushed.push({ branch: `prototype/${scope}/${slug}`, commit: outcome.commit });
  }
  report();
  if (pushed.length === slugs.length) return pushed;
  process.exitCode = pushed.length ? SOME_PUSHED_EXIT : NOT_PUSHED_EXIT;
  return pushed;
}

function pushOne(cwd, remote, scope, slug) {
  const local = `refs/heads/prototype/${slug}`;
  const target = `refs/heads/prototype/${scope}/${slug}`;
  const name = `prototype/${scope}/${slug}`;
  const byHand = `run by hand: git push ${shownRemote(remote)} ${local}:${target}`;
  const commit = resolveCommit(local, cwd);
  if (!commit) return { line: `missing prototype/${slug} is no local branch; nothing pushed for ${name}; ${byHand}` };
  const r = gitCall(['push', '--end-of-options', remote, `${local}:${target}`], cwd, true);
  if (r.signal != null) {
    const ended = `the push was ${boundEnded(cwd, r.signal)}`;
    if (remoteTipOf(cwd, remote, target) === commit) return { line: `pushed ${name} ${commit}: ${ended}, and a bounded ls-remote confirmed the remote branch at that commit`, commit };
    return { line: `timed-out ${name}: ${ended}; its outcome is unknown and nothing is recorded; ${byHand}` };
  }
  if (r.status === 0) return { line: `pushed ${name} ${commit}`, commit };
  return { line: `${failedWord(r)} ${name}: ${lastLine(r, remote)}; ${byHand}` };
}

// The remote's tip of `ref` through one ls-remote under the push's own bound, or null where the call ended without an
// answer or the remote holds no such ref.
function remoteTipOf(cwd, remote, ref) {
  const read = gitCall(['ls-remote', '--end-of-options', remote, ref], cwd, true);
  if (read.signal != null || read.status !== 0) return null;
  const hit = read.stdout.split('\n').map((l) => l.split('\t')).find((p) => p[1] === ref);
  return hit ? hit[0].trim() : null;
}

// A plain push the remote rejects as no fast-forward means a remote branch of that name at another commit.
function failedWord(r) {
  const stderr = r.stderr || '';
  if (/^\s*! \[rejected\]/m.test(stderr)) return 'refused';
  if (CREDENTIAL_RE.test(stderr)) return 'credential-rejected';
  if (/unable to access|Could not read from remote repository|does not appear to be a git repository|Could not resolve host|Connection (refused|timed out)/i.test(stderr)) return 'unreachable';
  return 'push-failed';
}

// One bullet per pushed branch, `- prototype/<scope>/<slug> <commit>`, keyed by branch: a re-push replaces that
// branch's bullet, and every other bullet stays. The read and the write share one hold (INV-0202).
function record(root, pushed) {
  withRunLock(root, () => {
    const lines = readLines(root);
    if (!prototypeSpan(lines)) {
      insertHeader(lines, HEADER, '');
      lines[prototypeSpan(lines).at] = `**${HEADER}:**`;
    }
    const { at, end } = prototypeSpan(lines);
    const kept = new Map(lines.slice(at + 1, end).map((l) => [l.slice(2).split(' ')[0], l]));
    for (const p of pushed) kept.set(p.branch, `- ${p.branch} ${p.commit}`);
    lines.splice(at + 1, end - at - 1, ...kept.values());
    writeLines(root, lines);
  });
}

// `--delete`: every recorded branch deleted from the remote through `branch delete`'s own remote delete, leased on its
// recorded commit; its remote-tracking ref only once the remote branch reads deleted or gone; and the local
// `prototype/<slug>` in this clone only where it points at the recorded commit. Every bullet is tried whatever the
// others did, and the ledger is never written. A record that fails adopt's check is refused before any git call.
function verbPrototypeDelete(cwd, root, given) {
  const lines = readLines(root);
  const recorded = prototypeBlock(lines).slice(1).map((l) => l.slice(2).split(' '));
  if (!recorded.length) {
    console.log(`nothing is recorded: the ledger under ${root} carries no **${HEADER}:** bullet, so no prototype branch is deleted`);
    return;
  }
  const scope = scopeOf(root);
  checkPrototypeRecord(lines, scope, `prototype push --delete: the ledger under ${root}`);
  const { deleteOnRemote, isNamedRemote, KEPT_EXIT } = require('./branch-delete.js');
  const remote = resolveRemote(cwd, given);
  // A read with no verdict (ADR 0290) leaves its branch `unknown <branch> <reason>`, and every other branch is still tried.
  let named = false;
  let unread = null;
  try {
    named = remote ? isNamedRemote(cwd, remote) : false;
  } catch (e) {
    if (!e.noVerdict) throw e;
    unread = e.message;
  }
  const out = [];
  for (const [branch, commit] of recorded) {
    if (unread) {
      out.push(`unknown ${branch} ${unread}`);
      continue;
    }
    const slug = branch.slice(`prototype/${scope}/`.length);
    const ref = `refs/heads/${branch}`;
    const noRemote = `remote not-reached ${branch}: no remote is configured or given; run by hand: git push --force-with-lease=${ref}:${commit} --delete <remote> ${ref}`;
    let local = null;
    try {
      local = deleteLocal(cwd, slug, commit);
      const { tracking, remoteLine } = deleteOnRemote(cwd, remote, named, branch, commit, noRemote);
      out.push(local, tracking, remoteLine);
    } catch (e) {
      if (!e.noVerdict) throw e;
      out.push(...(local ? [local] : []), `unknown ${branch} ${e.message}`);
    }
  }
  console.log(out.join('\n'));
  if (!out.every((l) => ['deleted', 'gone'].includes(l.split(' ')[1]))) process.exitCode = KEPT_EXIT;
}

// The local `prototype/<slug>` in this clone, deleted only at the recorded commit.
function deleteLocal(cwd, slug, commit) {
  const name = `prototype/${slug}`;
  const tip = resolveCommit(`refs/heads/${name}`, cwd);
  if (!tip) return `local gone ${name}`;
  if (tip !== commit) return `local kept ${name}: it points at ${tip}, another commit than the recorded ${commit}`;
  const r = gitCall(['branch', '-D', '--end-of-options', name], cwd);
  if (r.status === 0) return `local deleted ${name} was ${commit}`;
  return `local kept ${name}: ${lastLine(r)}; run by hand: git branch -D ${name}`;
}

// The span of the `**Prototypes:**` line and the bullets under it: `at` the header's index and `end` the index past
// its last bullet, or null where the lines carry no such header.
function prototypeSpan(lines) {
  const at = lines.findIndex((l) => headerRe(HEADER).test(l));
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith('- ')) end++;
  return { at, end };
}

// The `**Prototypes:**` line and the bullets under it, as ledger lines, or none where the ledger carries no such line.
function prototypeBlock(lines) {
  const span = prototypeSpan(lines);
  return span ? lines.slice(span.at, span.end) : [];
}

// The check of a record, adopt's on a run-state payload and `--delete`'s on the ledger, `what` naming the source in a
// refusal: one `**Prototypes:**` line at most, and each bullet a branch `prototype/<scope>/<slug>` of this scope with
// a valid slug, a full commit id of 40 or 64 lowercase hex characters, and no branch named twice. The anchor body is
// editable by anyone with issue access, and wrap-up deletes what the record names, so a refusal names the bullet.
function checkPrototypeRecord(lines, scope, what) {
  if (lines.filter((l) => headerRe(HEADER).test(l)).length > 1) fail(`${what} carries more than one **${HEADER}:** line`);
  const seen = new Set();
  for (const line of prototypeBlock(lines).slice(1)) {
    const bullet = line.slice(2);
    const [branch, commit, ...extra] = bullet.split(' ');
    const prefix = `prototype/${scope}/`;
    if (!branch.startsWith(prefix) || !SLUG_RE.test(branch.slice(prefix.length))) fail(`${what}'s **${HEADER}:** bullet "${bullet}" names no branch prototype/${scope}/<slug>`);
    if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(commit || '') || extra.length) fail(`${what}'s **${HEADER}:** bullet "${bullet}" carries no full commit id`);
    if (seen.has(branch)) fail(`${what}'s **${HEADER}:** bullet names ${branch} twice`);
    seen.add(branch);
  }
}

module.exports = { verbPrototypePush, prototypeBlock, checkPrototypeRecord };
