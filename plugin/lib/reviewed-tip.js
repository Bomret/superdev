'use strict';

// reviewed-tip.js: the reviewed-tip record (ADR 0273, INV-0201): the ledger's `**Reviewed:** <sha> <digest>` header that
// `reviewed set` writes and `reviewed clear` removes, the digest of `dod.md`'s criterion texts and tags it carries, and
// `reviewed check`, the read-only verdict a scope review takes from the record.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fail, readPresent } = require('./refusal.js');
const { readLines, writeLines, headerRe, insertHeader, getHeader } = require('./ledger.js');
const { gitSpawn, resolveCommit } = require('./git-spawn.js');
const { GIT_BOUND_MS } = require('./run-tree.js');
const { dodCriterionLines, parseDodLineReadings, collapseWhitespace } = require('./dod-line.js');

// The digest of a `dod.md` text: a SHA-256 over each criterion line's criterion text and tag, in file order, read
// through `dod-line.js`'s own line reading (fenced lines masked, the shortest-criterion reading taken). The checkbox and
// the verdict note stay out, so a tick, an untick, or a re-note leaves it unchanged, and `splitLines` reads CRLF and LF
// alike. Null when the text holds no criterion line; a refusal on an unterminated fence.
function criteriaDigest(text) {
  const lines = dodCriterionLines(text, 'dod.md', 'read');
  if (!lines.length) return null;
  const parts = lines.map((l) => {
    const r = parseDodLineReadings(l)[0];
    return `${collapseWhitespace(r.criterion)}\t${collapseWhitespace(r.tag)}`;
  });
  return crypto.createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
}

// The digest of `<root>/dod.md`, or a refusal naming why none can be taken: the file is missing or unreadable, or
// holds no criterion.
function runDigest(root, verb) {
  const file = path.join(root, 'dod.md');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    fail(`${verb}: ${file} is missing or unreadable (${e.code || e.message})`);
  }
  const digest = criteriaDigest(text);
  if (digest === null) fail(`${verb}: ${file} holds no criterion`);
  return digest;
}

// The record's two fields, as `reviewed set` writes them: a full commit (40 or 64 hex) and a SHA-256 hex digest.
const RECORD_RE = /^([0-9a-f]{40}|[0-9a-f]{64}) ([0-9a-f]{64})$/;
// The oldest git whose `show --remerge-diff` shows a merge's conflict resolution.
const REMERGE_MIN = [2, 36];

// `reviewed check`: one verdict line, read from the ledger, `dod.md`, and git, writing nothing. `delta <sha> <old range
// base>` and `unchanged <sha>` where the record still holds; `whole <reason>` otherwise. Each git call is bounded by
// `GIT_BOUND_MS`, and a call that fails or outlasts it reads as `whole git-failed`, never as a delta (INV-0009). An absent `dod.md` reads as
// `whole dod-unreadable`; a ledger or `dod.md` present but unreadable refuses with one line naming the file.
function verbReviewedCheck(cwd, root, branch, base) {
  const lines = readLines(root);
  console.log(judge(cwd, root, lines, branch, base));
}

function judge(cwd, root, lines, branch, base) {
  const raw = getHeader(lines, 'Reviewed');
  if (raw === null) return 'whole no-record';
  const rec = raw.match(RECORD_RE);
  if (!rec) return 'whole unreadable-record';
  const [, sha, digest] = rec;
  // A git answer: `{ status, out }`, or null where the call could not start, was ended by a signal, or outlasted its bound.
  const g = (args) => {
    const r = gitSpawn(args, cwd, { timeout: GIT_BOUND_MS });
    return r.error || r.signal ? null : { status: r.status, out: r.stdout || '' };
  };
  const version = g(['--version']);
  if (!version || version.status !== 0) return 'whole git-failed';
  const v = version.out.match(/^git version (\d+)\.(\d+)/);
  if (!v || Number(v[1]) < REMERGE_MIN[0] || (Number(v[1]) === REMERGE_MIN[0] && Number(v[2]) < REMERGE_MIN[1])) return 'whole git-too-old';
  const tipRead = g(['rev-parse', '--verify', '--quiet', '--end-of-options', `${branch}^{commit}`]);
  if (!tipRead || tipRead.status !== 0) return 'whole git-failed';
  const tip = tipRead.out.trim();
  if (sha !== tip) {
    const anc = g(['merge-base', '--is-ancestor', sha, tip]);
    if (!anc) return 'whole git-failed';
    if (anc.status === 128) return 'whole missing-commit';
    if (anc.status === 1) return 'whole rewritten';
    if (anc.status !== 0) return 'whole git-failed';
    // The recorded tip lies on the tip's first-parent chain exactly when the first-parent walk from the tip, stopped at
    // the recorded tip's ancestors, ends on a commit whose first parent is the recorded tip.
    const walk = g(['rev-list', '--first-parent', '--parents', tip, '--not', sha]);
    if (!walk || walk.status !== 0) return 'whole git-failed';
    const last = walk.out.trim().split('\n').pop().split(' ');
    if (last[1] !== sha) return 'whole rewritten';
  }
  const text = readPresent(path.join(root, 'dod.md'), 'utf8');
  if (text === null) return 'whole dod-unreadable';
  let now;
  try {
    now = criteriaDigest(text);
  } catch (e) {
    if (e.isRefusal) return 'whole dod-unreadable';
    throw e;
  }
  if (now === null) return 'whole dod-unreadable';
  if (now !== digest) return 'whole criteria-changed';
  if (sha === tip) return `unchanged ${sha}`;
  // The range base as it stood at the recorded tip: the recorded Base where it is an ancestor of the recorded tip, else
  // the merge-base of the base and the recorded tip.
  const recordedBase = getHeader(lines, 'Base');
  if (recordedBase && /^[0-9a-f]+$/.test(recordedBase)) {
    const held = g(['merge-base', '--is-ancestor', recordedBase, sha]);
    if (!held) return 'whole git-failed';
    if (held.status === 0) return `delta ${sha} ${recordedBase}`;
  }
  const mb = g(['merge-base', '--end-of-options', base, sha]);
  if (!mb) return 'whole git-failed';
  if (mb.status !== 0 || !mb.out.trim()) return 'whole untraceable-base';
  return `delta ${sha} ${mb.out.trim()}`;
}

// `reviewed set`: records `--tip`, which must be the branch tip or an ancestor of it, or the branch tip, as a full
// commit beside the digest it computes from `<root>/dod.md`. Returns the recorded `{ commit, digest }`, or null when the
// ledger already held that exact record and nothing was written.
function verbReviewedSet(cwd, root, branch, tip) {
  const digest = runDigest(root, 'reviewed set');
  const branchTip = resolveCommit(branch, cwd);
  if (!branchTip) fail(`reviewed set: branch "${branch}" does not resolve to a commit`);
  let commit = branchTip;
  if (tip !== undefined) {
    commit = resolveCommit(tip, cwd);
    if (!commit) fail(`reviewed set: --tip "${tip}" does not resolve to a commit`);
    const r = gitSpawn(['merge-base', '--is-ancestor', commit, branchTip], cwd);
    if (r.status === 1) fail(`reviewed set: --tip "${tip}" is no ancestor of the tip of "${branch}"`);
    if (r.status !== 0) fail(`reviewed set: could not tell whether --tip "${tip}" is an ancestor of the tip of "${branch}"`);
  }
  const value = `${commit} ${digest}`;
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe('Reviewed').test(l));
  const line = `**Reviewed:** ${value}`;
  if (at >= 0 && lines[at] === line) return null;
  if (at >= 0) lines[at] = line;
  else insertHeader(lines, 'Reviewed', value);
  writeLines(root, lines);
  return { commit, digest };
}

// `reviewed clear`: removes the header. True when the ledger changed; no header is no error and changes nothing.
function verbReviewedClear(root) {
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe('Reviewed').test(l));
  if (at < 0) return false;
  lines.splice(at, 1);
  writeLines(root, lines);
  return true;
}

module.exports = { verbReviewedSet, verbReviewedClear, verbReviewedCheck };
