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
  extractParagraph,
  scalar,
  frontmatter,
  normalizeWhitespace,
} = require('./lib');
const contracts = require('./contracts');
const {
  NARRATIVE_DOC,
  CHECK_COUNT_CLAIMS,
  NUMBER_ONES,
  NUMBER_TENS,
  FORCING_FLAG_DOCS,
  FORCING_FLAG_PATTERNS,
  REFERENCE_PATTERN,
  RUN_ROOT_DOCS,
  RUN_ROOT_ARTIFACT_PATTERN,
  ASSIGNEE_DOCS_DIR,
  ASSIGNEE_EXEMPT,
  EXTRA_ASSIGNEE_DOCS,
  ASSIGNEE_PATTERN,
  ANCHOR_DOCS_DIR,
  EXTRA_ANCHOR_DOCS,
  ANCHOR_PATTERN,
  ANCHOR_ELEMENTS,
  APPEND_PATTERN,
  APPEND_ELEMENTS,
  RELEASE_PATTERN,
  RELEASE_CONSUMERS,
  RELEASE_CONSUMER_PATTERN,
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
  SHIP_GATE_ELEMENTS,
  UNRESOLVED_GLOSSARY_CONTRACTS,
  KB_NO_CALL_DOCS,
  DOC_STEP_SILENCE_DOCS,
  SUITE_RUN_INSTRUCTIONS,
  AGENT_TOOLCHAIN_PATTERNS,
  DENIAL_CAP_NUMBER_SILENCE_DOCS,
  DENIAL_CAP_NUMBER_MARKERS,
  KB_BACKEND_CALL_MARKERS,
  HOOK_HEADER_REGEX,
  RETURN_TO_CONTROLLER_DOCS,
  RETURN_TO_CONTROLLER_PATTERNS,
} = contracts;

// scan() is pure over a root dir so it's unit-testable: reads commands/*.md, agents/*.md and
// references/*.md, extracts every referenced references/<name>.md, and reports the ones that don't
// exist. references/ is in the set because a reference cites another reference — the execution
// playbooks point at scope-mode.md — and a rename there dangles like any other.
function scan(root) {
  const missing = [];
  for (const dir of ['commands', 'agents', 'references']) {
    const dirPath = docPath(root, dir);
    let entries;
    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const filePath = path.join(dirPath, entry);
      const text = fs.readFileSync(filePath, 'utf8');
      for (const match of text.matchAll(REFERENCE_PATTERN)) {
        const refName = match[1];
        const refPath = docPath(root, 'references', refName);
        if (!fs.existsSync(refPath)) {
          missing.push({ source: path.join(dir, entry), reference: `references/${refName}` });
        }
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
function scanAssigneeContract(root) {
  const gaps = [];
  const candidates = storeDocuments(root, {
    dir: ASSIGNEE_DOCS_DIR,
    extra: EXTRA_ASSIGNEE_DOCS,
    exempt: ASSIGNEE_EXEMPT,
  });
  for (const rel of candidates) {
    const text = readDoc(root, rel);
    if (text === null) continue; // doc absent (fixture / partial checkout) → nothing to scan
    if (!ASSIGNEE_PATTERN.test(text)) gaps.push({ source: rel });
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
// two universal elements, or — for the local-file store alone — missing the numbering-continuation
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

// scanAfkSelectionNeutrality() is pure over a root dir: reads `commands/afk.md`, isolates the selection
// section, and reports every store mechanism it names. An absent file or a missing section yields nothing
// — `commands/afk.md`'s existence is asserted by the `pinned-paths` check, which collects every path the
// contract tables pin (three of them pin this file).
function scanAfkSelectionNeutrality(root) {
  const gaps = [];
  let text;
  try {
    text = fs.readFileSync(docPath(root, 'commands', 'afk.md'), 'utf8');
  } catch {
    return gaps; // afk.md absent → nothing to scan
  }
  const section = extractSection(text, AFK_SELECTION_HEADING);
  if (section === null) {
    // A missing, renamed, or renumbered selection heading is itself a gap — the same reasoning as
    // main()'s commands/afk.md-existence check: silently returning nothing here would let the section
    // (and whatever store mechanism it names) drift out from under this check with nothing going red.
    gaps.push({
      source: path.join('commands', 'afk.md'),
      expectation:
        'carry a `## 2. …` selection heading — a missing or renumbered one leaves the neutrality check nothing to scan',
    });
    return gaps;
  }
  for (const [pattern, label] of STORE_MECHANISMS) {
    if (pattern.test(section)) {
      gaps.push({
        source: path.join('commands', 'afk.md'),
        expectation: `select without naming ${label} — read the store's \`## Scope anchor\` contract instead`,
      });
    }
  }
  // Naming no mechanism is half the property. A selection step that names none *and* points at no
  // contract either has nothing to select by, so the neutrality would be satisfied by prose that simply
  // says less.
  if (!/## Scope anchor/.test(section)) {
    gaps.push({
      source: path.join('commands', 'afk.md'),
      expectation: "point its selection at the store's `## Scope anchor` contract",
    });
  }
  return gaps;
}

// scanAfkAnchorCount() is pure over a root dir: reads `commands/afk.md`, isolates the one paragraph
// AFK_ANCHOR_COUNT_HEADING names with extractParagraph() — narrower than a section, so a legitimate
// restatement later in the same `## 2.` section (the eligibility bullet also reads the anchor dependency)
// cannot satisfy this contract on the stale paragraph's behalf — and reports the elements missing from
// that isolation alone. An absent file yields nothing; `commands/afk.md`'s existence is asserted by the
// pinned-paths check.
function scanAfkAnchorCount(root) {
  const gaps = [];
  const rel = path.join('commands', 'afk.md');
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
// the harness could not act on, plus cases whose scaffold_script does not resolve. An absent evals/ dir,
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

// scanCommandRefs() is pure over a root dir: reads commands/*.md and agents/*.md and reports every
// command reference with no matching file under commands/. A document naming the same missing command is
// reported once per document, so the report alone names every dead end.
function scanCommandRefs(root) {
  const unresolved = [];
  for (const dir of ['commands', 'agents']) {
    let entries;
    try {
      entries = fs.readdirSync(docPath(root, dir));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const text = fs.readFileSync(docPath(root, dir, entry), 'utf8');
      const seen = new Set();
      for (const match of text.matchAll(COMMAND_REFERENCE_PATTERN)) {
        const name = match[1];
        if (seen.has(name)) continue; // one report per document per command
        seen.add(name);
        if (!fs.existsSync(docPath(root, 'commands', `${name}.md`))) {
          unresolved.push({ source: path.join(dir, entry), command: `/superdev:${name}` });
        }
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

// scanAfkInvocations() is pure over a root dir: reads commands/afk.md and reports every stage-table row
// that names one of the four chain commands without carrying `--unattended` on that same row. Absent
// afk.md is skipped, matching every other contract scanner.
function scanAfkInvocations(root) {
  const gaps = [];
  let text;
  try {
    text = fs.readFileSync(docPath(root, 'commands', 'afk.md'), 'utf8');
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
        source: path.join('commands', 'afk.md'),
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
        source: path.join('commands', 'afk.md'),
        expectation: `carry a stage-table row invoking \`/superdev:${name}\``,
      });
    }
  }
  return gaps;
}

// scanShipGateContract() is pure over a root dir: reads commands/ship.md, isolates the "Entries standing."
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
    text = fs.readFileSync(docPath(root, 'commands', 'ship.md'), 'utf8');
  } catch {
    return gaps; // ship.md absent → nothing to scan
  }
  const section = extractSection(text, SHIP_GATE_HEADING);
  if (section === null) {
    gaps.push({
      source: path.join('commands', 'ship.md'),
      expectation: "carry the entries-standing gate's own \"Entries standing.\" paragraph",
    });
    return gaps;
  }
  for (const [pattern, expectation] of SHIP_GATE_ELEMENTS) {
    if (!pattern.test(section)) gaps.push({ source: path.join('commands', 'ship.md'), expectation });
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

// Every document a contract table pins still exists. `scanContract()` skips a document it cannot read —
// the convention that lets a fixture carry only the files one assertion exercises, and lets a partial
// checkout fail nothing — so a table reports zero gaps the moment its document is renamed or deleted, and
// every check stays green while the contract it asserted is gone. Verified before this check existed:
// `FIX_BOUNDARY_CONTRACTS` against a tree with no `commands/review.md` returned no gaps at all.
//
// The paths come from the tables themselves rather than a list kept beside them, so a table added later is
// covered without anyone remembering to. `collectPinnedPaths()` recurses every exported value — arrays,
// plain objects (a row's `test()`-shaped second element), and strings — because a document is pinned in
// more shapes than `[relPath, RegExp, expectation]`: `READ_PATH_CONTRACTS`'s second row carries a `test()`
// function instead of a `RegExp`, `CHECK_COUNT_CLAIMS`'s rows carry a String template, and `RUN_ROOT_DOCS`
// / `CONTENT_TYPES_DOCS` are bare path lists with no row shape at all. Gating on shape (`row[1] instanceof
// RegExp`) missed exactly those; gating on a path-shaped string instead — one ending in `.md`, `.json`, or
// `.js` — catches all of them, and a path-shape predicate still won't misreport a row whose first element
// is a heading rather than a path. A `Set` is deliberately excluded from the recursion: every `Set` in
// this file holds a membership value (`ASSIGNEE_EXEMPT`'s bare filename, `AFK_NAMES`'s bare verb), not a
// document this scanner should assert exists — `ASSIGNEE_EXEMPT`'s bare `issue-tracker-local.md` has no
// root-level file to resolve to, so recursing into it would report the real
// `references/issue-tracker-local.md` as missing.
//
// This holds the slot the `afk-existence` check held, which asserted `commands/afk.md` alone on the
// stated grounds that nothing else in the plugin names `/superdev:afk` — already false when written:
// `commands/implement.md` names it too, and `command-resolution` already resolves every `/superdev:`
// reference under `commands/`, so it already caught that file's deletion. Three contract tables also
// pin `commands/afk.md` directly, so the general rule here covers it a second way.
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

// numberWord(): a small integer spelled the way the narrative spells it — 43 → "forty-three". The
// narrative states its count in prose, so a check comparing digits would never match the text it guards.
// Above ninety-nine it gives up and returns null, which the caller reads as "no count to compare": a
// registry that large has outgrown a hand-written narrative anyway, and a wrong guess would be worse
// than an honest gap.
function numberWord(n) {
  if (n < 0 || n > 99) return null;
  if (n < 20) return NUMBER_ONES[n];
  const tens = NUMBER_TENS[Math.floor(n / 10)];
  const ones = n % 10;
  return ones === 0 ? tens : `${tens}-${NUMBER_ONES[ones]}`;
}

// scanNarrativeCoverage(): every registered check is written up in `scripts/AGENTS.md` by its backticked
// `id`, and both documents that state how many checks there are agree with the registry.
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

  const word = numberWord(ids.length);
  if (word === null) return gaps;
  for (const [rel, template] of CHECK_COUNT_CLAIMS) {
    const text = readDoc(root, rel);
    if (text === null) continue;
    const claim = template.replace('{n}', word);
    if (!text.includes(claim)) {
      gaps.push({
        source: rel,
        expectation:
          `state the check count as \`${claim}\` — the registry holds ${ids.length}, and this document ` +
          'counts them in prose, so the two drift on every addition — pinned in `drift/contracts.js`\'s ' +
          '`CHECK_COUNT_CLAIMS`',
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

// scanReadmeCommands() is pure over a root dir: `README.md` and `commands/` agree — every
// `commands/<name>.md` is mentioned in the README as `/superdev:<name>`, and every `/superdev:<name>`
// the README names has a command file. The README is the user-facing map of the commands, so a command
// it never names or a command it still names after a rename is a router that lies. Either half is
// skipped when its side is absent (fixture / partial checkout), matching every other scanner.
function scanReadmeCommands(root) {
  const gaps = [];
  const readme = readDoc(root, 'README.md');
  if (readme === null) return gaps;
  let entries;
  try {
    entries = fs.readdirSync(docPath(root, 'commands'));
  } catch {
    return gaps; // no commands dir → nothing to cross-check
  }
  const commands = new Set(entries.filter((e) => e.endsWith('.md')).map((e) => e.slice(0, -3)));
  for (const name of [...commands].sort()) {
    if (!readme.includes(`/superdev:${name}`)) {
      gaps.push({
        source: 'README.md',
        expectation:
          `mention \`/superdev:${name}\` — \`commands/${name}.md\` ships, and a README that never ` +
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
          `name only commands that exist — \`/superdev:${name}\` has no \`commands/${name}.md\`, ` +
          'so the README routes users to a command the plugin does not carry',
      });
    }
  }
  return gaps;
}

// auditSetMatches(): how many files an audit-set pattern resolves to under `root`. The section's own rule
// makes every entry a repo-relative path, optionally with one `*` in its final segment — the one shape
// `/superdev:document audit` expands — so this walks that segment's directory rather than depending on a
// glob implementation whose availability varies by Node version.
function auditSetMatches(root, pattern) {
  const slash = pattern.lastIndexOf('/');
  const dir = slash === -1 ? '' : pattern.slice(0, slash);
  const base = pattern.slice(slash + 1);
  if (!base.includes('*')) return fs.existsSync(path.join(root, pattern)) ? 1 : 0;
  const re = new RegExp(`^${base.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  try {
    return fs.readdirSync(path.join(root, dir)).filter((e) => re.test(e)).length;
  } catch {
    return 0; // the directory itself is gone, which is the same lie as an empty match
  }
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

module.exports = {
  scan,
  scanRunRootPaths,
  scanAssigneeContract,
  scanAnchorContract,
  scanAppendContract,
  scanReleaseContract,
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
  scanUnresolvedGlossaryContract,
  scanKbNoBackendCall,
  scanPinnedPaths,
  scanDocStepsNoSuite,
  scanDenialCapNumberSilence,
  scanAgentToolAgnostic,
  scanHookLedgerParsers,
  scanForcingBranchFlag,
  scanReturnToController,
  scanNarrativeCoverage,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
};
