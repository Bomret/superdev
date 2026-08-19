'use strict';

// drift-check contract tables: the data every check asserts against, and nothing else.
// A `[document, pattern, expectation]` row is read by `lib.js`’s scanContract(); the element
// lists and lone patterns are read by the bespoke scanners in `scanners.js`.

const path = require('node:path');

// The one helper a table needs: a `test()` row that compares a canonical clause against a hard-wrapped
// document has to normalise both sides before comparing them.
const { normalizeWhitespace } = require('./lib');

const REFERENCE_PATTERN = /(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/([a-zA-Z0-9_-]+\.md)/g;

// The execution/controller docs whose instructions are followed with a worktree as cwd (or handed to
// a subagent whose cwd is a worktree). Run-root artifacts referenced here must use the absolute
// <run-root>/… path the controller captures at run init — a checkout-relative .superdev/scopes/<scope>/…
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
  'references/run-init.md',
  'references/run-handoff.md',
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

// Every slice-store document must render `/plan`'s append-mode contract for its own backend (ADR 0004,
// `plan-contract.md` → *Append mode*): create only new slice records — never edit, close, or delete a
// merged one — and, when a single-slice feature has no epic yet, create the epic first and copy the lone
// slice's `acceptance` into it as the global DoD. Same candidate list as the anchor contract: every store
// document renders both, and each element pattern is anchored on a bullet's bolded lead-in for the same
// reason `ANCHOR_ELEMENTS` is — a passing prose mention of "append" states none of these rules for this
// backend.
const APPEND_PATTERN = /^#{2,3}\s+Append mode\s*$/m;

const APPEND_ELEMENTS = [
  [/^[-*] \*\*[^*]*never edit[^*]*\*\*/im, 'the never-edit-a-merged-slice clause'],
  [/^[-*] \*\*[^*]*epic first[^*]*\*\*/im, 'the epic-promotion clause for a single-slice feature'],
  // Anchored on "sanctioned edit", the clause that grants the permission, not on "amend" or "epic" alone
  // — either word alone recurs elsewhere in the section's surrounding prose.
  [/^[-*] \*\*[^*]*sanctioned edit[^*]*\*\*/im, 'the epic-amendment clause for a promoted epic'],
];

// `references/issue-tracker-local.md` alone needs a continuation rule: its `id` is the zero-padded file
// number `/plan` itself assigns, so append must continue numbering from the highest one already present
// and never reuse a number. An issue backend's `id` is server-assigned at creation, already unique and
// stable, so it names no continuation rule at all (`plan-contract.md` → *Append mode*).
const LOCAL_APPEND_DOC = path.join('references', 'issue-tracker-local.md');

const LOCAL_CONTINUATION_ELEMENT = [
  /^[-*] \*\*[^*]*continu[^*]*number[^*]*\*\*/im,
  'the local-only numbering-continuation clause',
];

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

// The documentation seed must offer a writing standard (ADR 0012). A seed that loses the section makes
// /superdev:setup write a doc convention with no standard, and both doc agents then find nothing to
// apply — the feature silently does nothing in every repo set up after the drift, and no build step
// would catch it. Same failure shape as the assignee contract above. The section is a heading `/setup`
// fills in, so a bare prose mention of "the writing standard" does not satisfy it.
const WRITING_STANDARD_DOCS = ['references/documentation.md'];

const WRITING_STANDARD_PATTERN = /^#{2,3}\s+Writing standard\s*$/m;

// An ADR with no `**Status:**` line reads as accepted whether it is or not. That is how ADR 0026 was
// documented as live while nothing implemented it, and it recurred on 0019/0020/0021 because nothing
// checked. The status is the one field that separates a decision the code honours from one still being
// argued, so it is asserted here rather than left to review. Capitalization is pinned too — a lowercase
// `accepted` sorts and greps apart from the rest for no reason.
const ADR_DIR = path.join('docs', 'adr');

const ADR_STATUSES = ['Accepted', 'Proposed', 'Superseded', 'Rejected'];

const ADR_STATUS_PATTERN = new RegExp(`^\\*\\*Status:\\*\\* (?:${ADR_STATUSES.join('|')})\\s*$`, 'm');

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

// Both sides of the doc loop must wire the content-type lens (ADR 0014). scan() above catches a
// reference to a file that does not exist. The reverse drift is invisible to it: a document that stops
// referencing a file which still exists leaves the reference resolvable, the suite green, and the lens
// dead in every dispatch. Same silent-drop failure shape as the assignee and writing-standard contracts.
// The writing side is `references/doc-pass.md` rather than `agents/doc-writer.md`, because the pass is
// stated once there and performed by two callers (ADR 0031); the reading side is the agent itself.
const CONTENT_TYPES_DOCS = [
  path.join('references', 'doc-pass.md'),
  path.join('agents', 'doc-reader.md'),
];

// Anchored on the `Read` instruction, not on a bare occurrence of the path. An agent that keeps the path
// in a passing aside but drops the instruction to read it has already lost the lens, so a substring match
// on the path alone would pass the exact drift this check exists to catch. Either path form satisfies it:
// the `${CLAUDE_PLUGIN_ROOT}` macro or a bare prose path, since an agent resolves both at dispatch.
const CONTENT_TYPES_PATTERN =
  /Read\s+`?(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/content-types\.md/;

// A `/superdev:<name>` reference must resolve to `commands/<name>.md`. The chain hands the reader from
// one command to the next by printing its name (ADR 0013), so a reference to a command that does not
// exist is a dead end. This is scan() one level over: that one resolves `references/` paths, this one
// resolves command names, and both catch a pointer no build step would follow.
const COMMAND_REFERENCE_PATTERN = /\/superdev:([a-z][a-z-]*)/g;

// Each command in the chain must name its successor, because printing the next command with its range
// resolved is the whole handoff (ADR 0013). scanCommandRefs above catches a handoff that points at a
// command with no file. The reverse drift is invisible to it: a command that names no successor at all
// leaves every reference resolvable and the suite green, and the chain dead-ends there silently.
// `commands/ship.md` ends the chain and has no successor, so it is deliberately absent.
const CHAIN_HANDOFFS = [
  [path.join('references', 'run-handoff.md'), '/superdev:review'],
  [path.join('commands', 'review.md'), '/superdev:document'],
  [path.join('commands', 'document.md'), '/superdev:ship'],
];

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
    path.join('references', 'run-init.md'),
    path.join('references', 'run-handoff.md'),
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
    path.join('references', 'run-init.md'),
    path.join('references', 'run-handoff.md'),
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
    path.join('references', 'run-handoff.md'),
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
    path.join('references', 'run-handoff.md'),
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

// green-gate re-runs the scope suite synchronously inside a PostToolUse hook, and a suite slower than
// the hook's timeout is killed mid-run — the gate then silently doesn't fire, exactly the failure it
// exists to prevent. `hooks/hooks.json` sets the green-gate entry's own `timeout` to 600s, which is
// also Claude Code's own default for a `command` hook: the entry states the ceiling where the suite
// runs, and holds it if that default ever moves. The comment beside `IS_MERGE` in
// `hooks/green-gate.js` names the same number and the same default. A comment that names a wrong
// default sends a consumer whose suite is too slow to the wrong knob, and a comment that no longer
// names 600 documents a ceiling that no longer holds — either drift is silent everywhere else,
// because the suite stays green until a run happens to exceed the ceiling.
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
    /600s `timeout` hooks\.json sets on this[\s\S]{0,20}hook's entry/,
    "name the 600s timeout hooks.json sets on this hook's entry",
  ],
  [
    path.join('hooks', 'green-gate.js'),
    // The hook type is the whole point: 600s is the default for a `command` hook, and 60s is the
    // default for an `agent` one. A comment that names the wrong type, or the wrong number, points a
    // consumer whose suite is too slow at a knob that isn't theirs.
    /Claude Code's own default for a `command` hook/,
    "identify the 600s ceiling as Claude Code's own default for a `command` hook",
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
  [path.join('references', 'run-init.md'), /scope\.js["'`]?\s+init\b/, 'create the run root and ledger with `scope.js init`'],
  [path.join('references', 'run-handoff.md'), /scope\.js["'`]?\s+stage set merged\b/, 'record slice completion with `scope.js stage set merged`'],
  [path.join('references', 'run-handoff.md'), /scope\.js["'`]?\s+unresolved add\b/, 'record a give-up point with `scope.js unresolved add`'],
  [path.join('references', 'run-handoff.md'), /scope\.js["'`]?\s+unresolved clear\b/, 'clear a standing defect on Green with `scope.js unresolved clear`'],
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
  // ADR 0031's three-document agreement on one header. A lite playbook that stops writing the record
  // leaves every later command dispatching the writer it was meant to skip; a `/superdev:document` that
  // stops reading it does the same while the record sits there; a `/superdev:review` that stops clearing
  // it ships documentation written before the fix that made it wrong.
  [path.join('references', 'implement-lite.md'), /scope\.js["'`]?\s+docs set\b/, 'record its inline doc pass with `scope.js docs set`'],
  [path.join('commands', 'document.md'), /scope\.js["'`]?\s+get docs\b/, 'read the inline-doc-pass record with `scope.js get docs` before it dispatches a writer'],
  [path.join('commands', 'review.md'), /scope\.js["'`]?\s+docs clear\b/, 'clear the inline-doc-pass record with `scope.js docs clear` when its fix loop lands commits'],
  [path.join('commands', 'publish-kb.md'), /scope\.js["'`]?\s+get branch\b/, 'read the scope branch with `scope.js get branch` for its merge check'],
  // /plan names `scope.js` once and then its two verbs, so the branch half wraps away from the path
  // prefix (`get\n  branch --root <run-root>`) and the `scope.js <verb>` shape above cannot reach it.
  // The `--root` argument is what separates the verb invocation from the words "get branch" in prose.
  [path.join('commands', 'plan.md'), /get\s+branch\s+--root/, 'read the scope branch with `scope.js get branch` for its append refusal, never by reconstructing `<type>/<scope>`'],
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
  [path.join('references', 'doc-pass.md'), /\.superdev\/kb-pending\//, 'write a remote backend\'s pages under `.superdev/kb-pending/`'],
];

// ADR 0031: the documentation pass is stated once, in `references/doc-pass.md`, and performed by two
// callers — the dispatched `doc-writer`, and the `lite` execution playbook's controller in its own
// context. A caller that stops reading the reference keeps performing a pass it no longer has the rules
// for, which is invisible to scan(): the file still exists and every other document still points at it.
// Anchored on the `Read` instruction rather than a bare path, for the reason CONTENT_TYPES_PATTERN
// states: a passing mention is not a read.
const DOC_PASS_CONTRACTS = [
  [
    path.join('agents', 'doc-writer.md'),
    /Read\s+`?(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/doc-pass\.md/,
    'read `references/doc-pass.md`, which states the pass it performs',
  ],
  [
    path.join('references', 'implement-lite.md'),
    /Read\s+`?(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/doc-pass\.md/,
    'read `references/doc-pass.md`, which states the pass its doc step performs',
  ],
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
  // A sixth row: `references/run-handoff.md`'s run handoff is the other end of ADR 0025. An
  // all-`mechanical`/`docs` scope has no whole-scope review to attach a suite run to, so run handoff runs
  // the scope's one full suite in its place. It is the one full-suite run no row above covers, and it is
  // load-bearing twice over — the routing contract below sends such a scope past `/superdev:review` on
  // the strength of it. A run handoff that stops running the suite leaves that scope reaching a pull
  // request with no suite run behind it anywhere in the chain, while every other check here stays green.
  [
    path.join('references', 'run-handoff.md'),
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
  path.join('references', 'doc-pass.md'),
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
// `references/run-handoff.md`'s run handoff runs its one full suite instead (the sixth full-suite row above).
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
// `references/doc-pass.md` and `commands/plan.md` — the two stagers — each stage one section for a
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
    path.join('references', 'doc-pass.md'),
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

// ADR 0004: append mode never renumbers a merged slice, so a second `/superdev:implement` run over an
// appended feature must never re-dispatch one. Run init's `init` call is the one place that seeds the
// ledger's per-slice status, so it must carry each loaded slice's real `status` rather than defaulting
// every row to `todo`.
const STATUS_SEED_CONTRACTS = [
  [path.join('references', 'run-init.md'), /"status"\s*:/, "carry each loaded slice's real `status` field in its `scope.js init` call"],
  [
    path.join('references', 'run-init.md'),
    /never\s+dispatched/,
    'state that a slice the store reports as merged seeds `merged` and is never dispatched',
  ],
];

// ADR 0004: `/plan`'s §0 asks new-vs-extend before the interview begins, refuses to extend on either of
// two signals while writing nothing, and promotes a single-slice feature to an epic in §6, where the
// command's other writes happen. Five independent rows, so losing any one clause fails on its own. The
// ledger refusal signal is one condition with two clauses (a stage other than `shipped`; a `shipped`
// stage whose branch is neither merged into the base nor gone), so it is two rows rather than one — a
// single lookahead pinning both clauses cannot report which one went missing. Each row anchors on the
// condition sentence's own wording, not on the rationale sentence that explains the branch test
// afterward, so a document that keeps the rationale but loses the condition still fails.
const PLAN_APPEND_CONTRACTS = [
  [
    path.join('commands', 'plan.md'),
    /makes no store call at all/,
    'ask new-vs-extend before the interview begins, and state that answering "new" makes no store call',
  ],
  [
    path.join('commands', 'plan.md'),
    /holds a slice `in-progress`, `in-review`, or `blocked`/,
    'state the store refusal signal — a slice `in-progress`, `in-review`, or `blocked` elsewhere',
  ],
  [
    path.join('commands', 'plan.md'),
    /ledger stage other than `shipped`/,
    'state the ledger refusal signal, first clause — a run root whose stage is other than `shipped`',
  ],
  [
    path.join('commands', 'plan.md'),
    /scope branch \(`<type>\/<scope>`\) is neither merged into the base nor gone/,
    'state the ledger refusal signal, second clause — a `shipped` stage whose scope branch is neither ' +
      'merged into the base nor gone',
  ],
  [
    path.join('commands', 'plan.md'),
    /leave the lone slice byte-identical/,
    'state the single-slice epic-promotion clause, including that the lone slice is left untouched',
  ],
];

// ADR 0007 + ADR 0004: `scope-prune` keeps a run root, and its shipped `ledger.md`, for seven days past
// merge, so a second `/superdev:implement` run over an appended feature can land while that ledger is
// still on disk. Run init must read the stage before choosing resume-vs-init: a `shipped` ledger belongs
// to a finished run and gets rotated aside, never resumed, and never deleted — `scope-prune` still reaps
// the whole run root on its own terms. The rotation must also never clobber an existing
// `ledger-shipped-<date>.md`, so a scope that ships twice in one calendar day keeps both trails.
const ROTATE_ON_SHIPPED_CONTRACTS = [
  [
    path.join('references', 'run-init.md'),
    /rename it to `ledger-shipped-<date>\.md`/,
    'rotate a `shipped` ledger to `ledger-shipped-<date>.md` before running `init` again',
  ],
  [
    path.join('references', 'run-init.md'),
    /`implementing`,\s*`merged`,\s*`reviewed`,\s*`documented`,\s*or\s*`documented-unreviewed`/,
    'name every other stage — `implementing`, `merged`, `reviewed`, `documented`, `documented-unreviewed` ' +
      '— that keeps the existing resume path',
  ],
  [
    path.join('references', 'run-init.md'),
    /nothing is deleted,\s*so ADR\s*0007's seven-day trail and `scope-prune`'s reap-on-merge rule both stand/,
    "state that nothing is deleted, so ADR 0007's seven-day trail and `scope-prune`'s rule stand unchanged",
  ],
  [
    path.join('references', 'run-init.md'),
    /never overwrites an existing\s*`ledger-shipped-<date>\.md`/,
    'state that a rotation never overwrites an existing `ledger-shipped-<date>.md`, so a same-day ' +
      'second rotation of one scope cannot clobber the first',
  ],
];

// ADR 0004 + ADR 0005: `/plan`'s §0 surfaces an epic's parked questions once it loads, before the
// interview diverges into new ground — each is a load-bearing decision an earlier interview couldn't
// resolve. A question the interview resolves has its line deleted from the epic's `## Parked questions`
// section; the new slice's `spec`/`acceptance` becomes the durable record instead
// (`references/domain-modeling.md`'s revise-in-place rule).
const PARKED_QUESTIONS_CONTRACTS = [
  [
    path.join('commands', 'plan.md'),
    /once it loads, before the interview diverges into new\s+ground/,
    "surface the epic's `## Parked questions` once it loads, before the interview diverges into new ground",
  ],
  [
    path.join('commands', 'plan.md'),
    /has its line deleted from that\s+section\s*—\s*the new slice's\s+`spec` and `acceptance` become the durable record/,
    "state that a question the interview resolves has its line deleted from the epic's `## Parked " +
      "questions` section, with the new slice's `spec`/`acceptance` becoming the durable record instead",
  ],
];

// ADR 0028: the scope branch is cut once, and a later run reuses it only losslessly.
// `references/scope-mode.md` owns the rule and both execution playbooks read it, so the three run kinds
// are pinned there rather than in either playbook — a pointer's prose is not worth pinning, and a
// tier-specific line that drifts still leaves the rule itself intact. Five independent rows: losing the
// specification for one clause fails on its own. `fresh` gets two rows because it carries two clauses (a
// scope-prune reap can leave a same-named branch standing with no ledger to match it, so `fresh` is not
// always a guaranteed-absent name), and `appended` gets two because a contained reuse switches the
// invoking checkout on the `full` tier — same as `resumed` — and must stop on the same conditions rather
// than a raw git fatal. The regexes span the bullet from its run-kind label (or its own distinguishing
// clause, for a row anchored past that label) to the sentence that distinguishes it, so a prose reflow
// inside that bullet does not go red while a deleted clause does.
const RUN_KIND_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /`fresh`[\s\S]{0,240}?[Cc]ut\s+it\s+from\s+`<base>`/,
    'specify the `fresh` run kind — no branch exists, so the run cuts one from `<base>`',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /\*\*The name already exists\*\*[\s\S]{0,300}?[Ss]top,\s+name\s+the\s+branch\s+found,\s+and\s+cut\s+nothing/,
    'specify the `fresh` run kind — a same-named branch a scope-prune reap left standing makes `-c`/`-b` ' +
      'fail; stop and name it rather than forcing a reset',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /`appended`[\s\S]{0,650}?merged\s+into\s+`<base>`,\s+or\s+gone\s+entirely/,
    'specify the `appended` run kind — key the branch decision on the same merged-or-gone test ' +
      '`hooks/scope-prune.js` and `commands/plan.md` run, not a bare `git merge-base --is-ancestor` ' +
      'that exits 128 on a branch a squash-merging host already deleted',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /\*\*Contained\*\*[\s\S]{0,200}?stopping\s+first\s+when\s+that\s+checkout\s+is\s+dirty\s+or\s+another\s+worktree\s+holds\s+the\s+branch/,
    'specify the `appended` run kind — a contained reuse switches the invoking checkout too, so it must ' +
      'stop on the same dirty-checkout/held-elsewhere conditions `resumed` stops on, instead of a raw ' +
      'git fatal',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /`resumed`[\s\S]{0,400}?[Nn]o\s+ancestor\s+test\s+runs\s+and\s+nothing\s+is\s+cut/,
    'specify the `resumed` run kind — no ancestor test runs and nothing is cut, because the branch ' +
      'holds unmerged slice work by design',
  ],
];

// ADR 0028 forbids a forcing branch flag in either execution playbook: `git switch -C`/`--force-create`,
// `git checkout -B`, and `git worktree add … -B`/`--force-create` all reset an existing branch instead of
// failing on it. `switch -C` prints `Reset branch` and exits 0 while leaving every slice already merged
// into that branch unreachable from any ref, and the ledger still records those slices as `merged`, so
// nothing in the run rebuilds what it lost. Every spelling is pinned, not just the two the playbooks
// happened to use, because the flag a hurried edit reaches for is whichever one it already knows.
const FORCING_FLAG_DOCS = [
  path.join('references', 'implement-full.md'),
  path.join('references', 'implement-lite.md'),
];
const FORCING_FLAG_PATTERNS = [
  /git\s+switch\s+(?:-C|--force-create)\b/,
  /git\s+checkout\s+-B\b/,
  /worktree\s+add[^\n]*\s(?:-B|--force-create)\b/,
];

// `scripts/AGENTS.md`'s Work Guidance sets its own contract: a new drift-check contract is one registry
// entry, plus its section in the narrative, plus its selftest. Only the first and third are enforced by
// anything, and the middle one has been skipped twice — `forcing-branch-flag` and `source-sections` were
// registered and undescribed. The stated count drifts on the same edit, because both are maintained by
// hand: it read forty-one while the registry held forty-three.
//
// The narrative names each check by its registry `id`, wrapped in a backtick pair, so a bare substring of
// the id occurring elsewhere in the document does not count as "described" — this pins that every check
// is written up somewhere, never that the write-up is accurate or that the classification sentence files
// it under the right kind. Those stay human judgment, and the epic says so.
const NARRATIVE_DOC = path.join('scripts', 'AGENTS.md');
// Both documents state the count in prose, so both drift on the same edit. Each claim is pinned by the
// sentence that makes it, with `{n}` standing in for the spelled count — not by the bare number word.
// The narrative also recounts *past* drift ("it read forty-one against a registry of forty-three"), and a
// document-wide search for the current word would pass on a historical mention like that while the real
// claim stayed stale. A reworded sentence goes red, which is the same bargain every other contract row
// in this file makes.
const CHECK_COUNT_CLAIMS = [
  [path.join('scripts', 'AGENTS.md'), 'guards {n} things'],
  [path.join('scripts', 'AGENTS.md'), 'the {n}-check narrative'],
  ['AGENTS.md', 'the {n} cross-document contract checks'],
];
// The narrative counts in words ("guards {n} things"), so the check compares against the form a
// maintainer would actually write rather than the digits.
const NUMBER_ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const NUMBER_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// The canonical references are pinned by their readers, not by themselves. `TEST_SELECTION_CONTRACTS`
// asserts that every loop consumer says *read `references/test-selection.md`*; `CONTENT_TYPES_AGENTS`
// asserts that both doc agents name `references/content-types.md`. Neither asserts that the named file
// still carries the rule. Gut the body and keep the filename, and the reference resolves, every consumer
// still points at it, and drift-check stays green while the rule it promises is gone.
//
// Each row pins one section a reader is sent to, by its bare heading. The heading is the weakest thing
// worth asserting and the strongest thing a pattern can honestly claim: a section still present may say
// the wrong thing, which is the reviewer's job, but a section deleted outright is drift no reviewer sees
// on a diff that touches a different file. `references/scope-mode.md` is already pinned this way (its
// `## Unattended` and `## Degraded passes` rows); this table is that treatment for the five canonical
// sources that never got it.
//
// `plan-contract.md` carries six rows because five of its sections are cited by name elsewhere in the
// plugin — a store document rendering `## Append mode` or `## Scope anchor` for its own backend is
// following a section that has to exist to be followed — plus `## Fields`, the slice schema every store
// renders. The other four files are cited only as whole files, so their rows pin the sections that hold
// the rule the citing document promises its reader.
const SOURCE_SECTION_CONTRACTS = [
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
    /^#{2,3}\s+Append mode\s*$/m,
    'carry the `## Append mode` section — the generic contract each store document specialises (ADR 0004)',
  ],
  [
    path.join('references', 'plan-contract.md'),
    /^#{2,3}\s+Scope anchor\s*$/m,
    'carry the `## Scope anchor` section — the generic contract each store document specialises (ADR 0017)',
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

// Both new run references are read forward, at a step: `implement-full.md` and `implement-lite.md`
// each say "read `references/run-init.md`" and "read `references/run-handoff.md`" as instructions to
// go on, never back. Only an instruction to go back to the command body is a gap. `/superdev:implement`
// and its router are fine to name — the gap is a *return*, not a mention. A gap is a directional verb
// (return, resume, continue, hand back, go back up, jump back — every one of them carries "return to",
// "resume at", "continue in", or "back to" as a substring) paired with a return target (the controller,
// the command body, `/superdev:implement`, `commands/implement.md`, or "Final phase"). Either half alone
// is legitimate prose: a target named with nothing sending the reader there ("the controller's Final
// phase" in passing, "the controller merges each slice serially", a `commands/implement.md`
// cross-reference), or a verb with no controller-shaped target ("resume it in place"). `run-init.md` and
// `run-handoff.md` are the two documents the command body's opening and closing steps were carved into
// (ADR 0029) — the most plausible place for a stray "then return to `/superdev:implement`" to reappear —
// so both join the two execution playbooks in the candidate list.
const RETURN_TO_CONTROLLER_DOCS = [
  path.join('references', 'implement-full.md'),
  path.join('references', 'implement-lite.md'),
  path.join('references', 'run-init.md'),
  path.join('references', 'run-handoff.md'),
];
const RETURN_VERBS = ['return\\s+to', 'back\\s+(?:up\\s+)?to', 'resume\\s+at', 'continue\\s+in'];
// A prose-shaped target only ever names the return jump this check exists for — nobody writes "refer
// back to the controller" as a cross-reference the way they write "refer back to `commands/implement.md`".
const PROSE_TARGETS = ['controller\\b', 'command\\s+body\\b', 'Final\\s+[Pp]hase\\b'];
// A path-shaped target (a command name, a doc path) is also how a legitimate backward *cross-reference*
// reads ("refer back to `commands/implement.md`", "point back to `/superdev:implement`") — bare "back
// to"/"back up to" would flag that pointer as a hand-off. Pair it only with a verb that names the
// hand-off explicitly, plus the two verbs ("return to", "continue in") no cross-reference uses.
const PATH_TARGETS = ['/superdev:implement\\b', 'commands/implement\\.md'];
const HAND_BACK_VERB = 'hand(?:\\s+\\w+){0,2}\\s+back\\s+to';
const PATH_VERBS = ['return\\s+to', 'resume\\s+at', 'continue\\s+in', HAND_BACK_VERB];
// Up to two `` ` `` or `*` markdown markers, optionally "the ", then up to two more — covers "the
// controller", "`commands/implement.md`", and "**Final phase**" alike between the verb and its target.
const RETURN_CONNECTOR = '[`*\\s]*(?:the\\s+)?[`*\\s]*';
const RETURN_TO_CONTROLLER_PATTERNS = [
  ...RETURN_VERBS.flatMap((verb) =>
    PROSE_TARGETS.map((target) => new RegExp(`\\b(?:${verb})${RETURN_CONNECTOR}${target}`, 'i')),
  ),
  ...PATH_VERBS.flatMap((verb) =>
    PATH_TARGETS.map((target) => new RegExp(`\\b(?:${verb})${RETURN_CONNECTOR}${target}`, 'i')),
  ),
];

// ADR 0029, one level over: `scanReturnToController()` (in `scanners.js`) is the negative half of the
// run's one-directional shape — an instruction to go *back*. Nothing pins the positive half: that a
// playbook still points *forward*, at run-init.md and run-handoff.md, at all. Delete "read
// run-handoff.md as your last step" from a playbook and every check above stays green — the reference
// resolves (nothing else names it, so `scan()` never notices) and nothing points back to the controller
// either. The run would then end with no `scope.js stage set merged` write, and — on an
// all-`mechanical`/`docs` scope — with no full-suite run anywhere in the chain (ADR 0025).
const PLAYBOOK_EDGE_DOCS = [
  path.join('references', 'implement-full.md'),
  path.join('references', 'implement-lite.md'),
];
const RUN_INIT_PATTERN = /(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/run-init\.md/;
const RUN_HANDOFF_PATTERN = /(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/run-handoff\.md/;
const PLAYBOOK_EDGE_CONTRACTS = PLAYBOOK_EDGE_DOCS.flatMap((rel) => [
  [rel, RUN_INIT_PATTERN, 'name `references/run-init.md` as its opening step'],
  [rel, RUN_HANDOFF_PATTERN, 'name `references/run-handoff.md` as its closing step'],
]);

module.exports = {
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
  LOCAL_APPEND_DOC,
  LOCAL_CONTINUATION_ELEMENT,
  AFK_SELECTION_HEADING,
  STORE_MECHANISMS,
  WRITING_STANDARD_DOCS,
  WRITING_STANDARD_PATTERN,
  ADR_DIR,
  ADR_STATUSES,
  ADR_STATUS_PATTERN,
  GRADER_TYPES,
  FOCUS_TYPES,
  CONTENT_TYPES_DOCS,
  DOC_PASS_CONTRACTS,
  CONTENT_TYPES_PATTERN,
  COMMAND_REFERENCE_PATTERN,
  CHAIN_HANDOFFS,
  CHANGE_TYPE_CONTRACTS,
  FEATURE_ARG_CONTRACTS,
  UNATTENDED_CONTRACTS,
  DEGRADED_CONTRACTS,
  DERIVED_CRITERIA_CONTRACTS,
  LABEL_VALIDATION_CONTRACTS,
  AFK_NAMES,
  AFK_ROW_PATTERN,
  GREEN_GATE_TIMEOUT_CONTRACTS,
  VERB_CONTRACTS,
  KB_STAGING_CONTRACTS,
  FULL_SUITE_CONTRACTS,
  SHIP_GATE_HEADING,
  SHIP_GATE_ELEMENTS,
  UNRESOLVED_GLOSSARY_CONTRACTS,
  KB_NO_CALL_DOCS,
  KB_BACKEND_CALL_MARKERS,
  HOOK_HEADER_REGEX,
  TEST_SELECTION_CONTRACTS,
  AFK_ROUTING_CONTRACTS,
  ARG_TOKEN_LINE,
  ARG_TOKEN_CONTRACTS,
  AUDIT_SET_CONTRACTS,
  AGGREGATE_PAGE_CONTRACTS,
  READ_PATH_CONTRACTS,
  STATUS_SEED_CONTRACTS,
  PLAN_APPEND_CONTRACTS,
  ROTATE_ON_SHIPPED_CONTRACTS,
  PARKED_QUESTIONS_CONTRACTS,
  RUN_KIND_CONTRACTS,
  FORCING_FLAG_DOCS,
  FORCING_FLAG_PATTERNS,
  NARRATIVE_DOC,
  CHECK_COUNT_CLAIMS,
  NUMBER_ONES,
  NUMBER_TENS,
  SOURCE_SECTION_CONTRACTS,
  RETURN_TO_CONTROLLER_DOCS,
  RETURN_TO_CONTROLLER_PATTERNS,
  PLAYBOOK_EDGE_CONTRACTS,
};
