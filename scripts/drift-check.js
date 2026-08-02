#!/usr/bin/env node
'use strict';

// drift-check: deterministic assertion that every `references/<name>.md` reference in
// commands/*.md and agents/*.md — whether written as the `${CLAUDE_PLUGIN_ROOT}/references/<name>.md`
// macro or as bare prose (`references/<name>.md`) — points at a file that actually exists under
// references/. Prose (commands/, agents/) drifts from references/ silently — a renamed or
// deleted reference file leaves a dangling pointer no build step would catch. This is that check.

const fs = require('node:fs');
const path = require('node:path');

const REFERENCE_PATTERN = /(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/([a-zA-Z0-9_-]+\.md)/g;

// scan() is pure over a root dir so it's unit-testable: reads commands/*.md and agents/*.md,
// extracts every referenced references/<name>.md, and reports the ones that don't exist.
function scan(root) {
  const missing = [];
  for (const dir of ['commands', 'agents']) {
    const dirPath = path.join(root, dir);
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
        const refPath = path.join(root, 'references', refName);
        if (!fs.existsSync(refPath)) {
          missing.push({ source: path.join(dir, entry), reference: `references/${refName}` });
        }
      }
    }
  }
  return missing;
}

// The execution/controller docs whose instructions are followed with a worktree as cwd (or handed to
// a subagent whose cwd is a worktree). Run-root artifacts referenced here must use the absolute
// <run-root>/… path the controller captures at Phase 0 — a checkout-relative .superdev/scopes/<scope>/…
// path resolves one level too deep from a worktree cwd. Descriptive docs (status.md, plan-contract.md,
// issue-tracker-local.md, brainstorm.md) run only from the invoking checkout and are deliberately absent.
const RUN_ROOT_DOCS = [
  'commands/implement.md',
  'commands/review.md',
  'commands/document.md',
  'commands/ship.md',
  'references/implement-lite.md',
  'references/implement-full.md',
  'references/scope-mode.md',
  'agents/implementer.md',
  'agents/slice-reviewer.md',
  'agents/simplicity-reviewer.md',
];

// A checkout-relative run-root ARTIFACT path: .superdev/scopes/<seg>/<artifact>. Worktree *directory*
// paths (…/worktree, …/worktrees/<id>) are git-created from the invoking checkout — not the bug class —
// so `worktree`/`worktrees` are deliberately outside the artifact alternation and never match.
const RUN_ROOT_ARTIFACT_PATTERN =
  /\.superdev\/scopes\/[^\s/]+\/(?:ledger\.md|dod\.md|run\.lock|interfaces\.md|reports)/g;

// scanRunRootPaths() is pure over a root dir: reads each execution doc and reports every
// checkout-relative run-root artifact path it still carries (should be zero once converted to
// <run-root>/…). Absent files are skipped, so fixtures need only the docs they exercise.
function scanRunRootPaths(root) {
  const offenders = [];
  for (const rel of RUN_ROOT_DOCS) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // doc absent (fixture / partial checkout) → nothing to scan
    }
    for (const match of text.matchAll(RUN_ROOT_ARTIFACT_PATTERN)) {
      offenders.push({ source: rel, match: match[0] });
    }
  }
  return offenders;
}

// An issue-backend document must carry the assignee contract (plan-contract.md → Assignee). A seed that
// omits it makes /superdev:setup write a config doc with no assignee, and the feature silently does
// nothing for that backend — the exact failure the contract exists to prevent, and one no build step
// would catch. The local-file store is exempt: it has no assignee concept and deliberately never gains
// one. Every other references/issue-tracker-*.md is an issue backend by definition — a slice store that
// isn't the local-file store creates issues — so the filename alone is the trigger; no content gate on
// how the doc phrases "create an issue" (CLI, REST, or plain prose all count, and a content gate misses
// forms it wasn't written to expect, e.g. `gh issue create`).
const ASSIGNEE_DOCS_DIR = 'references';
const ASSIGNEE_EXEMPT = new Set(['issue-tracker-local.md']);
const EXTRA_ASSIGNEE_DOCS = ['docs/agents/issue-tracker.md']; // this repo's own dogfooded store config
// The config bullet itself — a list item, in either of the two spellings the real documents use
// (`- **Assignee:** …` and `- **Assignee**: …`). Matching a bare bolded `**Assignee**` would be
// satisfied by any running prose that merely refers to the setting, which says nothing about whether
// this backend is actually configured with one.
const ASSIGNEE_PATTERN = /^\s*[-*]\s+\*\*Assignee(?:\*\*:|:\*\*)/m;

// scanAssigneeContract() is pure over a root dir: reads every issue-backend document and reports the
// ones that never carry the assignee contract. Absent files are skipped, so fixtures need only the docs
// they exercise.
function scanAssigneeContract(root) {
  const gaps = [];
  const candidates = [...EXTRA_ASSIGNEE_DOCS];
  try {
    for (const entry of fs.readdirSync(path.join(root, ASSIGNEE_DOCS_DIR))) {
      if (!entry.startsWith('issue-tracker-') || !entry.endsWith('.md')) continue;
      if (ASSIGNEE_EXEMPT.has(entry)) continue;
      candidates.push(path.join(ASSIGNEE_DOCS_DIR, entry));
    }
  } catch {
    // no references/ dir → nothing to scan
  }
  for (const rel of candidates) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // doc absent (fixture / partial checkout) → nothing to scan
    }
    if (!ASSIGNEE_PATTERN.test(text)) gaps.push({ source: rel });
  }
  return gaps;
}

// Every slice-store document must state how to identify a feature's scope anchor (ADR 0017). `/superdev:afk`
// selects work by anchor and reads that contract rather than encoding any one store's shape, so a document
// without it leaves the sweep with no way to recognise a candidate in that backend. Unlike the assignee
// contract, `issue-tracker-local.md` is **not** exempt: every store has an anchor, and the local one's is
// its `00-epic-*.md` filename. The contract is a section `/superdev:setup` carries across, so a passing
// prose mention of "the anchor" does not satisfy it.
const ANCHOR_DOCS_DIR = 'references';
const EXTRA_ANCHOR_DOCS = ['docs/agents/issue-tracker.md']; // this repo's own dogfooded store config
const ANCHOR_PATTERN = /^#{2,3}\s+Scope anchor\s*$/m;

// The heading alone isn't the contract — a section that carries it but names none of its elements passes
// today, which is how finding #4 shipped unnoticed. Each pattern matches the shared *concept* a store
// document's bullet names, not a full sentence, so a backend-specific mechanism (a JQL clause, a
// `/parent` call) stays free to vary without tripping this check.
const ANCHOR_ELEMENTS = [
  [/recognis/i, 'how to recognise an anchor'],
  [/candidate/i, 'how to list the candidates'],
  [/beneath/i, 'how to list the slices beneath an anchor'],
  [/itself a slice/i, 'how to tell an anchor that is itself a slice'],
];

// extractSection(): the text from a heading match (inclusive) up to (but excluding) the next heading of
// level ≤3, or to EOF if there is none. Shared by scanAnchorContract's element check and
// scanAfkSelectionNeutrality below, both of which isolate one section before scanning its body.
function extractSection(text, headingPattern) {
  const start = text.search(headingPattern);
  if (start === -1) return null;
  const rest = text.slice(start);
  // Skip past the heading's own line (not just one character) before searching for the next one — a
  // one-character skip leaves a level-2 `##` heading truncated to `#`, which still matches `#{1,3}` and
  // self-matches as its own "next" heading, collapsing the section to nothing.
  const firstLineEnd = rest.indexOf('\n');
  const searchFrom = firstLineEnd === -1 ? rest.length : firstLineEnd + 1;
  const nextHeading = rest.slice(searchFrom).search(/^#{1,3}\s/m);
  return nextHeading === -1 ? rest : rest.slice(0, searchFrom + nextHeading);
}

// scanAnchorContract() is pure over a root dir: reads every slice-store document and reports the ones that
// never state how to identify a scope anchor, or state the heading but not every element. Absent files are
// skipped, so fixtures need only the docs they exercise.
function scanAnchorContract(root) {
  const gaps = [];
  const candidates = [...EXTRA_ANCHOR_DOCS];
  try {
    for (const entry of fs.readdirSync(path.join(root, ANCHOR_DOCS_DIR))) {
      if (!entry.startsWith('issue-tracker-') || !entry.endsWith('.md')) continue;
      candidates.push(path.join(ANCHOR_DOCS_DIR, entry));
    }
  } catch {
    // no references/ dir → nothing to scan
  }
  for (const rel of candidates) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // doc absent (fixture / partial checkout) → nothing to scan
    }
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

// `/superdev:afk`'s selection step reads the store's `## Scope anchor` contract and must name no backend's
// own mechanism (ADR 0017), or it is right on one store and wrong on the rest — the failure the
// **Backends are pluggable** working rule exists to prevent, and one that shows up as a sweep finding
// nothing rather than as an error. The scan is scoped to the selection section, because the rest of the
// command may legitimately discuss an epic as a domain concept; what it may not do is *test* for one.
const AFK_SELECTION_HEADING = /^## 2\..*$/m;
const STORE_MECHANISMS = [
  [/`epic`/, 'the `epic` label'],
  [/feat\//, 'the `feat/` label prefix'],
  [/00-epic/, "the local store's `00-epic-` filename"],
  [/sub-issue|sub_issue/, "GitHub's sub-issue relation"],
  [/Epic Link|fields\.parent/, "Jira's parent field"],
];

// scanAfkSelectionNeutrality() is pure over a root dir: reads `commands/afk.md`, isolates the selection
// section, and reports every store mechanism it names. An absent file or a missing section yields nothing
// — `commands/afk.md`'s existence is asserted separately in main().
function scanAfkSelectionNeutrality(root) {
  const gaps = [];
  let text;
  try {
    text = fs.readFileSync(path.join(root, 'commands', 'afk.md'), 'utf8');
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

// The documentation seed must offer a writing standard (ADR 0012). A seed that loses the section makes
// /superdev:setup write a doc convention with no standard, and both doc agents then find nothing to
// apply — the feature silently does nothing in every repo set up after the drift, and no build step
// would catch it. Same failure shape as the assignee contract above. The section is a heading `/setup`
// fills in, so a bare prose mention of "the writing standard" does not satisfy it.
const WRITING_STANDARD_DOCS = ['references/documentation.md'];
const WRITING_STANDARD_PATTERN = /^#{2,3}\s+Writing standard\s*$/m;

// scanWritingStandardContract() is pure over a root dir: reads every documentation-convention document
// and reports the ones that never offer a writing standard. Absent files are skipped, so fixtures need
// only the docs they exercise.
function scanWritingStandardContract(root) {
  const gaps = [];
  for (const rel of WRITING_STANDARD_DOCS) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // doc absent (fixture / partial checkout) → nothing to scan
    }
    if (!WRITING_STANDARD_PATTERN.test(text)) gaps.push({ source: rel });
  }
  return gaps;
}

// An eval grader is prose with frontmatter the harness parses, and nothing else validates it: `claude
// plugin validate` reads only the marketplace manifest, so a grader with `weight: notanumber` passes the
// suite and surfaces part-way through a run that costs real API spend. Same for a case whose
// `scaffold_script` points at a file that isn't there. This is a shape check rather than a drift
// assertion — it compares a document against a schema, not against a source it restates — but it belongs
// with the others: this file is where the repo keeps its deterministic prose assertions.
// The six types the harness accepts. Only `llm` and `regex` carry a focus/target; the other four
// declare neither, and their schema variants are strict, so requiring one would produce a grader the
// harness rejects.
const GRADER_TYPES = new Set(['llm', 'regex', 'tool_order', 'tool_used', 'file_exists', 'baseline']);
const FOCUS_TYPES = new Set(['llm', 'regex']);

// A scalar as a maintainer may legally write it: quoted or bare, with or without a trailing comment.
function scalar(raw) {
  const withoutComment = raw.replace(/\s+#.*$/, '').trim();
  const unquoted = withoutComment.match(/^(['"])(.*)\1$/);
  return unquoted ? unquoted[2] : withoutComment;
}

// Frontmatter is the leading `---` fenced block; read it as lines rather than parsing YAML, since the
// hooks and scripts carry no dependencies. CRLF is normalised first, so a file authored on Windows is
// read rather than reported as having no frontmatter at all.
function frontmatter(text) {
  const match = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = scalar(kv[2]);
  }
  return fields;
}

// The fence frontmatter() matches, reused rather than a third copy of the same shape: stripFrontmatter()
// below strips it off, so a contract that must be met by the prose body cannot be satisfied by an
// `argument-hint` echo instead (e.g. `[--unattended]`, which names the argument but is not a standing
// answer in the body).
const FRONTMATTER_FENCE = /^---\n[\s\S]*?\n---/;

// stripFrontmatter() returns text with its leading `---`-fenced frontmatter block removed (CRLF
// normalised first, matching frontmatter()). Text with no frontmatter is returned unchanged.
function stripFrontmatter(text) {
  return text.replace(/\r\n/g, '\n').replace(FRONTMATTER_FENCE, '');
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

// Both doc agents must wire the content-type lens (ADR 0014). scan() above catches a reference to a file
// that does not exist. The reverse drift is invisible to it: an agent that stops referencing a file which
// still exists leaves the reference resolvable, the suite green, and the lens dead in every dispatch.
// Same silent-drop failure shape as the assignee and writing-standard contracts.
const CONTENT_TYPES_AGENTS = [
  path.join('agents', 'doc-writer.md'),
  path.join('agents', 'doc-reader.md'),
];
// Anchored on the `Read` instruction, not on a bare occurrence of the path. An agent that keeps the path
// in a passing aside but drops the instruction to read it has already lost the lens, so a substring match
// on the path alone would pass the exact drift this check exists to catch. Either path form satisfies it:
// the `${CLAUDE_PLUGIN_ROOT}` macro or a bare prose path, since an agent resolves both at dispatch.
const CONTENT_TYPES_PATTERN =
  /Read\s+`?(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/content-types\.md/;

// scanContentTypesContract() is pure over a root dir: reads every agent that must apply the content-type
// lens and reports the ones that no longer instruct themselves to read it. Absent files are skipped, so
// fixtures need only the agents they exercise.
function scanContentTypesContract(root) {
  const gaps = [];
  for (const rel of CONTENT_TYPES_AGENTS) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // agent absent (fixture / partial checkout) → nothing to scan
    }
    if (!CONTENT_TYPES_PATTERN.test(text)) gaps.push({ source: rel });
  }
  return gaps;
}

// The chain documents hand a run along through the ledger's `**Stage:**` line (ADR 0013): `/implement`
// writes it, and every later command reads it before it acts. A document that stops naming the line
// breaks the handoff silently — the stage is never written, or never read, and the suite stays green.
// Same silent-drop failure shape as the assignee, writing-standard, and content-type contracts. The
// pattern is the line's exact spelling, so prose that merely refers to "the stage" does not satisfy it.
const STAGE_DOCS = [
  path.join('commands', 'implement.md'),
  path.join('commands', 'review.md'),
  path.join('commands', 'document.md'),
  path.join('commands', 'ship.md'),
  path.join('commands', 'status.md'),
];
const STAGE_PATTERN = /\*\*Stage:\*\*/;

// scanStageContract() is pure over a root dir: reads every chain document and reports the ones that no
// longer name the ledger's stage line. Absent files are skipped, so fixtures need only the documents
// they exercise.
function scanStageContract(root) {
  const gaps = [];
  for (const rel of STAGE_DOCS) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // document absent (fixture / partial checkout) → nothing to scan
    }
    if (!STAGE_PATTERN.test(text)) gaps.push({ source: rel });
  }
  return gaps;
}

// A `/superdev:<name>` reference must resolve to `commands/<name>.md`. The chain hands the reader from
// one command to the next by printing its name (ADR 0013), so a reference to a command that does not
// exist is a dead end. This is scan() one level over: that one resolves `references/` paths, this one
// resolves command names, and both catch a pointer no build step would follow.
const COMMAND_REFERENCE_PATTERN = /\/superdev:([a-z][a-z-]*)/g;

// scanCommandRefs() is pure over a root dir: reads commands/*.md and agents/*.md and reports every
// command reference with no matching file under commands/. A document naming the same missing command is
// reported once per document, so the report alone names every dead end.
function scanCommandRefs(root) {
  const unresolved = [];
  for (const dir of ['commands', 'agents']) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, dir));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const text = fs.readFileSync(path.join(root, dir, entry), 'utf8');
      const seen = new Set();
      for (const match of text.matchAll(COMMAND_REFERENCE_PATTERN)) {
        const name = match[1];
        if (seen.has(name)) continue; // one report per document per command
        seen.add(name);
        if (!fs.existsSync(path.join(root, 'commands', `${name}.md`))) {
          unresolved.push({ source: path.join(dir, entry), command: `/superdev:${name}` });
        }
      }
    }
  }
  return unresolved;
}

// Each command in the chain must name its successor, because printing the next command with its range
// resolved is the whole handoff (ADR 0013). scanCommandRefs above catches a handoff that points at a
// command with no file. The reverse drift is invisible to it: a command that names no successor at all
// leaves every reference resolvable and the suite green, and the chain dead-ends there silently.
// `commands/ship.md` ends the chain and has no successor, so it is deliberately absent.
const CHAIN_HANDOFFS = [
  [path.join('commands', 'implement.md'), '/superdev:review'],
  [path.join('commands', 'review.md'), '/superdev:document'],
  [path.join('commands', 'document.md'), '/superdev:ship'],
];

// scanChainHandoff() is pure over a root dir: reads each command in the chain and reports the ones that
// no longer name their successor. Absent files are skipped, so fixtures need only the links they
// exercise.
function scanChainHandoff(root) {
  const gaps = [];
  for (const [rel, next] of CHAIN_HANDOFFS) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // document absent (fixture / partial checkout) → nothing to scan
    }
    if (!text.includes(next)) gaps.push({ source: rel, next });
  }
  return gaps;
}

// The scope slug becomes a branch name and a run-root path segment, and `hooks/run-lock.js` extracts it
// back out of a `git worktree add` command to enforce same-scope mutual exclusion. The rule the prose
// states and the charset the hook matches with are one fact in two syntaxes, and they must stay equal. A
// prose rule wider than the hook's regex admits a slug the hook then cannot recognise as a scope at all,
// which disarms same-scope mutual exclusion for that scope and reports nothing. A prose rule narrower
// than it silently skips a label a maintainer legitimately used. Both sides are pinned literally, so
// widening or narrowing either one alone goes red and a maintainer confirms the pair still agrees.
const SCOPE_SLUG_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /`\[a-zA-Z0-9\]\[a-zA-Z0-9_-\]\*`/,
    'state the scope-slug rule as `[a-zA-Z0-9][a-zA-Z0-9_-]*` — the charset `hooks/run-lock.js` extracts with',
  ],
  [
    path.join('hooks', 'run-lock.js'),
    /scopes\\\/\(\[a-zA-Z0-9_-\]\+\)/,
    'keep extracting the scope with `[a-zA-Z0-9_-]+` — the charset `references/scope-mode.md` states',
  ],
];


// `/superdev:implement` takes the feature label that names which planned feature to build, and derives
// the run's scope by stripping the label's `feat/` prefix. Two documents carry that contract between
// them: implement.md declares the argument and resolves it, and plan.md hands off with the label
// resolved. A document that drops its half leaves a caller with no way to name its target — and
// `/superdev:afk`, which has no conversation to infer one from, then builds nothing. Neither half fails
// anything else, which is why this is asserted rather than trusted.
const FEATURE_ARG_CONTRACTS = [
  [
    path.join('commands', 'implement.md'),
    /^argument-hint:.*feat\//m,
    'declare an `argument-hint` naming `feat/<label>`',
  ],
  [path.join('commands', 'implement.md'), /\$ARGUMENTS/, 'resolve `$ARGUMENTS`'],
  [
    path.join('commands', 'plan.md'),
    /\/superdev:implement\s+feat\//,
    'name `/superdev:implement feat/<label>` as the resolved successor',
  ],
];

// The unattended token is what lets `/superdev:afk` drive the chain with nobody watching (ADR 0016).
// `scope-mode.md` defines it once, including the catch-all that makes an unwritten stop block rather than
// ask; every document carrying a stop names it. A document that drops the token asks a question no one is
// there to answer, so the sweep stalls until morning having done nothing — a failure that costs a whole
// night and that no other check would notice, because every file involved stays perfectly valid prose.
const UNATTENDED_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /^#{2,3}\s+Unattended\s*$/m,
    'carry the `## Unattended` section defining the token for every command that reads it',
  ],
  ...[
    path.join('commands', 'implement.md'),
    path.join('commands', 'review.md'),
    path.join('commands', 'document.md'),
    path.join('commands', 'ship.md'),
    path.join('references', 'implement-full.md'),
    path.join('references', 'implement-lite.md'),
  ].map((rel) => [rel, /--unattended/, 'name `--unattended`']),
  // The token alone is decoration without a read/apply instruction for the section that governs it. A
  // command that names `--unattended` but points no reader at the `## Unattended` section leaves its own
  // stops with no rule routing them to block. Anchored on the section's own
  // name rather than a verb, because the doc convention phrases the instruction several ways ("read …
  // scope-mode.md's **Unattended** section", "per scope-mode.md's **Unattended** section", "that file's
  // **Unattended** section governs …") — same idea as `CONTENT_TYPES_PATTERN` anchoring on `Read`, applied
  // to a contract whose real documents don't share one fixed verb.
  ...[
    path.join('commands', 'implement.md'),
    path.join('commands', 'review.md'),
    path.join('commands', 'document.md'),
    path.join('commands', 'ship.md'),
    path.join('references', 'implement-full.md'),
    path.join('references', 'implement-lite.md'),
  ].map((rel) => [rel, /\*\*Unattended\*\*\s+section/, 'carry a read/apply instruction for the `## Unattended` section, not merely the token']),
];

// `/superdev:afk` drives the chain by invoking the four real commands (ADR 0015), and every one of those
// invocations carries the unattended token. An invocation that loses it asks a question at three in the
// morning: the sweep stops there and does nothing until someone wakes up, having reported no failure —
// the most expensive silence in the plugin. §3's stage table carries **five** invocation rows (two of
// them `/superdev:review`, one per command otherwise), so this checks every **table row** on its own
// rather than one whole-file regex per command name: a whole-file regex is satisfied the moment any one
// row (or even a passing prose mention on the same line, e.g. §3's `documented-unreviewed` footnote)
// carries the token, which lets a sibling row lose it unnoticed. Only a `|`-prefixed table row counts —
// §5's maintainer-resume mention (`/superdev:ship <slug>`, no token) is prose, not an invocation, and
// stays green.
const AFK_NAMES = new Set(['implement', 'review', 'document', 'ship']);
const AFK_ROW_PATTERN = /^\|.*\/superdev:([a-z][a-z-]*)/;

// scanAfkInvocations() is pure over a root dir: reads commands/afk.md and reports every stage-table row
// that names one of the four chain commands without carrying `--unattended` on that same row. Absent
// afk.md is skipped, matching every other contract scanner.
function scanAfkInvocations(root) {
  const gaps = [];
  let text;
  try {
    text = fs.readFileSync(path.join(root, 'commands', 'afk.md'), 'utf8');
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

// scanContract() is pure over a root dir and a contract table: reads each document the table names and
// reports the expectations it no longer meets. Absent files are skipped, so fixtures need only the
// documents they exercise. Both tables above share this one scanner — they differ in what they assert,
// not in how the assertion runs. `stripFrontmatterFirst` tests the body alone, so a document can't satisfy
// a body contract by echoing the token into its own `argument-hint` frontmatter — `FEATURE_ARG_CONTRACTS`
// needs the opposite (its first row asserts *inside* the frontmatter), so it leaves this off.
function scanContract(root, contracts, { stripFrontmatterFirst = false } = {}) {
  const gaps = [];
  for (const [rel, pattern, expectation] of contracts) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // document absent (fixture / partial checkout) → nothing to scan
    }
    if (stripFrontmatterFirst) text = stripFrontmatter(text);
    if (!pattern.test(text)) gaps.push({ source: rel, expectation });
  }
  return gaps;
}

function main() {
  const root = path.join(__dirname, '..');
  const missing = scan(root);
  const offenders = scanRunRootPaths(root);
  const gaps = scanAssigneeContract(root);
  const anchorGaps = [...scanAnchorContract(root), ...scanAfkSelectionNeutrality(root)];
  const wsGaps = scanWritingStandardContract(root);
  const ctGaps = scanContentTypesContract(root);
  const stGaps = scanStageContract(root);
  const deadEnds = scanCommandRefs(root);
  const chainGaps = scanChainHandoff(root);
  const contractGaps = [
    ...scanContract(root, FEATURE_ARG_CONTRACTS),
    ...scanContract(root, UNATTENDED_CONTRACTS, { stripFrontmatterFirst: true }),
    ...scanAfkInvocations(root),
    ...scanContract(root, SCOPE_SLUG_CONTRACTS),
  ];
  // Every scanner above skips a document it cannot read, so that a fixture carries only the files it
  // exercises. That convention would let `commands/afk.md` be deleted without a single check going red,
  // because nothing else in the plugin names `/superdev:afk` for `scanCommandRefs` to resolve. It is a
  // command rather than an optional doc, so its existence is asserted here instead.
  if (!fs.existsSync(path.join(root, 'commands', 'afk.md'))) {
    contractGaps.push({
      source: path.join('commands', 'afk.md'),
      expectation: 'exist — `/superdev:afk` is a command, and no other check would notice its absence',
    });
  }
  const shape = scanEvalShape(root);
  if (
    missing.length === 0 &&
    offenders.length === 0 &&
    gaps.length === 0 &&
    anchorGaps.length === 0 &&
    wsGaps.length === 0 &&
    ctGaps.length === 0 &&
    stGaps.length === 0 &&
    deadEnds.length === 0 &&
    chainGaps.length === 0 &&
    contractGaps.length === 0 &&
    shape.length === 0
  ) {
    console.log(
      'drift-check ok: references resolve, run-root paths are absolute, assignee and anchor contracts ' +
        'carried, ' +
        'writing standard offered, content-type lens wired, stage line named, commands resolve, ' +
        'chain hands off, scope-slug charset matches the run-lock hook, feature-label argument and ' +
        'unattended token carried, eval graders and scaffolds well-formed',
    );
    process.exit(0);
  }
  for (const m of missing) {
    console.error(`missing ${m.reference} — referenced by ${m.source}`);
  }
  for (const o of offenders) {
    console.error(`checkout-relative run-root path \`${o.match}\` in ${o.source} — use \`<run-root>/…\``);
  }
  for (const g of gaps) {
    console.error(
      `${g.source} carries no \`**Assignee\` config bullet — expected \`- **Assignee:** <value>\` or ` +
        `\`- **Assignee**: <value>\` as a list item; see plan-contract.md → Assignee`,
    );
  }
  for (const g of anchorGaps) {
    console.error(
      g.expectation
        ? `${g.source} no longer meets the anchor contract — expected it to ${g.expectation}`
        : `${g.source} carries no \`## Scope anchor\` section — expected it to state how to recognise a ` +
          `feature's anchor, how to list candidates, and how to tell that an anchor is itself a slice; ` +
          `see ADR 0017`,
    );
  }
  for (const g of wsGaps) {
    console.error(
      `${g.source} carries no \`## Writing standard\` section — expected the heading plus its ` +
        `\`controlled | <path> | none\` values; see ADR 0012`,
    );
  }
  for (const g of ctGaps) {
    console.error(
      `${g.source} no longer instructs itself to read \`references/content-types.md\` — the ` +
        `content-type lens is dead in every dispatch of this agent; see ADR 0014`,
    );
  }
  for (const g of stGaps) {
    console.error(
      `${g.source} no longer names the ledger's \`**Stage:**\` line — the chain handoff is broken ` +
        `there, silently; see ADR 0013`,
    );
  }
  for (const d of deadEnds) {
    console.error(`${d.source} names \`${d.command}\`, which has no file under commands/`);
  }
  for (const c of chainGaps) {
    console.error(
      `${c.source} never names \`${c.next}\` — the chain dead-ends there instead of handing off; ` +
        `see ADR 0013`,
    );
  }
  for (const c of contractGaps) {
    console.error(`${c.source} no longer meets its contract — expected it to ${c.expectation}`);
  }
  for (const p of shape) {
    console.error(`${p.source}: ${p.problem}`);
  }
  process.exit(1);
}

if (process.argv[2] === '--selftest') {
  const assert = require('node:assert');
  const os = require('node:os');

  // fixture with a missing reference
  const tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp1, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tmp1, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tmp1, 'references'), { recursive: true });
  fs.writeFileSync(path.join(tmp1, 'references', 'exists.md'), '# exists\n');
  fs.writeFileSync(
    path.join(tmp1, 'commands', 'foo.md'),
    'See ${CLAUDE_PLUGIN_ROOT}/references/exists.md and ${CLAUDE_PLUGIN_ROOT}/references/missing.md\n',
  );

  const missing1 = scan(tmp1);
  assert.equal(missing1.length, 1, 'detects exactly one missing reference');
  assert.equal(missing1[0].reference, 'references/missing.md', 'names the missing reference');
  assert.equal(missing1[0].source, path.join('commands', 'foo.md'), 'names the source file');

  // fixture with all references present
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp2, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tmp2, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tmp2, 'references'), { recursive: true });
  fs.writeFileSync(path.join(tmp2, 'references', 'exists.md'), '# exists\n');
  fs.writeFileSync(
    path.join(tmp2, 'agents', 'bar.md'),
    'See ${CLAUDE_PLUGIN_ROOT}/references/exists.md\n',
  );

  const missing2 = scan(tmp2);
  assert.equal(missing2.length, 0, 'all-present fixture yields zero missing');

  // fixture with a bare (no ${CLAUDE_PLUGIN_ROOT} macro) reference to a missing file — the prose
  // form used e.g. in commands/setup.md ("Seed: `references/issue-tracker-local.md`")
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp3, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tmp3, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tmp3, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp3, 'commands', 'baz.md'),
    'Seed: `references/missing-bare.md`\n',
  );

  const missing3 = scan(tmp3);
  assert.equal(missing3.length, 1, 'detects a bare-form missing reference');
  assert.equal(missing3[0].reference, 'references/missing-bare.md', 'names the bare reference');

  // --- scanRunRootPaths: run-root artifacts must use the absolute <run-root>/… form, never a
  // checkout-relative .superdev/scopes/<scope>/<artifact> path (wrong from a worktree cwd) ---

  // positive: an execution doc with checkout-relative run-root artifact paths is flagged
  const tmp4 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp4, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp4, 'references', 'implement-lite.md'),
    'Update the ledger at `.superdev/scopes/<scope>/ledger.md` and check `.superdev/scopes/<scope>/run.lock`.\n',
  );
  const offenders4 = scanRunRootPaths(tmp4);
  assert.equal(offenders4.length, 2, 'flags both checkout-relative run-root artifact paths');
  assert.ok(
    offenders4.every((o) => o.source === 'references/implement-lite.md'),
    'names the source doc',
  );

  // negative: the absolute <run-root>/… form plus worktree *directory* paths are clean
  const tmp5 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp5, 'references'), { recursive: true });
  fs.mkdirSync(path.join(tmp5, 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp5, 'references', 'implement-lite.md'),
    'Update the ledger at `<run-root>/ledger.md`; cut `.superdev/scopes/<scope>/worktree`.\n',
  );
  fs.writeFileSync(
    path.join(tmp5, 'agents', 'implementer.md'),
    'Append to `<run-root>/reports/<id>/progress.md`; worktree at `.superdev/scopes/<scope>/worktrees/<id>`.\n',
  );
  const offenders5 = scanRunRootPaths(tmp5);
  assert.equal(offenders5.length, 0, 'absolute form + worktree dir paths yield zero offenders');

  // --- scanAssigneeContract: an issue-backend doc that describes creating an issue must carry the
  // assignee contract; the local-file store is exempt ---

  // positive: an issue-backend seed with no `**Assignee` config bullet is flagged
  const tmp6 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp6, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp6, 'references', 'issue-tracker-acme.md'),
    '**Create a slice issue**: `POST /api/v1/repos/o/r/issues` with `{ "title": "...", "labels": [] }`.\n',
  );
  const gaps6 = scanAssigneeContract(tmp6);
  assert.equal(gaps6.length, 1, 'flags a create-issue seed with no assignee contract');
  assert.equal(gaps6[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');

  // negative: the same seed carrying the assignee contract is clean
  const tmp7 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp7, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp7, 'references', 'issue-tracker-acme.md'),
    '- **Assignee:** `<login>` — the account every issue a run creates is assigned to.\n\n' +
      '**Create a slice issue**: `POST /api/v1/repos/o/r/issues` with `{ "title": "...", "assignees": ["x"] }`.\n' +
      'No **Assignee** configured → resolve the token identity; `none` disables assignment.\n',
  );
  const gaps7 = scanAssigneeContract(tmp7);
  assert.equal(gaps7.length, 0, 'a seed carrying the assignee contract yields zero gaps');

  // the local-file store creates slice FILES, not issues, and is exempt even though it is an
  // issue-tracker-*.md document
  const tmp8 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp8, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp8, 'references', 'issue-tracker-local.md'),
    'Create an issue file per slice under `docs/plans/<feature>/`. `POST /issues` is not used.\n',
  );
  const gaps8 = scanAssigneeContract(tmp8);
  assert.equal(gaps8.length, 0, 'the local-file store is exempt from the assignee contract');

  // positive: a seed describing the `gh issue create` CLI form (no "create an issue" prose, no
  // `POST .../issues`) still creates issues and must carry the assignee contract too — every
  // references/issue-tracker-*.md not in ASSIGNEE_EXEMPT is an issue backend by definition, so the
  // filename alone is the trigger
  const tmp9 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp9, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp9, 'references', 'issue-tracker-ghcli.md'),
    '`gh issue create -t "<title>" -b "<body>" -l "<label>"`\n',
  );
  const gaps9 = scanAssigneeContract(tmp9);
  assert.equal(gaps9.length, 1, 'flags a gh-issue-create seed with no assignee contract');

  // negative: a bare substring mention ("no assignee field; skip it") must not satisfy the contract —
  // only the config-bullet form does
  const tmp10 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp10, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp10, 'references', 'issue-tracker-bare.md'),
    '`gh issue create -t "<title>" -b "<body>"`. This tracker has no assignee field; skip it.\n',
  );
  const gaps10 = scanAssigneeContract(tmp10);
  assert.equal(gaps10.length, 1, 'a bare "assignee" mention does not satisfy the contract');

  // a **bolded** mention in running prose is not a config bullet either. The contract lives in a
  // `- **Assignee:** <value>` list item; prose that merely refers to "the **Assignee** value" says
  // nothing about what this backend is configured with.
  const tmp11 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp11, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp11, 'references', 'issue-tracker-prose.md'),
    '## Assignee\n\nThe **Assignee** value above is applied to the epic and every slice.\n',
  );
  const gaps11 = scanAssigneeContract(tmp11);
  assert.equal(gaps11.length, 1, 'a bolded prose mention is not a config bullet');

  // both real spellings of the config bullet satisfy it
  const tmp12 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp12, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp12, 'references', 'issue-tracker-colon-inside.md'),
    '- **Assignee:** `someone` — the account every issue is assigned to.\n',
  );
  fs.writeFileSync(
    path.join(tmp12, 'references', 'issue-tracker-colon-outside.md'),
    '- **Assignee**: `<accountId>` — the account every issue is assigned to.\n',
  );
  const gaps12 = scanAssigneeContract(tmp12);
  assert.equal(gaps12.length, 0, 'both `**Assignee:**` and `**Assignee**:` bullets satisfy it');

  // --- scanWritingStandardContract: the documentation seed must carry the `## Writing standard`
  // section. A seed that loses it makes /superdev:setup write a doc convention with no standard, and
  // the doc agents silently fall back to no standard at all — the same silent-drop failure the
  // assignee contract exists to prevent. ---

  // positive: a seed with no `## Writing standard` section is flagged
  const tmp13 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp13, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp13, 'references', 'documentation.md'),
    '# Documentation: in-repo technical docs\n\n- **Hierarchy.** Root `AGENTS.md` holds the index.\n',
  );
  const wsGaps13 = scanWritingStandardContract(tmp13);
  assert.equal(wsGaps13.length, 1, 'flags a documentation seed with no writing-standard section');
  assert.equal(
    wsGaps13[0].source,
    path.join('references', 'documentation.md'),
    'names the seed',
  );

  // negative: the same seed carrying the section is clean
  const tmp14 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp14, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp14, 'references', 'documentation.md'),
    '# Documentation\n\n## Writing standard\n\n**Standard:** `<controlled | path | none>`\n',
  );
  const wsGaps14 = scanWritingStandardContract(tmp14);
  assert.equal(wsGaps14.length, 0, 'a seed carrying the section yields zero gaps');

  // a bare prose mention is not the section — the contract is a heading `/setup` fills in, and prose
  // that merely refers to "the writing standard" says nothing about whether the seed offers one
  const tmp15 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp15, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp15, 'references', 'documentation.md'),
    '# Documentation\n\nThe writing standard governs prose the doc agents write.\n',
  );
  const wsGaps15 = scanWritingStandardContract(tmp15);
  assert.equal(wsGaps15.length, 1, 'a prose mention is not the section');

  // an absent seed is skipped, so partial fixtures do not fail the check
  const tmp16 = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp16, 'references'), { recursive: true });
  const wsGaps16 = scanWritingStandardContract(tmp16);
  assert.equal(wsGaps16.length, 0, 'an absent seed is skipped');

  // --- scanContentTypesContract: both doc agents must wire the content-type lens. scan() above catches
  // a reference pointing at a file that does not exist; it cannot catch the reverse, an agent that stops
  // referencing a file which still exists. That leaves the reference present, the suite green, and the
  // lens dead in every dispatch (ADR 0014). ---

  // fixture() builds a throwaway repo tree for a selftest case: given a `files` object (a checkout-
  // relative path → its content), it creates each file's parent directory as needed and writes it,
  // returning the tmp root. Shared by every fixture below (content-types, eval-shape, stage, command-refs,
  // chain-handoff) — one general helper instead of five near-identical ones that only differed in which
  // directory they mkdir'd upfront.
  const fixture = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
    for (const [rel, body] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body);
    }
    return dir;
  };
  const wired = 'Read `${CLAUDE_PLUGIN_ROOT}/references/content-types.md` and apply it.\n';
  const unwired = '# doc agent\n\nNo lens here.\n';

  // positive: doc-reader dropped its wire
  const ct17 = fixture({
    'agents/doc-writer.md': wired,
    'agents/doc-reader.md': unwired,
  });
  const ctGaps17 = scanContentTypesContract(ct17);
  assert.equal(ctGaps17.length, 1, 'flags the agent that dropped the content-types reference');
  assert.equal(ctGaps17[0].source, path.join('agents', 'doc-reader.md'), 'names doc-reader');

  // positive: doc-writer dropped its wire — the same failure from the other side
  const ct18 = fixture({
    'agents/doc-writer.md': unwired,
    'agents/doc-reader.md': wired,
  });
  const ctGaps18 = scanContentTypesContract(ct18);
  assert.equal(ctGaps18.length, 1, 'flags doc-writer when it is the one that dropped the wire');
  assert.equal(ctGaps18[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer');

  // negative: both wired is clean
  const ct19 = fixture({
    'agents/doc-writer.md': wired,
    'agents/doc-reader.md': wired,
  });
  assert.equal(scanContentTypesContract(ct19).length, 0, 'both agents wired yields zero gaps');

  // a bare prose path counts too, matching how scan() accepts either form
  const ct20 = fixture({
    'agents/doc-writer.md': 'Read `references/content-types.md` before your first edit.\n',
    'agents/doc-reader.md': wired,
  });
  assert.equal(scanContentTypesContract(ct20).length, 0, 'a bare reference path satisfies the contract');

  // the path alone is not a wire: an agent that mentions the file in passing but never instructs itself
  // to read it has already lost the lens, which is the drift this check exists to catch
  const ct21 = fixture({
    'agents/doc-writer.md': 'The lens lives in `references/content-types.md` and matters here.\n',
    'agents/doc-reader.md': wired,
  });
  assert.equal(
    scanContentTypesContract(ct21).length,
    1,
    'a passing mention with no read instruction is still a gap',
  );

  // an absent agent file is skipped, so a fixture carries only the files it exercises
  const ct22 = fixture({ 'agents/doc-writer.md': wired });
  assert.equal(scanContentTypesContract(ct22).length, 0, 'an absent agent file is skipped');

  // --- scanAnchorContract: every slice-store document must state how to identify a feature's scope
  // anchor (ADR 0017). `/superdev:afk` selects by anchor and reads that contract instead of encoding one
  // store's shape, so a document without it leaves the sweep blind in that backend. The local-file store
  // is NOT exempt here, unlike the assignee contract — it has an anchor, its `00-epic-*.md` file. ---

  const anchorSection =
    '## Scope anchor\n\n' +
    'The anchor is the feature root: the issue that is nobody\'s sub-issue.\n\n' +
    '- **Recognise one.** It carries no parent link.\n' +
    '- **List the candidates.** Query per feature label and keep the roots.\n' +
    '- **List the slices beneath it.** The same query returns them.\n' +
    '- **Tell an anchor that is itself a slice.** It carries a test-applicability label.\n';

  // positive: a store document with no anchor section is flagged
  const an1 = fixture({ 'references/issue-tracker-acme.md': '# acme\n\nSlices are issues.\n' });
  const anGaps1 = scanAnchorContract(an1);
  assert.equal(anGaps1.length, 1, 'flags a store document with no anchor contract');
  assert.equal(anGaps1[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');

  // negative: the same document carrying the section, with every element named, is clean
  const an2 = fixture({ 'references/issue-tracker-acme.md': anchorSection });
  assert.equal(scanAnchorContract(an2).length, 0, 'a document naming every element yields zero gaps');

  // positive: the heading alone, with no elements, is not the contract — this is the empty-section gap
  // that shipped finding #4 unnoticed
  const anEmpty = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\nThe anchor is the feature root: the issue that is nobody\'s sub-issue.\n',
  });
  assert.equal(scanAnchorContract(anEmpty).length, 4, 'a heading naming no element flags all four');

  // positive: the section is missing just one element — only that one is flagged
  const anPartial = fixture({
    'references/issue-tracker-acme.md': anchorSection.replace(
      '- **List the slices beneath it.** The same query returns them.\n',
      '',
    ),
  });
  const anPartialGaps = scanAnchorContract(anPartial);
  assert.equal(anPartialGaps.length, 1, 'flags exactly the one missing element');
  assert.match(anPartialGaps[0].expectation, /beneath/, 'names the missing element');

  // the local-file store is NOT exempt — it has an anchor concept, so it must state one
  const an3 = fixture({ 'references/issue-tracker-local.md': 'Slices live in `docs/plans/<feature>/`.\n' });
  assert.equal(
    scanAnchorContract(an3).length,
    1,
    'the local-file store is not exempt from the anchor contract',
  );

  // this repo's own dogfooded store config is checked alongside the seeds
  const an4 = fixture({ 'docs/agents/issue-tracker.md': '# Slice store\n\nIssues.\n' });
  const anGaps4 = scanAnchorContract(an4);
  assert.equal(anGaps4.length, 1, 'the dogfooded store config is checked too');
  assert.equal(anGaps4[0].source, path.join('docs', 'agents', 'issue-tracker.md'), 'names it');

  // a prose mention is not the section: the contract is a heading `/superdev:setup` carries across, and
  // prose that merely refers to an anchor says nothing about how this backend identifies one
  const an5 = fixture({
    'references/issue-tracker-acme.md': 'The scope anchor is the epic, usually.\n',
  });
  assert.equal(scanAnchorContract(an5).length, 1, 'a prose mention is not the section');

  // every store document is reported, so one pass names them all
  const an6 = fixture({
    'references/issue-tracker-acme.md': '# acme\n',
    'references/issue-tracker-beta.md': '# beta\n',
    'docs/agents/issue-tracker.md': anchorSection,
  });
  assert.equal(scanAnchorContract(an6).length, 2, 'each document missing the contract is reported');

  // an absent document is skipped, so a fixture carries only the docs it exercises
  assert.equal(scanAnchorContract(fixture({ 'README.md': '# repo\n' })).length, 0, 'absent docs skipped');

  // --- scanAfkSelectionNeutrality: afk's selection step reads the store's anchor contract and names no
  // backend's own mechanism (ADR 0017). Naming one is right on a single store and wrong on the rest, and
  // it surfaces as a sweep that finds nothing rather than as an error. ---

  const selection = (body) => `# afk\n\n## 2. Select the next scope anchor\n\n${body}\n\n## 3. Next\n\nGo.\n`;
  const neutral = "Per the store's `## Scope anchor` contract, list the candidates and take the oldest.";

  // negative: a neutral selection that points at the contract is clean
  assert.equal(
    scanAfkSelectionNeutrality(fixture({ 'commands/afk.md': selection(neutral) })).length,
    0,
    'a neutral selection naming the contract is clean',
  );

  // positive: each store mechanism is caught on its own
  for (const [snippet, why] of [
    ['Take the issue labelled `epic`.', 'the epic label'],
    ['Strip the `feat/` prefix to get the slug.', 'the feat prefix'],
    ['Look for `00-epic-*.md` in the plan directory.', 'the local filename'],
    ['The anchor is nobody\'s sub-issue.', 'the GitHub relation'],
    ['Check that `fields.parent` is absent.', 'the Jira parent field'],
  ]) {
    const gaps = scanAfkSelectionNeutrality(
      fixture({ 'commands/afk.md': selection(`${neutral} ${snippet}`) }),
    );
    assert.equal(gaps.length, 1, `flags ${why} in the selection step`);
    assert.match(gaps[0].expectation, /select without naming/, 'reports it as a mechanism');
  }

  // positive: naming no mechanism is only half — a selection pointing at no contract has nothing to
  // select by, so silence must not satisfy the check
  const silent = scanAfkSelectionNeutrality(
    fixture({ 'commands/afk.md': selection('Take the oldest candidate and go.') }),
  );
  assert.equal(silent.length, 1, 'a selection naming no contract is a gap');
  assert.match(silent[0].expectation, /point its selection at/, 'reports the missing contract');

  // a mechanism outside the selection section is fine — the rest of the command may discuss an epic as a
  // domain concept, it just may not test for one when selecting
  assert.equal(
    scanAfkSelectionNeutrality(
      fixture({
        'commands/afk.md':
          selection(neutral) + '\n## 4. Blocks\n\nLabel the `epic` blocked and move on.\n',
      }),
    ).length,
    0,
    'a mechanism outside the selection section is not a gap',
  );

  // an absent afk.md is skipped here; its existence is asserted in main()
  assert.equal(
    scanAfkSelectionNeutrality(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent afk.md is skipped',
  );

  // positive: a missing, renumbered, or retitled selection heading is itself a gap — each of these three
  // mutations previously silenced the whole neutrality check (the section was skipped, not flagged),
  // hiding whatever store mechanism the selection step went on to name
  for (const [why, body] of [
    ['renumbered', `# afk\n\n## 3. Select the next scope anchor\n\nTake the \`epic\` label.\n\n## 4. Next\n\nGo.\n`],
    ['retitled', `# afk\n\n## 2 Pick the work\n\nTake the \`epic\` label.\n\n## 3. Next\n\nGo.\n`],
    ['deleted', `# afk\n\nTake the \`epic\` label.\n\n## 3. Next\n\nGo.\n`],
  ]) {
    const gaps = scanAfkSelectionNeutrality(fixture({ 'commands/afk.md': body }));
    assert.equal(gaps.length, 1, `flags a ${why} selection heading`);
    assert.match(gaps[0].expectation, /selection heading/, `names the missing heading for ${why}`);
  }

  // --- scanEvalShape: a grader's frontmatter must be something the harness can act on, and a case's
  // scaffold_script must resolve ---

  const goodGrader = '---\ntype: llm\nfocus: files\nweight: 2\n---\nJudge the plan.\n';
  const goodCase = 'name: c\ncontext:\n  scaffold_script: scaffold.sh\n';

  // a well-formed case yields nothing
  const ok = fixture({
    'evals/c/case.yaml': goodCase,
    'evals/c/scaffold.sh': '#!/bin/sh\n',
    'evals/c/graders/g.md': goodGrader,
  });
  assert.equal(scanEvalShape(ok).length, 0, 'a well-formed case yields no problems');

  // each rule fires on its own, and names the offending file
  const badType = fixture({
    'evals/c/graders/g.md': '---\ntype: vibes\nfocus: files\nweight: 2\n---\nb\n',
  });
  const typeProblems = scanEvalShape(badType);
  assert.equal(typeProblems.length, 1, 'an unknown type is flagged');
  assert.equal(typeProblems[0].source, path.join('evals', 'c', 'graders', 'g.md'), 'names the grader');

  const badWeight = fixture({
    'evals/c/graders/g.md': '---\ntype: llm\nfocus: files\nweight: notanumber\n---\nb\n',
  });
  assert.equal(scanEvalShape(badWeight).length, 1, 'a non-numeric weight is flagged');

  const noFocus = fixture({
    'evals/c/graders/g.md': '---\ntype: llm\nweight: 2\n---\nb\n',
  });
  assert.equal(scanEvalShape(noFocus).length, 1, 'neither focus nor target is flagged');

  // `target` is the regex graders' spelling and satisfies the same rule
  const withTarget = fixture({
    'evals/c/graders/g.md': '---\ntype: regex\ntarget: files\nweight: 1\n---\nb\n',
  });
  assert.equal(scanEvalShape(withTarget).length, 0, '`target` satisfies the focus/target rule');

  const noFrontmatter = fixture({
    'evals/c/graders/g.md': 'Just prose, no frontmatter.\n',
  });
  assert.equal(scanEvalShape(noFrontmatter).length, 1, 'a missing frontmatter block is flagged');

  const badScaffold = fixture({
    'evals/c/case.yaml': 'name: c\ncontext:\n  scaffold_script: missing.sh\n',
    'evals/c/graders/g.md': goodGrader,
  });
  const scaffoldProblems = scanEvalShape(badScaffold);
  assert.equal(scaffoldProblems.length, 1, 'an unresolvable scaffold_script is flagged');
  assert.match(scaffoldProblems[0].problem, /scaffold_script/, 'says what is wrong');

  // nothing to check is not a failure
  const noEvals = fixture({ 'README.md': '# repo\n' });
  assert.equal(scanEvalShape(noEvals).length, 0, 'an absent evals/ directory yields no problems');

  const noGraders = fixture({
    'evals/c/case.yaml': goodCase,
    'evals/c/scaffold.sh': '#!/bin/sh\n',
  });
  assert.equal(scanEvalShape(noGraders).length, 0, 'a case with no graders/ dir yields no problems');

  // The harness accepts six grader types, and only `llm` and `regex` carry a focus/target. The other
  // four are `.strict()`, so adding `focus:` to satisfy this check would make the harness reject them.
  for (const type of ['tool_order', 'tool_used', 'file_exists', 'baseline']) {
    const other = fixture({
      'evals/c/graders/g.md': `---\ntype: ${type}\nweight: 1\n---\nb\n`,
    });
    assert.equal(scanEvalShape(other).length, 0, `\`${type}\` is a valid type and needs no focus`);
  }

  // The harness declares weight as a positive number, so zero, a negative, and a blank are malformed.
  for (const weight of ['0', '-1', '']) {
    const bad = fixture({
      'evals/c/graders/g.md': `---\ntype: llm\nfocus: files\nweight: ${weight}\n---\nb\n`,
    });
    assert.equal(scanEvalShape(bad).length, 1, `\`weight: ${weight}\` is not a positive number`);
  }

  // YAML a maintainer can legally write: CRLF endings, a quoted scalar, a trailing comment.
  const crlf = fixture({
    'evals/c/graders/g.md': '---\r\ntype: llm\r\nfocus: files\r\nweight: 2\r\n---\r\nb\r\n',
  });
  assert.equal(scanEvalShape(crlf).length, 0, 'CRLF frontmatter is read, not rejected');

  const quoted = fixture({
    'evals/c/graders/g.md': '---\ntype: "llm"\nfocus: \'files\'\nweight: 2  # weighted\n---\nb\n',
  });
  assert.equal(scanEvalShape(quoted).length, 0, 'quoted scalars and trailing comments are read');

  const quotedScaffold = fixture({
    'evals/c/case.yaml': 'context:\n  scaffold_script: "scaffold.sh"  # relative to the case dir\n',
    'evals/c/scaffold.sh': '#!/bin/sh\n',
    'evals/c/graders/g.md': goodGrader,
  });
  assert.equal(scanEvalShape(quotedScaffold).length, 0, 'a quoted scaffold_script resolves');

  // --- scanStageContract: every chain document must name the ledger's `**Stage:**` line. The four
  // commands hand a run along through that line (ADR 0013), so a document that stops naming it breaks
  // the handoff silently: the stage is never written, or never read, and the suite stays green. ---

  const stageWritten = 'Write `**Stage:** implementing` into `<run-root>/ledger.md`.\n';
  const stageRead = "Read the ledger's `**Stage:**` line and show it per scope.\n";

  // positive: status.md stopped naming the stage line
  const st1 = fixture({
    'commands/implement.md': stageWritten,
    'commands/status.md': '# status\n\nNo stage here.\n',
  });
  const stGaps1 = scanStageContract(st1);
  assert.equal(stGaps1.length, 1, 'flags the chain document that stopped naming the stage line');
  assert.equal(stGaps1[0].source, path.join('commands', 'status.md'), 'names status.md');

  // positive from the other side: implement.md is the writer, and its gap is the same failure
  const st2 = fixture({
    'commands/implement.md': '# implement\n\nNo stage here.\n',
    'commands/status.md': stageRead,
  });
  const stGaps2 = scanStageContract(st2);
  assert.equal(stGaps2.length, 1, 'flags implement.md when it is the one that dropped the line');
  assert.equal(stGaps2[0].source, path.join('commands', 'implement.md'), 'names implement.md');

  // negative: both naming the line is clean
  const st3 = fixture({
    'commands/implement.md': stageWritten,
    'commands/status.md': stageRead,
  });
  assert.equal(scanStageContract(st3).length, 0, 'both documents naming the line yields zero gaps');

  // a prose mention of "the stage" is not the ledger line: the contract is the line's exact spelling,
  // and prose that merely refers to a stage says nothing about which line a command writes or reads
  const st4 = fixture({
    'commands/implement.md': 'The run records its stage somewhere.\n',
    'commands/status.md': stageRead,
  });
  assert.equal(scanStageContract(st4).length, 1, 'a prose mention of the stage is not the line');

  // an absent document is skipped, so a fixture carries only the files it exercises
  const st5 = fixture({ 'commands/status.md': stageRead });
  assert.equal(scanStageContract(st5).length, 0, 'an absent chain document is skipped');

  // --- scanCommandRefs: a `/superdev:<name>` reference must resolve to `commands/<name>.md`. The chain
  // hands the user from one command to the next by printing its name (ADR 0013), so a reference to a
  // command that does not exist sends the reader to a dead end. Same failure shape as scan() one level
  // over: that one resolves references/ paths, this one resolves command names. ---

  // positive: a command points at one that does not exist
  const cr1 = fixture({
    'commands/implement.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n',
  });
  const crGaps1 = scanCommandRefs(cr1);
  assert.equal(crGaps1.length, 1, 'flags a reference to a command with no file');
  assert.equal(crGaps1[0].command, '/superdev:ship', 'names the unresolved command');
  assert.equal(crGaps1[0].source, path.join('commands', 'implement.md'), 'names the source document');

  // negative: the same reference resolves once the command exists
  const cr2 = fixture({
    'commands/implement.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n',
    'commands/ship.md': '# superdev ship\n',
  });
  assert.equal(scanCommandRefs(cr2).length, 0, 'a resolving reference yields zero gaps');

  // an agent may name a command too, and its references resolve by the same rule
  const cr3 = fixture({ 'agents/doc-writer.md': 'Dispatched by `/superdev:nope`.\n' });
  assert.equal(scanCommandRefs(cr3).length, 1, 'an agent naming a missing command is flagged');

  // a command naming itself resolves, and a trailing argument is not part of the name
  const cr4 = fixture({
    'commands/document.md': 'Invoked as `/superdev:document audit` — see `/superdev:document`.\n',
  });
  assert.equal(scanCommandRefs(cr4).length, 0, 'a trailing argument is not read as part of the name');

  // one missing command named by two documents is reported once per document, so every dead end is
  // fixable from the report alone
  const cr5 = fixture({
    'commands/implement.md': 'Then `/superdev:ship`.\n',
    'commands/document.md': 'Then `/superdev:ship`.\n',
  });
  assert.equal(scanCommandRefs(cr5).length, 2, 'each source naming a missing command is reported');

  // --- scanChainHandoff: each command in the chain must name its successor. scanCommandRefs above
  // catches a handoff that points at a command with no file; it cannot catch a command that names no
  // successor at all. That drift leaves every reference resolvable and the suite green, and the chain
  // then dead-ends silently at whichever command dropped its line (ADR 0013). ---

  const handsOff = (next) => `When it is clean, print \`${next} <range>\` as the next step.\n`;

  // positive: review.md stopped naming its successor
  const ch1 = fixture({
    'commands/implement.md': handsOff('/superdev:review'),
    'commands/review.md': '# review\n\nReport the findings and stop.\n',
    'commands/document.md': handsOff('/superdev:ship'),
  });
  const chGaps1 = scanChainHandoff(ch1);
  assert.equal(chGaps1.length, 1, 'flags the command that names no successor');
  assert.equal(chGaps1[0].source, path.join('commands', 'review.md'), 'names review.md');
  assert.equal(chGaps1[0].next, '/superdev:document', 'names the successor it should have');

  // negative: a fully wired chain is clean
  const ch2 = fixture({
    'commands/implement.md': handsOff('/superdev:review'),
    'commands/review.md': handsOff('/superdev:document'),
    'commands/document.md': handsOff('/superdev:ship'),
  });
  assert.equal(scanChainHandoff(ch2).length, 0, 'a fully wired chain yields zero gaps');

  // every link is checked, not just the first: two broken handoffs are both reported
  const ch3 = fixture({
    'commands/implement.md': '# implement\n\nMerge the slices and stop.\n',
    'commands/review.md': handsOff('/superdev:document'),
    'commands/document.md': '# document\n\nReconcile the docs and stop.\n',
  });
  assert.equal(scanChainHandoff(ch3).length, 2, 'each broken link is reported');

  // naming some other command is not the handoff — the chain's order is what this check pins, and
  // /superdev:plan is a legitimate reference that says nothing about the successor
  const ch4 = fixture({
    'commands/implement.md': handsOff('/superdev:review'),
    'commands/review.md': 'To act on findings, run `/superdev:plan`, then `/superdev:implement`.\n',
    'commands/document.md': handsOff('/superdev:ship'),
  });
  assert.equal(scanChainHandoff(ch4).length, 1, 'naming an unrelated command is not a handoff');

  // an absent document is skipped, so a fixture carries only the links it exercises
  const ch5 = fixture({ 'commands/document.md': handsOff('/superdev:ship') });
  assert.equal(scanChainHandoff(ch5).length, 0, 'an absent chain document is skipped');

  // --- scanFeatureArgContract: `/superdev:implement` takes the feature label that names which planned
  // feature to build, and plan.md hands off with that label resolved. The two halves live in different
  // documents, so either can drift alone, and neither failure surfaces anywhere else: a caller with no
  // conversation to infer a target from simply builds nothing. ---

  const takesLabel =
    '---\nargument-hint: "[feat/<label> | (empty = the only plan in the store)]"\n---\n' +
    'Resolve `$ARGUMENTS` to one feature label, and derive the scope from it.\n';
  const handsOffLabel = 'Then run `/superdev:implement feat/<label>` with the real label substituted.\n';

  // negative: both halves carried is clean
  const fa1 = fixture({
    'commands/implement.md': takesLabel,
    'commands/plan.md': handsOffLabel,
  });
  assert.equal(scanContract(fa1, FEATURE_ARG_CONTRACTS).length, 0, 'both halves carried yields zero gaps');

  // positive: implement.md declares no argument-hint
  const fa2 = fixture({
    'commands/implement.md': 'Resolve `$ARGUMENTS` to one feature label.\n',
    'commands/plan.md': handsOffLabel,
  });
  const faGaps2 = scanContract(fa2, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps2.length, 1, 'flags implement.md when it declares no argument-hint');
  assert.equal(faGaps2[0].source, path.join('commands', 'implement.md'), 'names implement.md');
  assert.match(faGaps2[0].expectation, /argument-hint/, 'says which half is missing');

  // positive: implement.md declares the hint but never resolves the argument, so the hint is decoration
  const fa3 = fixture({
    'commands/implement.md': '---\nargument-hint: "[feat/<label>]"\n---\nLoad the slices.\n',
    'commands/plan.md': handsOffLabel,
  });
  const faGaps3 = scanContract(fa3, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps3.length, 1, 'a declared-but-unresolved argument is still a gap');
  assert.match(faGaps3[0].expectation, /\$ARGUMENTS/, 'names the unresolved argument');

  // positive: plan.md stopped naming the resolved successor — the other half of the same contract
  const fa4 = fixture({
    'commands/implement.md': takesLabel,
    'commands/plan.md': 'Tell the user the plan is ready for `/superdev:implement`.\n',
  });
  const faGaps4 = scanContract(fa4, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps4.length, 1, 'flags plan.md when it hands off without the label');
  assert.equal(faGaps4[0].source, path.join('commands', 'plan.md'), 'names plan.md');

  // an argument-hint that names some other argument is not this contract: `/superdev:review` and
  // `/superdev:ship` both declare hints of their own, so the presence of a hint proves nothing
  const fa5 = fixture({
    'commands/implement.md': '---\nargument-hint: "[BASE..HEAD]"\n---\nResolve `$ARGUMENTS`.\n',
    'commands/plan.md': handsOffLabel,
  });
  assert.equal(
    scanContract(fa5, FEATURE_ARG_CONTRACTS).length,
    1,
    'a hint naming an unrelated argument does not satisfy the contract',
  );

  // an absent document is skipped, so a fixture carries only the halves it exercises
  const fa6 = fixture({ 'commands/plan.md': handsOffLabel });
  assert.equal(scanContract(fa6, FEATURE_ARG_CONTRACTS).length, 0, 'an absent document is skipped');

  // --- UNATTENDED_CONTRACTS: scope-mode.md defines the token, and every document carrying a stop names
  // it (ADR 0016). A document that drops it asks a question nobody is there to answer, so an unattended
  // sweep stalls until morning having done nothing — and every file involved stays valid prose, so
  // nothing else notices. ---

  const definesToken =
    '## Unattended\n\n`--unattended` in a command\'s arguments means nobody is watching.\n';
  const namesToken =
    'Carrying `--unattended` → block instead of asking, per `scope-mode.md`\'s **Unattended** section.\n';
  const everyStop = {
    'references/scope-mode.md': definesToken,
    'commands/implement.md': namesToken,
    'commands/review.md': namesToken,
    'commands/document.md': namesToken,
    'commands/ship.md': namesToken,
    'references/implement-full.md': namesToken,
    'references/implement-lite.md': namesToken,
  };

  const unattendedOpts = { stripFrontmatterFirst: true };

  // negative: every document carrying its half is clean
  assert.equal(
    scanContract(fixture(everyStop), UNATTENDED_CONTRACTS, unattendedOpts).length,
    0,
    'every document carrying the token yields zero gaps',
  );

  // positive: scope-mode.md names the token but lost the section that defines it, so the catch-all —
  // the rule that makes an unwritten stop block rather than ask — has nowhere to live
  const un2 = fixture({
    ...everyStop,
    'references/scope-mode.md': 'Pass `--unattended` through to each command.\n',
  });
  const unGaps2 = scanContract(un2, UNATTENDED_CONTRACTS, unattendedOpts);
  assert.equal(unGaps2.length, 1, 'a token mention is not the section that defines it');
  assert.equal(unGaps2[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive: each stop-carrying document is checked on its own, not just the first. Dropping everything
  // fails both the token row and the read/apply-instruction row for that one document.
  for (const rel of [
    'commands/implement.md',
    'commands/review.md',
    'commands/document.md',
    'commands/ship.md',
    'references/implement-full.md',
    'references/implement-lite.md',
  ]) {
    const dropped = fixture({ ...everyStop, [rel]: '# doc\n\nNo token here.\n' });
    const gaps = scanContract(dropped, UNATTENDED_CONTRACTS, unattendedOpts);
    assert.equal(gaps.length, 2, `flags ${rel} on both rows when it drops everything`);
    assert.ok(gaps.every((g) => g.source === rel.split('/').join(path.sep)), `both gaps name ${rel}`);
  }

  // positive: the token alone, with no read/apply instruction for the section. A command in this shape
  // names `--unattended` in its prose while nothing in the body points a reader at the `## Unattended`
  // section that routes a stop to block, so the token governs nothing.
  const shipShaped = fixture({
    ...everyStop,
    'commands/ship.md': '# ship\n\nCarries `--unattended` but points nowhere.\n',
  });
  const shipShapedGaps = scanContract(shipShaped, UNATTENDED_CONTRACTS, unattendedOpts);
  assert.equal(shipShapedGaps.length, 1, 'flags the missing read/apply instruction alone');
  assert.match(shipShapedGaps[0].expectation, /read\/apply instruction/, 'names the missing instruction');

  // positive: `[--unattended]` in a command's own `argument-hint` frontmatter is not a standing answer in
  // its body. Deleting every real mention from review.md/document.md/ship.md and leaving only the
  // frontmatter echo must still be caught — the exact false-green `stripFrontmatterFirst` exists to close.
  for (const rel of ['commands/review.md', 'commands/document.md', 'commands/ship.md']) {
    const frontmatterOnly = fixture({
      ...everyStop,
      [rel]: '---\nargument-hint: "[foo] [--unattended]"\n---\n\n# doc\n\nNo body mention.\n',
    });
    const strippedGaps = scanContract(frontmatterOnly, UNATTENDED_CONTRACTS, unattendedOpts);
    assert.equal(strippedGaps.length, 2, `flags ${rel} on both rows once frontmatter is stripped`);
    assert.ok(strippedGaps.every((g) => g.source === rel.split('/').join(path.sep)), `both gaps name ${rel}`);
    // proof this is the bug the option closes: without stripping, the token row alone reads clean —
    // only the (always-unstripped) read/apply-instruction row still catches it
    const unstrippedGaps = scanContract(frontmatterOnly, UNATTENDED_CONTRACTS);
    assert.equal(unstrippedGaps.length, 1, `${rel}'s frontmatter echo satisfies only the token row unstripped`);
    assert.match(unstrippedGaps[0].expectation, /read\/apply instruction/, 'the token row itself is clean');
  }

  // FEATURE_ARG_CONTRACTS's first row needs the frontmatter itself (`^argument-hint:.*feat/`) and never
  // strips it — confirms the two contract tables can disagree on `stripFrontmatterFirst` safely
  assert.equal(
    scanContract(
      fixture({ 'commands/implement.md': takesLabel, 'commands/plan.md': handsOffLabel }),
      FEATURE_ARG_CONTRACTS,
    ).length,
    0,
    'FEATURE_ARG_CONTRACTS reads the unstripped frontmatter',
  );

  // an absent document is skipped, so a fixture carries only the stops it exercises
  const un4 = fixture({ 'references/scope-mode.md': definesToken });
  assert.equal(scanContract(un4, UNATTENDED_CONTRACTS).length, 0, 'absent documents are skipped');

  // --- scanAfkInvocations: every stage-table row that invokes one of the four chain commands must carry
  // the token on that same row (ADR 0015). A row that loses it asks a question nobody answers, and the
  // sweep stops there reporting no failure. The real table carries five rows — two of them
  // `/superdev:review` — so this checks per row, not once per command name. ---

  // a fixture modeled on commands/afk.md §3's stage table plus its footnote and §5's maintainer-resume
  // mention, both of which name a command on the same line as `--unattended` without being a table row
  const stageTable = (rows) =>
    '| Stage | Start at |\n' +
    '|---|---|\n' +
    rows.map(([stage, cmd]) => `| \`${stage}\` | \`${cmd}\` |\n`).join('') +
    '\n`documented-unreviewed` routes to the review, not the ship, because `/superdev:ship --unattended` ' +
    'refuses a scope whose review never ran.\n\n' +
    'A maintainer runs `/superdev:ship <slug>` once the host is reachable.\n';

  const fullRows = [
    ['no run root, or `implementing`', '/superdev:implement feat/<label> --unattended'],
    ['merged', '/superdev:review <BASE>..superdev/<slug> --unattended'],
    ['reviewed', '/superdev:document <BASE>..superdev/<slug> --unattended'],
    ['documented-unreviewed', '/superdev:review <BASE>..superdev/<slug> --unattended'],
    ['documented', '/superdev:ship <slug> --unattended'],
  ];

  // negative: every row carrying the token, plus the footnote and the §5 mention with no token, is clean
  const afk1 = fixture({ 'commands/afk.md': stageTable(fullRows) });
  assert.equal(scanAfkInvocations(afk1).length, 0, 'a fully wired stage table is clean');

  // positive: each of the five rows is checked on its own — mutate one at a time, confirm it alone goes
  // red, and that the sibling row of the same command (`review` appears twice) does not mask it
  for (let i = 0; i < fullRows.length; i++) {
    const mutated = fullRows.map((row, j) => (j === i ? [row[0], row[1].replace(' --unattended', '')] : row));
    const afk = fixture({ 'commands/afk.md': stageTable(mutated) });
    const gaps = scanAfkInvocations(afk);
    assert.equal(gaps.length, 1, `mutating row ${i} (${fullRows[i][1]}) is caught on its own`);
    assert.match(gaps[0].expectation, new RegExp(fullRows[i][1].split(' ')[0].replace('/', '\\/')));
  }

  // the ship-command prose footnote (name + token on one line, not a table row) does not mask a missing
  // token on the actual ship table row
  const afkShipMasked = fixture({
    'commands/afk.md': stageTable(
      fullRows.map((row) =>
        row[1].startsWith('/superdev:ship') ? [row[0], row[1].replace(' --unattended', '')] : row,
      ),
    ),
  });
  const shipGaps = scanAfkInvocations(afkShipMasked);
  assert.equal(shipGaps.length, 1, 'the ship footnote does not mask the ship row losing the token');
  assert.match(shipGaps[0].expectation, /\/superdev:ship/, 'names the ship row');

  // §5's maintainer-resume mention (`/superdev:ship <slug>`, no token, not a table row) stays green on
  // its own — it is prose, not an invocation
  const afkResumeOnly = fixture({
    'commands/afk.md': 'A maintainer runs `/superdev:ship <slug>` once the host is reachable.\n',
  });
  const resumeGaps = scanAfkInvocations(afkResumeOnly);
  assert.ok(
    resumeGaps.every((g) => /carry a stage-table row/.test(g.expectation)),
    'the maintainer-resume prose is never read as an invocation that lost its token',
  );

  // a row that stops existing is caught too — inspecting only the rows present says nothing about a step
  // afk silently dropped, which would make it skip reviewing or shipping and still report a clean sweep
  for (const dropped of ['implement', 'review', 'document', 'ship']) {
    const afkMissing = fixture({
      'commands/afk.md': stageTable(fullRows.filter(([, cmd]) => !cmd.startsWith(`/superdev:${dropped} `))),
    });
    const gaps = scanAfkInvocations(afkMissing);
    assert.equal(gaps.length, 1, `dropping every /superdev:${dropped} row is caught`);
    assert.match(gaps[0].expectation, /carry a stage-table row/, 'reports it as a missing row');
    assert.match(gaps[0].expectation, new RegExp(`superdev:${dropped}`), `names /superdev:${dropped}`);
  }

  // an absent afk.md is skipped, matching every other contract scanner
  assert.equal(
    scanAfkInvocations(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent afk.md is skipped',
  );

  // --- SCOPE_SLUG_CONTRACTS: the slug rule the prose states and the charset the run-lock hook extracts
  // with are one fact in two syntaxes, in two files. Pinning both literally is what makes widening either
  // one alone go red. ---

  const realRoot = path.join(__dirname, '..');
  assert.equal(
    scanContract(realRoot, SCOPE_SLUG_CONTRACTS).length,
    0,
    'the shipped scope-mode.md rule and run-lock.js regex agree',
  );

  // positive: reintroducing the `.` the prose once admitted is caught
  const slug1 = fixture({ 'references/scope-mode.md': 'A scope slug must match `[a-z0-9][a-z0-9._-]*`.\n' });
  const slugGaps1 = scanContract(slug1, SCOPE_SLUG_CONTRACTS);
  assert.equal(slugGaps1.length, 1, 'flags a slug rule wider than the hook admits');
  assert.equal(slugGaps1[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive from the hook's side: widening the regex alone is the same drift
  const slug2 = fixture({
    'hooks/run-lock.js': 'cmd.match(/\\.superdev\\/scopes\\/([a-zA-Z0-9._-]+)\\/worktree\\b/);\n',
  });
  const slugGaps2 = scanContract(slug2, SCOPE_SLUG_CONTRACTS);
  assert.equal(slugGaps2.length, 1, 'flags the hook drifting away from the stated rule');
  assert.equal(slugGaps2[0].source, path.join('hooks', 'run-lock.js'), 'names run-lock.js');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), SCOPE_SLUG_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  console.log('drift-check selftest ok');
} else {
  main();
}
