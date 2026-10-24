'use strict';

// The scanners that forbid a form in shipped prose: a backend call, a toolchain command, a force merge, a deploy-run claim.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, readDoc, missingDoc, maskFences, normalizeWhitespace } = require('../lib');
const {
  KB_NO_CALL_DOCS,
  KB_BACKEND_CALL_MARKERS,
  AGENT_TOOLCHAIN_PATTERNS,
  UNMAPPED_PATHS_RUNNERS,
  UNMAPPED_PATHS_DOCS,
  NO_FORCE_MERGE_DOCS,
  NO_FORCE_MERGE_PATTERNS,
  TEA_ONLY_DOCS,
  TEA_ONLY_MARKERS,
  CONFLICT_COMMIT_CONCLUSION_PATTERNS,
  NO_TEST_RUN_DOCS,
  NO_TEST_RUN_PATTERNS,
} = require('../contracts');
const { proseDocuments, scanDocsAvoid, walkFiles, NEVER_NEGATION_WINDOW } = require('./walkers');

// No document outside publish-kb may carry a KB-backend call marker (ADR 0023).
const scanKbNoBackendCall = (root) =>
  scanDocsAvoid(root, KB_NO_CALL_DOCS, KB_BACKEND_CALL_MARKERS.map(([pattern, what]) =>
    [pattern, () => `reach no knowledge-base backend — it still carries ${what}`]));

// Shipped agent briefs run in consumer repos, so their prose names no concrete toolchain command; see
// AGENT_TOOLCHAIN_PATTERNS' note for the class and its ceiling. The doc list is the `agents/` directory
// read at scan time, so a new agent is covered the day its file lands.
function scanAgentToolAgnostic(root) {
  let names = [];
  try {
    names = fs.readdirSync(docPath(root, 'agents')).filter((f) => f.endsWith('.md') && f !== 'AGENTS.md');
  } catch {
    return []; // no agents dir → nothing to scan
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
    if (text === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
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

// ADR 0123: no shipped skill, agent, or reference concludes a resolved merge conflict with `git commit`.
// The documents are the prose directories read at scan time, so a document added later is covered the
// day it lands. See `CONFLICT_COMMIT_CONCLUSION_PATTERNS`'s own comment for the ceiling.
const scanConflictConclusionNoCommit = (root) =>
  scanDocsAvoid(
    root,
    proseDocuments(root, ['skills', 'agents', 'references']).map(([rel]) => rel),
    CONFLICT_COMMIT_CONCLUSION_PATTERNS.map((pattern) => [
      pattern,
      (hit) =>
        'conclude a resolved conflict with `merge --continue`, never `git commit` — ' +
        `\`${normalizeWhitespace(hit[0])}\` names the other form (ADR 0123)`,
    ]),
  );

// ADR 0189, INV-0175: `/superdev:document` (its skill, its doc agents, and `references/doc-pass.md`) and
// `/superdev:setup` instruct no test run. A statement that
// the skill runs none passes: a negation (`no`, `not`, `never`, `without`, `nor`) at most one word
// before the hit (and an opening quote or backtick), in the same sentence, excuses it. Fenced examples are masked first. See `NO_TEST_RUN_PATTERNS`'s own comment
// for the ceiling.
function scanDocSetupNoTestRun(root) {
  const gaps = [];
  for (const rel of NO_TEST_RUN_DOCS) {
    const text = readDoc(root, rel);
    if (text === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
    const masked = maskFences(text);
    for (const pattern of NO_TEST_RUN_PATTERNS) {
      for (const hit of masked.matchAll(pattern)) {
        const sentence = masked.slice(0, hit.index).split(/[.!?]\s|\n\s*\n/).pop();
        if (/\b(?:no|not|never|nor|without)\b(?:\s+\w+){0,1}\s*["'`]?\s*$/i.test(sentence)) continue;
        gaps.push({
          source: rel,
          expectation:
            `instruct no test run — \`${normalizeWhitespace(hit[0])}\` starts one, and ` +
            'a doc pass and setup run no test command (ADR 0189, INV-0175)',
        });
      }
    }
  }
  return gaps;
}

// ADR 0111, #794: the Forgejo backend documents reach the host through `tea` only. See
// `TEA_ONLY_MARKERS`'s own comment for the ceiling this shape-based absence check carries.
const scanTeaOnly = (root) => scanDocsAvoid(root, TEA_ONLY_DOCS, TEA_ONLY_MARKERS);

// ADR 0101, INV-0098: only `/superdev:ship` ever runs a deploy target's command. `references/
// deployment.md` states the rule itself, so it is exempt here the way a caution naming the forbidden thing
// always is; `skills/ship/SKILL.md` is the one surface entitled to claim the run. Every other skill and
// agent is scanned for the same shape a claim to run one would take — "run(s) … target's … command" —
// masked against fenced examples first, so an illustrative command block never trips it.
const DEPLOY_RUNNER_EXEMPT_FILES = new Set([
  path.join('skills', 'ship', 'SKILL.md'),
  path.join('references', 'deployment.md'),
]);
const DEPLOY_RUNNER_PATTERN = /\brun(?:s|ning)?\b[\s\S]{0,40}?\btarget'?s?\b[\s\S]{0,25}?\bcommand\b/gi;
// A mention attributed to ship within this many characters ahead of the match — "`/superdev:ship` runs
// each target's command" — describes ship's own job rather than claiming this document's own, so it is
// not the shape this check exists to catch.
// simplicity: shape-based, and its ceiling is the "run(s) … target's … command" shape. A claim phrased
// another way ("execute the deploy step", "deploy it yourself") walks past.
const DEPLOY_RUNNER_ATTRIBUTION_WINDOW = 60;

function scanDeployRunnerExclusivity(root) {
  const gaps = [];
  for (const dir of ['skills', 'agents', 'references']) {
    const dirPath = docPath(root, dir);
    let files;
    try {
      files = walkFiles(dirPath).filter((f) => f.endsWith('.md'));
    } catch {
      continue; // no such dir → nothing to scan
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

module.exports = {
  scanKbNoBackendCall,
  scanAgentToolAgnostic,
  scanUnmappedPathsForms,
  scanNoForceMerge,
  scanConflictConclusionNoCommit,
  scanTeaOnly,
  scanDeployRunnerExclusivity,
  scanDocSetupNoTestRun,
};
