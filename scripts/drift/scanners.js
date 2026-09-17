'use strict';

// drift-check bespoke scanners: every check whose assertion is more than "this document still
// matches this pattern". The table-driven ones run through `lib.js`’s scanContract() instead.
// Each scanner is pure over a root dir and returns an array of gaps; `checks.js` orders them and
// owns how each gap is printed.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  docPath,
  readDoc,
  storeDocuments,
  extractSection,
  extractParagraph,
  maskFences,
  scalar,
  frontmatter,
  normalizeWhitespace,
} = require('./lib');
const { readLedgerHeader } = require('../../plugin/scripts/scope.js');
const contracts = require('./contracts');
const {
  NARRATIVE_DOC,
  FORCING_FLAG_DOCS,
  FORCING_FLAG_PATTERNS,
  REFERENCE_PATTERN,
  RUN_ROOT_DOCS,
  RUN_ROOT_ARTIFACT_PATTERN,
  ASSIGNEE_DOCS_DIR,
  ASSIGNEE_EXEMPT,
  EXTRA_ASSIGNEE_DOCS,
  ASSIGNEE_PATTERN,
  ASSIGNEE_BULLET_EXPECTATION,
  ASSIGNEE_SECTION_EXPECTATION,
  ANCHOR_DOCS_DIR,
  EXTRA_ANCHOR_DOCS,
  ANCHOR_PATTERN,
  ANCHOR_ELEMENTS,
  APPEND_PATTERN,
  APPEND_ELEMENTS,
  RELEASE_PATTERN,
  RELEASE_CONSUMERS,
  RELEASE_CONSUMER_PATTERN,
  TRIAGE_RECORD_PATTERN,
  TRIAGE_RECORD_ELEMENTS,
  UNTRIAGED_PATTERN,
  UNTRIAGED_ELEMENTS,
  UNTRIAGED_EXPECTATION,
  SPECIALISING_SECTIONS,
  GLOSSARY_ENTRY_TITLES,
  specialisingHeading,
  specialisingCitation,
  TRIAGE_RECORD_EXPECTATION,
  LOCAL_APPEND_DOC,
  LOCAL_CONTINUATION_ELEMENT,
  AFK_SELECTION_HEADING,
  AFK_ANCHOR_COUNT_HEADING,
  AFK_ANCHOR_COUNT_ELEMENTS,
  STORE_MECHANISMS,
  WRITING_STANDARD_DOCS,
  WRITING_STANDARD_PATTERN,
  ADR_DIR,
  ADR_STATUS_PATTERN,
  GRADER_TYPES,
  FOCUS_TYPES,
  CONTENT_TYPES_DOCS,
  CONTENT_TYPES_PATTERN,
  COMMAND_REFERENCE_PATTERN,
  CHAIN_HANDOFFS,
  AFK_NAMES,
  AFK_ROW_PATTERN,
  SHIP_GATE_HEADING,
  ORPHAN_LENS_DOC,
  ORPHAN_LENS_ENTRY,
  ORPHAN_LENS_DESIGN_HEADING,
  ORPHAN_LENS_ANTIPATTERN_HEADING,
  ORPHAN_LENS_SCOPE_CLAUSE,
  TEST_COST_LENS_DOC,
  TEST_COST_LENS_HEADING,
  TEST_COST_LENS_ENTRIES,
  SHIP_GATE_ELEMENTS,
  UNRESOLVED_GLOSSARY_CONTRACTS,
  KB_NO_CALL_DOCS,
  AGENT_LENS_AVOID_DOCS,
  AGENT_LENS_AVOID_MARKERS,
  DOC_STEP_SILENCE_DOCS,
  SUITE_RUN_INSTRUCTIONS,
  AGENT_TOOLCHAIN_PATTERNS,
  DENIAL_CAP_NUMBER_SILENCE_DOCS,
  DENIAL_CAP_NUMBER_MARKERS,
  AFK_LOCK_TIER_SILENCE_DOCS,
  AFK_LOCK_TIER_MARKERS,
  KB_BACKEND_CALL_MARKERS,
  HOOK_HEADER_REGEX,
  RETURN_TO_CONTROLLER_DOCS,
  RETURN_TO_CONTROLLER_PATTERNS,
} = contracts;

// skillEntries(): every skill surface under a root, as `[<name>, absolute SKILL.md path]` pairs.
// skills/ nests one directory per surface where commands/ was a flat *.md dir, so the scanners that
// walk the prompt prose share this one listing. An absent dir yields an empty list, the same
// "nothing to scan" a missing commands/ gave.
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

// proseDocuments(): every prompt-prose file the reference and command-resolution scanners read,
// as `[plugin-relative source, absolute path]` pairs: skills/<name>/SKILL.md plus the flat
// agents/*.md and references/*.md.
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
      if (!entry.endsWith('.md')) continue;
      docs.push([path.join(dir, entry), path.join(dirPath, entry)]);
    }
  }
  return docs;
}

// scan() is pure over a root dir so it's unit-testable: reads skills/<name>/SKILL.md, agents/*.md and
// references/*.md, extracts every referenced references/<name>.md, and reports the ones that don't
// exist. references/ is in the set because a reference cites another reference — the execution
// playbooks point at scope-mode.md — and a rename there dangles like any other.
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

// scanRunRootPaths() is pure over a root dir: reads each execution doc and reports every
// checkout-relative run-root artifact path it still carries (should be zero once converted to
// <run-root>/…). Absent files are skipped, so fixtures need only the docs they exercise.
function scanRunRootPaths(root) {
  const offenders = [];
  for (const rel of RUN_ROOT_DOCS) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    for (const match of text.matchAll(RUN_ROOT_ARTIFACT_PATTERN)) {
      offenders.push({ source: rel, match: match[0] });
    }
  }
  return offenders;
}

// scanAssigneeContract() is pure over a root dir: reads every issue-backend document and reports the
// ones that never carry the assignee contract. Absent files are skipped, so fixtures need only the docs
// they exercise.
//
// The contract has two halves, and each is reported apart. ASSIGNEE_PATTERN pins the
// `- **Assignee:**` configuration bullet, which is what a backend is actually configured with.
// specialisingHeading('Assignee') pins the `## Assignee` section the store renders for
// `plan-contract.md`'s generic contract, which is the store-side presence contract every other member of
// the specialising family already had. Pinning the bullet alone left the section deletable with every
// check green: the citation contract skips a store rendering no section, and that is the same branch
// which correctly exempts one that carries none by design.
//
// The heading comes from specialisingHeading() rather than a second copy of the pattern, so a change to
// the family's heading anchoring reaches this check too — the store documents write `## Assignee`, and
// the `#{2,3}` span accepts a deeper level the same way every other member's does.
//
// Both halves test fence-masked text, defensively: no store document renders either half inside a fenced
// example today, and the seeds' habit of showing headings inside fenced examples elsewhere makes one
// plausible. scanReleaseContract takes the opposite latitude and reads raw text.
//
// One exempt set covers both halves. The local-file store has no assignee concept, so it renders neither.
function scanAssigneeContract(root) {
  const gaps = [];
  const heading = specialisingHeading('Assignee');
  const candidates = storeDocuments(root, {
    dir: ASSIGNEE_DOCS_DIR,
    extra: EXTRA_ASSIGNEE_DOCS,
    exempt: ASSIGNEE_EXEMPT,
  });
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    const masked = maskFences(text);
    if (!ASSIGNEE_PATTERN.test(masked)) gaps.push({ source: rel, expectation: ASSIGNEE_BULLET_EXPECTATION });
    if (!heading.test(masked)) gaps.push({ source: rel, expectation: ASSIGNEE_SECTION_EXPECTATION });
  }
  return gaps;
}

// scanAnchorContract() is pure over a root dir: reads every slice-store document and reports the ones that
// never state how to identify a scope anchor, or state the heading but not every element. Absent files are
// skipped, so fixtures need only the docs they exercise.
function scanAnchorContract(root) {
  const gaps = [];
  const candidates = storeDocuments(root, { dir: ANCHOR_DOCS_DIR, extra: EXTRA_ANCHOR_DOCS });
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    const section = extractSection(text, ANCHOR_PATTERN);
    if (section === null) {
      gaps.push({ source: rel });
      continue;
    }
    for (const [pattern, desc] of ANCHOR_ELEMENTS) {
      if (!pattern.test(section)) gaps.push({ source: rel, expectation: `state ${desc}` });
    }
  }
  return gaps;
}

// scanAppendContract() is pure over a root dir: reads every slice-store document (the same candidate list
// scanAnchorContract uses) and reports the ones missing the `## Append mode` section, missing one of its
// four universal elements, or — for the local-file store alone — missing the numbering-continuation
// element. Absent files are skipped, so a fixture carries only the docs it exercises.
function scanAppendContract(root) {
  const gaps = [];
  const candidates = storeDocuments(root, { dir: ANCHOR_DOCS_DIR, extra: EXTRA_ANCHOR_DOCS });
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    const section = extractSection(text, APPEND_PATTERN);
    if (section === null) {
      gaps.push({ source: rel });
      continue;
    }
    for (const [pattern, desc] of APPEND_ELEMENTS) {
      if (!pattern.test(section)) gaps.push({ source: rel, expectation: `state ${desc}` });
    }
    if (rel === LOCAL_APPEND_DOC) {
      const [pattern, desc] = LOCAL_CONTINUATION_ELEMENT;
      if (!pattern.test(section)) gaps.push({ source: rel, expectation: `state ${desc}` });
    }
  }
  return gaps;
}

// scanReleaseContract() is pure over a root dir: reads every slice-store document (the same candidate
// list the anchor and append contracts use) and reports the ones carrying no `## Release` section, then
// reports every consumer command that no longer names that section. Absent files are skipped, so a
// fixture carries only the docs it exercises.
function scanReleaseContract(root) {
  const gaps = [];
  const candidates = storeDocuments(root, { dir: ANCHOR_DOCS_DIR, extra: EXTRA_ANCHOR_DOCS });
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    if (!RELEASE_PATTERN.test(text)) gaps.push({ source: rel });
  }
  for (const rel of RELEASE_CONSUMERS) {
    const text = readDoc(root, rel);
    if (text === null) continue;
    if (!RELEASE_CONSUMER_PATTERN.test(text)) {
      gaps.push({ source: rel, expectation: "name the store document's `## Release` section" });
    }
  }
  return gaps;
}

// scanRunStateContract() is pure over a root dir: reads every slice-store document (the same candidate
// list the anchor, append and release contracts use) and reports the ones carrying no `## Run state`
// section (ADR 0042). No store is exempt — a snapshot-less backend declares itself snapshot-less inside
// this section, which `references/run-init.md` reads before it adopts. The heading is matched by
// specialisingHeading('Run state'), the same pattern the citation and generic-side rows use, so changing
// the anchoring in one place can never diverge from the other two. The test runs on the text fence-masked
// with maskFences(), defensively: no store document renders a `## Run state` heading inside a fenced code
// example today, but the store seeds' own habit of showing a heading inside a fenced example elsewhere
// makes one plausible. scanReleaseContract() takes the opposite latitude and tests raw text, because a
// `## Release` heading has no seed-template convention that puts it inside a fenced example. Absent files
// are skipped, so a fixture carries only the docs it exercises.
function scanRunStateContract(root) {
  const gaps = [];
  const candidates = storeDocuments(root, { dir: ANCHOR_DOCS_DIR, extra: EXTRA_ANCHOR_DOCS });
  const pattern = specialisingHeading('Run state');
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    if (!pattern.test(maskFences(text))) gaps.push({ source: rel });
  }
  return gaps;
}

// scanTriageRecordContract() is pure over a root dir: reads every slice-store document (the same
// candidate list scanAnchorContract/scanReleaseContract use) and reports the ones carrying no `## Triage
// record` section (ADR 0046), then the ones carrying the section but not every element of it. Reusing
// storeDocuments() rather than a hardcoded seed list means a fifth backend seed, or this repo's own
// dogfooded `docs/agents/issue-tracker.md`, is covered the same way the anchor and release contracts
// already are. Absent files are skipped, so fixtures need only the docs they exercise.
function scanTriageRecordContract(root) {
  const gaps = [];
  const candidates = storeDocuments(root, { dir: ANCHOR_DOCS_DIR, extra: EXTRA_ANCHOR_DOCS });
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    const section = extractSection(text, TRIAGE_RECORD_PATTERN);
    if (section === null) {
      gaps.push({ source: rel, expectation: TRIAGE_RECORD_EXPECTATION });
      continue;
    }
    for (const [pattern, desc] of TRIAGE_RECORD_ELEMENTS) {
      if (!pattern.test(section)) gaps.push({ source: rel, expectation: `state ${desc}` });
    }
  }
  return gaps;
}

// scanUntriagedContract() is pure over a root dir: reads every slice-store document (the same candidate
// list scanTriageRecordContract uses) and reports the ones carrying no `## Untriaged item` section, then
// the ones carrying the section but not every element of it. Modeled directly on
// scanTriageRecordContract(), which already walks storeDocuments() so a fifth backend added later
// inherits the requirement without a second row. Absent files are skipped, so fixtures need only the
// documents they exercise.
function scanUntriagedContract(root) {
  const gaps = [];
  const candidates = storeDocuments(root, { dir: ANCHOR_DOCS_DIR, extra: EXTRA_ANCHOR_DOCS });
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    const section = extractSection(text, UNTRIAGED_PATTERN);
    if (section === null) {
      gaps.push({ source: rel, expectation: UNTRIAGED_EXPECTATION });
      continue;
    }
    for (const [pattern, desc] of UNTRIAGED_ELEMENTS) {
      if (!pattern.test(section)) gaps.push({ source: rel, expectation: `state ${desc}` });
    }
  }
  return gaps;
}

// scanSpecialisingCitations() is pure over a root dir: reads every slice-store document (the same
// candidate list scanAnchorContract/scanReleaseContract/scanTriageRecordContract use) and reports every
// specialising section that no longer cites the generic contract it renders. The heading rows in
// SOURCE_SECTION_CONTRACTS pin the generic side and the six contracts above pin the store side; this is
// the citation between them, which nothing read before. A section this heading pattern does not see
// yields nothing — extractSection() returns null and the loop moves on. specialisingHeading() stops at a
// word boundary rather than end-of-line, so the Jira seed's `## Run state (fill in at setup)` is reached
// here too, and its citation is enforced the same as every other member's. Absent files are skipped, so fixtures need only
// the docs they exercise. The citation test runs on the section fence-masked with maskFences(), so a
// citation shown only inside a fenced code example is not read as the real one.
function scanSpecialisingCitations(root) {
  const gaps = [];
  const candidates = storeDocuments(root, { dir: ANCHOR_DOCS_DIR, extra: EXTRA_ANCHOR_DOCS });
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    for (const name of SPECIALISING_SECTIONS) {
      const section = extractSection(text, specialisingHeading(name));
      if (section === null) continue; // this store renders no such section, and says so in its own prose
      if (!specialisingCitation(name).test(maskFences(section))) {
        gaps.push({
          source: rel,
          expectation: `cite \`plan-contract.md\` → *${name}* somewhere in its own \`## ${name}\` section`,
        });
      }
    }
  }
  return gaps;
}

// scanGlossarySpecialisingCitations() is pure over a root dir: reads `CONTEXT.md` and reports every
// specialising member whose glossary entry no longer cites the generic contract it specialises — the
// same citation scanSpecialisingCitations() already pins on the store side, applied to the glossary
// instead. GLOSSARY_ENTRY_TITLES maps a member to its entry's own title (they diverge for `Run state`,
// titled "Published snapshot"), and a member mapped to `null` (`Append mode`, which has no glossary
// entry) is skipped, not flagged — the same permissive skip scanSpecialisingCitations() already takes
// for a store document that legitimately carries no matching section. A member the map omits entirely
// reads as `undefined` here, never a typo silently reading as `null`'s documented absence; the coverage
// selftest in scanners.test.js is what keeps that case from ever reaching a real 7th member.
// extractParagraph() finds the entry from its bold term to the next blank line, narrower than
// extractSection()'s heading-to-heading span, because a glossary entry is a paragraph, not a section.
// The citation test runs on the entry fence-masked with maskFences(), matching
// scanSpecialisingCitations()'s own rule: a citation shown only inside a fenced example is not the real
// one.
function scanGlossarySpecialisingCitations(root) {
  const gaps = [];
  const text = readDoc(root, 'CONTEXT.md');
  if (text === null) return gaps; // CONTEXT.md absent (fixture / partial checkout) → nothing to scan
  for (const name of SPECIALISING_SECTIONS) {
    const title = GLOSSARY_ENTRY_TITLES[name];
    if (title === null) continue; // this member has no glossary entry, documented as null in GLOSSARY_ENTRY_TITLES (contracts.js)
    const entry = extractParagraph(text, new RegExp(`\\*\\*${title}\\*\\*:`));
    if (entry === null) continue; // the glossary entry itself is absent or the title was renamed; currently has no backstop check
    if (!specialisingCitation(name).test(maskFences(entry))) {
      gaps.push({
        source: 'CONTEXT.md',
        expectation: `cite \`plan-contract.md\` → *${name}* in its **${title}** glossary entry`,
      });
    }
  }
  return gaps;
}

// scanAfkSelectionNeutrality() is pure over a root dir: reads `skills/afk/SKILL.md`, isolates the selection
// section, and reports every store mechanism it names. An absent file or a missing section yields nothing
// — `skills/afk/SKILL.md`'s existence is asserted by the `pinned-paths` check, which collects every path the
// contract tables pin (three of them pin this file).
function scanAfkSelectionNeutrality(root) {
  const gaps = [];
  let text;
  try {
    text = fs.readFileSync(docPath(root, 'skills', 'afk', 'SKILL.md'), 'utf8');
  } catch {
    return gaps; // afk.md absent → nothing to scan
  }
  const section = extractSection(text, AFK_SELECTION_HEADING);
  if (section === null) {
    // A missing, renamed, or renumbered selection heading is itself a gap — the same reasoning as
    // main()'s skills/afk/SKILL.md-existence check: silently returning nothing here would let the section
    // (and whatever store mechanism it names) drift out from under this check with nothing going red.
    gaps.push({
      source: path.join('skills', 'afk', 'SKILL.md'),
      expectation:
        'carry a `## 2. …` selection heading — a missing or renumbered one leaves the neutrality check nothing to scan',
    });
    return gaps;
  }
  for (const [pattern, label] of STORE_MECHANISMS) {
    if (pattern.test(section)) {
      gaps.push({
        source: path.join('skills', 'afk', 'SKILL.md'),
        expectation: `select without naming ${label} — read the store's \`## Scope anchor\` contract instead`,
      });
    }
  }
  // Naming no mechanism is half the property. A selection step that names none *and* points at no
  // contract either has nothing to select by, so the neutrality would be satisfied by prose that simply
  // says less.
  if (!/## Scope anchor/.test(section)) {
    gaps.push({
      source: path.join('skills', 'afk', 'SKILL.md'),
      expectation: "point its selection at the store's `## Scope anchor` contract",
    });
  }
  return gaps;
}

// scanAfkAnchorCount() is pure over a root dir: reads `skills/afk/SKILL.md`, isolates the one paragraph
// AFK_ANCHOR_COUNT_HEADING names with extractParagraph() — narrower than a section, so a legitimate
// restatement later in the same `## 2.` section (the eligibility bullet also reads the anchor dependency)
// cannot satisfy this contract on the stale paragraph's behalf — and reports the elements missing from
// that isolation alone. An absent file yields nothing; `skills/afk/SKILL.md`'s existence is asserted by the
// pinned-paths check.
function scanAfkAnchorCount(root) {
  const gaps = [];
  const rel = path.join('skills', 'afk', 'SKILL.md');
  const text = readDoc(root, rel);
  if (text === null) return gaps; // afk.md absent (fixture / partial checkout) → nothing to scan
  const paragraph = extractParagraph(text, AFK_ANCHOR_COUNT_HEADING);
  if (paragraph === null) {
    gaps.push({
      source: rel,
      expectation:
        'carry the paragraph introducing `## Scope anchor` in §2 — a missing or reworded lead-in leaves ' +
        'the two elements below it unscoped and unchecked',
    });
    return gaps;
  }
  for (const [pattern, expectation] of AFK_ANCHOR_COUNT_ELEMENTS) {
    if (!pattern.test(paragraph) && !pattern.test(normalizeWhitespace(paragraph))) {
      gaps.push({ source: rel, expectation });
    }
  }
  return gaps;
}

// scanDocsCarry(): the shared loop behind the single-pattern-per-document checks — every listed
// document must still match the pattern; one that no longer does is the gap. Absent files are
// skipped, so fixtures need only the docs they exercise.
function scanDocsCarry(root, docs, pattern) {
  const gaps = [];
  for (const rel of docs) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    if (!pattern.test(text)) gaps.push({ source: rel });
  }
  return gaps;
}

// The documentation-convention seed must offer a writing standard (ADR 0012).
const scanWritingStandardContract = (root) => scanDocsCarry(root, WRITING_STANDARD_DOCS, WRITING_STANDARD_PATTERN);

// scanAdrStatus() is pure over a root dir: reads every `docs/adr/*.md` and reports the ones carrying no
// recognised status line. An absent directory is skipped, so fixtures need only the files they exercise.
function scanAdrStatus(root) {
  let names;
  try {
    names = fs.readdirSync(path.join(root, ADR_DIR));
  } catch {
    return []; // no ADR tree (fixture / partial checkout) → nothing to scan
  }
  return names
    .filter((n) => n.endsWith('.md'))
    .sort()
    .filter((n) => !ADR_STATUS_PATTERN.test(fs.readFileSync(path.join(root, ADR_DIR, n), 'utf8')))
    .map((n) => ({ source: path.join(ADR_DIR, n) }));
}

// scanEvalShape() is pure over a root dir: reads every eval case and reports graders whose frontmatter
// the eval runner could not act on, plus cases whose scaffold_script does not resolve. An absent evals/ dir,
// or a case with no graders/ dir, yields nothing — there is no shape to be wrong.
function scanEvalShape(root) {
  const problems = [];
  let cases;
  try {
    cases = fs.readdirSync(path.join(root, 'evals'), { withFileTypes: true });
  } catch {
    return problems; // no evals/ → nothing to check
  }
  for (const entry of cases) {
    if (!entry.isDirectory()) continue;
    const caseDir = path.join(root, 'evals', entry.name);

    let caseYaml;
    try {
      caseYaml = fs.readFileSync(path.join(caseDir, 'case.yaml'), 'utf8');
    } catch {
      caseYaml = null; // not a case dir (e.g. a shared fixtures dir) → only its graders matter
    }
    if (caseYaml) {
      const script = caseYaml.replace(/\r\n/g, '\n').match(/^\s*scaffold_script:\s*(.+)$/m);
      const scriptPath = script && scalar(script[1]);
      if (scriptPath && !fs.existsSync(path.join(caseDir, scriptPath))) {
        problems.push({
          source: path.join('evals', entry.name, 'case.yaml'),
          problem: `scaffold_script \`${scriptPath}\` does not resolve relative to the case directory`,
        });
      }
    }

    let graders;
    try {
      graders = fs.readdirSync(path.join(caseDir, 'graders'));
    } catch {
      continue; // no graders/ → nothing to check
    }
    for (const file of graders) {
      if (!file.endsWith('.md')) continue;
      const rel = path.join('evals', entry.name, 'graders', file);
      const fields = frontmatter(fs.readFileSync(path.join(caseDir, 'graders', file), 'utf8'));
      if (!fields) {
        problems.push({ source: rel, problem: 'has no `---` frontmatter block' });
        continue;
      }
      if (!GRADER_TYPES.has(fields.type)) {
        problems.push({
          source: rel,
          problem: `\`type: ${fields.type ?? '(missing)'}\` is not one of ${[...GRADER_TYPES].join(', ')}`,
        });
      }
      const weight = Number(fields.weight);
      if (!fields.weight || !Number.isFinite(weight) || weight <= 0) {
        problems.push({
          source: rel,
          problem: `\`weight: ${fields.weight || '(missing)'}\` is not a positive number`,
        });
      }
      if (FOCUS_TYPES.has(fields.type) && fields.focus === undefined && fields.target === undefined) {
        problems.push({ source: rel, problem: 'declares neither `focus` nor `target`' });
      }
    }
  }
  return problems;
}

// Every document in the doc loop must still instruct itself to read the content-type lens (ADR 0014).
const scanContentTypesContract = (root) => scanDocsCarry(root, CONTENT_TYPES_DOCS, CONTENT_TYPES_PATTERN);

// scanCommandRefs() is pure over a root dir: reads skills/<name>/SKILL.md and agents/*.md and reports
// every command reference with no matching skill under skills/. A document naming the same missing
// command is reported once per document, so the report alone names every dead end.
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

// scanChainHandoff() is pure over a root dir: reads each command in the chain and reports the ones that
// no longer name their successor. Absent files are skipped, so fixtures need only the links they
// exercise.
function scanChainHandoff(root) {
  const gaps = [];
  for (const [rel, next] of CHAIN_HANDOFFS) {
    const text = readDoc(root, rel);
    if (text === null) continue; // document absent (fixture / partial checkout) → nothing to scan
    if (!text.includes(next)) gaps.push({ source: rel, next });
  }
  return gaps;
}

// scanAfkInvocations() is pure over a root dir: reads skills/afk/SKILL.md and reports every stage-table row
// that names one of the four chain commands without carrying `--unattended` on that same row. Absent
// afk.md is skipped, matching every other contract scanner.
function scanAfkInvocations(root) {
  const gaps = [];
  let text;
  try {
    text = fs.readFileSync(docPath(root, 'skills', 'afk', 'SKILL.md'), 'utf8');
  } catch {
    return gaps; // afk.md absent → nothing to scan
  }
  const invoked = new Set();
  for (const line of text.split('\n')) {
    const match = line.match(AFK_ROW_PATTERN);
    if (!match || !AFK_NAMES.has(match[1])) continue;
    invoked.add(match[1]);
    if (!/--unattended/.test(line)) {
      gaps.push({
        source: path.join('skills', 'afk', 'SKILL.md'),
        expectation: `invoke \`/superdev:${match[1]}\` with \`--unattended\` on its table row: \`${line.trim()}\``,
      });
    }
  }
  // Inspecting only the rows that exist says nothing about a row that stopped existing. Deleting the
  // stage table, or one step out of it, would otherwise leave zero gaps: afk would quietly skip a step of
  // the chain — never reviewing, or never shipping — and report a clean sweep either way.
  for (const name of AFK_NAMES) {
    if (!invoked.has(name)) {
      gaps.push({
        source: path.join('skills', 'afk', 'SKILL.md'),
        expectation: `carry a stage-table row invoking \`/superdev:${name}\``,
      });
    }
  }
  return gaps;
}

// scanShipGateContract() is pure over a root dir: reads skills/ship/SKILL.md, isolates the "Entries standing."
// paragraph, and reports every gate element that paragraph does not itself carry. An absent ship.md is
// skipped, matching every other contract scanner; a ship.md with no such paragraph at all is one gap
// naming the missing paragraph, the same shape scanAnchorContract() uses for a missing section.
//
// Ordering dependency: extractSection() runs from SHIP_GATE_HEADING to the next markdown heading, and
// "Entries standing." carries no heading of its own — so this check's specificity holds only as long as
// that paragraph stays the LAST one in §3, immediately before "## 4. Definition of Done". Move it above
// the stage-gate bullets and the extracted section would swallow them too; §3's other gate uses the
// identical "ask once" / `--unattended` → refuse phrasing for an unrelated question, so it would then
// satisfy SHIP_GATE_ELEMENTS on its own and this check would silently degrade to the whole-file match
// the comment above warns against.
function scanShipGateContract(root) {
  const gaps = [];
  let text;
  try {
    text = fs.readFileSync(docPath(root, 'skills', 'ship', 'SKILL.md'), 'utf8');
  } catch {
    return gaps; // ship.md absent → nothing to scan
  }
  const section = extractSection(text, SHIP_GATE_HEADING);
  if (section === null) {
    gaps.push({
      source: path.join('skills', 'ship', 'SKILL.md'),
      expectation: "carry the entries-standing gate's own \"Entries standing.\" paragraph",
    });
    return gaps;
  }
  for (const [pattern, expectation] of SHIP_GATE_ELEMENTS) {
    if (!pattern.test(section)) gaps.push({ source: path.join('skills', 'ship', 'SKILL.md'), expectation });
  }
  return gaps;
}

// scanOrphanLensPlacement() is pure over a root dir: reports the orphan production symbol lens missing
// from `## Design smells`, stated there without its own scoping clause, or also present under
// `## Anti-patterns`, the section `slice-reviewer` reads. An absent document is skipped, matching every
// other contract scanner.
function scanOrphanLensPlacement(root) {
  const gaps = [];
  const text = readDoc(root, ORPHAN_LENS_DOC);
  if (text === null) return gaps; // document absent (fixture / partial checkout) → nothing to scan
  const design = extractSection(text, ORPHAN_LENS_DESIGN_HEADING);
  if (design === null || !ORPHAN_LENS_ENTRY.test(design)) {
    gaps.push({
      source: ORPHAN_LENS_DOC,
      expectation:
        'name **Orphan production symbol** under `## Design smells` — the section `final-reviewer` reads and `slice-reviewer` does not',
    });
  } else if (!ORPHAN_LENS_SCOPE_CLAUSE.test(design)) {
    gaps.push({
      source: ORPHAN_LENS_DOC,
      expectation:
        'scope the orphan lens to the integrated scope in its own wording — on one slice diff, a caller arriving in a later slice reads as an orphan',
    });
  }
  const antiPatterns = extractSection(text, ORPHAN_LENS_ANTIPATTERN_HEADING);
  if (antiPatterns === null) {
    gaps.push({
      source: ORPHAN_LENS_DOC,
      expectation:
        'carry an `## Anti-patterns` (or `### Anti-patterns`) section — its absence hides whether the orphan lens leaked into it beside `slice-reviewer`\'s own lenses',
    });
  } else if (ORPHAN_LENS_ENTRY.test(antiPatterns)) {
    gaps.push({
      source: ORPHAN_LENS_DOC,
      expectation:
        'keep **Orphan production symbol** out of `## Anti-patterns` — `slice-reviewer` reads that section and would report every not-yet-called symbol',
    });
  }
  return gaps;
}

// scanTestCostLensPlacement() is pure over a root dir: reads the review checklist and reports each
// test-cost lens that left `## Test cost` or reached `## Anti-patterns`. Mirrors
// scanOrphanLensPlacement() above, over the test-cost lens entries instead of orphan's single entry,
// and with no scoping clause of its own — the section's own prose carries that, and `test-auditor`'s
// lens sentence is pinned by the `agent-lens-list` table. An absent `## Anti-patterns` is its own gap,
// so a renamed section never hides a leak into it. Absent documents are skipped, matching every other
// scanner.
function scanTestCostLensPlacement(root) {
  const gaps = [];
  const text = readDoc(root, TEST_COST_LENS_DOC);
  if (text === null) return gaps; // document absent (fixture / partial checkout) → nothing to scan
  const section = extractSection(text, TEST_COST_LENS_HEADING);
  const antiPatterns = extractSection(text, ORPHAN_LENS_ANTIPATTERN_HEADING);
  if (antiPatterns === null) {
    gaps.push({
      source: TEST_COST_LENS_DOC,
      expectation:
        'carry an `## Anti-patterns` (or `### Anti-patterns`) section — its absence hides whether a test-cost lens leaked into it, where `slice-reviewer` reads with no measured duration to judge it by',
    });
  }
  for (const [name, entry] of TEST_COST_LENS_ENTRIES) {
    if (section === null || !entry.test(section)) {
      gaps.push({
        source: TEST_COST_LENS_DOC,
        expectation: `name **${name}** under \`## Test cost\` — the section \`test-auditor\` reads and no diff-scoped reviewer does`,
      });
    }
    if (antiPatterns !== null && entry.test(antiPatterns)) {
      gaps.push({
        source: TEST_COST_LENS_DOC,
        expectation: `keep **${name}** out of \`## Anti-patterns\` — \`slice-reviewer\` reads that section, and judging this lens needs a measured duration it never holds`,
      });
    }
  }
  return gaps;
}

// scanUnresolvedGlossaryContract() is pure over a root dir: reads every document UNRESOLVED_GLOSSARY_CONTRACTS
// names and reports the rows whose canonical clause is not present verbatim, after whitespace normalization
// on both sides. Absent files are skipped, matching every other contract scanner.
function scanUnresolvedGlossaryContract(root) {
  const gaps = [];
  for (const [rel, clause, expectation] of UNRESOLVED_GLOSSARY_CONTRACTS) {
    const text = readDoc(root, rel);
    if (text === null) continue; // document absent (fixture / partial checkout) → nothing to scan
    if (!normalizeWhitespace(text).includes(normalizeWhitespace(clause))) gaps.push({ source: rel, expectation });
  }
  return gaps;
}

// scanDocsAvoid(): the shared loop behind the negative checks — a marker the listed documents must
// NOT match (a table row asserts a document still matches a pattern; these assert one no longer
// does). Each marker is `[pattern, expectation(hit)]`, so every check keeps its own gap text.
// Absent files are skipped, as everywhere else here.
function scanDocsAvoid(root, docs, markers) {
  const gaps = [];
  for (const rel of docs) {
    const text = readDoc(root, rel);
    if (text === null) continue; // document absent (fixture / partial checkout) → nothing to scan
    for (const [pattern, expectation] of markers) {
      const hit = text.match(pattern);
      if (hit) gaps.push({ source: rel, expectation: expectation(hit) });
    }
  }
  return gaps;
}

// No document outside publish-kb may carry a KB-backend call marker (ADR 0023).
const scanKbNoBackendCall = (root) =>
  scanDocsAvoid(root, KB_NO_CALL_DOCS, KB_BACKEND_CALL_MARKERS.map(([pattern, what]) =>
    [pattern, () => `reach no knowledge-base backend — it still carries ${what}`]));

// `slice-reviewer.md` may carry no `design-smell` token anywhere: that lens reaches only
// `final-reviewer` (ADR 0062).
const scanAgentLensNoDesignSmell = (root) =>
  scanDocsAvoid(root, AGENT_LENS_AVOID_DOCS, AGENT_LENS_AVOID_MARKERS);

// Every document a contract table pins still exists. `scanContract()` skips a document it cannot read —
// the convention that lets a fixture carry only the files one assertion exercises, and lets a partial
// checkout fail nothing — so a table reports zero gaps the moment its document is renamed or deleted, and
// every check stays green while the contract it asserted is gone. Verified before this check existed:
// `FIX_BOUNDARY_CONTRACTS` against a tree with no `skills/review/SKILL.md` returned no gaps at all.
//
// The paths come from the tables themselves rather than a list kept beside them, so a table added later is
// covered without anyone remembering to. `collectPinnedPaths()` recurses every exported value — arrays,
// plain objects (a row's `test()`-shaped second element), and strings — because a document is pinned in
// more shapes than `[relPath, RegExp, expectation]`: `READ_PATH_CONTRACTS`'s second row carries a `test()`
// function instead of a `RegExp`, and `RUN_ROOT_DOCS` / `CONTENT_TYPES_DOCS` are bare path lists with no
// row shape at all. Gating on shape (`row[1] instanceof
// RegExp`) missed exactly those; gating on a path-shaped string instead — one ending in `.md`, `.json`, or
// `.js` — catches all of them, and a path-shape predicate still won't misreport a row whose first element
// is a heading rather than a path. A `Set` is deliberately excluded from the recursion: every `Set` in
// this file holds a membership value (`ASSIGNEE_EXEMPT`'s bare filename, `AFK_NAMES`'s bare verb), not a
// document this scanner should assert exists — `ASSIGNEE_EXEMPT`'s bare `issue-tracker-local.md` has no
// root-level file to resolve to, so recursing into it would report the real
// `references/issue-tracker-local.md` as missing.
//
// This holds the slot the `afk-existence` check held, which asserted `skills/afk/SKILL.md` alone on the
// stated grounds that nothing else in the plugin names `/superdev:afk` — already false when written:
// `skills/implement/SKILL.md` names it too, and `command-resolution` already resolves every `/superdev:`
// reference under `skills/`, so it already caught that file's deletion. Three contract tables also
// pin `skills/afk/SKILL.md` directly, so the general rule here covers it a second way.
//
// ponytail: shape-based, and its ceiling is the extension whitelist and the two container shapes it
// recurses (arrays, plain objects). A future table that pins a path with no `.md`/`.json`/`.js`
// extension, as an object key instead of a value, or inside a `Map`, goes uncollected — silently,
// since `scanPinnedPaths` only ever reports a path it found. Measured clean against every table this
// file exports today; widen the whitelist or the recursion the day a table needs one of those shapes.
const PATH_SHAPE = /\.(?:md|json|js)$/;

function collectPinnedPaths(value, pinned) {
  if (typeof value === 'string') {
    if (PATH_SHAPE.test(value)) pinned.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPinnedPaths(item, pinned);
    return;
  }
  if (value && typeof value === 'object' && !(value instanceof RegExp) && !(value instanceof Set)) {
    for (const item of Object.values(value)) collectPinnedPaths(item, pinned);
  }
}

function scanPinnedPaths(root) {
  const pinned = new Set();
  for (const value of Object.values(contracts)) collectPinnedPaths(value, pinned);
  const gaps = [];
  for (const rel of [...pinned].sort()) {
    if (fs.existsSync(docPath(root, rel))) continue;
    gaps.push({
      source: rel,
      expectation:
        `exist — a contract table pins \`${rel}\`, and scanContract() skips a document it cannot read, so ` +
        'every row on it passes vacuously while the contract is gone',
    });
  }
  return gaps;
}

// The two chain steps after the review, and the writer the first of them dispatches, instruct no
// full-suite run of their own (ADR 0025). `agents/final-reviewer.md` joins the same silence list for a
// different reason: it must never re-grow the optional live-scope re-run its own dispatch sentence
// replaced, beside the deferral clause that already satisfies the presence check above.
const scanDocStepsNoSuite = (root) =>
  scanDocsAvoid(root, DOC_STEP_SILENCE_DOCS, SUITE_RUN_INSTRUCTIONS.map((pattern) =>
    [pattern, (hit) => `leave the scope's one full suite to \`/superdev:review\` — it instructs a run of ` +
      `its own: "${normalizeWhitespace(hit[0])}"`]));

// The denial cap's four call sites must never restate its own number (ADR 0041): the number lives once,
// in `references/scope-mode.md`'s `## Degraded passes` section, and a call site names that section
// instead of repeating the digit — the same asymmetry `scanDocStepsNoSuite` above guards for ADR 0025.
const scanDenialCapNumberSilence = (root) =>
  scanDocsAvoid(root, DENIAL_CAP_NUMBER_SILENCE_DOCS, DENIAL_CAP_NUMBER_MARKERS);

// `skills/afk/SKILL.md`'s eligibility bullet reads a scope's run lock, and `SCOPE_WORKTREE_CONTRACTS` pins
// its surviving fallback rule by presence — a row whose expectation describes an absence, which a
// presence row cannot assert. The stale claim it means to keep out ("a run lock only ever exists for a
// `lite`-tier scope", true before ADR 0045 gave both tiers one) can regrow as a sentence preceding that
// rule while the row still matches, and an unattended controller would then distrust a signal it can
// trust. This asserts the absence the row's own expectation describes.
const scanAfkLockTierClaim = (root) =>
  scanDocsAvoid(root, AFK_LOCK_TIER_SILENCE_DOCS, AFK_LOCK_TIER_MARKERS);

// Shipped agent briefs run in consumer repos, so their prose names no concrete toolchain command; see
// AGENT_TOOLCHAIN_PATTERNS' note for the class and its ceiling. The doc list is the `agents/` directory
// read at scan time, not a pinned table, so a new agent is covered the day its file lands.
function scanAgentToolAgnostic(root) {
  let names = [];
  try {
    names = fs.readdirSync(docPath(root, 'agents')).filter((f) => f.endsWith('.md'));
  } catch {
    return []; // no agents dir (fixture / partial checkout) → nothing to scan
  }
  return scanDocsAvoid(
    root,
    names.map((f) => path.join('agents', f)),
    AGENT_TOOLCHAIN_PATTERNS.map((pattern) => [
      pattern,
      (hit) =>
        `stay tool-agnostic — the test command is \`references/test-selection.md\`'s to select, and it ` +
        `still names \`${normalizeWhitespace(hit[0])}\``,
    ]),
  );
}

function scanHookLedgerParsers(root) {
  const dir = docPath(root, 'hooks');
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch {
    return []; // no hooks dir (fixture) → nothing to scan
  }
  const offenders = [];
  for (const name of names) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch {
      continue;
    }
    if (HOOK_HEADER_REGEX.test(text)) {
      offenders.push({
        source: path.join('hooks', name),
        expectation:
          'read a ledger header through `scripts/scope.js`\'s exported `readLedgerHeader` — it carries a `**…:**` regex of its own, which is the drift ADR 0022 removed',
      });
    }
  }
  return offenders;
}

// Neither execution playbook may name a forcing branch flag (ADR 0028).
const scanForcingBranchFlag = (root) =>
  scanDocsAvoid(root, FORCING_FLAG_DOCS, FORCING_FLAG_PATTERNS.map((pattern) =>
    [pattern, (hit) =>
      `name no forcing branch flag — \`${hit[0]}\` resets an existing branch instead of failing ` +
      'on it, stranding every slice already merged into it; see ADR 0028']));

// scanNarrativeCoverage(): every registered check is written up in `scripts/AGENTS.md` by its backticked
// `id`.
//
// The id half requires the exact `` `${id}` `` backtick pair rather than a bare substring: a check's id
// is often a substring of unrelated prose (`reference` inside `references/…`), and a bare search on it
// would report every check written up whether or not it actually is.
//
// `ids` is a parameter rather than a module-level require because `checks.js` requires this file: taking
// the registry at call time keeps the cycle from forming, and lets the selftest drive the scanner with a
// fixed list instead of one that shifts every time a check is added.
function scanNarrativeCoverage(root, ids = require('./checks').map((check) => check.id)) {
  const gaps = [];
  const narrative = readDoc(root, NARRATIVE_DOC);
  if (narrative === null) return gaps; // narrative absent (fixture / partial checkout) → nothing to scan

  for (const id of ids) {
    if (!narrative.includes(`\`${id}\``)) {
      gaps.push({
        source: NARRATIVE_DOC,
        expectation:
          `describe the \`${id}\` check — it is registered in \`drift/checks.js\` and written up ` +
          'nowhere by its own backticked id, so the only account of what it guards is its own code',
      });
    }
  }
  return gaps;
}

// scanReturnToController() is pure over a root dir: reads the two execution playbooks plus run-init.md
// and run-handoff.md (`RETURN_TO_CONTROLLER_DOCS`, in `contracts.js`) and reports every instruction they
// still give to return to the command body. Slices 01-02 made the run one-directional — it opens at
// run-init.md and ends at run-handoff.md, and no document sends a reader back — but nothing guarded that
// shape, so a later edit could reintroduce the return jump silently. Absent files are skipped, so
// fixtures need only the documents they exercise.
const scanReturnToController = (root) =>
  scanDocsAvoid(root, RETURN_TO_CONTROLLER_DOCS, RETURN_TO_CONTROLLER_PATTERNS.map((pattern) =>
    [pattern, (hit) =>
      `instruct no return to the command body — \`${hit[0]}\` sends a reader back to the ` +
      'controller instead of forward, the way run-init.md and run-handoff.md do']));

// scanMarketplaceSource() is pure over a root dir: `.claude-plugin/marketplace.json`'s relative `source`
// for each plugin must resolve to a directory carrying `.claude-plugin/plugin.json`. That one string is
// what limits an install to the shipped tree (ADR 0032), and `claude plugin validate .` accepts a source
// that names no directory at all — so a renamed tree or a mistyped path breaks every install while the
// suite stays green. The manifest is a repo-root file, never under `plugin/`, so it is read directly
// rather than through docPath(). An absent or unparsable manifest is skipped, so fixtures need only the
// files they exercise; an object source names a remote repo and is out of scope.
function scanMarketplaceSource(root) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  } catch {
    return []; // no marketplace manifest (fixture / partial checkout) → nothing to scan
  }
  const gaps = [];
  for (const plugin of manifest.plugins || []) {
    if (typeof plugin.source !== 'string') continue;
    if (!fs.existsSync(path.join(root, plugin.source, '.claude-plugin', 'plugin.json'))) {
      gaps.push({
        source: path.join('.claude-plugin', 'marketplace.json'),
        expectation:
          `point \`${plugin.name}\`'s source at a directory carrying \`.claude-plugin/plugin.json\` — ` +
          `\`${plugin.source}\` resolves to no plugin tree, and \`claude plugin validate\` accepts that`,
      });
    }
  }
  return gaps;
}

// scanReadmeCommands() is pure over a root dir: `README.md` and `skills/` agree — every
// `skills/<name>/SKILL.md` is mentioned in the README as `/superdev:<name>`, and every
// `/superdev:<name>` the README names has a skill. The README is the user-facing map of the commands,
// so a command it never names or a command it still names after a rename is a router that lies. Either
// half is skipped when its side is absent (fixture / partial checkout), matching every other scanner.
function scanReadmeCommands(root) {
  const gaps = [];
  const readme = readDoc(root, 'README.md');
  if (readme === null) return gaps;
  let entries;
  try {
    entries = fs.readdirSync(docPath(root, 'skills'), { withFileTypes: true });
  } catch {
    return gaps; // no skills dir → nothing to cross-check
  }
  const commands = new Set(
    entries
      .filter((e) => e.isDirectory() && fs.existsSync(docPath(root, 'skills', e.name, 'SKILL.md')))
      .map((e) => e.name),
  );
  for (const name of [...commands].sort()) {
    if (!readme.includes(`/superdev:${name}`)) {
      gaps.push({
        source: 'README.md',
        expectation:
          `mention \`/superdev:${name}\` — \`skills/${name}/SKILL.md\` ships, and a README that never ` +
          'names a command is a router that lies',
      });
    }
  }
  const named = new Set();
  for (const m of readme.matchAll(/\/superdev:([a-z][a-z0-9-]*)/g)) named.add(m[1]);
  for (const name of [...named].sort()) {
    if (!commands.has(name)) {
      gaps.push({
        source: 'README.md',
        expectation:
          `name only commands that exist — \`/superdev:${name}\` has no \`skills/${name}/SKILL.md\`, ` +
          'so the README routes users to a command the plugin does not carry',
      });
    }
  }
  return gaps;
}

// auditSetMatches(): how many files an audit-set pattern resolves to under `root`. The section's own rule
// makes every entry a repo-relative path, optionally with one `*` in a single segment — the shape
// `/superdev:document audit` expands — so this walks the segments literally and expands the starred one
// by reading that directory, rather than depending on a glob implementation whose availability varies
// by Node version.
function auditSetMatches(root, pattern) {
  const segments = pattern.split('/');
  const starAt = segments.findIndex((s) => s.includes('*'));
  if (starAt === -1) return fs.existsSync(path.join(root, pattern)) ? 1 : 0;
  const re = new RegExp(
    `^${segments[starAt].split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`,
  );
  const walk = (dir, at) => {
    if (at === segments.length) return 1;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0; // the directory itself is gone, which is the same lie as an empty match
    }
    let count = 0;
    for (const entry of entries) {
      const last = at === segments.length - 1;
      const matches = at === starAt ? re.test(entry.name) : entry.name === segments[at];
      if (!matches) continue;
      if (last) count += 1;
      else if (entry.isDirectory()) count += walk(path.join(dir, entry.name), at + 1);
    }
    return count;
  };
  return walk(root, 0);
}

// scanAuditSetGlobs() is pure over a root dir: every glob listed under `## Audit set` in this repo's own
// `docs/agents/documentation.md` matches at least one file. The AUDIT_SET_CONTRACTS table pins that the
// section exists and that setup/document/seed still agree about it; nothing there resolves a glob, and a
// glob matching nothing is indistinguishable from a clean audit — `/superdev:document audit` silently
// reads zero files and reports success. Paths are repo-relative by the section's own rule, so they are
// resolved against the root and never through docPath()'s plugin/ fallback. Absent file → skipped,
// matching every other scanner.
function scanAuditSetGlobs(root) {
  const gaps = [];
  const doc = readDoc(root, path.join('docs', 'agents', 'documentation.md'));
  if (doc === null) return gaps;
  const at = doc.search(/^##\s+Audit set\s*$/m);
  if (at === -1) return gaps; // AUDIT_SET_CONTRACTS owns the section's existence
  const rest = doc.slice(at);
  const next = rest.slice(1).search(/^##\s/m);
  const section = next === -1 ? rest : rest.slice(0, next + 1);
  for (const m of section.matchAll(/^-\s+`([^`]+)`\s*$/gm)) {
    const pattern = m[1];
    if (auditSetMatches(root, pattern) === 0) {
      gaps.push({
        source: path.join('docs', 'agents', 'documentation.md'),
        expectation:
          `list only audit-set patterns that resolve — \`${pattern}\` matches no file, so ` +
          '`/superdev:document audit` reads nothing for it and still reports a clean pass',
      });
    }
  }
  return gaps;
}

// An eval case that exercises scope mode has to hand the arm a run root, and a scaffold script is plain
// shell with no access to the plugin — so it writes the ledger by hand, against a schema `scope.js` owns
// (ADR 0022). Nothing else couples the two. A schema change then leaves the scaffold writing a ledger no
// command recognises, the case quietly stops entering scope mode, and it still runs and still scores:
// the arms review an ordinary branch instead, and the number that comes back looks like a result.
//
// The check runs `scope.js`'s own `readLedgerHeader` over the scaffold text, rather than a pattern of its
// own. The heredoc lines sit in the file verbatim, so the reader finds them where it would find them in a
// real ledger, and the coupling is to the reader itself instead of to a copy of what the reader currently
// accepts. `require`d statically, so the check moves the moment `scope.js` does.
//
// This one function makes two unrelated assertions over the same scaffold text — the ledger schema shape
// above, and the scope-branch position below — because both are things a scope-mode scaffold can get
// wrong silently, and both are cheap to check together over the same file read.
//
// ponytail: shape-based, and its ceiling is the three headers plus the column row below, for the ledger
// half. The branch-return guard below carries its own ceiling: it matches exactly two verbs
// (`checkout`/`switch`), exactly two branch names (`main`/`master`), anchored at line start — a chained or
// quoted checkout, or any other branch name, passes here and fails at run time. A scaffold that writes a
// well-formed ledger and then corrupts it in a later command passes this and fails at run time too. A
// fourth limit sits before either assertion runs: the file read is hardcoded to `scaffold.sh`, not
// `case.yaml`'s own `scaffold_script` — a case whose script carries a different name is skipped here
// with no gap, the same silent-miss shape this check exists to catch in the scaffold's own ledger.
const LEDGER_HEADERS = ['Stage', 'Branch', 'Anchor'];
const LEDGER_COLUMNS = '| id | issue | title | type | depends-on | status | range |';

function scanScaffoldLedger(root) {
  const problems = [];
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, 'evals'), { withFileTypes: true });
  } catch {
    return problems; // no evals/ → nothing to check
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const scaffold = path.join(root, 'evals', entry.name, 'scaffold.sh');
    let text;
    try {
      text = fs.readFileSync(scaffold, 'utf8');
    } catch {
      continue; // a case with no scaffold of its own (a primed case names a sibling's)
    }
    if (!text.includes('.superdev/scopes/')) continue; // not a scope-mode case

    const source = path.join('evals', entry.name, 'scaffold.sh');
    for (const name of LEDGER_HEADERS) {
      if (readLedgerHeader(text, name) === null) {
        problems.push({
          source,
          expectation:
            `write a \`**${name}:**\` ledger line \`scope.js\`'s own \`readLedgerHeader\` can read — it ` +
            `stages a run root, so the ledger it writes is the schema \`scope.js\` owns (ADR 0022)`,
        });
      }
    }
    if (!text.includes(LEDGER_COLUMNS)) {
      problems.push({
        source,
        expectation:
          `write the ledger's seven-column slice table header verbatim (\`${LEDGER_COLUMNS}\`) — a row ` +
          `count is what the tier derivation reads, so a table no verb parses leaves the tier unknown`,
      });
    }
    // The scaffold's own scope-branch commits have to stay reachable from HEAD. `captureDiff`'s orphan
    // guard refuses to score a workspace where any ref carries a commit HEAD cannot reach, and it cannot
    // tell a scaffold's setup commits from an agent's stray branch — so a scaffold that builds the branch
    // and then returns to base fails every arm's capture, scores nothing, and spends the whole run doing
    // it. Observed: `ab-review-ceiling`'s first run, six arms, no graders.
    if (/^\s*git\s+(?:checkout|switch)\s+(?:-q\s+)?(?:main|master)\s*$/m.test(text)) {
      problems.push({
        source,
        expectation:
          'stay on the scope branch it built, rather than returning to the base branch — the runner ' +
          "reads the scaffold's own off-HEAD commits as stray work and fails every arm's diff capture",
      });
    }
  }
  return problems;
}

// walkFiles(dir): every file under dir, as paths relative to dir, sorted. The fixture diff below
// compares two rendered trees by exactly this list. `entry.parentPath` is Node's own name for the
// directory an fs.Dirent came from (`entry.path` before it, removed in Node 24) — read either, so
// this runs on the oldest Node this repo supports and the newest alike. `isFile()` excludes a
// symlink deliberately — neither tree this walks (a fresh render, a committed fixture) ever
// contains one.
function walkFiles(dir) {
  const resolved = path.resolve(dir);
  return fs
    .readdirSync(resolved, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(resolved, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join('/'))
    .sort();
}

// scanOpencodeFixtures() is pure over a root dir: the committed golden render under
// `scripts/drift/fixtures/opencode/` still matches a fresh render of the root's plugin tree. It
// renders through `drift/opencode-fixtures.js`'s renderNormalized() into a temp dir and diffs the
// two trees — a skills or agents edit that changes the render is a gap until the fixtures are
// regenerated (`bun run render-fixtures`) in the same commit. A rendered file with a line-aligned
// source (opencode-overlay.js's sourceForRendered, ADR 0060) is compared as a Render overlay —
// frontmatter and body diffs recomputed fresh from the live source and render, then matched against
// the committed overlay — rather than byte for byte, so a source-file edit that touches no rewritten
// line stays green with the fixtures untouched. A file with no such source, or one whose render has
// stopped being line-aligned with it, is compared byte for byte instead: the whole-body form ADR
// 0060 keeps for the afk command, the hook bridge, the synthesized upgrade skill, and any surface
// alignment has broken for. The adapter module is required from the real plugin tree, so a fixture
// root needs only the plugin's skills/agents and the fixtures themselves; either side absent skips
// the check, matching every other scanner. Gaps are plain strings: the registry entry's format is
// the identity.
function scanOpencodeFixtures(root) {
  const { FIXTURE_DIR, renderNormalized } = require('./opencode-fixtures');
  const overlay = require('./opencode-overlay');
  const fixtureDir = path.join(root, FIXTURE_DIR);
  if (!fs.existsSync(fixtureDir)) return []; // no committed fixtures → nothing to compare
  if (!fs.existsSync(path.join(root, 'plugin', 'skills'))) return []; // fixture root may carry only one side
  const fixtureLabel = FIXTURE_DIR.split(path.sep).join('/');
  const pluginDir = path.join(root, 'plugin');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-render-'));
  try {
    renderNormalized(root, tmp);
    const gaps = [];
    const expected = walkFiles(fixtureDir);
    const actual = walkFiles(tmp);
    for (const rel of expected.filter((rel) => !actual.includes(rel))) {
      gaps.push(`${fixtureLabel}/${rel} has no fresh render — regenerate the fixtures (bun run render-fixtures)`);
    }
    for (const rel of actual.filter((rel) => !expected.includes(rel))) {
      gaps.push(`a fresh render produces ${rel}, which ${fixtureLabel} does not carry — regenerate the fixtures (bun run render-fixtures)`);
    }
    for (const rel of expected.filter((rel) => actual.includes(rel))) {
      const committedText = fs.readFileSync(path.join(fixtureDir, rel), 'utf8');
      const freshText = fs.readFileSync(path.join(tmp, rel), 'utf8');
      const srcPath = overlay.sourceForRendered(pluginDir, rel);
      if (!srcPath) {
        if (committedText !== freshText) {
          gaps.push(`${fixtureLabel}/${rel} no longer matches a fresh render of the plugin tree — regenerate the fixtures (bun run render-fixtures)`);
        }
        continue;
      }
      const result = overlay.computeOverlay(fs.readFileSync(srcPath, 'utf8'), freshText);
      if (!result.ok) {
        const srcRel = path.relative(root, srcPath).split(path.sep).join('/');
        gaps.push(
          `${fixtureLabel}/${rel}: alignment failed — its render is no longer line-for-line aligned with ` +
            `${srcRel} (${result.reason}); move it onto the whole-body fixture list before regenerating (ADR 0060)`,
        );
        continue;
      }
      let committedOverlay;
      try {
        committedOverlay = overlay.parseOverlay(committedText);
      } catch {
        committedOverlay = null;
      }
      if (!committedOverlay || !overlay.overlaysEqual(committedOverlay, result.overlay)) {
        gaps.push(`${fixtureLabel}/${rel} no longer matches a fresh render of the plugin tree — regenerate the fixtures (bun run render-fixtures)`);
      }
    }
    return gaps;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// scanOpencodeSurfaceSplit() is pure over a root dir: the committed OpenCode render puts each
// surface on the side of the skill/command split that its role demands (ADR 0055).
//
// Two directions, and the check needs both. `afk` renders as a command and never as a skill —
// a command is the one OpenCode surface the model cannot invoke, which is the whole mechanism
// standing between a model and an unattended backlog sweep it started itself. And every step afk's
// own chain table names renders as a skill and never as a command — a chain step rendered as a
// command is one afk cannot invoke, which strands the sweep at that step.
//
// The chain-step list is read out of `plugin/skills/afk/SKILL.md`'s own routing section rather than
// hand-copied here, so a step added to that table is a step this check immediately demands a skill
// for. It reads the committed fixtures rather than rendering: `opencode-render` already pins those
// to a fresh render, so the two together cover the live path. Either side absent skips the check,
// matching every other scanner.
function scanOpencodeSurfaceSplit(root) {
  const { FIXTURE_DIR } = require('./opencode-fixtures');
  const afkPath = path.join(root, 'plugin', 'skills', 'afk', 'SKILL.md');
  const fixtureDir = path.join(root, FIXTURE_DIR);
  if (!fs.existsSync(afkPath) || !fs.existsSync(fixtureDir)) return [];

  const afk = fs.readFileSync(afkPath, 'utf8');
  // The routing section, bounded at the next same-level heading: the `/superdev:<name>` tokens in it
  // are the chain steps afk drives.
  const section = afk.match(/\n## 3\. Take it through the chain\n([\s\S]*?)(?=\n## |$)/);
  const steps = section ? [...new Set([...section[1].matchAll(/\/superdev:([a-z][a-z-]*)/g)].map((m) => m[1]))].sort() : [];

  const skillOf = (name) => path.join(fixtureDir, '.opencode', 'skills', `superdev-${name}`, 'SKILL.md');
  const commandOf = (name) => path.join(fixtureDir, '.opencode', 'commands', 'superdev', `${name}.md`);
  const gaps = [];

  if (fs.existsSync(skillOf('afk'))) {
    gaps.push('afk renders as an OpenCode skill, which the model can invoke through the skill tool — it renders as a command precisely so it cannot (ADR 0055)');
  }
  if (!fs.existsSync(commandOf('afk'))) {
    gaps.push('afk renders as no OpenCode command — the command render is what reproduces its disable-model-invocation (ADR 0055)');
  }
  if (steps.length === 0) {
    gaps.push("skills/afk/SKILL.md's `## 3. Take it through the chain` section names no `/superdev:<name>` step — the surface-split check has nothing to hold the render to");
  }
  for (const step of steps) {
    if (!fs.existsSync(skillOf(step))) {
      gaps.push(`afk drives \`/superdev:${step}\`, which renders as no OpenCode skill — a step the model cannot invoke strands the sweep there (ADR 0055)`);
    }
    if (fs.existsSync(commandOf(step))) {
      gaps.push(`afk drives \`/superdev:${step}\`, which renders as an OpenCode command — a command is not model-invocable, so afk cannot reach it (ADR 0055)`);
    }
  }
  return gaps;
}

module.exports = {
  scan,
  scanScaffoldLedger,
  scanRunRootPaths,
  scanAssigneeContract,
  scanAnchorContract,
  scanAppendContract,
  scanReleaseContract,
  scanRunStateContract,
  scanTriageRecordContract,
  scanUntriagedContract,
  scanSpecialisingCitations,
  scanGlossarySpecialisingCitations,
  scanAfkSelectionNeutrality,
  scanAfkAnchorCount,
  scanWritingStandardContract,
  scanAdrStatus,
  scanEvalShape,
  scanContentTypesContract,
  scanCommandRefs,
  scanChainHandoff,
  scanAfkInvocations,
  scanShipGateContract,
  scanOrphanLensPlacement,
  scanTestCostLensPlacement,
  scanUnresolvedGlossaryContract,
  scanKbNoBackendCall,
  scanAgentLensNoDesignSmell,
  scanPinnedPaths,
  scanDocStepsNoSuite,
  scanDenialCapNumberSilence,
  scanAfkLockTierClaim,
  scanAgentToolAgnostic,
  scanHookLedgerParsers,
  scanForcingBranchFlag,
  scanReturnToController,
  scanNarrativeCoverage,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
  scanOpencodeFixtures,
  scanOpencodeSurfaceSplit,
};
