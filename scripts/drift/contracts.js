'use strict';

// drift-check contract tables: the data every check asserts against, and nothing else.
// A `[document, pattern, expectation]` row is read by `lib.js`’s scanContract(); the element
// lists and lone patterns are read by the bespoke scanners in `scanners.js`.

const path = require('node:path');

// The one helper a table needs: a `test()` row that compares a canonical clause against a hard-wrapped
// document has to normalise both sides before comparing them.
const { normalizeWhitespace } = require('./lib');

const REFERENCE_PATTERN = /(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?references\/([a-zA-Z0-9_-]+\.md)/g;

// The execution/controller docs whose instructions are followed with a scopetree or slicetree as cwd (or
// handed to a subagent whose cwd is a slicetree). Run-root artifacts referenced here must use the absolute
// <run-root>/… path the controller captures at run init — a checkout-relative .superdev/scopes/<scope>/…
// path resolves one level too deep from a scopetree or slicetree cwd. Descriptive docs (status.md, plan-contract.md,
// issue-tracker-local.md, brainstorm.md) run only from the invoking checkout and are deliberately absent.
const RUN_ROOT_DOCS = [
  'skills/implement/SKILL.md',
  'skills/review/SKILL.md',
  'skills/document/SKILL.md',
  'skills/ship/SKILL.md',
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

// An issue-backend document must carry the assignee contract (plan-contract.md → Assignee): the
// `## Assignee` section, and no `- **Assignee:**` configuration bullet. A seed that omits the section
// makes /superdev:setup write a config doc that states nothing about how this backend applies an
// assignee, and the feature silently does nothing for that backend. A seed that carries the bullet puts a
// personal account identifier back into a tracked file, which is the leak ADR 0073 removes: the assignee
// is read from `.superdev/info.json`, untracked, so a tracked bullet is configuration nothing reads and
// everything commits. Neither failure is one a build step would catch. The local-file store is exempt
// from both halves: it has no assignee concept and deliberately never gains one. Every other
// references/issue-tracker-*.md is an issue backend by definition — a slice store that isn't the
// local-file store creates issues — so the filename alone is the trigger; no content gate on how the doc
// phrases "create an issue" (CLI, REST, or plain prose all count, and a content gate misses forms it
// wasn't written to expect, e.g. `gh issue create`).
const ASSIGNEE_DOCS_DIR = 'references';

const ASSIGNEE_EXEMPT = new Set(['issue-tracker-local.md']);

const EXTRA_ASSIGNEE_DOCS = ['docs/agents/issue-tracker.md']; // this repo's own dogfooded store config

// The forbidden config bullet itself — a list item, in either of the two spellings the documents used
// before ADR 0073 (`- **Assignee:** …` and `- **Assignee**: …`). Matching a bare bolded `**Assignee**`
// would fire on any running prose that merely refers to the setting, and every rewritten `## Assignee`
// section refers to it; only the list-item form states a tracked configured value.
const ASSIGNEE_PATTERN = /^\s*[-*]\s+\*\*Assignee(?:\*\*:|:\*\*)/m;

// The two halves report apart, so a maintainer reads which one fired rather than which check did. The
// section half is the store-side presence contract `Assignee` shares with every other member of the
// specialising family; `scanAssigneeContract` finds it through `specialisingHeading('Assignee')`. The
// bullet half is this contract's own, and it is the one member of the family that forbids rather than
// requires — the value it names belongs in `.superdev/info.json`, which no commit can carry.
const ASSIGNEE_BULLET_EXPECTATION =
  'carry no `- **Assignee:** <value>` configuration bullet (nor the `- **Assignee**: <value>` spelling) — ' +
  'the assignee is read from the untracked `.superdev/info.json` (ADR 0073)';

const ASSIGNEE_SECTION_EXPECTATION =
  'carry its own `## Assignee` section — the store side of the generic contract, which states how this ' +
  'backend applies the configured assignee';

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
// prose that merely lists the five concepts, which states none of them for this backend. Inside that
// lead-in each pattern matches the shared *concept* the bullet names and not a full sentence, so a
// backend-specific mechanism (a JQL clause, a `/parent` call) stays free to vary. Both spellings of every
// concept are accepted: the repo's writing standard declares American English, so a document is not wrong
// for writing `recognize`, `under`, or `also a slice`.
const ANCHOR_ELEMENTS = [
  [/^[-*] \*\*[^*]*recogni[sz]/im, 'how to recognise an anchor'],
  [/^[-*] \*\*[^*]*candidate/im, 'how to list the candidates'],
  [/^[-*] \*\*[^*]*\b(?:beneath|under)\b/im, 'how to list the slices beneath an anchor'],
  [/^[-*] \*\*[^*]*\b(?:itself|also)\b a slice/im, 'how to tell an anchor that is itself a slice'],
  // The fifth element (ADR 0040): how to read an anchor's own dependencies, the relation `/superdev:afk`
  // defers a dependent anchor on and `/superdev:plan` records. The lead-in anchoring matters more here
  // than for the other four: two store documents discuss a native dependencies *unit* in this section's
  // intro prose, which says nothing about how to read the relation in that backend.
  [/^[-*] \*\*[^*]*dependenc/im, "how to read an anchor's dependencies"],
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
  // ADR 0043's exception to the never-edit clause above: promotion moves a lone slice's anchor-dependency
  // line to the epic it creates, because the epic is the anchor now (ADR 0040). A store document that
  // returns to the unqualified rule leaves a dependent feature running before its blocker, with the suite
  // green. The exception lives inside the epic-promotion bullet's body rather than opening a bullet of its
  // own, so it anchors on its own bolded run — the bold is still what carries it, exactly as the three
  // elements above, and running prose that merely mentions the migration matches nothing.
  [/\*\*migrat\w*\s+to\s+the\s+new\b/im, 'the anchor-dependency migration clause promotion carries'],
];

// Every slice-store document must state how its backend expresses a **release** — the human agreement
// that a written plan may be built (`plan-contract.md` → *Release*) — and all three consumers must name
// that section. The failure this catches is silent in both directions: a store document without the
// section leaves `/superdev:implement` with no signal to read, so it either builds an unreleased backlog
// or stops on everything; a consumer that drops the reference builds whatever it is handed, which is the
// gate's whole purpose gone with no error anywhere. Same candidate list as the anchor contract, since
// every store renders this one too — the local-file store's rendering is that its plans are released when
// written, which is still a `## Release` section stating it.
const RELEASE_PATTERN = /^#{2,3}\s+Release\s*$/m;

// The consumers are pinned on the backticked section name rather than the bare word: "release" recurs in
// ordinary prose (a released feature, releasing the plan), and a bare search on it would pass a document
// that merely mentions releasing while reading no signal at all.
const RELEASE_CONSUMERS = [
  path.join('skills', 'plan', 'SKILL.md'),
  path.join('skills', 'implement', 'SKILL.md'),
  path.join('skills', 'afk', 'SKILL.md'),
];

const RELEASE_CONSUMER_PATTERN = /`## Release`/;

// ADR 0083 + INV-0005: a release decision covers the work that existed when it was made, so on an append
// the answer applies in both directions — declining removes the signal from the scope anchor, releasing
// applies it. `/superdev:afk` selects on that signal, so a signal left standing over slices added
// afterwards is what sends an unattended sweep at work nobody released. Two halves, each silent on its
// own: a store document carrying **Apply** and **Read** and no **Remove** leaves `/superdev:plan` with
// no call to make, and a §6 that still reads "apply nothing" makes the call nobody wrote anyway.
// `issue-tracker-local.md` is exempt from the bullet and carries the opposite statement instead — its
// plans are released when written, so there is nothing to remove and the plan says so rather than
// attempting a call.
const RELEASE_REMOVE_PATTERN = /^[-*]\s+\*\*Remove\*\*/m;
const RELEASE_REMOVE_EXEMPT = new Set(['issue-tracker-local.md']);
const RELEASE_REMOVE_EXPECTATION =
  'carry a `## Release` **Remove** bullet naming the call that takes the signal off the scope anchor, ' +
  'beside **Apply** and **Read** — a declined release on an append removes it (ADR 0083, INV-0005)';

const LOCAL_RELEASE_DOC = path.join('references', 'issue-tracker-local.md');
const LOCAL_NO_REMOVAL_PATTERN = /nothing to remove/i;
const LOCAL_NO_REMOVAL_EXPECTATION =
  'state in its `## Release` section that a store releasing its features at write has nothing to ' +
  'remove, so a declined release on an append attempts no call (ADR 0083)';

const RELEASE_BOTH_DIRECTIONS_DOC = path.join('skills', 'plan', 'SKILL.md');
const RELEASE_BOTH_DIRECTIONS_PATTERN = /On an append[\s\S]{0,300}?removes? the signal/;
const RELEASE_BOTH_DIRECTIONS_EXPECTATION =
  "state that §6's declining branch removes the release signal from the scope anchor on an append, " +
  'where a first plan still applies nothing (ADR 0083, INV-0005)';

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

// ponytail: shape-based, and its ceiling is the mechanism vocabulary below. A store mechanism named in
// words no row carries ("the umbrella ticket", "the parent story") reads as neutral prose to this check.
// The `## Scope anchor` presence half covers the other failure — a selection step that states nothing at
// all — so what remains uncovered is a paraphrase, which is a reviewer's catch.
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

// A `/superdev:<name>` reference must resolve to `skills/<name>/SKILL.md`. The chain hands the reader from
// one command to the next by printing its name (ADR 0013), so a reference to a command that does not
// exist is a dead end. This is scan() one level over: that one resolves `references/` paths, this one
// resolves command names, and both catch a pointer no build step would follow.
const COMMAND_REFERENCE_PATTERN = /\/superdev:([a-z][a-z-]*)/g;

// Each command in the chain must name its successor, because printing the next command with its range
// resolved is the whole handoff (ADR 0013). scanCommandRefs above catches a handoff that points at a
// command with no file. The reverse drift is invisible to it: a command that names no successor at all
// leaves every reference resolvable and the suite green, and the chain dead-ends there silently.
// `skills/ship/SKILL.md` ends the chain and has no successor, so it is deliberately absent.
const CHAIN_HANDOFFS = [
  [path.join('references', 'run-handoff.md'), '/superdev:review'],
  [path.join('skills', 'review', 'SKILL.md'), '/superdev:document'],
  [path.join('skills', 'document', 'SKILL.md'), '/superdev:ship'],
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
    path.join('skills', 'implement', 'SKILL.md'),
    /^argument-hint:.*<(?:feature-)?label>/m,
    'declare an `argument-hint` naming a feature label',
  ],
  [path.join('skills', 'implement', 'SKILL.md'), /\$ARGUMENTS/, 'resolve `$ARGUMENTS`'],
  [
    path.join('skills', 'plan', 'SKILL.md'),
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
    path.join('skills', 'implement', 'SKILL.md'),
    path.join('skills', 'review', 'SKILL.md'),
    path.join('skills', 'document', 'SKILL.md'),
    path.join('skills', 'ship', 'SKILL.md'),
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
    path.join('skills', 'implement', 'SKILL.md'),
    path.join('skills', 'review', 'SKILL.md'),
    path.join('skills', 'document', 'SKILL.md'),
    path.join('skills', 'ship', 'SKILL.md'),
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
  // The classifier's own words are what separate a genuine safety block from one of the false positives
  // auto mode is documented to produce (ADR 0039). A bullet paraphrasing the denial reads the same either
  // way, so the maintainer who meets it in the pull request has nothing to act on and nothing to carry
  // upstream. Anchored on the noun rather than a phrasing, because the section states the flattening, the
  // cap, and the unavailable case around that one term.
  [
    path.join('references', 'scope-mode.md'),
    /refusal text/,
    "require a denied-dispatch bullet to quote the classifier's refusal text",
  ],
  ...[
    path.join('skills', 'implement', 'SKILL.md'),
    path.join('skills', 'review', 'SKILL.md'),
    path.join('skills', 'document', 'SKILL.md'),
    path.join('skills', 'ship', 'SKILL.md'),
    path.join('skills', 'status', 'SKILL.md'),
    path.join('references', 'implement-full.md'),
    path.join('references', 'implement-lite.md'),
    path.join('references', 'run-handoff.md'),
  ].map((rel) => [rel, /\*\*Degraded:\*\*/, 'name the `**Degraded:**` ledger entry']),
  // Naming the entry without pointing at the section that governs it leaves a reader with a token and no
  // rule: what counts as degraded, what to do attended, and what to do unattended all live in the section.
  // Anchored on the section's own name for the same reason `UNATTENDED_CONTRACTS` is — the documents
  // phrase the instruction several ways around one fixed noun.
  ...[
    path.join('skills', 'implement', 'SKILL.md'),
    path.join('skills', 'review', 'SKILL.md'),
    path.join('skills', 'document', 'SKILL.md'),
    path.join('skills', 'ship', 'SKILL.md'),
    path.join('skills', 'status', 'SKILL.md'),
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
    path.join('skills', 'review', 'SKILL.md'),
    /\*\*path\*\*\s+`<run-root>\/dod\.md`/,
    'hand `final-reviewer` the **path** `<run-root>/dod.md` in scope mode, never the DoD text inlined',
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /^##\s+Derive the criteria first\s*$/m,
    'carry the `## Derive the criteria first` step — the criteria are written before the DoD and the diff are read',
  ],
];

// A feature reaches merge built well and unreachable from the running application, because two rules
// that already demand a complete path through every layer are adjectives an agent grades its own
// compliance against (ADR 0062). The `Reachable:` criterion is the artifact that replaces them, and it
// is only an artifact while the token is the same word in both halves: `plan-contract.md` states the
// rule, and `skills/plan/SKILL.md` is the live path that emits one into a real plan. Renaming the token
// in the rule alone leaves every plan still emitting the old word, and renaming it in the surface alone
// leaves the rule describing a criterion nothing writes — either way the documents read correct
// separately and the contract between them is gone, which is the one-sided-pin shape the root
// AGENTS.md's prompt-architecture rules name.
//
// The token rows pin `Reachable:` inside its own backticks rather than the bare word, so prose that
// merely discusses reachability satisfies neither.
const REACHABLE_CRITERION_CONTRACTS = [
  [
    path.join('references', 'plan-contract.md'),
    /^###\s+The reachability criterion\s*$/m,
    'carry the `### The reachability criterion` section — the rule the plan surface is sent to read',
  ],
  [
    path.join('references', 'plan-contract.md'),
    /\*\*led by `Reachable:`\*\*/,
    'name `Reachable:` as the token the criterion is led by, so the rule and the surface emitting it agree on one word',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /\*\*Emit the reachability criterion into the Definition of Done\.\*\*/,
    'carry the **Emit the reachability criterion into the Definition of Done.** step — the live path that puts one in a plan',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /`Reachable:` criterion/,
    'emit a `Reachable:` criterion by that name, so a rename in the rule cannot leave this surface writing the old token',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /on every change type/,
    'carry the every-change-type clause on its own, rather than only the one `no in-repo consumer exists` reason plan-contract.md gives for `none` — a refactor whose honest answer is `none — entrance unchanged` needs a branch to fit too',
  ],
  [
    path.join('references', 'plan-contract.md'),
    /The rule holds on \*\*every change type\*\*/,
    'state the every-change-type clause on the reference that owns the rule, not only on the SKILL.md surface it is dispatched to',
  ],
];

// Ad-hoc review is diff-based, so a path on a clean checkout resolves to an empty diff and reviews
// nothing (ADR 0063). The standing-code shape fixes that: the files under the path at `HEAD`, reviewed as
// they are. It only works while both halves agree — `skills/review/SKILL.md`'s §1 is the surface that
// emits the shape, and `agents/final-reviewer.md`'s Range bullet is the brief that has to accept a
// subject with no diff behind it. Pinning one half alone is the `FULL_SUITE_CONTRACTS` shape: the surface
// could start emitting a shape the reviewer's own brief still enumerates away, or the brief could name a
// shape nothing emits, and each document reads correct on its own.
const REVIEW_RANGE_SHAPES_CONTRACTS = [
  [
    path.join('skills', 'review', 'SKILL.md'),
    /\*\*Standing code\*\*/,
    'emit the **Standing code** range shape — the fallback that reviews a path with no scoped diff',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /nothing to review/,
    'report that there is nothing to review when the path holds no files, rather than dispatching a reviewer at an empty set',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /\*\*A standing-code target\*\*(?:(?!- \*\*)[\s\S])*?skip `simplicity-reviewer`/,
    'skip `simplicity-reviewer` on a standing-code target, which is diff-only by its core contract',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /\*\*`superdev:final-reviewer`\*\*(?:(?!- \*\*)[\s\S])*?the path and its file set at `HEAD` in place of a range/,
    "hand `final-reviewer` the path and its file set at `HEAD` in place of a range on a standing-code target, since there is no diff to derive a summary or a range from",
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /one of four shapes/,
    'enumerate four range shapes, not three, so the surface cannot emit one the brief has already counted away',
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /standing code/,
    'name standing code as a subject it accepts, so a range shape the review surface emits reaches a brief that knows what to do with it',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /\*\*Include untracked files before resolving the range below\.\*\*[\s\S]*?- \*\*Range\*\* — whatever remains/,
    'stage untracked files with `git add -N .` before resolving the range bullets below, not after — staged only after, an untracked-only path\'s scoped diff comes back empty and falls into the standing-code shape instead of being seen',
  ],
];

// `/superdev:implement`, `/superdev:ship`, and `/superdev:review` each take a run as their subject and
// accept no argument, and each used to spell out its own words for what that means (ADR 0078).
// `scope-mode.md`'s `## Resolving an empty argument` section owns the cascade once; every command that
// enters through an empty argument cites it rather than restating a branch of it in its own words. A
// document that drops the section leaves every citation pointing at nothing, and a document that drops
// its own citation goes back to writing the cascade over in its own words — the defect the section exists
// to remove.
const EMPTY_ARGUMENT_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /^#{2,3}\s+Resolving an empty argument\s*$/m,
    'carry the `## Resolving an empty argument` section owning the shared cascade',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /`## Resolving an empty argument`/,
    'cite `## Resolving an empty argument` for its own empty-argument cascade rather than restating it',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /dirty working tree is reviewed as it always was/,
    "put a dirty working tree ahead of the shared cascade, reviewed as it always was, rather than folding that local rule into the cascade itself",
  ],
  // Order-bounded, the same shape `REVIEW_RANGE_SHAPES_CONTRACTS`' seventh row uses: the slug bullet's
  // own "reached only once" clause has to follow the standing-code bullet's fallback text, so a slug
  // resolution moved ahead of the four range shapes — the original defect this row exists to catch —
  // fails it exactly as removing the bullet does.
  [
    path.join('skills', 'review', 'SKILL.md'),
    /A \*\*fallback, never a replacement\*\*(?:[\s\S]*?)\*\*A scope slug\*\*(?:[\s\S]*?)reached only once the four shapes above all fail/,
    'resolve a scope slug only after the four range shapes above all fail, so no invocation that resolves today changes meaning',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /`## The scope branch`\s+shape-scan fallback and say which route was taken/,
    "take `## The scope branch`'s shape-scan fallback, and say which route was taken, when the run root's ledger names no branch or a branch that does not verify",
  ],
  [
    path.join('skills', 'ship', 'SKILL.md'),
    /`## Resolving an empty argument`/,
    'cite `## Resolving an empty argument` for its own empty-argument cascade rather than restating it',
  ],
  [
    path.join('skills', 'ship', 'SKILL.md'),
    /every run root whose stage is not `shipped`/,
    'name its own candidate set — every run root whose stage is not `shipped` — ahead of the cascade citation',
  ],
  [
    path.join('skills', 'implement', 'SKILL.md'),
    /`## Resolving an empty argument`/,
    'cite `## Resolving an empty argument` for its own empty-argument cascade rather than restating it',
  ],
  [
    path.join('skills', 'implement', 'SKILL.md'),
    /the features whose slices are ready/,
    'name its own candidate set — the features whose slices are ready — ahead of the cascade citation',
  ],
];

// The orphan lens works only from `## Design smells`. `final-reviewer` reads the anti-pattern,
// design-smell, and remaining lenses, while `slice-reviewer` reads anti-patterns and vulnerability
// classes alone. A slice legitimately lands a symbol whose caller arrives two slices later, so from
// either section `slice-reviewer` reads, the lens reports noise on correct work, and only the integrated
// scope can tell an orphan from a symbol nothing calls yet. The placement is the whole contract, and it
// is invisible in review: both sections are lists of named smells in one file, so moving an entry
// between them reads as tidying (ADR 0062). It is pinned in both directions, because a copy added to
// `## Anti-patterns` while the original stays put leaves the section check green and still reaches
// `slice-reviewer`. The scoping clause is pinned on wording unique to this entry — `## Design smells`
// already carries `whole-scope range` in `speculative generality`, so the looser phrase would pass on
// that neighbour alone.
// The placement above is only meaningful while each agent's own lens list matches the narrative: the
// orphan lens reaches `final-reviewer` and not `slice-reviewer` because the former reads design smells
// and the latter doesn't. Nothing pinned either list before this table, so widening
// `slice-reviewer.md`'s to add design smells routed the orphan lens into per-slice review with every
// other check here still green (ADR 0062). The dispatch prose that reaches `slice-reviewer` and
// `final-reviewer` (`references/implement-full.md`, `skills/review/SKILL.md`) was checked and defers to
// the agent body without restating a lens list, so those two rows close the contract alone. The
// `test-auditor` row below needs a dispatch-side row of its own instead, because its dispatch
// (`skills/review-tests/SKILL.md`) restates the lens set rather than deferring — see the comment above
// that row.
const AGENT_LENS_LIST_CONTRACTS = [
  [
    path.join('agents', 'slice-reviewer.md'),
    /apply its \*\*anti-pattern\*\* and \*\*vulnerability-class\*\*\s+lenses/,
    'read only the anti-pattern and vulnerability-class lenses — no design smell, so the orphan lens never reaches per-slice review',
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /apply its anti-pattern, design-smell,\s+vulnerability-class, reuse-audit, and consistency lenses/,
    'read the anti-pattern, design-smell, vulnerability-class, reuse-audit, and consistency lenses — design-smell is what carries the orphan lens to the integrated scope',
  ],
  [
    path.join('agents', 'test-auditor.md'),
    /apply its \*\*test-cost\*\* lenses —\s+\*\*dead test\*\* and \*\*expensive test\*\*/,
    'read the test-cost lenses — `## Test cost` reaches this agent alone, because its lenses need a measured duration no diff-scoped reviewer holds',
  ],
  // The dispatch half of the row above. The two other rows need none: their dispatch prose defers to
  // the agent body without restating a lens list. This one's does restate it — a sweep states the lens
  // set it is asking for — and a dispatch is the later, more specific instruction, so a dispatch naming
  // four categories would silently narrow the agent's five (CONTEXT.md → *Dispatch prose*, ADR 0035).
  [
    path.join('skills', 'review-tests', 'SKILL.md'),
    /five categories are the whole set/,
    "state that the five categories are the whole set — a dispatch that names fewer overrides `test-auditor`'s own lens sentence",
  ],
];

// `slice-reviewer.md`'s sentence pin above only asserts that ONE sentence still names the
// anti-pattern/vulnerability-class pair; it says nothing about a second sentence appended anywhere
// else in the file that also names design-smell. Appending "Also apply the design-smell lens…"
// leaves the pinned sentence untouched and returns zero gaps, while the orphan lens reaches
// per-slice review anyway (ADR 0062). The negative check below closes that: the token itself must
// not appear in this file at all, in either its hyphenated or spaced form.
const AGENT_LENS_AVOID_DOCS = [path.join('agents', 'slice-reviewer.md')];
// ponytail: a literal-token tripwire — it catches a `design-smell` / `design smell` token, hyphenated
// or spaced, case-insensitively, and nothing else. A paraphrase evades it: appending "Apply every lens
// the checklist names, not only the two above." to slice-reviewer.md routes design smells into
// per-slice review while this check reports zero gaps. Closing that evasion is out of scope here; the
// upgrade path is a stricter grammar over the checklist's own lens names, in place of a fixed token.
const AGENT_LENS_AVOID_MARKERS = [
  [/design[-\s]smell/i, () => 'carry no `design-smell` / `design smell` token anywhere — that lens reaches only `final-reviewer`'],
];

const ORPHAN_LENS_DOC = path.join('references', 'review-checklist.md');
const ORPHAN_LENS_ENTRY = /\*\*Orphan production symbol\*\*/;
const ORPHAN_LENS_DESIGN_HEADING = /^##\s+Design smells\s*$/m;
const ORPHAN_LENS_ANTIPATTERN_HEADING = /^#{2,3}\s+Anti-patterns\s*$/m;
const ORPHAN_LENS_SCOPE_CLAUSE = /cannot\s+tell\s+an\s+orphan\s+from\s+a\s+caller/;

// The same placement failure ADR 0062 records for the orphan lens, on the test-cost lenses
// (ADR 0066). Each needs a measured duration, which only a test audit holds: under `## Anti-patterns`
// they would reach `slice-reviewer` on every slice, which has no duration to judge either one by and
// sees one half of a suite. `## Test cost` is the section only `test-auditor`'s own lens sentence
// routes to, so this check keeps the two halves — the section's membership and `## Anti-patterns`'
// non-membership — pinned together, exactly as the orphan row above does.
const TEST_COST_LENS_DOC = path.join('references', 'review-checklist.md');
const TEST_COST_LENS_HEADING = /^##\s+Test cost\s*$/m;
const TEST_COST_LENS_ENTRIES = [
  ['Dead test', /\*\*Dead test\*\*/],
  ['Expensive test', /\*\*Expensive test\*\*/],
];

// A feature label is external input that becomes a branch name and a run-root path segment. Both of
// its segments reach `git worktree add … -b`, so both are validated — the leading one against the
// closed change-type set, which is strictly stronger than a charset test on it. A rule that guards the
// slug alone lets a
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
  ...[path.join('skills', 'implement', 'SKILL.md'), path.join('skills', 'afk', 'SKILL.md')].map((rel) => [
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
  [path.join('skills', 'review', 'SKILL.md'), /scope\.js["'`]?\s+stage set\b/, 'write its stage with `scope.js stage set`'],
  [path.join('skills', 'review', 'SKILL.md'), /scope\.js["'`]?\s+get anchor\b/, 'read the scope anchor\'s title with `scope.js get anchor`'],
  [path.join('skills', 'review', 'SKILL.md'), /scope\.js["'`]?\s+unresolved add\b/, 'record a give-up point with `scope.js unresolved add`'],
  [path.join('skills', 'review', 'SKILL.md'), /scope\.js["'`]?\s+unresolved clear\b/, 'clear a standing defect on a clean verdict with `scope.js unresolved clear`'],
  [path.join('skills', 'document', 'SKILL.md'), /scope\.js["'`]?\s+stage set\b/, 'write its stage with `scope.js stage set`'],
  [path.join('skills', 'ship', 'SKILL.md'), /scope\.js["'`]?\s+get stage\b/, 'read the stage with `scope.js get stage`'],
  [path.join('skills', 'ship', 'SKILL.md'), /scope\.js["'`]?\s+stage set shipped\b/, 'set the terminal stage with `scope.js stage set shipped`'],
  [path.join('skills', 'ship', 'SKILL.md'), /scope\.js["'`]?\s+get unresolved\b/, 'read the unresolved-defect record with `scope.js get unresolved`, never through cwd-dependent `status`'],
  [path.join('skills', 'ship', 'SKILL.md'), /scope\.js["'`]?\s+get degraded\b/, 'read the degrade record with `scope.js get degraded`, never through cwd-dependent `status`'],
  // ADR 0035's two-document agreement on the deferred record. A `/superdev:review` that stops writing it
  // leaves the finding in chat output alone, which is the durability gap the record exists to close; a
  // `/superdev:ship` that stops reading it writes a pull-request body missing the one item nobody has
  // planned yet. Either half alone reads correct, and the ledger keeps a bullet no reader ever sees.
  [path.join('skills', 'review', 'SKILL.md'), /scope\.js["'`]?\s+deferred add\b/, 'record a deferred finding with `scope.js deferred add`'],
  [path.join('skills', 'ship', 'SKILL.md'), /scope\.js["'`]?\s+get deferred\b/, 'read the deferred-finding record with `scope.js get deferred`, never through cwd-dependent `status`'],
  [path.join('skills', 'status', 'SKILL.md'), /scope\.js["'`]?\s+status\b/, 'produce the report with `scope.js status` and print it verbatim'],
  [path.join('skills', 'afk', 'SKILL.md'), /scope\.js["'`]?\s+get stage\b/, 'read a run\'s stage with `scope.js get stage`'],
  [path.join('references', 'implement-full.md'), /scope\.js["'`]?\s+slice\b/, 'move slice rows with `scope.js slice`'],
  [path.join('references', 'implement-lite.md'), /scope\.js["'`]?\s+slice\b/, 'move slice rows with `scope.js slice`'],
  [path.join('references', 'scope-mode.md'), /scope\.js["'`]?\s+degraded add\b/, 'write the degrade entry with `scope.js degraded add`'],
  // ADR 0031's three-document agreement on one header. A lite playbook that stops writing the record
  // leaves every later command dispatching the writer it was meant to skip; a `/superdev:document` that
  // stops reading it does the same while the record sits there; a `/superdev:review` that stops clearing
  // it ships documentation written before the fix that made it wrong.
  [path.join('references', 'implement-lite.md'), /scope\.js["'`]?\s+docs set\b/, 'record its inline doc pass with `scope.js docs set`'],
  [path.join('skills', 'document', 'SKILL.md'), /scope\.js["'`]?\s+get docs\b/, 'read the inline-doc-pass record with `scope.js get docs` before it dispatches a writer'],
  [path.join('skills', 'review', 'SKILL.md'), /scope\.js["'`]?\s+docs clear\b/, 'clear the inline-doc-pass record with `scope.js docs clear` when its fix loop lands commits'],
  // Retired (ADR 0069): `skills/publish-kb/SKILL.md` used to read the scope branch through a hand-run
  // `scope.js get branch` CLI call. `plugin/scripts/publish-kb.js`'s `resolveScopeBranch` reads it
  // instead by `require`ing `readLedgerHeader` from `scope.js` directly and verifying the result with
  // `git rev-parse --verify` — real code, not a CLI verb a document could stop naming, so a
  // verb-invocation-shaped row can never match it and a `require` failure surfaces as every publish
  // falling back to the shape scan rather than as silent drift. The contract's intent — read the
  // branch from the ledger, verified, ahead of guessing from branch-name shape — lives on as
  // `tests/publish-kb.test.js`'s ledger-route assertions: "the ledger's Branch line, once it verifies,
  // is trusted ahead of the shape scan" and "the ledger's Branch line is what gets tested, not merely
  // consulted then discarded", both of which exercise `resolveScopeBranch` against a real git repo.
  // Retired (ADR 0079): `scope.js base-lock` and its two rows on `references/run-init.md` are gone.
  // No superdev command commits to the base branch (INV-0001) — a dirty design doc in the invoking
  // checkout moves into the scopetree and is committed on the scope branch instead, so nothing left
  // ever needs the lock that used to serialise a base-branch write.
  // Retired (ADR 0083): `skills/plan/SKILL.md` used to read the scope branch with `get branch --root`
  // and run the containment test on it, to decide whether a `shipped` scope could still be appended to.
  // A shipped feature takes no append at all now, so that refusal reads one stage value and no branch —
  // `SHIPPED_APPEND_CONTRACTS` pins what replaced it.
  [path.join('skills', 'plan', 'SKILL.md'), /scope\.js["'`]?\s+get stage\b/, 'read a run root\'s ledger stage with `scope.js get stage`, never by hand-parsing `ledger.md`'],
];

// ADR 0079/0080: the planned handoff. `/superdev:plan` cuts the branch and scopetree itself, commits its
// design docs there on the scope branch, and writes a ledger at stage `planned` — the fact that hands the
// scope branch to `/superdev:implement` as ready, without either side ever touching the base branch. Four
// documents carry the agreement, and each pinned half reads correct alone: `scope.js` can rank `planned`
// below `implementing` and carry the `root <slug>` verb while `skills/plan/SKILL.md` stops writing the
// ledger or committing in the scopetree; `references/run-init.md` can still take a `planned` ledger while
// `scope-mode.md`'s cut rule stops naming it a `resumed` run kind; and either dispatch sentence in
// `skills/plan/SKILL.md` can stop citing `scope-mode.md`'s own rule while that rule still states it. Each
// row below is one of those halves.
const PLANNED_HANDOFF_CONTRACTS = [
  [path.join('scripts', 'scope.js'), /planned:\s*-1,\s*implementing:\s*0/, 'rank `planned` below `implementing` in `STAGE_RANK` (ADR 0079)'],
  [path.join('scripts', 'scope.js'), /case 'root':/, 'carry the `root <slug>` verb that resolves a run-root path with no ledger touch (ADR 0080)'],
  [path.join('skills', 'plan', 'SKILL.md'), /\*\*Write the ledger with `scope\.js init`, from the invoking checkout\*\*/, 'write the ledger with `scope.js init`, from the invoking checkout'],
  [path.join('skills', 'plan', 'SKILL.md'), /\*\*Commit what the scopetree holds, on the scope branch\.\*\*/, 'commit its design docs in the scopetree, on the scope branch, before writing the ledger'],
  [path.join('references', 'run-init.md'), /\*\*`planned`\*\*[\s\S]{0,120}skip `init`, move the\s+stage forward/, 'take a `planned` ledger by skipping `init` and moving the stage forward to `implementing`'],
  [path.join('references', 'scope-mode.md'), /A \*\*`planned`\*\* ledger is one instance of this run kind \(ADR 0079\)/, 'name a `planned` ledger as the `resumed` run kind `/superdev:plan` already cut'],
  [path.join('references', 'scope-mode.md'), /once `\/superdev:plan` has made its own cut \(ADR 0079\)/, 'name `/superdev:plan` as a second run-lock writer beside the execution playbooks'],
  [path.join('skills', 'plan', 'SKILL.md'), /scope-mode\.md`'s `## Cutting the scope branch` \(ADR 0079\)/, "cite `scope-mode.md`'s `## Cutting the scope branch` for its own cut rather than restating it"],
  [path.join('skills', 'plan', 'SKILL.md'), /write `<run-root>\/run\.lock` right after, per `## The run lock`/, 'write `<run-root>/run.lock` right after its own cut, per `## The run lock`'],
  // Critical review finding: `init` took no stage argument and stamped `planned` unconditionally, so
  // run init's own `fresh` path — the one caller with no `/superdev:plan` interval to enter through —
  // silently ran its whole implementation at stage `planned`. `init` now takes the entry stage as a
  // required argument with no default, and this is the `fresh` half of that fix: it must keep asking
  // for `implementing` by name, never rely on a default `scope.js` might grow back.
  [path.join('scripts', 'scope.js'), /INIT_ENTRY_STAGES\s*=\s*\['planned', 'implementing'\]/, "carry `init`'s entry-stage argument with no default (ADR 0079)"],
  [path.join('references', 'run-init.md'), /scope\.js"\s+init\s+<type>\/<scope>\s+implementing/, "pass `implementing` as `init`'s entry stage on the `fresh` path — the one caller with no `planned` interval to enter through"],
  // Triage #509/#510 closures: §2 moved its ledger write and its run-lock read to the cut itself, rather
  // than leaving either to §6, so both halves of that move are pinned rather than left to restate
  // themselves silently drifting apart from what §6 actually still does.
  [path.join('skills', 'plan', 'SKILL.md'), /"slices": \[\]\}` to `scope\.js init <type>\/<scope> planned`/, 'pass `planned`, never `implementing`, as `init`\'s entry stage for its own cut-time ledger write'],
  [path.join('skills', 'plan', 'SKILL.md'), /\*\*Write the ledger right here, at the cut — never wait for §6\.\*\*/, 'write the ledger right at the cut rather than waiting for §6 (closes triage #509)'],
  [path.join('skills', 'plan', 'SKILL.md'), /\*\*Read `<run-root>\/run\.lock` before this step's first write, whether or not a cut happens below\.\*\*/, "read `<run-root>/run.lock` before §2's first write, whether or not a cut happens below (closes triage #510)"],
  // Important review finding A: a `planned` ledger carrying no slice rows is an interview abandoned
  // between the cut and the slice-table write, not a normal `resumed`/adopted run — both the local-ledger
  // `planned` bullet and the adopt path check the store's slices before choosing `stage set` vs a re-init.
  [path.join('references', 'run-init.md'), /A `planned` ledger carrying no slice rows never reaches this stage-forward move/, 'name a `planned` ledger with no slice rows as an unresumed interview needing a store check, not a `stage set`'],
  [path.join('references', 'run-init.md'), /A successful adopt whose stage is `planned` and slice table is empty/, "apply the same store-check the local-ledger `planned` bullet does when an adopted snapshot lands at `planned` with an empty slice table"],
  [path.join('skills', 'plan', 'SKILL.md'), /adapted to a plan-time call passing[\s\S]{0,60}scope\.js init <type>\/\<scope\> planned/, "pass `planned` as `init`'s entry stage in the resume step (§6) where no `/superdev:plan` interval exists to enter through"],
];

// The four documents ADR 0080 flags as still building a run-root scopetree path against the invoking
// checkout's own cwd, rather than resolving it through `scope.js root <slug>`: unlike the artifact paths
// `RUN_ROOT_ARTIFACT_PATTERN` guards, a `scopetree` *directory* path is deliberately outside that
// alternation everywhere else, because most of its occurrences are real `git worktree add`-style commands
// run from the invoking checkout on purpose. These four instead address another run's scopetree from
// their own cwd, which may not be that checkout, so a reverted cwd-relative literal here is the same bug
// class with no legitimate reading.
const SCOPETREE_RUN_ROOT_DOCS = [
  path.join('skills', 'afk', 'SKILL.md'),
  path.join('skills', 'ship', 'SKILL.md'),
  path.join('skills', 'document', 'SKILL.md'),
  path.join('scripts', 'publish-kb.js'),
];
const SCOPETREE_RUN_ROOT_PATTERN = /\.superdev\/scopes\/[^\s`/]+\/scopetree\b/g;

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
  [path.join('skills', 'plan', 'SKILL.md'), /\.superdev\/kb-pending\//, 'stage the feature specification under `.superdev/kb-pending/` rather than sending it'],
  [path.join('skills', 'document', 'SKILL.md'), /\.superdev\/kb-pending\//, 'hand the doc-writer a `.superdev/kb-pending/` staging path'],
  [path.join('references', 'doc-pass.md'), /\.superdev\/kb-pending\//, 'write a remote backend\'s pages under `.superdev/kb-pending/`'],
];

// ADR 0031: the documentation pass is stated once, in `references/doc-pass.md`, and performed by two
// callers — the dispatched `doc-writer`, and the `lite` execution playbook's controller in its own
// context. A caller that stops reading the reference keeps performing a pass it no longer has the rules
// for, which is invisible to scan(): the file still exists and every other document still points at it.
// Anchored on the `Read` instruction rather than a bare path, for the reason CONTENT_TYPES_PATTERN
// states: a passing mention is not a read.
//
// The third row is the **dispatch-prose half** (ADR 0035, and root `AGENTS.md`'s rule of the same name).
// A contract the agent body carries also has to hold in the prose that dispatches it, because a
// controller writes its dispatch from what `skills/document/SKILL.md` says the writer does. That command used
// to paraphrase the pass ("It runs two passes, deleting stale text"), so a dispatch built from the
// paraphrase reached the writer while the two rows above stayed green — the reference owned the pass and
// nothing kept the dispatch pointing at it. `references/implement-lite.md` needs no such pairing: it is
// the caller, not a dispatcher, and its own row is already the instruction it acts on.
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
  [
    path.join('skills', 'document', 'SKILL.md'),
    /references\/doc-pass\.md[\s\S]{0,240}?[Nn]ame\s+that\s+reference\s+in\s+the\s+dispatch/,
    'name `references/doc-pass.md` in the dispatch it builds, rather than paraphrasing the pass the ' +
      'writer performs',
  ],
];

// ADR 0025: `/superdev:review` in scope mode is the only full-suite run left in the chain. The
// controller runs the full command itself, before dispatching `final-reviewer`, so a dispatch the
// permission classifier denies is a degraded review rather than a lost verification. Losing either half
// silently reopens the gap ADR 0025 closed: a command that stops running the suite itself falls back to
// leaving that run to the subagent, and a reviewer that stops deferring to the result it was handed runs
// the same suite a second time, which is the duplicate run this row exists to keep out. The ad-hoc branch
// is untouched — a range with no controller-run suite behind it is the one place the reviewer's own re-run
// is the only verification there is. Two more rows guard the fail path itself, added on
// re-review: a `review.md` that stops folding a red full suite into the fix loop as a Critical finding
// lets a red gate pass through unfixed, and a `final-reviewer.md` that stops making `Full-suite run: fail`
// disqualifying on its own lets the other four axes argue a red suite back to "Yes". The `skills/review/SKILL.md`
// "stage does not advance" row guards the clause that actually blocks a red scope: a `review.md` that keeps
// the fail-is-Critical wording but drops "The stage does **not** advance while it stands" would still name
// the finding without holding up the handoff over it. The `skills/review/SKILL.md` dispatch row guards the
// dispatch sentence itself: `review.md`'s prose reaches `final-reviewer` at runtime alongside the agent
// body, so a leaked "its own re-run stays optional" clause there defeats the deferral
// `final-reviewer.md`'s own row above states, on the live path, regardless of what the agent file says.
const FULL_SUITE_CONTRACTS = [
  [
    path.join('skills', 'review', 'SKILL.md'),
    /run the full (?:test )?suite (?:itself|yourself)[\s\S]{0,60}before dispatching/i,
    'run the full suite itself, before dispatching `final-reviewer`, per ADR 0025',
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /review against whichever result you are handed[\s\S]{0,120}running no suite of your own/i,
    'state that on a live scope run it reviews against whichever result it is handed — full or focused — and runs no suite of its own',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /hand it that result[\s\S]{0,60}tell it to review against that result[\s\S]{0,60}running no suite of its own/i,
    'hand `final-reviewer` the result and tell it to review against that result, running no suite of its own — never that its own re-run "stays optional"',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /a `?fail`?[\s\S]{0,20}is itself a Critical finding[\s\S]{0,60}fold it into the fix\s+loop/i,
    'state that a `fail` here is itself a Critical finding, folded into the fix loop',
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /`?Full-suite run:\s*fail`?\s+makes the verdict\s+`?Ready to merge\?\s*No`?/i,
    'state that `Full-suite run: fail` makes the verdict `Ready to merge? No` on its own',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /the stage does\s+\*\*not\*\*\s+advance while it stands/i,
    'state that the stage does **not** advance while a full-suite fail or Critical/Important finding stands',
  ],
  // ADR 0075's own rows, on both ends of the same dispatch. The entry run above is unchanged; these pin
  // the loop: the cycle's own focused run, the exit run that is the actual gate (with its denied-run local
  // deviation, the same shape the entry run's own row above pins), and the dispatch prose that reaches
  // `final-reviewer` at runtime — the live path, and the half this table has already lost once. A
  // `review.md` that keeps the entry run and drops the exit run reads complete and advances a stage on a
  // suite that never saw the fixes; one that drops the focused cycle run silently reinstates a full suite
  // per cycle, which is the cost ADR 0075 removed; one that drops the exit run's own local deviation
  // advances an unattended stage on the entry run's suite alone.
  [
    path.join('skills', 'review', 'SKILL.md'),
    /focused command over the fix diff[\s\S]{0,200}?hand that result to the re-review/i,
    'run the focused command over the fix diff inside each cycle and hand that result to the re-review',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /fix cycle's re-review verdict first comes back clean[\s\S]{0,160}?run the full suite once more[\s\S]{0,400}?counts toward the 3-strike cap/i,
    "run the full suite once more when a fix cycle's re-review verdict first comes back clean, and count a red result there toward the 3-strike cap",
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /denied exit run takes the entry run's\s+own local deviation[\s\S]{0,600}?\*\*Unattended\*\*\s*→\s*\*\*block\*\*/i,
    'give a denied exit run the entry run\'s own local deviation — record and continue attended, block unattended — rather than the generic record-and-continue default',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /whichever result you hand it[\s\S]{0,120}(?:full or focused|focused or full)/i,
    'tell `final-reviewer` it reviews against whichever result it is handed, full or focused',
  ],
  // The `references/run-handoff.md` row: its run handoff is the other end of ADR 0025. An
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

// ADR 0035: `/superdev:review`'s fix loop may change **how** the code meets the Definition of Done, and a
// remedy that adds a capability the Definition of Done never named is recorded and handed to
// `/superdev:plan` instead. Repairing a defect in what the Definition of Done does name stays in the loop,
// which is why the boundary is drawn at the Definition of Done rather than at "behaviour" — a defect
// repair is frequently behavioural.
//
// Three rows, because any one alone is useless. A boundary with no destination leaves the finding
// nowhere to go, so the fix cycle builds it anyway; a destination with no boundary never fires; and a
// boundary with no exit deadlocks the run the moment a finding actually gets deferred — every path §4
// offers to advance past a Critical finding either fires on it anyway (`--unattended → fix`) or never
// fires at all (the clean-verdict advance), with no record class standing in for it (ADR 0035 refuses the
// run state a new field). Nothing else in the chain notices a boundary that has quietly become advice —
// the review just returns a bigger diff, green, and the scope grows by however much the remedy was.
// All three patterns avoid the bare "capability the Definition of Done never named" phrase, which §3's report
// template also carries (`### Deferred to a plan`). A row anchored on the phrase alone is satisfied by that
// template while §4's instruction is gone — which is the same one-sided-pin failure ADR 0035 came from,
// reproduced inside the check meant to prevent it. Row one takes §4's own "changes how" framing, row two
// takes the boundary together with the verb that sends the finding somewhere, row three takes the exit
// together with the "counts as clean" clause that actually lets a run advance past a deferred finding.
const FIX_BOUNDARY_CONTRACTS = [
  [
    path.join('skills', 'review', 'SKILL.md'),
    /fix\s+loop\s+changes\s+how[\s\S]{0,80}?Definition\s+of\s+Done/i,
    "state that the fix loop changes how the code meets the Definition of Done",
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /adds?\s+a\s+capability\s+the\s+Definition\s+of\s+Done\s+never\s+named[\s\S]{0,120}?recorded\s+and\s+handed\s+to[\s\S]{0,40}?\/superdev:plan/i,
    'hand a remedy that adds a capability the Definition of Done never named to `/superdev:plan`, so the ' +
      'boundary names where the work goes instead of only where it stops',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /enters\s+no\s+fix\s+loop[\s\S]{0,60}?not\s+an\s+unresolved\s+defect[\s\S]{0,220}?--unattended[\s\S]{0,320}?counts\s+as\s+clean/i,
    'state that a deferred finding enters no fix loop and is not an unresolved defect, taking precedence ' +
      'over `--unattended → fix`, and that a verdict whose only remaining findings are deferred counts as ' +
      'clean — the exit a deferred finding needs so the run does not deadlock on it',
  ],
];

// ADR 0037. `/superdev:review` skips `simplicity-reviewer` on a `full`-tier scope, because that tier
// already ran it per `behavior` slice and applied the cuts before each slice merged — a `mechanical`/`docs`
// slice gets no per-slice pass either way, and the skip's own report line names that condition rather than
// claiming blanket coverage. The skip is therefore not a
// property of `skills/review/SKILL.md` alone: it is only sound while `implement-full.md` still dispatches
// the reviewer per `behavior` slice. Three rows. Two sit one per end of that dependency, because either
// row alone is a one-sided pin. A `skills/review/SKILL.md` that loses the skip costs a redundant pass and
// nothing more, so the interesting direction is the other one: an `implement-full.md` that stops
// dispatching `simplicity-reviewer` per `behavior` slice leaves a `full` run with no over-engineering pass
// anywhere in the chain, while `skills/review/SKILL.md` goes on skipping on the strength of a per-slice
// pass that no longer happens — green everywhere, covered nowhere. The `lite` half needs no row: that
// tier dispatches nobody, so its whole-scope pass has no per-slice pass to be redundant against, and the
// `skills/review/SKILL.md` row states the tier it fires on rather than the tiers it does not. The third
// row pins the `behavior` qualifier itself, on the report line alone: the prose already drifted once, to
// an unqualified "covered per slice", and neither of the first two rows' regexes mentions the word —
// losing the qualifier would otherwise stay green.
const TIER_SKIP_CONTRACTS = [
  [
    path.join('skills', 'review', 'SKILL.md'),
    /`?full`?[- ]tier[\s\S]{0,120}?skip\s+`?superdev:simplicity-reviewer`?[\s\S]{0,400}?[Bb]revity/,
    'skip `superdev:simplicity-reviewer` on a `full`-tier scope, naming `final-reviewer`’s Brevity axis ' +
      'as what covers the cross-slice case the per-slice passes could not see',
  ],
  [
    path.join('references', 'implement-full.md'),
    /dispatch[\s\S]{0,40}?`superdev:simplicity-reviewer`[\s\S]{0,60}?apply\s+warranted\s+cuts/i,
    'dispatch `superdev:simplicity-reviewer` per `behavior` slice and apply the warranted cuts — the ' +
      "per-slice pass `skills/review/SKILL.md`’s full-tier skip stands on",
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /skip\s+`?superdev:simplicity-reviewer`?[\s\S]{0,180}?covered per `?behavior`? slice/,
    'qualify the full-tier skip’s coverage claim to `behavior` slices, on the bullet that states the skip ' +
      'itself rather than on a copy of the phrase elsewhere — `implement-full.md` skips both per-slice ' +
      'reviews for a `mechanical`/`docs` slice, so an unqualified "covered per slice" on that bullet is a ' +
      'false statement about that slice’s code, and the phrase has already drifted once at exactly this ' +
      'site while a second, unrelated occurrence elsewhere stayed correct',
  ],
];

// ADR 0039. The unattended block on a denied dispatch exists to stop a pull request whose only review was
// its author reviewing itself, so it fires on authorship rather than on the denial: a `full`-tier
// controller wrote none of the code a denied `final-reviewer`, `slice-reviewer`, or `doc-reader` would
// have verified. `scope-mode.md` states the rule, and the four documents that dispatch a verification
// pass carry it too — a dispatch is the later, more specific instruction, so a call site still reading
// "unattended → block" wins the conflict and the central rule becomes prose nothing executes (ADR 0035).
// That is the one-sided pin this table exists to prevent, and it is why the call sites are pinned on the
// condition rather than on a pointer to the section.
// ponytail: shape-based prose guard — it catches the fixed phrases below, not every paraphrase; the
// reviewer's eye covers the rest, and a stricter grammar is the upgrade if paraphrase drift ever appears.
const DENIAL_AUTHORSHIP_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /verification dispatch/,
    'name the verification dispatches the authorship rule governs, so a denied `implementer` stays outside it',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /controller authored/,
    'key the unattended block on whether the controller authored what the denied pass verifies',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /slice rows/,
    "derive the tier from the ledger's slice rows, so the authorship test reads run state rather than memory",
  ],
  // `references/run-handoff.md` is deliberately absent: its denial case is the full-suite Bash command,
  // and the only dispatch it makes is an implementer on a red suite. Neither is a verification dispatch,
  // so no prose there can contradict the rule.
  ...[
    path.join('skills', 'review', 'SKILL.md'),
    path.join('skills', 'document', 'SKILL.md'),
    path.join('skills', 'implement', 'SKILL.md'),
    path.join('references', 'implement-full.md'),
  ].map((rel) => [
    rel,
    /controller authored/,
    'carry the authorship condition into the prose that dispatches the pass, rather than instructing an ' +
      'unconditional unattended block',
  ]),
];

// ADR 0041. ADR 0039 lets an unattended run continue past a denied verification dispatch it did not
// author, and nothing counted how many it absorbed. Claude Code's auto mode counts anyway: three
// consecutive denials, or twenty in a session, stop the model, and a headless run terminates outright.
// That termination is not superdev's block — no `blocked` label, no comment, a stranded run root — so the
// run caps itself at two first. The cap is only real where the recording call sites feed it: a caller
// recording with plain `degraded add` writes a bullet the count cannot see, and one that never reads
// `get denials` continues past every denial exactly as before. Both leave the central rule inert, the
// same one-sided pin the table above exists to prevent, so the call sites are pinned on the verb and the
// read rather than on a pointer to the section.
// ponytail: shape-based prose guard, matching the two call shapes rather than every paraphrase around
// them; a stricter grammar is the upgrade if paraphrase drift ever appears.
const DENIAL_CAP_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /second denied verification dispatch/,
    'state the cap: an unattended run blocks on its second denied verification dispatch',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /degraded add-denial/,
    'record a denied verification dispatch with `scope.js degraded add-denial`, so the count can tell it ' +
      'from the other degraded shape sharing that line',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /get denials/,
    "read the running count with `scope.js get denials`, so the cap reads the run's own ledger rather " +
      "than the controller's memory of this session",
  ],
  ...[
    path.join('skills', 'review', 'SKILL.md'),
    path.join('skills', 'document', 'SKILL.md'),
    path.join('skills', 'implement', 'SKILL.md'),
    path.join('references', 'implement-full.md'),
  ].flatMap((rel) => [
    [
      rel,
      /add-denial/,
      'record its denied verification dispatch with `scope.js degraded add-denial`, so the bullet reaches ' +
        'the count the cap reads',
    ],
    [
      rel,
      /get denials/,
      'read `scope.js get denials` before continuing inline, rather than continuing on every denial the ' +
        'authorship rule lets through',
    ],
  ]),
  // The three counted verification dispatches are a closed set (`final-reviewer`, `slice-reviewer`,
  // `doc-reader`). A call site that dispatches both an authoring pass (implementer, fix, doc-writer) and
  // a verification one in the same breath has to tie `degraded add` to the former and `degraded
  // add-denial` to the latter — otherwise every denial in that breath reads as a classifier denial, which
  // it always is in context, and the plain-`add` branch is dead: a denied implementer or doc-writer would
  // then wrongly feed the count too.
  ...[
    path.join('skills', 'review', 'SKILL.md'),
    path.join('skills', 'document', 'SKILL.md'),
    path.join('skills', 'implement', 'SKILL.md'),
    path.join('references', 'implement-full.md'),
  ].map((rel) => [
    rel,
    /authoring dispatch/,
    'tie the plain `add` verb to an authoring dispatch by name, so a denied implementer, fix, or ' +
      'doc-writer is never recorded as if it counted toward the cap',
  ]),
  // `simplicity-reviewer` is advisory and outside the closed set above, at every tier it is dispatched.
  // `implement-full.md` is the one document that dispatches both it and the tier's one verification
  // dispatch (`slice-reviewer`) under the same authorship rule, so it is the one place the cap's own text
  // can drift wide enough to bound a denied `simplicity-reviewer` too.
  [
    path.join('references', 'implement-full.md'),
    /outside that cap/,
    "narrow the cap to `slice-reviewer` alone, so a denied `simplicity-reviewer`'s advisory pass never " +
      'counts toward it',
  ],
];

// ADR 0044. The cap above is append-only, so a run that hit it stayed capped however thoroughly a human
// addressed the cause: the resumed run reads the same two bullets and blocks on the next denial from any
// cause. The reset returns the budget and leaves every bullet standing. It is only reachable where both
// documents state it — the section defining the cap, which is where a reader of the cap already is, and
// the block comment a capped run leaves, which is where the maintainer who fixed the cause is reading.
// A reset stated centrally and never named by the block is a way back nobody finds.
const DENIAL_RESET_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /degraded reset-denials '<reason>'/,
    'state the reset beside the cap it releases: `scope.js degraded reset-denials \'<reason>\'`, whose ' +
      'reason is required',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /count runs from the last reset marker.{0,120}surviv/s,
    'state what the reset does to the count and to the record: the count runs from the last reset ' +
      'marker, so every recorded denial survives it',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /reset is a human act/,
    'state that a reset is a human act, so no command in the chain performs one — an automatic reset ' +
      'would return the budget with the cause still in place',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /comment on the anchor.{0,400}reset-denials/s,
    'name the reset command in the block a capped unattended run leaves, so the maintainer who read the ' +
      'quoted refusal and fixed the cause finds the way back where they are already reading',
  ],
];

// ADR 0046. A **triage record** is the store-native record a deferred finding gets
// (`references/plan-contract.md` → `## Triage record`), and it is the only home that outlives the run root
// `hooks/scope-prune.js` reaps and the scope anchor `/superdev:ship` closes — on the local plan-file store,
// only once the scope branch carrying it merges (ADR 0048). `/superdev:review` writes it
// through the active store document, so a store document with no `## Triage record` section leaves the
// command asking a backend for a record that backend never defined: the review defers, the ledger bullet
// is written, and the finding reaches no backlog anywhere. `scanTriageRecordContract()` (`scanners.js`) walks
// `storeDocuments()` for the presence half — the same candidate list the anchor and release contracts
// already walk, including a backend seed added later and this repo's own dogfooded
// `docs/agents/issue-tracker.md` — rather than naming the seeds here, so a fifth backend gets the
// requirement for free instead of a second row nobody remembers to add.
const TRIAGE_RECORD_PATTERN = /^#{2,3}\s+Triage record\s*$/m;

const TRIAGE_RECORD_EXPECTATION =
  'carry a `## Triage record` section stating how this backend creates the record a deferred finding ' +
  'gets, per ADR 0046';

// The heading alone is not the whole contract, the same asymmetry `ANCHOR_ELEMENTS` corrects for its own
// section. Every store document states how to **create** a record and, without this element, none states
// how to **read one back** — so the record `/superdev:review` writes to surface unplanned work reaches no
// consumer, which is the outcome ADR 0046 exists to prevent one step earlier. `/superdev:backlog` is the
// first reader, and reaches every backend through this clause rather than encoding one store's query.
// The pattern is anchored on a bullet's bolded lead-in and needs both the listing verb and its object
// inside that lead-in: `references/issue-tracker-local.md` already carries a bullet whose bold ends on
// "candidate listing" while stating the opposite — that a record is invisible to `/superdev:afk` — so a
// bare `list` anchor would read that document's exclusion rule as its listing contract.
// A second element, beside the listing one above: `plan-contract.md`'s own generic `## Triage record`
// section already promises the outcome ("No candidate listing and no slice loader ever selects it"), but
// nothing held a store's own section to restating it — a fifth backend seed could carry a create call and
// a list call, omit the exclusion clause entirely, and this scanner passed it clean (issue #357). The
// pattern requires the section to echo that same vocabulary, "candidate listing", which every seed already
// does in its own exclusion bullet ("No feature label and no `ready` label. Those two are what
// `/superdev:afk`'s candidate listing … select on", or the local seed's "invisible to `/superdev:afk`'s
// candidate listing"), so no seed document needs editing — only the checker gains teeth.
const TRIAGE_RECORD_ELEMENTS = [
  [/^[-*] \*\*[^*]*\blist\w*\b[^*]*\b(?:record\w*|them)\b/im, "how to list this backend's triage records"],
  [/candidate listing/i, "how this backend keeps the record out of its own candidate listing"],
];

// The Untriaged item survey slice (feat/backlog-untriaged, issue #400). An **untriaged item** is an open
// store record superdev never wrote: no feature label, no triage signal (`CONTEXT.md`'s glossary entry).
// `scanUntriagedContract()` (`scanners.js`) walks `storeDocuments()` for the presence half — the same
// candidate list the anchor, release, and triage-record contracts already walk — rather than naming the
// seeds here, so a fifth backend gets the requirement for free instead of a second hardcoded row. Unlike
// the triage-record and anchor contracts, `plan-contract.md` carries no generic `## Untriaged item`
// section to specialise: `CONTEXT.md`'s glossary entry already sends a reader to "that store's own
// `## Untriaged item` section" directly, so this member has no citation half to enforce.
const UNTRIAGED_PATTERN = /^#{2,3}\s+Untriaged item\s*$/m;

const UNTRIAGED_EXPECTATION =
  'carry a `## Untriaged item` section stating how this backend recognises an untriaged item, how it ' +
  'lists them, and how it reads one\'s age';

// The heading alone is not the whole contract, the same asymmetry `ANCHOR_ELEMENTS` corrects for its own
// section: without the recognise element a backend never states what makes a record untriaged, without
// the listing element it never states its listing call, and without the read-age element it never states
// how to order one — any one missing leaves `/superdev:backlog` reaching no untriaged item on that
// backend.
const UNTRIAGED_ELEMENTS = [
  [/^[-*] \*\*[^*]*recogni[sz]/im, 'how to recognise an untriaged item'],
  [/^[-*] \*\*[^*]*\blist\w*\b[^*]*\b(?:item\w*|them)\b/im, "how to list this backend's untriaged items"],
  [/^[-*] \*\*[^*]*\bread\w*\b[^*]*\bage\b/im, "how to read an untriaged item's age"],
];

// ADR 0049. `/superdev:backlog` surveys the slice store and reports every open scope anchor and every
// triage record by the action it needs. Three clauses make it what it is, and each fails silently on its
// own — a survey that has quietly started writing looks identical in its own output, one that has learned
// a backend's own query works perfectly on this repo and is blind on every other, and one that derives a
// stage from git instead of the ledger disagrees with `/superdev:status` about the same scope with nothing
// going red. It deliberately shares no eligibility reference with `/superdev:afk` (ADR 0049), so nothing
// here pins the two rule sets to each other: the coupling that matters is to the store document, which
// the first three rows below are — the third added for the untriaged-item bucket.
const BACKLOG_SURVEY_CONTRACTS = [
  [
    path.join('skills', 'backlog', 'SKILL.md'),
    /`## Scope anchor`/,
    "read the candidates through the store document's `## Scope anchor` section, naming no backend's own " +
      'listing call',
  ],
  [
    path.join('skills', 'backlog', 'SKILL.md'),
    /`## Triage record`/,
    "read the triage records through the store document's `## Triage record` section, which is where the " +
      'listing call for each backend lives',
  ],
  [
    path.join('skills', 'backlog', 'SKILL.md'),
    /`## Untriaged item`/,
    "read the untriaged items through the store document's `## Untriaged item` section, which is where " +
      'the listing call for each backend lives',
  ],
  [
    path.join('skills', 'backlog', 'SKILL.md'),
    /scope\.js["'`]?\s+get stage\b/,
    "read an in-flight scope's stage with `scope.js get stage`, the same ledger `/superdev:status` reports " +
      'from, rather than deriving one from git state',
  ],
  // Anchored on a bolded run that opens its own line, not merely a bolded run somewhere in the document:
  // `[^*\n]` keeps the run from crossing into a later `**` or across a line break, so the pattern cannot
  // span from one bold run's closing `**` to a later one's opening `**` with unbolded prose — including a
  // hedge like "mostly writes nothing" — sitting unmatched in between. "writes nothing" is exactly the
  // kind of phrase that recurs in passing prose about some other command, and a passing mention is not
  // the contract.
  [
    path.join('skills', 'backlog', 'SKILL.md'),
    /^\*\*[^*\n]*writes? nothing[^*\n]*\*\*/im,
    'state as a contract that the survey writes nothing — no record, no label, no comment, no file',
  ],
];

// The writer's half is two documents, and each fails alone. `skills/review/SKILL.md` is what actually creates
// the record, at the one bullet that already runs `deferred add`: a bullet that drops the clause writes the
// ledger entry and no record, which is the state ADR 0046 exists to end, and nothing goes red.
// `references/scope-mode.md` owns the entry's shape for every reader of it — `/superdev:ship` copies the
// bullet, `/superdev:status` prints it — so a section that never mentions the record leaves the reference
// in the bullet unexplained. Neither row pins the mechanics: those are the store's, and pinning them here
// would hardcode a backend into a tool-agnostic document. The store-presence half runs separately, as
// `scanTriageRecordContract()`, over the same candidate list `scanAnchorContract`/`scanReleaseContract` use.
const TRIAGE_RECORD_CONTRACTS = [
  [
    path.join('skills', 'review', 'SKILL.md'),
    /create the triage record[\s\S]{0,700}deferred add/,
    'create the triage record in the configured slice store **before** the `scope.js deferred add` write, ' +
      "and carry the record's reference in the bullet text",
  ],
  [
    path.join('references', 'scope-mode.md'),
    /triage record[\s\S]{0,900}`docs\/agents\/issue-tracker\.md`/,
    'name the triage record as part of the deferred-finding record, and defer the per-backend mechanics ' +
      'to the active `docs/agents/issue-tracker.md`',
  ],
];

// The four call sites above must never restate the cap's own number: `references/scope-mode.md`'s
// `## Degraded passes` section states it once, and a call site names that section by reference instead of
// repeating the digit. `DENIAL_CAP_CONTRACTS` above only pins the verbs (`add-denial`, `get denials`), so
// a call site that restates the number can drift to a different one — "three or more" — while every row
// above still matches and `bun run test` stays green. This scans for that restatement instead of pinning
// a presence, the same asymmetry `DOC_STEP_SILENCE_DOCS` uses for the full-suite instruction.
const DENIAL_CAP_NUMBER_SILENCE_DOCS = [
  path.join('skills', 'review', 'SKILL.md'),
  path.join('skills', 'document', 'SKILL.md'),
  path.join('skills', 'implement', 'SKILL.md'),
  path.join('references', 'implement-full.md'),
];

const DENIAL_CAP_NUMBER_MARKERS = [
  [
    /\b(?:one|two|three|four|five)\s+or\s+more\b/i,
    (hit) =>
      `defer to \`references/scope-mode.md\`'s \`## Degraded passes\` section for the cap by name, ` +
      `instead of restating a number of its own: "${hit[0]}"`,
  ],
  [
    /\bsecond\s+(?:denials?|denied)\b/i,
    (hit) =>
      `defer to \`references/scope-mode.md\`'s \`## Degraded passes\` section for the cap by name, ` +
      `instead of restating a number of its own: "${hit[0]}"`,
  ],
  [
    /\bcap\s+is\s+(?:one|two|three|four|five|\d+)\b/i,
    (hit) =>
      `defer to \`references/scope-mode.md\`'s \`## Degraded passes\` section for the cap by name, ` +
      `instead of restating a number of its own: "${hit[0]}"`,
  ],
  [
    /\bat\s+(?:one|two|three|four|five|\d+)\s+denials?\b/i,
    (hit) =>
      `defer to \`references/scope-mode.md\`'s \`## Degraded passes\` section for the cap by name, ` +
      `instead of restating a number of its own: "${hit[0]}"`,
  ],
];

// ADR 0025 from the other side. The two chain steps after the review, and the writer the first of them
// dispatches, run no full suite: `/superdev:review` owns the scope's one run, so a run added to
// `skills/document/SKILL.md`, `skills/ship/SKILL.md`, or `agents/doc-writer.md` is a second pass over a tree the
// review already verified. Prose is the wrong guard for it — root `AGENTS.md`'s prompt-the-positive rule
// keeps a "never run the suite" line out of always-loaded context, and a prohibition makes the forbidden
// behaviour more available rather than less. The silence is asserted here instead. Only these four
// documents are scanned: every other consumer of a test command runs one by design.
//
// `agents/final-reviewer.md` is the fourth, and it sits in both this list and FULL_SUITE_CONTRACTS above —
// deliberately. That table only asserts presence: a document carrying both the new "runs no suite of your
// own" clause and the old "your own re-run here stays optional" sentence it replaced reads as zero gaps
// there, because presence of the new clause is all a scanContract() row can check. An additive re-growth —
// the old clause coming back *beside* the new one, rather than replacing it — is exactly the shape a
// re-review found live, so this list's absence check is what actually forbids the old clause from
// returning.
//
// A gap is a **match**, the inverse of every table above, so this one drives its own scanner rather than
// scanContract(). The patterns are the shapes a real instruction takes in this repository: a bare
// imperative ("Run the full suite before opening the pull request" — the reflexive "yourself"/"itself"
// phrasing `skills/review/SKILL.md` used to use is one case of this, not a separate pattern), the
// take-it-from-the-config one `references/run-handoff.md` uses ("take the full command from … and run
// it"), and the optionality clause `agents/final-reviewer.md`'s own re-run sentence used to carry. A
// past-tense reference to a run that already happened stays legal, because `skills/ship/SKILL.md` says the run
// handoff *has run* the full suite, which is both true and load-bearing there, and so does
// `final-reviewer.md`'s legitimate ad-hoc "you may re-run the suite over the range" and its "the controller
// already ran the full suite itself" — neither is the optionality clause this list forbids.
const DOC_STEP_SILENCE_DOCS = [
  path.join('skills', 'document', 'SKILL.md'),
  path.join('skills', 'ship', 'SKILL.md'),
  path.join('agents', 'doc-writer.md'),
  path.join('agents', 'final-reviewer.md'),
];

// `\s+` between each word, because these documents are hard-wrapped and an instruction added to one wraps
// wherever it lands — the same tolerance the tables above get from scanContract()'s normalized retry, which
// the negative scanner behind these patterns does not run.
//
// The first pattern is a bare imperative, not a reflexive one: "Run the full suite before opening the pull
// request" and "Re-run the full suite before staging the pull request" are the ordinary way this
// instruction gets written, with no "itself"/"yourself" for the old reflexive-only pattern to anchor on
// (which this one replaces, being strictly broader — it still matches the reflexive phrasing too). The
// discriminator against a legal past-tense mention (`skills/ship/SKILL.md`'s "the run handoff has run the full
// suite") is the auxiliary, not the pronoun: a negative lookbehind for "has"/"have"/"had", optionally
// followed by up to two more words, before "run" — the same shape `RETURN_TO_CONTROLLER_PATTERNS`'s
// `HAND_BACK_VERB` (`hand(?:\s+\w+){0,2}\s+back\s+to`) already uses for "a verb and its object, a short
// run of words apart". A lookbehind anchored on the auxiliary sitting immediately before "run" instead
// false-positives on ordinary legal prose the auxiliary still governs from a distance — "has already run",
// "have not run", or a markdown hard break landing between the two — so the gap is `(?:\s+\w+){0,2}\s+`,
// not a single `\s`.
//
// The third pattern is `agents/final-reviewer.md`'s own — the optionality clause a re-review found
// additively re-grown beside the new deferral sentence, generalized past its exact wording ("stays
// optional" or "remains optional", the leading "own" optional too) so a rephrase of the same clause still
// trips it. It is scoped to that one document's own gap message by nothing in the pattern itself; the
// other two silence-only documents simply never carry this phrasing.
//
// The fourth pattern is the same bare imperative with the word "full" dropped ("Re-run the suite … before
// the handoff", "Run the whole suite once more before staging the pull request") — the same auxiliary
// discriminator applies, and the trailing `before` anchor is what keeps it off
// `agents/final-reviewer.md`'s legitimate ad-hoc "you may re-run the suite over the range to confirm green
// rather than trust the diff alone", which never carries a nearby "before" for an instruction to hang off.
//
// ponytail: this is a shape-based prose guard, not a grammar. It catches the phrasings named above — not
// every paraphrase a maintainer could write. The reviewer's eye covers the rest.
const SUITE_RUN_INSTRUCTIONS = [
  /(?<!\b(?:has|have|had)(?:\s+\w+){0,2}\s+)run\s+the\s+full\s+(?:test\s+)?suite/i,
  /take\s+the\s+full\s+command[\s\S]{0,120}?\band\s+run\s+it\b/i,
  /(?:own\s+)?re-run[\s\S]{0,60}?\b(?:stays|remains)\s+optional/i,
  /(?<!\b(?:has|have|had)(?:\s+\w+){0,2}\s+)run\s+the\s+(?:whole\s+)?suite\b[\s\S]{0,60}?\bbefore\b/i,
];

// Shipped agent prose stays tool-agnostic (root AGENTS.md → "Backends are pluggable"): the test command
// is `references/test-selection.md`'s to select from the consumer repo's own config, so a concrete
// package-manager or test-runner invocation inside `agents/*.md` is this repo's toolchain leaking into
// a brief that executes in consumer repos — `bun run test` shipped exactly that way, as a pipe example
// in three agent briefs. `skills/setup/SKILL.md` and `skills/document/SKILL.md` name such commands legitimately,
// as interview and focused-command examples, so the scan covers `agents/` alone.
//
// ponytail: shape-based, and its ceiling is the package managers and runners named below. A command from
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
// The documentation step reaches that case on every scope, since its range is its own prose commits.
// Shipped prose proposed `pytest {paths}` exactly that way, which is where ADR 0074 came from.
//
// The scan matches a runner token immediately followed by `{paths}` — with optional flags, path
// arguments, or a bare `--` separator between them — whether that shape is a live proposal or a
// backticked anti-example naming the same command (a mention such as `` `pytest {paths}` collects
// nothing `` still fires it). It stays off the prose explaining the rule only because the shipped docs
// never write a non-mapping runner and `{paths}` adjacent like that: they name both in one sentence but
// keep the token separated from the runner, which the pattern does not match.
//
// ponytail: a denylist, and its ceiling is the runners named below. One outside them passes silently
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

// The positive half of ADR 0074, and the denylist above is useless without it: a `skills/setup/SKILL.md`
// that stops deriving anything trips no denylist, and routes every non-mapping runner back to `none` —
// which is the full suite at every in-loop caller, the cost ADR 0025 was written to remove. Each row pins
// one branch the derivation takes, or one shape inside a branch, because losing any single row leaves a
// repository on the wrong command while the rest keep the check green.
//
// The self-detecting-flag rows guard the regression a `{paths}`-less fast subset and a `{paths}`-less
// self-detecting runner flag (`vitest --changed`, `jest -o`) once shared: both take the same shape in the
// derivation's second branch, but only the fast subset always collects. The flag computes the change set
// itself, exactly as a `{paths}` form does, so it needs that form's own pass-with-no-tests flag for the
// same reason — an empty set otherwise reports red on a suite that found nothing to run.
const PATHS_DERIVATION_CONTRACTS = [
  [
    path.join('skills', 'setup', 'SKILL.md'),
    /maps?\s+source\s+files?\s+to\s+the\s+tests[\s\S]{0,160}?\{paths\}`?\s+form/i,
    'derive a `{paths}` form only for a runner that maps source files to the tests covering them',
  ],
  [
    path.join('skills', 'setup', 'SKILL.md'),
    /runner\s+that\s+maps\s+nothing[\s\S]{0,200}?fast\s+subset/i,
    'offer a fast subset to a runner that maps nothing, rather than routing it to `none`',
  ],
  [
    path.join('skills', 'setup', 'SKILL.md'),
    /never\s+reaches\s+`?none`?[\s\S]{0,240}?already\s+cheap[\s\S]{0,200}?no\s+cheaper\s+subset/i,
    'never reach `none` for a repository with a suite — record which of the already-cheap or cannot-narrow cases applied (ADR 0085)',
  ],
  [
    path.join('skills', 'setup', 'SKILL.md'),
    /self-detecting\s+runner\s+flag[\s\S]{0,250}?pass-with-no-tests\s+flag/i,
    "carry a self-detecting `{paths}`-less runner flag's own pass-with-no-tests flag, the same as a `{paths}` form",
  ],
  // Anchored on the worked exemplars, which live only in the `## The {paths} token` section. The
  // generic "self-detecting runner flag … pass-with-no-tests flag" wording also appears in the
  // `## Fallback to the full command` paragraph the next row pins, so a row spelled that way is
  // satisfied by that paragraph alone: deleting this section's statement outright left the table green,
  // and the pair `scripts/AGENTS.md` bills as two independent guards was one and a half.
  [
    path.join('references', 'test-selection.md'),
    /vitest\s+--changed\s+--passWithNoTests[\s\S]{0,80}?jest\s+-o\s+--passWithNoTests/i,
    "state that a self-detecting `{paths}`-less runner flag carries its own pass-with-no-tests flag, in the `{paths}`-token section that names the worked forms",
  ],
  [
    path.join('references', 'test-selection.md'),
    /self-detecting\s+runner\s+flag[\s\S]{0,200}?not\s+this\s+fallback/i,
    'state that the empty-set fallback covers a fixed fast subset, never a self-detecting runner flag, which relies on its own pass-with-no-tests flag instead',
  ],
  // ADR 0085 / INV-0007: the write step always carries a second fence in a repository with a suite. Losing
  // this row leaves setup free to write only one fence again for the already-cheap/cannot-narrow cases,
  // which is the `none` outcome ADR 0085 removed, just moved from the derivation prose into the write step.
  [
    path.join('skills', 'setup', 'SKILL.md'),
    /second\s+fenced\s+block[\s\S]{0,200}?`?none`?\s+is\s+never\s+an\s+outcome[\s\S]{0,80}?ADR\s+0085/i,
    'write a second fenced block for every repository with a suite — never an outcome of `none` (ADR 0085, INV-0007)',
  ],
  [
    path.join('skills', 'setup', 'SKILL.md'),
    /runner\s+that\s+cannot\s+narrow[\s\S]{0,200}?duplicated\s+the\s+same\s+way/i,
    'show the cannot-narrow case as a worked example, the full command duplicated in the second fence with the reason recorded as prose beside it',
  ],
  // ADR 0085 / INV-0007: a repository carrying one fenced block never falls back to the full command
  // silently. Losing either half below reopens that silent inference in the shape it took before ADR
  // 0085 — a prose caller (or `/superdev:plan`/`/superdev:implement`'s own config step) that runs a
  // command instead of stopping, or a `hooks/green-gate.js` narrative that stops describing its one
  // documented exception.
  [
    path.join('references', 'test-selection.md'),
    /reports\s+the\s+missing\s+configuration\s+and\s+names\s+`\/superdev:setup`,\s+running\s+no\s+command[\s\S]{0,250}?auto-invoke\s+`\/superdev:setup`\s+on\s+missing\s+configuration/i,
    'stop naming `/superdev:setup` on one fenced block, unreachable once `/superdev:plan`/`/superdev:implement` have auto-invoked setup (ADR 0085, INV-0007)',
  ],
  [
    path.join('references', 'test-selection.md'),
    /hooks\/green-gate\.js`?\s+is\s+the\s+one\s+exception[\s\S]{0,200}?emits\s+a\s+one-line\s+notice\s+naming\s+`\/superdev:setup`/i,
    'name `hooks/green-gate.js` as the one exception that runs the full command and emits a notice instead of stopping (ADR 0085)',
  ],
  // A stop with no run root has no ledger to write `scope.js degraded add` to, so it takes only the
  // report half of `## Degraded passes`' "pass that cannot complete its own work" shape. Losing this
  // row reopens the silent-skip gap ADR 0085's degraded-pass sentence closed: a caller with no run root
  // reading only the neighbouring two rows above still has no instruction naming which half it can take.
  [
    path.join('references', 'test-selection.md'),
    /`## Degraded passes`[\s\S]{0,150}?pass that cannot complete its own work[\s\S]{0,250}?no run root[\s\S]{0,150}?report half/i,
    'route the stop through `references/scope-mode.md`\'s `## Degraded passes` "pass that cannot complete its own work" shape, and say that a caller with no run root takes only its report half',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /carrying\s+one\s+fenced\s+block[\s\S]{0,40}?missing\s+configuration\s+too[\s\S]{0,120}?ADR\s+0085,\s+INV-0007[\s\S]{0,60}?\/superdev:setup/i,
    "treat `docs/agents/verification.md` carrying one fenced block as missing configuration, auto-invoking `/superdev:setup` (ADR 0085, INV-0007)",
  ],
  [
    path.join('skills', 'implement', 'SKILL.md'),
    /carrying\s+one\s+fenced\s+block[\s\S]{0,40}?missing\s+configuration\s+too[\s\S]{0,120}?ADR\s+0085,\s+INV-0007[\s\S]{0,60}?\/superdev:setup/i,
    "treat `docs/agents/verification.md` carrying one fenced block as missing configuration, auto-invoking `/superdev:setup` (ADR 0085, INV-0007)",
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
// ADR 0069 moved that job into `plugin/scripts/publish-kb.js`, a real `/bin/sh -c` call this
// instruction-shape scan has no purchase on and was never asked to reach — this list stays scoped to
// the prose surfaces that must merely *describe* the backend rather than call it, and
// `skills/publish-kb/SKILL.md` (which dispatches the script) is exempt the same way it always was.
//
// A marker built from a backend's literal endpoint or credential (`api/v2/pages`,
// `CONFLUENCE_API_TOKEN`) catches almost nothing: AGENTS.md's "Backends are pluggable" rule already
// forbids these documents from naming a backend at all, so that literal can only appear in a document
// that already breaks a different rule. What a real regression reads like instead is an instruction
// shape — a backend-directed verb aimed at a knowledge-base object — regardless of which backend or
// whether it names one at all. The pre-ADR-0023 doc-writer.md ("Publishing to a **KB/wiki** host…",
// "create pages only for genuinely new outline entries") is the reference case this is built to catch.
const KB_NO_CALL_DOCS = [
  path.join('skills', 'plan', 'SKILL.md'),
  path.join('skills', 'document', 'SKILL.md'),
  path.join('agents', 'doc-writer.md'),
  path.join('references', 'doc-pass.md'),
];

const KB_OBJECT = 'pages?|wiki|space|backend';

// ponytail: shape-based, and its ceiling is the verb morphology below plus the backends named there.
// A call phrased with a verb no row carries ("hand the page to Confluence", "sync the wiki"), or one
// naming a backend added later, passes silently. The staging convention (ADR 0023) is what makes that
// tolerable: a document reaching a backend has to also stop staging, and `kb-staging` catches that half.
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
// ponytail: a literal-shape tripwire, and the comment above already names what it misses — a reader
// built from `split('\n')` and `indexOf('**Stage:**')` carries no regex for this to see. That gap is
// deliberate rather than unclosed: `hooks/scope-prune.js --selftest`'s orphan test exercises the real
// reader against real input and fails the moment a hook stops using it, which is the guard that holds.
const HOOK_HEADER_REGEX = /\\+\*\\+\*[^\n]{0,60}:\\+\*\\+\*/;

// ADR 0025: every run inside the TDD/inline loop is focused, and `references/test-selection.md` owns the
// rule that picks the focused command over the full one. Each loop consumer reads that file at runtime
// instead of restating the rule, so the wire is what can drift: a consumer can drop the read/apply
// instruction while the reference still resolves (scan() above stays green), which leaves the suite green
// and the narrowing silently gone in every dispatch — the same failure shape as the content-types and
// unattended-token contracts. Anchored on `Read … test-selection.md` **and** the substantive clause "run
// the command it selects" that follows it in every real document — `\s+` between each word tolerates the
// prose wrap, since a real document wraps somewhere in that span and not every one wraps at the same
// word (or wraps it at all). A pattern anchored
// on the bare `Read … test-selection.md` mention alone (`CONTENT_TYPES_PATTERN`'s shape) would pass a
// document that keeps the reference in a passing aside but drops the instruction to run what it selects —
// the same anti-pattern `FULL_SUITE_CONTRACTS` avoids by anchoring on its own substantive clause.
//
// **Judged for the dispatch-prose rule** (root `AGENTS.md`, ADR 0035) and deliberately left one-sided:
// `agents/implementer.md` and `agents/slice-reviewer.md` are dispatched by `references/implement-full.md`,
// whose dispatch steps name no test command at all — they hand a slice and let each agent read this
// reference itself. There is no dispatch sentence about test selection for a row to pair with, so pairing
// one would pin prose that does not exist. `skills/document/SKILL.md`'s row here is the doc step as a caller
// of the rule, not as a dispatcher of it. A dispatch step that starts naming a test command is what would
// change this judgment, and the rule in root `AGENTS.md` is what sends the next maintainer back here.
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
  // ADR 0025's corrected rationale: nothing else re-verifies a doc commit before the pull request — the
  // green-gate hook fires only on a controller merge, and a doc commit is not one — so the documentation
  // step judges its own doc commits with the focused command, never the full suite.
  [
    path.join('skills', 'document', 'SKILL.md'),
    TEST_SELECTION_PATTERN,
    'read `references/test-selection.md` and run the command it selects over the doc commits it just landed',
  ],
];

// ADR 0025 again, one level up: an all-`mechanical`/`docs` scope skips `/superdev:review` by design, so
// `references/run-handoff.md`'s run handoff runs its one full suite instead (the sixth full-suite row above).
// Two documents have to agree about what that scope does next, and they agree only in prose.
// `skills/ship/SKILL.md` drops `/superdev:review` from its missing-step warning for such a scope, and
// `skills/afk/SKILL.md`'s stage table routes it past the review rather than into it. A table that keeps
// routing `merged` to the review strands the scope: `/superdev:review` has no Definition-of-Done judgment
// to make, `/superdev:ship --unattended` refuses a scope whose review never ran, and the sweep never
// finishes the feature. Both sides are pinned, because either alone reads correct while the pair
// disagrees. Each afk.md row also requires `--unattended` past the command name — a prose sentence that
// drops it strands an unattended sweep at an interactive question with nothing reported, the failure
// ADR 0015's token check exists to prevent, and this is prose the stage-table row scan
// (`scanAfkInvocations`) never reaches.
const AFK_ROUTING_CONTRACTS = [
  [
    path.join('skills', 'afk', 'SKILL.md'),
    /no\s+row\s+reads\s+`?behavior`?[\s\S]{0,160}`?merged`?\s+routes\s+to\s+`?\/superdev:document[\s\S]{0,50}--unattended/i,
    'route an all-`mechanical`/`docs` scope from `merged` to `/superdev:document ... --unattended`, read ' +
      "off the ledger's slice types",
  ],
  [
    path.join('skills', 'afk', 'SKILL.md'),
    /no\s+row\s+reads\s+`?behavior`?[\s\S]{0,200}`?documented-unreviewed`?\s+routes\s+to\s+`?\/superdev:ship[\s\S]{0,50}--unattended/i,
    'route that same all-`mechanical`/`docs` scope from `documented-unreviewed` to `/superdev:ship ... ' +
      '--unattended`, not back to the review — tied to the same condition as the `merged` row above, not ' +
      'every scope',
  ],
  [
    path.join('skills', 'ship', 'SKILL.md'),
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
    path.join('skills', 'setup', 'SKILL.md'),
    /Record it as the `?##\s*Audit set`?\s+section/i,
    "record decision C's answer as the `## Audit set` section of `docs/agents/documentation.md`",
  ],
  [
    path.join('skills', 'document', 'SKILL.md'),
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

// ADR 0068 gives `/superdev:document audit` a **chained posture** for `/superdev:sweep`'s doc leg:
// reader findings only, no `doc-writer` dispatch, no commit. The signal and the posture live in one
// document, so both rows pin the same file — losing either half silently ships a leg that repairs what
// a sweep found instead of only reporting it, which is exactly the mid-sweep commit ADR 0068 rejects.
const CHAINED_DOC_AUDIT_CONTRACTS = [
  [
    path.join('skills', 'document', 'SKILL.md'),
    /--chained/,
    'name `--chained`, the signal `/superdev:sweep` passes its doc leg',
  ],
  [
    path.join('skills', 'document', 'SKILL.md'),
    /--chained[\s\S]{0,400}[Dd]ispatch no `doc-writer` and commit nothing/,
    'dispatch no `doc-writer` and commit nothing once `--chained` is present, whatever the reader found',
  ],
];

// ADR 0068 gives `/superdev:review-tests` the same **chained posture** for `/superdev:sweep`'s test leg:
// no agreement round, no intent write, the ranked findings returned to the caller instead, with the
// dead-or-ignored-test facts still distinguishable from the judgments — the sweep's own agreement round
// asks about judgments alone. Four rows, because the signal (§1) and its three behaviours (§5's round,
// §5's label, §6's write) live in three places in the file, with §5 alone hosting two of the four, and a
// row anchored where each lives is what keeps a later edit to just one of them from reading correct
// while the others go silent.
const CHAINED_TEST_AUDIT_CONTRACTS = [
  [
    path.join('skills', 'review-tests', 'SKILL.md'),
    /--chained/,
    'name `--chained`, the signal `/superdev:sweep` passes its test leg',
  ],
  [
    path.join('skills', 'review-tests', 'SKILL.md'),
    /--chained[\s\S]{0,200}[Rr]un no `AskUserQuestion`/,
    'run no `AskUserQuestion` round once `--chained` is present',
  ],
  [
    path.join('skills', 'review-tests', 'SKILL.md'),
    /--chained[\s\S]{0,400}[Ll]abel every dead-or-ignored-test finding `fact` and every remaining\s+finding `judgment`/,
    'label every dead-or-ignored-test finding `fact` and every remaining finding `judgment`, so the ' +
      'fact/judgment split stays distinguishable in what a chained run returns',
  ],
  [
    path.join('skills', 'review-tests', 'SKILL.md'),
    /\*\*`--chained`\s+present\*\*[\s\S]{0,20}write no intent and print no handoff/,
    'write no intent and print no handoff once `--chained` is present, returning the findings to the ' +
      'caller instead',
  ],
];

// ADR 0068 gives `/superdev:review` the same **chained posture** for `/superdev:sweep`'s code leg: no
// `git add -N :/` (which would write the index and retarget a path scope onto an intent-to-add entry
// instead of the standing tree), and no entry into scope mode, whatever the invoking checkout's `HEAD` is
// — the write paths scope mode opens are foreclosed by construction rather than by a guard the caller
// must check first. Three rows: the signal itself, and each of its two behaviours, anchored where each
// lives in §1.
const CHAINED_CODE_REVIEW_CONTRACTS = [
  [
    path.join('skills', 'review', 'SKILL.md'),
    /--chained/,
    'name `--chained`, the signal `/superdev:sweep` passes its code leg',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /--chained[\s\S]{0,300}run no `git add -N :\/`/,
    'run no `git add -N :/` once `--chained` is present, so the leg writes no index entry',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /`--chained` wins over scope mode[\s\S]{0,200}resolves ad-hoc/,
    'never enter scope mode once `--chained` is present, whatever the invoking checkout\'s `HEAD` is',
  ],
];

// The three contracts above pin the **callee** side of ADR 0068's chained posture: `/superdev:review`,
// `/superdev:document audit`, and `/superdev:review-tests` each still read `--chained` and behave the
// chained way once it's present. None pins the **caller** — nothing asserted that `/superdev:sweep` itself
// still dispatches each leg with the flag, so an edit dropping it from the sweep's own dispatch table
// would leave a leg reading and repairing the sweep's own tree mid-sweep, unchained, while every callee
// contract above stayed green. This table closes the other half, anchored on §2's dispatch table row for
// each leg rather than on the bare invocation string — §3's report header repeats each leg's invocation
// verbatim (`### Docs — /superdev:document audit --chained`), so a pattern with no table anchor stays
// green off that header alone once §2's own row drops the flag. The config row has no `--chained` to
// drop — `/superdev:setup check` needs no signal (CONTEXT.md, `## Chained posture`) — so it pins the
// literal `check` argument instead: the failure mode there is a caller that dispatches bare
// `/superdev:setup` and starts the full interactive interview mid-sweep.
const SWEEP_CHAINED_LEG_CONTRACTS = [
  [
    path.join('skills', 'sweep', 'SKILL.md'),
    /\|\s*Code\s*\|\s*`\/superdev:review <path> --chained`\s*\|/,
    'dispatch the code leg as `/superdev:review <path> --chained`, the flag that puts it in the chained posture',
  ],
  [
    path.join('skills', 'sweep', 'SKILL.md'),
    /\|\s*Docs\s*\|\s*`\/superdev:document audit --chained`\s*\|/,
    'dispatch the doc leg as `/superdev:document audit --chained`, the flag that puts it in the chained posture',
  ],
  [
    path.join('skills', 'sweep', 'SKILL.md'),
    /\|\s*Tests\s*\|\s*`\/superdev:review-tests <path> --chained`\s*\|/,
    'dispatch the test leg with `--chained`, the flag that puts it in the chained posture',
  ],
  [
    path.join('skills', 'sweep', 'SKILL.md'),
    /\|\s*Config\s*\|\s*`\/superdev:setup check`\s*\|/,
    'dispatch the config leg as `/superdev:setup check`, the mode that reports drift without opening the interview',
  ],
];

// ADR 0027's `patch` action is a four-way agreement of the same shape as the three above:
// `references/doc-pass.md` and `skills/plan/SKILL.md` — the two stagers — each stage one section for a
// page the outline marks aggregate, `plugin/scripts/publish-kb.js` applies it through `kb-patch.js`'s
// exported `merge()`, and `references/knowledge-base-confluence.md` documents the marker that decides
// which pages get one. Nothing links them. The failure that matters is not a dropped action name but a
// publish path that keeps the name and merges the page itself — the reader-facing page then gets
// rewritten by a model reading 25 KB of prose, which is the whole reason the merge is a script. The
// third row retargeted from `skills/publish-kb/SKILL.md`'s prose onto the script itself (ADR 0069): the
// merge now runs as real code inside `publishPatch`, not an incantation a document could describe and
// then quietly stop following, so the row is anchored on the `require`/call shape rather than a prose
// mention of the path — a script that keeps `action: patch` but splices the section in by hand still
// fails, the same anchoring principle the old row applied to prose. A dispatch cannot contradict this
// row's clause the way a skill's prose could: `publishPatch` is code the script always runs, not an
// instruction a model re-reads and might paraphrase away. Losing the marker row is the quietest of the
// four: the doc pass falls back to `upsert` and silently replaces an aggregate page with the one
// section it can see, which is the loss ADR 0027 exists to prevent and the state that left this repo's
// own `ADR summaries` page four decisions stale.
const AGGREGATE_PAGE_CONTRACTS = [
  [
    path.join('references', 'doc-pass.md'),
    /aggregate[\s\S]{0,80}`?action:\s*patch`?[\s\S]{0,400}one\s+section/i,
    'stage `action: patch` carrying one section for an outline entry marked aggregate',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /aggregate[\s\S]{0,80}`?action:\s*patch`?[\s\S]{0,400}one\s+section/i,
    'stage `action: patch` carrying one section for an outline entry marked aggregate',
  ],
  [
    path.join('scripts', 'publish-kb.js'),
    {
      test: (text) =>
        /\{[^}]*\bmerge\b[^}]*\}\s*=\s*require\(['"]\.\/kb-patch\.js['"]\)/.test(text) && /\bmerge\(/.test(text),
    },
    "apply `action: patch` by merging through kb-patch.js's exported `merge()`, never by rewriting the page itself",
  ],
  [
    path.join('references', 'knowledge-base-confluence.md'),
    /\(aggregate\)[\s\S]{0,400}`?action:\s*patch`?/i,
    'document the `(aggregate)` outline marker and the `action: patch` it selects',
  ],
];

// ADR 0027's `patch` read was a two-document agreement, the same shape as AGGREGATE_PAGE_CONTRACTS
// above: `skills/publish-kb/SKILL.md` read the live body through the call the config document
// documents, splitting the outcome into **positive absence** — the find call does not list the title —
// which creates the page, and **any other outcome** — no documented read, a transport or authorisation
// failure, the read itself reporting the page absent (e.g. a 404) for a title the find call does list,
// or an empty body for a title the find call does list — a **read failure**, not absence, which must
// leave the file staged. The read identifier only ever exists for a title the find call already listed,
// so a 404 there is a read failure, never positive evidence of absence.
//
// The skill-side row retired (ADR 0069): `plugin/scripts/publish-kb.js`'s `publishPatch` runs this
// branch as real code now, not prose a model interprets, so it can no longer drift the way
// `skills/publish-kb/SKILL.md`'s hand-run incantation could — a script does not paraphrase its own
// `if` statement away. `tests/publish-kb.test.js` proves every arm directly against a real fake
// backend: "a read failure (nonzero exit) leaves the file staged, creates nothing, states the reason",
// "read returning an empty body for a title find DID list is a read failure, not an empty page", and "a
// configuration declaring no read template leaves every patch page staged with that reason" — each
// asserts the staged file survives on disk, the report names the reason, and no create/update call ever
// lands. The row below is the other half of the original agreement: the config-document side, still
// prose, still capable of drifting on its own.
//
// What separates a document that still means this from one that no longer does is coreference and scope —
// which clause a trailing "instead of", "rather than", or a later sentence's "never mind that" reaches
// back to negate — the same wall `UNRESOLVED_GLOSSARY_CONTRACTS` hit first (see its comment above). A
// banned-token list scoped to a fixed character window is not a fix for that: there is always another
// negator, and a negation placed after the window closes never gets inspected at all. A keyword-order
// regex has the identical wall: a sentence that carries every keyword the regex looks for, in order, but
// asserts the call is never made (this row's own RED fixture below) satisfies it just as wrongly. So the
// row drops pattern-matching meaning and instead pins the sentence itself: a verbatim canonical clause,
// matched against the document after `normalizeWhitespace` on both sides (reused from
// `UNRESOLVED_GLOSSARY_CONTRACTS` below), so the real hard-wrapped document still matches. Reword the
// clause, negate it, or drop it, and the match fails identically — there is no separate "negated" case to
// special-case, and no new negator ever needs adding to a list. The trade-off is the one every row in this
// idiom carries: a legitimate rewording of the pinned sentence now fails this check too, until the pin is
// updated to match — deliberately, since a silent pass on a reworded safety sentence is the failure mode
// this row exists to close. The pin does not prove the document still *means* the clause afterward: a
// document that carries a pin intact and then contradicts it in a later sentence, or an earlier one that
// frames or negates the whole clause, is out of reach of this check, exactly as it is for
// `UNRESOLVED_GLOSSARY_CONTRACTS` above — no positive-presence check catches such a contradiction, and
// this row does not attempt to.
//
// The row is conditional, not a bare pattern: a config document that marks no outline entry
// `(aggregate)` documents no read at all, and must not be required to — only a document that actually uses
// the marker owes the call it selects, or every consumer repo that never enabled the feature would fail
// this check. When the marker is present, the row pins `AGGREGATE_READ_CLAUSE`, the whole list item, from
// its bold label through the call and what it returns.
//
// A verbatim pin resists a negator prefixed onto the real sentence only if no negator can be inserted
// *inside* the pinned span — which requires the span to start at a sentence or list-item boundary, not
// mid-clause. `AGGREGATE_READ_CLAUSE` starts at the list item's bold label and carries the endpoint
// through to the verb, so a "never returns" negation must corrupt text *inside* the span (between the
// endpoint and "returns") to take effect — a pin that instead opened on the bare verb "returns …" would
// have no such trap, since "never returns …" leaves the verb and everything after it intact as a
// substring, and the pin would wrongly survive verbatim. The label-to-clause span also pins this repo's
// host in the endpoint URL, so a repo move forces a re-pin — accepted deliberately, in favour of one span
// over a two-part pin that would leave the trailing half open to the same bare-verb prefix attack this
// span closes.
const AGGREGATE_READ_CLAUSE =
  "**Read a page's body:** `GET /api/v1/repos/bomret/superdev/wiki/page/<sub_url>` returns " +
  '`content_base64`, which decodes to the page markdown.';

const READ_PATH_CONTRACTS = [
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

// The `publish-kb-invocation` contract (slice #493, ADR 0069): once the skill's own job shrank to the two
// human stops and relaying the script's report, nothing else stops a future edit from having a model
// hand-run the old mechanics again instead of calling the script — the exact gap a reviewer flagged on the
// slice that thinned the skill down. Anchored on the real invocation shape rather than a prose mention of
// the script's name, so a rewrite that talks about `publish-kb.js` without ever running it still fails,
// the same anchoring principle `AGGREGATE_PAGE_CONTRACTS`'s `require`/call row and
// `CONTAINMENT_DELEGATION_CONTRACTS` already apply to the script's own delegation.
const PUBLISH_KB_INVOCATION_CONTRACTS = [
  [
    path.join('skills', 'publish-kb', 'SKILL.md'),
    /node\s+"\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/publish-kb\.js"/,
    'invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/publish-kb.js"` rather than re-deriving its mechanics ' +
      'by hand',
  ],
];

// ADR 0004: append mode never renumbers a merged slice, so a second `/superdev:implement` run over a
// feature whose earlier slices merged must never re-dispatch one. Run init's `init` call is the one place that seeds the
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

// ADR 0004: `/plan`'s §0 asks new-vs-extend before the interview begins, refuses to extend on any of its
// signals while writing nothing, and promotes a single-slice feature to an epic in §6, where the
// command's other writes happen. Independent rows, so losing any one clause fails on its own. Each row
// anchors on the condition sentence's own wording, not on the rationale sentence that explains it
// afterward, so a document that keeps the rationale but loses the condition still fails. The shipped
// signals and the refusal they trigger belong to `SHIPPED_APPEND_CONTRACTS` below (ADR 0083), which is
// where the second ledger clause this table used to carry went: a `shipped` stage refuses outright now,
// so no branch test decides it and there is no second clause left to pin.
const PLAN_APPEND_CONTRACTS = [
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /makes no store call at all/,
    'ask new-vs-extend before the interview begins, and state that answering "new" makes no store call',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /holds a slice `in-progress`, `in-review`, or `blocked`/,
    'state the store refusal signal — a slice `in-progress`, `in-review`, or `blocked` elsewhere',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /ledger stage other than `planned`/,
    'state the ledger refusal signal — a run root whose stage is other than `planned`',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /leave the lone slice byte-identical/,
    'state the single-slice epic-promotion clause, including that the lone slice is left untouched',
  ],
  // ADR 0043's exception to that byte-identical rule, which `scanAppendContract` cannot reach: neither of
  // these two is a store document, so each carries its own row here. `plan-contract.md` states the generic
  // contract every store specialises, and `skills/plan/SKILL.md` is the command that performs the promotion —
  // the exception dropping out of either leaves the five store documents pinned around a hole.
  [
    path.join('references', 'plan-contract.md'),
    /\*\*migrates to the new epic\*\*/,
    "state that a promoted lone slice's anchor-dependency line migrates to the new epic",
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /migrates to the new epic/,
    "state that a promoted lone slice's anchor-dependency line migrates to the new epic, the one " +
      'exception to leaving it byte-identical',
  ],
];

// ADR 0083 + INV-0004: a feature whose anchor has shipped takes no append — amending its Definition of
// Done in place pools criteria verified against a merged pull request with criteria nobody has verified,
// and `hooks/scope-prune.js` reaps the local half while the anchor's half stays. `/superdev:plan`'s
// extend path is where the refusal is emitted, and `references/plan-contract.md`'s *Append mode* section
// owns the boundary every backend renders, so both documents are pinned and neither can state the rule
// alone. Four independent rows, because each clause fails on its own: the refusal itself, the two
// signals that trigger it (a run root reading `shipped`; an anchor at the store's done status — neither
// is sufficient alone, so a document naming one is as broken as one naming neither), and the remedy
// (`**Blocked by feature:** #<anchor>`), which is what makes the refusal actionable rather than a dead
// end.
const SHIPPED_APPEND_CONTRACTS = [
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /takes no append/,
    'state that a feature whose anchor has shipped takes no append',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /either one alone refuses[\s\S]{0,400}?done status/,
    'name both shipped signals and state that either one alone refuses — a run root whose ledger stage ' +
      "reads `shipped`, and a scope anchor at the store's done status",
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /new feature\*\* carrying `\*\*Blocked by feature:\*\* #<anchor>`/,
    'name the remedy — a new feature carrying `**Blocked by feature:** #<anchor>`',
  ],
  [
    path.join('references', 'plan-contract.md'),
    /shipped feature takes no append/,
    'state the same boundary in its *Append mode* section, so the contract and the command that ' +
      'performs it cannot drift apart',
  ],
];

// ADR 0083's second signal — a scope anchor at the store's done status — only fires if the anchor a
// picked feature resolves to can be a closed record at all. Both issue-tracker backends' *List the
// candidates* call once queried `state=open` for the per-feature-label listing `## Scope anchor`'s
// *Recognise one* rule resolves against, so a shipped feature's closed epic never reached that rule and
// the shipped-anchor refusal above had nothing to trigger on. Each backend already states the identical
// hazard for its *List the slices beneath it* call (a `state=open` listing presents a closed epic as
// never decomposed); this table pins the same `state=all` fix on the candidate listing itself, one row
// per backend that filters by state.
const ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS = [
  [
    path.join('docs', 'agents', 'issue-tracker.md'),
    /List the candidates\.[\s\S]{0,350}?labels=<type>%2F<feature>&state=all/,
    "query the per-feature-label candidate listing itself with `labels=<type>%2F<feature>&state=all`, " +
      "so a shipped feature's closed epic still resolves through *Recognise one* (ADR 0083)",
  ],
  [
    path.join('references', 'issue-tracker-forgejo.md'),
    /List the candidates\.[\s\S]{0,350}?labels=<type>%2F<feature>&state=all/,
    "query the per-feature-label candidate listing itself with `labels=<type>%2F<feature>&state=all`, " +
      "so a shipped feature's closed epic still resolves through *Recognise one* (ADR 0083)",
  ],
  [
    path.join('references', 'issue-tracker-github.md'),
    /List the candidates\.[\s\S]{0,350}?labels=<type>%2F<feature>&state=all/,
    "query the per-feature-label candidate listing itself with `labels=<type>%2F<feature>&state=all`, " +
      "so a shipped feature's closed epic still resolves through *Recognise one* (ADR 0083)",
  ],
  // A `state=all` listing can also return a retired label's closed root beside a reused label's open
  // one. The open candidate must win *Recognise one*, and *Ambiguous* must fire only among open
  // candidates, or a well-formed label reuse (ADR 0083) reports ambiguous.
  [
    path.join('references', 'plan-contract.md'),
    /open candidate is the anchor there[\s\S]{0,300}?two or more \*open\* candidates/,
    'state that the open candidate is the anchor and that `Ambiguous` is two or more *open* candidates, ' +
      'once a backend lists every state (ADR 0083)',
  ],
  [
    path.join('docs', 'agents', 'issue-tracker.md'),
    /Recognise one\.\*\*\s+Apply the rule to the \*\*open\*\* issues/,
    "prefer an open candidate in *Recognise one*, so a retired label's closed root never wins over a " +
      'reused label\'s open one (ADR 0083)',
  ],
  [
    path.join('docs', 'agents', 'issue-tracker.md'),
    /Ambiguous\.\*\*\s+No `epic`-labelled open issue and two or more open issues/,
    '`Ambiguous` only among open issues, so a closed candidate never makes the shape ambiguous by itself',
  ],
  [
    path.join('references', 'issue-tracker-forgejo.md'),
    /Recognise one\.\*\*\s+Apply the rule to the \*\*open\*\* issues/,
    "prefer an open candidate in *Recognise one*, so a retired label's closed root never wins over a " +
      'reused label\'s open one (ADR 0083)',
  ],
  [
    path.join('references', 'issue-tracker-forgejo.md'),
    /Ambiguous\.\*\*\s+No `epic`-labelled open issue and two or more open issues/,
    '`Ambiguous` only among open issues, so a closed candidate never makes the shape ambiguous by itself',
  ],
  [
    path.join('references', 'issue-tracker-github.md'),
    /the open\s+root is the anchor/,
    "prefer an open root in *List the candidates*, so a retired label's closed root never wins over a " +
      'reused label\'s open one (ADR 0083)',
  ],
  [
    path.join('references', 'issue-tracker-github.md'),
    /Ambiguous\.\*\*\s+Two or more \*\*open\*\* roots/,
    '`Ambiguous` only among open roots, so a closed root never makes the shape ambiguous by itself',
  ],
  // Jira's per-label listing spans every state unconditionally (no query parameter to pin), so the
  // shape this family guards against reaches it too: a retired label's `<Done>`-status root beside a
  // reused label's not-`<Done>` one. Jira has no open/closed issue state, so both rows phrase against
  // `fields.status.name` versus the `<Done>` status the Status workflow table names, instead of "open".
  [
    path.join('references', 'issue-tracker-jira.md'),
    /Recognise one\.\*\*[\s\S]{0,400}?prefer the root whose `fields\.status\.name` is not `<Done>`/,
    "prefer a not-`<Done>` root in *Recognise one*, so a retired label's `<Done>` root never wins over a " +
      'reused label\'s open one (ADR 0083)',
  ],
  [
    path.join('references', 'issue-tracker-jira.md'),
    /Ambiguous\.\*\*\s+Two or more parentless issues under one feature label whose `fields\.status\.name` is not\s+`<Done>`/,
    '`Ambiguous` only among not-`<Done>` roots, so a `<Done>` root never makes the shape ambiguous by itself',
  ],
];

// ADR 0007 + ADR 0083: `scope-prune` keeps a run root, and its shipped `ledger.md`, for seven days past
// merge, so a new feature reusing that retired label can land while the finished run's ledger is
// still on disk. A `shipped` ledger belongs to a finished run and gets rotated aside, never resumed, and
// never deleted — `scope-prune` still reaps the whole run root on its own terms. `init` performs the
// rotation itself (Important review finding B, ADR 0079/0080: `scope.js` is the sole ledger read and
// write path, ADR 0022), so `references/run-init.md` describes what `init` does rather than instructing a
// reader to rename the file by hand first. The rotation must also never clobber an existing
// `ledger-shipped-<date>.md`, so a scope that ships twice in one calendar day keeps both trails.
const ROTATE_ON_SHIPPED_CONTRACTS = [
  [
    path.join('references', 'run-init.md'),
    /`init`\s+itself\s+rotates\s+the\s+existing\s+ledger\s+aside\s+to\s+`ledger-shipped-<date>\.md`/,
    'state that `init` itself rotates a `shipped` ledger aside to `ledger-shipped-<date>.md` before writing the fresh one',
  ],
  [
    path.join('references', 'run-init.md'),
    /`implementing`,\s*`merged`,\s*`reviewed`,\s*`documented`,\s*or\s*`documented-unreviewed`/,
    'name every other stage — `implementing`, `merged`, `reviewed`, `documented`, `documented-unreviewed` ' +
      '— that keeps the existing resume path',
  ],
  [
    path.join('references', 'run-init.md'),
    /nothing is deleted,\s*so ADR\s*0007's seven-day trail and `scope-prune`'s contained-or-gone reap rule\s*\(ADR 0053\) both stand/,
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
    path.join('skills', 'plan', 'SKILL.md'),
    /once it loads, before the interview diverges into new\s+ground/,
    "surface the epic's `## Parked questions` once it loads, before the interview diverges into new ground",
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /has its line deleted from that\s+section\s*—\s*the new slice's\s+`spec` and `acceptance` become the durable record/,
    "state that a question the interview resolves has its line deleted from the epic's `## Parked " +
      "questions` section, with the new slice's `spec`/`acceptance` becoming the durable record instead",
  ],
];

// ADR 0028: the scope branch is cut once, and a later run reuses it only losslessly.
// `references/scope-mode.md` owns the rule and both execution playbooks read it, so both run kinds —
// `fresh` and `resumed` — are pinned there rather than in either playbook; a pointer's prose is not
// worth pinning, and a tier-specific line that drifts still leaves the rule itself intact. Independent
// rows: losing the specification for one clause fails on its own. `fresh` carries most of them, because
// a scope-prune reap can leave a same-named branch standing with no ledger to match it, so `fresh` is
// not always a guaranteed-absent name and owns the whole reused-branch decision. The regexes span the
// bullet from its run-kind label (or its own distinguishing clause, for a row anchored past that label)
// to the sentence that distinguishes it, so a prose reflow inside that bullet does not go red while a
// deleted clause does. ADR 0045 retired the tier-split contained-reuse clause ("the `full` tier switches
// the invoking checkout … the `lite` tier works in its existing scopetree"), since both tiers now share
// one scopetree-based reuse, pinned instead by `SCOPETREE_CONTRACTS` below. ADR 0083 retired the
// `appended` run kind's own rows with the run kind: a shipped feature takes no append, so no run ever
// finds a `shipped` ledger to rotate, and `fresh` states the containment test it used to cite.
const RUN_KIND_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /`fresh`[\s\S]{0,240}?[Cc]ut\s+it\s+from\s+`<base>`/,
    'specify the `fresh` run kind — no ledger existed, so the run cuts the branch from `<base>`',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /\*\*The name already exists\*\*[\s\S]{0,500}?contained\s+in\s+`<base>`\s+and\s+reused,\s+or\s+not\s+contained\s+and\s+stopped/,
    'specify the `fresh` run kind — a same-named branch a scope-prune reap left standing makes `-b` fail; ' +
      'decide it on the containment test, contained and reused or not contained and stopped, rather ' +
      'than stopping unconditionally (closes triage #417)',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /finished\s+with\s+\(ADR 0007\)[\s\S]{0,120}?contained\s+in\s*\n?\s*`<base>`,\s+or\s+gone\s+entirely/,
    'specify the `fresh` run kind — key the reused-branch decision on the same contained-or-gone test ' +
      '`hooks/scope-prune.js` and `skills/plan/SKILL.md` run, so a squash-merged branch base already ' +
      'holds is reused rather than read as unmerged forever',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /\*\*Present\*\*[\s\S]{0,160}?`## Containment`/,
    "specify the `fresh` run kind — its **Present** branch names `scope-mode.md`'s own " +
      '`## Containment` section as the section that owns the test',
  ],
  [
    path.join('references', 'scope-mode.md'),
    // The second span reaches past the second pass `CONTAINMENT_REFETCH_CONTRACTS` pins (ADR 0065),
    // which sits between the test and the git floor, so the window is sized to the section as written.
    /## Containment[\s\S]{0,2000}?git\s+merge-tree\s+--write-tree[\s\S]{0,4000}?2\.38/,
    'carry the one canonical `## Containment` section — the `git merge-tree --write-tree` test, its ' +
      'outcomes, and the git 2.38 floor its fallback covers — since two sections and a skill delegate ' +
      'to it and a delegation to a deleted section pins nothing (ADR 0053)',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /\*\*No forcing flag[\s\S]{0,900}?`git reset --hard <base>`[\s\S]{0,200}?just\s+proved\s+contained/,
    'state the **No forcing flag** exception as conditional on the containment proof — `git reset ' +
      '--hard <base>` is admissible only on a branch `## Containment` has just proved contained, ' +
      'never as a general permission (ADR 0053)',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /\*\*Contained\*\*[\s\S]{0,400}?status\s+--porcelain`\s+returns\s+nothing[\s\S]{0,250}?never\s+the\s+index\s+or[\s\S]{0,120}?working\s+tree[\s\S]{0,350}?\*\*Dirty\*\*[\s\S]{0,250}?stop,\s+cutting\s+nothing[\s\S]{0,150}?--unattended`\s*→\s*\n?\s*block/,
    'require the scopetree clean — `git -C .superdev/scopes/<scope>/scopetree status --porcelain` ' +
      'returns nothing — before re-pointing a contained reused branch with `git reset --hard ' +
      '<base>`, because the containment proof covers the branch\'s committed history and says nothing ' +
      'about the index or working tree; a dirty scopetree stops, naming what is dirty, and blocks ' +
      'unattended rather than losing an uncommitted change (ADR 0053)',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /`resumed`[\s\S]{0,400}?[Nn]o\s+containment\s+test\s+runs\s+and\s+nothing\s+is\s+cut/,
    'specify the `resumed` run kind — no containment test runs and nothing is cut, because the branch ' +
      'holds work by design, whether unmerged slice work or a `planned` ledger\'s own design-docs commit',
  ],
];

// ADR 0045: the `full` tier cuts its scope branch into the same dedicated scopetree the `lite` tier
// uses, `.superdev/scopes/<scope>/scopetree`, and does every merge there — the invoking checkout is never
// switched, at either tier. Twenty-one independent rows, each anchored on text unique to its own clause
// so a prose reflow elsewhere in the same section or file does not fire it.
//
// Five rows sit on `references/scope-mode.md`. `## The scope checkout` resolving to one location covers
// reuse for both remaining run kinds (`appended`'s own contained-reuse clause retired with the run kind,
// ADR 0083): reuse now means working in that one scopetree, creating it with `git worktree add` when
// absent and stopping, naming what it found,
// when a different worktree already holds the branch — the same stop `## Cutting the scope branch`'s
// `resumed` bullet already took before this ADR, so this is a location change, not a new behaviour. A
// fifth row on that same section states that a `run-lock` refusal met while recreating is this run's own
// lock, not a competing session's, and names the remedy (remove and retry) rather than leaving the two
// sections contradicting each other — a fix cycle found the recreate path unreachable inside a live run
// otherwise. `## The run lock` states that both tiers write the lock, and only after the scopetree is cut,
// or the `run-lock` hook's own guard on `git worktree add` would block the run that is about to make that
// call.
//
// Five rows sit on `references/implement-full.md`, the tier that changed: its Branch model states that
// every later command in the file — every merge — addresses the scopetree with `git -C` rather than
// the invoking checkout; its DAG loop's merge step addresses that scopetree with `git -C`; its
// integration-branch bullet keeps `integration/<scope>` there too, and the integrate-and-verify slice
// switches that same scopetree, never the invoking checkout, for the final merge; its Resume step finds
// the scopetree before reading anything out of it; its own `## Run lock` section reads scope-mode.md's
// `## The run lock` rather than leaving the full tier with no pointer at all — a fix cycle found two other
// documents still claiming the lock was lite-only with this file carrying no lock section to contradict
// them. (Its Resume step's own liveness-check deferral is `RUN_LOCK_LIVENESS_CONTRACTS`'s own row —
// INV-0013, ADR 0090 — not restated here, so one sentence has one pin.)
//
// One row sits on `references/implement-lite.md`: its `## Run lock` section reads scope-mode.md's
// `## The run lock` rather than restating who writes the lock and when — the shared rule now lives once,
// in scope-mode.md, and this row is the same shape as the `doc-pass` contract's caller-reads-the-rule row.
//
// Two rows sit on `references/run-init.md` and `references/run-handoff.md`: the run root prose lists
// `run.lock` with no `lite tier only`/`(lite tier)` qualifier, since scope-mode.md's `## The run lock`
// is the one place that states who writes it and when (ADR 0045) — a qualifier reintroduced on either
// side makes it the later, more specific instruction and silences the shared rule for the full tier.
//
// Three rows sit on `skills/review/SKILL.md` — a fix cycle found this chain-tail command naming no working
// directory anywhere, so its scope-mode read against `<type>/<scope>` tested the controller's own cwd
// instead of the scope checkout, its full-suite run had nowhere stated to run, and its fix-implementer
// dispatch could land commits on the base branch in the operator's own clone: §4 tests the *scope
// checkout's* branch rather than the invoking checkout's, runs the full suite in that checkout, and hands
// the fix implementer that same checkout as its working directory — the same pattern `implement-full.md`
// and `document.md` already carry.
//
// Two more rows sit on `references/run-handoff.md`, the one full-suite run a scope of all `mechanical`/
// `docs` slices ever gets: a fix cycle found its full-suite run and its Red-branch fix dispatch both naming
// no working directory, so on the full tier both acted on the invoking checkout — sitting on the base
// branch by the time this step runs — reading `docs/agents/verification.md` off base, running the suite
// over base's tree, and landing any fix commit on base in the operator's own clone. One row states the
// full suite runs in the scope checkout; the other states the Red-branch fix implementer is handed that
// same checkout as its working directory, the identical clause `skills/review/SKILL.md` already carries for
// its own fix dispatch.
//
// One more row sits on `references/merge-conflicts.md`: its winner-picking-overlap abort names the
// scopetree with `git -C`, not a bare `git merge --abort`. `implement-full.md`'s own merge and
// `merge --abort` calls are already pinned above, but this file is read *after* it — the later, more
// specific instruction — and delegates the whole conflict-resolution step, so its own unqualified abort
// used to win the conflict: run in the invoking checkout it exits 128 and leaves the scopetree
// sitting on `MERGE_HEAD`, which `hooks/green-gate.js`'s `mergeInProgress()` then reads as a deferral,
// gating nothing on the next merge in that tree.
//
// The last row sits on `skills/afk/SKILL.md`'s eligibility bullet: a live run's no-lock case falls back to the
// ledger mtime, with no claim that a full run never gets a lock. A fix cycle found the bullet still
// asserting a run lock "only ever exists for a `lite`-tier scope" and citing `references/scope-mode.md`'s
// `## The run lock` section for that claim, which by then stated the opposite — both tiers write the
// lock. The fallback stayed conservative either way, so this drift cost no eligibility it should not have,
// but it told an unattended controller to distrust the strong signal it now has.
const SCOPETREE_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /`<run-root>\/scopetree`\s+is\s+the\s+scope\s+checkout,\s+at\s+both\s+tiers/,
    'state that the scope checkout resolves to one location, `<run-root>/scopetree`, at ' +
      'both tiers',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /\*\*Absent\*\*[\s\S]{0,120}?git\s+worktree\s+add\s+<run-root>\/scopetree\s+<branch>/,
    'state that an absent scope checkout is recreated with `git worktree add ' +
      '<run-root>/scopetree <branch>`',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /`run-lock`\s+refuses\s+the\s+call,\s+naming\s+another\s+session\*\*\s+→\s+that\s+lock\s+is\s+this\s+run's\s+own/,
    "state that a `run-lock` refusal met while recreating the scope checkout is this run's own lock, " +
      'not a competing session, and name the remedy',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /\*\*A\s+different\s+working\s+tree\s+already\s+holds\s+`<branch>`\*\*[\s\S]{0,200}?[Ss]ay\s+so\s+and\s+stop,\s+writing\s+nothing/,
    'name a stop, writing nothing, when a different working tree already holds the scope branch',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /\*\*Write\s+`<run-root>\/run\.lock`\s+once\s+`## Cutting the scope branch`\s+above\s+has\s+cut\s+the\s+scopetree,\s+at\s+both\s+tiers\*\*/,
    'state that the run lock is written for both tiers, once the scopetree is cut',
  ],
  [
    path.join('references', 'implement-full.md'),
    /every\s+later\s+command\s+in\s+this\s+file\s+—\s+every\s+merge\s+—\s+addresses\s+the\s+scopetree.{0,40}?with\s+`git\s+-C`,\s+and\s+the\s+invoking\s+checkout\s+is\s+never\s+switched/,
    'run every later command — every merge — against the scopetree with `git -C` rather than the ' +
      'invoking checkout',
  ],
  [
    path.join('references', 'implement-full.md'),
    /\*\*Merge \(you, serially\)\*\*[\s\S]{0,80}?git\s+-C\s+<run-root>\/scopetree\s+merge/,
    'address the DAG loop merge step at the scopetree with `git -C`',
  ],
  [
    path.join('references', 'implement-full.md'),
    /cut\s+`integration\/<scope>`\s+from\s+`<branch>`\s+at\s+run\s+start,\s+keep\s+it\s+checked\s+out\s+\*\*in\s+the\s+scopetree\*\*[\s\S]{0,300}?switch\s+that\s+same\s+scopetree\s+back\s+to\s+`<branch>`/,
    'keep `integration/<scope>` in the scopetree, and switch that same scopetree — never the ' +
      'invoking checkout — for the integrate-and-verify merge',
  ],
  [
    path.join('references', 'implement-full.md'),
    /\*\*Find\s+the\s+scopetree\s+first\*\*/,
    'find the scopetree, per `## The scope checkout`, before Resume reads anything out of it',
  ],
  [
    path.join('references', 'implement-full.md'),
    /Read\s+`\$\{CLAUDE_PLUGIN_ROOT\}\/references\/scope-mode\.md`'s\s+`## The run lock`\s+and\s+write/,
    "read scope-mode.md's `## The run lock` rather than leaving the full tier with no lock pointer",
  ],
  [
    path.join('references', 'implement-lite.md'),
    /Read\s+`\$\{CLAUDE_PLUGIN_ROOT\}\/references\/scope-mode\.md`'s\s+`## The run lock`\s+and\s+write/,
    "read scope-mode.md's `## The run lock` rather than restating who writes the lock and when",
  ],
  [
    path.join('references', 'run-init.md'),
    /`run\.lock`,\s+per\s+that\s+file's\s+`## The run lock`\)/,
    'list `run.lock` with no `lite tier only` qualifier, since scope-mode.md states who writes it and when',
  ],
  [
    path.join('references', 'run-handoff.md'),
    /Keep\s+the\s+scopetree\s+and\s+`<run-root>\/run\.lock`,\s+leave/,
    'list `<run-root>/run.lock` with no `(lite tier)` qualifier, since scope-mode.md states who writes ' +
      'it and when',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /\*\*The scope checkout not on `<type>\/<scope>`\*\*/,
    'test the scope checkout against `<type>/<scope>`, not the controller\'s own invoking checkout',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /run it \*\*in the scope checkout above\*\*,\s+over\s+the\s+scope\s+branch/,
    'run the full suite in the scope checkout, not the invoking checkout',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /Hand it the scope checkout as its working directory:\s+this is where its fix commits must land/,
    'hand the fix-cycle implementer the scope checkout as its working directory',
  ],
  [
    path.join('references', 'run-handoff.md'),
    /run it once\s+\*\*in that checkout\*\*,\s+over the scope branch/,
    "run the mechanical/docs scope's own full suite in the scope checkout, not the invoking checkout",
  ],
  [
    path.join('references', 'run-handoff.md'),
    /Hand it\s+the scope checkout as its working directory:\s+this is where its fix commits must land/,
    'hand the Red-branch fix implementer the scope checkout as its working directory',
  ],
  [
    path.join('references', 'merge-conflicts.md'),
    /git\s+-C\s+<run-root>\/scopetree\s+merge\s+--abort`?\s+and\s+escalate\s+to\s+the\s+human/,
    'abort a winner-picking conflict in the scopetree with `git -C`, not the invoking checkout',
  ],
  [
    path.join('skills', 'afk', 'SKILL.md'),
    /\*\*No\s+lock\s+present\s+is\s+not\s+by\s+itself\s+eligibility\*\*/,
    'fall back to the ledger mtime on no lock present, without first claiming a full run never gets a lock',
  ],
];

// The absence half of the `skills/afk/SKILL.md` row above (`scanAfkLockTierClaim` in `scanners.js` runs it).
// One document, because one document's eligibility bullet reads the lock: a sibling command carrying the
// same sentence is describing something else.
const AFK_LOCK_TIER_SILENCE_DOCS = [path.join('skills', 'afk', 'SKILL.md')];

// Three spellings of the one claim, matched on the parts that carry it — `lock`, `only`/`only ever`, and
// `lite`-the-tier — rather than on a sentence shape, since the claim regrows in whatever words the edit
// reintroducing it reaches for. `lite` takes optional backticks and either a hyphen or a space before
// `tier`, the three ways this repo's prose writes it.
// ponytail: a marker list, matching the claim rather than parsing the bullet; a stricter grammar is the
// upgrade if a paraphrase ever slips past it.
const AFK_LOCK_TIER_MARKERS = [
  [
    /\b(?:run[- ]?)?lock\b[^.]{0,120}?\bonly(?:\s+ever)?\b[^.]{0,120}?`?lite`?[- ]tier/i,
    (hit) =>
      'claim no tier-specific run lock — both tiers write one (ADR 0045), and the eligibility bullet ' +
      `falls back to the ledger mtime on no lock present: "${normalizeWhitespace(hit[0])}"`,
  ],
  [
    /\bonly\b[^.]{0,120}?`?lite`?[- ]tier[^.]{0,120}?\b(?:run[- ]?)?lock\b/i,
    (hit) =>
      'claim no tier-specific run lock — both tiers write one (ADR 0045), and the eligibility bullet ' +
      `falls back to the ledger mtime on no lock present: "${normalizeWhitespace(hit[0])}"`,
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
// ponytail: shape-based, and its ceiling is the three spellings below. `git switch -C`,
// `git checkout -B`, and `worktree add -B` are the forcing flags the playbooks could plausibly reach for;
// a reset spelled another way (`git branch -f`, `update-ref`, a `reset --hard` onto the base) walks past.
// Widening this is cheap when a fourth spelling shows up in review — guessing at every reset git can
// express is not, and ADR 0028's real guarantee is the prose these patterns keep honest.
const FORCING_FLAG_PATTERNS = [
  /git\s+switch\s+(?:-C|--force-create)\b/,
  /git\s+checkout\s+-B\b/,
  /worktree\s+add[^\n]*\s(?:-B|--force-create)\b/,
];

// `scripts/AGENTS.md`'s Work Guidance sets its own contract: a new drift-check contract is one registry
// entry, plus its section in the narrative, plus its selftest. Only the first and third are enforced by
// anything, and the middle one has been skipped twice — `forcing-branch-flag` and `source-sections` were
// registered and undescribed.
//
// The narrative names each check by its registry `id`, wrapped in a backtick pair, so a bare substring of
// the id occurring elsewhere in the document does not count as "described" — this pins that every check
// is written up somewhere, never that the write-up is accurate or that the classification sentence files
// it under the right kind. Those stay human judgment, and the epic says so.
const NARRATIVE_DOC = path.join('scripts', 'AGENTS.md');

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
// The heading `specialisingGenericRows()` and `scanSpecialisingCitations()` find a section by, the one
// pattern `scanRunStateContract` uses for its own store-side presence check, and the one
// `scanAssigneeContract`'s section half uses for its own. It stops at a word boundary rather than
// end-of-line, because a real heading carries a trailing qualifier on both sides of the family: the
// generic document writes `### Assignee — store configuration, not a slice field`, and the Jira seed
// writes `## Run state (fill in at setup)` on the sections a consumer completes at setup. Anchoring to
// end-of-line would read either as no section at all. Three of the other four store-side presence
// contracts (`ANCHOR_PATTERN`, `APPEND_PATTERN`, `TRIAGE_RECORD_PATTERN`) still anchor to end-of-line,
// because they also feed `extractSection()` for element checks, so widening them is not a free swap.
// `RELEASE_PATTERN` anchors the same way but carries no elements: `scanReleaseContract` tests it against
// raw text for presence alone.
const specialisingHeading = (name) => new RegExp(`^#{2,3}\\s+${name}\\b`, 'm');

// The **specialising family**: the generic contracts in `references/plan-contract.md` that a slice-store
// document renders for its own backend. This one list decides membership, and three sides follow from it
// with no second edit — the generic-side row in `SOURCE_SECTION_CONTRACTS` below
// (`specialisingGenericRows()`), the citation assertion `scanSpecialisingCitations()` makes
// (`specialisingCitation()`), and the heading each is found by (`specialisingHeading()`). The store-side
// presence contract is the one side that stays per-section, because each has its own elements to assert:
// `scanAnchorContract`, `scanAppendContract`, `scanReleaseContract`, `scanTriageRecordContract` and
// `scanRunStateContract` each pin their own member's `## <Section>` heading. `scanAssigneeContract` pins
// two halves, the `- **Assignee:**` configuration bullet and the `## Assignee` heading, and finds the
// heading through `specialisingHeading('Assignee')` so this list reaches it too. Adding a name here with
// no store-side presence contract for it is caught by `scripts/drift/selftest/scanners.test.js`'s
// store-side presence coverage selftest, which runs the whole `checks.js` registry against a fixture
// missing just that member's section and fails when nothing in it reports a new gap.
//
// **The membership rule:** a section is a member when `plan-contract.md` states its generic contract and
// **at least one store document renders it as its own section**. `Assignee` passes — four of the five
// store documents carry a `## Assignee` section and all four cite `plan-contract.md` → *Assignee* — even
// though it sits at `###` under `## Issue-backend mapping (general)` in the generic document. The heading
// patterns match `#{2,3}`, so its real depth needs no special case.
//
// **`Feature label` fails the second half and is deliberately absent.** No seed renders it as a section:
// every one folds it into a configuration bullet instead, so there is no store side to cite from. It is
// cited by name and keeps a hand-written row below, beside `Fields`, `Slice lifecycle & status` and
// `Epic visuals` — the other three sections cited by name that no store renders as a section.
//
// Before this list drove the rows, the generic-side rows were written out one by one beside it, and
// adding a member to one and not the other was silent. `Assignee` is what that gap already cost: its
// store side was pinned by `scanAssigneeContract` while nothing pinned its generic side and nothing
// pinned those four citations.
//
// One notation is pinned rather than an alternation. Accepting `` `plan-contract.md`, *Section* `` beside
// the arrow would make both forms true forever and leave a reader guessing which a new seed should copy.
// That the citation matters at all is not hypothetical: four seeds opened their `## Triage record` with
// `` `CONTEXT.md` → *Triage record* ``, a reference that resolves to nothing in a consumer install —
// `plugin/` ships no `CONTEXT.md` and no `docs/adr/`, and a consumer's own `CONTEXT.md` is that repo's
// glossary. The suite was green throughout, and a human review caught it.
const SPECIALISING_SECTIONS = [
  'Scope anchor',
  'Release',
  'Run state',
  'Append mode',
  'Triage record',
  'Assignee',
];

// CONTEXT.md's own glossary entries are a second citing side, beside the store documents above: a
// glossary entry that defers to "that store's own section" for a specialising member owes the same
// `` `plan-contract.md` → *Section* `` citation those store documents already carry
// (`scanGlossarySpecialisingCitations()` in `scanners.js`). The glossary entry's own title diverges
// from its member's name for one member — `Run state` is titled **Published snapshot** — and `Append
// mode` has no glossary entry at all, so its value here is `null`: a documented absence, skipped rather
// than flagged, the same way a store document that carries no matching section is skipped. This map is
// total against `SPECIALISING_SECTIONS` — one key per member, `null` or a title, never omitted — so a
// member added there with no matching key here is `undefined`, not `null`, and the coverage selftest in
// `scripts/drift/selftest/scanners.test.js` catches that gap before `scanGlossarySpecialisingCitations()`
// ever reads it.
const GLOSSARY_ENTRY_TITLES = {
  'Scope anchor': 'Scope anchor',
  Release: 'Release',
  'Run state': 'Published snapshot',
  'Append mode': null,
  'Triage record': 'Triage record',
  Assignee: 'Assignee',
};

// One generic-side row per member: `references/plan-contract.md` still carries the section the store
// documents specialise. Taking the names as an argument rather than closing over the list is what lets the
// selftest assert the derivation itself — pass a name the real list has never held, and the row for it
// appears — instead of reading the built table back and calling that a test of how it was built.
const specialisingGenericRows = (names) =>
  names.map((name) => [
    path.join('references', 'plan-contract.md'),
    specialisingHeading(name),
    `carry the \`## ${name}\` section — the generic contract each store document specialises`,
  ]);

// `plan-contract.md` carries the most rows, because its sections are cited by name elsewhere in the
// plugin: a store document rendering one of them for its own backend is following a section that has to
// exist to be followed. Its **specialising-family** rows are derived from `SPECIALISING_SECTIONS` above
// rather than written out here — one list decides membership, and both the generic-side row and the
// citation assertion follow from it. The four rows below it are hand-written because those sections are
// cited by name without being members. The other four files are cited only as whole files, so their rows
// pin the sections that hold the rule the citing document promises its reader.
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

// The citation is prose, so it wraps: `references/issue-tracker-local.md` carries it as `*Append\nmode*`.
// Matching a literal space would report that as drift, so every space in the whole citation — in the
// section name and at either joint around the arrow — matches any run of whitespace instead.
const specialisingCitation = (name) => new RegExp(`\`plan-contract\\.md\` → \\*${name}\\*`.replace(/ /g, '\\s+'));

// Both new run references are read forward, at a step: `implement-full.md` and `implement-lite.md`
// each say "read `references/run-init.md`" and "read `references/run-handoff.md`" as instructions to
// go on, never back. Only an instruction to go back to the command body is a gap. `/superdev:implement`
// and its router are fine to name — the gap is a *return*, not a mention. A gap is a directional verb
// (return, resume, continue, hand back, go back up, jump back — every one of them carries "return to",
// "resume at", "continue in", or "back to" as a substring) paired with a return target (the controller,
// the command body, `/superdev:implement`, `skills/implement/SKILL.md`, or "Final phase"). Either half alone
// is legitimate prose: a target named with nothing sending the reader there ("the controller's Final
// phase" in passing, "the controller merges each slice serially", a `skills/implement/SKILL.md`
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
// back to the controller" as a cross-reference the way they write "refer back to `skills/implement/SKILL.md`".
const PROSE_TARGETS = ['controller\\b', 'command\\s+body\\b', 'Final\\s+[Pp]hase\\b'];
// A path-shaped target (a command name, a doc path) is also how a legitimate backward *cross-reference*
// reads ("refer back to `skills/implement/SKILL.md`", "point back to `/superdev:implement`") — bare "back
// to"/"back up to" would flag that pointer as a hand-off. Pair it only with a verb that names the
// hand-off explicitly, plus the two verbs ("return to", "continue in") no cross-reference uses.
const PATH_TARGETS = ['/superdev:implement\\b', 'skills/implement/SKILL\\.md'];
const HAND_BACK_VERB = 'hand(?:\\s+\\w+){0,2}\\s+back\\s+to';
const PATH_VERBS = ['return\\s+to', 'resume\\s+at', 'continue\\s+in', HAND_BACK_VERB];
// Up to two `` ` `` or `*` markdown markers, optionally "the ", then up to two more — covers "the
// controller", "`skills/implement/SKILL.md`", and "**Final phase**" alike between the verb and its target.
const RETURN_CONNECTOR = '[`*\\s]*(?:the\\s+)?[`*\\s]*';
// ponytail: shape-based over a verb list crossed with a target list, so its ceiling is that cross
// product. A playbook that sends the reader back in words no row spells ("pick up where the command
// left off", "the caller resumes from here") passes. The verb and target lists are the place to widen it
// when review finds a phrasing they miss.
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

// `skills/afk/SKILL.md`'s paragraph introducing `## Scope anchor` restates how many things that section
// states for this backend. ADR 0040 added the anchor dependency as a fifth element to that section
// everywhere else (`plan-contract.md`, every store document, `scripts/AGENTS.md`'s `anchor-contract`
// write-up), but nothing pinned this one paragraph, so it kept reading "four" and naming only the
// original four — the one-sided-pin shape root `AGENTS.md`'s prompt-architecture rules name. The two
// rows are independent: a maintainer could fix the count without naming the fifth thing, or name it
// without updating the count.
//
// Scoped to the paragraph itself, not the whole `## 2.` section or the whole document: `skills/afk/SKILL.md`
// legitimately discusses the anchor dependency again later in that section (the eligibility bullet reads
// it), so a section-wide or document-wide match would pass even after this one paragraph reverted to
// "four" — exactly the shape `anchor-contract` already guards against with the narrower
// `extractSection()` isolation. `AFK_ANCHOR_COUNT_HEADING` locates the paragraph itself (a phrase common
// to every wording, "four" or "five" alike); `scanAfkAnchorCount()` then isolates it with
// `extractParagraph()` and tests both elements inside that isolation alone.
const AFK_ANCHOR_COUNT_HEADING = /`## Scope anchor` section stating/;

const AFK_ANCHOR_COUNT_ELEMENTS = [
  [
    /stating five things for this backend/,
    'say the `## Scope anchor` section states five things for this backend, not four — ADR 0040 added ' +
      "reading an anchor's own dependencies as the fifth",
  ],
  [
    /read an anchor's own dependencies/,
    "name reading an anchor's own dependencies among the things that section states, the fifth ADR 0040 added",
  ],
];

// ADR 0042: publishing the run-state snapshot follows any ledger write the snapshot would show, stated
// once in `references/scope-mode.md`'s `## Publishing run state` section rather than at each call site
// that writes one. A site that drops the pointer silently strands the anchor's snapshot behind whichever
// write it stopped citing — nothing else notices, because the write itself still lands and the suite stays
// green. Anchored on the section's own name, the same shape `UNATTENDED_CONTRACTS` and `DEGRADED_CONTRACTS`
// use for a rule several call sites cite in their own words around one fixed noun.
//
// The rule was originally scoped to `stage set` alone, and a fix cycle broadened it: a scope-wide suite's
// 3-strike halt writes `**Unresolved:**` and deliberately leaves the stage untouched, so the original five
// stage-only rows never covered it. The five rows below pin that `references/scope-mode.md` states, once,
// the criterion for which write gets a direct citation (`## Publishing run state`'s own "Which sites cite
// this directly" paragraph) and that its own defining sections — `## Degraded passes`, `## Unresolved
// defects`, `## Deferred findings`, and the `**Docs:**` bullet in `## The ledger` — each carry the
// broadened instruction where they name their own write.
//
// A second fix cycle found that a *file-level* presence row is too weak once a file carries more than one
// citation: `review.md` and `run-handoff.md` each already satisfied their row from an unrelated branch's
// citation, so three sites where a denied dispatch or a denied full-suite run writes `**Degraded:**` and
// then blocks — reaching no later write in the same run — sat uncited with the check still green. The
// rows below are per-site rather than per-file wherever a file carries more than one citation: each is
// anchored on text unique to its own write (the surrounding sentence, never just the repeated section
// name), so dropping any one citation fails on its own regardless of its siblings. `references/run-init.md`,
// `skills/implement/SKILL.md`, `skills/ship/SKILL.md`, and `references/implement-full.md` carry exactly one
// citation each, so a bare file-level row is unambiguous there. `references/implement-lite.md` carries no
// direct citation, one inheritance note: neither of its two writes (`docs set inline`, the knowledge-base
// pass's `degraded add`) can end the command — nothing in that section ever blocks — so both rely on
// inheritance and the file is absent from this table entirely, the same as any other document whose every
// write is non-terminal.
const PUBLISH_RUN_STATE_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /^#{2,3}\s+Publishing run state\s*$/m,
    'carry the `## Publishing run state` section defining the rule for every ledger write',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /Cite this section directly at the write[\s\S]{0,80}?can end the command[\s\S]{0,400}?relies on its defining section/,
    "state the criterion for which write gets a direct citation, in the section's own " +
      '`Which sites cite this directly` paragraph',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /on every `degraded add`, `degraded add-denial`, or `degraded reset-denials` call/,
    'publish the snapshot after a `degraded add`/`degraded add-denial`/`degraded reset-denials` write, ' +
      'in its own `## Degraded passes` section',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /on every `unresolved add` or `unresolved clear` call/,
    'publish the snapshot after an `unresolved add`/`unresolved clear` write, in its own `## Unresolved ' +
      'defects` section',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /on every `deferred add` call/,
    'publish the snapshot after a `deferred add` write, in its own `## Deferred findings` section',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /on every `docs set` or `docs clear` call/,
    'publish the snapshot after a `docs set`/`docs clear` write, in `## The ledger`\'s `**Docs:**` bullet',
  ],
  ...[
    path.join('references', 'run-init.md'),
    path.join('skills', 'implement', 'SKILL.md'),
    path.join('skills', 'ship', 'SKILL.md'),
  ].map((rel) => [rel, /`## Publishing run state`/, 'point at the `## Publishing run state` section after its one ledger write']),
  // references/implement-full.md: anchored on the real citation's own lead-in, not a bare heading match —
  // the file also names the section a second time, in the non-terminal simplicity-reviewer write's own
  // inheritance note, so a bare presence row would stay green with the real citation stripped.
  [
    path.join('references', 'implement-full.md'),
    /Publish the snapshot after either write, per[\s\S]{0,80}?`## Publishing run state`/,
    'publish the snapshot after either terminal write (a denied implementer/fix, a denied slice-reviewer)',
  ],
  // skills/document/SKILL.md: two distinct terminal sites, each its own row.
  [
    path.join('skills', 'document', 'SKILL.md'),
    /refusal\. Publish the snapshot afterwards, per[\s\S]{0,60}?`## Publishing run state`/,
    'publish the snapshot after a denied doc-writer/doc-reader dispatch, since an unattended block reaches ' +
      'no later write in this command',
  ],
  [
    path.join('skills', 'document', 'SKILL.md'),
    /Wrote `documented` or `documented-unreviewed` above[\s\S]{0,40}?publish the snapshot, per[\s\S]{0,60}?`## Publishing run state`/,
    'publish the snapshot after its own stage write, the last write this command makes',
  ],
  // references/run-handoff.md: three distinct terminal sites, each its own row.
  [
    path.join('references', 'run-handoff.md'),
    /then publish the snapshot before deciding which branch below applies[\s\S]{0,120}?`## Publishing run state`[\s\S]{0,60}?since the block\s+branch reaches no later write/,
    'publish the snapshot after the denied-full-suite write, since the unattended branch reaches no later ' +
      'write in this run',
  ],
  [
    path.join('references', 'run-handoff.md'),
    /leave the\s+stage where it is, and publish the snapshot before stopping[\s\S]{0,120}?`## Publishing run state`[\s\S]{0,60}?since no later\s+stage write in this run will do it/,
    'publish the snapshot at the 3-strike red-cap stop, since no later stage write in this run will do it',
  ],
  [
    path.join('references', 'run-handoff.md'),
    /tells the next command, or a resumed run, that every slice is on the scope branch\. Publish[\s\S]{0,150}?`## Publishing run state`/,
    'publish the snapshot after its own `stage set merged` write, the last write a normal run makes here',
  ],
  // skills/review/SKILL.md: six distinct terminal sites, each its own row.
  [
    path.join('skills', 'review', 'SKILL.md'),
    /quoting the classifier's refusal, then publish the[\s\S]{0,80}?`## Publishing run state`/,
    'publish the snapshot after a denied final-reviewer dispatch, since either block branch reaches no ' +
      'later write in this run',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /Write the `\*\*Degraded:\*\*` entry either way, then publish the[\s\S]{0,150}?`## Publishing run state`[\s\S]{0,40}?since the block\s+branch reaches no later write/,
    'publish the snapshot after the denied full-suite dispatch in §4, since the unattended branch reaches ' +
      'no later write in this run',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /publish the\s+snapshot before stopping[\s\S]{0,120}?`## Publishing run\s+state`[\s\S]{0,60}?since no later write in this run will do it/,
    'publish the snapshot at the "Declined" stop, since no later write in this run will do it',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /publish the snapshot before stopping[\s\S]{0,120}?`## Publishing run state`[\s\S]{0,60}?since no later\s+stage write in this run will do it/,
    'publish the snapshot at the 3-strike-cap/unattended-block stop, since no later stage write in this ' +
      'run will do it',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /entry either way, with `scope\.js degraded add`[\s\S]{0,150}?`## Publishing run state`[\s\S]{0,60}?since an unattended block below reaches no later write/,
    'publish the snapshot after the denied fix-implementer dispatch, since the unattended block reaches ' +
      'no later write in this run',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /Publish the snapshot after any of the writes above[\s\S]{0,150}?`## Publishing run state`/,
    'publish the snapshot after the clean-verdict writes (unresolved clear, the stage write, docs clear)',
  ],
];

// The `adopt-run-state` contract (ADR 0042), the mirror image of the table above: where publishing
// writes the ledger onto the anchor, adopting reads it back. Six rows pin `references/run-init.md`'s
// adopt branch — the trigger condition and its snapshot-less skip, the read-failure fallthrough, the
// shipped-or-section-less fallthrough, the adopt call itself (`dod.md` written before `adopt`, per
// ADR 0042's own ordering), the reconciliation sentence that keeps the adopted slice table from gating a
// re-dispatch on its own, and the `resumed` naming for an adopted ledger — plus three on
// `references/scope-mode.md`'s `resumed` branch bullet: the remote fetch a name that does not verify
// locally now takes before the stop, the fetch's own remote-tracking ref that the post-fetch check
// verifies instead of the bare name (`git fetch <remote> <branch>` only ever populates
// `refs/remotes/<remote>/<branch>`, never a local `refs/heads/<branch>`, so verifying the bare name a
// second time always fails — the Critical defect a fix cycle found and fixed, after two review passes
// missed it), and the stop itself once the fetch finds nothing either, blocking rather than asking under
// `--unattended`.
const ADOPT_RUN_STATE_CONTRACTS = [
  [
    path.join('references', 'run-init.md'),
    /No `<run-root>\/ledger\.md` yet\*\* → before running `init`, check the scope anchor for a snapshot to adopt, unless the active store declares itself snapshot-less[\s\S]{0,150}?skip straight to `init`/,
    'check the scope anchor for a snapshot to adopt before running `init`, skipping straight to `init` ' +
      'when the active store declares itself snapshot-less',
  ],
  [
    path.join('references', 'run-init.md'),
    /\*\*The read fails\*\* \(the store is unreachable\)[\s\S]{0,60}?report it once and fall through to `init` below[\s\S]{0,60}?Not a stop/,
    'fall through to `init` when the anchor read fails, reporting it once rather than stopping',
  ],
  [
    path.join('references', 'run-init.md'),
    /No `## Run state` section, or its `\*\*Stage:\*\*` line reads `shipped`\*\*[\s\S]{0,60}?not adopted[\s\S]{0,150}?fall through to `init` below/,
    'treat a `shipped` stage or a section-less anchor as not adopted, falling through to `init`',
  ],
  [
    path.join('references', 'run-init.md'),
    /A `## Run state` section whose stage is not `shipped`\*\* → \*\*adopt\*\*\. Write `<run-root>\/dod\.md` from[\s\S]{0,400}?scope\.js" adopt --root <run-root>/,
    'adopt the snapshot — write `<run-root>/dod.md` from the anchor body before piping it to `scope.js ' +
      'adopt`',
  ],
  [
    path.join('references', 'run-init.md'),
    /your playbook's \*\*Resume\*\* section reconciles it against `git log`, and re-dispatches no slice that reconciliation finds already on the scope branch/,
    "state that the adopted slice table gates no re-dispatch on its own — the playbook's Resume " +
      'reconciliation against `git log` decides',
  ],
  [
    path.join('references', 'run-init.md'),
    /a live ledger — one already on disk, or one you just adopted from the anchor's[\s\S]{0,20}?snapshot — is \*\*`resumed`\*\*/,
    'name the run kind `resumed` for a ledger it just adopted, beside one already on disk',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /A name that does not verify locally is fetched before anything else\*\*: `git fetch[\s\S]{0,30}?<branch>` \(`<remote>` from `docs\/agents\/code-management\.md`\)/,
    'fetch a `resumed` branch that does not verify locally, from the remote `docs/agents/code-management.md` ' +
      'names, before taking the stop',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /Verify the fetch's own\s+ref afterwards, `git rev-parse --verify <remote>\/<branch>`, never the bare name a second time\*\*: fetching\s+one ref only ever populates the remote-tracking ref `refs\/remotes\/<remote>\/<branch>`, never a local\s+`refs\/heads\/<branch>`/,
    "verify the fetch's own remote-tracking ref (`git rev-parse --verify <remote>/<branch>`) afterwards, " +
      'never the bare name a second time — a fetch only ever populates `refs/remotes/<remote>/<branch>`, ' +
      'never a local `refs/heads/<branch>`',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /the fetch found nothing either — is a stop, naming the branch it looked for, not a guess\.[\s\S]{0,20}?\*\*`--unattended` → block\*\*, per `## Unattended`/,
    'stop, naming the branch it looked for, when the fetch finds nothing either, and block rather than ' +
      'ask under `--unattended`',
  ],
];

// The `resumed-scopetree-trigger` contract (ADR 0042), one row: `references/scope-mode.md`'s scopetree
// step in the `resumed` branch bullet must create or reattach the scopetree whenever it is absent for
// *either* cause — `/superdev:ship` already removed it, or this checkout never held it at
// all (a resumed run adopted from the anchor on a fresh clone, the scenario `adopt-run-state` makes
// reachable). A fix cycle found the sentence named only the first cause: `implement-lite.md`'s Resume
// step works "in the scopetree" unconditionally, assuming it exists, and nothing created it on a
// fresh clone. No fixture distinguished "removed by ship" from "never created", so a regression back to
// the narrower, single-cause sentence would pass silently. Split out from `ADOPT_RUN_STATE_CONTRACTS`
// rather than appended to it, because the two tables answer different questions — which branch gets
// fetched, versus which scopetree gets created — and a single-cause regression here is exactly the shape
// a per-clause row exists to catch on its own. ADR 0045 broadened the clause from the `lite` tier alone to
// both, so the row no longer anchors on "the `lite` tier" — a full run resuming on a fresh clone reaches
// the identical scopetree-creation case.
const RESUMED_SCOPETREE_TRIGGER_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /[Cc]reate\s+or\s+reattach\s+the\s+scopetree,\s+at\s+both\s+tiers,\s+whenever\s+it\s+is\s+absent[\s\S]{0,60}?already removed it, or because this checkout never held it[\s\S]{0,60}?resumed run adopted from the anchor on a fresh clone/,
    'create or reattach the scopetree, at both tiers, whenever it is absent, whether ' +
      '`/superdev:ship` removed it or this checkout never held it (a resumed run adopted from the anchor ' +
      'on a fresh clone)',
  ],
];

// INV-0013 / ADR 0090: a caller entering a run root it did not itself create in this invocation reads the
// ledger's stage together with the lock's mtime before its first write — a stage past `planned` with a
// lock under an hour old is a live implement run, which stops the caller rather than letting it join silently. The
// rule is stated once, in scope-mode.md's `## The run lock`; every other document defers to it rather
// than restating it, so this table pins the rule's own presence plus each caller's own deferral.
const RUN_LOCK_LIVENESS_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /own entry into an existing run root consults liveness before its first write/,
    'state the liveness-check rule at the top of `## The run lock`',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /Any stage other than `planned`, with a lock under an hour old[\s\S]{0,40}?a live implement run/,
    'name any stage other than `planned`, with a fresh lock, as a live implement run — not an enumeration a new stage value could fall outside of',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /Stage `planned`, any lock age[\s\S]{0,120}?ordinary hand-off, not a collision/,
    'name a `planned` stage with any lock age as the ordinary hand-off, never a collision',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /governs `\/superdev:implement`'s own entry alone, never `\/superdev:review`,\s+`\/superdev:document`, or `\/superdev:ship`/,
    'state that the liveness check governs `/superdev:implement`\'s own entry alone, never review/document/ship\'s ordinary hand-off',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /`\/superdev:plan` keeps its own, narrower check, unaffected by the rule above/,
    "keep /superdev:plan's own pre-existing, narrower lock check distinct from the new rule, rather than folding it into the stage-based one",
  ],
  [
    path.join('references', 'run-init.md'),
    /already on disk for this scope's `<scope>`[\s\S]{0,150}?gets the liveness check first, ahead of every other step/,
    'take the liveness check as its own first step, ahead of the DoD write, the ledger-stage advance, or the playbook\'s own lock refresh, naming `<scope>` as already resolved',
  ],
  [
    path.join('references', 'implement-full.md'),
    /Run init's own entry step already checked the run lock's liveness before this\s+playbook started/,
    "state that run init's own entry step already checked liveness, so this step reconciles rather than detects a live second session",
  ],
  [
    path.join('references', 'implement-lite.md'),
    /Run init's own entry step already checked the lock's liveness before this\s+playbook ever started/,
    "state that run init's own entry step already checked liveness, so this step reconciles rather than detects a live second session",
  ],
];

// The absence half of the scoping decision above (`scanRunLockLivenessSilence` in `scanners.js` runs it):
// review/document/ship's own "refresh the run lock" bullets may carry no liveness-check language of their
// own. A one-sided pin — asserting the rule's presence in scope-mode.md alone — reads as enforced while a
// skill edit re-widens the check onto these three without drift-check ever noticing, which is exactly the
// regression a first cycle of this feature shipped and a whole-scope review caught (ADR 0090).
const RUN_LOCK_LIVENESS_SILENCE_DOCS = [
  path.join('skills', 'review', 'SKILL.md'),
  path.join('skills', 'document', 'SKILL.md'),
  path.join('skills', 'ship', 'SKILL.md'),
];

const RUN_LOCK_LIVENESS_SILENCE_MARKERS = [
  [
    /liveness check/i,
    (hit) =>
      "carry no run-lock liveness check of its own — that check governs /superdev:implement's entry " +
      `alone (INV-0013, ADR 0090): "${normalizeWhitespace(hit[0])}"`,
  ],
  [
    /ledger'?s stage[^.]{0,80}?lock'?s (?:mtime|freshness|age)/i,
    (hit) =>
      "carry no ledger-stage-plus-lock-freshness check of its own — that check governs /superdev:implement's " +
      `entry alone (INV-0013, ADR 0090): "${normalizeWhitespace(hit[0])}"`,
  ],
];

// The `containment-delegation` contract (ADR 0053) retargeted onto code (ADR 0069): the row used to pin
// `skills/publish-kb/SKILL.md` §3 naming the test it runs by pointing at `references/scope-mode.md`'s
// `## Containment` section rather than stating a git command of its own. That prose delegation moved
// into `plugin/scripts/publish-kb.js`'s `checkContainment`, which now delegates the same way in code:
// it `require`s `testContainment` from `scope.js` and calls it directly, rather than reimplementing its
// own ancestry test — the ADR's own decision that the test is stated *once* still holds, just in the
// function `scope.js` exports instead of a section a document points a reader at. A dispatch cannot
// contradict this the way a skill's restated incantation could: `checkContainment` is code the script
// always runs, not prose a model re-reads and might paraphrase into its own git command. Its own table
// rather than a row on `RUN_KIND_CONTRACTS`, whose subject is scope-mode.md's three run kinds — a
// publish-kb row there would make that check's `ok` phrase lie.
//
// The row pins the delegation's presence, so, like its prose predecessor, it catches only one half of
// the drift ADR 0053 names: `checkContainment` dropping the `require`/call and reaching for its own
// ancestry test instead (e.g. a raw `git merge-base --is-ancestor`) is exactly the state ADR 0053
// measured — "not merged" on every squash-merged scope, and an operator trained to wave the warning
// through. A `testContainment` imported but never called (dead code sitting beside a hand-rolled
// replacement) reads the same way and is caught the same way, since the pattern requires both the
// `require` destructure and a call site. It cannot see the other half — a script that keeps the real
// call *and* grows a second, redundant ancestry test beside it — the same blind spot the prose version
// carried for a restated incantation sitting beside its pointer.
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

// The `containment-refetch` contract (ADR 0065), four rows, all on `references/scope-mode.md`'s
// `## Containment` section: the test that decides a scope branch reached base runs a second pass before
// it answers not contained. ADR 0053 fixed what the test asks — content, not ancestry — and left the ref
// it asks of alone, so a pull request squash-merged on the host reads not contained until the clone
// pulls. Every consumer inherits the section's answer, which is what makes a single-document contract
// enough here: `skills/publish-kb/SKILL.md` §3 asks the operator to confirm a publish, and
// `## Cutting the scope branch`'s `fresh` run kind offers to rename a branch whose work is already safe.
// `/superdev:plan`'s extend path reads no containment: ADR 0083 made a shipped feature's refusal a plain
// ledger-stage read, with no branch test behind it.
//
// Each row pins a clause that fails differently on its own. The fetch row pins the retested ref by name:
// `git fetch <remote> <base>` populates `refs/remotes/<remote>/<base>` and never the local branch, so a
// second pass rewritten to retest `<base>` re-asks the stale ref and always agrees with the first
// verdict — a contract that reads enforced while the defect stands. The fallback row covers the git
// older than 2.38 route, which is the weaker signal to begin with and the one most in need of a fresh
// base. The scope-prune row is the negative half: that hook mirrors this section in JavaScript and is
// the one caller excluded from the fetch, so a section that stops naming the exclusion invites the
// mirror to grow a network call on a `Stop` hook firing every turn. The failure row keeps the second
// pass advisory — an unreachable host leaves the first verdict standing rather than ending the caller.
const CONTAINMENT_REFETCH_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /Fetch the base branch once from the remote `docs\/agents\/code-management\.md` names[\s\S]{0,400}?run the same test again against `FETCH_HEAD`[\s\S]{0,400}?The second verdict is the answer/,
    'state the second pass: fetch the base once from the remote `docs/agents/code-management.md` names, ' +
      'retest against `FETCH_HEAD`, and take that second verdict as the answer (ADR 0065)',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /`--is-ancestor` fallback[\s\S]{0,120}?takes the same second pass/,
    'state that the `--is-ancestor` fallback takes the same second pass as the `--write-tree` test',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /`hooks\/scope-prune\.js` runs the local test alone and never fetches/,
    'name `hooks/scope-prune.js` as the one caller that runs the local test alone and never fetches',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /No remote configured, or a fetch that fails[\s\S]{0,400}?leaves the first verdict standing, and the caller says the second pass did not run/,
    'state that no remote, or a failed fetch, leaves the first verdict standing and has the caller say ' +
      'the second pass did not run',
  ],
];

// The `containment-probe` contract (ADR 0082), three rows on `references/scope-mode.md`'s
// `## Containment` section: where the tree comparison conflicts, the test asks the neighbouring question
// — whether base's history took the branch's patch. Two callers read the section's answer and neither
// restates it, so pinning the section alone pins the contract: `plugin/scripts/scope.js` implements it,
// and `plugin/hooks/scope-prune.js` calls that implementation.
//
// Each row fails on its own. The tier row pins the probe's existence and its trigger; a section that
// stops naming the exit 1 trigger invites the implementation back to the ADR 0053 verdict that left
// twenty branches standing. The cap row pins the bound as a commit count — a wall clock swapped in lets
// one repository state answer two ways, which is the property the ADR rejected it for. The fail-closed
// row pins INV-0003 across every probe step, the direction a probe that guesses would break first.
const CONTAINMENT_PROBE_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /second tier asks whether base's history took the patch[\s\S]{0,600}?git patch-id --stable[\s\S]{0,600}?A match → \*\*contained\*\*/,
    "state the second tier: on the tree comparison's exit 1, match the patch id of the branch's " +
      "cumulative diff from the merge base against the patch ids of the commits base gained since, and " +
      'read a match as contained (ADR 0082)',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /rev-list --count[\s\S]{0,200}?gates the scan, at a cap of \d+ commits[\s\S]{0,400}?commit count rather than a wall clock/,
    'gate the probe on a commit count with a stated cap, never a wall clock, so one repository state ' +
      'gives one verdict (ADR 0082)',
  ],
  [
    path.join('references', 'scope-mode.md'),
    /Every probe step that cannot answer answers not contained[\s\S]{0,300}?exhausted cap/,
    'hold INV-0003 across the probe — a failed git call and an exhausted cap alike answer not contained',
  ],
];

// `agents/final-reviewer.md`'s Brevity axis and `references/review-checklist.md`'s Cross-slice
// divergence bullet are both written for a scope with slices to compare — a standing-code target has
// none, so a literal reading of either flags nothing there, and `simplicity-reviewer` is skipped on that
// target (`skills/review/SKILL.md`), leaving no other lens to pick up the slack. Each sentence carries its
// own standing-code reading rather than relying on `agents/final-reviewer.md`'s blanket re-aim
// ("applying every check below to the code itself rather than to a change"): that sentence re-aims a
// check's *target*, not what a slice-scoped clause like "spans slices" or "across slices" cashes out to
// once there are no slices at all.
const STANDING_CODE_LENS_CONTRACTS = [
  [
    path.join('agents', 'final-reviewer.md'),
    /flag that same class within\s+the code itself instead/,
    'give the Brevity axis its own standing-code reading — duplicated logic and a divergent second way ' +
      'to do one job within the code itself, since standing code has no slices to span',
  ],
  [
    path.join('references', 'review-checklist.md'),
    /On standing code, with no slices to compare, this reads\s+as a divergent second way to do one job/,
    'give Cross-slice divergence its own standing-code reading — a divergent second way to do one job ' +
      'living inside the code itself, since standing code has no slices to compare',
  ],
];

// ADR 0068's fourth sweep leg is `/superdev:setup check`: a read-only drift check, named by a literal
// word the way `/superdev:document audit` is, rather than sniffed. The two rows pin the signal and the
// posture in the same document — losing either half silently ships a `check` mode that starts asking
// interview questions, or a mode nothing can reach at all because the argument-hint never named it.
const SETUP_CHECK_CONTRACTS = [
  [
    path.join('skills', 'setup', 'SKILL.md'),
    /^argument-hint:.*check/m,
    'declare an `argument-hint` naming `check`',
  ],
  [
    path.join('skills', 'setup', 'SKILL.md'),
    /check[\s\S]{0,200}writes no file, makes no slice-store call, and starts no interview/,
    'state that `check` mode writes no file, makes no slice-store call, and starts no interview',
  ],
];

// ADR 0077: the invariant register lives at one fixed path, and `domain-modeling.md` is what tells
// `/plan` and a human where it is. A copy that stops naming `docs/invariants.md` sends both looking
// for the register at the `.claude/rules/` home ADR 0077 retired.
const INVARIANT_REGISTER_CONTRACTS = [
  [path.join('references', 'domain-modeling.md'), /docs\/invariants\.md/, "name the register's fixed path, `docs/invariants.md`"],
];

// ADR 0077's consequences: a repository carrying `.claude/rules/` loses its rule-compliance check, and
// `/superdev:setup check` is what tells its operator — naming `docs/invariants.md` as the register the
// content moves into, and that the move is by hand, because `Class` and `Concepts` are mandatory fields
// a glob-scoped rule records nowhere. Losing this row lets `check` mode go silent on a leftover
// `.claude/rules/` directory, stranding the operator with no signal that the directory's content wants
// migrating.
const SETUP_CHECK_RULES_CONTRACTS = [
  [
    path.join('skills', 'setup', 'SKILL.md'),
    /\.claude\/rules\/[\s\S]{0,400}docs\/invariants\.md[\s\S]{0,400}by hand/,
    'report a leftover `.claude/rules/` directory, naming `docs/invariants.md` as where its content ' +
      'belongs and that the move is by hand',
  ],
];

// ADR 0077: the doc pass resolves the register's `Paths:`/`Symbols:` entries against the repo, and
// doc-reader carries the same lens cold, since it is the surface that checks a doc's claims against the
// repo with no prior context. Either row losing the instruction leaves the register's own claims to
// drift unnoticed alongside the code they name — the same one-sided-pin shape CONTENT_TYPES_DOCS guards
// on the content-type lens, applied to this lens instead.
const INVARIANT_REGISTER_DOC_PASS_PATTERN =
  /resolve every entry's `Paths:` glob and every `Symbols:` entry against the repository/;

const INVARIANT_REGISTER_DOC_PASS_CONTRACTS = [
  [
    path.join('references', 'doc-pass.md'),
    INVARIANT_REGISTER_DOC_PASS_PATTERN,
    "resolve every invariant entry's `Paths:` glob and `Symbols:` entry against the repository, " +
      'reporting one that matches nothing by its entry id',
  ],
  [
    path.join('agents', 'doc-reader.md'),
    INVARIANT_REGISTER_DOC_PASS_PATTERN,
    "carry the same lens cold: resolve every invariant entry's `Paths:` glob and `Symbols:` entry " +
      'against the repository',
  ],
];

// ADR 0077: an invariant crystallised in the interview is only reachable by an implementer working in
// an isolated worktree once /plan judges it against the register during grounding — before any slice
// exists — and then routes the held match into both the Definition of Done and the touching slice's
// `spec` once that slice is cut, and final-reviewer only checks against it, not the `.claude/rules/`
// home the register replaced. The judging half and the writing half are two different points in /plan's
// own flow, so they are two separate rows here — losing any one of the three leaves a stage of that
// routing recorded but unread.
const INVARIANT_COMPLIANCE_CONTRACTS = [
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /docs\/invariants\.md[\s\S]{0,400}[Jj]udge each entry/,
    'judge the decomposition against the invariant register during grounding, reading `docs/invariants.md` whole',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /Definition-of-Done criterion naming the entry's id[\s\S]{0,200}`spec` of (?:that|the) slice/,
    "route a held register match into a Definition-of-Done criterion naming its id, and into the touching slice's `spec`",
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /\*\*Invariant compliance\*\*[\s\S]{0,300}docs\/invariants\.md[\s\S]{0,400}plan-coverage gap[\s\S]{0,200}skip this check silently/,
    'carry the Invariant compliance check: read `docs/invariants.md`, report a break as a finding and a DoD-omitted entry as a plan-coverage gap, skip silently when the register is absent',
  ],
];

// ADR 0081: a load-bearing commitment leaves a run either as an invariant register entry or as a reason,
// named out loud, that it implies none. Three documents carry that agreement between them, and each half
// reads correct alone while the contract is gone from another: `skills/brainstorm/SKILL.md` can keep
// naming commitments in the intent while `references/domain-modeling.md` loses the sort that converts
// them, leaving an intent full of principles nobody ranks; `references/domain-modeling.md` can carry the
// whole conversion while `skills/plan/SKILL.md` stops routing to it, so a commitment `/superdev:plan`
// originates — the more common source — reaches no sort at all; and both can be intact while plan's
// delete-gate reverts to covering `Rejected direction` alone, which lets the irreversible intent delete
// drop a commitment that found no home. That is the one-sided-pin shape `FULL_SUITE_CONTRACTS` already
// shipped in this repository, so all three are pinned together here rather than as separate checks.
//
// Two rows guard the sort's own branches, because each fails silently and in opposite directions. Losing
// the authoring-rule guard (review finding, ADR 0081) lets a rule about how the work is done answer yes
// to "does it constrain a later decision" and land in a consuming repository's register, which the
// feature forbids — a mis-route rather than a gap, and invisible. Losing the `Check: none` branch
// reverts the sort from what a commitment constrains to whether it can be tested, which drops exactly
// the commitments worth keeping: one binding a hundred decisions and no single test.
const COMMITMENT_CAPTURE_CONTRACTS = [
  [
    path.join('skills', 'brainstorm', 'SKILL.md'),
    /\*\*Load-bearing commitments\*\*[\s\S]{0,300}the rule it implies/,
    'name load-bearing commitments in the intent as a pair, the principle and the rule it implies (ADR 0081)',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /Route the seeded commitments[\s\S]{0,300}references\/domain-modeling\.md[\s\S]{0,200}register entry/,
    "route every commitment — seeded or originated — through `references/domain-modeling.md`'s conversion (ADR 0081)",
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /`Load-bearing commitment`\*\*\s+it carried has a durable home/,
    "cover load-bearing commitments in the seeded intent's delete-gate, beside `Rejected direction` (ADR 0081)",
  ],
  [
    path.join('references', 'domain-modeling.md'),
    /ask what later decision the commitment\s+constrains/,
    'sort a commitment on what later decision it constrains (ADR 0081)',
  ],
  [
    path.join('references', 'domain-modeling.md'),
    /\*\*authoring rule\*\*[\s\S]{0,200}record it nowhere/,
    'ask the authoring-rule guard first, and record such a rule in no register (ADR 0081)',
  ],
  [
    path.join('references', 'domain-modeling.md'),
    /where nothing cheaply tests it[\s\S]{0,150}`Check: none`/,
    'keep an untestable commitment as a register entry carrying `Check: none` and its reason (ADR 0081)',
  ],
];

// ADR 0084, INV-0006: verifying a Definition-of-Done criterion observes, and changes no system outside
// the repository. `references/scope-mode.md` owns the rule; the seven rows below pin its own section
// plus both verifying agent bodies (`final-reviewer.md`, `implementer.md`) and all four
// surfaces that verify a criterion or dispatch an agent that does (`skills/review/SKILL.md`,
// `skills/implement/SKILL.md`, `references/run-handoff.md` — whose red-full-suite implementer dispatch
// sits outside `skills/implement/SKILL.md` entirely — and `skills/ship/SKILL.md`). A contract in an
// agent body also has to hold in the prose that dispatches it (root `AGENTS.md`'s prompt-architecture
// rule), so `implementer.md`'s single body clause is pinned once and reached by two dispatch rows.
const VERIFICATION_CEILING_CONTRACTS = [
  [
    path.join('references', 'scope-mode.md'),
    /[Vv]erif\w+ a Definition-of-Done criterion observes[\s\S]{0,40}changes no system outside the repository/,
    'carry the `## Verification ceiling` section stating that verifying a Definition-of-Done criterion observes and changes no system outside the repository (ADR 0084, INV-0006)',
  ],
  [
    path.join('agents', 'final-reviewer.md'),
    /[Vv]erif\w+ a criterion observes[\s\S]{0,40}changes no system outside the repository[\s\S]{0,200}report\w* as unverifiable on the branch, needing\s*\n?\s*verification after merge/,
    'state that verifying a criterion observes and changes no system outside the repository, and that a criterion needing an outward-facing change gets reported as unverifiable on the branch, needing verification after merge (ADR 0084, INV-0006)',
  ],
  [
    path.join('agents', 'implementer.md'),
    /[Vv]erif\w+ a criterion observes[\s\S]{0,40}changes no system outside the repository[\s\S]{0,300}gets no increment[\s\S]{0,150}report\w* it as needing verification after merge/,
    'state that verifying a criterion observes and changes no system outside the repository, and that a criterion needing an outward-facing change gets no increment and is reported as needing verification after merge (ADR 0084, INV-0006)',
  ],
  [
    path.join('skills', 'review', 'SKILL.md'),
    /[Cc]onfirming a `dod\.md` criterion observes[\s\S]{0,40}changes no system outside the repository[\s\S]{0,200}report\w* as unverifiable on the branch, needing\s*\n?\s*verification after merge/,
    "state that confirming a `dod.md` criterion observes and changes no system outside the repository, and that a criterion needing an outward-facing change gets reported as unverifiable on the branch, needing verification after merge (ADR 0084, INV-0006)",
  ],
  [
    path.join('skills', 'implement', 'SKILL.md'),
    /[Vv]erif\w+ an `acceptance` criterion observes[\s\S]{0,40}changes no system outside the repository[\s\S]{0,300}gets no increment[\s\S]{0,150}report\w* it as needing verification after merge/,
    'state that verifying an `acceptance` criterion observes and changes no system outside the repository, and that a criterion needing an outward-facing change gets no increment and is reported as needing verification after merge (ADR 0084, INV-0006)',
  ],
  [
    path.join('references', 'run-handoff.md'),
    /[Vv]erif\w+ the fix observes[\s\S]{0,40}changes no system outside the repository/,
    'state that verifying the red-full-suite fix observes and changes no system outside the repository (ADR 0084, INV-0006)',
  ],
  [
    path.join('skills', 'ship', 'SKILL.md'),
    /[Vv]erif\w+ an item observes[\s\S]{0,40}changes no system outside the repository/,
    'state, beside "Verify the items yourself", that verifying an item observes and changes no system outside the repository (ADR 0084, INV-0006)',
  ],
];

// ADR 0084's own closing decision: `/superdev:ship` §4 ticks a criterion naming the test suite from the
// run's own recorded result — the ledger's stage together with its degrade record — rather than running
// that suite itself. `DOC_STEP_SILENCE_DOCS`/`SUITE_RUN_INSTRUCTIONS` above already assert the negative
// (`skills/ship/SKILL.md` carries no suite-run instruction of its own); this table asserts the positive
// clause that replaces one — the read path and the "runs no test command anywhere" statement — so a
// document that goes silent about the suite entirely, rather than reading the ledger for it, still trips
// this row even though it trips no negative scanner.
const DOD_SUITE_CRITERION_CONTRACTS = [
  [
    path.join('skills', 'ship', 'SKILL.md'),
    /ticked from the run's own recorded result, never by running it/i,
    'tick a criterion naming the test suite from the run\'s own recorded result, never by running it (ADR 0084)',
  ],
  [
    path.join('skills', 'ship', 'SKILL.md'),
    /get stage[\s\S]{0,300}get degraded/,
    'read both the ledger stage and its degrade record to decide that criterion',
  ],
  [
    path.join('skills', 'ship', 'SKILL.md'),
    /[Ss]hip runs no test command anywhere/,
    'state plainly that ship runs no test command anywhere',
  ],
  [
    path.join('skills', 'ship', 'SKILL.md'),
    /scope whose recorded result is a denied or absent test command leaves such a criterion unticked[\s\S]{0,60}that record as its note/,
    'state that a scope whose recorded result is a denied or absent test command leaves such a criterion unticked, with that record as its note (ADR 0084)',
  ],
];


// ADR 0084, INV-0008: a Definition-of-Done criterion states a requirement the feature meets, never a
// procedure superdev executes to verify it, so it names no command superdev runs to check it. The two
// rows pin the rule on `plan-contract.md`, the reference that states it, and on the two interview steps
// `skills/plan/SKILL.md` carries beside it: writing no verification command into a criterion, and
// surfacing a criterion verifiable only on a live system so it never forces a pre-merge deploy the
// verification ceiling already forbids (ADR 0084). Losing the reference row leaves the rule unstated
// while `Reachable:` looks like an unexplained exception; losing either skill row leaves the interview
// still capable of writing a criterion naming a test command or a live-system-only check with no offer to
// keep it out of the branch-verifiable set.
const CRITERION_STATES_A_REQUIREMENT_CONTRACTS = [
  [
    path.join('references', 'plan-contract.md'),
    /criterion states a requirement the feature meets, never a procedure superdev executes to verify it/,
    'state that a criterion states a requirement the feature meets, never a procedure superdev executes to verify it, naming no command it runs to check it (ADR 0084, INV-0008)',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /\*\*Write a Definition-of-Done criterion as a bare requirement\.\*\*[\s\S]{0,200}leaving the command that checks it unnamed/,
    'carry the **Write a Definition-of-Done criterion as a bare requirement.** step, leaving the command that checks it unnamed',
  ],
  [
    path.join('skills', 'plan', 'SKILL.md'),
    /\*\*Surface a criterion verifiable only on a live system\.\*\*[\s\S]{0,400}keep it out of the branch-verifiable Definition of Done/,
    'surface a criterion verifiable only on a live system, name the pre-merge deploy it would force, and offer to keep it out of the branch-verifiable Definition of Done',
  ],
];

// ADR 0087: a spawn that never started is a **Spawn failure**, outside INV-0009, and the two gates
// answer it differently on purpose. `hooks/green-gate.js` blocks, because it fires only on a merge and
// a tree that cannot run its suite is a defect in the thing being gated. `scripts/adapter.js`'s hook
// bridge lets the call through with a notice, because it fires on every tool call and every repair for
// a broken install is made through the surface a block would close.
//
// Two rows, one per surface, and each pins the **reason** rather than the behaviour alone. A divergence
// between two implementations of one rule reads as an oversight when only the behaviours are pinned —
// which is how the bridge's own fail-open read before #606, and why it survived as long as it did. Each
// row also requires the clause naming what the *other* surface does, so a reader meeting either one
// learns the divergence is deliberate without having to find the ADR first.
const SPAWN_FAILURE_ANSWER_CONTRACTS = [
  [
    path.join('hooks', 'green-gate.js'),
    /never started[\s\S]{0,400}can't even run the suite[\s\S]{0,200}the bridge lets the call through[\s\S]{0,200}fires only on a merge/,
    "state that a suite that never started blocks because the merge's own tree cannot run it, name the bridge's opposite answer as deliberate, and name that this one fires only on a merge",
  ],
  [
    path.join('scripts', 'adapter.js'),
    /never started[\s\S]{0,400}evidence about the installation[\s\S]{0,600}green-gate\.js[\s\S]{0,200}blocks/,
    "state that a hook that never started lets the call through because the absence is evidence about the installation, and name green-gate's opposite answer as deliberate",
  ],
];

module.exports = {
  COMMITMENT_CAPTURE_CONTRACTS,
  DOD_SUITE_CRITERION_CONTRACTS,
  CONTAINMENT_DELEGATION_CONTRACTS,
  CONTAINMENT_REFETCH_CONTRACTS,
  CONTAINMENT_PROBE_CONTRACTS,
  STANDING_CODE_LENS_CONTRACTS,
  SETUP_CHECK_RULES_CONTRACTS,
  REFERENCE_PATTERN,
  RUN_ROOT_DOCS,
  RUN_ROOT_ARTIFACT_PATTERN,
  ASSIGNEE_DOCS_DIR,
  ASSIGNEE_EXEMPT,
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
  RELEASE_REMOVE_EXEMPT,
  RELEASE_REMOVE_EXPECTATION,
  LOCAL_RELEASE_DOC,
  LOCAL_NO_REMOVAL_PATTERN,
  LOCAL_NO_REMOVAL_EXPECTATION,
  RELEASE_BOTH_DIRECTIONS_DOC,
  RELEASE_BOTH_DIRECTIONS_PATTERN,
  RELEASE_BOTH_DIRECTIONS_EXPECTATION,
  LOCAL_APPEND_DOC,
  LOCAL_CONTINUATION_ELEMENT,
  AFK_SELECTION_HEADING,
  STORE_MECHANISMS,
  WRITING_STANDARD_DOCS,
  WRITING_STANDARD_PATTERN,
  ADR_DIR,
  ADR_STATUSES,
  ADR_STATUS_PATTERN,
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
  REACHABLE_CRITERION_CONTRACTS,
  REVIEW_RANGE_SHAPES_CONTRACTS,
  EMPTY_ARGUMENT_CONTRACTS,
  AGENT_LENS_LIST_CONTRACTS,
  AGENT_LENS_AVOID_DOCS,
  AGENT_LENS_AVOID_MARKERS,
  ORPHAN_LENS_DOC,
  ORPHAN_LENS_ENTRY,
  ORPHAN_LENS_DESIGN_HEADING,
  ORPHAN_LENS_ANTIPATTERN_HEADING,
  ORPHAN_LENS_SCOPE_CLAUSE,
  TEST_COST_LENS_DOC,
  TEST_COST_LENS_HEADING,
  TEST_COST_LENS_ENTRIES,
  LABEL_VALIDATION_CONTRACTS,
  AFK_NAMES,
  AFK_ROW_PATTERN,
  GREEN_GATE_TIMEOUT_CONTRACTS,
  VERB_CONTRACTS,
  KB_STAGING_CONTRACTS,
  FULL_SUITE_CONTRACTS,
  FIX_BOUNDARY_CONTRACTS,
  DENIAL_AUTHORSHIP_CONTRACTS,
  DENIAL_CAP_CONTRACTS,
  DENIAL_RESET_CONTRACTS,
  DENIAL_CAP_NUMBER_SILENCE_DOCS,
  DENIAL_CAP_NUMBER_MARKERS,
  DOC_STEP_SILENCE_DOCS,
  SUITE_RUN_INSTRUCTIONS,
  SHIP_GATE_HEADING,
  SHIP_GATE_ELEMENTS,
  UNRESOLVED_GLOSSARY_CONTRACTS,
  KB_NO_CALL_DOCS,
  KB_BACKEND_CALL_MARKERS,
  HOOK_HEADER_REGEX,
  TEST_SELECTION_CONTRACTS,
  TIER_SKIP_CONTRACTS,
  AFK_ROUTING_CONTRACTS,
  ARG_TOKEN_LINE,
  ARG_TOKEN_CONTRACTS,
  AUDIT_SET_CONTRACTS,
  CHAINED_CODE_REVIEW_CONTRACTS,
  CHAINED_DOC_AUDIT_CONTRACTS,
  CHAINED_TEST_AUDIT_CONTRACTS,
  SWEEP_CHAINED_LEG_CONTRACTS,
  AGGREGATE_PAGE_CONTRACTS,
  READ_PATH_CONTRACTS,
  PUBLISH_KB_INVOCATION_CONTRACTS,
  STATUS_SEED_CONTRACTS,
  PLAN_APPEND_CONTRACTS,
  SHIPPED_APPEND_CONTRACTS,
  ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
  ROTATE_ON_SHIPPED_CONTRACTS,
  PARKED_QUESTIONS_CONTRACTS,
  RUN_KIND_CONTRACTS,
  SCOPETREE_CONTRACTS,
  AFK_LOCK_TIER_SILENCE_DOCS,
  AFK_LOCK_TIER_MARKERS,
  FORCING_FLAG_DOCS,
  FORCING_FLAG_PATTERNS,
  NARRATIVE_DOC,
  AGENT_TOOLCHAIN_PATTERNS,
  UNMAPPED_PATHS_RUNNERS,
  UNMAPPED_PATHS_DOCS,
  PATHS_DERIVATION_CONTRACTS,
  SOURCE_SECTION_CONTRACTS,
  SPECIALISING_SECTIONS,
  GLOSSARY_ENTRY_TITLES,
  specialisingGenericRows,
  specialisingHeading,
  specialisingCitation,
  RETURN_TO_CONTROLLER_DOCS,
  RETURN_TO_CONTROLLER_PATTERNS,
  PLAYBOOK_EDGE_CONTRACTS,
  AFK_ANCHOR_COUNT_HEADING,
  AFK_ANCHOR_COUNT_ELEMENTS,
  PUBLISH_RUN_STATE_CONTRACTS,
  ADOPT_RUN_STATE_CONTRACTS,
  RESUMED_SCOPETREE_TRIGGER_CONTRACTS,
  TRIAGE_RECORD_CONTRACTS,
  TRIAGE_RECORD_PATTERN,
  TRIAGE_RECORD_EXPECTATION,
  TRIAGE_RECORD_ELEMENTS,
  UNTRIAGED_PATTERN,
  UNTRIAGED_EXPECTATION,
  UNTRIAGED_ELEMENTS,
  BACKLOG_SURVEY_CONTRACTS,
  SETUP_CHECK_CONTRACTS,
  INVARIANT_REGISTER_CONTRACTS,
  INVARIANT_REGISTER_DOC_PASS_CONTRACTS,
  INVARIANT_COMPLIANCE_CONTRACTS,
  PLANNED_HANDOFF_CONTRACTS,
  SCOPETREE_RUN_ROOT_DOCS,
  SCOPETREE_RUN_ROOT_PATTERN,
  VERIFICATION_CEILING_CONTRACTS,
  CRITERION_STATES_A_REQUIREMENT_CONTRACTS,
  RUN_LOCK_LIVENESS_CONTRACTS,
  RUN_LOCK_LIVENESS_SILENCE_DOCS,
  RUN_LOCK_LIVENESS_SILENCE_MARKERS,
  SPAWN_FAILURE_ANSWER_CONTRACTS,
};
