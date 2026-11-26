'use strict';

// prototype-branch.js: the `prototype push` verb, which pushes a run's local `prototype/<slug>` branches to the remote
// as `prototype/<scope>/<slug>`, never by force, and records each pushed branch with its commit in the ledger's
// `**Prototypes:**` header (ADR 0287, INV-0210).

const { resolveCommit } = require('./git-spawn.js');
const { fail } = require('./refusal.js');
const { takeOption, takeRootOption } = require('./options.js');
const { SLUG_RE, readLines, writeLines, getHeader, headerRe, insertHeader } = require('./ledger.js');
const { withRunLock } = require('./run-digest.js');
const { gitCall, lastLine, boundEnded, CREDENTIAL_RE } = require('./push.js');

const HEADER = 'Prototypes';

function parseArgs(args) {
  const rest = [...args];
  const opts = { branches: [] };
  while (rest.length) {
    const word = rest[0];
    if (word === '--root') opts.root = takeRootOption(rest, 'prototype push: ');
    else if (word === '--remote') opts.remote = takeOption(rest, '--remote', 'prototype push: ', (v) => v === '--root' || v === '--remote');
    else opts.branches.push(rest.shift());
  }
  if (opts.root === undefined) fail('prototype push needs --root <run-root>');
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
  const { root, remote, branches } = parseArgs(args);
  const scope = scopeOf(root);
  const slugs = [...new Set(branches.map((b) => slugOf(b, scope)))];
  const pushed = [];
  const lines = [];
  for (const slug of slugs) {
    const outcome = pushOne(cwd, remote, scope, slug);
    lines.push(outcome.line);
    if (outcome.commit) pushed.push({ branch: `prototype/${scope}/${slug}`, commit: outcome.commit });
  }
  if (pushed.length) record(root, pushed);
  console.log(lines.join('\n'));
  if (pushed.length === slugs.length) return pushed;
  process.exitCode = pushed.length ? SOME_PUSHED_EXIT : NOT_PUSHED_EXIT;
  return pushed;
}

// Exit 0 when every branch pushed; push.js's not-pushed exit when none did; this one when some did and some did not.
const NOT_PUSHED_EXIT = 3;
const SOME_PUSHED_EXIT = 5;

function pushOne(cwd, remote, scope, slug) {
  const local = `refs/heads/prototype/${slug}`;
  const target = `refs/heads/prototype/${scope}/${slug}`;
  const name = `prototype/${scope}/${slug}`;
  const byHand = `run by hand: git push ${remote} ${local}:${target}`;
  const commit = resolveCommit(local, cwd);
  if (!commit) return { line: `missing prototype/${slug} is no local branch; nothing pushed for ${name}; ${byHand}` };
  const r = gitCall(['push', '--end-of-options', remote, `${local}:${target}`], cwd, true);
  if (r.signal != null) return { line: `timed-out ${name}: the push was ${boundEnded(cwd, r.signal)}; its outcome is unknown and nothing is recorded; ${byHand}` };
  if (r.status === 0) return { line: `pushed ${name} ${commit}`, commit };
  return { line: `${failedWord(r)} ${name}: ${lastLine(r, remote)}; ${byHand}` };
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
    let at = lines.findIndex((l) => headerRe(HEADER).test(l));
    if (at < 0) {
      insertHeader(lines, HEADER, '');
      at = lines.findIndex((l) => headerRe(HEADER).test(l));
      lines[at] = `**${HEADER}:**`;
    }
    let end = at + 1;
    while (end < lines.length && lines[end].startsWith('- ')) end++;
    const kept = new Map(lines.slice(at + 1, end).map((l) => [l.slice(2).split(' ')[0], l]));
    for (const p of pushed) kept.set(p.branch, `- ${p.branch} ${p.commit}`);
    lines.splice(at + 1, end - at - 1, ...kept.values());
    writeLines(root, lines);
  });
}

// The `**Prototypes:**` line and the bullets under it, as ledger lines, or none where the ledger carries no such line.
function prototypeBlock(lines) {
  const at = lines.findIndex((l) => headerRe(HEADER).test(l));
  if (at < 0) return [];
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith('- ')) end++;
  return lines.slice(at, end);
}

// Adopt's check of a run-state payload's record: one `**Prototypes:**` line at most, and each bullet a branch
// `prototype/<scope>/<slug>` of this scope with a valid slug, a full commit id of 40 or 64 lowercase hex characters,
// and no branch named twice. The anchor body is editable by anyone with issue access, and wrap-up deletes what the
// record names, so a refusal names the bullet.
function checkPrototypeRecord(payload, scope) {
  if (payload.filter((l) => headerRe(HEADER).test(l)).length > 1) fail(`run-state payload carries more than one **${HEADER}:** line`);
  const seen = new Set();
  for (const line of prototypeBlock(payload).slice(1)) {
    const bullet = line.slice(2);
    const [branch, commit, ...extra] = bullet.split(' ');
    const prefix = `prototype/${scope}/`;
    if (!branch.startsWith(prefix) || !SLUG_RE.test(branch.slice(prefix.length))) fail(`run-state payload's **${HEADER}:** bullet "${bullet}" names no branch prototype/${scope}/<slug>`);
    if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(commit || '') || extra.length) fail(`run-state payload's **${HEADER}:** bullet "${bullet}" carries no full commit id`);
    if (seen.has(branch)) fail(`run-state payload's **${HEADER}:** bullet names ${branch} twice`);
    seen.add(branch);
  }
}

module.exports = { verbPrototypePush, prototypeBlock, checkPrototypeRecord };
