'use strict';

// kb-apply.js: applies each staged file of one scope to the backend, by title group, and clears a
// staged file once its call has landed and, under `- **Hierarchy:** links`, its parent link holds.

const fs = require('fs');
const path = require('path');
const { maskFencedLines, headingKeyOf } = require('./md-sections.js');
const { toStorage } = require('./md-to-storage.js');
const { parseStagedPage, restageLiveHash } = require('./kb-staged-page.js');
const { hashBody, publishUpsert, publishDelete, publishPatch, writeTempBody } = require('./kb-backend.js');
const { linksHierarchy, nestingParent, parentLinkRefusal, markdownRefusal, linkIntoParent, unlinkFromParent } = require('./kb-parent-link.js');

// A best-effort identity for a staged patch body's own section heading, used only to catch two
// sibling files in the same title-group naming the same section before either one is applied —
// merge() itself cannot: once the first has landed, the live page carries that heading exactly
// once, so the second would read as an ordinary replace, not a collision. Real shape validation
// (no heading, more than one section, setext, an unterminated fence) still runs inside merge()
// itself when this file's turn in the chain comes; a body this cannot key (a masking failure, or
// no heading at all) simply returns null and is left to that real validation.
function firstHeadingKey(body) {
  try {
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const masked = maskFencedLines(lines, 'staged body', 'checked');
    const line = masked.find((l) => /^ {0,3}#{1,6}\s+\S/.test(l));
    return line ? headingKeyOf(line) : null;
  } catch {
    return null;
  }
}

// What a page's result is once its own write is decided. `landed` carries the call's action and the
// body sent. Under `links`, a page naming a parent is published only once the live parent links it.
function settle(entry, templates, landed) {
  const { filePath, filename, parsed } = entry;
  const title = parsed.title;
  if (!(linksHierarchy(templates) && parsed.parent)) {
    return landed.ok
      ? clearStagedFile(filePath, filename, title, landed.action)
      : { filename, title, kind: 'left-staged', reason: landed.reason, timedOut: landed.timedOut };
  }
  if (!landed.ok) {
    return {
      filename,
      title,
      kind: 'not-linked',
      reason: `the page itself was not published (${landed.reason}), so no link was written`,
      fix: 'fix that cause and run publish again',
      timedOut: landed.timedOut,
    };
  }
  const linked = linkIntoParent(parsed, templates, landed.fields);
  if (linked.ok) return clearStagedFile(filePath, filename, title, landed.action);
  if (parsed.action === 'upsert') restageLiveHash(filePath, hashBody(landed.sent));
  return { filename, title, kind: 'not-linked', reason: linked.reason, fix: linked.fix, timedOut: linked.timedOut };
}

// A refusal before the page is sent: a staged page under `links` whose parent fields cannot be linked
// (a delete: cannot be unlinked), or whose backend stores no markdown to write a link line into.
function preflight(entry, templates) {
  const { filename, parsed } = entry;
  if (!(linksHierarchy(templates) && parsed.parent)) return null;
  const format = markdownRefusal(templates, parsed.action);
  if (format) {
    return { filename, title: parsed.title, kind: parsed.action === 'delete' ? 'not-unlinked' : 'not-linked', reason: format.reason, fix: format.fix };
  }
  // a delete needs only the section to find its line in; it is refused before any backend call
  if (parsed.action === 'delete') {
    return parsed.parentSection
      ? null
      : { filename, title: parsed.title, kind: 'not-unlinked', reason: `parent "${parsed.parent}" is named with no parent-section`, fix: 'add parent-section: <a heading in the parent> to the staged file' };
  }
  const bad = parentLinkRefusal(parsed);
  return bad ? { filename, title: parsed.title, kind: 'not-linked', reason: bad.reason, fix: bad.fix } : null;
}

// Reads and parses one staged file without applying it.
function readStagedEntry(filePath) {
  const filename = path.basename(filePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  return { filename, filePath, raw, parsed: parseStagedPage(raw) };
}

// Applies one staged file, in isolation from any title it might share with another staged file
// (see `processTitleGroup` below, which every multi-file title group goes through instead).
// Deletes the staged file only once its call has landed — a page whose call fails stays staged,
// so a later run retries exactly the pages that did not make it. Never deletes on a malformed
// file.
function processFile(entry, templates) {
  const { filename, filePath, raw, parsed } = entry;
  if (!parsed || !parsed.title || !['upsert', 'patch', 'delete'].includes(parsed.action)) {
    const reason = !parsed
      ? 'no YAML frontmatter'
      : !parsed.title
        ? 'no title'
        : `unknown action "${parsed.action}"`;
    return { filename, kind: 'malformed', reason };
  }
  const refused = preflight(entry, templates);
  if (refused) return refused;
  if (parsed.action === 'patch') {
    return settle(entry, templates, publishPatch(parsed.title, raw, templates, false, nestingParent(parsed, templates)));
  }
  if (parsed.action === 'delete') {
    const result = publishDelete(parsed.title, templates);
    if (!result.ok) return { filename, title: parsed.title, kind: 'left-staged', reason: result.reason, timedOut: result.timedOut };
    // the page is gone, also when it already was: its link leaves the parent in either case
    let kept;
    if (linksHierarchy(templates) && parsed.parent) {
      const unlinked = unlinkFromParent(parsed, templates);
      if (!unlinked.ok) return { filename, title: parsed.title, kind: 'not-unlinked', reason: unlinked.reason, fix: unlinked.fix, timedOut: unlinked.timedOut };
      kept = unlinked.kept;
    }
    return { ...clearStagedFile(filePath, filename, parsed.title, result.action === 'already-absent' ? 'already-absent' : 'deleted'), kept, parent: parsed.parent };
  }
  // upsert — a storage backend receives the body converted to XHTML, every other backend the
  // staged body byte-identical (ADR 0109, INV-0109)
  const sent = templates.bodyFormat === 'storage' ? toStorage(parsed.body) : parsed.body;
  const bodyFile = writeTempBody(sent);
  try {
    const result = publishUpsert(parsed.title, bodyFile, templates, parsed.liveHash, !!parsed.createdByPublish, filePath, nestingParent(parsed, templates));
    return settle(entry, templates, { ...result, sent });
  } finally {
    try {
      fs.rmSync(path.dirname(bodyFile), { recursive: true, force: true });
    } catch {
      // the backend call already landed — a leftover temp dir must not abort the batch either
    }
  }
}

// Clears the staged file once its backend call has landed. The call already took effect, so a
// failure here (a read-only staging dir, a permissions error) must not abort the rest of the
// batch: the file is reported published/deleted anyway, just not cleared, naming why a later run
// will still find it staged.
function clearStagedFile(filePath, filename, title, publishedKind) {
  try {
    fs.unlinkSync(filePath);
    return { filename, title, kind: publishedKind };
  } catch (e) {
    return { filename, title, kind: 'cleanup-failed', publishedKind, reason: e.message };
  }
}

// Two or more staged files can legitimately share one title: a `patch` filename is
// `<title-slug>--<section-slug>.md`, so an aggregate page's sections arrive as siblings. This is
// the only place that decides what a shared title means.
//
// - Not every file in the group is `action: patch` → the group is ambiguous (a wholesale rewrite
//   sitting next to a section patch, say), so nothing in it publishes; every filename is reported.
// - Every file is `action: patch` → each is applied in turn, re-reading the live page as it then
//   stands, so the second file's merge sees the first file's own section already landed instead of
//   overwriting it. Two files naming the identical section heading are unresolvable (which one
//   wins is not this script's call) and are both left staged instead of one silently overwriting
//   the other once its sibling has landed.
function processTitleGroup(title, group, templates) {
  if (group.length === 1) return [processFile(group[0], templates)];

  if (!group.every((e) => e.parsed.action === 'patch')) {
    const names = group.map((e) => e.filename).join(', ');
    return group.map((e) => ({
      filename: e.filename,
      title,
      kind: 'left-staged',
      reason: `shares the title "${title}" with ${group.length - 1} other staged file(s), not all action: patch (${names})`,
    }));
  }

  const headingOf = new Map(group.map((e) => [e.filename, firstHeadingKey(e.parsed.body)]));
  const filenamesByHeading = new Map();
  for (const [filename, key] of headingOf) {
    if (key === null) continue;
    if (!filenamesByHeading.has(key)) filenamesByHeading.set(key, []);
    filenamesByHeading.get(key).push(filename);
  }
  const duplicated = new Set();
  for (const names of filenamesByHeading.values()) {
    if (names.length > 1) {
      for (const n of names) duplicated.add(n);
    }
  }

  const results = [];
  let assumeExists = false;
  for (let i = 0; i < group.length; i++) {
    const e = group[i];
    if (duplicated.has(e.filename)) {
      const siblings = filenamesByHeading.get(headingOf.get(e.filename)).filter((n) => n !== e.filename);
      results.push({
        filename: e.filename,
        title,
        kind: 'left-staged',
        reason: `carries the same section heading as ${siblings.join(', ')} — which one wins cannot be resolved`,
      });
      continue;
    }
    const refused = preflight(e, templates);
    if (refused) {
      results.push(refused);
      continue;
    }
    const result = publishPatch(title, e.raw, templates, assumeExists, nestingParent(e.parsed, templates));
    if (result.ok) assumeExists = true;
    const settled = settle(e, templates, result);
    results.push(settled);
    if (settled.timedOut) {
      // A host that black-holes one call black-holes the next: carrying on to the next sibling
      // in this same group would burn another full bound per remaining page (ADR 0130). Mark
      // them untried, exactly as the outer loop already marks a later group's pages, and stop
      // here — the group's own result still carries `timedOut`, so the outer loop's own
      // `some(r => r.timedOut)` check keeps carrying the stop outward.
      for (const rest of group.slice(i + 1)) {
        results.push({ filename: rest.filename, kind: 'untried', reason: 'the run stopped after a timeout' });
      }
      break;
    }
  }
  return results;
}

// Orders title groups so a parent staged in this batch is published before the pages naming it
// (ADR 0109). A stable sort by depth in the batch's own parent chain; a cycle stops counting where
// it closes, so it neither loops nor drops a page.
function parentsFirst(groupEntries) {
  const parentOf = new Map(groupEntries.map(([title, group]) => [title, group.map((e) => e.parsed.parent).find(Boolean)]));
  const depth = (title) => {
    const seen = new Set();
    let d = 0;
    for (let t = parentOf.get(title); t && parentOf.has(t) && !seen.has(t); t = parentOf.get(t)) {
      seen.add(t);
      d++;
    }
    return d;
  };
  return groupEntries.map((g) => [depth(g[0]), g]).sort((a, b) => a[0] - b[0]).map(([, g]) => g);
}

// Groups every staged file in a scope by title (patch filenames legitimately collide by design)
// and applies each group. A malformed file (no title, so no group to join) is reported on its own.
function processStagedFiles(files, templates) {
  const entries = files.map(readStagedEntry);
  const results = [];
  const groups = new Map();
  for (const e of entries) {
    const { filename, parsed } = e;
    if (!parsed || !parsed.title || !['upsert', 'patch', 'delete'].includes(parsed.action)) {
      const reason = !parsed
        ? 'no YAML frontmatter'
        : !parsed.title
          ? 'no title'
          : `unknown action "${parsed.action}"`;
      results.push({ filename, kind: 'malformed', reason });
      continue;
    }
    if (!groups.has(parsed.title)) groups.set(parsed.title, []);
    groups.get(parsed.title).push(e);
  }
  // ADR 0130. A host that black-holes one call black-holes the next, so carrying on would spend the
  // bound once per staged page and reproduce the very hang the bound removes. The remaining titles
  // are reported untried and stay staged, so the next run retries exactly them. Only a timeout stops
  // the walk: every other failure is per page, as it has always been.
  const remaining = parentsFirst([...groups.entries()]);
  while (remaining.length > 0) {
    const [title, group] = remaining.shift();
    const groupResults = processTitleGroup(title, group, templates);
    results.push(...groupResults);
    if (groupResults.some((r) => r.timedOut)) {
      const untried = remaining.flatMap(([, g]) => g).map((e) => e.filename);
      for (const filename of untried) {
        results.push({ filename, kind: 'untried', reason: 'the run stopped after a timeout' });
      }
      break;
    }
  }
  return results;
}

module.exports = { processStagedFiles };
