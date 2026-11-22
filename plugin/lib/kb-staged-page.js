'use strict';

// kb-staged-page.js: parses one staged page's frontmatter and body, and writes the
// `created-by-publish` marker and a rewritten `live-hash` into a staged file.
//
// A **Staged page** is one `.md` file under `.superdev/kb-pending/<scope>/`, carrying YAML
// frontmatter with a page `title` and an `action` of `upsert`, `patch`, or `delete`, the page body
// below (CONTEXT.md → *Staged page*).

const fs = require('fs');
const { splitFrontmatter } = require('./kb-frontmatter.js');
const { writeFileAtomic } = require('./atomic-write.js');

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
  const split = splitFrontmatter(t);
  if (!split) return null;
  const body = t.slice(split.bodyAt);
  const data = {};
  for (const line of split.fm.split('\n')) {
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
// Written through `writeFileAtomic`, as `scope.js`'s `writeLines` writes its ledger, so a reader never
// observes a half-written marker and a failed write leaves no temporary file. Any fs error here (a read-only staging directory, say) is caught and reported rather than thrown:
// `publishUpsert` never sends the `create` it precedes when the marker itself could not be written.
function markStagedCreate(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, reason: 'could not write the retry marker' };
  }
  const t = raw.replace(/\r\n/g, '\n');
  const split = splitFrontmatter(t);
  if (!split) return { ok: true };
  // Already marked: a retry re-marks ahead of every `create` call it sends, so writing
  // unconditionally would append a fresh line on each one instead of leaving the first attempt's own
  // timestamp alone.
  if (/^created-by-publish:/m.test(split.fm)) return { ok: true };
  const marked = `${t.slice(0, split.closeAt)}created-by-publish: ${new Date().toISOString()}\n${t.slice(split.closeAt)}`;
  try {
    writeFileAtomic(filePath, marked);
    return { ok: true };
  } catch {
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
    const split = splitFrontmatter(raw);
    if (!split) return;
    const head = raw.slice(0, split.closeAt);
    const eol = raw.startsWith('---\r\n') ? '\r\n' : '\n';
    const rewritten = /^live-hash:/m.test(split.fm)
      ? head.replace(/^live-hash:[^\r\n]*/m, `live-hash: ${hash}`)
      : `${head}live-hash: ${hash}${eol}`;
    writeFileAtomic(filePath, rewritten + raw.slice(split.closeAt));
  } catch {
    // the file keeps its old hash, and no temporary file: the next run refuses with the live-hash reason, naming the page
  }
}

module.exports = { parseStagedPage, markStagedCreate, restageLiveHash };
