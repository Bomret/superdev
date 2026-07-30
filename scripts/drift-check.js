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
// The config-bullet form the contract actually uses (`**Assignee:**` / `**Assignee**:`), not a bare
// substring — "this tracker has no assignee field" would otherwise satisfy a substring check.
const ASSIGNEE_PATTERN = /\*\*Assignee[:*]/;

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

function main() {
  const root = path.join(__dirname, '..');
  const missing = scan(root);
  const offenders = scanRunRootPaths(root);
  const gaps = scanAssigneeContract(root);
  if (missing.length === 0 && offenders.length === 0 && gaps.length === 0) {
    console.log('drift-check ok: references resolve, run-root paths are absolute, assignee contract carried');
    process.exit(0);
  }
  for (const m of missing) {
    console.error(`missing ${m.reference} — referenced by ${m.source}`);
  }
  for (const o of offenders) {
    console.error(`checkout-relative run-root path \`${o.match}\` in ${o.source} — use \`<run-root>/…\``);
  }
  for (const g of gaps) {
    console.error(`${g.source} carries no \`**Assignee\` config bullet — see plan-contract.md → Assignee`);
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

  console.log('drift-check selftest ok');
} else {
  main();
}
