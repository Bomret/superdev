'use strict';

// The document walkers and the shared absence-check shape every bespoke scanner reads its documents through.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, readDoc, missingDoc } = require('../lib');

// A doc pass edits every `AGENTS.md` (ADR 0189), so no walker over shipped prose reads one, at any depth.
const AGENTS_DOC = 'AGENTS.md';

// skillEntries(): every skill surface under a root, as `[<name>, absolute SKILL.md path]` pairs. An
// absent dir yields an empty list.
function skillEntries(root) {
  let entries;
  try {
    entries = fs.readdirSync(docPath(root, 'skills'), { withFileTypes: true });
  } catch {
    return []; // no skills dir → nothing to scan
  }
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(docPath(root, 'skills', e.name, 'SKILL.md')))
    .map((e) => [e.name, docPath(root, 'skills', e.name, 'SKILL.md')]);
}

// proseDocuments(): every prompt-prose file under the given dirs, as `[plugin-relative source, absolute
// path]` pairs: skills/<name>/SKILL.md plus the flat agents/*.md and references/*.md.
function proseDocuments(root, dirs) {
  const docs = [];
  for (const dir of dirs) {
    if (dir === 'skills') {
      for (const [name, filePath] of skillEntries(root)) {
        docs.push([path.join('skills', name, 'SKILL.md'), filePath]);
      }
      continue;
    }
    const dirPath = docPath(root, dir);
    let entries;
    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md') || entry === AGENTS_DOC) continue;
      docs.push([path.join(dir, entry), path.join(dirPath, entry)]);
    }
  }
  return docs;
}

// scanPatternHits(): every match of a global pattern in each named document, or the document as missing.
function scanPatternHits(root, docs, pattern) {
  const offenders = [];
  for (const rel of docs) {
    const text = readDoc(root, rel);
    if (text === null) {
      offenders.push(missingDoc(rel));
      continue;
    }
    for (const match of text.matchAll(pattern)) {
      offenders.push({ source: rel, match: match[0] });
    }
  }
  return offenders;
}

// scanDocsAvoid(): the shared shape of a prohibition — each document must NOT match a marker. Each marker
// is `[pattern, expectation(hit)]`, so every check keeps its own gap text.
function scanDocsAvoid(root, docs, markers) {
  const gaps = [];
  for (const rel of docs) {
    const text = readDoc(root, rel);
    if (text === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
    for (const [pattern, expectation] of markers) {
      const hit = text.match(pattern);
      if (hit) gaps.push({ source: rel, expectation: expectation(hit) });
    }
  }
  return gaps;
}

// walkFiles(dir): every file under dir, as paths relative to dir, sorted. `entry.parentPath` is Node's
// own name for the directory an fs.Dirent came from (`entry.path` before it, removed in Node 24) — read either, so
// this runs on the oldest Node this repo supports and the newest alike. `isFile()` excludes a
// symlink deliberately — no shipped document tree this walks contains one.
function walkFiles(dir) {
  const resolved = path.resolve(dir);
  return fs
    .readdirSync(resolved, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== AGENTS_DOC)
    .map((entry) => path.relative(resolved, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join('/'))
    .sort();
}

// How far ahead of a match a `never` still reads as that match's own caution, in characters. The
// force-merge and base-branch scanners share it.
const NEVER_NEGATION_WINDOW = 20;

module.exports = { skillEntries, proseDocuments, scanPatternHits, scanDocsAvoid, walkFiles, NEVER_NEGATION_WINDOW };
