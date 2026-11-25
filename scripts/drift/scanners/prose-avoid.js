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
  GITHUB_WIKI_GH_ONLY_DOCS,
  GITHUB_WIKI_GH_ONLY_MARKERS,
  CONFLICT_COMMIT_CONCLUSION_PATTERNS,
  DOD_BOX_RULE_PATTERNS,
  UNNAMED_BASH_LIMIT_PATTERN,
  NO_TEST_RUN_DOCS,
  NO_TEST_RUN_PATTERNS,
  IMPLEMENT_NO_FULL_RUN_DOCS,
  IMPLEMENT_NO_FULL_RUN_PATTERNS,
  OBSERVATION_NO_SUITE_RUN_DOC,
  OBSERVATION_NO_SUITE_RUN_PATTERN,
  SCOPE_REVIEW_NO_FULL_RUN_DOCS,
  SCOPE_REVIEW_OPERATOR_ASKED,
  PLUGIN_ROOT_UNQUOTED_PATTERN,
  PLUGIN_PREFIX_PATH_PATTERN,
  MERGE_INVOCATION_PATTERN,
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
// to the base branch" caution. The scan reads the unmasked text: a fenced example is an invocation an
// agent copies, so a fenced call is a gap and a fenced `# never pass --admin` is a caution.
function scanNoForceMerge(root) {
  const gaps = [];
  for (const rel of NO_FORCE_MERGE_DOCS) {
    const text = readDoc(root, rel);
    if (text === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
    for (const [pattern, expectation] of NO_FORCE_MERGE_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      for (const hit of text.matchAll(re)) {
        const before = text.slice(Math.max(0, hit.index - NEVER_NEGATION_WINDOW), hit.index);
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

// ADR 0247, INV-0190: no shipped skill, agent, or reference judges a Definition-of-Done line by its checkbox. The
// documents are the prose directories read at scan time, so a document added later is covered the day it lands. Fenced
// examples are masked. See `DOD_BOX_RULE_PATTERNS`'s own comment for the ceiling.
function scanDodBoxRule(root) {
  const gaps = [];
  for (const [rel] of proseDocuments(root, ['skills', 'agents', 'references'])) {
    const text = readDoc(root, rel);
    if (text === null) continue;
    const masked = maskFences(text);
    for (const pattern of DOD_BOX_RULE_PATTERNS) {
      for (const hit of masked.matchAll(pattern)) {
        gaps.push({
          source: rel,
          expectation:
            "judge a Definition-of-Done line by its note, per `references/dod-ticks.md`'s `## The note rule` — " +
            `\`${normalizeWhitespace(hit[0])}\` judges it by its checkbox (ADR 0247, INV-0190)`,
        });
      }
    }
  }
  return gaps;
}

const SHIPPED_PROSE_DIRS = ['skills', 'agents', 'references'];

// Every `AGENTS.md` that exists at any depth under the shipped skill, agent, and reference trees, which
// `proseDocuments` leaves out.
function shippedAgentsDocs(root) {
  const docs = [];
  for (const dir of SHIPPED_PROSE_DIRS) {
    let entries;
    try {
      entries = fs.readdirSync(docPath(root, dir), { recursive: true, withFileTypes: true });
    } catch {
      continue; // no such dir → nothing to read
    }
    for (const entry of entries) {
      if (!entry.isFile() || entry.name !== 'AGENTS.md') continue;
      docs.push(path.join(dir, path.relative(docPath(root, dir), path.join(entry.parentPath ?? entry.path, entry.name))));
    }
  }
  return docs.sort();
}

// Every shipped markdown file: the skill, agent, and reference prose, and every `AGENTS.md` under those trees.
function shippedMarkdown(root) {
  return [...proseDocuments(root, SHIPPED_PROSE_DIRS).map(([rel]) => rel), ...shippedAgentsDocs(root)];
}

// Every match of a forbidden form in the shipped markdown, fences included: a fenced command is one an agent copies.
function scanShippedMarkdownForm(root, pattern, expectation) {
  const gaps = [];
  for (const rel of shippedMarkdown(root)) {
    const text = readDoc(root, rel);
    for (const hit of text.matchAll(pattern)) gaps.push({ source: rel, expectation: expectation(normalizeWhitespace(hit[0])) });
  }
  return gaps;
}

// No shipped `node` call leaves the plugin-root path unquoted, a line break between `node` and the path included.
const scanPluginRootQuoted = (root) =>
  scanShippedMarkdownForm(root, PLUGIN_ROOT_UNQUOTED_PATTERN, (hit) =>
    `quote the plugin-root path, \`node "\${CLAUDE_PLUGIN_ROOT}/…"\`, so a path holding a space stays one argument — \`${hit}\` leaves it unquoted`);

// No shipped prose names a path with this repository's `plugin/` prefix.
const scanPluginPrefixPath = (root) =>
  scanShippedMarkdownForm(root, PLUGIN_PREFIX_PATH_PATTERN, (hit) =>
    `name a shipped path relative to the plugin root — \`${hit}\` carries the repository's \`plugin/\` prefix, which no install holds`);

// INV-0209: no shipped prose instructs a local merge commit without a message. Whitespace runs, line wraps included, are
// normalized first, and fences are read too, since a fenced command is one an agent copies. A hit passes when its
// arguments carry `-m`, `--message`, `-F`, or `--file`, when they conclude or abandon a merge (`--abort`, `--continue`,
// `--quit`) or only fast-forward (`--ff-only`), or when they name no ref: a bare `git merge` mention invokes nothing.
const MERGE_MESSAGE_OPTION = /(?:^|\s)(?:-m|--message|-F|--file)(?:[=\s]|$)/;
const MERGE_NO_COMMIT_OPTION = /(?:^|\s)--(?:abort|continue|quit|ff-only)\b/;
function scanMergeMessageRequired(root) {
  const gaps = [];
  for (const rel of shippedMarkdown(root)) {
    const text = readDoc(root, rel);
    if (text === null) continue;
    for (const hit of normalizeWhitespace(text).matchAll(MERGE_INVOCATION_PATTERN)) {
      const args = hit[2].trim();
      if (MERGE_MESSAGE_OPTION.test(args) || MERGE_NO_COMMIT_OPTION.test(args)) continue;
      if (!args.split(' ').some((arg) => arg !== '' && !arg.startsWith('-'))) continue;
      gaps.push({
        source: rel,
        expectation:
          `pass the merge commit's message as a file, \`git merge -F <file> <ref>\` per references/commit-messages.md — ` +
          `\`${hit[0].trim()}\` leaves git's default message, which a commit-msg hook can refuse (INV-0209)`,
      });
    }
  }
  return gaps;
}

// ADR 0232: no shipped skill, agent, or reference, and no shipped AGENTS.md at any depth beside them, states the
// background rule against an unnamed Bash limit. Fences are masked and whitespace runs, line wraps included, are
// normalized before the match. No shipped AGENTS.md at all is one gap, so a moved or renamed one is never passed over.
function scanBackgroundRuleNamesLimit(root) {
  const gaps = [];
  if (shippedAgentsDocs(root).length === 0) {
    gaps.push(missingDoc('an AGENTS.md under skills/, agents/, or references/'));
  }
  for (const rel of shippedMarkdown(root)) {
    const text = readDoc(root, rel);
    if (text === null) continue;
    for (const hit of normalizeWhitespace(maskFences(text)).matchAll(UNNAMED_BASH_LIMIT_PATTERN)) {
      gaps.push({
        source: rel,
        expectation:
          `name the Bash ceiling in the background rule (\`timeout\` at 600000 ms, or the higher \`BASH_MAX_TIMEOUT_MS\`) — ` +
          `\`${hit[0]}\` names no limit (ADR 0232)`,
      });
    }
  }
  return gaps;
}

// A negation of the run itself: `no` directly before the hit, or `not`, `never`, `nor`, or `without` directly before it or
// before one run verb that heads it ("never runs the full command", "never calls `scope.js test`"), an `ever` intensifier
// allowed ("Never, ever run") and an infinitive `to` allowed before the verb ("Remember not to run …").
// A negation of any other word ("Without fail run …", "Do not skip running …", "Do not forget to run …") excuses
// nothing, and neither does a `no` further back ("If no focused command exists, run the full command").
// simplicity: shape-based, and its ceiling is that word order. A negation the sentence states after the hit ("the full
// command is never run") or further back than one run verb walks past the excuse, and the hit fires as written.
const RUN_NEGATION = String.raw`\b(?:not|never|nor|without)\b,?(?:\s+ever\b,?)?(?:\s+to\b)?(?:\s+(?:re-?)?(?:run|runs|running|call|calls|calling|start|starts|starting|invoke|invokes|invoking|execute|executes|executing))?`;
const NO_TEST_RUN_NEGATION = new RegExp(String.raw`(?:\bno\b|${RUN_NEGATION})\s*["'\`]?\s*$`, 'i');

// ADR 0189, INV-0175: `/superdev:document` (its skill, its doc agents, and `references/doc-pass.md`) and
// `/superdev:setup` instruct no test run. A statement that the skill runs none passes: a negation of the run itself
// (`RUN_NEGATION`, an opening quote or backtick allowed after it), in the same sentence, excuses it. Fenced examples are
// masked first. See `NO_TEST_RUN_PATTERNS`'s own comment for the ceiling.
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
        if (NO_TEST_RUN_NEGATION.test(sentence)) continue;
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

// The GitHub wiki seed and this repository's knowledge-base document authenticate through `gh` and git only.
const scanGithubWikiGhOnly = (root) => scanDocsAvoid(root, GITHUB_WIKI_GH_ONLY_DOCS, GITHUB_WIKI_GH_ONLY_MARKERS);

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
// A hit whose subject is the ship command — "`/superdev:ship` runs each target's command", "Only ship runs …" —
// describes ship's own job rather than claiming this document's own, so it is not the shape this check exists to
// catch. The subject sits directly before the hit, in the same sentence: "Before you ship, run …" names ship as no
// subject, and a ship mention in an earlier sentence excuses nothing.
// simplicity: shape-based, and its ceiling is the "run(s) … target's … command" shape with ship directly before it.
// A claim phrased another way ("execute the deploy step", "deploy it yourself") walks past, and so does a subject
// separated from its verb ("ship, after the merge, runs …"), which is reported.
const DEPLOY_RUNNER_ATTRIBUTION_WINDOW = 60;
const SHIP_SUBJECT = /(?:`\/superdev:ship`|\/superdev:ship|\bship)\s+$/i;

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
        const before = masked.slice(Math.max(0, hit.index - DEPLOY_RUNNER_ATTRIBUTION_WINDOW), hit.index).split(/[.!?]\s/).pop();
        if (SHIP_SUBJECT.test(before)) continue;
        // A denial — "runs no target's command", "never runs a target's command", "not to run …" — claims no run.
        if (/\b(?:never|not|no)\s+(?:to\s+)?$/i.test(before) || /^run(?:s|ning)?\s+(?:no|not|never)\b/i.test(hit[0])) continue;
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

// ADR 0192, INV-0128: implement runs no full or whole-repo suite, so its base step (`scope-branch.md`'s section alone), run
// handoff, and both execution playbooks instruct none. A negation of the run itself (`RUN_NEGATION`) in the same sentence
// or clause excuses the hit. One heading a list of code spans excuses it too ("never `test full`, `test whole`, or a
// `test focused` with no path"). A negation of another word, as in "with no delay run the full suite" or "Do not skip
// running the full command", excuses nothing. Fenced examples are masked first.
// simplicity: shape-based, and its ceiling is `RUN_NEGATION`'s word order plus that code-span list.
// The tail after the negation: any list of code spans it heads, then an article and an opening quote or backtick.
const FULL_RUN_NEGATION_TAIL = String.raw`\s*(?:(?:a\s+|an\s+|the\s+)?\`[^\`]*\`(?:\s+with\s+no\s+path)?\s*,\s*(?:(?:or|and|nor)\s+)?)*(?:a\s+|an\s+|the\s+)?["'\`]?\s*$`;
const FULL_RUN_NEGATION = new RegExp(String.raw`(?:\bno\b|${RUN_NEGATION})${FULL_RUN_NEGATION_TAIL}`, 'i');
// A section runs from its heading to the next heading of its own level or a higher one, `#` excepted. Both are
// found on fence-masked lines, so a heading shown inside a fenced example neither starts nor ends a section; the
// raw lines between them are returned, and the caller masks that text once.
function sectionText(text, heading) {
  const lines = text.split('\n');
  const masked = maskFences(text).split('\n');
  const start = masked.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const level = heading.match(/^#+/)[0].length;
  const next = new RegExp(`^#{2,${level}} `);
  const end = masked.findIndex((line, i) => i > start && next.test(line));
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
}
function scanImplementNoFullRun(root) {
  const gaps = [];
  for (const [rel, heading] of IMPLEMENT_NO_FULL_RUN_DOCS) {
    const text = readDoc(root, rel);
    if (text === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
    const scoped = heading === null ? text : sectionText(text, heading);
    if (scoped === null) {
      gaps.push({ source: rel, expectation: `carry a \`${heading}\` section for implement-no-full-run to scan` });
      continue;
    }
    const masked = maskFences(scoped);
    for (const pattern of IMPLEMENT_NO_FULL_RUN_PATTERNS) {
      for (const hit of masked.matchAll(pattern)) {
        const clause = masked.slice(0, hit.index).split(/[.!?:]\s|\n\s*\n/).pop();
        if (FULL_RUN_NEGATION.test(clause)) continue;
        gaps.push({
          source: rel,
          expectation:
            `instruct no full or whole-repo run — \`${normalizeWhitespace(hit[0])}\` starts one, and ` +
            "/superdev:ship takes the scope's full-suite evidence (ADR 0255, INV-0128)",
        });
      }
    }
  }
  return gaps;
}

// INV-0157: a failing test in red evidence the scope review reads joins the fix list as the red-evidence concept's Critical finding,
// so `review-scope-mode.md`'s observation concept, whose defects never join it, names no suite run as a source.
function scanObservationNoSuiteRun(root) {
  const [rel, heading] = OBSERVATION_NO_SUITE_RUN_DOC;
  const text = readDoc(root, rel);
  if (text === null) return [missingDoc(rel)];
  const scoped = sectionText(text, heading);
  if (scoped === null) return [{ source: rel, expectation: `carry a \`${heading}\` section for observation-no-suite-run to scan` }];
  return [...maskFences(scoped).matchAll(OBSERVATION_NO_SUITE_RUN_PATTERN)].map((hit) => ({
    source: rel,
    expectation:
      `name no suite run as an observation's source — \`${normalizeWhitespace(hit[0])}\` does, and a failing test in a ` +
      "scope review's suite run is the failing-run concept's Critical finding, which joins the fix list (INV-0157)",
  }));
}

// ADR 0255, INV-0193: the scope review starts no full-suite or whole-repo run, so `review-scope-*.md`, the review skill,
// and `final-reviewer` instruct none, by the patterns and the negation excuse implement-no-full-run uses. The ad-hoc clause
// in which the operator asks for the full suite is excused, as its own line. The `review-scope-*.md` files are read at scan
// time, so a branch file added later is covered the day it lands. Fenced examples are masked.
function scanScopeReviewNoFullRun(root) {
  const branchFiles = proseDocuments(root, ['references'])
    .map(([rel]) => rel)
    .filter((rel) => /^review-scope-.*\.md$/.test(path.basename(rel)));
  const gaps = [];
  for (const rel of [...branchFiles, ...SCOPE_REVIEW_NO_FULL_RUN_DOCS]) {
    const text = readDoc(root, rel);
    if (text === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
    const masked = maskFences(text);
    for (const pattern of IMPLEMENT_NO_FULL_RUN_PATTERNS) {
      for (const hit of masked.matchAll(pattern)) {
        const before = masked.slice(0, hit.index);
        if (SCOPE_REVIEW_OPERATOR_ASKED.test(before.slice(before.lastIndexOf('\n') + 1))) continue;
        if (FULL_RUN_NEGATION.test(before.split(/[.!?:]\s|\n\s*\n/).pop())) continue;
        gaps.push({
          source: rel,
          expectation:
            `instruct no full or whole-repo run — \`${normalizeWhitespace(hit[0])}\` starts one, and the scope review runs ` +
            'none: ship takes the full-suite evidence (ADR 0255, INV-0193)',
        });
      }
    }
  }
  return gaps;
}

module.exports = {
  scanScopeReviewNoFullRun,
  scanKbNoBackendCall,
  scanAgentToolAgnostic,
  scanUnmappedPathsForms,
  scanNoForceMerge,
  scanConflictConclusionNoCommit,
  scanTeaOnly,
  scanGithubWikiGhOnly,
  scanDeployRunnerExclusivity,
  scanDocSetupNoTestRun,
  scanImplementNoFullRun,
  scanObservationNoSuiteRun,
  scanBackgroundRuleNamesLimit,
  scanDodBoxRule,
  scanPluginRootQuoted,
  scanPluginPrefixPath,
  scanMergeMessageRequired,
};
