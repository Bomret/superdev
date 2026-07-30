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
  'references/implement-lite.md',
  'references/implement-full.md',
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

function main() {
  const root = path.join(__dirname, '..');
  const missing = scan(root);
  const offenders = scanRunRootPaths(root);
  const gaps = scanAssigneeContract(root);
  const wsGaps = scanWritingStandardContract(root);
  const shape = scanEvalShape(root);
  if (
    missing.length === 0 &&
    offenders.length === 0 &&
    gaps.length === 0 &&
    wsGaps.length === 0 &&
    shape.length === 0
  ) {
    console.log(
      'drift-check ok: references resolve, run-root paths are absolute, assignee contract carried, ' +
        'writing standard offered, eval graders and scaffolds well-formed',
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
  for (const g of wsGaps) {
    console.error(
      `${g.source} carries no \`## Writing standard\` section — expected the heading plus its ` +
        `\`controlled | <path> | none\` values; see ADR 0012`,
    );
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

  // --- scanEvalShape: a grader's frontmatter must be something the harness can act on, and a case's
  // scaffold_script must resolve ---

  const evalFixture = (label, files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
    for (const [rel, body] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body);
    }
    return { label, dir };
  };

  const goodGrader = '---\ntype: llm\nfocus: files\nweight: 2\n---\nJudge the plan.\n';
  const goodCase = 'name: c\ncontext:\n  scaffold_script: scaffold.sh\n';

  // a well-formed case yields nothing
  const ok = evalFixture('ok', {
    'evals/c/case.yaml': goodCase,
    'evals/c/scaffold.sh': '#!/bin/sh\n',
    'evals/c/graders/g.md': goodGrader,
  });
  assert.equal(scanEvalShape(ok.dir).length, 0, 'a well-formed case yields no problems');

  // each rule fires on its own, and names the offending file
  const badType = evalFixture('badType', {
    'evals/c/graders/g.md': '---\ntype: vibes\nfocus: files\nweight: 2\n---\nb\n',
  });
  const typeProblems = scanEvalShape(badType.dir);
  assert.equal(typeProblems.length, 1, 'an unknown type is flagged');
  assert.equal(typeProblems[0].source, path.join('evals', 'c', 'graders', 'g.md'), 'names the grader');

  const badWeight = evalFixture('badWeight', {
    'evals/c/graders/g.md': '---\ntype: llm\nfocus: files\nweight: notanumber\n---\nb\n',
  });
  assert.equal(scanEvalShape(badWeight.dir).length, 1, 'a non-numeric weight is flagged');

  const noFocus = evalFixture('noFocus', {
    'evals/c/graders/g.md': '---\ntype: llm\nweight: 2\n---\nb\n',
  });
  assert.equal(scanEvalShape(noFocus.dir).length, 1, 'neither focus nor target is flagged');

  // `target` is the regex graders' spelling and satisfies the same rule
  const withTarget = evalFixture('withTarget', {
    'evals/c/graders/g.md': '---\ntype: regex\ntarget: files\nweight: 1\n---\nb\n',
  });
  assert.equal(scanEvalShape(withTarget.dir).length, 0, '`target` satisfies the focus/target rule');

  const noFrontmatter = evalFixture('noFrontmatter', {
    'evals/c/graders/g.md': 'Just prose, no frontmatter.\n',
  });
  assert.equal(scanEvalShape(noFrontmatter.dir).length, 1, 'a missing frontmatter block is flagged');

  const badScaffold = evalFixture('badScaffold', {
    'evals/c/case.yaml': 'name: c\ncontext:\n  scaffold_script: missing.sh\n',
    'evals/c/graders/g.md': goodGrader,
  });
  const scaffoldProblems = scanEvalShape(badScaffold.dir);
  assert.equal(scaffoldProblems.length, 1, 'an unresolvable scaffold_script is flagged');
  assert.match(scaffoldProblems[0].problem, /scaffold_script/, 'says what is wrong');

  // nothing to check is not a failure
  const noEvals = evalFixture('noEvals', { 'README.md': '# repo\n' });
  assert.equal(scanEvalShape(noEvals.dir).length, 0, 'an absent evals/ directory yields no problems');

  const noGraders = evalFixture('noGraders', {
    'evals/c/case.yaml': goodCase,
    'evals/c/scaffold.sh': '#!/bin/sh\n',
  });
  assert.equal(scanEvalShape(noGraders.dir).length, 0, 'a case with no graders/ dir yields no problems');

  // The harness accepts six grader types, and only `llm` and `regex` carry a focus/target. The other
  // four are `.strict()`, so adding `focus:` to satisfy this check would make the harness reject them.
  for (const type of ['tool_order', 'tool_used', 'file_exists', 'baseline']) {
    const other = evalFixture(type, {
      'evals/c/graders/g.md': `---\ntype: ${type}\nweight: 1\n---\nb\n`,
    });
    assert.equal(scanEvalShape(other.dir).length, 0, `\`${type}\` is a valid type and needs no focus`);
  }

  // The harness declares weight as a positive number, so zero, a negative, and a blank are malformed.
  for (const weight of ['0', '-1', '']) {
    const bad = evalFixture(`weight${weight}`, {
      'evals/c/graders/g.md': `---\ntype: llm\nfocus: files\nweight: ${weight}\n---\nb\n`,
    });
    assert.equal(scanEvalShape(bad.dir).length, 1, `\`weight: ${weight}\` is not a positive number`);
  }

  // YAML a maintainer can legally write: CRLF endings, a quoted scalar, a trailing comment.
  const crlf = evalFixture('crlf', {
    'evals/c/graders/g.md': '---\r\ntype: llm\r\nfocus: files\r\nweight: 2\r\n---\r\nb\r\n',
  });
  assert.equal(scanEvalShape(crlf.dir).length, 0, 'CRLF frontmatter is read, not rejected');

  const quoted = evalFixture('quoted', {
    'evals/c/graders/g.md': '---\ntype: "llm"\nfocus: \'files\'\nweight: 2  # weighted\n---\nb\n',
  });
  assert.equal(scanEvalShape(quoted.dir).length, 0, 'quoted scalars and trailing comments are read');

  const quotedScaffold = evalFixture('quotedScaffold', {
    'evals/c/case.yaml': 'context:\n  scaffold_script: "scaffold.sh"  # relative to the case dir\n',
    'evals/c/scaffold.sh': '#!/bin/sh\n',
    'evals/c/graders/g.md': goodGrader,
  });
  assert.equal(scanEvalShape(quotedScaffold.dir).length, 0, 'a quoted scaffold_script resolves');

  console.log('drift-check selftest ok');
} else {
  main();
}
