'use strict';

// reviewed-tip.js: the reviewed-tip record (ADR 0272, INV-0200): the ledger's `**Reviewed:** <sha> <digest>` header that
// `reviewed set` writes and `reviewed clear` removes, and the digest of `dod.md`'s criterion texts and tags it carries.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { readLines, writeLines, headerRe, insertHeader } = require('./ledger.js');
const { gitSpawn, resolveCommit } = require('./git-spawn.js');
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

module.exports = { verbReviewedSet, verbReviewedClear };
