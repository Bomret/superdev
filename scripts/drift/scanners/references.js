'use strict';

// The scanners that resolve what prose points at: referenced documents, command names, run-root paths, and
// the governed skill files the glossary lists.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, readDoc, missingDoc, normalizeWhitespace } = require('../lib');
const {
  REFERENCE_PATTERN,
  RUN_ROOT_DOCS,
  RUN_ROOT_ARTIFACT_PATTERN,
  SCOPETREE_RUN_ROOT_DOCS,
  SCOPETREE_RUN_ROOT_PATTERN,
  COMMAND_REFERENCE_PATTERN,
  HEADING_CITATION_PATTERN,
  SECTION_MAP_PATTERN,
  HEADING_SPAN_PATTERN,
} = require('../contracts');
const { proseDocuments, scanPatternHits } = require('./walkers');

// scan(): reads skills/<name>/SKILL.md, agents/*.md and references/*.md, extracts every referenced
// references/<name>.md, and reports the ones that don't exist. references/ is in the set because a
// reference cites another reference — the execution playbooks point at scope-mode.md.
function scan(root) {
  const missing = [];
  for (const [source, filePath] of proseDocuments(root, ['skills', 'agents', 'references'])) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const match of text.matchAll(REFERENCE_PATTERN)) {
      const refName = match[1];
      const refPath = docPath(root, 'references', refName);
      if (!fs.existsSync(refPath)) {
        missing.push({ source, reference: `references/${refName}` });
      }
    }
  }
  return missing;
}

// scanRunRootPaths(): every checkout-relative run-root artifact path an execution doc still carries.
const scanRunRootPaths = (root) => scanPatternHits(root, RUN_ROOT_DOCS, RUN_ROOT_ARTIFACT_PATTERN);

// scanScopetreeRunRootPaths(): the same shape over the documents (ADR 0080) that address another run's
// scopetree from their own cwd. `RUN_ROOT_ARTIFACT_PATTERN` deliberately excludes `scopetree`, so a
// reverted cwd-relative literal in one of these needs its own pattern.
const scanScopetreeRunRootPaths = (root) => scanPatternHits(root, SCOPETREE_RUN_ROOT_DOCS, SCOPETREE_RUN_ROOT_PATTERN);

// scanCommandRefs(): every command reference in skills/<name>/SKILL.md and agents/*.md with no matching
// skill under skills/. A document naming the same missing command is reported once per document, so the
// report alone names every dead end.
function scanCommandRefs(root) {
  const unresolved = [];
  for (const [source, filePath] of proseDocuments(root, ['skills', 'agents'])) {
    const text = fs.readFileSync(filePath, 'utf8');
    const seen = new Set();
    for (const match of text.matchAll(COMMAND_REFERENCE_PATTERN)) {
      const name = match[1];
      if (seen.has(name)) continue; // one report per document per command
      seen.add(name);
      if (!fs.existsSync(docPath(root, 'skills', name, 'SKILL.md'))) {
        unresolved.push({ source, command: `/superdev:${name}` });
      }
    }
  }
  return unresolved;
}

// scanGovernedSkillFiles(): every backticked repo-relative path in `CONTEXT.md`'s **Prompt concept** entry
// names a file (ADR 0190). The entry is the only list of the governed skill files, so a renamed file would
// silently drop out of the convention. The entry runs to the next glossary headword. A backticked token with
// no `/` is a bare name or a section, never a path.
const GLOSSARY_DOC = 'CONTEXT.md';
function scanGovernedSkillFiles(root) {
  const doc = readDoc(root, GLOSSARY_DOC);
  if (doc === null) return [missingDoc(GLOSSARY_DOC)];
  const at = doc.search(/^\*\*Prompt concept\*\*:/m);
  if (at === -1) {
    return [{ source: GLOSSARY_DOC, expectation: 'carry the **Prompt concept** entry that lists the governed skill files' }];
  }
  const rest = doc.slice(at);
  const next = rest.slice(1).search(/^\*\*[^*\n]+\*\*:/m);
  const body = next === -1 ? rest : rest.slice(0, next + 1);
  const gaps = [];
  for (const m of body.matchAll(/`([^`\s]*\/[^`\s]*)`/g)) {
    if (!fs.statSync(path.join(root, m[1]), { throwIfNoEntry: false })?.isFile()) {
      gaps.push({
        source: GLOSSARY_DOC,
        expectation: `list only governed files that exist — \`${m[1]}\` names no file`,
      });
    }
  }
  return gaps;
}

// scanHeadingCitations(): every "`<file>.md`'s `## Heading`" citation (a heading of level two to four) in
// shipped prose names a heading the cited file carries, at that level. Whitespace collapses on both sides,
// so a heading wrapped across a line break matches. A bare file name resolves the way the other checks
// resolve one: `references/<name>`, then `agents/<name>`, then the repository root; a name with a `/` resolves
// from the plugin root, then the repository root. A file that resolves nowhere is a finding here, except a
// `references/<name>.md` path, which the `reference` check already reports. A section map entry,
// "- **`<file>.md`** — `## A`, `## B`.", is a citation of each heading it lists. A heading in a fenced template counts: a file's output template carries headings a citation may name.
function scanHeadingCitations(root) {
  const gaps = [];
  const headingsOf = new Map();
  const headings = (file) => {
    if (!headingsOf.has(file)) {
      const text = fs.readFileSync(file, 'utf8');
      headingsOf.set(file, new Set([...text.matchAll(/^(#{2,4})[ \t]+(.+?)[ \t]*$/gm)].map((h) => `${h[1]} ${normalizeWhitespace(h[2])}`)));
    }
    return headingsOf.get(file);
  };
  const resolve = (name) => {
    const candidates = name.includes('/') ? [docPath(root, name)] : ['references', 'agents'].map((d) => docPath(root, d, name));
    candidates.push(path.join(root, name));
    return candidates.find((c) => fs.statSync(c, { throwIfNoEntry: false })?.isFile());
  };
  const check = (source, name, spans) => {
    const cited = resolve(name);
    if (cited === undefined) {
      if (!/^references\/[a-zA-Z0-9_-]+\.md$/.test(name)) gaps.push({ source, cited: name, missing: true });
      return;
    }
    for (const [level, text] of spans) {
      const heading = `${level} ${normalizeWhitespace(text).trim()}`;
      if (!headings(cited).has(heading)) gaps.push({ source, cited: name, heading });
    }
  };
  for (const [source, filePath] of proseDocuments(root, ['skills', 'agents', 'references'])) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const m of text.matchAll(HEADING_CITATION_PATTERN)) check(source, m[1], [[m[2], m[3]]]);
    for (const m of text.matchAll(SECTION_MAP_PATTERN)) {
      check(source, m[1], [...m[2].matchAll(HEADING_SPAN_PATTERN)].map((s) => [s[1], s[2]]));
    }
  }
  return gaps;
}

module.exports = {
  scan,
  scanRunRootPaths,
  scanScopetreeRunRootPaths,
  scanCommandRefs,
  scanGovernedSkillFiles,
  scanHeadingCitations,
};
