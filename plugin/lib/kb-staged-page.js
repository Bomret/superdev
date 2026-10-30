'use strict';

// kb-staged-page.js: parses one staged page's frontmatter and body, and writes the
// `created-by-publish` marker and a rewritten `live-hash` into a staged file.
//
// A **Staged page** is one `.md` file under `.superdev/kb-pending/<scope>/`, carrying YAML
// frontmatter with a page `title` and an `action` of `upsert`, `patch`, or `delete`, the page body
// below (CONTEXT.md → *Staged page*).

const fs = require('fs');

// A minimal YAML scalar reader: a double-quoted value is decoded through JSON (double-quoted YAML
// escapes — \", \\, \n — coincide with JSON's), so a title carrying a quote or a real newline
// survives the round trip; a single-quoted value unescapes YAML's `''`; anything else is taken
// verbatim, which already covers a bare `$` or a backtick (neither needs escaping in YAML flow
// scalars, and neither is ever handed to a shell of its own — see runVerb in kb-backend.js).
function parseScalar(raw) {
  const v = raw.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

function parseStagedPage(text) {
  const t = text.replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return null;
  const end = t.indexOf('\n---', 3);
  if (end === -1) return null;
  const fm = t.slice(4, end);
  const body = t.slice(t.indexOf('\n', end + 1) + 1);
  const data = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) data[m[1]] = parseScalar(m[2]);
  }
  return {
    title: data.title || null,
    action: data.action || null,
    liveHash: data['live-hash'] || null,
    createdByPublish: data['created-by-publish'] || null,
    parent: data.parent || null,
    parentSection: data['parent-section'] || null,
    parentLink: data['parent-link'] || null,
    body,
  };
}

// Writes the `created-by-publish` marker into a staged file's frontmatter, ahead of the `create`
// call it precedes: the staged file still holds every previous byte, and now also names the
// moment this run sent it as a create. A create killed before it returns leaves the marker on
// disk, so a later run's `find` seeing the page land reads it as this run's own retry (ADR 0130)
// rather than someone else's page (INV-0091), with no `read` call needed to tell the two apart.
//
// Atomic write, the way `scope.js`'s `writeLines` writes its ledger: a temp file in the same
// directory, then a rename over the staged file, so a reader never observes a half-written marker.
// Any fs error here (a read-only staging directory, say) is caught and reported rather than thrown:
// `publishUpsert` never sends the `create` it precedes when the marker itself could not be written.
function markStagedCreate(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, reason: 'could not write the retry marker' };
  }
  const t = raw.replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return { ok: true };
  const end = t.indexOf('\n---', 3);
  if (end === -1) return { ok: true };
  // Already marked: a retry re-marks ahead of every `create` call it sends, so writing
  // unconditionally would append a fresh line on each one instead of leaving the first attempt's own
  // timestamp alone.
  if (/^created-by-publish:/m.test(t.slice(4, end))) return { ok: true };
  const marked = `${t.slice(0, end)}\ncreated-by-publish: ${new Date().toISOString()}${t.slice(end)}`;
  const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpFile, marked, 'utf8');
    fs.renameSync(tmpFile, filePath);
    return { ok: true };
  } catch {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // the write itself already failed — a stray temp file must not mask that
    }
    return { ok: false, reason: 'could not write the retry marker' };
  }
}

// A staged upsert's own state after it landed but its link did not (ADR 0168). A recorded `live-hash`
// named the page as it was before this run wrote it, so the next run's guard would refuse the page for
// this run's own write (INV-0091): the hash is rewritten to the body this run sent. A page with no
// recorded hash gets the line added, so the next run checks the live page instead of sending blind over
// an edit made in between (a recorded `live-hash` always wins over the `created-by-publish` marker).
function restageLiveHash(filePath, hash) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const head = raw.match(/^---\r?\n[\s\S]*?\r?\n---/);
    if (!head) return;
    const rewritten = /^live-hash:/m.test(head[0])
      ? head[0].replace(/^live-hash:[^\r\n]*/m, `live-hash: ${hash}`)
      : head[0].replace(/\r?\n---$/, (close) => `${close.startsWith('\r') ? '\r\n' : '\n'}live-hash: ${hash}${close}`);
    const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpFile, rewritten + raw.slice(head[0].length), 'utf8');
    fs.renameSync(tmpFile, filePath);
  } catch {
    // the file keeps its old hash: the next run refuses with the live-hash reason, naming the page
  }
}

module.exports = { parseStagedPage, markStagedCreate, restageLiveHash };
