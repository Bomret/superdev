'use strict';

// drift-check bespoke scanners: every check whose assertion is more than "this document still
// matches this pattern". The table-driven ones run through `lib.js`’s scanContract() instead.
// Each scanner is pure over a root dir and returns an array of gaps; `checks.js` orders them and
// owns how each gap is printed.

const fs = require('node:fs');
const path = require('node:path');

const {
  docPath,
  readDoc,
  storeDocuments,
  extractSection,
  maskFences,
  maskedSentences,
  normalizeWhitespace,
} = require('./lib');
const contracts = require('./contracts');
const {
  NARRATIVE_DOC,
  FORCING_FLAG_DOCS,
  FORCING_FLAG_PATTERNS,
  REFERENCE_PATTERN,
  RUN_ROOT_DOCS,
  RUN_ROOT_ARTIFACT_PATTERN,
  SCOPETREE_RUN_ROOT_DOCS,
  SCOPETREE_RUN_ROOT_PATTERN,
  ASSIGNEE_DOCS_DIR,
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
  RELEASE_REMOVE_PATTERN,
  RELEASE_REMOVE_EXPECTATION,
  RELEASE_BOTH_DIRECTIONS_DOC,
  RELEASE_BOTH_DIRECTIONS_PATTERN,
  RELEASE_BOTH_DIRECTIONS_EXPECTATION,
  TRIAGE_RECORD_PATTERN,
  TRIAGE_RECORD_ELEMENTS,
  UNTRIAGED_PATTERN,
  UNTRIAGED_ELEMENTS,
  UNTRIAGED_EXPECTATION,
  SPECIALISING_SECTIONS,
  specialisingHeading,
  specialisingCitation,
  glossaryHeadingReference,
  TRIAGE_RECORD_EXPECTATION,
  WRITING_STANDARD_DOCS,
  WRITING_STANDARD_PATTERN,
  ADR_DIR,
  ADR_STATUS_PATTERN,
  CONTENT_TYPES_DOCS,
  CONTENT_TYPES_PATTERN,
  COMMAND_REFERENCE_PATTERN,
  SUBAGENT_DISPATCH_PATTERN,
  OBSERVATION_CAPTURE_REMINDER_PATTERN,
  CHAIN_HANDOFFS,
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
  UNMAPPED_PATHS_RUNNERS,
  UNMAPPED_PATHS_DOCS,
  DENIAL_CAP_NUMBER_SILENCE_DOCS,
  DENIAL_CAP_NUMBER_MARKERS,
  RUN_LOCK_LIVENESS_SILENCE_DOCS,
  RUN_LOCK_LIVENESS_SILENCE_MARKERS,
  KB_BACKEND_CALL_MARKERS,
  HOOK_HEADER_REGEX,
  RETURN_TO_CONTROLLER_DOCS,
  RETURN_TO_CONTROLLER_PATTERNS,
  NO_FORCE_MERGE_DOCS,
  NO_FORCE_MERGE_PATTERNS,
  TEA_ONLY_DOCS,
  TEA_ONLY_MARKERS,
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

// scanScopetreeRunRootPaths() is the same shape as scanRunRootPaths() above, over the four documents
// (ADR 0080) that address another run's scopetree from their own cwd — which may not be the invoking
// checkout — rather than a `scopetree` directory a real `git worktree add`-style command builds against
// the checkout it is already running from. `RUN_ROOT_ARTIFACT_PATTERN` deliberately excludes `scopetree`
// for that reason, so a reverted cwd-relative literal in one of these four needs its own pattern.
function scanScopetreeRunRootPaths(root) {
  const offenders = [];
  for (const rel of SCOPETREE_RUN_ROOT_DOCS) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    for (const match of text.matchAll(SCOPETREE_RUN_ROOT_PATTERN)) {
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
// `- **Assignee:**` configuration bullet, which is **forbidden**: the assignee is read from the
// untracked `.superdev/info.json` (ADR 0073), so a bullet is a personal account identifier committed to a
// repository other people maintain. specialisingHeading('Assignee') pins the `## Assignee` section the
// store renders for `plan-contract.md`'s generic contract, which is the store-side presence contract
// every other member of the specialising family already had. Without the section half the section stays
// deletable with every check green: the citation contract skips a store rendering no section, and that is
// the same branch which correctly exempts one that carries none by design.
//
// The heading comes from specialisingHeading() rather than a second copy of the pattern, so a change to
// the family's heading anchoring reaches this check too — the store documents write `## Assignee`, and
// the `#{2,3}` span accepts a deeper level the same way every other member's does.
//
// Both halves test fence-masked text, defensively: no store document renders either half inside a fenced
// example today, and the seeds' habit of showing headings inside fenced examples elsewhere makes one
// plausible. scanReleaseContract takes the opposite latitude and reads raw text.
function scanAssigneeContract(root) {
  const gaps = [];
  const heading = specialisingHeading('Assignee');
  const candidates = storeDocuments(root, {
    dir: ASSIGNEE_DOCS_DIR,
    extra: EXTRA_ASSIGNEE_DOCS,
  });
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    const masked = maskFences(text);
    if (ASSIGNEE_PATTERN.test(masked)) gaps.push({ source: rel, expectation: ASSIGNEE_BULLET_EXPECTATION });
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
// elements. Absent files are skipped, so a fixture carries only the docs it exercises.
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
    if (!RELEASE_PATTERN.test(text)) {
      gaps.push({ source: rel });
      continue; // no section → the removal bullet has nowhere to live; one gap, not two
    }
    // ADR 0083: a declined release on an append removes the signal, so a store whose signal is removable
    // states the call that removes it.
    const section = extractSection(text, RELEASE_PATTERN);
    if (section === null || !RELEASE_REMOVE_PATTERN.test(section)) {
      gaps.push({ source: rel, expectation: RELEASE_REMOVE_EXPECTATION });
    }
  }
  const bothDirections = readDoc(root, RELEASE_BOTH_DIRECTIONS_DOC);
  if (bothDirections !== null && !RELEASE_BOTH_DIRECTIONS_PATTERN.test(bothDirections)) {
    gaps.push({ source: RELEASE_BOTH_DIRECTIONS_DOC, expectation: RELEASE_BOTH_DIRECTIONS_EXPECTATION });
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
// scanStoreSectionContract() is pure over a root dir: reads every slice-store document and reports the
// ones carrying no section matching the provided heading name. The heading is matched by
// specialisingHeading(heading), the same pattern citation and generic-side rows use, so changing the
// anchoring in one place can never diverge from the other places it is pinned. The test runs on the text
// fence-masked with maskFences(), defensively. Absent files are skipped, so a fixture carries only the
// docs it exercises.
function scanStoreSectionContract(root, heading) {
  const gaps = [];
  const candidates = storeDocuments(root, { dir: ANCHOR_DOCS_DIR, extra: EXTRA_ANCHOR_DOCS });
  const pattern = specialisingHeading(heading);
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    if (!pattern.test(maskFences(text))) gaps.push({ source: rel });
  }
  return gaps;
}

function scanRunStateContract(root) {
  return scanStoreSectionContract(root, 'Run state');
}

// scanDodTicksContract() extends the section-presence check above with one content check: a store's
// `## Definition of Done ticks` section cites `dod-line` (`scope.js`'s own verb, ADR 0091's target-state
// set — INV-0014) for the line edit itself, rather than restating that edit's mechanics by hand — every
// store's own fetch and write calls are the only mechanics left for it to state. A section still
// describing the edit without citing the helper, by name, is one place drift between the helper's real
// behaviour and a store's own restatement of it could reopen — flagged by name, distinct from the
// missing-section gap above. A section that does cite the helper is still checked for the one shape a
// citation cannot rule out on its own: a leftover sentence still reading "append the note"/"note
// appended" beside it, which contradicts the helper's own replace rule. A third check (triage #662)
// requires the section to state that a failed anchor write — the tick write itself — is reported once
// per run and never stops the run, the same clause `plan-contract.md`'s own section states and asks
// each store to restate for its own mechanism.
function scanDodTicksContract(root) {
  const gaps = scanStoreSectionContract(root, 'Definition of Done ticks');
  const missing = new Set(gaps.map((g) => g.source));
  const candidates = storeDocuments(root, { dir: ANCHOR_DOCS_DIR, extra: EXTRA_ANCHOR_DOCS });
  for (const rel of candidates) {
    if (missing.has(rel)) continue; // no section at all — already reported above
    const text = readDoc(root, rel);
    if (text === null) continue;
    const section = extractSection(text, specialisingHeading('Definition of Done ticks'));
    if (!section) continue;
    if (!/\bdod-line\b/i.test(section)) {
      gaps.push({
        source: rel,
        expectation: 'cite `dod-line` for the target-state line edit, rather than restating it by hand',
      });
    }
    if (/\bappend(?:s|ed|ing)?\b[\s\S]{0,40}\bnote\b|\bnote\b[\s\S]{0,40}\bappend/i.test(section)) {
      gaps.push({
        source: rel,
        expectation: "state that the write replaces the line's previous note, never appending one",
      });
    }
    if (!/reported\s+once\s+per\s+run/i.test(section) || !/never\s+stops\s+the\s+run/i.test(section)) {
      gaps.push({
        source: rel,
        expectation:
          'state that a failed anchor write is reported once per run and never stops the run',
      });
    }
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
// glossary paragraph that names a specialising member's backticked `## <member>` heading without citing
// `plan-contract.md` → *<member>* — the same citation scanSpecialisingCitations() already pins on the
// store side, applied to the glossary instead. Which entries owe it follows from what each one names, so
// `SPECIALISING_SECTIONS` is the only membership source: a second entry deferring to the same member
// (`Anchor dependency` beside `Scope anchor`) owes the citation too, and a paragraph naming only a
// non-member heading (`## Untriaged item`) owes nothing. Paragraphs split at blank lines on the
// fence-masked text, so a heading reference or a citation shown
// only inside a fenced example neither triggers the check nor satisfies it.
function scanGlossarySpecialisingCitations(root) {
  const gaps = [];
  const text = readDoc(root, 'CONTEXT.md');
  if (text === null) return gaps; // CONTEXT.md absent (fixture / partial checkout) → nothing to scan
  for (const paragraph of maskFences(text).split(/\n[ \t]*\n/)) {
    const term = paragraph.match(/^\s*\*\*([^*]+)\*\*/);
    const entry = term ? term[1] : paragraph.trim().split('\n')[0];
    for (const name of SPECIALISING_SECTIONS) {
      if (!glossaryHeadingReference(name).test(paragraph)) continue;
      if (!specialisingCitation(name).test(paragraph)) {
        gaps.push({
          source: 'CONTEXT.md',
          expectation: `cite \`plan-contract.md\` → *${name}* in its **${entry}** glossary entry`,
        });
      }
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

// scanObservationCaptureReminders() is pure over a root dir: reads skills/<name>/SKILL.md, agents/*.md,
// and references/*.md, and reports every document that dispatches a `superdev:` subagent without naming
// the observation-capture rule (ADR 0088, INV-0010). A controller standing at a dispatch reads a
// subagent's report, which is where an observation is met, so the reminder belongs at every one of them.
// The subject set is derived from the documents themselves — a `superdev:<name>` mention whose `<name>`
// is a file under `agents/` — rather than enumerated, so a document that gains a dispatch is pinned the
// moment it gains it (ADR 0064). The reminder is matched against the whitespace-normalized text, because
// these documents are hard-wrapped and the clause straddles a line break wherever it lands.
function scanObservationCaptureReminders(root) {
  const agents = new Set();
  for (const [source] of proseDocuments(root, ['agents'])) {
    agents.add(path.basename(source, '.md'));
  }
  const gaps = [];
  for (const [source, filePath] of proseDocuments(root, ['skills', 'agents', 'references'])) {
    const text = fs.readFileSync(filePath, 'utf8');
    const dispatched = [...text.matchAll(SUBAGENT_DISPATCH_PATTERN)]
      .map((match) => match[1])
      .find((name) => agents.has(name));
    if (!dispatched) continue; // dispatches nobody → no controller stands here reading a report
    if (OBSERVATION_CAPTURE_REMINDER_PATTERN.test(normalizeWhitespace(text))) continue;
    gaps.push({
      source,
      expectation:
        `name the observation-capture rule — it dispatches \`superdev:${dispatched}\`, so a controller ` +
        "reads a subagent's report here — by stating that an observation is captured the moment you " +
        "meet it and pointing at `references/scope-mode.md`'s `## Observations` section (ADR 0088, " +
        'INV-0010)',
    });
  }
  return gaps;
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

// scanShipGateContract() is pure over a root dir: reads skills/submit-pr/SKILL.md, isolates the "Entries
// standing." paragraph, and reports every gate element that paragraph does not itself carry. An absent
// submit-pr.md is skipped, matching every other contract scanner; a submit-pr.md with no such paragraph
// at all is one gap naming the missing paragraph, the same shape scanAnchorContract() uses for a missing
// section.
//
// Ordering dependency: extractSection() runs from SHIP_GATE_HEADING to the next markdown heading, and
// "Entries standing." carries no heading of its own — so this check's specificity holds only as long as
// that paragraph stays the LAST one in §3, immediately before "## 4. Whole-repo run". Move it above
// the stage-gate bullets and the extracted section would swallow them too; §3's other gate uses the
// identical "ask once" / `--unattended` → refuse phrasing for an unrelated question, so it would then
// satisfy SHIP_GATE_ELEMENTS on its own and this check would silently degrade to the whole-file match
// the comment above warns against.
function scanShipGateContract(root) {
  const gaps = [];
  let text;
  try {
    text = fs.readFileSync(docPath(root, 'skills', 'submit-pr', 'SKILL.md'), 'utf8');
  } catch {
    return gaps; // submit-pr.md absent → nothing to scan
  }
  const section = extractSection(text, SHIP_GATE_HEADING);
  if (section === null) {
    gaps.push({
      source: path.join('skills', 'submit-pr', 'SKILL.md'),
      expectation: "carry the entries-standing gate's own \"Entries standing.\" paragraph",
    });
    return gaps;
  }
  for (const [pattern, expectation] of SHIP_GATE_ELEMENTS) {
    if (!pattern.test(section)) gaps.push({ source: path.join('skills', 'submit-pr', 'SKILL.md'), expectation });
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
// is a heading rather than a path.
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
  if (value && typeof value === 'object' && !(value instanceof RegExp)) {
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

// The absence half of `RUN_LOCK_LIVENESS_CONTRACTS`'s scoping decision (INV-0013, ADR 0090):
// review/document/ship may carry no liveness-check language of their own, so a skill edit re-widening
// the check onto their ordinary hand-off — the exact regression a first cycle of this feature shipped —
// fails here even though nothing pins their prose's presence.
const scanRunLockLivenessSilence = (root) =>
  scanDocsAvoid(root, RUN_LOCK_LIVENESS_SILENCE_DOCS, RUN_LOCK_LIVENESS_SILENCE_MARKERS);

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

// ADR 0074: no shipped document proposes a `{paths}` form to a runner that maps no source file to the
// tests covering it. See UNMAPPED_PATHS_RUNNERS' note in `drift/contracts.js` for the class, what still
// fires it, and the denylist's own ceiling.
const scanUnmappedPathsForms = (root) =>
  scanDocsAvoid(root, UNMAPPED_PATHS_DOCS, [
    [
      UNMAPPED_PATHS_RUNNERS,
      (hit) =>
        `propose a \`{paths}\` form only to a runner that maps a source file to the tests covering it — ` +
        `it still proposes \`${normalizeWhitespace(hit[0])}\`, and that runner collects nothing from a ` +
        `source path, so the run reports red on a change set holding no tests`,
    ],
  ]);

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

// #683, INV-0092: no code-management document may ever invoke a force or bypass option on a merge
// call. See `NO_FORCE_MERGE_PATTERNS`'s own comment for the ceiling this shape-based absence check
// carries. A `never` sitting right before the match — "Never pass `--admin`", "this seed never sends
// `force_merge`" — is the seed's own caution naming the option to forbid it, not an instruction to send
// it, so it is excluded the same way `scanNoBaseBranchCommit`'s `negated()` excludes a "never commit …
// to the base branch" caution.
function scanNoForceMerge(root) {
  const gaps = [];
  for (const rel of NO_FORCE_MERGE_DOCS) {
    const text = readDoc(root, rel);
    if (text === null) continue; // document absent (fixture / partial checkout) → nothing to scan
    const masked = maskFences(text);
    for (const [pattern, expectation] of NO_FORCE_MERGE_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      for (const hit of masked.matchAll(re)) {
        const before = masked.slice(Math.max(0, hit.index - NEVER_NEGATION_WINDOW), hit.index);
        if (!/\bnever\b/i.test(before)) gaps.push({ source: rel, expectation: expectation(hit) });
      }
    }
  }
  return gaps;
}

// ADR 0111, #794: the Forgejo backend documents reach the host through `tea` only. See
// `TEA_ONLY_MARKERS`'s own comment for the ceiling this shape-based absence check carries.
const scanTeaOnly = (root) => scanDocsAvoid(root, TEA_ONLY_DOCS, TEA_ONLY_MARKERS);

// ADR 0101, INV-0098: only `/superdev:ship` ever runs a deploy target's command. `references/
// deployment.md` states the rule itself (pinned by the `deployment-posture` table), so it is exempt here
// the way a caution naming the forbidden thing always is; `skills/ship/SKILL.md` is the one surface
// entitled to claim the run. Every other skill and agent is scanned for the same shape a claim to run one
// would take — "run(s) … target's … command" — masked against fenced examples first, so an illustrative
// command block never trips it.
const DEPLOY_RUNNER_EXEMPT_FILES = new Set([
  path.join('skills', 'ship', 'SKILL.md'),
  path.join('references', 'deployment.md'),
]);
const DEPLOY_RUNNER_PATTERN = /\brun(?:s|ning)?\b[\s\S]{0,40}?\btarget'?s?\b[\s\S]{0,25}?\bcommand\b/gi;
// A mention attributed to ship within this many characters ahead of the match — "`/superdev:ship` runs
// each target's command" — describes ship's own job rather than claiming this document's own, so it is
// not the shape this check exists to catch.
const DEPLOY_RUNNER_ATTRIBUTION_WINDOW = 60;

function scanDeployRunnerExclusivity(root) {
  const gaps = [];
  for (const dir of ['skills', 'agents', 'references']) {
    const dirPath = docPath(root, dir);
    let files;
    try {
      files = walkFiles(dirPath).filter((f) => f.endsWith('.md'));
    } catch {
      continue; // no such dir (fixture / partial checkout) → nothing to scan
    }
    for (const rel of files) {
      const source = path.join(dir, rel).split(path.sep).join('/');
      if (DEPLOY_RUNNER_EXEMPT_FILES.has(path.join(dir, rel))) continue;
      const text = fs.readFileSync(path.join(dirPath, rel), 'utf8');
      const masked = maskFences(text);
      for (const hit of masked.matchAll(DEPLOY_RUNNER_PATTERN)) {
        const before = masked.slice(Math.max(0, hit.index - DEPLOY_RUNNER_ATTRIBUTION_WINDOW), hit.index);
        if (/\bship\b/i.test(before)) continue;
        // A denial — "runs no target's command", "never runs a target's command" — claims no run.
        if (/\b(?:never|not|no)\s+$/i.test(before) || /^run(?:s|ning)?\s+(?:no|not|never)\b/i.test(hit[0])) continue;
        gaps.push({
          source,
          expectation:
            "name no deploy target's command as something it runs — only `skills/ship/SKILL.md` does, " +
            'and only under posture `auto` (INV-0098)',
        });
      }
    }
  }
  return gaps;
}

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

// walkFiles(dir): every file under dir, as paths relative to dir, sorted. `entry.parentPath` is Node's
// own name for the directory an fs.Dirent came from (`entry.path` before it, removed in Node 24) — read either, so
// this runs on the oldest Node this repo supports and the newest alike. `isFile()` excludes a
// symlink deliberately — no shipped document tree this walks contains one.
function walkFiles(dir) {
  const resolved = path.resolve(dir);
  return fs
    .readdirSync(resolved, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(resolved, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join('/'))
    .sort();
}

// INV-0001 (docs/invariants.md): no shipped prose instructs a commit, a push, or a merge to the base
// branch, whether it names the target by the words "base branch" or by the base's own configured name
// (e.g. `main`, read from docs/agents/code-management.md's own `**Base branch:**` bullet — a consumer
// repo whose base is named something else still gets a check that is true for it). `/superdev:ship`'s
// own merge onto base runs only through the host's merge API (ADR 0096, INV-0092), the one site this
// scanner admits — SHIP_MERGE_ADMIT_FILE plus the SHIP_MERGE_ADMIT_PATTERN wording below, so the
// admission is narrow: a literal git merge or push to base written anywhere else, ship's own file
// included, still fails. The verb and the target have to sit close together, or a legitimate "never
// commit … onto the base branch" caution — `references/prototype.md` carries exactly that shape — would
// itself read as an instruction to do the thing it forbids. A `never` excuses the match only when it
// sits right next to the *verb* ("Never commit … to the base branch") or right next to the *target*
// ("commit … never onto the base branch"), each within NEVER_NEGATION_WINDOW chars — not merely
// somewhere between the verb and the target — a `never` negating an unrelated aside earlier in the same
// sentence ("commit … (never mind the formatting) … to the base branch") is a live instruction, not a
// caution.
// The window is a small sliding join of consecutive lines rather than the whole normalized document,
// both so a `never` near the target reliably sits inside the same window and so the reported line is
// close to where the instruction actually starts.
// ponytail: the window is 4 lines / 150 chars, a heuristic proximity bound, not a parser — an
// instruction split across 5 or more lines is missed. Widen BASE_BRANCH_COMMIT_WINDOW (and the 150-char
// bound below, in step) if that shape turns up for real.
const NEVER_NEGATION_WINDOW = 20;
const BASE_BRANCH_COMMIT_WINDOW = 4;
const BASE_BRANCH_VERB = '\\b(?:commit(?:s|ted|ting)?|push(?:es|ed|ing)?|merge(?:s|d|ing)?)\\b(?!-)';
// The one admitted site: `/superdev:ship`'s own squash-merge onto base, through the host's merge API —
// admitted by file AND by this wording sitting within reach forward of the match's own position, never
// by file alone, so a second, unrelated base-branch instruction ship's own file might one day carry
// still fails.
const SHIP_MERGE_ADMIT_FILE = path.join('skills', 'ship', 'SKILL.md');
const SHIP_MERGE_ADMIT_PATTERN = /host'?s merge API/i;
function verbTargetPattern(targetSource) {
  return new RegExp(`${BASE_BRANCH_VERB}([\\s\\S]{0,150}?)(?:${targetSource})`, 'i');
}
const BASE_BRANCH_PHRASE_PATTERN = verbTargetPattern('\\bbase branch\\b');

// The base's own configured name is a git target only in an unambiguous shape — backtick-quoted (like
// the `**Base branch:**` bullet's own value) or pushed to `origin` — never a bare word, since a base
// branch is commonly named "main" and that word is also ordinary English ("the main checkout", "the
// main working tree").
function baseNamePattern(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return verbTargetPattern(`\`${escaped}\`|\\borigin\\s+${escaped}\\b`);
}

// negated(): true when a `never` sits right next to the instruction — either right before the
// *target* (the text between verb and target ends in "never", the shape `never onto the base
// branch` carries) or right before the *verb* itself (the text before the verb ends in "never", the
// shape `Never commit … to the base branch` carries). Either shape is a caution; a `never` anywhere
// else in the window (an earlier aside, an unrelated clause) is not.
function negated(beforeVerbText, betweenText) {
  return (
    /\bnever\b\s*$/i.test(beforeVerbText.slice(-NEVER_NEGATION_WINDOW)) ||
    /\bnever\b/i.test(betweenText.slice(-NEVER_NEGATION_WINDOW))
  );
}

// scanNoBaseBranchCommit() is pure over a root dir: walks every file under `skills/` and `references/`
// (INV-0001's own `Paths:`) and reports the line of every commit-or-push-to-base-branch instruction it
// finds, not only the first — one gap per real instance, however many a file carries. Fenced examples
// are masked first, the same way every other scanner here avoids reading a `#` inside a code block as
// prose. The window joins real newlines (rather than collapsing them, the way `normalizeWhitespace`
// does for a plain contract row) so a match's own line is recoverable by counting the newlines ahead of
// it, which is what lets a wrapped sentence still report the line it starts on rather than only the
// window's.
function scanNoBaseBranchCommit(root) {
  const gaps = [];
  const codeManagement = readDoc(root, 'docs/agents/code-management.md');
  const baseNameMatch = codeManagement && codeManagement.match(/\*\*Base branch:?\*\*:?\s*`([^`]+)`/i);
  const patterns = [BASE_BRANCH_PHRASE_PATTERN];
  if (baseNameMatch) patterns.push(baseNamePattern(baseNameMatch[1]));
  for (const dir of ['skills', 'references']) {
    const dirPath = docPath(root, dir);
    let files;
    try {
      files = walkFiles(dirPath).filter((f) => f.endsWith('.md'));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const rel of files) {
      const source = path.join(dir, rel).split(path.sep).join('/');
      const isShipMergeAdmitFile = source === SHIP_MERGE_ADMIT_FILE;
      const text = fs.readFileSync(path.join(dirPath, rel), 'utf8');
      const masked = maskFences(text);
      const lines = masked.split('\n');
      // Each line's absolute character offset in `masked`, so a match found by a window starting
      // partway through the file can still test negation against everything that came before it in
      // the real document — never only the window slice that happened to find it. A `never` one
      // line above the verb sits outside the window once the window's own start has slid past that
      // line, which is exactly how the same physical instruction was previously re-matched, at a
      // later starting line, with no negating context left to see.
      const lineOffsets = [];
      let offset = 0;
      for (const l of lines) {
        lineOffsets.push(offset);
        offset += l.length + 1;
      }
      // Every sliding window re-finds the same physical match for as long as it stays in range, so
      // dedup on the match's absolute offset — never on "the first hit in this file" — is what lets
      // a real violation later in the file still get reported instead of being masked by an earlier
      // one, negated or not.
      const reportedAt = new Set();
      for (let i = 0; i < lines.length; i++) {
        const window = lines.slice(i, i + BASE_BRANCH_COMMIT_WINDOW).join('\n');
        for (const pattern of patterns) {
          const match = pattern.exec(window);
          if (!match) continue;
          const absIndex = lineOffsets[i] + match.index;
          if (reportedAt.has(absIndex)) continue;
          if (negated(masked.slice(0, absIndex), match[1])) continue;
          // Tested against the whole document from the match's own absolute offset forward, never
          // against `window` alone: the sliding window that happens to satisfy the verb/target regex
          // can be narrower than the one a later i would have built, and the admission wording can sit
          // just past its edge — the same reason `negated()` above tests the full document rather than
          // the window slice that found the match.
          if (isShipMergeAdmitFile && SHIP_MERGE_ADMIT_PATTERN.test(masked.slice(absIndex, absIndex + 200))) continue;
          reportedAt.add(absIndex);
          const lineOffset = window.slice(0, match.index).split('\n').length - 1;
          gaps.push({ source, line: i + 1 + lineOffset });
        }
      }
    }
  }
  return gaps;
}

// scanShipNoOpensPr() is pure over a root dir: walks skills/, agents/, references/ and README.md
// (the plugin's shipped surfaces, not docs/adr/'s history) and reports every sentence where the
// open-a-pull-request phrase attaches to `/superdev:ship` — `/superdev:submit-pr` opens it,
// `/superdev:ship` only merges what is already open (ADR 0096). "Attaches" means `/superdev:ship`
// is immediately followed, within SHIP_OPENS_PR_WINDOW chars and with no other `/superdev:<name>`
// mention in between, by the open-PR phrase — not merely that both sit somewhere in the same
// sentence. That is what lets "Once `/superdev:submit-pr` opens the pull request, `/superdev:ship`
// merges it" pass: the phrase there attaches to submit-pr, and `/superdev:ship` is never its subject,
// even though both names sit in one sentence. Fenced examples are masked first, and wrapped lines
// are joined before splitting into sentences (`maskedSentences()`), so README.md's own two-line
// command table (`ship` on one row, `submit-pr`'s "open the PR" on the row above) never crosses into
// one sentence — each row sits inside its own fence and is masked out anyway. Absent files, and an
// absent skills/agents/references/ directory, are skipped, matching every other contract scanner.
const SHIP_OPENS_PR_WINDOW = 80;
const SHIP_ATTACHED_OPEN_PATTERN = new RegExp(
  `\\/superdev:ship\\b([\\s\\S]{0,${SHIP_OPENS_PR_WINDOW}}?)open(?:s|ing)?\\s+(?:the|a)\\s+pull request\\b`,
  'i',
);
const SHIP_STEP_SURFACE_DIRS = ['skills', 'agents', 'references'];
function scanShipNoOpensPr(root) {
  const gaps = [];
  const files = [];
  for (const dir of SHIP_STEP_SURFACE_DIRS) {
    const dirPath = docPath(root, dir);
    let found;
    try {
      found = walkFiles(dirPath).filter((f) => f.endsWith('.md'));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const rel of found) files.push(path.join(dir, rel).split(path.sep).join('/'));
  }
  if (readDoc(root, 'README.md') !== null) files.push('README.md');
  for (const rel of files) {
    const text = readDoc(root, rel);
    if (text === null) continue; // document absent (fixture / partial checkout) → nothing to scan
    for (const sentence of maskedSentences(text)) {
      const match = SHIP_ATTACHED_OPEN_PATTERN.exec(sentence);
      // The captured middle text carrying another `/superdev:<name>` means the open-PR phrase
      // attaches to that other command, not to `/superdev:ship` — e.g. `/superdev:ship` deletes the
      // directory `/superdev:submit-pr` created before opening the pull request.
      if (!match || /\/superdev:(?!ship\b)[a-z-]+/i.test(match[1])) continue;
      gaps.push({
        source: rel,
        expectation:
          'never let the open-the-pull-request phrase attach to `/superdev:ship` — ' +
          `\`/superdev:submit-pr\` opens it, \`/superdev:ship\` only merges what is already open: "${normalizeWhitespace(sentence)}"`,
      });
    }
  }
  return gaps;
}

// scanShipHumanOnly() is pure over a root dir: reads the SKILL.md of every human-only skill
// (HUMAN_ONLY_SKILLS) and reports, for each, two gaps INV-0093 names — a missing `disable-model-invocation: true` in its frontmatter, and a literal `--unattended`
// token anywhere in the file, which ADR 0096 says ship never carries (submit-pr takes that
// token; ship's own consent is the operator typing the command at all; ADR 0106 extends both to
// every skill in the set). An absent skill file is skipped,
// matching every other contract scanner.
const HUMAN_ONLY_SKILLS = ['ship', 'verify-ship', 'wrap-up'];

function scanShipHumanOnly(root) {
  const gaps = [];
  for (const name of HUMAN_ONLY_SKILLS) {
    const source = path.join('skills', name, 'SKILL.md');
    const text = readDoc(root, source);
    if (text === null) continue; // skill absent → nothing to scan
    if (!/^disable-model-invocation:\s*true\s*$/m.test(text)) {
      gaps.push({
        source,
        expectation: 'carry `disable-model-invocation: true` in its frontmatter, so no model starts it on its own (INV-0093, ADR 0096, ADR 0106)',
      });
    }
    if (/--unattended/.test(text)) {
      gaps.push({
        source,
        expectation: 'name no `--unattended` mode of its own — only a human runs this command (INV-0093, ADR 0096, ADR 0106)',
      });
    }
  }
  return gaps;
}

// scanModelInvocationSplit() is pure over a root dir: every chain step stays a surface the model can
// start (INV-0066) — a step carrying `disable-model-invocation: true` is one the Skill tool cannot
// invoke, which strands an unattended run at that step. Ship's own half is `scanShipHumanOnly()`'s.
// Absent skill files are skipped, matching every other contract scanner.
const CHAIN_STEPS = ['implement', 'review', 'document', 'submit-pr'];
function scanModelInvocationSplit(root) {
  const gaps = [];
  for (const step of CHAIN_STEPS) {
    const source = path.join('skills', step, 'SKILL.md');
    const text = readDoc(root, source);
    const fm = text === null ? null : text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    if (fm !== null && /^disable-model-invocation:\s*true\s*$/m.test(fm[1])) {
      gaps.push({
        source,
        expectation: `carry no \`disable-model-invocation: true\` — an external driver invokes \`/superdev:${step}\` through the Skill tool, so a step off the model-invocable surface strands it there (INV-0066)`,
      });
    }
  }
  return gaps;
}

module.exports = {
  scan,
  scanRunRootPaths,
  scanScopetreeRunRootPaths,
  scanNoBaseBranchCommit,
  scanShipHumanOnly,
  scanModelInvocationSplit,
  scanAssigneeContract,
  scanAnchorContract,
  scanAppendContract,
  scanReleaseContract,
  scanRunStateContract,
  scanDodTicksContract,
  scanTriageRecordContract,
  scanUntriagedContract,
  scanSpecialisingCitations,
  scanGlossarySpecialisingCitations,
  scanWritingStandardContract,
  scanAdrStatus,
  scanContentTypesContract,
  scanCommandRefs,
  scanObservationCaptureReminders,
  scanChainHandoff,
  scanShipGateContract,
  scanShipNoOpensPr,
  scanOrphanLensPlacement,
  scanTestCostLensPlacement,
  scanUnresolvedGlossaryContract,
  scanKbNoBackendCall,
  scanAgentLensNoDesignSmell,
  scanPinnedPaths,
  scanDocStepsNoSuite,
  scanDenialCapNumberSilence,
  scanRunLockLivenessSilence,
  scanAgentToolAgnostic,
  scanUnmappedPathsForms,
  scanHookLedgerParsers,
  scanForcingBranchFlag,
  scanNoForceMerge,
  scanTeaOnly,
  scanDeployRunnerExclusivity,
  scanReturnToController,
  scanNarrativeCoverage,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
};
