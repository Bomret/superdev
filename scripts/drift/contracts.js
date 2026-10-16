'use strict';

// drift-check contract data: the tables and patterns every check asserts against, and nothing else.
// A `[document, pattern, expectation]` row is read by `lib.js`’s scanContract(); the element
// lists and lone patterns are read by the bespoke scanners in `scanners.js`.

const path = require('node:path');

const REFERENCE_PATTERN = /(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/([a-zA-Z0-9_-]+\.md)/g;

// The execution/controller docs whose instructions are followed with a scopetree or slicetree as cwd (or
// handed to a subagent whose cwd is a slicetree). Run-root artifacts referenced here must use the absolute
// <run-root>/… path the controller captures at run init — a checkout-relative .superdev/scopes/<scope>/…
// path resolves one level too deep from a scopetree or slicetree cwd. Descriptive docs (status.md, plan-contract.md,
// brainstorm.md) run only from the invoking checkout and are deliberately absent.
const RUN_ROOT_DOCS = [
  'skills/implement/SKILL.md',
  'skills/review/SKILL.md',
  'skills/document/SKILL.md',
  'skills/submit-pr/SKILL.md',
  'skills/publish-kb/SKILL.md',
  'references/implement-lite.md',
  'references/implement-full.md',
  'references/run-init.md',
  'references/run-handoff.md',
  'references/scope-mode.md',
  'agents/implementer.md',
  'agents/slice-reviewer.md',
  'agents/simplicity-reviewer.md',
  'agents/final-reviewer.md',
];

// A checkout-relative run-root ARTIFACT path: .superdev/scopes/<seg>/<artifact>. Scopetree/slicetree
// *directory* paths (…/scopetree, …/slicetrees/<id>) are git-created from the invoking checkout — not the
// bug class — so `scopetree`/`slicetrees` are deliberately outside the artifact alternation and never match.
const RUN_ROOT_ARTIFACT_PATTERN =
  /\.superdev\/scopes\/[^\s/]+\/(?:ledger\.md|dod\.md|run\.lock|interfaces\.md|reports)/g;

// The documents ADR 0080 flags as still building a run-root scopetree path against the invoking
// checkout's own cwd, rather than resolving it through `scope.js root <slug>`: unlike the artifact paths
// `RUN_ROOT_ARTIFACT_PATTERN` guards, a `scopetree` *directory* path is deliberately outside that
// alternation everywhere else, because most of its occurrences are real `git worktree add`-style commands
// run from the invoking checkout on purpose. These instead address another run's scopetree from
// their own cwd, which may not be that checkout, so a reverted cwd-relative literal here is the same bug
// class with no legitimate reading.
const SCOPETREE_RUN_ROOT_DOCS = [
  path.join('skills', 'ship', 'SKILL.md'),
  path.join('skills', 'document', 'SKILL.md'),
  path.join('scripts', 'publish-kb.js'),
];
const SCOPETREE_RUN_ROOT_PATTERN = /\.superdev\/scopes\/[^\s`/]+\/scopetree\b/g;

// An ADR with no `**Status:**` line reads as accepted whether it is or not. The status is the one field
// that separates a decision the code honours from one still being argued. Capitalization is pinned too —
// a lowercase `accepted` sorts and greps apart from the rest for no reason.
const ADR_DIR = path.join('docs', 'adr');

const ADR_STATUSES = ['Accepted', 'Proposed', 'Superseded', 'Rejected'];

const ADR_STATUS_PATTERN = new RegExp(`^\\*\\*Status:\\*\\* (?:${ADR_STATUSES.join('|')})\\s*$`, 'm');

// A `/superdev:<name>` reference must resolve to `skills/<name>/SKILL.md`. The chain hands the reader from
// one command to the next by printing its name (ADR 0013), so a reference to a command that does not
// exist is a dead end.
const COMMAND_REFERENCE_PATTERN = /\/superdev:([a-z][a-z-]*)/g;

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
  // The glossary restates the set for a reader, which makes it a third copy of one fact. Every separator
  // tolerates a line break, so a re-wrap at any comma passes while the same eleven types, in order, are
  // still required.
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

// Shipped agent prose stays tool-agnostic (root AGENTS.md → "Backends are pluggable"): the test command
// is `references/test-selection.md`'s to select from the consumer repo's own config, so a concrete
// package-manager or test-runner invocation inside `agents/*.md` is this repo's toolchain leaking into
// a brief that executes in consumer repos — `bun run test` shipped exactly that way, as a pipe example
// in three agent briefs. `skills/setup/SKILL.md` and `skills/document/SKILL.md` name such commands legitimately,
// as interview and focused-command examples, so the scan covers `agents/` alone.
//
// simplicity: shape-based, and its ceiling is the package managers and runners named below. A command from
// a toolchain outside them (`cargo test`, `go test`, `mvn verify`) passes silently until a row names it.
// The reviewer's eye covers the rest.
const AGENT_TOOLCHAIN_PATTERNS = [
  /\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+[\w:.-]+|test\b)/i,
  /\b(?:pytest|vitest|jest)\b/i,
];

// ADR 0074: a `{paths}` form belongs to a runner that maps a source file to the tests covering it —
// `vitest related`, `jest --findRelatedTests`. The changed-path set holds source files and prose
// alongside tests, so a runner without that mapping collects nothing from them and reports red: pytest
// exits 5 on an empty collection, and vitest fails on no test files unless `passWithNoTests` is set.
// The documentation step reaches that case on every scope, since its range holds only prose on the ordinary path.
// Shipped prose proposed `pytest {paths}` exactly that way, which is where ADR 0074 came from.
//
// The scan matches a runner token immediately followed by `{paths}` — with optional flags, path
// arguments, or a bare `--` separator between them — whether that shape is a live proposal or a
// backticked anti-example naming the same command (a mention such as `` `pytest {paths}` collects
// nothing `` still fires it). It stays off the prose explaining the rule only because the shipped docs
// never write a non-mapping runner and `{paths}` adjacent like that: they name both in one sentence but
// keep the token separated from the runner, which the pattern does not match.
//
// simplicity: a denylist, and its ceiling is the runners named below. One outside them passes silently
// until a row names it. A mapping runner is rare enough to enumerate; a non-mapping one is the default,
// so the list names the common ecosystems rather than trying to be complete.
const UNMAPPED_PATHS_RUNNERS =
  /\b(?:pytest|go test|cargo test|mvn|gradle|dotnet test|rspec|phpunit)\b(?:\s+-{1,2}[\w-]+(?:=\S+)?|\s+\S*\/\S*)*\s+(?:--\s+)?\{paths\}/i;

// The documents that propose a focused command to a repository. `skills/setup/SKILL.md` derives it and
// `references/test-selection.md` defines it; no other shipped document writes one.
const UNMAPPED_PATHS_DOCS = [
  path.join('skills', 'setup', 'SKILL.md'),
  path.join('references', 'test-selection.md'),
];

// ADR 0023: a remote knowledge base is a reader-facing surface, and a page sent from an unmerged branch
// claims a feature no reader can reach, so `/superdev:publish-kb` is the only path to a backend. These
// are the documents that must reach no knowledge-base backend. `/superdev:publish-kb` is deliberately
// absent: reaching the backend is its job, and ADR 0069 moved that job into `plugin/scripts/publish-kb.js`.
//
// A marker built from a backend's literal endpoint or credential (`api/v2/pages`,
// `CONFLUENCE_API_TOKEN`) catches almost nothing: AGENTS.md's "Backends are pluggable" rule already
// forbids these documents from naming a backend at all. What a real regression reads like instead is an
// instruction shape — a backend-directed verb aimed at a knowledge-base object — regardless of which
// backend or whether it names one at all. The pre-ADR-0023 doc-writer.md ("Publishing to a **KB/wiki**
// host…", "create pages only for genuinely new outline entries") is the reference case this is built to catch.
const KB_NO_CALL_DOCS = [
  path.join('skills', 'plan', 'SKILL.md'),
  path.join('skills', 'document', 'SKILL.md'),
  path.join('agents', 'doc-writer.md'),
  path.join('references', 'doc-pass.md'),
];

const KB_OBJECT = 'pages?|wiki|space|backend';

// simplicity: shape-based, and its ceiling is the verb morphology below. A call phrased with a verb no
// row carries ("hand the page to Confluence", "sync the wiki") passes silently.
const KB_BACKEND_CALL_MARKERS = [
  // "publish-kb" is the command name, not the verb — excluded so naming `/superdev:publish-kb` never
  // trips this on its own.
  // Full verb morphology (publishes/published/publishing, creating, updated, …): a regression
  // phrased in the passive or as a gerund ("is published to the wiki", "when updating the wiki
  // page") must not walk past a guard whose whole job is catching the silent false-green.
  [new RegExp(`\\bpublish(?!-kb)(?:es|ed|ing)?\\b[^\\n]{0,25}?\\b(?:${KB_OBJECT})\\b`, 'i'), 'a "publish" instruction aimed at a knowledge-base object'],
  // `upsert` alone carries the backtick exclusion (?<!`)…(?!`), because `upsert` is also the staged
  // page's own `action` value and both writers cite it as a frontmatter literal beside the word "page".
  // The exclusion is scoped to that one verb: applied to the whole alternation it would exempt every
  // verb, and a backticked `create` — this guard's own reference case — would walk straight through.
  [new RegExp(`\\b(?:creat(?:e|es|ed|ing)(?:-or-update)?|updat(?:e|es|ed|ing))\\b[^\\n]{0,25}?\\b(?:${KB_OBJECT})\\b` +
    `|(?<!\`)\\bupsert(?:s|ed|ing)?\\b(?!\`)[^\\n]{0,25}?\\b(?:${KB_OBJECT})\\b`, 'i'), 'a create-or-update instruction aimed at a knowledge-base object'],
  // Case-sensitive: an HTTP verb is uppercase in these docs' code samples, unlike the lowercase
  // `action: delete` frontmatter value staged pages carry.
  [new RegExp(`\\b(?:POST|PUT|DELETE)\\b[^\\n]{0,100}?\\b(?:${KB_OBJECT})\\b`), 'an HTTP call aimed at a knowledge-base object'],
];

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

// The Bash hooks `merge-guard`, `ledger-guard`, and `run-trace` read a command line through
// the one shared scanner `hooks/shell-words.js` (ADR 0135). A hook that grows its own shell-word reader
// reopens the quoted-argument and command-substitution bypasses the scanner closes, so each hook must
// require the module and declare none of the reader's names itself. The pattern holds a negative
// lookahead at the start of the text (no `m` flag, so `^` is the text start) and then the require.
// The require counts only on a line that is no comment, ahead of any `//` on that line, and with any spacing inside its
// parentheses. A reader name counts after `const`, `let`, `var`, or `function`, and as a later declarator of one statement
// (`const x = 1, ARG = …`).
const SHELL_WORDS_REQUIRE = String.raw`(?:^|\n)(?![ \t]*(?:\/\/|\/?\*))(?:(?!\/\/)[^\n])*?\brequire\(\s*(['"])\.\/shell-words\.js\1\s*\)`;
const READER_NAME = String.raw`(?:ARG|RAW_ARG|STUCK|STUCK_MERGE|stripHeredocs)`;
const OWN_READER_DECLARATION = String.raw`(?:\b(?:const|let|var|function)\s+${READER_NAME}\b|,\s*${READER_NAME}\s*=(?!=))`;
// A `((` spread of a hook's own (a regex holding a paren, `\(` or `[(]`, followed by a second one, `{2`, or `+`: `\(\(`, `\({2,}`,
// `[(]{2,}`, `\(+`, on a line that is no comment, ahead of any `//` on it) is a private dash reading: shell-words.js's dashReading is
// the one reading every Bash hook shares (#1062).
const PAREN_ATOM = String.raw`(?:\\\(|\[\\?\(\])`;
const OWN_DASH_SPREAD = String.raw`(?:^|\n)(?![ \t]*(?:\/\/|\/?\*))(?:(?!\/\/)[^\n])*?${PAREN_ATOM}(?:${PAREN_ATOM}|\{[2-9]|\+)`;
const SCANNER_ONLY_PATTERN = new RegExp(`^(?![\\s\\S]*(?:${OWN_READER_DECLARATION}|${OWN_DASH_SPREAD}))[\\s\\S]*${SHELL_WORDS_REQUIRE}`);

const ARG_TOKEN_EXPECTATION =
  'require ./shell-words.js and declare no ARG, RAW_ARG, STUCK, STUCK_MERGE, stripHeredocs, or `((` spread of its own — a private shell-word reader reopens the quoted-argument, the command-substitution, or the dash `((` bypass';

const ARG_TOKEN_CONTRACTS = [
  [path.join('hooks', 'merge-guard.js'), SCANNER_ONLY_PATTERN, ARG_TOKEN_EXPECTATION],
  [path.join('hooks', 'ledger-guard.js'), SCANNER_ONLY_PATTERN, ARG_TOKEN_EXPECTATION],
  [path.join('hooks', 'run-trace.js'), SCANNER_ONLY_PATTERN, ARG_TOKEN_EXPECTATION],
];

// `scripts/AGENTS.md` carries one table row per registered check, keyed by the check's backticked `id`.
const NARRATIVE_DOC = path.join('scripts', 'AGENTS.md');

// A section heading, found up to a word boundary rather than end-of-line, because a real heading can
// carry a trailing qualifier: `plan-contract.md` writes `### Assignee — store configuration, not a slice
// field`, at `###` under `## Issue-backend mapping (general)`.
const specialisingHeading = (name) => new RegExp(`^#{2,3}\\s+${name}\\b`, 'm');

// The generic contracts in `references/plan-contract.md` that each slice-store document renders as a
// section of its own, and cites by name.
const SPECIALISING_SECTIONS = [
  'Scope anchor',
  'Release',
  'Run state',
  'Append mode',
  'Triage record',
  'Assignee',
  'Definition of Done ticks',
];

// One `plan-contract.md` row per member. Taking the names as an argument is what lets the selftest
// assert the derivation itself: a name the real list has never held yields a row for it.
const specialisingGenericRows = (names) =>
  names.map((name) => [
    path.join('references', 'plan-contract.md'),
    specialisingHeading(name),
    `carry the \`## ${name}\` section — the generic contract each store document specialises`,
  ]);

// Every canonical reference still carries the sections its readers are sent to. Each row pins one
// section by its bare heading: a section still present may say the wrong thing, which is the reviewer's
// job, but a section deleted outright is a link that resolves to nothing.
const SOURCE_SECTION_CONTRACTS = [
  ...specialisingGenericRows(SPECIALISING_SECTIONS),
  [
    path.join('references', 'plan-contract.md'),
    /^#{2,3}\s+Fields\s*$/m,
    'carry the `## Fields` section — the slice schema every store document renders',
  ],
  [
    path.join('references', 'plan-contract.md'),
    /^#{2,3}\s+Slice lifecycle & status\s*$/m,
    'carry the `## Slice lifecycle & status` section, which the chain documents cite by name',
  ],
  [
    path.join('references', 'plan-contract.md'),
    /^#{2,3}\s+Epic visuals\b/m,
    'carry the `## Epic visuals` section, which holds the epic-visuals gate for `## Slice graph` and ' +
      '`## Touch map`',
  ],
  [
    path.join('references', 'plan-contract.md'),
    /^#{2,3}\s+Feature label\s*$/m,
    'carry the `## Feature label` section — the change type plus slug `/plan` picks (ADR 0019, ADR 0021)',
  ],
  [
    path.join('references', 'test-selection.md'),
    /^#{2,3}\s+The two commands\s*$/m,
    'carry the `## The two commands` section — the full and focused commands its readers select between ' +
      '(ADR 0025)',
  ],
  [
    path.join('references', 'test-selection.md'),
    /^#{2,3}\s+Fallback to the full command\s*$/m,
    'carry the `## Fallback to the full command` section — the rule that picks the full command over ' +
      'the focused one (ADR 0025)',
  ],
  [
    path.join('references', 'content-types.md'),
    /^#{2,3}\s+The four types\s*$/m,
    'carry the `## The four types` section — the four kinds of information both doc agents apply (ADR 0014)',
  ],
  [
    path.join('references', 'content-types.md'),
    /^#{2,3}\s+The conceptual layer\s*$/m,
    'carry the `## The conceptual layer` section — the test for reporting an absent conceptual layer ' +
      '(ADR 0014)',
  ],
  [
    path.join('references', 'controlled-prose.md'),
    /^#{2,3}\s+Modes\s*$/m,
    'carry the `## Modes` section — the strict and relaxed modes its own rule sections are written against ' +
      '(ADR 0012)',
  ],
  [
    path.join('references', 'controlled-prose.md'),
    /^#{2,3}\s+Self-check\s*$/m,
    'carry the `## Self-check` section — what `doc-reader` verifies prose against (ADR 0012)',
  ],
  [
    path.join('references', 'review-checklist.md'),
    /^#{2,3}\s+Anti-patterns\s*$/m,
    'carry the `## Anti-patterns` section, which both `final-reviewer` and `slice-reviewer` read',
  ],
  [
    path.join('references', 'review-checklist.md'),
    /^#{2,3}\s+Vulnerability classes\s*$/m,
    'carry the `## Vulnerability classes` section, which both `final-reviewer` and `slice-reviewer` read',
  ],
  [
    path.join('references', 'review-checklist.md'),
    /^#{2,3}\s+Reuse audit\s*$/m,
    'carry the `## Reuse audit` section, which `final-reviewer` reads',
  ],
  [
    path.join('references', 'review-checklist.md'),
    /^#{2,3}\s+Consistency\s*$/m,
    'carry the `## Consistency` section, which `final-reviewer` reads',
  ],
];

// ADR 0053, ADR 0069: `plugin/scripts/publish-kb.js`'s `checkContainment` delegates the containment test
// to `scope.js`'s exported `testContainment`, `require`d and called directly, rather than reimplementing
// its own ancestry test — the ADR's decision that the test is stated once. A raw `git merge-base
// --is-ancestor` in its place answers "not merged" on every squash-merged scope. The pattern requires both
// the `require` destructure and a call site, so a `testContainment` imported but never called fails too.
// It cannot see a script that keeps the real call *and* grows a second, redundant ancestry test beside it.
const CONTAINMENT_DELEGATION_CONTRACTS = [
  [
    path.join('scripts', 'publish-kb.js'),
    {
      test: (text) =>
        /\{[^}]*\btestContainment\b[^}]*\}\s*=\s*require\(['"]\.\/scope\.js['"]\)/.test(text) &&
        /\btestContainment\(/.test(text),
    },
    "delegate the containment test to scope.js's exported `testContainment` — imported and called " +
      'directly — rather than reimplementing the ancestry check itself (ADR 0053)',
  ],
];

// ADR 0123: no shipped prose concludes a resolved merge conflict with `git commit`.
// simplicity: shape-based, and its ceiling is the spellings below: `commit --no-edit`, the form that
// concludes a merge without an editor; a `conclude … \`git commit\`` sentence with no backtick or full
// stop between the verb and the command; and "commit the merge with `git commit`". A paraphrase ("finish
// the merge by committing") walks past. The shape was chosen over a bare `git commit` because other
// shipped prose may name a commit legitimately.
const CONFLICT_COMMIT_CONCLUSION_PATTERNS = [
  /commit\s+--no-edit\b/,
  /conclud\w*[^.`]{0,160}`git\s+(?:-C\s+\S+\s+)?commit\b/,
  /commit\s+(?:the\s+merge|it)\s+with\s+`git\s+(?:-C\s+\S+\s+)?commit\b/,
];

// #683, INV-0092: none of the three code-management documents may ever *send* a force or bypass option
// on a merge call — `force_merge` (Forgejo) or `--admin` (GitHub's `gh pr merge`) each override branch
// protection and required approvals, which is exactly what a pinned merge must never do. This is a
// shape-based absence check: it catches an actual invocation, not the option's name used to say it is
// forbidden (`this seed never sends it`), so a paraphrased way of setting the same field walks past it.
// simplicity: shape-based, and its ceiling is the two spellings below.
const NO_FORCE_MERGE_DOCS = [
  path.join('references', 'code-management-forgejo.md'),
  path.join('references', 'code-management-github.md'),
  path.join('docs', 'agents', 'code-management.md'),
];
const NO_FORCE_MERGE_PATTERNS = [
  [/force_merge['"]?\s*:\s*true/i, () => 'invoke `force_merge: true` on a merge call — that is the branch-protection bypass this contract forbids sending'],
  [/--admin\b/, () => 'invoke `--admin` on a merge command — that is the required-check bypass this contract forbids sending'],
];

// ADR 0111, #794: the Forgejo seeds and this repository's Forgejo backend documents reach the host through
// `tea` only — no token env var, no `Authorization` header, no curl call. The documents legitimately carry
// prohibition prose ("a raw HTTP call (curl)", "never fall back to a token"), so the patterns match the
// *shape* of a use: a token env var's name, an `Authorization:` header, and `curl` as a command. Fences
// are scanned too, since a curl example lives in one.
// simplicity: shape-based, and its ceiling is the three shapes below. A token held in another variable name,
// a header built from `Bearer`/`token ` text alone, an HTTP client other than curl (`wget`, `http`), and a
// `curl` written with nothing but a bare word after it walk past.
const TEA_ONLY_DOCS = [
  path.join('references', 'issue-tracker-forgejo.md'),
  path.join('references', 'code-management-forgejo.md'),
  path.join('docs', 'agents', 'issue-tracker.md'),
  path.join('docs', 'agents', 'code-management.md'),
  path.join('docs', 'agents', 'knowledge-base.md'),
];
const TEA_ONLY_MARKERS = [
  [/\b(?:GITEA|FORGEJO)_TOKEN\b/, (hit) => `name no token env var — \`${hit[0]}\` belongs to a raw HTTP call, and the host is reached through \`tea\` only (ADR 0111)`],
  [/\bAuthorization\s*:/i, () => 'carry no `Authorization` header — the host is reached through `tea` only (ADR 0111)'],
  [
    /(?:^|[;&|(`]|\$\()[ \t]*curl\s+\S|\bcurl\s+(?:-|https?:|["'$])/m,
    () => 'carry no curl invocation — the host is reached through `tea` only (ADR 0111)',
  ],
];

module.exports = {
  REFERENCE_PATTERN,
  RUN_ROOT_DOCS,
  RUN_ROOT_ARTIFACT_PATTERN,
  SCOPETREE_RUN_ROOT_DOCS,
  SCOPETREE_RUN_ROOT_PATTERN,
  ADR_DIR,
  ADR_STATUSES,
  ADR_STATUS_PATTERN,
  COMMAND_REFERENCE_PATTERN,
  CHANGE_TYPE_CONTRACTS,
  AGENT_TOOLCHAIN_PATTERNS,
  UNMAPPED_PATHS_RUNNERS,
  UNMAPPED_PATHS_DOCS,
  KB_NO_CALL_DOCS,
  KB_BACKEND_CALL_MARKERS,
  HOOK_HEADER_REGEX,
  ARG_TOKEN_CONTRACTS,
  NARRATIVE_DOC,
  SPECIALISING_SECTIONS,
  specialisingGenericRows,
  SOURCE_SECTION_CONTRACTS,
  CONTAINMENT_DELEGATION_CONTRACTS,
  CONFLICT_COMMIT_CONCLUSION_PATTERNS,
  NO_FORCE_MERGE_DOCS,
  NO_FORCE_MERGE_PATTERNS,
  TEA_ONLY_DOCS,
  TEA_ONLY_MARKERS,
};
