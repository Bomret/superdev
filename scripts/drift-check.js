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

// scan() is pure over a root dir so it's unit-testable: reads commands/*.md, agents/*.md and
// references/*.md, extracts every referenced references/<name>.md, and reports the ones that don't
// exist. references/ is in the set because a reference cites another reference — the execution
// playbooks point at scope-mode.md — and a rename there dangles like any other.
function scan(root) {
  const missing = [];
  for (const dir of ['commands', 'agents', 'references']) {
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
  'commands/publish-kb.md',
  'references/implement-lite.md',
  'references/implement-full.md',
  'references/scope-mode.md',
  'agents/implementer.md',
  'agents/slice-reviewer.md',
  'agents/simplicity-reviewer.md',
  'agents/final-reviewer.md',
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
// today, which is how finding #4 shipped unnoticed. Each pattern is anchored on a bullet's bolded lead-in
// rather than matched anywhere in the section: a pattern free to match anywhere is satisfied by intro
// prose that merely lists the four concepts, which states none of them for this backend. Inside that
// lead-in each pattern matches the shared *concept* the bullet names and not a full sentence, so a
// backend-specific mechanism (a JQL clause, a `/parent` call) stays free to vary. Both spellings of every
// concept are accepted: the repo's writing standard declares American English, so a document is not wrong
// for writing `recognize`, `under`, or `also a slice`.
const ANCHOR_ELEMENTS = [
  [/^[-*] \*\*[^*]*recogni[sz]/im, 'how to recognise an anchor'],
  [/^[-*] \*\*[^*]*candidate/im, 'how to list the candidates'],
  [/^[-*] \*\*[^*]*\b(?:beneath|under)\b/im, 'how to list the slices beneath an anchor'],
  [/^[-*] \*\*[^*]*\b(?:itself|also)\b a slice/im, 'how to tell an anchor that is itself a slice'],
];

// maskFences(): the same text with every fenced code block blanked to spaces. Line lengths and newlines
// are preserved, so every offset into the masked text is the same offset into the original. A `#` comment
// inside a fence is not a heading, and a heading search that treats it as one ends a section early —
// which reports a false RED for the elements below the fence, and a false GREEN for any store mechanism
// hiding there. An unterminated fence masks to end of file: the safe direction, because a section that
// runs long still carries its own content.
function maskFences(text) {
  let fence = null;
  return text
    .split('\n')
    .map((line) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (fence === null) {
        if (!marker) return line;
        fence = { char: marker[1][0], len: marker[1].length };
      } else if (marker && marker[1][0] === fence.char && marker[1].length >= fence.len) {
        fence = null;
      }
      return line.replace(/\S/g, ' ');
    })
    .join('\n');
}

// extractSection(): the text from a heading match (inclusive) up to (but excluding) the next heading of
// level ≤3, or to EOF if there is none. Shared by scanAnchorContract's element check and
// scanAfkSelectionNeutrality below, both of which isolate one section before scanning its body. Both the
// heading and the terminator are found in the masked text and sliced out of the original, so a fenced
// example neither starts a section nor ends one.
function extractSection(text, headingPattern) {
  const masked = maskFences(text);
  const start = masked.search(headingPattern);
  if (start === -1) return null;
  const rest = masked.slice(start);
  // Skip past the heading's own line (not just one character) before searching for the next one — a
  // one-character skip leaves a level-2 `##` heading truncated to `#`, which still matches `#{1,3}` and
  // self-matches as its own "next" heading, collapsing the section to nothing.
  const firstLineEnd = rest.indexOf('\n');
  const searchFrom = firstLineEnd === -1 ? rest.length : firstLineEnd + 1;
  const nextHeading = rest.slice(searchFrom).search(/^#{1,3}\s/m);
  const end = nextHeading === -1 ? text.length : start + searchFrom + nextHeading;
  return text.slice(start, end);
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
  // One epic row, not two. `\bepic\b` covers the local store's `00-epic-` filename as well as the
  // `epic` label, so a separate `/00-epic/` row would report the same sentence twice. It is
  // case-insensitive and unbackticked because the selection step is meant to name no epic at all —
  // backticks are typography, and "the epic issue" in plain prose is the same mechanism.
  [/\bepic\b/i, 'an epic — the `epic` label, or the local store\'s `00-epic-` filename'],
  // Any change type, not `feat` alone: a feature label leads with the type of its own work
  // (`references/scope-mode.md`), so pinning one type would let the selection step name `fix/` unnoticed.
  // Excluded structurally, not by an allowlist of literal path segments: a further `/`-delimited segment
  // right after the type — `docs/agents/x`, `docs/adr/x`, `docs/plans/<type>/` — means this is a path
  // being cited, not a feature label, so it passes. `feat/self-improvements` and `docs/plans-refactor`
  // have no such further segment, so both are caught as a change-type label prefix. A two-literal
  // allowlist (`agents/`, `plans\b`) caught the first but not the second — `plans\b` matches
  // `docs/plans-refactor` before its hyphen — and flagged an unrelated doc citation
  // (`docs/adr/0021-….md`) as a false positive.
  // Two measured properties of this structural exclusion are authoring traps. First, a bare path
  // citation with no trailing slash (`docs/plans`, `docs/agents`) has no further segment either, so it is
  // flagged as a prefix the same as a real label — this is why a selftest fixture below cites
  // `ls docs/plans/`, never a bare `docs/plans`. Second, the rule exempts `feat/<slug>/` and
  // `docs/plans/fix/<slug>/` too: a selection step naming the local store's path-rendered label is
  // structurally exempt from this row the same as a doc citation, and caught, if at all, only because
  // such prose usually also trips the `\bepic\b` row above.
  [
    /\b(feat|fix|refactor|docs|perf|test|build|ci|chore|style|revert)\/(?![^\s/]*\/)/m,
    'a change-type label prefix',
  ],
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

// An ADR with no `**Status:**` line reads as accepted whether it is or not. That is how ADR 0026 was
// documented as live while nothing implemented it, and it recurred on 0019/0020/0021 because nothing
// checked. The status is the one field that separates a decision the code honours from one still being
// argued, so it is asserted here rather than left to review. Capitalization is pinned too — a lowercase
// `accepted` sorts and greps apart from the rest for no reason.
const ADR_DIR = path.join('docs', 'adr');
const ADR_STATUSES = ['Accepted', 'Proposed', 'Superseded', 'Rejected'];
const ADR_STATUS_PATTERN = new RegExp(`^\\*\\*Status:\\*\\* (?:${ADR_STATUSES.join('|')})\\s*$`, 'm');

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

// The leading `---` fenced block, with its body captured. One literal, used by both readers below: a
// second copy of the same shape drifts from the first with nothing to catch it.
const FRONTMATTER_FENCE = /^---\n([\s\S]*?)\n---/;

// Frontmatter is the leading `---` fenced block; read it as lines rather than parsing YAML, since the
// hooks and scripts carry no dependencies. CRLF is normalised first, so a file authored on Windows is
// read rather than reported as having no frontmatter at all.
function frontmatter(text) {
  const match = text.replace(/\r\n/g, '\n').match(FRONTMATTER_FENCE);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = scalar(kv[2]);
  }
  return fields;
}

// stripFrontmatter() returns text with its leading `---`-fenced frontmatter block removed (CRLF
// normalised first, matching frontmatter()). Text with no frontmatter is returned unchanged. Contracts
// that must be met by the prose body run over this, so an `argument-hint` echo cannot satisfy one (e.g.
// `[--unattended]`, which names the argument but is not a standing answer in the body).
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

// A scope branch is `<type>/<scope>`, and `hooks/scope-prune.js` reads that type back off a merged branch
// to decide whether a run root may be deleted. The type set the prose lists and the set the hook matches
// are one fact in two syntaxes. A hook set narrower than the prose leaves a run root behind forever on
// the missing type — silent, because nothing reports a prune that never ran. A hook set wider than the
// prose prunes a live run's ledger off a branch superdev never cut.
const CHANGE_TYPE_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /`feat`, `fix`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `chore`,\s*`style`, `revert`/,
    'list the change types as `feat`, `fix`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `chore`, `style`, `revert` — the set `hooks/scope-prune.js` matches',
  ],
  [
    path.join('hooks', 'scope-prune.js'),
    /\^\(feat\|fix\|refactor\|docs\|perf\|test\|build\|ci\|chore\|style\|revert\)\$/,
    'keep matching the change type with `^(feat|fix|refactor|docs|perf|test|build|ci|chore|style|revert)$` — the set `references/scope-mode.md` lists',
  ],
  // The glossary restates the set for a reader, which makes it a third copy of one fact. It is the copy
  // most likely to drift, because nothing executes it and no other check reads it. `doc-writer` may
  // legitimately re-wrap this glossary line at any comma, so every separator tolerates a line break —
  // not just the one between `chore` and `style` where the line happens to wrap today — without
  // weakening what the row asserts: the same eleven types, in order.
  [
    'CONTEXT.md',
    /`feat`,\s*`fix`,\s*`refactor`,\s*`docs`,\s*`perf`,\s*`test`,\s*`build`,\s*`ci`,\s*`chore`,\s*`style`,\s*or\s+`revert`/,
    'list the same change types the **Change type** glossary entry names — the set `references/scope-mode.md` owns',
  ],
  // scope.js validates every `init` label against the same set, so it is a fourth copy — executable,
  // but still one fact that must not fork.
  [
    path.join('scripts', 'scope.js'),
    /'feat', 'fix', 'refactor', 'docs', 'perf', 'test', 'build', 'ci', 'chore', 'style', 'revert'/,
    'keep CHANGE_TYPES equal to the set `references/scope-mode.md` lists',
  ],
];

// `/superdev:implement` takes the feature label that names which planned feature to build, and derives
// the run's scope from it. Two documents carry that contract between them: implement.md declares the
// argument and resolves it, and plan.md hands off with the label resolved. A document that drops its half
// leaves a caller with no way to name its target — and `/superdev:afk`, which has no conversation to
// infer one from, then builds nothing. Neither half fails anything else, which is why this is asserted
// rather than trusted.
//
// What is asserted is the contract, never the label's shape (ADR 0019). The shape belongs to the active
// `docs/agents/issue-tracker.md`: a `<type>/<slug>` label on the issue-tracker seeds, a
// `docs/plans/<type>/<slug>/` directory on the local-file store. A pattern pinning one notation is red for
// a store that is perfectly
// well configured. The cost is real and accepted: a typo inside the prefix a given store does use passes
// here. The half whose loss actually costs a run — a caller with no way to name its target — is the half
// that stays pinned.
const FEATURE_ARG_CONTRACTS = [
  [
    path.join('commands', 'implement.md'),
    /^argument-hint:.*<(?:feature-)?label>/m,
    'declare an `argument-hint` naming a feature label',
  ],
  [path.join('commands', 'implement.md'), /\$ARGUMENTS/, 'resolve `$ARGUMENTS`'],
  [
    path.join('commands', 'plan.md'),
    /`\/superdev:implement\s+\S+`/,
    'name `/superdev:implement <label>` as the resolved successor, in a backtick-delimited invocation',
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

// A degraded pass is a step that did not get the assurance the chain promises: a dispatch the permission
// classifier denied, or a pass that could not reach what it needed. `scope-mode.md` defines it once,
// including the `**Degraded:**` ledger entry that carries it past the session that saw it. Every document
// that dispatches, or that reads the record, names the entry. A document that drops it degrades in
// silence — the pull request then claims a review that was the author reading their own work, which is
// exactly the assurance the entry exists to deny. Nothing else notices: the run is green, the prose is
// valid, and the shortfall lives only in a transcript nobody keeps.
const DEGRADED_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /^#{2,3}\s+Degraded passes\s*$/m,
    'carry the `## Degraded passes` section defining the rule for every document that reads it',
  ],
  ...[
    path.join('commands', 'implement.md'),
    path.join('commands', 'review.md'),
    path.join('commands', 'document.md'),
    path.join('commands', 'ship.md'),
    path.join('commands', 'status.md'),
    path.join('references', 'implement-full.md'),
    path.join('references', 'implement-lite.md'),
  ].map((rel) => [rel, /\*\*Degraded:\*\*/, 'name the `**Degraded:**` ledger entry']),
  // Naming the entry without pointing at the section that governs it leaves a reader with a token and no
  // rule: what counts as degraded, what to do attended, and what to do unattended all live in the section.
  // Anchored on the section's own name for the same reason `UNATTENDED_CONTRACTS` is — the documents
  // phrase the instruction several ways around one fixed noun.
  ...[
    path.join('commands', 'implement.md'),
    path.join('commands', 'review.md'),
    path.join('commands', 'document.md'),
    path.join('commands', 'ship.md'),
    path.join('commands', 'status.md'),
    path.join('references', 'implement-full.md'),
    path.join('references', 'implement-lite.md'),
  ].map((rel) => [rel, /`## Degraded passes`/, 'point at the `## Degraded passes` section, not merely the entry']),
];

// `final-reviewer` writes the acceptance criteria a feature ought to have before it opens the Definition
// of Done, so a criterion the plan interview never wrote still reaches the report (ADR 0020). Two
// documents carry that between them, and both halves are needed for the ordering to be real. A prompt
// arrives at once, so DoD text inlined in the dispatch is already read by the time any instruction asks
// for a derivation — `/superdev:review` therefore hands the *path*, and `final-reviewer` opens it late.
// Either half alone degrades the derivation into theater: references still resolve, the suite stays
// green, and the reviewer just reads the DoD first exactly as it did before.
const DERIVED_CRITERIA_CONTRACTS = [
  [
    path.join('commands', 'review.md'),
    /\*\*path\*\*\s+`<run-root>\/dod\.md`/,
    'hand `final-reviewer` the **path** `<run-root>/dod.md` in scope mode, never the DoD text inlined',
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /^##\s+Derive the criteria first\s*$/m,
    'carry the `## Derive the criteria first` step — the criteria are written before the DoD and the diff are read',
  ],
];

// A feature label is external input that becomes a branch name and a run-root path segment. Both of its
// segments reach `git switch -c`, so both are validated — the leading one against the closed change-type
// set, which is strictly stronger than a charset test on it. A rule that guards the slug alone lets a
// label of `--exec=foo/x` or `-x/y` through to git as an option, and lets a non-canonical type make
// `scope-prune` reap a run root that is still live, mistaking its unrecognised branch for gone. The
// consumers are pinned on the
// phrase `both segments`, not on `scope-slug rule` alone: the pre-change text already carried the latter
// for the slug-only rule, so pinning it would go green on a revert to that wording, or on a whole-file
// revert to the pre-change document, leaving that consumer's half of this contract unguarded.
const LABEL_VALIDATION_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /\*\*Validate both segments\.\*\*/,
    'carry the **Validate both segments.** rule — the leading segment against the change-type set, not the slug alone',
  ],
  ...[path.join('commands', 'implement.md'), path.join('commands', 'afk.md')].map((rel) => [
    rel,
    /both segments/,
    'point at `references/scope-mode.md`\'s both-segments validation before building a path or a branch out of a label',
  ]),
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

// green-gate re-runs the scope suite synchronously inside a PostToolUse hook, and a suite slower than
// the hook's timeout is killed mid-run — the gate then silently doesn't fire, exactly the failure it
// exists to prevent. `hooks/hooks.json` sets the green-gate entry's own `timeout` to 600s, and the
// comment beside `IS_MERGE` in `hooks/green-gate.js` names that same number, distinguishing it from
// Claude Code's own 60s default. A hooks.json entry that loses its `timeout` field falls back to that
// 60s default, and a comment that no longer names 600 documents a ceiling that no longer holds — either
// drift is silent everywhere else, because the suite stays green until a run happens to exceed 60s.
const GREEN_GATE_TIMEOUT_CONTRACTS = [
  [
    path.join('hooks', 'hooks.json'),
    // order-tolerant: `"timeout"` can precede or follow `"command"` in the entry. Forward direction uses
    // `[^}]*` (safe: command values contain `${CLAUDE_PLUGIN_ROOT}` braces but not a closing `}` until
    // entry end). Backward direction uses `(?:(?!"type")[\s\S]){0,160}` — matches any byte except the
    // start of `"type":`, which every entry has and appears before our targets in a real entry,
    // bounding backward at entry starts. This prevents a sibling entry's timeout from falsely matching.
    /(?:green-gate\.js\\"[^}]*"timeout":\s*600(?!\d)|"timeout":\s*600(?!\d)(?:(?!"type")[\s\S]){0,160}green-gate\.js\\")/,
    'set `"timeout": 600` on the green-gate PostToolUse(Bash) hook entry',
  ],
  [
    path.join('hooks', 'green-gate.js'),
    // `[\s\S]{0,20}` tolerates the comment's own line wrap (a `\n// ` between two words), the way
    // `CHANGE_TYPE_CONTRACTS` tolerates a wrap at a comma — a prose reflow must not itself go red.
    /600s `timeout` hooks\.json sets on this[\s\S]{0,20}hook's entry \(Claude Code's own default hook timeout is 60s\)/,
    "name the 600s timeout hooks.json sets on this hook's entry, not Claude Code's own 60s default",
  ],
];

// Run state is owned by scripts/scope.js (ADR 0022): every ledger write and read in the chain goes
// through its verbs, and the retired stage, scope-slug, ledger-branch, and ledger-schema contract rows
// live on as scope.js selftest assertions. What is left to drift is the wiring: a chain document that
// stops invoking its verb goes back to hand-editing or hand-parsing `ledger.md` — and the ledger-guard
// hook catches only tool calls at runtime, not prose that never issues one. Each row pins the verb a
// document must name; the pattern tolerates the `${CLAUDE_PLUGIN_ROOT}/scripts/` path prefix in front of
// `scope.js`.
const VERB_CONTRACTS = [
  [path.join('commands', 'implement.md'), /scope\.js["'`]?\s+init\b/, 'create the run root and ledger with `scope.js init`'],
  [path.join('commands', 'implement.md'), /scope\.js["'`]?\s+stage set merged\b/, 'record slice completion with `scope.js stage set merged`'],
  [path.join('commands', 'implement.md'), /scope\.js["'`]?\s+unresolved add\b/, 'record a give-up point with `scope.js unresolved add`'],
  [path.join('commands', 'implement.md'), /scope\.js["'`]?\s+unresolved clear\b/, 'clear a standing defect on Green with `scope.js unresolved clear`'],
  [path.join('commands', 'review.md'), /scope\.js["'`]?\s+stage set\b/, 'write its stage with `scope.js stage set`'],
  [path.join('commands', 'review.md'), /scope\.js["'`]?\s+get anchor\b/, 'read the scope anchor\'s title with `scope.js get anchor`'],
  [path.join('commands', 'review.md'), /scope\.js["'`]?\s+unresolved add\b/, 'record a give-up point with `scope.js unresolved add`'],
  [path.join('commands', 'review.md'), /scope\.js["'`]?\s+unresolved clear\b/, 'clear a standing defect on a clean verdict with `scope.js unresolved clear`'],
  [path.join('commands', 'document.md'), /scope\.js["'`]?\s+stage set\b/, 'write its stage with `scope.js stage set`'],
  [path.join('commands', 'ship.md'), /scope\.js["'`]?\s+get stage\b/, 'read the stage with `scope.js get stage`'],
  [path.join('commands', 'ship.md'), /scope\.js["'`]?\s+stage set shipped\b/, 'set the terminal stage with `scope.js stage set shipped`'],
  [path.join('commands', 'ship.md'), /scope\.js["'`]?\s+get unresolved\b/, 'read the unresolved-defect record with `scope.js get unresolved`, never through cwd-dependent `status`'],
  [path.join('commands', 'ship.md'), /scope\.js["'`]?\s+get degraded\b/, 'read the degrade record with `scope.js get degraded`, never through cwd-dependent `status`'],
  [path.join('commands', 'status.md'), /scope\.js["'`]?\s+status\b/, 'produce the report with `scope.js status` and print it verbatim'],
  [path.join('commands', 'afk.md'), /scope\.js["'`]?\s+get stage\b/, 'read a run\'s stage with `scope.js get stage`'],
  [path.join('references', 'implement-full.md'), /scope\.js["'`]?\s+slice\b/, 'move slice rows with `scope.js slice`'],
  [path.join('references', 'implement-lite.md'), /scope\.js["'`]?\s+slice\b/, 'move slice rows with `scope.js slice`'],
  [path.join('references', 'scope-mode.md'), /scope\.js["'`]?\s+degraded add\b/, 'write the degrade entry with `scope.js degraded add`'],
  [path.join('commands', 'publish-kb.md'), /scope\.js["'`]?\s+get branch\b/, 'read the scope branch with `scope.js get branch` for its merge check'],
];

// ADR 0023: a remote knowledge base is a reader-facing surface, and a page sent from an unmerged branch
// claims a feature no reader can reach. `/superdev:plan` and `/superdev:document` therefore write pages
// as staged pages, and `/superdev:publish-kb` is the only path to a backend.
//
// The invariant is prose in three documents, so it is guarded in two halves. Either half alone passes
// while the invariant is gone: a document can name the staging location and carry a REST call beside it,
// and a document can lose its call path along with the instruction that replaces it — leaving a
// knowledge-base pass that does nothing at all. The positive half rides `scanContract()`; the negative
// half needs its own scanner, because `scanContract()` asserts that a pattern *matches*.
const KB_STAGING_CONTRACTS = [
  [path.join('commands', 'plan.md'), /\.superdev\/kb-pending\//, 'stage the feature specification under `.superdev/kb-pending/` rather than sending it'],
  [path.join('commands', 'document.md'), /\.superdev\/kb-pending\//, 'hand the doc-writer a `.superdev/kb-pending/` staging path'],
  [path.join('agents', 'doc-writer.md'), /\.superdev\/kb-pending\//, 'write a remote backend\'s pages under `.superdev/kb-pending/`'],
];

// ADR 0025: `/superdev:review` in scope mode is the only full-suite run left in the chain. The
// controller runs the full command itself, before dispatching `final-reviewer`, so a dispatch the
// permission classifier denies is a degraded review rather than a lost verification. Losing either half
// silently reopens the gap ADR 0025 closed: a command that stops running the suite itself falls back to
// leaving that run to the subagent's optional re-run, and a reviewer that stops naming that optionality
// treats its own re-run as authoritative again. Two more rows guard the fail path itself, added on
// re-review: a `review.md` that stops folding a red full suite into the fix loop as a Critical finding
// lets a red gate pass through unfixed, and a `final-reviewer.md` that stops making `Full-suite run: fail`
// disqualifying on its own lets the other four axes argue a red suite back to "Yes". A fifth row guards
// the clause that actually blocks a red scope: a `review.md` that keeps the fail-is-Critical wording but
// drops "The stage does **not** advance while it stands" would still name the finding without holding up
// the handoff over it.
const FULL_SUITE_CONTRACTS = [
  [
    path.join('commands', 'review.md'),
    /run the full (?:test )?suite (?:itself|yourself)[\s\S]{0,60}before dispatching/i,
    'run the full suite itself, before dispatching `final-reviewer`, per ADR 0025',
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /own re-run[\s\S]{0,60}stays optional[\s\S]{0,80}never the scope's only full-suite run/i,
    "state that its own re-run stays optional and is never the scope's only full-suite run",
  ],
  [
    path.join('commands', 'review.md'),
    /a `?fail`?[\s\S]{0,20}is itself a Critical finding[\s\S]{0,60}fold it into the fix\s+loop/i,
    'state that a `fail` here is itself a Critical finding, folded into the fix loop',
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /`?Full-suite run:\s*fail`?\s+makes the verdict\s+`?Ready to merge\?\s*No`?/i,
    'state that `Full-suite run: fail` makes the verdict `Ready to merge? No` on its own',
  ],
  [
    path.join('commands', 'review.md'),
    /the stage does\s+\*\*not\*\*\s+advance while it stands/i,
    'state that the stage does **not** advance while a full-suite fail or Critical/Important finding stands',
  ],
  // A sixth row: `commands/implement.md`'s Final phase is the other end of ADR 0025. An all-`mechanical`
  // /`docs` scope has no whole-scope review to attach a suite run to, so that phase runs the scope's one
  // full suite in its place. It is the one full-suite run no row above covers, and it is load-bearing
  // twice over — the routing contract below sends such a scope past `/superdev:review` on the strength of
  // it. A Final phase that stops running the suite leaves that scope reaching a pull request with no
  // suite run behind it anywhere in the chain, while every other check here stays green.
  [
    path.join('commands', 'implement.md'),
    /attempts that scope's one full-suite run itself[\s\S]{0,60}in place of that review/i,
    "run the scope's one full-suite run itself, in place of the review an all-`mechanical`/`docs` scope skips",
  ],
];

// `/superdev:ship` §3 gates on a standing unresolved defect (ADR 0026): a defect the run left standing is
// named once, and shipping with it is asked about rather than assumed. A consumer that keeps the §5
// `## Unresolved defects` pull-request heading but drops either half of the gate reads right and ships a
// broken branch anyway — the exact failure shape the ask (attended) and the refuse (unattended) exist to
// prevent. Both halves live in one paragraph, §3's "Entries standing." bullet — but §3 also carries an
// unrelated, pre-existing gate (the missing-review/document warning) that uses the identical **ask once**
// and `--unattended` → refuse phrasing for a different question. A whole-file test is satisfied by that
// unrelated paragraph even after the entries-standing gate's own clause is deleted, so both halves are
// matched inside the "Entries standing." paragraph alone — extracted with the same `extractSection()`
// helper `scanAnchorContract()` uses, anchored on the paragraph's own bolded lead-in rather than a
// markdown heading, since the paragraph carries no heading of its own.
const SHIP_GATE_HEADING = /\*\*Entries standing\.\*\*/;
const SHIP_GATE_ELEMENTS = [
  [
    /\*\*ask once\*\*\s+whether\s+to\s+ship\s+with\s+it\s+standing/i,
    'ask once whether to ship with a standing unresolved defect',
  ],
  [/`--unattended`\s*→\s*refuse/i, 'refuse under `--unattended` when an unresolved defect stands'],
];

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
    text = fs.readFileSync(path.join(root, 'commands', 'ship.md'), 'utf8');
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

// CONTEXT.md's **Degraded pass** and **Unresolved defect** entries restate what
// `references/scope-mode.md`'s `## Degraded passes` and `## Unresolved defects` sections define, and the
// two records answer different questions: a degraded pass is never a failure of the code under review, an
// unresolved defect is exactly that (ADR 0026). This is the same third-copy risk `CHANGE_TYPE_CONTRACTS`
// guards — nothing executes the glossary, so it is the copy most likely to drift, and it did: this scope's
// own history shipped a `CONTEXT.md` that contradicted this reference for three fix cycles with the suite
// green throughout. Each fact is pinned once per document, in that document's own wording rather than one
// shared literal, because the reference and the glossary phrase it differently.
//
// The check is a verbatim canonical-clause match, the same shape every other contract in this file already
// is — a literal-phrase guard. What separates a correct sentence from a contradiction here is coreference
// (which subject a clause attributes to), and no character-window heuristic recovers that: it either
// over-fires on a correct document whose negation fronts a different clause, or misses a contradiction
// phrased the same way. A canonical clause long enough to carry the whole assertion sidesteps the question
// instead of answering it — negate the clause, reword it, or drop it, and the literal match fails.
const UNRESOLVED_GLOSSARY_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    'Neither shape is a failure of the code under review',
    "state that neither degraded-pass shape is a failure of the code under review — CONTEXT.md's Degraded pass entry must agree",
  ],
  [
    'CONTEXT.md',
    'the code under review did not fail',
    "state that the code under review did not fail — matching references/scope-mode.md's Degraded passes section",
  ],
  [
    path.join('references', 'scope-mode.md'),
    'this one says whether the branch is sound',
    "state that an unresolved defect answers whether the branch is sound — CONTEXT.md's Unresolved defect entry must agree",
  ],
  [
    'CONTEXT.md',
    'rather than whether the branch is sound',
    "state that an unresolved defect answers whether the branch is sound — matching references/scope-mode.md's Unresolved defects section",
  ],
];

// normalizeWhitespace() collapses every run of whitespace, including a line break, to a single space.
// CONTEXT.md and references/scope-mode.md are hard-wrapped, so a canonical clause can straddle a line
// break in the real document; normalizing both the clause and the document before comparing makes that
// wrap invisible to the match instead of a false gap.
function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ');
}

// scanUnresolvedGlossaryContract() is pure over a root dir: reads every document UNRESOLVED_GLOSSARY_CONTRACTS
// names and reports the rows whose canonical clause is not present verbatim, after whitespace normalization
// on both sides. Absent files are skipped, matching every other contract scanner.
function scanUnresolvedGlossaryContract(root) {
  const gaps = [];
  for (const [rel, clause, expectation] of UNRESOLVED_GLOSSARY_CONTRACTS) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // document absent (fixture / partial checkout) → nothing to scan
    }
    if (!normalizeWhitespace(text).includes(normalizeWhitespace(clause))) gaps.push({ source: rel, expectation });
  }
  return gaps;
}

// The documents that must reach no knowledge-base backend, and the markers that say one does.
// `/superdev:publish-kb` is deliberately absent from the document list: reaching the backend is its job.
//
// A marker built from a backend's literal endpoint or credential (`api/v2/pages`,
// `CONFLUENCE_API_TOKEN`) catches almost nothing: AGENTS.md's "Backends are pluggable" rule already
// forbids these documents from naming a backend at all, so that literal can only appear in a document
// that already breaks a different rule. What a real regression reads like instead is an instruction
// shape — a backend-directed verb aimed at a knowledge-base object — regardless of which backend or
// whether it names one at all. The pre-ADR-0023 doc-writer.md ("Publishing to a **KB/wiki** host…",
// "create pages only for genuinely new outline entries") is the reference case this is built to catch.
const KB_NO_CALL_DOCS = [
  path.join('commands', 'plan.md'),
  path.join('commands', 'document.md'),
  path.join('agents', 'doc-writer.md'),
];
const KB_OBJECT = 'pages?|wiki|space|backend';
const KB_BACKEND_CALL_MARKERS = [
  // "publish-kb" is the command name, not the verb — excluded so naming `/superdev:publish-kb` never
  // trips this on its own.
  [new RegExp(`\\bpublish(?!-kb)(?:es|ing)?\\b[^\\n]{0,25}?\\b(?:${KB_OBJECT})\\b`, 'i'), 'a "publish" instruction aimed at a knowledge-base object'],
  // `upsert` alone carries the backtick exclusion (?<!`)…(?!`), because `upsert` is also the staged
  // page's own `action` value and both writers cite it as a frontmatter literal beside the word "page".
  // The exclusion is scoped to that one verb: applied to the whole alternation it would exempt every
  // verb, and a backticked `create` — this guard's own reference case — would walk straight through.
  [new RegExp(`\\b(?:create(?:s|d)?(?:-or-update)?|update(?:s|d)?)\\b[^\\n]{0,25}?\\b(?:${KB_OBJECT})\\b` +
    `|(?<!\`)\\bupsert(?:s|ed|ing)?\\b(?!\`)[^\\n]{0,25}?\\b(?:${KB_OBJECT})\\b`, 'i'), 'a create-or-update instruction aimed at a knowledge-base object'],
  // Case-sensitive: an HTTP verb is uppercase in these docs' code samples, unlike the lowercase
  // `action: delete` frontmatter value staged pages carry.
  [new RegExp(`\\b(?:POST|PUT|DELETE)\\b[^\\n]{0,100}?\\b(?:${KB_OBJECT})\\b`), 'an HTTP call aimed at a knowledge-base object'],
];

// scanKbNoBackendCall() is pure over a root dir: reports every KB-backend call marker still carried by a
// document that must not reach one. Absent files are skipped, as everywhere else here.
function scanKbNoBackendCall(root) {
  const offenders = [];
  for (const rel of KB_NO_CALL_DOCS) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue; // document absent (fixture / partial checkout) → nothing to scan
    }
    for (const [pattern, what] of KB_BACKEND_CALL_MARKERS) {
      if (pattern.test(text)) offenders.push({ source: rel, expectation: `reach no knowledge-base backend — it still carries ${what}` });
    }
  }
  return offenders;
}

// ADR 0022: `scripts/scope.js` owns the ledger's schema, and since it exports `readLedgerHeader` that
// ownership means one implementation rather than one per consumer. `hooks/scope-prune.js` used to carry
// its own `**Name:**` regex, and it drifted on four axes while being hardened against defects on its
// delete path — every difference arrived as a well-intentioned local fix, and none travelled back.
//
// The primary guard against that drift restarting is the orphan test in `hooks/scope-prune.js
// --selftest` (`#reader-unavailable` and its shared-reader agreement vectors): it exercises the real
// reader against real input and fails the moment a hook stops using it. This regex is a fast literal-
// shape tripwire only, not a substitute — it looks for the ledger's header marker being *built as a
// pattern* — an escaped `**`, a short run, a colon, then an escaped `**` again — and a self-contained
// reader with no regex and no `require` (or one spelled `[*][*]`, `/\*{2}Stage:\*{2}/`,
// `line.startsWith('**Stage:**')`, `l.indexOf('**Branch:**') === 0`) walks straight past it. `\\+`
// rather than a fixed count because the escaping depends on the quoting: the regex reads `\*\*` inside a
// template literal or a single-quoted string as `\\*\\*` in the file. Do not harden the pattern to catch
// those — the orphan test already covers what it misses, in that hook. A second hook growing a reader
// of its own is covered by neither, and needs its own orphan test.
const HOOK_HEADER_REGEX = /\\+\*\\+\*[^\n]{0,60}:\\+\*\\+\*/;

function scanHookLedgerParsers(root) {
  const dir = path.join(root, 'hooks');
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

// ADR 0025: every run inside the TDD/inline loop is focused, and `references/test-selection.md` owns the
// rule that picks the focused command over the full one. Each loop consumer reads that file at runtime
// instead of restating the rule, so the wire is what can drift: a consumer can drop the read/apply
// instruction while the reference still resolves (scan() above stays green), which leaves the suite green
// and the narrowing silently gone in every dispatch — the same failure shape as the content-types and
// unattended-token contracts. Anchored on `Read … test-selection.md` **and** the substantive clause "run
// the command it selects" that follows it in every real document — `\s+` between each word tolerates the
// prose wrap, since the three real documents each wrap that phrase at a different word. A pattern anchored
// on the bare `Read … test-selection.md` mention alone (`CONTENT_TYPES_PATTERN`'s shape) would pass a
// document that keeps the reference in a passing aside but drops the instruction to run what it selects —
// the same anti-pattern `FULL_SUITE_CONTRACTS` avoids by anchoring on its own substantive clause.
const TEST_SELECTION_PATTERN =
  /Read\s+`?(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/test-selection\.md`?[\s\S]{0,60}?run\s+the\s+command\s+it\s+selects/;
const TEST_SELECTION_CONTRACTS = [
  [
    path.join('agents', 'implementer.md'),
    TEST_SELECTION_PATTERN,
    'read `references/test-selection.md` and run the command it selects for each RED→GREEN increment',
  ],
  [
    path.join('references', 'implement-lite.md'),
    TEST_SELECTION_PATTERN,
    'read `references/test-selection.md` and run the command it selects for the inline loop',
  ],
  [
    path.join('agents', 'slice-reviewer.md'),
    TEST_SELECTION_PATTERN,
    "read `references/test-selection.md` and run the command it selects for Lens 2's independent re-run",
  ],
];

// ADR 0025 again, one level up: an all-`mechanical`/`docs` scope skips `/superdev:review` by design, so
// `commands/implement.md`'s Final phase runs its one full suite instead (the sixth full-suite row above).
// Two documents have to agree about what that scope does next, and they agree only in prose.
// `commands/ship.md` drops `/superdev:review` from its missing-step warning for such a scope, and
// `commands/afk.md`'s stage table routes it past the review rather than into it. A table that keeps
// routing `merged` to the review strands the scope: `/superdev:review` has no Definition-of-Done judgment
// to make, `/superdev:ship --unattended` refuses a scope whose review never ran, and the sweep never
// finishes the feature. Both sides are pinned, because either alone reads correct while the pair
// disagrees. Each afk.md row also requires `--unattended` past the command name — a prose sentence that
// drops it strands an unattended sweep at an interactive question with nothing reported, the failure
// ADR 0015's token check exists to prevent, and this is prose the stage-table row scan
// (`scanAfkInvocations`) never reaches.
const AFK_ROUTING_CONTRACTS = [
  [
    path.join('commands', 'afk.md'),
    /no\s+row\s+reads\s+`?behavior`?[\s\S]{0,160}`?merged`?\s+routes\s+to\s+`?\/superdev:document[\s\S]{0,50}--unattended/i,
    'route an all-`mechanical`/`docs` scope from `merged` to `/superdev:document ... --unattended`, read ' +
      "off the ledger's slice types",
  ],
  [
    path.join('commands', 'afk.md'),
    /no\s+row\s+reads\s+`?behavior`?[\s\S]{0,200}`?documented-unreviewed`?\s+routes\s+to\s+`?\/superdev:ship[\s\S]{0,50}--unattended/i,
    'route that same all-`mechanical`/`docs` scope from `documented-unreviewed` to `/superdev:ship ... ' +
      '--unattended`, not back to the review — tied to the same condition as the `merged` row above, not ' +
      'every scope',
  ],
  [
    path.join('commands', 'ship.md'),
    /every slice in the ledger is\s+\*{0,2}`?mechanical`?[\s\S]{0,240}drop\s+`?\/superdev:review`?\s+from that warning/i,
    'drop `/superdev:review` from its missing-step warning for an all-`mechanical`/`docs` scope',
  ],
];

// Three hooks parse the same shell-word shape out of a Bash command line: `merge-guard` and `green-gate`
// to see past git's global options (`-C <path>`, `-c k=v`) to the verb, and `ledger-guard` to read a
// write target. The token is one regex source string, duplicated by hand in each file, and a quoted or
// backslash-escaped argument is exactly what it exists to keep whole — the bypass a narrower copy
// reopens is a guard that misses `git -C "my repo" merge`. Nothing links the three copies, so this pins
// the literal: the canonical source below must appear verbatim in all three. The same shape as the
// scope-slug charset assertion in `scripts/scope.js --selftest`, and deliberately strict — a genuine
// improvement to the token is meant to be applied to all three files and re-pinned here in one commit,
// not to drift into one hook and be discovered by a bypass.
const ARG_TOKEN_LINE = String.raw`const ARG = /(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/.source;`;
const ARG_TOKEN_PATTERN = new RegExp(ARG_TOKEN_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const ARG_TOKEN_EXPECTATION =
  'carry the canonical ARG shell-word token verbatim — all three hooks parse the same shape, and a copy that drifts reopens the quoted-argument bypass';
const ARG_TOKEN_CONTRACTS = [
  [path.join('hooks', 'merge-guard.js'), ARG_TOKEN_PATTERN, ARG_TOKEN_EXPECTATION],
  [path.join('hooks', 'green-gate.js'), ARG_TOKEN_PATTERN, ARG_TOKEN_EXPECTATION],
  [path.join('hooks', 'ledger-guard.js'), ARG_TOKEN_PATTERN, ARG_TOKEN_EXPECTATION],
];

// `## Audit set` is a three-document agreement, the same shape as AFK_ROUTING_CONTRACTS and
// ARG_TOKEN_CONTRACTS above: `/superdev:setup` writes the section, `/superdev:document` reads it back
// with a stated fallback for when it's absent, and `references/documentation.md` seeds it as the
// section `/setup` fills in. Nothing links the three documents, so a renamed heading or a dropped
// fallback clause leaves the suite green and the section unreachable — a section one document reads
// that no other document writes, the exact defect shape this file was already extended twice to catch,
// and the one that reached `main` unnoticed before.
const AUDIT_SET_CONTRACTS = [
  [
    path.join('commands', 'setup.md'),
    /Record it as the `?##\s*Audit set`?\s+section/i,
    "record decision C's answer as the `## Audit set` section of `docs/agents/documentation.md`",
  ],
  [
    path.join('commands', 'document.md'),
    /`?##\s*Audit set`?\s+section[\s\S]{0,250}optional[\s\S]{0,150}absent[\s\S]{0,150}default\s+tree/i,
    'read the `## Audit set` section and fall back to the default doc tree, noted in the report, when ' +
      'the section is absent',
  ],
  [
    path.join('references', 'documentation.md'),
    /##\s*Audit set[\s\S]{0,80}Optional/i,
    'seed the `## Audit set` section as optional, for `/superdev:setup` to fill in',
  ],
];

// ADR 0027's `patch` action is a four-document agreement of the same shape as the three above:
// `agents/doc-writer.md` and `commands/plan.md` — the two stagers — each stage one section for a
// page the outline marks aggregate, `commands/publish-kb.md` applies it through
// `scripts/kb-patch.js`, and `references/knowledge-base-confluence.md` documents the marker that
// decides which pages get one. Nothing links them. The failure that matters is not a dropped action
// name but a `publish-kb` that keeps the name and merges the page itself — the reader-facing page
// then gets rewritten by a model reading 25 KB of prose, which is the whole reason the merge is a
// script. So the publish-kb row is anchored on the call, not on the word `patch`; a document that
// names the action in passing and merges by hand still fails. Losing the marker row is the quietest
// of the four: the doc pass falls back to `upsert` and silently replaces an aggregate page with the
// one section it can see, which is the loss ADR 0027 exists to prevent and the state that left this
// repo's own `ADR summaries` page four decisions stale.
const AGGREGATE_PAGE_CONTRACTS = [
  [
    path.join('agents', 'doc-writer.md'),
    /aggregate[\s\S]{0,80}`?action:\s*patch`?[\s\S]{0,400}one\s+section/i,
    'stage `action: patch` carrying one section for an outline entry marked aggregate',
  ],
  [
    path.join('commands', 'plan.md'),
    /aggregate[\s\S]{0,80}`?action:\s*patch`?[\s\S]{0,400}one\s+section/i,
    'stage `action: patch` carrying one section for an outline entry marked aggregate',
  ],
  [
    path.join('commands', 'publish-kb.md'),
    /`?patch`?[\s\S]{0,600}scripts\/kb-patch\.js/i,
    'apply `patch` by merging through `scripts/kb-patch.js` rather than rewriting the page itself',
  ],
  [
    path.join('references', 'knowledge-base-confluence.md'),
    /\(aggregate\)[\s\S]{0,400}`?action:\s*patch`?/i,
    'document the `(aggregate)` outline marker and the `action: patch` it selects',
  ],
];

// ADR 0027's `patch` read is a two-document agreement, the same shape as AGGREGATE_PAGE_CONTRACTS above.
// `commands/publish-kb.md` reads the live body through the call the config document documents, and splits
// the outcome into **positive absence** — the find call does not list the title — which creates the
// page, and **any other outcome** — no documented read, a transport or authorisation failure, the read
// itself reporting the page absent (e.g. a 404) for a title the find call does list, or an empty body for
// a title the find call does list — which is a **read failure**, not absence, and must leave the file
// staged. The read identifier only ever exists for a title the find call already listed, so a 404 there
// is a read failure, never positive evidence of absence.
//
// What separates a document that still means this from one that no longer does is coreference and scope —
// which clause a trailing "instead of", "rather than", or a later sentence's "never mind that" reaches
// back to negate — the same wall `UNRESOLVED_GLOSSARY_CONTRACTS` hit first (see its comment above). A
// banned-token list scoped to a fixed character window is not a fix for that: there is always another
// negator, and a negation placed after the window closes never gets inspected at all. A keyword-order
// regex has the identical wall: a sentence that carries every keyword the regex looks for, in order, but
// asserts the call is never made (row 2's own RED fixture below) satisfies it just as wrongly. So both
// rows drop pattern-matching meaning and instead pin the sentence itself: a verbatim canonical clause,
// matched against the document after `normalizeWhitespace` on both sides (reused from
// `UNRESOLVED_GLOSSARY_CONTRACTS` below), so the real hard-wrapped document still matches. Reword the
// clause, negate it, or drop it, and the match fails identically — there is no separate "negated" case to
// special-case, and no new negator ever needs adding to a list. The trade-off is the one every row in this
// idiom carries: a legitimate rewording of the pinned sentence now fails this check too, until the pin is
// updated to match — deliberately, since a silent pass on a reworded safety sentence is the failure mode
// these rows exist to close. Neither pin proves the document still *means* the clause afterward: a
// document that carries a pin intact and then contradicts it in a later sentence, or an earlier one that
// frames or negates the whole clause, is out of reach of this check, exactly as it is for
// `UNRESOLVED_GLOSSARY_CONTRACTS` above — no positive-presence check catches such a contradiction, and neither row attempts to.
//
// Row 1 pins `READ_PATH_CLAUSE`, the read-failure consequence clause alone — the outcome ("read failure,
// not absence") and the three things to do about it: leave the file staged, report the reason in §5, and
// create nothing. It does not pin the antecedent that names the read-failure enumeration (no documented
// read, a transport/authorisation failure, an empty body for a listed title) or the positive-absence
// contrast that precedes it in the real document — a document could carry this exact clause verbatim
// while describing a different antecedent, and this row would not catch that. Row 1's expectation message
// states only what the pin covers, for the same reason.
//
// Row 2 is unrelated and conditional, not a bare pattern: a config document that marks no outline entry
// `(aggregate)` documents no read at all, and must not be required to — only a document that actually uses
// the marker owes the call it selects, or every consumer repo that never enabled the feature would fail
// this check. When the marker is present, row 2 pins `AGGREGATE_READ_CLAUSE`, the whole list item, from
// its bold label through the call and what it returns.
//
// A verbatim pin resists a negator prefixed onto the real sentence only if no negator can be inserted
// *inside* the pinned span — which requires the span to start at a sentence or list-item boundary, not
// mid-clause. `READ_PATH_CLAUSE` holds despite starting mid-sentence because its own first two words are
// "is a": the idiomatic negation of "X is a Y" inserts "not" between them ("is not a"), corrupting the
// pin's own opening rather than landing safely in front of it. A pin that instead opens on a bare verb
// (e.g. "returns …") has no such trap — "never returns …" leaves the verb and everything after it intact
// as a substring, so the pin survives verbatim and the check wrongly passes. `AGGREGATE_READ_CLAUSE`
// starts at the list item's bold label and carries the endpoint through to the verb, so the same "never
// returns" negation must corrupt text *inside* the span (between the endpoint and "returns") to take
// effect. The label-to-clause span also pins this repo's host in the endpoint URL, so a repo move forces
// a re-pin — accepted deliberately, in favour of one span over a two-part pin that would leave the
// trailing half open to the same bare-verb prefix attack this span closes.
const READ_PATH_CLAUSE =
  'is a **read failure, not absence**: leave the file staged, report the reason in §5, and create nothing.';
const AGGREGATE_READ_CLAUSE =
  "**Read a page's body:** `GET /api/v1/repos/bomret/superdev/wiki/page/<sub_url>` returns " +
  '`content_base64`, which decodes to the page markdown.';
const READ_PATH_CONTRACTS = [
  [
    path.join('commands', 'publish-kb.md'),
    { test: (text) => normalizeWhitespace(text).includes(normalizeWhitespace(READ_PATH_CLAUSE)) },
    'state, verbatim after whitespace normalization, that the outcome is a read failure, not absence: ' +
      'leave the file staged, report the reason in §5, and create nothing',
  ],
  [
    path.join('docs', 'agents', 'knowledge-base.md'),
    {
      test(text) {
        // ponytail: `(aggregate)` matches the marker anywhere in the document, so prose that merely
        // discusses the marker (with no outline entry actually carrying it) would wrongly owe a body-read
        // call. Left as-is: every real caller applies the marker to an outline entry, and tightening to
        // "attached to a list entry" risks missing a legitimate wrapped or reordered form. Revisit if a
        // false positive is ever seen in practice.
        if (!/\(aggregate\)/i.test(text)) return true; // no marker → no read is owed
        return normalizeWhitespace(text).includes(normalizeWhitespace(AGGREGATE_READ_CLAUSE));
      },
    },
    "state, verbatim after whitespace normalization, that reading a page's body calls " +
      '`GET /api/v1/repos/bomret/superdev/wiki/page/<sub_url>`, which returns `content_base64` decoding ' +
      'to the page markdown — the call an outline entry marked `(aggregate)` is read through ' +
      'before it is patched',
  ],
];

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
  const deadEnds = scanCommandRefs(root);
  const chainGaps = scanChainHandoff(root);
  const contractGaps = [
    ...scanContract(root, FEATURE_ARG_CONTRACTS),
    ...scanContract(root, UNATTENDED_CONTRACTS, { stripFrontmatterFirst: true }),
    ...scanAfkInvocations(root),
    ...scanContract(root, CHANGE_TYPE_CONTRACTS),
    ...scanContract(root, DEGRADED_CONTRACTS, { stripFrontmatterFirst: true }),
    ...scanContract(root, DERIVED_CRITERIA_CONTRACTS),
    ...scanContract(root, LABEL_VALIDATION_CONTRACTS),
    ...scanContract(root, GREEN_GATE_TIMEOUT_CONTRACTS),
    ...scanContract(root, VERB_CONTRACTS),
    ...scanContract(root, KB_STAGING_CONTRACTS),
    ...scanKbNoBackendCall(root),
    ...scanHookLedgerParsers(root),
    ...scanContract(root, TEST_SELECTION_CONTRACTS),
    ...scanContract(root, FULL_SUITE_CONTRACTS),
    ...scanShipGateContract(root),
    ...scanUnresolvedGlossaryContract(root),
    ...scanContract(root, AFK_ROUTING_CONTRACTS),
    ...scanContract(root, ARG_TOKEN_CONTRACTS),
    ...scanContract(root, AUDIT_SET_CONTRACTS),
    ...scanContract(root, AGGREGATE_PAGE_CONTRACTS),
    ...scanContract(root, READ_PATH_CONTRACTS),
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
  const adrGaps = scanAdrStatus(root);
  if (
    missing.length === 0 &&
    offenders.length === 0 &&
    gaps.length === 0 &&
    anchorGaps.length === 0 &&
    wsGaps.length === 0 &&
    ctGaps.length === 0 &&
    deadEnds.length === 0 &&
    chainGaps.length === 0 &&
    contractGaps.length === 0 &&
    shape.length === 0 &&
    adrGaps.length === 0
  ) {
    console.log(
      'drift-check ok: references resolve, run-root paths are absolute, assignee and anchor contracts ' +
        'carried, ' +
        'writing standard offered, content-type lens wired, commands resolve, ' +
        'chain hands off, change-type set matches the ' +
        'scope-prune hook and scope.js, feature-label argument and ' +
        'unattended token and degrade record carried, criteria derived before the DoD is read, ' +
        'both label segments validated, ' +
        "green-gate's hooks.json timeout matches its own comment, " +
        'every chain document invokes its scope.js verb, ' +
        'no hook parses a ledger header itself, ' +
        'knowledge-base pages are staged and no document but publish-kb reaches a backend, ' +
        'eval graders and scaffolds well-formed, ' +
        'every loop consumer reads test-selection.md, ' +
        "the scope review runs the full suite itself while final-reviewer's own re-run stays " +
        'optional, ' +
        'ship asks once and refuses unattended on a standing unresolved defect, ' +
        'the glossary agrees with scope-mode.md on which record covers a failure of the code ' +
        'under review, ' +
        'afk and ship agree on where an all-mechanical/docs scope goes next, ' +
        'the three Bash hooks carry the same ARG shell-word token, ' +
        'setup, document, and the documentation seed agree on the `## Audit set` section, ' +
        'both stagers, publish-kb, and the knowledge-base seed agree on the `patch` action, ' +
        'publish-kb separates a read failure from a genuinely absent page while a marked config ' +
        'document documents the call that returns the body, ' +
        'and every ADR states a status',
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
  for (const g of adrGaps) {
    console.error(
      `${g.source} states no status — expected \`**Status:** <${ADR_STATUSES.join(' | ')}>\` on its ` +
        `own line, so a decision nothing implements cannot read as one the code honours`,
    );
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

  // fixture where one reference cites another: the execution playbooks and scope-mode.md point at each
  // other, so a rename inside references/ dangles exactly like one in commands/ or agents/
  const tmp3b = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp3b, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(tmp3b, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(tmp3b, 'references'), { recursive: true });
  fs.writeFileSync(path.join(tmp3b, 'references', 'exists.md'), '# exists\n');
  fs.writeFileSync(
    path.join(tmp3b, 'references', 'playbook.md'),
    'Read ${CLAUDE_PLUGIN_ROOT}/references/exists.md and ${CLAUDE_PLUGIN_ROOT}/references/gone.md\n',
  );

  const missing3b = scan(tmp3b);
  assert.equal(missing3b.length, 1, 'scans references/ too, detecting one missing reference');
  assert.equal(missing3b[0].reference, 'references/gone.md', 'names the missing reference');
  assert.equal(
    missing3b[0].source,
    path.join('references', 'playbook.md'),
    'names the reference file that cites it',
  );

  // a mention carrying no references/ path component stays invisible — the citation form the prose uses
  // in passing ("per `scope-mode.md`") is not a pointer scan() can resolve, and flagging it wholesale
  // would bury the real dangling ones
  const tmp3c = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  fs.mkdirSync(path.join(tmp3c, 'references'), { recursive: true });
  fs.writeFileSync(path.join(tmp3c, 'references', 'playbook.md'), 'per `gone.md` — no path\n');

  assert.equal(scan(tmp3c).length, 0, 'a bare filename with no references/ component is not a reference');

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

  // --- scanAdrStatus: every ADR must state a status. An ADR with no status line reads as accepted
  // whether or not anything implements it, which is how a decision gets documented as live while the
  // code has none of it. ---

  const adrBody = (status) =>
    `# 0099 — A decision\n\n${status ? `**Status:** ${status}\n\n` : ''}## Context\n\nSomething.\n`;

  // positive: an ADR with no status line at all
  const adr1 = fixture({ 'docs/adr/0099-a-decision.md': adrBody(null) });
  const adrGaps1 = scanAdrStatus(adr1);
  assert.equal(adrGaps1.length, 1, 'flags an ADR that states no status');
  assert.equal(adrGaps1[0].source, path.join('docs', 'adr', '0099-a-decision.md'), 'names the ADR');

  // positive: a status outside the recognised set is not a status
  assert.equal(
    scanAdrStatus(fixture({ 'docs/adr/0099-a.md': adrBody('Draft') })).length,
    1,
    'an unrecognised status value is flagged',
  );

  // positive: capitalization is pinned — a lowercase value greps and sorts apart from the rest
  assert.equal(
    scanAdrStatus(fixture({ 'docs/adr/0099-a.md': adrBody('accepted') })).length,
    1,
    'a lowercase status value is flagged',
  );

  // positive: prose that merely mentions a status is not the line
  assert.equal(
    scanAdrStatus(
      fixture({ 'docs/adr/0099-a.md': '# 0099 — A\n\nThis ADR is Accepted in practice.\n' }),
    ).length,
    1,
    'a prose mention is not the status line',
  );

  // negative: each recognised value satisfies the check
  for (const status of ADR_STATUSES) {
    assert.equal(
      scanAdrStatus(fixture({ 'docs/adr/0099-a.md': adrBody(status) })).length,
      0,
      `\`${status}\` satisfies the contract`,
    );
  }

  // every offender is reported, not just the first
  const adrMany = fixture({
    'docs/adr/0098-a.md': adrBody(null),
    'docs/adr/0099-b.md': adrBody('Accepted'),
    'docs/adr/0100-c.md': adrBody('accepted'),
  });
  assert.deepEqual(
    scanAdrStatus(adrMany).map((g) => path.basename(g.source)),
    ['0098-a.md', '0100-c.md'],
    'both offenders reported, in filename order, and the compliant ADR is not',
  );

  // a non-markdown file in the ADR tree is not an ADR
  assert.equal(
    scanAdrStatus(fixture({ 'docs/adr/README.txt': 'no status here' })).length,
    0,
    'a non-markdown file is skipped',
  );

  // an absent ADR tree is skipped, so a fixture carries only the files it exercises
  assert.equal(scanAdrStatus(fixture({ 'README.md': '# repo\n' })).length, 0, 'absent ADR tree is skipped');

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

  // a `#` comment inside a fenced block is not a heading, so it must not end the section. Without
  // fence-awareness the elements below the fence are unseen and every one of them reports as missing.
  const anFenced = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      '- **Recognise one.** It carries no parent link.\n\n' +
      '```sh\n# list every candidate\ncurl -s "$API/issues?labels=$FEATURE"\n```\n\n' +
      '- **List the candidates.** Query per feature label and keep the roots.\n' +
      '- **List the slices beneath it.** The same query returns them.\n' +
      '- **Tell an anchor that is itself a slice.** It carries a test-applicability label.\n\n' +
      '## Assignee\n\nSomeone.\n',
  });
  assert.equal(scanAnchorContract(anFenced).length, 0, 'a fenced `#` comment does not end the section');

  // a fence closes only on a marker at least as long as the one that opened it (CommonMark). A shorter
  // inner fence of the same character must not close the outer one — closing early unmasks the `#`
  // comment below it, which then reads as a heading and truncates the section before the elements after it
  const anNestedFence = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      '- **Recognise one.** It carries no parent link.\n\n' +
      '````md\ncurl -s "$API/issues?labels=$FEATURE"\n```\n# comment inside the outer fence\n````\n\n' +
      '- **List the candidates.** Query per feature label and keep the roots.\n' +
      '- **List the slices beneath it.** The same query returns them.\n' +
      '- **Tell an anchor that is itself a slice.** It carries a test-applicability label.\n\n' +
      '## Assignee\n\nSomeone.\n',
  });
  assert.equal(
    scanAnchorContract(anNestedFence).length,
    0,
    'a shorter inner fence does not close a longer outer fence',
  );

  // the four elements stated only in intro prose, with no bullets, is not the contract: every pattern
  // matched anywhere in the section, so prose alone satisfied all four and finding #4 shipped twice over
  const anProse = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      'This section explains how to recognise an anchor, how to list the candidates, how to list the\n' +
      'slices beneath one, and how to tell an anchor that is itself a slice.\n',
  });
  assert.equal(scanAnchorContract(anProse).length, 4, 'intro prose with no bullets satisfies nothing');

  // the repo's writing standard declares American spelling, so the element patterns must accept it —
  // a document is not wrong for writing `recognize`, `under`, or `also a slice`
  const anAmerican = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      '- **Recognize one.** It carries no parent link.\n' +
      '- **List the candidates.** Query per feature label and keep the roots.\n' +
      '- **List the slices under it.** The same query returns them.\n' +
      '- **Tell an anchor that is also a slice.** It carries a test-applicability label.\n',
  });
  assert.equal(scanAnchorContract(anAmerican).length, 0, 'American spellings satisfy the contract');

  // `*` is CommonMark's other unordered-list marker; a document is not wrong for writing it instead of `-`
  const anStarBullets = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      '* **Recognise one.** It carries no parent link.\n' +
      '* **List the candidates.** Query per feature label and keep the roots.\n' +
      '* **List the slices beneath it.** The same query returns them.\n' +
      '* **Tell an anchor that is itself a slice.** It carries a test-applicability label.\n',
  });
  assert.equal(scanAnchorContract(anStarBullets).length, 0, '`*` bullets satisfy the contract');

  // a section that is the last in its file, one with an empty body, and a file whose fence is never
  // closed all extract without throwing — the fence masking runs over every one of them
  assert.equal(
    scanAnchorContract(fixture({ 'references/issue-tracker-acme.md': anchorSection })).length,
    0,
    'a section at EOF extracts',
  );
  assert.equal(
    scanAnchorContract(fixture({ 'references/issue-tracker-acme.md': '## Scope anchor\n' })).length,
    4,
    'an empty section extracts and reports every element',
  );
  assert.equal(
    scanAnchorContract(
      fixture({
        'references/issue-tracker-acme.md': `${anchorSection}\n\`\`\`sh\n# never closed\n`,
      }),
    ).length,
    0,
    'an unterminated fence does not throw',
  );

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
    // the local store's filename carries `epic`, so the one epic row reports it — a second `/00-epic/`
    // row would report the same sentence twice
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

  // a concrete label is a change-type prefix like any other. The two path strings this step legitimately
  // carries are excluded by name, so naming one real label no longer slips past as a path would.
  const concreteLabel = scanAfkSelectionNeutrality(
    fixture({
      'commands/afk.md': selection(
        `${neutral} Select the anchor labelled \`feat/self-improvements\`.`,
      ),
    }),
  );
  assert.equal(concreteLabel.length, 1, 'a concrete feature label is a change-type prefix');
  assert.match(concreteLabel[0].expectation, /change-type label prefix/, 'reports the prefix mechanism');

  // `docs/plans-refactor` is the string the two-literal allowlist this rule replaced let through —
  // `plans\b` matched it before its hyphen, since a word boundary sits there too. The structural rule
  // must still catch it: no further `/`-delimited segment follows `docs/`, so it reads as a label.
  const hyphenatedSlug = scanAfkSelectionNeutrality(
    fixture({
      'commands/afk.md': selection(`${neutral} Select the anchor labelled \`docs/plans-refactor\`.`),
    }),
  );
  assert.equal(hyphenatedSlug.length, 1, 'a hyphenated slug past the type is still a change-type prefix');
  assert.match(hyphenatedSlug[0].expectation, /change-type label prefix/, 'reports the prefix mechanism');

  // …while the store-config path the step is meant to point at, and the local store's plan root, both
  // pass — each carries a further `/`-delimited segment right after the type, so the structural rule
  // reads both as a path being cited rather than a feature label
  assert.equal(
    scanAfkSelectionNeutrality(
      fixture({
        'commands/afk.md': selection(
          'Read `docs/agents/issue-tracker.md`\'s `## Scope anchor` contract; a local store keeps plans under `docs/plans/`.',
        ),
      }),
    ).length,
    0,
    'the excluded path strings are not prefixes',
  );

  // an ADR citation is a doc pointer, not a label — `docs/adr/0021-….md` has the same further-segment
  // shape as `docs/agents/…`, so the structural rule passes it too. The two-literal allowlist this rule
  // replaced flagged it as a false "change-type label prefix".
  assert.equal(
    scanAfkSelectionNeutrality(
      fixture({
        'commands/afk.md': selection(
          `${neutral} See \`docs/adr/0021-change-type-branch.md\` for why.`,
        ),
      }),
    ).length,
    0,
    'an ADR citation is not a change-type label prefix',
  );

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

  // `epic` in plain prose is the same mechanism as a backticked one — the selection step is meant to
  // name no epic at all, so backticks must not be what decides it
  const plainEpic = scanAfkSelectionNeutrality(
    fixture({ 'commands/afk.md': selection(`${neutral} Take the epic issue.`) }),
  );
  assert.equal(plainEpic.length, 1, 'an unbackticked `epic` is still a mechanism');
  assert.match(plainEpic[0].expectation, /select without naming/, 'reports it as a mechanism');

  // a fenced `#` comment hides a mechanism from this scan — the worse direction of finding #143,
  // because this scanner is the only automated guard on the neutrality ADR 0017 requires
  assert.equal(
    scanAfkSelectionNeutrality(
      fixture({
        'commands/afk.md': selection(
          `${neutral}\n\n\`\`\`sh\n# candidates\nls docs/plans/\n\`\`\`\n\nTake the issue labelled \`epic\`.`,
        ),
      }),
    ).length,
    1,
    'a mechanism below a fenced `#` comment is still scanned',
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

  // a store whose feature label uses another notation satisfies the contract exactly as a slash-prefixed
  // one does. The label's shape belongs to the active slice-store document (ADR 0019), so pinning one
  // notation here would go red for a store that is perfectly well configured.
  const fa7 = fixture({
    'commands/implement.md':
      '---\nargument-hint: "[<feature-label>  (empty = the only plan in the store)]"\n---\n' +
      'Resolve `$ARGUMENTS` to one feature label, and derive the scope from it.\n',
    'commands/plan.md': 'Then run `/superdev:implement lite-perf` with the real label substituted.\n',
  });
  assert.equal(scanContract(fa7, FEATURE_ARG_CONTRACTS).length, 0, 'a prefixless label is clean');

  // an unbacktick-delimited mention of the command satisfies no invocation — plan.md's own `description:`
  // frontmatter says "Run before /superdev:implement." incidentally, and a reword that drops the trailing
  // period ("...to build it.") must not turn the row green with the real handoff deleted
  const fa8 = fixture({
    'commands/implement.md': takesLabel,
    'commands/plan.md': 'Run before /superdev:implement to build it.\n',
  });
  const faGaps8 = scanContract(fa8, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps8.length, 1, 'a bare prose mention is not a resolved handoff');
  assert.equal(faGaps8[0].source, path.join('commands', 'plan.md'), 'names plan.md');

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

  // FEATURE_ARG_CONTRACTS's first row needs the frontmatter itself (`^argument-hint:.*<(?:feature-)?label>`)
  // and never strips it — confirms the two contract tables can disagree on `stripFrontmatterFirst` safely
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

  // --- DEGRADED_CONTRACTS: scope-mode.md defines the degraded pass and its ledger entry, and every
  // document that dispatches or reads the record names it. A document that drops the wire lets a run
  // report a review it never independently got. ---

  const definesDegraded =
    '## Degraded passes\n\nA denied dispatch is one. Write a `**Degraded:**` line to the ledger.\n';
  const namesDegraded =
    'A denied dispatch → work inline and write the `**Degraded:**` entry, per `## Degraded passes`.\n';
  const everyConsumer = {
    'references/scope-mode.md': definesDegraded,
    'commands/implement.md': namesDegraded,
    'commands/review.md': namesDegraded,
    'commands/document.md': namesDegraded,
    'commands/ship.md': namesDegraded,
    'commands/status.md': namesDegraded,
    'references/implement-full.md': namesDegraded,
    'references/implement-lite.md': namesDegraded,
  };
  const degradedOpts = { stripFrontmatterFirst: true };

  // negative: every document carrying both halves is clean
  assert.equal(
    scanContract(fixture(everyConsumer), DEGRADED_CONTRACTS, degradedOpts).length,
    0,
    'every consumer carrying the wire yields zero gaps',
  );

  // positive: scope-mode.md mentions the entry but lost the section defining it, so what counts as
  // degraded — and what to do attended versus unattended — has nowhere to live
  const dg2 = fixture({
    ...everyConsumer,
    'references/scope-mode.md': 'Ledgers may carry a `**Degraded:**` line.\n',
  });
  const dgGaps2 = scanContract(dg2, DEGRADED_CONTRACTS, degradedOpts);
  assert.equal(dgGaps2.length, 1, 'an entry mention is not the section that defines it');
  assert.equal(dgGaps2[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive: each consumer is checked on its own, so one dropping the wire cannot hide behind its
  // siblings — the failure this guards is exactly one command going quiet
  for (const rel of [
    'commands/implement.md',
    'commands/review.md',
    'commands/document.md',
    'commands/ship.md',
    'commands/status.md',
    'references/implement-full.md',
    'references/implement-lite.md',
  ]) {
    const dropped = fixture({ ...everyConsumer, [rel]: '# doc\n\nNothing about degrading here.\n' });
    const gaps = scanContract(dropped, DEGRADED_CONTRACTS, degradedOpts);
    assert.equal(gaps.length, 2, `flags ${rel} on both rows when it drops everything`);
    assert.ok(gaps.every((g) => g.source === rel.split('/').join(path.sep)), `both gaps name ${rel}`);
  }

  // positive: the entry named with no pointer to the section leaves a reader a token and no rule
  const entryOnly = fixture({
    ...everyConsumer,
    'commands/ship.md': '# ship\n\nCopy any `**Degraded:**` bullet into the body.\n',
  });
  const entryOnlyGaps = scanContract(entryOnly, DEGRADED_CONTRACTS, degradedOpts);
  assert.equal(entryOnlyGaps.length, 1, 'flags the missing section pointer alone');
  assert.match(entryOnlyGaps[0].expectation, /point at the/, 'names the missing pointer');

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

  const realRoot = path.join(__dirname, '..');

  // --- CHANGE_TYPE_CONTRACTS: the change-type set the prose lists and the set the scope-prune hook
  // matches are the same fact in two syntaxes, in two files. ---

  assert.equal(
    scanContract(realRoot, CHANGE_TYPE_CONTRACTS).length,
    0,
    'the shipped scope-mode.md type list and scope-prune.js regex agree',
  );

  // positive from each side: dropping a type from either list alone is drift, and a run root left behind
  // for a type the hook stopped recognising is silent — no prune ever reports the one it skipped
  const type1 = fixture({
    'references/scope-mode.md': 'one of `feat`, `fix`, `refactor`, `docs`, `perf`, `test`.\n',
  });
  const typeGaps1 = scanContract(type1, CHANGE_TYPE_CONTRACTS);
  assert.equal(typeGaps1.length, 1, 'flags a prose list the hook no longer matches');
  assert.equal(typeGaps1[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  const type2 = fixture({
    'hooks/scope-prune.js': 'const CHANGE_TYPES = /^(feat|fix)$/;\n',
  });
  const typeGaps2 = scanContract(type2, CHANGE_TYPE_CONTRACTS);
  assert.equal(typeGaps2.length, 1, 'flags the hook narrowing away from the stated set');
  assert.equal(typeGaps2[0].source, path.join('hooks', 'scope-prune.js'), 'names scope-prune.js');

  // and from the glossary's side: nothing executes that copy, so only this row notices it drifting
  const type3 = fixture({
    'CONTEXT.md': '**Change type** — one of `feat`, `fix`, or `docs`.\n',
  });
  const typeGaps3 = scanContract(type3, CHANGE_TYPE_CONTRACTS);
  assert.equal(typeGaps3.length, 1, 'flags a glossary entry that drifted from the owned set');
  assert.equal(typeGaps3[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // negative: doc-writer may legitimately re-wrap the glossary line at a different comma than today's —
  // the same eleven types, in order, must stay clean regardless of where the line break falls
  const type4 = fixture({
    'CONTEXT.md':
      '**Change type** — one of `feat`, `fix`, `refactor`,\n`docs`, `perf`, `test`, `build`, `ci`,\n`chore`, `style`, or\n`revert`.\n',
  });
  assert.equal(
    scanContract(type4, CHANGE_TYPE_CONTRACTS).length,
    0,
    'a re-wrapped but correct glossary line stays clean',
  );

  // --- DERIVED_CRITERIA_CONTRACTS: the dispatch hands a path and the reviewer derives before reading.
  // Both halves are needed for the ordering to be real, and losing either one is silent. ---

  assert.equal(
    scanContract(realRoot, DERIVED_CRITERIA_CONTRACTS).length,
    0,
    'the shipped review.md dispatch and final-reviewer.md derivation step agree',
  );

  // positive: reverting the dispatch to inlining the DoD text is caught
  const dc1 = fixture({
    'commands/review.md': 'take `<run-root>/dod.md` as the `acceptance` for both reviewers.\n',
  });
  const dcGaps1 = scanContract(dc1, DERIVED_CRITERIA_CONTRACTS);
  assert.equal(dcGaps1.length, 1, 'flags a dispatch that inlines the DoD instead of handing its path');
  assert.equal(dcGaps1[0].source, path.join('commands', 'review.md'), 'names review.md');

  // positive from the reviewer's side: dropping the derivation step is the same drift
  const dc2 = fixture({
    'agents/final-reviewer.md': '## What to check\n\nFirst, the **gate**.\n',
  });
  const dcGaps2 = scanContract(dc2, DERIVED_CRITERIA_CONTRACTS);
  assert.equal(dcGaps2.length, 1, 'flags a reviewer that lost its derive-before-reading step');
  assert.equal(dcGaps2[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), DERIVED_CRITERIA_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- LABEL_VALIDATION_CONTRACTS: both segments of a feature label reach git, so both are validated,
  // and every command that builds a path or a branch out of one points at the rule. ---

  assert.equal(
    scanContract(realRoot, LABEL_VALIDATION_CONTRACTS).length,
    0,
    'the shipped rule validates both segments and both consumers point at it',
  );

  // positive: a rule that guards the slug alone leaves the type segment reaching `git switch -c`
  const lv1 = fixture({
    'references/scope-mode.md': 'validate the slug segment — what follows the first `/` — and not the label as a whole.\n',
  });
  const lvGaps1 = scanContract(lv1, LABEL_VALIDATION_CONTRACTS);
  assert.equal(lvGaps1.length, 1, 'flags a rule that stopped validating the leading segment');
  assert.equal(lvGaps1[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive from a consumer's side: a command that stopped pointing at the rule validates nothing
  const lv2 = fixture({ 'commands/afk.md': '# superdev afk\n\nSelect the next scope anchor.\n' });
  const lvGaps2 = scanContract(lv2, LABEL_VALIDATION_CONTRACTS);
  assert.equal(lvGaps2.length, 1, 'flags a consumer that dropped its wire to the rule');
  assert.equal(lvGaps2[0].source, path.join('commands', 'afk.md'), 'names afk.md');

  // positive, the weaker revert: a consumer that reverted to the pre-change slug-only wording keeps its
  // wire to `scope-mode.md`'s scope-slug rule intact but never asserts both segments are validated — the
  // exact text `commands/afk.md` carried before this scope, which a whole-file revert would restore
  const lv3 = fixture({
    'commands/afk.md':
      "**Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s scope-slug rule before you go on.**\n\n" +
      "- Its feature label matches that scope-slug rule. A label that fails it is skipped (below),\n",
  });
  const lvGaps3 = scanContract(lv3, LABEL_VALIDATION_CONTRACTS);
  assert.equal(lvGaps3.length, 1, 'flags a consumer reverted to slug-only wording, wire intact');
  assert.equal(lvGaps3[0].source, path.join('commands', 'afk.md'), 'names afk.md');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), LABEL_VALIDATION_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- GREEN_GATE_TIMEOUT_CONTRACTS: hooks.json's green-gate timeout and green-gate.js's own comment
  // name the same number, in two files. ---

  assert.equal(
    scanContract(realRoot, GREEN_GATE_TIMEOUT_CONTRACTS).length,
    0,
    'the shipped hooks.json timeout and green-gate.js comment agree',
  );

  // positive from the hooks.json side: a green-gate entry that lost its `timeout` field is drift — it
  // silently falls back to Claude Code's own 60s default
  const ggt1 = fixture({
    'hooks/hooks.json': '"command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js\\""\n',
  });
  const ggtGaps1 = scanContract(ggt1, GREEN_GATE_TIMEOUT_CONTRACTS);
  assert.equal(ggtGaps1.length, 1, 'flags a hooks.json entry that lost its `timeout`');
  assert.equal(ggtGaps1[0].source, path.join('hooks', 'hooks.json'), 'names hooks.json');

  // positive from the green-gate.js side: a comment that stops naming the 600s ceiling is the same drift
  const ggt2 = fixture({
    'hooks/green-gate.js': "// the suite runs inside the hook, under Claude Code's default hook timeout.\n",
  });
  const ggtGaps2 = scanContract(ggt2, GREEN_GATE_TIMEOUT_CONTRACTS);
  assert.equal(ggtGaps2.length, 1, 'flags a comment that stops naming the 600s timeout');
  assert.equal(ggtGaps2[0].source, path.join('hooks', 'green-gate.js'), 'names green-gate.js');

  // positive from the hooks.json side, numeric near-miss: `600` as a bare token must not match inside
  // `6000` — a hooks.json entry that drifted to 6s0000ms is still drift, not a false pass
  const ggt3 = fixture({
    'hooks/hooks.json':
      '"command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js\\"",\n"timeout": 6000\n',
  });
  const ggtGaps3 = scanContract(ggt3, GREEN_GATE_TIMEOUT_CONTRACTS);
  assert.equal(ggtGaps3.length, 1, 'flags a hooks.json `timeout` of 6000 as drift, not a 600 near-miss');
  assert.equal(ggtGaps3[0].source, path.join('hooks', 'hooks.json'), 'names hooks.json');

  // order-tolerant: `"timeout"` ahead of `"command"` in the entry is not drift
  const ggt4 = fixture({
    'hooks/hooks.json':
      '"timeout": 600,\n"command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js\\""\n',
  });
  assert.equal(
    scanContract(ggt4, GREEN_GATE_TIMEOUT_CONTRACTS).length,
    0,
    'a green-gate entry with `timeout` before `command` is not drift',
  );

  // prev-sibling false-pass: current pattern uses [\s\S]{0,120} backward window that reaches across
  // entry boundaries, falsely matching a PREVIOUS entry's timeout even if green-gate entry lacks one.
  // The corrected pattern bounds the backward direction on "type": to stop at entry starts.
  const ggtPrevSibling = fixture({
    'hooks/hooks.json':
      '"type": "command",\n' +
      '"timeout": 600,\n' +
      '"command": "node \\"some-hook.js\\""\n' +
      '},\n' +
      '{\n' +
      '"type": "command",\n' +
      '"command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js\\""\n',
  });
  const ggtGapsPrevSibling = scanContract(ggtPrevSibling, GREEN_GATE_TIMEOUT_CONTRACTS);
  assert.equal(
    ggtGapsPrevSibling.length,
    1,
    'prev-sibling: flags when green-gate entry lacks timeout despite previous entry having one',
  );
  assert.equal(ggtGapsPrevSibling[0].source, path.join('hooks', 'hooks.json'), 'names hooks.json');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), GREEN_GATE_TIMEOUT_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- VERB_CONTRACTS: every chain document invokes its scope.js verb (ADR 0022). A document that
  // drops its verb goes back to hand-editing or hand-parsing the ledger, and the ledger-guard hook only
  // sees tool calls at runtime, not prose. ---

  assert.equal(
    scanContract(realRoot, VERB_CONTRACTS).length,
    0,
    'every shipped chain document invokes its scope.js verb',
  );

  // positive: a status.md that renders the report itself instead of running the verb
  const vc1 = fixture({
    'commands/status.md': 'Read each ledger and print one block per scope.\n',
  });
  const vcGaps1 = scanContract(vc1, VERB_CONTRACTS);
  assert.equal(vcGaps1.length, 1, 'flags a chain document that stopped invoking its verb');
  assert.equal(vcGaps1[0].source, path.join('commands', 'status.md'), 'names status.md');

  // positive: naming scope.js without the verb is not enough — the pattern pins verb and argument
  const vc2 = fixture({
    'commands/document.md': 'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js` when done.\n',
  });
  const vcGaps2 = scanContract(vc2, VERB_CONTRACTS);
  assert.equal(vcGaps2.length, 1, 'a bare scope.js mention without the verb is still a gap');

  // negative: the full invocation with the plugin-root path prefix satisfies the row
  const vc3 = fixture({
    'commands/document.md': 'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js stage set documented --root <run-root>`.\n',
  });
  assert.equal(scanContract(vc3, VERB_CONTRACTS).length, 0, 'a full verb invocation is clean');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), VERB_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // positive: review.md and implement.md keep their other verbs but drop the `unresolved add`/
  // `unresolved clear` pair, going back to hand-editing or hand-parsing the ledger's `**Unresolved:**` line
  const uvReview = fixture({
    'commands/review.md':
      'Write its stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set reviewed --root <run-root>`. ' +
      'Read the anchor title with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get anchor --root <run-root>`.\n',
  });
  const uvReviewGaps = scanContract(uvReview, VERB_CONTRACTS);
  assert.equal(uvReviewGaps.length, 2, 'flags review.md for dropping both unresolved verbs');
  assert.ok(
    uvReviewGaps.every((g) => g.source === path.join('commands', 'review.md')),
    'both gaps name review.md',
  );

  const uvImplement = fixture({
    'commands/implement.md':
      'Create the run root with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init --root <run-root>`. ' +
      'Record slice completion with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set merged --root <run-root>`.\n',
  });
  const uvImplementGaps = scanContract(uvImplement, VERB_CONTRACTS);
  assert.equal(uvImplementGaps.length, 2, 'flags implement.md for dropping both unresolved verbs');
  assert.ok(
    uvImplementGaps.every((g) => g.source === path.join('commands', 'implement.md')),
    'both gaps name implement.md',
  );

  // negative: review.md carrying all four of its rows, including both unresolved verbs, is clean
  const uvClean = fixture({
    [path.join('commands', 'review.md')]:
      'Write its stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set reviewed --root <run-root>`. ' +
      'Read the anchor title with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get anchor --root <run-root>`. ' +
      'Write it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add "<text>" --root <run-root>`. ' +
      'On a clean verdict, `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root <run-root>`.\n',
  });
  assert.equal(
    scanContract(uvClean, VERB_CONTRACTS).length,
    0,
    'a review.md carrying all its verbs, including both unresolved ones, is clean',
  );

  // positive: ship.md drops the `scope.js get unresolved`/`get degraded` reads entirely, going back to
  // hand-reading the ledger (or the cwd-dependent `status`, which is the failure Important 2 closed)
  const shipNoStatus = fixture({
    'commands/ship.md': 'Ask whether anything stands, from memory of the review.\n',
  });
  const shipVerbGaps = scanContract(shipNoStatus, VERB_CONTRACTS);
  assert.ok(
    shipVerbGaps.some((g) => g.source === path.join('commands', 'ship.md')),
    'flags a ship.md that stopped reading the unresolved and degrade records through `scope.js get`',
  );

  // --- KB staging (ADR 0023): /superdev:plan and /superdev:document stage knowledge-base pages, and
  // /superdev:publish-kb is the only path to a remote backend. Two halves, checked separately, because
  // each passes on its own while the invariant is gone. ---

  assert.equal(
    scanContract(realRoot, KB_STAGING_CONTRACTS).length,
    0,
    'every shipped document that writes KB pages names the staging location',
  );
  assert.equal(
    scanKbNoBackendCall(realRoot).length,
    0,
    'no shipped document but publish-kb carries a KB backend call path',
  );

  // positive: a plan.md that seeds the page straight into the wiki again
  const kb1 = fixture({
    'commands/plan.md': 'Seed the feature specification into the KB outline.\n',
  });
  const kbGaps1 = scanContract(kb1, KB_STAGING_CONTRACTS);
  assert.equal(kbGaps1.length, 1, 'flags a document that stopped naming the staging location');
  assert.equal(kbGaps1[0].source, path.join('commands', 'plan.md'), 'names plan.md');

  // positive: the negative half fires on a restored call path even while the staging line is still there
  const kb2 = fixture({
    'agents/doc-writer.md':
      'Write each page under `.superdev/kb-pending/<scope>/`.\n' +
      'Then POST it to `/api/v1/repos/o/r/wiki/new` with `content_base64`.\n',
  });
  assert.equal(scanContract(kb2, KB_STAGING_CONTRACTS).length, 0, 'the staging half still passes');
  const kbGaps2 = scanKbNoBackendCall(kb2);
  assert.ok(kbGaps2.length >= 1, 'a restored wiki call path is caught even beside a staging instruction');
  assert.equal(kbGaps2[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');

  // negative: naming a credential's env var alone, with no verb aimed at an object, is not a call — the
  // hygiene rule that permits illustrative env-var names in docs would otherwise conflict with this check
  const kb3 = fixture({
    'commands/document.md':
      'Stage under `.superdev/kb-pending/<scope>/`. The credential env var is `$CONFLUENCE_API_TOKEN`.\n',
  });
  assert.equal(scanKbNoBackendCall(kb3).length, 0, 'naming a credential env var alone is not a call');

  // negative: publish-kb itself carries the endpoints and is deliberately not scanned
  const kb4 = fixture({
    'commands/publish-kb.md': 'POST `/wiki/new` with `content_base64`, or PUT `<base>/api/v2/pages`.\n',
  });
  assert.equal(scanKbNoBackendCall(kb4).length, 0, 'publish-kb may reach the backend — that is its job');

  // positive: the pre-ADR-0023 doc-writer.md text — the literal state this feature replaced — reads as
  // a real regression: "publish"/"create" verbs each aimed at a page/wiki object, with no backend-specific
  // literal anywhere. A marker built from literals alone would pass this clean.
  const kb5 = fixture({
    'agents/doc-writer.md':
      'Publishing to a **KB/wiki** host via its API is not integration and is allowed.\n' +
      "Software backend (e.g. Confluence): find the existing page and update it (don't duplicate); " +
      'create pages only for genuinely new outline entries.\n',
  });
  assert.ok(scanKbNoBackendCall(kb5).length >= 1, 'the pre-ADR-0023 doc-writer.md text reads as a regression');

  // positive: a plain "publish the page" instruction, no endpoint or credential in sight
  const kb6 = fixture({
    'commands/document.md': 'Publish each page to the backend, following docs/agents/knowledge-base.md.\n',
  });
  assert.ok(scanKbNoBackendCall(kb6).length >= 1, 'a "publish each page" instruction is caught');

  // positive: a generic POST to a pages endpoint, with no backend-specific literal at all
  const kb7 = fixture({
    'agents/doc-writer.md': 'curl -X POST -H "Authorization: token $GITEA_TOKEN" "$KB_BASE/pages"\n',
  });
  assert.ok(scanKbNoBackendCall(kb7).length >= 1, 'a generic POST-to-pages call is caught with no backend literal');

  // negative: pointing the reader at /superdev:publish-kb, or explaining what it does, merely mentions
  // publishing — it is not itself a call
  const kb8 = fixture({
    'commands/document.md':
      'A staged page waits until a human runs `/superdev:publish-kb`, once the feature reaches its readers.\n',
  });
  assert.equal(scanKbNoBackendCall(kb8).length, 0, 'pointing the reader at /superdev:publish-kb is not a call');

  // positive: "upsert" is this feature's own vocabulary for a create-or-update backend call — the verb
  // alternation must catch it, not just "create"/"update"
  const kb9 = fixture({
    'commands/document.md': 'Upsert each page at the backend.\n',
  });
  assert.ok(scanKbNoBackendCall(kb9).length >= 1, 'an "upsert" instruction aimed at a knowledge-base object is caught');

  // absent files are skipped, matching every other scanner here
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), KB_STAGING_CONTRACTS).length,
    0,
    'absent files are skipped (staging half)',
  );
  assert.equal(
    scanKbNoBackendCall(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'absent files are skipped (no-call half)',
  );

  // --- scanHookLedgerParsers: no hook carries a ledger-header regex of its own (ADR 0022) ---

  assert.equal(
    scanHookLedgerParsers(realRoot).length,
    0,
    'no shipped hook builds its own ledger-header pattern',
  );

  // The exact line this scope deleted from hooks/scope-prune.js, in both quotings it appears in.
  for (const [label, src] of [
    ['a template literal', 'const m = text.match(new RegExp(`\\\\*\\\\*${name}:\\\\*\\\\*[^\\\\S\\\\n]*(\\\\S+)`));'],
    ['a single-quoted string', "const re = new RegExp('^\\\\*\\\\*' + name + ':\\\\*\\\\*\\\\s*(.*)$');"],
  ]) {
    const gaps = scanHookLedgerParsers(fixture({ 'hooks/rogue.js': src }));
    assert.equal(gaps.length, 1, `flags a hook parsing a header with ${label}`);
    assert.equal(gaps[0].source, path.join('hooks', 'rogue.js'), 'names the hook');
  }

  // A hook that reads through the shared export is clean, and so is ordinary hook code that happens to
  // mention a header in prose — the check looks for the marker being built as a pattern, not named.
  assert.equal(
    scanHookLedgerParsers(fixture({
      'hooks/good.js':
        "const { readLedgerHeader } = require('../scripts/scope.js');\n" +
        "// reads the ledger's **Stage:** line through scope.js\n",
    })).length,
    0,
    'a hook using the shared reader, and naming a header in prose, is clean',
  );

  assert.equal(scanHookLedgerParsers(fixture({ 'README.md': '# repo\n' })).length, 0, 'no hooks dir is skipped');

  // --- TEST_SELECTION_CONTRACTS: the TDD loop, the inline loop, and Lens 2's independent re-run each
  // read references/test-selection.md rather than restating the focused-command rule (ADR 0025). scan()
  // above would stay green if one dropped the read/apply instruction while the reference file itself
  // still exists — this is the wire, not the reference. ---

  assert.equal(
    scanContract(realRoot, TEST_SELECTION_CONTRACTS).length,
    0,
    'the repo as it stands wires all three loop consumers to test-selection.md',
  );

  for (const rel of [
    path.join('agents', 'implementer.md'),
    path.join('references', 'implement-lite.md'),
    path.join('agents', 'slice-reviewer.md'),
  ]) {
    const dropped = fixture({ [rel]: '# doc\n\nRuns its own test command, no reference to speak of.\n' });
    const tsGaps = scanContract(dropped, TEST_SELECTION_CONTRACTS);
    assert.equal(tsGaps.length, 1, `flags ${rel} for dropping the test-selection reference`);
    assert.equal(tsGaps[0].source, rel, `names ${rel} as the offender`);
  }

  // positive: a document that keeps the reference but drops the "run the command it selects" clause
  // still passes today unless the pattern is anchored on that clause too — a bare mention of the file
  // is not the wire, the run instruction is
  const readOnly = fixture({
    [path.join('agents', 'implementer.md')]:
      'Read `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` for the rule, then run whatever you like.\n',
  });
  const readOnlyGaps = scanContract(readOnly, [TEST_SELECTION_CONTRACTS[0]]);
  assert.equal(
    readOnlyGaps.length,
    1,
    'flags a document that reads the reference but drops the run-the-selected-command instruction',
  );

  // positive: either read form — the ${CLAUDE_PLUGIN_ROOT} macro or bare prose — satisfies the wire
  const wired1 = fixture({
    [path.join('agents', 'implementer.md')]:
      'Read `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run the command it selects.\n',
  });
  assert.equal(
    scanContract(wired1, [TEST_SELECTION_CONTRACTS[0]]).length,
    0,
    'the ${CLAUDE_PLUGIN_ROOT} macro form satisfies the wire',
  );
  const wired2 = fixture({
    [path.join('references', 'implement-lite.md')]:
      'Read references/test-selection.md and run the command it selects.\n',
  });
  assert.equal(
    scanContract(wired2, [TEST_SELECTION_CONTRACTS[1]]).length,
    0,
    'the bare-prose form satisfies the wire',
  );

  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), TEST_SELECTION_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- FULL_SUITE_CONTRACTS: /superdev:review in scope mode is the only full-suite run left in the
  // chain (ADR 0025) — the controller runs it itself, before dispatching final-reviewer, and
  // final-reviewer names its own re-run as optional and never the scope's only full-suite run. ---

  assert.equal(
    scanContract(realRoot, FULL_SUITE_CONTRACTS).length,
    0,
    'the shipped review command and final-reviewer both carry the ADR 0025 wiring',
  );

  // positive: review.md drops the controller-run full suite and goes back to just handing over the command
  const fs1 = fixture({
    'commands/review.md': 'Read `docs/agents/verification.md` for the test command and pass it to final-reviewer.\n',
  });
  const fsGaps1 = scanContract(fs1, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps1.length, 3, 'flags a review.md missing all three of its rows: the controller-run suite, fail-is-Critical, and stage-not-advance');
  assert.ok(
    fsGaps1.every((g) => g.source === path.join('commands', 'review.md')),
    'all three gaps name review.md',
  );

  // positive: final-reviewer.md drops the optionality clause and reads like the run is its own again
  const fs2 = fixture({
    'agents/final-reviewer.md': 'Re-run the suite over the range to confirm green before you write your verdict.\n',
  });
  const fsGaps2 = scanContract(fs2, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps2.length, 2, 'flags a final-reviewer.md that stopped naming its re-run as optional, and its missing fail-means-No row');
  assert.ok(
    fsGaps2.every((g) => g.source === path.join('agents', 'final-reviewer.md')),
    'both gaps name final-reviewer.md',
  );

  // positive: review.md drops the failing-suite-is-Critical rule and the stage-not-advance rule
  const fs4 = fixture({
    'commands/review.md': 'Run the full suite yourself, before dispatching `final-reviewer`.\n',
  });
  const fsGaps4 = scanContract(fs4, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps4.length, 2, 'flags a review.md missing the failing-suite-is-Critical rule and the stage-not-advance rule');
  assert.ok(
    fsGaps4.every((g) => g.source === path.join('commands', 'review.md')),
    'both gaps name review.md',
  );

  // positive: final-reviewer.md drops the fail-means-No rule
  const fs5 = fixture({
    'agents/final-reviewer.md':
      "Your own re-run here stays optional and is never the scope's only full-suite run.\n",
  });
  const fsGaps5 = scanContract(fs5, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps5.length, 1, 'flags a final-reviewer.md that drops the fail-means-No rule');
  assert.equal(fsGaps5[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  // positive: review.md keeps the fail-is-Critical wording but drops the clause that actually blocks the
  // handoff — the anti-pattern the acceptance criteria for this row names directly
  const fs6 = fixture({
    'commands/review.md':
      "Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a " +
      'Critical finding — fold it into the fix loop below.\n',
  });
  const fsGaps6 = scanContract(fs6, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps6.length, 1, 'flags a review.md that names the finding but drops the stage-not-advance clause');
  assert.equal(fsGaps6[0].source, path.join('commands', 'review.md'), 'names review.md');

  // positive: implement.md's Final phase stops running the scope's one full suite itself — the row that
  // covers an all-`mechanical`/`docs` scope, which has no whole-scope review to attach a run to
  const fs7 = fixture({
    'commands/implement.md': 'Set the stage to `merged`, then print the next command.\n',
  });
  const fsGaps7 = scanContract(fs7, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps7.length, 1, "flags an implement.md whose Final phase runs no full suite of its own");
  assert.equal(fsGaps7[0].source, path.join('commands', 'implement.md'), 'names implement.md');

  // negative: that same sixth row carried
  assert.equal(
    scanContract(
      fixture({
        'commands/implement.md':
          "This phase attempts that scope's one full-suite run itself, once, in place of that review.\n",
      }),
      FULL_SUITE_CONTRACTS,
    ).length,
    0,
    'an implement.md carrying the Final-phase full-suite run yields no gap',
  );

  // negative: all six rows carried
  const fs3 = fixture({
    'commands/review.md':
      "Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a " +
      'Critical finding — fold it into the fix loop below. The stage does **not** advance while it ' +
      'stands.\n',
    'agents/final-reviewer.md':
      "Your own re-run here stays optional and is never the scope's only full-suite run. `Full-suite " +
      'run: fail` makes the verdict `Ready to merge? No`.\n',
  });
  assert.equal(scanContract(fs3, FULL_SUITE_CONTRACTS).length, 0, 'all six rows carried yields zero gaps');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), FULL_SUITE_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- AFK_ROUTING_CONTRACTS: an all-`mechanical`/`docs` scope skips the whole-scope review by design,
  // so afk's stage table routes it past `/superdev:review` and ship drops the review from its own
  // missing-step warning. Either document alone reads correct while the pair disagrees, so both are
  // pinned. ---

  assert.equal(
    scanContract(realRoot, AFK_ROUTING_CONTRACTS).length,
    0,
    'the shipped afk.md and ship.md agree on where an all-mechanical/docs scope goes next',
  );

  // positive: afk.md keeps the stage table but never reads the slice types — the shape that strands such
  // a scope in a review it skips, which is the defect this contract exists to catch
  const afkR1 = fixture({
    'commands/afk.md':
      '| `merged` | `/superdev:review <BASE>..<feature-label> --unattended` |\n' +
      '| `documented-unreviewed` | `/superdev:review <BASE>..<feature-label> --unattended` |\n',
  });
  const afkGaps1 = scanContract(afkR1, AFK_ROUTING_CONTRACTS);
  assert.equal(afkGaps1.length, 2, 'flags an afk.md that routes both stages into the review unconditionally');
  assert.ok(
    afkGaps1.every((g) => g.source === path.join('commands', 'afk.md')),
    'both gaps name afk.md',
  );

  // positive: afk.md carries the `merged` half but sends `documented-unreviewed` back to the review — the
  // half-fix that still cannot finish a sweep, since ship refuses a scope whose review never ran
  const afkGaps2 = scanContract(
    fixture({
      'commands/afk.md':
        'When no row reads `behavior`, `merged` routes to `/superdev:document <BASE>..<feature-label> ' +
        '--unattended`.\n`documented-unreviewed` routes to `/superdev:review` as always.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(afkGaps2.length, 1, 'flags an afk.md that fixes only the `merged` row');
  assert.equal(afkGaps2[0].source, path.join('commands', 'afk.md'), 'names afk.md');

  // positive (RED reproduction): the real exception paragraph with both `--unattended` tokens stripped —
  // prose the stage-table row scan never reaches, so nothing else in this file would have caught it
  const afkGapsNoToken = scanContract(
    fixture({
      'commands/afk.md':
        'When no row reads `behavior`, `merged` routes to `/superdev:document <BASE>..<feature-label>` ' +
        'and `documented-unreviewed` routes to `/superdev:ship <scope>`, in place of the two review rows ' +
        'above.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(afkGapsNoToken.length, 2, 'flags both rows when `--unattended` is stripped from each');
  assert.ok(
    afkGapsNoToken.every((g) => g.source === path.join('commands', 'afk.md')),
    'both gaps name afk.md',
  );

  // positive: ship.md drops its own half — the other side of the same agreement
  const afkGaps3 = scanContract(
    fixture({
      'commands/ship.md':
        'Name exactly what has not run (`/superdev:review`, `/superdev:document`, or both) and ask once.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(afkGaps3.length, 1, "flags a ship.md that stopped exempting an all-mechanical/docs scope");
  assert.equal(afkGaps3[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  // negative: both documents carry their halves, hard-wrapped the way the real prose is
  assert.equal(
    scanContract(
      fixture({
        'commands/afk.md':
          'Read each slice\'s `type`. When no\nrow reads `behavior`, `merged` routes to\n' +
          '`/superdev:document <BASE>..<feature-label> --unattended` and `documented-unreviewed` routes ' +
          'to\n`/superdev:ship <scope> --unattended`.\n',
        'commands/ship.md':
          '- **Every slice in the ledger is `mechanical` or `docs`** (the fourth, `type` field of\n' +
          '  `scope.js get slices`) → drop `/superdev:review` from that warning.\n',
      }),
      AFK_ROUTING_CONTRACTS,
    ).length,
    0,
    'both halves carried, across a line wrap, yields zero gaps',
  );

  // positive (RED reproduction, MINOR 7): `documented-unreviewed` routes to ship unconditionally, for
  // every scope, with no all-mechanical/docs condition anywhere nearby — the shape row 1 alone used to
  // pass, which would ship a behavior scope's `documented-unreviewed` anchor straight past the review it
  // still needs. Tying row 1 to the same condition as row 0 catches it.
  const afkGapsUnconditional = scanContract(
    fixture({
      'commands/afk.md':
        'Every `documented-unreviewed` scope routes straight to `/superdev:ship <scope> --unattended`, no ' +
        'matter what its slices are.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(
    afkGapsUnconditional.length,
    2,
    'flags both the missing merged-routing condition and the unconditional ship route — an afk.md that ' +
      'routes every scope from `documented-unreviewed` to ship, not just the all-mechanical/docs one, must ' +
      'fail row 1 too',
  );
  assert.ok(
    afkGapsUnconditional.every((g) => g.source === path.join('commands', 'afk.md')),
    'both gaps name afk.md',
  );

  // --- ARG_TOKEN_CONTRACTS: merge-guard, green-gate, and ledger-guard each parse the same shell-word
  // shape out of a Bash command line, by hand. A copy that drifts reopens the quoted-argument bypass. ---

  assert.equal(
    scanContract(realRoot, ARG_TOKEN_CONTRACTS).length,
    0,
    'all three shipped hooks carry the canonical ARG token verbatim',
  );

  // positive: one hook narrows its copy back to a bare `\S+` — the pre-fix shape, which stops at the
  // first space inside a quoted path and lets `git -C "my repo" merge` past the guard
  const argGaps1 = scanContract(
    fixture({ 'hooks/merge-guard.js': 'const ARG = /\\S+/.source;\n' }),
    ARG_TOKEN_CONTRACTS,
  );
  assert.equal(argGaps1.length, 1, 'flags a hook whose ARG token narrowed');
  assert.equal(argGaps1[0].source, path.join('hooks', 'merge-guard.js'), 'names the hook that drifted');

  // positive: a subtler drift — the single-quote alternative loses its `+`, so the token matches one
  // character where it used to match a run. Every other character of the line is unchanged.
  assert.equal(
    scanContract(
      fixture({
        'hooks/green-gate.js': ARG_TOKEN_LINE.replace("'[^']*')+", "'[^']*')") + '\n',
      }),
      ARG_TOKEN_CONTRACTS,
    ).length,
    1,
    'flags a one-character drift in the token',
  );

  // negative: the canonical line, carried verbatim in all three
  assert.equal(
    scanContract(
      fixture({
        'hooks/merge-guard.js': '// leading comment\n' + ARG_TOKEN_LINE + '\n',
        'hooks/green-gate.js': ARG_TOKEN_LINE + '\nconst IS_MERGE = null;\n',
        'hooks/ledger-guard.js': ARG_TOKEN_LINE + '\n',
      }),
      ARG_TOKEN_CONTRACTS,
    ).length,
    0,
    'the canonical token in all three yields zero gaps',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), ARG_TOKEN_CONTRACTS).length +
      scanContract(fixture({ 'README.md': '# repo\n' }), AFK_ROUTING_CONTRACTS).length,
    0,
    'absent files are skipped by both new tables',
  );

  // --- AUDIT_SET_CONTRACTS: `/superdev:setup` writes the `## Audit set` section, `/superdev:document`
  // reads it back with a stated fallback, and `references/documentation.md` seeds it — three documents
  // agreeing in prose only. ---

  assert.equal(
    scanContract(realRoot, AUDIT_SET_CONTRACTS).length,
    0,
    'the shipped setup.md, document.md, and documentation.md carry all three audit-set clauses',
  );

  // positive: setup.md drops the write instruction — decision C's answer would go nowhere
  const auditGaps1 = scanContract(
    fixture({ 'commands/setup.md': 'Ask which docs sit outside the default tree the audit reads.\n' }),
    AUDIT_SET_CONTRACTS,
  );
  assert.equal(auditGaps1.length, 1, 'flags a setup.md that stops recording the `## Audit set` section');
  assert.equal(auditGaps1[0].source, path.join('commands', 'setup.md'), 'names setup.md');

  // positive: document.md keeps the heading but drops its own fallback clause — the shape that reads
  // fine on its own and only breaks in a repo whose documentation.md carries no such section
  const auditGaps2 = scanContract(
    fixture({
      'commands/document.md':
        'Build the audit set: the default doc tree plus any globs listed under a `## Audit set` section ' +
        'in `docs/agents/documentation.md`.\n',
    }),
    AUDIT_SET_CONTRACTS,
  );
  assert.equal(auditGaps2.length, 1, "flags a document.md that drops the absent-section fallback clause");
  assert.equal(auditGaps2[0].source, path.join('commands', 'document.md'), 'names document.md');

  // positive: the documentation seed loses the section entirely
  const auditGaps3 = scanContract(
    fixture({ 'references/documentation.md': '## Writing standard\n\ncontrolled\n' }),
    AUDIT_SET_CONTRACTS,
  );
  assert.equal(auditGaps3.length, 1, 'flags a documentation.md seed that carries no `## Audit set` section');
  assert.equal(auditGaps3[0].source, path.join('references', 'documentation.md'), 'names documentation.md');

  // negative: all three carried, hard-wrapped the way the real prose is
  assert.equal(
    scanContract(
      fixture({
        'commands/setup.md':
          'Record it as the `## Audit set` section of `docs/agents/documentation.md`, one repo-relative\n' +
          'glob per bullet.\n',
        'commands/document.md':
          'plus any globs listed under a `## Audit set`\nsection in `docs/agents/documentation.md`. That ' +
          "section is optional — if it's absent, use the default\ntree alone and say so in the report.\n",
        'references/documentation.md': '## Audit set\n\nOptional. Reads a default tree plus every glob ' +
          'listed here.\n',
      }),
      AUDIT_SET_CONTRACTS,
    ).length,
    0,
    'all three halves carried, across a line wrap, yields zero gaps',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), AGGREGATE_PAGE_CONTRACTS).length +
      scanContract(fixture({ 'README.md': '# repo\n' }), AUDIT_SET_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- AGGREGATE_PAGE_CONTRACTS: doc-writer stages one section for a marked page, publish-kb merges it
  // through the script, and the KB seed documents the marker that decides which pages get one (ADR
  // 0027). ---

  assert.equal(
    scanContract(realRoot, AGGREGATE_PAGE_CONTRACTS).length,
    0,
    'the shipped doc-writer, publish-kb, and Confluence seed all carry their half of the patch agreement',
  );

  // positive: doc-writer goes back to staging whole pages only — the state that leaves an aggregate
  // page replaceable by the one section a scope can see
  const aggGaps1 = scanContract(
    fixture({
      'agents/doc-writer.md':
        'Write each page as a **staged page**: frontmatter carrying `title` and an `action` of `upsert` ' +
        'or `delete`, the page body below.\n',
    }),
    AGGREGATE_PAGE_CONTRACTS,
  );
  assert.equal(aggGaps1.length, 1, 'flags a doc-writer that stages no patch for an aggregate page');
  assert.equal(aggGaps1[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');

  // positive: the same gap, reachable through the other stager — `/superdev:plan` seeds ADR summaries
  // into the outline too (ADR 0027, CONTEXT.md's Staged page entry), so it needs the same branch.
  const aggGapsPlan = scanContract(
    fixture({
      'commands/plan.md':
        'Write each page as a **staged page**: frontmatter carrying `title` and an `action` of `upsert`, ' +
        'the page body below.\n',
    }),
    AGGREGATE_PAGE_CONTRACTS,
  );
  assert.equal(aggGapsPlan.length, 1, 'flags a plan.md that stages no patch for an aggregate page');
  assert.equal(aggGapsPlan[0].source, path.join('commands', 'plan.md'), 'names plan.md');

  // positive: publish-kb keeps the action and merges the page itself. This is the row's whole point —
  // a document that names `patch` in passing but rewrites the live page by hand puts a model back in
  // charge of a reader-facing page, which is what moving the merge into a script prevented.
  const aggGaps2 = scanContract(
    fixture({
      'commands/publish-kb.md':
        '- **`patch`** → fetch the live page under `title`, splice the staged section into it, and send ' +
        'the result back under the same title.\n',
    }),
    AGGREGATE_PAGE_CONTRACTS,
  );
  assert.equal(aggGaps2.length, 1, 'flags a publish-kb that names `patch` but merges the page itself');
  assert.equal(aggGaps2[0].source, path.join('commands', 'publish-kb.md'), 'names publish-kb.md');

  // positive: the seed loses the marker. The quietest of the three — every other document still reads
  // correct, and the doc pass simply never marks a page, so it silently stages `upsert` forever.
  const aggGaps3 = scanContract(
    fixture({
      'references/knowledge-base-confluence.md':
        '## Audience, language & outline\n\n- **Outline** — a top-level page per audience.\n',
    }),
    AGGREGATE_PAGE_CONTRACTS,
  );
  assert.equal(aggGaps3.length, 1, 'flags a seed that documents no `(aggregate)` marker');
  assert.equal(
    aggGaps3[0].source,
    path.join('references', 'knowledge-base-confluence.md'),
    'names the Confluence seed',
  );

  // negative: all four carried, hard-wrapped the way the real prose is
  assert.equal(
    scanContract(
      fixture({
        'agents/doc-writer.md':
          'An outline entry marked `aggregate` takes `action: patch` instead (ADR 0027). Such a page\n' +
          'collects a section from each of many scopes, so stage **one section**, not the page.\n',
        'commands/plan.md':
          'An outline entry marked `aggregate` takes `action: patch` instead (ADR 0027): stage **one\n' +
          'section**, not the page.\n',
        'commands/publish-kb.md':
          '- **`patch`** → the staged body is one section. Fetch the live page, then merge with\n' +
          '`node "${CLAUDE_PLUGIN_ROOT}/scripts/kb-patch.js" <live-page> <staged-file>`.\n',
        'references/knowledge-base-confluence.md':
          '- `Developer Docs` → `ADR summaries` **(aggregate)**\n\n`(aggregate)` marks a page many\n' +
          'scopes contribute to. The doc pass stages one section for it, as `action: patch`.\n',
      }),
      AGGREGATE_PAGE_CONTRACTS,
    ).length,
    0,
    'all four halves carried, across a line wrap, yields zero gaps',
  );

  // --- READ_PATH_CONTRACTS: publish-kb.md separates a read failure from a genuinely absent page, and a
  // config document that marks `(aggregate)` documents the call that returns the body (ADR 0027). ---

  assert.equal(
    scanContract(realRoot, READ_PATH_CONTRACTS).length,
    0,
    'the shipped publish-kb.md and knowledge-base.md carry both halves of the read-path agreement',
  );

  // positive (RED reproduction): publish-kb mentions reading the live page, but creates it on *any*
  // missing body instead of separating a read failure from a genuinely absent page — the exact shape a
  // keyword search for "read" would wrongly pass
  const rpGaps1 = scanContract(
    fixture({
      'commands/publish-kb.md':
        "- **`patch`** → Read the live page's body through the call the config document documents. If " +
        'the body is missing, treat the page as absent and create it from the staged section.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps1.length, 1, 'flags a publish-kb that creates the page on any missing body');
  assert.equal(rpGaps1[0].source, path.join('commands', 'publish-kb.md'), 'names publish-kb.md');

  // positive: a config document marks an outline entry `(aggregate)` but documents no call returning the
  // page body — the doc pass would stage a patch with no read to check it against
  const rpGaps2 = scanContract(
    fixture({
      'docs/agents/knowledge-base.md':
        '## Outline\n\n- **Concepts** — slice store, code host. **(aggregate)** — one section per ' +
        'concept.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps2.length, 1, 'flags a config doc that marks `(aggregate)` but documents no read');
  assert.equal(
    rpGaps2[0].source,
    path.join('docs', 'agents', 'knowledge-base.md'),
    'names knowledge-base.md',
  );

  // positive (RED reproduction): every keyword a keyword-order regex looks for — "read", "page's body",
  // "returns", "content"/"markdown" — present, in order, but the sentence asserts the call is never made.
  // A keyword-order regex with no negation awareness passes this; only a verbatim pin of the real clause
  // catches it, the same class row 1 closed for `commands/publish-kb.md`.
  const rpGaps2b = scanContract(
    fixture({
      'docs/agents/knowledge-base.md':
        "- **Concepts** **(aggregate)**\n\nNever read a page's body before it returns the merged " +
        'content; that call is never made.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps2b.length, 1, 'flags a knowledge-base.md that asserts the body read is never made');
  assert.equal(
    rpGaps2b[0].source,
    path.join('docs', 'agents', 'knowledge-base.md'),
    'names knowledge-base.md',
  );

  // positive (RED reproduction): the label and clause are both present, in order, but "never" is
  // prefixed onto the bare verb "returns" — the exact defect a pin starting at "returns" let through
  // verbatim, since a negator prefixed before a pin's own first word leaves the rest of the pin, and so
  // the whole substring, intact. Pinning from the list item's bold label through the endpoint traps the
  // insertion point inside the span instead.
  const rpGaps7 = scanContract(
    fixture({
      'docs/agents/knowledge-base.md':
        '- **Concepts** **(aggregate)**\n\n' +
        "- **Read a page's body:** `GET /api/v1/repos/bomret/superdev/wiki/page/<sub_url>` never returns\n" +
        '  `content_base64`, which decodes to the page markdown.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps7.length, 1, 'flags a knowledge-base.md that negates the read call with a "never" prefix');
  assert.equal(
    rpGaps7[0].source,
    path.join('docs', 'agents', 'knowledge-base.md'),
    'names knowledge-base.md',
  );

  // positive (RED reproduction): every required phrase present, in order, but the terminal instruction
  // itself is negated — "never leave the file staged ... anyway" — the half a bare keyword search for
  // "read failure" and "leave the file staged" would wrongly pass, since both substrings are still there
  const rpGaps3 = scanContract(
    fixture({
      'commands/publish-kb.md':
        "**Positive absence only** — the config document's find call does not list the title — means " +
        'the page does not exist yet: the staged section becomes the new page, as an `upsert` of the ' +
        'section alone. **Any other outcome** — the config document names no read for this backend, the ' +
        'read call fails for any other reason, or it returns an empty body for a title the find call ' +
        'does list — is a **read failure, not absence**: never leave the file staged, and create the ' +
        'page from the section anyway.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps3.length, 1, 'flags a publish-kb that negates the terminal "leave the file staged"');
  assert.equal(rpGaps3[0].source, path.join('commands', 'publish-kb.md'), 'names publish-kb.md');

  // positive (RED reproduction): an unlisted negator ("rather than") sits inside the character window the
  // old five-token banned list scanned — proof widening that list is a losing game, not a fix for it
  const rpGaps4 = scanContract(
    fixture({
      'commands/publish-kb.md':
        'Any other outcome is a **read failure, not absence**: create the page from the section rather ' +
        'than leave the file staged.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps4.length, 1, 'flags an unlisted negator ("rather than") inside the old window');
  assert.equal(rpGaps4[0].source, path.join('commands', 'publish-kb.md'), 'names publish-kb.md');

  // positive (RED reproduction): a second unlisted negator ("instead of") — same shape as rpGaps4
  const rpGaps5 = scanContract(
    fixture({
      'commands/publish-kb.md':
        'Any other outcome is a **read failure, not absence**: create the page from the section instead ' +
        'of leave the file staged.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps5.length, 1, 'flags an unlisted negator ("instead of") inside the old window');
  assert.equal(rpGaps5[0].source, path.join('commands', 'publish-kb.md'), 'names publish-kb.md');

  // positive (RED reproduction): the clause is cut short before "report the reason in §5, and create
  // nothing" — a truncated clause is not the pinned clause, whatever follows it. This is not a proof that
  // the row catches the trailing "Just kidding" contradiction: the clause here is already incomplete
  // before that sentence starts, so the gap traces to the truncation, not to what follows it (a trailing
  // contradiction after the *complete* clause is out of reach of this check — see the comment above
  // READ_PATH_CONTRACTS).
  const rpGaps6 = scanContract(
    fixture({
      'commands/publish-kb.md':
        'Any other outcome is a **read failure, not absence**: leave the file staged. Just kidding, ' +
        'never do that — create the page anyway.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps6.length, 1, 'flags a publish-kb whose clause is truncated before "report the reason in §5"');
  assert.equal(rpGaps6[0].source, path.join('commands', 'publish-kb.md'), 'names publish-kb.md');

  // negative: a config document with no `(aggregate)` marker at all owes no read — the requirement is
  // conditional on the marker, or every consumer repo that never enabled the feature would fail
  assert.equal(
    scanContract(
      fixture({
        'docs/agents/knowledge-base.md': '## Outline\n\n- **Overview** — what the plugin is.\n',
      }),
      READ_PATH_CONTRACTS,
    ).length,
    0,
    'a config document with no `(aggregate)` marker documents no read and yields zero gaps',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), READ_PATH_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // negative: both halves carried
  assert.equal(
    scanContract(
      fixture({
        'commands/publish-kb.md':
          "**Positive absence only** — the config document's find call does not list the title — means " +
          'the page does not exist yet: the staged section becomes the new page, as an `upsert` of the ' +
          'section alone. **Any other outcome** — the config document names no read for this backend, the ' +
          'read call fails for any other reason, or it returns an empty body for a title the find call ' +
          'does list — is a **read failure, not absence**: leave the file staged, report the reason in ' +
          '§5, and create nothing.\n',
        'docs/agents/knowledge-base.md':
          "- **Concepts** **(aggregate)**\n\n- **Read a page's body:** " +
          '`GET /api/v1/repos/bomret/superdev/wiki/page/<sub_url>` returns `content_base64`, which ' +
          'decodes to the page markdown.\n',
      }),
      READ_PATH_CONTRACTS,
    ).length,
    0,
    'both halves carried yields zero gaps',
  );

  // --- SHIP_GATE_ELEMENTS: /superdev:ship §3 gates on a standing unresolved defect — asked about once
  // attended, refused under --unattended (ADR 0026). §3 also carries an unrelated, pre-existing gate (the
  // missing-review/document warning) that uses the identical **ask once** and `--unattended` → refuse
  // phrasing for a different question. Every fixture below carries that unrelated gate too, so a scanner
  // that tested the whole file instead of the "Entries standing." paragraph alone would wrongly pass. ---

  const SHIP_UNRELATED_GATE =
    '## 3. Stage gate\n\n' +
    'Name what has not run and **ask once** whether to ship anyway. Declined → stop. Confirmed → ' +
    'proceed. **`--unattended` → refuse**: name what is missing, open no pull request, and stop.\n\n';

  assert.equal(
    scanShipGateContract(realRoot).length,
    0,
    'the shipped ship.md carries both the ask-once and refuse-unattended halves in its own Entries ' +
      'standing paragraph',
  );

  // positive (RED reproduction): the entries-standing paragraph drops its own ask-once clause, while the
  // unrelated stage gate above it still carries an "ask once" phrase for a different question — a
  // whole-file test is satisfied by that unrelated phrase and misses the drop
  const sg1 = fixture({
    'commands/ship.md':
      SHIP_UNRELATED_GATE +
      '**Entries standing.** Name every bullet. Declined → stop. Confirmed → proceed. **`--unattended` → ' +
      'refuse**: name what stands, open no pull request, and stop.\n\n' +
      '## 4. Definition of Done\n',
  });
  const sgGaps1 = scanShipGateContract(sg1);
  assert.equal(
    sgGaps1.length,
    1,
    'flags a ship.md whose entries-standing paragraph drops the ask-once clause, even with the unrelated ' +
      'stage gate above it still carrying one',
  );
  assert.equal(sgGaps1[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  // positive (RED reproduction, the reviewer's exact case): the entries-standing paragraph drops its own
  // unattended-refuse clause, while the unrelated stage gate above it still carries the identical
  // `--unattended` → refuse phrase — the whole-file test used to pass wrongly here
  const sg2 = fixture({
    'commands/ship.md':
      SHIP_UNRELATED_GATE +
      '**Entries standing.** Name every bullet and **ask once** whether to ship with it standing. ' +
      'Declined → stop. Confirmed → proceed.\n\n' +
      '## 4. Definition of Done\n',
  });
  const sgGaps2 = scanShipGateContract(sg2);
  assert.equal(
    sgGaps2.length,
    1,
    'flags a ship.md whose entries-standing paragraph drops the unattended-refuse clause, even with the ' +
      'unrelated stage gate above it still carrying the identical phrase',
  );
  assert.equal(sgGaps2[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  // negative: both halves carried in the entries-standing paragraph itself
  const sg3 = fixture({
    'commands/ship.md':
      SHIP_UNRELATED_GATE +
      '**Entries standing.** Name every bullet and **ask once** whether to ship with it standing. ' +
      'Declined → stop. Confirmed → proceed. **`--unattended` → refuse**: name what stands, open no ' +
      'pull request, and stop.\n\n' +
      '## 4. Definition of Done\n',
  });
  assert.equal(
    scanShipGateContract(sg3).length,
    0,
    'both gate halves carried in the entries-standing paragraph itself yields zero gaps',
  );

  // positive: no entries-standing paragraph at all
  const sg4 = fixture({ 'commands/ship.md': SHIP_UNRELATED_GATE + '## 4. Definition of Done\n' });
  const sgGaps4 = scanShipGateContract(sg4);
  assert.equal(sgGaps4.length, 1, 'flags a ship.md with no entries-standing paragraph at all');
  assert.equal(sgGaps4[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  // absent files are skipped, matching every other contract scanner
  assert.equal(
    scanShipGateContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'absent files are skipped',
  );

  // --- UNRESOLVED_GLOSSARY_CONTRACTS: CONTEXT.md's Degraded pass and Unresolved defect entries agree
  // with references/scope-mode.md about which record covers a failure of the code under review (ADR
  // 0026) — the fact this scope's own history let drift for three fix cycles with the suite green. ---

  assert.equal(
    scanUnresolvedGlossaryContract(realRoot).length,
    0,
    'CONTEXT.md and scope-mode.md agree on which record covers a failure of the code under review',
  );

  // positive: scope-mode.md drops the degraded-pass disclaimer CONTEXT.md's Degraded pass entry restates,
  // while keeping its Unresolved-defects half (verbatim) so only the dropped row is flagged
  const ug1 = fixture({
    'references/scope-mode.md':
      'A degraded pass is a step that did not get the assurance the chain promises.\n\n' +
      'Distinct from a Degraded pass — this one says whether the branch is sound.\n',
  });
  const ugGaps1 = scanUnresolvedGlossaryContract(ug1);
  assert.equal(ugGaps1.length, 1, "flags scope-mode.md for dropping the degraded-pass disclaimer");
  assert.equal(ugGaps1[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive: CONTEXT.md's Degraded pass entry drops the disclaimer scope-mode.md states, while keeping
  // its Unresolved defect half verbatim
  const ug2 = fixture({
    'CONTEXT.md':
      '**Degraded pass** — a step of the chain that did not get the assurance it promises.\n\n' +
      '**Unresolved defect** — distinct from a Degraded pass, which says how much of the chain ran, ' +
      'rather than whether the branch is sound (ADR 0026).\n',
  });
  const ugGaps2 = scanUnresolvedGlossaryContract(ug2);
  assert.equal(ugGaps2.length, 1, "flags CONTEXT.md for dropping the degraded-pass disclaimer");
  assert.equal(ugGaps2[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // positive: scope-mode.md's Unresolved defects section drops the branch-soundness clause, while keeping
  // its Degraded-passes half verbatim
  const ug3 = fixture({
    'references/scope-mode.md':
      'Neither shape is a failure of the code under review.\n\n' +
      'An unresolved defect is a defect the run finds in the code and leaves standing.\n',
  });
  const ugGaps3 = scanUnresolvedGlossaryContract(ug3);
  assert.equal(ugGaps3.length, 1, 'flags scope-mode.md for dropping the branch-soundness clause');
  assert.equal(ugGaps3[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive: CONTEXT.md's Unresolved defect entry drops the branch-soundness clause, while keeping its
  // Degraded pass half verbatim
  const ug4 = fixture({
    'CONTEXT.md':
      '**Degraded pass** — the code under review did not fail; the chain\'s own assurance came up short.\n\n' +
      '**Unresolved defect** — a defect the run finds in the code and leaves standing.\n',
  });
  const ugGaps4 = scanUnresolvedGlossaryContract(ug4);
  assert.equal(ugGaps4.length, 1, 'flags CONTEXT.md for dropping the branch-soundness clause');
  assert.equal(ugGaps4[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // positive: CONTEXT.md's Unresolved defect entry negates the branch-soundness clause outright — a
  // literal match on the affirmative clause cannot appear inside a sentence that denies it
  const ug6 = fixture({
    'CONTEXT.md':
      '**Degraded pass** — the code under review did not fail; the chain\'s own assurance came up short.\n\n' +
      '**Unresolved defect** — this record does not answer whether the branch is sound; that is a ' +
      'different question.\n',
  });
  const ugGaps6 = scanUnresolvedGlossaryContract(ug6);
  assert.equal(ugGaps6.length, 1, 'flags a CONTEXT.md entry that negates the branch-soundness clause');
  assert.equal(ugGaps6[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // positive: CONTEXT.md's Unresolved defect entry negates the branch-soundness clause as an "X, not Y"
  // contrastive coordination — the genuine contradiction a character-window look-behind let through,
  // because it reads as a correct sentence when the only difference from the real one is which word
  // ("rather than" vs. "not") sits in front of the shared "whether the branch is sound" fragment
  const ug7 = fixture({
    'CONTEXT.md':
      '**Degraded pass** — the code under review did not fail; the chain\'s own assurance came up short.\n\n' +
      '**Unresolved defect** — distinct from a **Degraded pass**, which says how much of the chain ran, ' +
      'not whether the branch is sound (ADR 0026).\n',
  });
  const ugGaps7 = scanUnresolvedGlossaryContract(ug7);
  assert.equal(ugGaps7.length, 1, 'flags the "X, not Y" contrastive negation as a contradiction');
  assert.equal(ugGaps7[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // positive: rewording the canonical clause fails too — the accepted cost of a literal-phrase guard,
  // the same shape every other contract in this file already accepts
  const ug8 = fixture({
    'references/scope-mode.md':
      'Neither shape counts as a failure of the code under review.\n\n' +
      'Distinct from a Degraded pass — this one says whether the branch is sound.\n',
  });
  const ugGaps8 = scanUnresolvedGlossaryContract(ug8);
  assert.equal(ugGaps8.length, 1, 'flags a reworded canonical clause as a gap');
  assert.equal(ugGaps8[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // negative: both documents carry the full agreement verbatim, wrapped across a line break the way the
  // real files wrap — whitespace normalization makes the wrap invisible to the match
  const ug5 = fixture({
    'references/scope-mode.md':
      'Neither shape is a failure of the code\nunder review.\n\n' +
      'Distinct from a Degraded pass — this one says\nwhether the branch is sound.\n',
    'CONTEXT.md':
      '**Degraded pass** — the code under review did\nnot fail; the chain\'s own assurance came up short.\n\n' +
      '**Unresolved defect** — distinct from a Degraded pass, which says how much of the chain ran, rather ' +
      'than whether the branch\nis sound (ADR 0026).\n',
  });
  assert.equal(
    scanUnresolvedGlossaryContract(ug5).length,
    0,
    'both documents carrying the full agreement, wrapped across a line break, yields zero gaps',
  );

  // absent files are skipped, matching every other contract scanner
  assert.equal(
    scanUnresolvedGlossaryContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'absent files are skipped',
  );

  console.log('drift-check selftest ok');
} else {
  main();
}
