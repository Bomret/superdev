# scripts/

## Purpose

Standalone deterministic code that `package.json` runs, alongside `plugin/hooks/`. Four executables.
Two shipped CLIs live in `plugin/scripts/`: `scope.js` (the run-state CLI, ADR 0022) and `kb-patch.js`
(the knowledge-base section merge, ADR 0027). Two maintainer-only ones live here in `scripts/`:
`eval-run.js` (the eval runner, ADR 0024) and `drift-check.js` (the cross-document contract checks).
This doc owns all four regardless of which of the two dirs each lives in.

## Ownership

This doc owns what each script guards and the contracts between them. Repo-wide rules stay in the root
[`AGENTS.md`](../AGENTS.md): the stack, the working rules, and the release flow.

## Local Contracts

### scope.js, the run-state CLI (ADR 0022)

`scope.js` owns the ledger's schema and is the only `ledger.md` read and write path in the chain:
`init`, `stage set`, `slice`, `degraded add`, `unresolved add|clear`, `docs set <value>|clear`,
`get stage|branch|anchor|slices|unresolved|degraded|docs`, and `status`
(which renders the whole `/superdev:status` report). It also exports `readLedgerHeader` as a module
API. This per-header ledger-line reader is what `hooks/scope-prune.js` uses instead of carrying its
own regex. The API guards its CLI entry with `require.main === module`, so a `require` for that
reader alone runs no CLI code. Normalisation is per header: `Stage` and `Branch` are single tokens,
cut to the first whitespace-delimited token and stripped of markup and trailing punctuation.
`Anchor` is a prose title that reaches a pull request, trimmed and otherwise left alone. An empty
header line reads as absent, not as an empty string. Both `readLines` and `readLedgerHeader` split
on `\r?\n`. A `ledger.md` an editor or `core.autocrlf` wrote with CRLF line endings reads exactly as
an LF one does. A lone `\r`, the classic-Mac line ending, reads as absent, and that is deliberate.
Any verb that writes the file normalises it back to LF. A scope whose ledger stage reads `shipped`
collapses to one line, `<scope>  (shipped)`. It drops the slice tally and the blocked list.
`hooks/scope-prune.js` (ADR 0007) is about to reap that run root, so per-slice detail is no longer
work in flight. Its `**Degraded:**` line, its `**Unresolved:**` line, and its staged-page lines
survive the collapse, because each is otherwise recorded nowhere else.

`status` also reports every scope's **staged knowledge-base pages** under `.superdev/kb-pending/`
(ADR 0023): a `pending publish:` line per scope, a scope with no run root under `(no ledger)`, a
non-`.md` file staged and ignored, and a `.md` file staged directly under `.superdev/kb-pending`
outside any scope directory. Each is a page `/superdev:publish-kb` would otherwise silently miss.

The stage machine's transition rules are enforced in its code, not in prose, and
`hooks/ledger-guard.js` denies every other write path. Its selftest carries the retired drift
assertions along with its own behavior: the stage machine, the ledger schema and header lines, a
pre-CLI ledger parsing unchanged, and the scope-slug charset staying equal across `scope.js`,
`hooks/run-lock.js`, and `references/scope-mode.md`.

### kb-patch.js, the knowledge-base section merge (ADR 0027)

`kb-patch.js` is the deterministic half of a staged page's `action: patch`. It reads a live
knowledge-base page and a staged page carrying **one section**, prints the merged markdown on
stdout, and writes nothing. `/superdev:publish-kb` holds the backend credential and calls it.
`agents/doc-writer.md` stages the section and reaches no backend at all (ADR 0023). The merge lives
here rather than in the command's prose so that a reader-facing page is not edited by a model
reading it.

The staged section names itself by the **first ATX heading in its body**, spanning to the next
heading of the same or higher level, so a sub-heading belongs to the section and a sibling ends it.
A heading may carry up to 3 leading spaces. That is CommonMark's own limit, because a fourth space, or
a leading tab, makes the line an indented code block instead. An indented live section is therefore
still recognised as a boundary and is never swallowed into the section ahead of it. The comparison that
finds the live section to replace requires a line to clear that same up-to-3-space gate before it counts
as a candidate at all. It then compares the line by a key that folds three surface spellings of one
heading into a single form: trailing whitespace, a closed-ATX form (`## A ##`), and the gap between the
`#` marker and its text (one space, several, or a tab). The key reads a staged heading as always
column-0, so a live target indented up to 3 spaces still matches instead of missing and appending a
duplicate. A 4-space or tab-indented line that merely *shows* the heading text in a code block never
matches, no matter how it reads once trimmed. Setext headings are unsupported as a section marker: one
notation is what makes "does the
live page carry this heading" a string comparison instead of a parse, and a staged body using one has
no ATX heading and refuses. A *live* page is never validated that way, so the merge separately refuses
when a setext underline falls inside the live region about to be dropped, rather than silently
swallowing that section into the replaced one. `extractSection()` applies the identical `hasSetextHeading()`
check to the **staged** body's own section, refusing there too, rather than accept a shape it merges
cleanly today and then refuses to ever patch again. That failure belongs on the staged file, which
a doc pass re-runs, not on the live page it would otherwise strand. Heading detection runs on fence-masked lines (matches
`scripts/drift/lib.js`'s `maskFences`, including its at-least-as-long closing-fence rule), so a
`#` or `~~~` shown *inside* a fenced code example is never read as a heading, in the staged body, in the
live section being replaced, or by the duplicate-heading scan. An unterminated fence in either input
refuses instead of guessing where it would have closed, because it would otherwise mask every line
after it and hide real headings. The live page carrying that exact heading line has its section
replaced. A page without it gains the section at the end. Sorting is deliberately absent, because where
a new section belongs is editorial, and appending is correct for the ascending-number case
(`ADR summaries`) that motivated the ADR. Appending onto a live page whose trailing blank lines vary
collapses them to exactly one before the new section. That is harmless, since a blank-line run carries
no content.

The merge is **idempotent**: applying the same patch to its own output changes nothing, which is
what makes it safe under `/superdev:publish-kb`'s retry of a staged page whose call failed. It
refuses, nonzero and with a one-line stderr reason, in five cases. A staged body with no heading. A
staged body carrying content before its first heading, or more than one section, where a patch stages
exactly one. A live page carrying the heading more than once, because which section to replace cannot
be resolved, which is the same reason `/superdev:publish-kb` refuses two staged files sharing one
title. An unterminated fenced code block in either input. A setext underline inside the live region a
replace would drop, or inside the section the staged body itself stages. A CRLF live or staged page
merges exactly as an LF one does, the way `scope.js` reads a CRLF ledger.

Removing a single section is out of scope: `patch` replaces or appends, and `delete` still removes a
whole page (ADR 0027, Consequences).

### eval-run.js, the eval runner (ADR 0024)

`eval-run.js` runs every `evals/` case as two arms on a Claude subscription instead of a metered
API key. The plugin arm loads superdev through `claude -p --plugin-dir`. The baseline arm loads
nothing. It scores each arm's diff and transcript against the case's `graders/*.md`. It refuses to
start without `CLAUDE_CODE_OAUTH_TOKEN` and never falls back to a billed `ANTHROPIC_API_KEY`. It
exits non-zero in three cases. A case scores nothing. The ablation looks broken: the plugin arm
shows no superdev marker in any of its runs, or the baseline arm shows one. An arm's transcript
shows a mutating tool call, but the captured diff stays empty. It reports that capture failure as
an error, never as a silent zero. `claude plugin eval` still reads the same `case.yaml` and
`graders/*.md` files, unchanged, for a key-funded cross-check.

Its selftest covers:

- the case-YAML reader
- the child-environment scrub
- the two arms' argument difference
- the run classifier
- the diff-capture failure paths (an empty scaffold, work committed off HEAD, a nested repository
  tracked as a gitlink)
- the two shapes a `scaffold_script` may leave behind. A scaffold that writes files and stops, and a
  scaffold that runs `git init` and commits its own tree, both yield a base commit carrying the
  scaffold's files. `scaffold()` measures an empty scaffold with `git ls-files`, so a workspace with
  nothing staged is scaffolded rather than failed.
- the grader and judge machinery, including a grader that cannot be evaluated at all (an unknown
  focus, a judge that never returns a verdict, or `regex` criteria that will not compile), reported as
  a grader error and left out of the score, never as a fail and never as a thrown `SyntaxError` that
  ends the run
- the symmetry of that exclusion. A grader that errored on one arm is dropped from **both** arms'
  scores, computed in `aggregate()` where both arms of a run are in hand. `scoreArm` runs per arm and
  cannot see the other one, so an exclusion left to it scores the arms over different weight totals
  and turns the delta into arithmetic about which grader failed to run. The per-grader row still
  reports the arm that could not be judged, so the exclusion stays visible.
- aggregation across runs
- the missing-token exit

### drift-check.js, the cross-document contract checks

`drift-check.js` is the entry point only: it walks the check registry and reports. The checks themselves
live beside it, in `scripts/drift/`.

| File | Owns |
|------|------|
| `drift-check.js` | the CLI: `main()`, the ok line, the exit code, and the `--selftest` handoff |
| `drift/checks.js` | the **registry**, one entry per check: `id`, `run`, its `ok` phrase, and how one gap prints. Its array order is the order this narrative numbers them |
| `drift/contracts.js` | the contract tables and patterns. Data only |
| `drift/scanners.js` | the bespoke scanners, every check whose assertion is more than one pattern over one document |
| `drift/lib.js` | what they share: `maskFences`, `extractSection`, the frontmatter readers, `readDoc`, `storeDocuments`, and `scanContract` |
| `drift/selftest/` | `index.js` (the `fixture` helper, `realRoot`, temp-dir cleanup) plus one suite per area: `scanners`, `chain`, `kb-plan` |

The checks named below are the exceptions, and every other one is a **drift assertion**: it compares a
restated fact against its source. `forcing-branch-flag`, `kb-no-backend-call`, `no-second-reader`, and
`return-to-controller` are **negative** assertions. Each reports a document that still says something,
rather than one that stopped saying it. `eval-shape` and `adr-status` compare a document against a
**schema**. `afk-existence` and `marketplace-source` are plain **existence** assertions.

The exceptions are named and the rule covers the rest, deliberately. This sentence used to enumerate
every drift assertion by id, and it fell behind at five separate additions, because a list of forty is
maintained by hand at the moment its author is thinking about code. Naming the exceptions cannot drift
when a new check lands.

`drift-check.js` guards fifty-one things, in the order `drift/checks.js` registers them. First, the
`reference` contract: every `references/*.md` path named in `commands/`, `agents/`, or `references/`
itself resolves to a file that exists. A reference cites another reference, as both execution
playbooks point at `scope-mode.md`, so a rename there dangles like any other. Second, the
`run-root` contract: `commands/implement.md`, `commands/review.md`, `commands/document.md`,
`commands/ship.md`, `commands/publish-kb.md`, `references/implement-full.md`,
`references/implement-lite.md`, `references/run-init.md`, `references/run-handoff.md`,
`references/scope-mode.md`, `agents/implementer.md`, `agents/slice-reviewer.md`,
`agents/simplicity-reviewer.md`, and `agents/final-reviewer.md` address
run-root artifacts by absolute `<run-root>/…` path. Third, the `assignee` contract: every
issue-backend document carries the `**Assignee` config bullet. The filename alone triggers that
check, with no content gate on how the doc phrases issue creation.
`references/issue-tracker-local.md` is exempt, because it has no assignee concept. Fourth, the
`anchor-contract`: every slice-store document (every `references/issue-tracker-*.md` plus this
repo's own `docs/agents/issue-tracker.md`) carries a `## Scope anchor` section stating all four of
its elements: how to recognise an anchor, list its candidates, list the slices beneath one, and tell
that an anchor is itself a slice (ADR 0017). Each element is matched on a bullet's bolded lead-in
(`- **Recognise one.**` style, `-` or `*`, American or British spelling) rather than anywhere in the
section, so intro prose that merely lists the four concepts satisfies none of them. Fifth, the
`afk-selection-neutrality` contract: `commands/afk.md`'s selection step (§2) names no backend's own
anchor mechanism, and instead points at the store's `## Scope anchor` contract. Four mechanisms are
checked. An epic (the `epic` label, matched case-insensitively whether backticked or not, which also
covers the local store's `00-epic-` filename). A change-type label prefix (any of them, and including
a concrete label like `feat/self-improvements`). A GitHub sub-issue relation. A Jira parent field. A
type is excluded only when a further `/`-delimited segment follows it. That exclusion is what separates
the paths this step legitimately carries from a label: `docs/agents/…`, the store config it is meant to
point at, and `docs/plans/<type>/`. A delimiter rule instead reads a real label as a path and passes
it, and an allowlist of the two path literals both misreads an ADR citation as a prefix and lets
`docs/plans-refactor` through. A step that stayed neutral by naming nothing at all still fails this. Naming no mechanism
is only half the property. `scanAnchorContract()` and `scanAfkSelectionNeutrality()` share one
helper, `extractSection()`, which masks fenced code blocks first. (CommonMark's at-least-as-long
closing-fence rule applies, so a shorter inner fence never closes a longer outer one.) Then it
isolates the text of one heading's section before either scans its body. Sixth, the
`writing-standard` contract: `references/documentation.md` still offers a `## Writing standard`
section (ADR 0012). Seventh, the `content-types` contract: `references/doc-pass.md` and
`agents/doc-reader.md` each still instruct themselves to read `references/content-types.md` (ADR
0014). The writing side moved off `agents/doc-writer.md` and onto the reference with the rest of the
pass's prose (ADR 0031). Eighth, the `command-resolution` contract: every `/superdev:<name>` reference in `commands/`
or `agents/` resolves to a `commands/<name>.md` file, so a chain handoff never points the reader at
a command that does not exist. Ninth, the `chain-handoff` contract: `commands/implement.md`,
`commands/review.md`, and `commands/document.md` each name their successor in the chain.
`commands/ship.md` ends the chain and is deliberately outside that check.

The tenth, eleventh, thirteenth, fourteenth, fifteenth, sixteenth, seventeenth, and eighteenth checks
share one scanner, `drift/lib.js`'s `scanContract()`, run over
a table of `[document, pattern, expectation]` rows in `drift/contracts.js` instead of one function each.
It reads every
document a table names and reports the rows whose pattern that document no longer matches. Tenth, the
`feature-label-argument` contract: `commands/implement.md` declares an `argument-hint` naming a feature
label and resolves `$ARGUMENTS`, and `commands/plan.md` names `/superdev:implement <label>` as its
resolved successor, in a backtick-delimited invocation. That pins the contract only, never the label's
shape (ADR 0019). Eleventh, the
`unattended-token` contract: `references/scope-mode.md`
carries the `## Unattended` section (ADR 0016), and `commands/implement.md`, `commands/review.md`,
`commands/document.md`, `commands/ship.md`, `references/implement-full.md`,
`references/implement-lite.md`, `references/run-init.md`, and `references/run-handoff.md` each name
`--unattended` and carry an instruction to read and apply that section. Twelfth, the `afk-invocation` contract: `commands/afk.md`'s stage table invokes all
four chain commands and carries `--unattended` on every one of those rows. `scanAfkInvocations()`
checks this row by row: a
whole-file regex would pass the moment any one row carried the token, letting a sibling row lose it
unnoticed. Thirteenth, the `change-type` contract:
`references/scope-mode.md`'s type list, `hooks/scope-prune.js`'s `CHANGE_TYPES` regex,
`CONTEXT.md`'s **Change type** glossary entry, and `scripts/scope.js`'s `CHANGE_TYPES` array state the
same set (ADR 0021). A hook narrower than the prose misreads a live branch of the missing type as gone,
and gone is one of the two conditions that make a scope prunable (ADR 0007). The hook then reaps a
shipped run's root that is still in progress, silently: the Stop hook that runs it reports nothing. The
glossary is the copy most likely to drift, because nothing executes it. Fourteenth, the `degraded-pass`
contract:
`references/scope-mode.md` carries the `## Degraded passes` section, and `commands/implement.md`,
`commands/review.md`, `commands/document.md`, `commands/ship.md`, `commands/status.md`,
`references/implement-full.md`, `references/implement-lite.md`, and `references/run-handoff.md` each
name the `**Degraded:**` ledger entry and point at that section. A consumer that drops the wire lets a run report assurance it
never got, such as a pull request claiming a review that was its author reading their own work. Fifteenth,
the `derived-criteria` contract: `commands/review.md` hands `final-reviewer` the **path**
`<run-root>/dod.md` in its scope-mode dispatch, and `agents/final-reviewer.md` carries its
`## Derive the criteria first` step (ADR 0020). Both halves are needed for the ordering to be real,
because a prompt arrives at once. DoD text inlined in the dispatch is already read by the time the
instruction asks for a derivation. Losing either half degrades the derivation into theater: references
still resolve, the suite stays green, and the reviewer reads the DoD first exactly as before.
Sixteenth, the `label-validation` contract:
`references/scope-mode.md` carries the **Validate both segments.** rule, and `commands/implement.md`
and `commands/afk.md` each point at it. The whole feature label becomes the branch name, so the type
reaches `git switch -c` exactly as the slug does. A rule guarding the slug alone lets `-x/y` through to
git as an option, and lets a non-canonical type make `scope-prune` reap a run root that is still live.
A consumer
that stops pointing at the rule validates nothing and stays valid prose. Seventeenth, the
`green-gate-timeout` contract: `hooks/hooks.json` sets `"timeout": 600` on the green-gate
PostToolUse(Bash) hook entry, and the comment beside `IS_MERGE` in `hooks/green-gate.js` names that
same 600s ceiling and identifies it as Claude Code's own default for a `command` hook. Green-gate
re-runs the scope suite synchronously inside the hook, so a suite slower than the configured timeout
is killed mid-run and the gate silently does not fire. The explicit entry states the ceiling where the
suite runs and holds it if that platform default ever moves, so the check pins both the value and the
comment's account of it: a comment naming a wrong default sends a consumer whose suite is too slow to
the wrong knob, and the suite stays green until a run happens to exceed the ceiling.
Eighteenth, the `verb-pointer` contract (ADR 0022): every ledger touchpoint in the chain invokes its
`scope.js` verb, as `references/run-init.md` does `init`, `references/run-handoff.md` `stage set merged`,
`unresolved add`, and `unresolved clear`, `commands/review.md` `stage set`, `get anchor`, `unresolved add`,
and `unresolved clear`, `commands/document.md` `stage set`, `commands/ship.md` `get stage`,
`stage set shipped`, `get unresolved` (for the unresolved-defect record its §3 gate and §5 body
read), and `get degraded` (for the degrade record its §5 body reads),
`commands/status.md` `status`, `commands/afk.md` `get stage`,
`commands/publish-kb.md` `get branch` for its merge check, `commands/plan.md` `get branch --root` (for
the refusal signal its §0 reads before extending a feature), both execution
playbooks `slice`, `references/scope-mode.md` `degraded add`, `references/implement-lite.md` `docs set`
(the inline-doc-pass record, ADR 0031), `commands/document.md` `get docs` (read before it decides whether
to dispatch a `doc-writer`), and `commands/review.md` `docs clear` (when its fix loop lands commits). A
document that drops its verb goes
back to hand-editing or hand-parsing the ledger, which the `ledger-guard` hook only catches as a tool
call at runtime, never as prose.
Nineteenth and twentieth, the ADR 0023 knowledge-base contracts, checked in two halves because either
alone passes while the invariant is gone. Nineteenth, the `kb-staging` half: `commands/plan.md`,
`commands/document.md`, and `references/doc-pass.md` each name `.superdev/kb-pending/` as the place a
remote backend's page goes instead of a live call. The third row moved from `agents/doc-writer.md`
onto the reference with the rest of the pass's prose (ADR 0031). Twentieth, the `kb-no-backend-call`
half, `scanKbNoBackendCall()`: none of those three, nor `agents/doc-writer.md`, carries a
backend-directed verb. The staging-path mention moved off `doc-writer.md`, but the check keeps that
document in this list, because the agent still dispatches the knowledge-base pass, and a regression
could add a backend call to its own framing without touching the reference at all. The verb checked is
publish, create, update, or upsert, in any morphology, so a passive "is published to" or a gerund
"updating the wiki page" counts too. An HTTP `POST`, `PUT`, or `DELETE` counts as well. The verb must
be aimed at a page, wiki, space, or backend object.
`commands/publish-kb.md` is exempt, because reaching the backend is its job. The check reads the
instruction's shape rather than a backend's literal endpoint or credential name, because
**Backends are pluggable** already forbids these four documents from naming a backend at all, so a
literal-only marker would catch almost nothing.
Twenty-first, the `no-second-reader` contract (ADR 0022), `scanHookLedgerParsers()` scans every
`hooks/*.js` file for a literal `**…:**`-shaped header regex. This pattern marks whether a hook grows a
ledger-header reader of its own instead of `require`ing `scope.js`'s `readLedgerHeader`. It reads the
pattern's shape rather than running the hooks, because the same drift happened to `scope-prune.js`'s own
copy. A second reader can diverge on anchoring, capture width, newline handling, or markup normalisation
silently, and prose alone would not have caught it.
Twenty-second, the `test-selection-wiring` contract (ADR 0025): `agents/implementer.md`,
`references/implement-lite.md`, `agents/slice-reviewer.md`, and `commands/document.md` each still instruct
themselves to read `references/test-selection.md` **and run the command it selects**. The row is anchored
on that clause, not the bare mention, so a document that keeps the path in a passing aside but drops the
run instruction still fails. The fourth consumer is the odd one out: the other three narrow a run inside
the implement loop, before the review's one full-suite run, while `commands/document.md` runs after it —
a doc commit lands on the scope branch once the review has already passed, and nothing else re-verifies
it before the pull request, so the documentation step judges just what it changed with the same focused
command, never the full suite (ADR 0025). Twenty-third, the `full-suite` contract (ADR 0025), seven rows. `commands/review.md` still
runs the full suite itself, before dispatching `final-reviewer`. It states that a `fail` there is itself
a Critical finding folded into the fix loop. It states that the stage does **not** advance while a
full-suite fail, or a Critical or Important finding, stands. That last clause is the one that blocks a
red scope, distinct from the finding merely being named. `agents/final-reviewer.md` still reviews a live
scope against the result the controller hands it, running no suite of its own, and states that
`Full-suite run: fail` makes the verdict `Ready to merge? No` on its own. Its ad-hoc branch keeps its own
re-run, which is the only verification a range with no controller behind it gets. The `commands/review.md`
dispatch row pins that command's own dispatch sentence — the prose that reaches `final-reviewer` at
runtime alongside the agent body — so it hands the result and tells the reviewer to review against it,
running no suite of its own, never that its own re-run "stays optional." That sentence is the live path: a
leak there reopens the duplicate run regardless of what `agents/final-reviewer.md` itself still says. The
`references/run-handoff.md` row covers the other end: its run handoff still runs the scope's one full
suite itself, in place of the review an all-`mechanical` or all-`docs` scope skips. It is the one
full-suite run no other row covers, and the routing check below sends such a scope past `/superdev:review`
on the strength of it. Losing any one row quietly reopens the gap ADR 0025 closed.
Twenty-fourth, the `entries-standing-gate` contract (ADR 0026), `scanShipGateContract()`: `commands/ship.md`
§3's own "Entries standing." paragraph asks once whether to ship a standing unresolved defect, and refuses
outright under `--unattended`. §3 also carries an unrelated, pre-existing gate (the warning about a
missing review or document step) using the identical ask-once and refuse-under-`--unattended` phrasing
for a different question. Both halves are therefore matched inside the "Entries standing." paragraph
alone, extracted with the same `extractSection()` helper `scanAnchorContract()` uses, anchored on the
paragraph's bolded lead-in rather than a markdown heading. A whole-file match lets the unrelated gate
satisfy either half after the entries-standing gate's own clause is deleted. A consumer that keeps §5's
`## Unresolved defects` pull-request heading and loses either half still reads right and ships a broken
branch, the exact failure every other contract in this file exists to catch. Twenty-fifth, the `unresolved-glossary` contract
(ADR 0026), `scanUnresolvedGlossaryContract()`: `CONTEXT.md`'s **Degraded pass** and **Unresolved defect**
entries restate what `references/scope-mode.md`'s `## Degraded passes` and `## Unresolved defects`
sections define: that a degraded pass is never a failure of the code under review, and an unresolved
defect is exactly that. Each fact is pinned once per document, in its own wording, as a canonical clause
that must appear verbatim. That is the same literal-phrase shape every other contract in this file uses.
What separates a correct sentence from a contradiction here is coreference (which subject a clause
attributes to), which no pattern-matching heuristic can recover, so the check requires the clause's exact
words in their exact order: a negated, reworded, or dropped clause fails the same way a dropped clause
does anywhere else in this file. Both sides of the comparison are whitespace-normalized first, so runs of
whitespace, including a line break, collapse to a single space. That matters because `CONTEXT.md` and
`references/scope-mode.md` are hard-wrapped and a canonical clause can span a line break in the real
document. Nothing executes the glossary, so it is the copy most likely to drift.
Twenty-sixth, the `afk-routing` contract (ADR 0025), three rows: `commands/afk.md`'s stage table reads each
slice's `type` off the ledger and routes an all-`mechanical` or all-`docs` scope from `merged` to
`/superdev:document ... --unattended` and from `documented-unreviewed` to `/superdev:ship ...
--unattended`, and `commands/ship.md` drops `/superdev:review` from its own missing-step warning for that
same scope. Such a scope skips the whole-scope review by design, because there is no Definition-of-Done
judgment to attach one to. A table that routes it into the review therefore strands the feature: the
review has nothing to judge, and `/superdev:ship --unattended` still refuses a scope whose review never
ran, which no sweep can clear. Each afk.md row also requires `--unattended` past the command name: this
paragraph is prose, not a stage-table row, so `scanAfkInvocations`'s row scan never reaches it, and a row
that drops the token strands an unattended sweep at an interactive question with nothing reported. Both
documents are pinned because either alone reads correct while the pair disagrees, which is how the defect
reached `main` in the first place. Twenty-seventh, the `arg-token` contract: `hooks/merge-guard.js`,
`hooks/green-gate.js`, and `hooks/ledger-guard.js` each carry the canonical `const ARG = …` shell-word
token **verbatim**. The three parse the same shape out of a Bash command line by hand, and nothing links
the copies, so this pins the literal rather than testing mutual equality. A token that narrows in one
hook reopens the quoted-argument bypass there (`git -C "my repo" merge` walking past the guard), and a
deliberate improvement is meant to reach all three files and this pin in one commit. Same shape as the
scope-slug charset assertion in `scripts/scope.js --selftest`.
Twenty-eighth, the `audit-set` contract: `commands/setup.md` still records decision C's answer as the
`## Audit set` section of `docs/agents/documentation.md`, `commands/document.md` still reads that
section back with its stated fallback for when it is absent, and `references/documentation.md` still
seeds the section as optional, for `/setup` to fill in. Three documents agree on the section only in
prose, the same shape as the afk-routing and arg-token pairs above. A renamed heading or a dropped
fallback clause leaves the section unreachable in every repo that carries it, unnoticed, until a doc
audit runs on one and finds nothing there.
Twenty-ninth, the `aggregate-page` contract (ADR 0027), four rows. `references/doc-pass.md` and
`commands/plan.md`, the two stagers, each stage `action: patch` carrying one section for an outline
entry marked aggregate. `commands/publish-kb.md` applies it by merging through `scripts/kb-patch.js`,
and `references/knowledge-base-confluence.md` documents the `(aggregate)` marker that decides which
pages get one. The `publish-kb` row is anchored on
the **call**, not on the word `patch`: a document that names the action and then merges the page in its
own prose puts a model back in charge of rewriting a reader-facing page, which is exactly what moving the
merge into a script prevented. The marker row is the quietest to lose. Every other document still reads
correct, the doc pass never marks a page, and it stages `upsert` forever, replacing an aggregate
page with the one section a scope can see. That is the state that left this repository's own
`ADR summaries` page four decisions stale.
Thirtieth,
the `read-path` contract (ADR 0027), two rows: `commands/publish-kb.md` reads a
`patch`'s live body through the call the config document documents, and splits the outcome into two
branches. **Positive absence**, where the find call does not list the title, creates the page. **Any
other outcome** is a **read failure**, not absence, and must leave the file staged: no documented read,
a transport or authorisation failure, the read itself reporting the page absent for a listed title, or
an empty body for a listed title. The row is anchored on that branch, not on the word "read": a document
that mentions reading the live page and then creates it on *any* missing body passes a keyword search
while destroying a published page on the very failure the branch exists to catch, which is the defect
that reached a whole-scope review before ADR 0027 pinned it. `docs/agents/knowledge-base.md`'s row is
conditional rather than a bare pattern: it documents a call returning the page body only when it marks
some outline entry `(aggregate)`, so a config document that marks none owes no read, and the row is
implemented as a `test()` function rather than a literal `RegExp` to express that. Thirty-first,
the `afk-existence` contract: `commands/afk.md` exists at all. Nothing else in the plugin names
`/superdev:afk` for the eighth check to resolve, so its absence would otherwise go unnoticed.
Thirty-second, the `eval-shape` contract: every
`evals/*/graders/*.md` declares a known `type` and a positive `weight`, an `llm` or `regex`
grader also declares a `focus` or `target`, and every case's `scaffold_script` resolves. Nothing
else validates a grader, so without this a typo surfaces part-way through a run that costs real API
spend. Thirty-third, the `adr-status` contract: every `docs/adr/*.md` states a `**Status:**` line
carrying one of `Accepted`,
`Proposed`, `Superseded`, or `Rejected`. An ADR with no status line reads as accepted whether or not
anything implements it, which is how a decision reaches the glossary and the command bodies while the
code has none of it. The value's capitalization is pinned with the set, so one ADR does not sort and
grep apart from the rest. Thirty-fourth, the `append-mode` contract (ADR 0004): every slice-store document
(every `references/issue-tracker-*.md` plus `docs/agents/issue-tracker.md`) carries a `## Append mode`
section stating three universal elements. Append creates only new slice records and never edits, closes,
or deletes a merged one. Extending a single-slice feature creates the epic first, copying the lone
slice's `acceptance` into it as the global DoD. Amending a promoted epic's own body is the one
sanctioned edit, with the clause anchored on that permission's own wording, not on "amend" or "epic"
alone, either of which recurs elsewhere in the section's surrounding prose. Each element is matched on a
bullet's bolded lead-in, the same `scanAnchorContract` shape, over the same candidate-document list.
`references/issue-tracker-local.md` alone carries a fourth element, that append continues file numbering
from the highest number already present and never reuses one. Its `id` is the file number `/plan`
itself assigns, unlike an issue backend's server-assigned key, which already satisfies the id rule on
its own. Thirty-fifth, the
`status-seed` contract (ADR 0004), two rows against `references/run-init.md`: it carries a `"status"` field
in the JSON its run init pipes into `scope.js init`, and it states that a slice the store reports as merged
seeds `merged` and is never dispatched. Append mode never renumbers or re-merges a slice already shipped,
so a second run over an appended feature must seed each loaded slice's real status rather than defaulting
every row to `todo`, and skip every row already seeded `merged` rather than re-dispatching it. A document
that drops the field, or drops the never-dispatched clause while keeping the field, silently re-dispatches
a merged slice either way, so the two rows fail independently.
Thirty-sixth, the `plan-append` contract (ADR 0004), five rows all against
`commands/plan.md`. Its §0 asks whether the feature is new or extended before the interview begins, and
states that answering "new" makes no store call. It states the store refusal signal (a slice
`in-progress`, `in-review`, or `blocked` elsewhere) as one row. It states the ledger refusal signal's two
clauses as two further independent rows: a run root whose stage is other than `shipped`, and a `shipped`
stage whose scope branch is neither merged into the base nor gone. Losing any one of the three therefore
fails on its own rather than only in aggregate. It states the single-slice epic-promotion clause,
including that the lone slice is left untouched.
Each ledger-signal row is anchored on the refusal condition's own wording, not on the rationale sentence
that explains the branch test a few lines below it, so a document that keeps the rationale but loses the
condition still fails. Thirty-seventh, the `rotate-on-shipped` contract (ADR 0004, ADR 0007):
`references/run-init.md` states that run init reads a present ledger's stage before choosing between
resume and init, that stage `shipped` rotates `ledger.md` to `ledger-shipped-<date>.md` and then runs
`init` again, that every other stage (`implementing`, `merged`, `reviewed`, `documented`,
`documented-unreviewed`) keeps the existing resume path, and that nothing is deleted, so
`scope-prune`'s seven-day post-merge reap still runs on its own terms. A fourth clause states that the
rotation never overwrites an existing `ledger-shipped-<date>.md`, so a scope that ships twice in one
calendar day keeps both trails instead of the second rotation clobbering the first. `scope-prune` keeps
a shipped run root on disk past merge, so a second `/superdev:implement` run over an appended feature
can land while that ledger is still there. A document that goes back to treating any present ledger as
an in-progress resume re-dispatches a finished run instead of beginning the new one. Thirty-eighth, the
`parked-questions` contract (ADR 0004, ADR 0005), two rows against `commands/plan.md`. It surfaces an
epic's `## Parked questions` the moment §0 loads it, before the interview diverges into new ground. A
question the interview resolves has its line deleted from that section, with the new slice's `spec`
and `acceptance` standing as the sole record, because `references/domain-modeling.md`'s revise-in-place
rule forbids holding both. Losing either row independently: a document that keeps surfacing questions but
stops deleting a resolved one's line leaves two records of the same decision, and one that stops
surfacing them silently strands a load-bearing decision no later interview ever revisits. Thirty-ninth, the
`run-kind` contract (ADR 0028), five rows against `references/scope-mode.md`. Its `## Cutting the scope
branch` section specifies the branch step for each of the three run kinds. `fresh` cuts one from
`<base>` and stops, cutting nothing, when a scope-prune reap left a same-named branch standing.
`appended` decides on the same merged-or-gone test `hooks/scope-prune.js` and `commands/plan.md` already
run (ADR 0007) rather than a bare `git merge-base --is-ancestor`, which exits 128 on a branch a
squash-merging host already deleted. It then stops a contained reuse, before it switches the invoking
checkout, on the same dirty-checkout and held-elsewhere conditions `resumed` stops on. `resumed` runs no
ancestor test and cuts nothing. `fresh` and `appended` get two rows each because each carries two
independent clauses. `resumed` gets one. The rows sit against that one document rather than the two
playbooks, which hold a pointer plus their own tier's command: pinning a pointer's prose goes red on a
reflow while catching no revert. Losing any row independently: a document that stops specifying one
clause leaves that run's branch step to whatever a reader infers, which is the gap three consecutive
review fix cycles kept re-opening.
Fortieth, the `forcing-branch-flag` contract (ADR 0028), `scanForcingBranchFlag()`: neither execution
playbook names a forcing branch flag, in any of its spellings.
`git switch -C` and `--force-create`, `git checkout -B`, and `git worktree add … -B` and
`--force-create` all reset an existing branch instead of failing on it. `git switch -C` prints
`Reset branch` and exits 0
while leaving every slice already merged into that branch unreachable from any ref, and the ledger still
records those slices as `merged`, so nothing in the run rebuilds what it lost. Every spelling is pinned,
not just the two the playbooks happen to use, because the flag a hurried edit reaches for is whichever
one it already knows. It is a **negative** check, asserting that a document no longer matches a pattern
where most assert that one still does, which is why it is a scanner rather than a contract-table row.
`return-to-controller` below is the other.
Forty-first, the `source-sections` contract: each canonical reference still carries the sections its readers
are sent to. `references/plan-contract.md` (`## Fields`, `## Epic visuals`, `## Slice lifecycle & status`,
`## Append mode`, `## Scope anchor`, `## Feature label`), `references/test-selection.md` (`## The two
commands`, `## Fallback to the full command`), `references/content-types.md` (`## The four types`, `## The
conceptual layer`), `references/controlled-prose.md` (`## Modes`, `## Self-check`), and
`references/review-checklist.md` (`## Anti-patterns`, `## Vulnerability classes`, `## Reuse audit`, `##
Consistency`). Every other check pins these files from the reader's side: a loop consumer must say *read
`references/test-selection.md`*, both doc agents must name `references/content-types.md`. None asserts that
the named file still holds the rule. Delete a body and keep the filename, and the reference resolves, every
consumer still points at it, and the suite stays green while the rule is gone. A bare heading is the
weakest thing worth asserting and the strongest a pattern can honestly claim: a section still present may
say the wrong thing, which is the reviewer's job, but a section deleted outright is drift that no review of
the diff which deleted it would connect to the readers it silently broke. `references/scope-mode.md` is
already pinned this way, by the eleventh and fourteenth checks' heading rows. This check gives the same
treatment to the five sources that never got it.
Forty-second, the return-to-controller contract (ADR 0029), `scanReturnToController()`: neither execution
playbook, nor `references/run-init.md`, nor `references/run-handoff.md` instructs a return to the command
body. The run is one-directional: it opens at run-init.md and ends at run-handoff.md. Nothing guarded that
shape until this check, so a later edit could reintroduce "return to the controller",
"resume at `commands/implement.md`", or any of the other verb and target pairings `contracts.js`
enumerates, with the suite staying green throughout. A bare mention of the controller, the command body,
or `/superdev:implement` is legitimate prose on its own. Only a directional verb paired with one of those
targets is a gap.
Forty-third, the `playbook-edges` contract (ADR 0029), four rows: both execution playbooks still name
`references/run-init.md` as their opening step and `references/run-handoff.md` as their closing one. The
return-to-controller check above is the negative half of the run's one-directional shape, an instruction
to go back. This is the positive half, that a playbook still points forward at all. Deleting "read
run-handoff.md as your last step" from a playbook leaves every other check green, because the reference
still resolves and nothing points back to the controller either. The run then ends with no
`scope.js stage set merged` write and, on an all-`mechanical` or all-`docs` scope, with no full-suite run
anywhere in the chain.

Forty-fourth, the `doc-pass` contract (ADR 0031), three rows. `agents/doc-writer.md` and
`references/implement-lite.md` each read `references/doc-pass.md`, the file that states the documentation
pass they perform. The pass has two callers, the dispatched writer and the `lite` execution playbook's
controller working in its own context, so it is stated once and read by both. A caller that drops the
read keeps performing a pass it
no longer holds the rules for, and nothing else notices: `reference` above only resolves paths that are
still cited, and the content-type, staging, and aggregate contracts moved onto the reference with the
prose, so they stay green while the caller that lost the read quietly writes to no standard at all. The
row is anchored on the `Read` instruction rather than the bare path, for the reason the `content-types`
contract states: a passing mention is not a read.

The third row is the **dispatch-prose half** of the same contract (root `AGENTS.md`'s rule of that name,
ADR 0035): `commands/document.md` names `references/doc-pass.md` in the dispatch it builds. A controller
writes its dispatch from what that command says the writer does, so a command that paraphrased the pass
("it runs two passes, deleting stale text") put the paraphrase in front of the writer while both rows
above stayed green. `references/implement-lite.md` needs no pairing — it is a caller rather than a
dispatcher, and its own row is the instruction it acts on. `test-selection-wiring` was judged under the
same rule and deliberately left one-sided: the dispatch steps in `references/implement-full.md` name no
test command at all, so there is no dispatch sentence for a row to pair with.

Forty-fifth, the `narrative-coverage` contract, `scanNarrativeCoverage()`: every check registered in
`drift/checks.js` is written up in this file by its backticked `id`, and both documents that count the
checks in prose, this one and the root `AGENTS.md`, state the number the registry holds. The Work
Guidance below already required the write-up. Nothing enforced it, and it was skipped twice, for two
checks whose only account was their own code. The count drifted on the same edits, reading forty-one
against a registry of forty-three. Both halves are prose a maintainer updates by hand at the moment they
are thinking about code, which is exactly when they get forgotten. A check the classification sentence
above names by `id` needs no other write-up. For every other check the write-up is the only
mention, and this is what holds it in place. The check is otherwise deliberately shallow: it pins that
each check is described **somewhere** and that the counts agree, never that a description is accurate or
that the classification sentence files a check under the right kind. Those stay human judgment, and no
check can replace them.

Forty-sixth, the `marketplace-source` check, `scanMarketplaceSource()`: `.claude-plugin/marketplace.json`'s
relative `source` for each plugin resolves to a directory that carries `.claude-plugin/plugin.json`. That
one string is what limits an install to the shipped `plugin/` tree (ADR 0032), and `claude plugin
validate .` accepts a source that names no directory at all. A renamed tree or a fat-fingered path
therefore breaks every install while `bun run test` stays green. An absent manifest is skipped, and an object
source (a remote repo) is out of scope: only a path into this repository can drift against it.

Forty-seventh, the `readme-commands` check, `scanReadmeCommands()`: `README.md` and `commands/` name the
same command set: every `commands/<name>.md` is mentioned in the README as `/superdev:<name>`, and
every `/superdev:<name>` the README names has a command file. The README is the user-facing map of the
commands, and nothing else cross-checks it: the eighth check resolves command names in `commands/` and
`agents/` prose only. A command added without a README section, or a README still routing users to a
renamed command, stayed green before this check landed. Either half is skipped when its side is absent, matching
every other scanner's fixture rule.

Forty-eighth, the `audit-set-globs` check, `scanAuditSetGlobs()`: every pattern listed under `## Audit
set` in this repo's own `docs/agents/documentation.md` resolves to at least one file. The twenty-eighth
check pins that the section exists and that `commands/setup.md`, `commands/document.md`, and the seed
still agree about it. Nothing there expands a pattern. A pattern matching no file is the one drift the
reader cannot see, because `/superdev:document audit` reads zero files for it and reports the same clean
pass as a real audit. That is the state this repo shipped in when the plugin tree moved under `plugin/`
(ADR 0032) and three globs kept their old repo-root prefixes. Patterns are repo-relative by the section's
own rule, so they resolve against the repo root and never through `docPath()`'s `plugin/` fallback. A
plain path is checked for existence and a `*` in the final segment is expanded by reading that directory. An
absent `docs/agents/documentation.md`, or one carrying no such section, is skipped.

Forty-ninth, the `release-contract` check, `scanReleaseContract()`: every slice-store document carries a
`## Release` section, and `commands/plan.md`, `commands/implement.md`, and `commands/afk.md` each name it.
A release is the human agreement that a written plan may be built (`references/plan-contract.md` →
*Release*), and it is expressed differently per backend — a label on Forgejo and GitHub, a label rather
than a status on Jira, and nothing at all on the local-file store, whose plans are released when written.
Both halves fail silently, which is why both are pinned: a store document without the section leaves the
consumers no signal to read, and a consumer that drops the reference builds whatever it is handed, which
is the gate gone with every command still valid prose. The consumer half matches the backticked
`` `## Release` `` rather than the bare word, since "release" recurs in ordinary prose. Absent documents
are skipped, matching every other scanner.

Fiftieth, the `doc-steps-no-suite` check, `scanDocStepsNoSuite()`: `commands/document.md`,
`commands/ship.md`, `agents/doc-writer.md`, and `agents/final-reviewer.md` name no full-suite run of
their own (ADR 0025). That is narrower than "performs no full-suite run": `commands/document.md` reads
`references/test-selection.md` and runs the focused command it selects over its own doc commits, and that
rule falls back to the full command wherever a repository configures no second fenced block — the same
fallback this repository dogfoods for every other focused caller. What this check forbids is a document
*instructing* a full run in its own prose; the fallback producing one at runtime is `test-selection.md`'s
contract, not a gap this check would catch or should. `/superdev:review`'s scope mode owns the scope's one
**review** run, so an instruction named in any of the first three is a second pass over a tree the review
already verified — and on a slow suite that is minutes per scope, spent proving what was just proved.
`agents/final-reviewer.md` joins the list for a
different reason: it already carries the presence row in `full-suite` above stating it reviews against
the handed result, running no suite of its own, but that row only checks presence — a document carrying
both that clause and the old "your own re-run here stays optional" sentence it replaced reads as zero gaps
there. This check's absence half is what actually forbids the old clause from growing back beside the new
one. This is the only check that asserts an **absence**, so a gap is a match rather than a missing clause,
and it runs through `scanDocsAvoid()` instead of `scanContract()`. The patterns are the shapes a real
instruction takes here: a bare imperative ("Run the full suite before opening the pull request", "Re-run
the full suite before staging it" — the reflexive "yourself"/"itself" phrasing `commands/review.md` used to
use is one case of this, not a separate pattern), that same imperative with "full" dropped ("Re-run the
suite … before the handoff", "Run the whole suite once more before staging the pull request"), the
take-it-from-the-config one `references/run-handoff.md` uses ("take the full command from … and run it"),
and the optionality clause `agents/final-reviewer.md`'s own re-run sentence used to carry, generalized past
its exact wording ("stays optional" or "remains optional", "own" or no "own"). The bare-imperative
pattern's discriminator against a legal past-tense mention is the auxiliary, not the pronoun: a negative
lookbehind for "has"/"have"/"had", up to two more words, then "run" is what lets `commands/ship.md`'s "the
run handoff *has* already *run* the full suite" stay silent — the same `(?:\s+\w+){0,2}` gap
`RETURN_TO_CONTROLLER_PATTERNS`'s `HAND_BACK_VERB` uses, wide enough for an intervening word or a hard-wrap
landing between the auxiliary and the verb, tight enough not to swallow an unrelated sentence. Each spells
its words with `\s+` for the same hard-wrap tolerance, because the negative scanner runs no normalized
retry. `agents/final-reviewer.md`'s own legitimate ad-hoc "you may re-run the suite over the range" and its
"the controller already ran the full suite itself" stay legal too: neither is the optionality clause this
check forbids, and the bare-suite pattern's own trailing "before" anchor is what keeps it off the ad-hoc
sentence, which never carries one nearby. Prose is the wrong guard for this one: root `AGENTS.md`'s
prompt-the-positive rule keeps a "never run the suite" line out of always-loaded context, so the silence
is enforced by test instead. This is a shape-based prose guard, not a grammar: it catches the phrasings
named above, not every paraphrase a maintainer could write, and the reviewer's eye covers the rest.

Fifty-first, the `fix-boundary` contract (ADR 0035), three rows on `commands/review.md`. §4's fix loop
states that it changes **how** the code meets the Definition of Done, that a remedy adding a
capability the Definition of Done never named is recorded and handed to `/superdev:plan`, and that a
deferred finding enters no fix loop and is not an unresolved defect — taking precedence over
`--unattended → fix` — with a verdict whose only remaining findings are deferred counting as clean. All
three are pinned because any one alone is inert: a boundary with no destination leaves the finding
nowhere to go, so the fix cycle builds it regardless; a destination with no boundary never fires; and a
boundary with no exit deadlocks the run the moment a finding is actually deferred, since every other path
§4 offers either fires on it anyway or never fires at all. Nothing else in the chain notices when this
becomes advice — the review returns a bigger diff, green, and the scope grows by whatever the remedy was.
That is not hypothetical: it is what the run this check comes from did, and two fix cycles went into
settling the addition. The boundary sits at the Definition of Done rather than at "behaviour", since
repairing a defect in planned behaviour is frequently behavioural and stays in the loop.

The first and seventh checks are opposites. The first catches a reference to a file that does not exist.
The seventh catches an agent that drops its wire to a file which still exists. That drift leaves the
reference resolvable and the suite green, and the lens then does nothing in any dispatch.

The first and eighth checks are the same check at two levels: one resolves a `references/` path, the
other a command name. The eighth and ninth are opposites in the same way as the first and seventh: the
eighth catches a handoff that points at a command with no file, the ninth a command that names no
successor at all.

## Work Guidance

- Scripts are CommonJS, like the hooks. `hooks/scope-prune.js` `require`s `scope.js`, so `scope.js`
  must stay `require`-able under plain `node`. This is the one dependency `hooks/` has on `scripts/`.
- Every script ships a `--selftest`, same convention as the hooks.
- A **shape-based prose guard that asserts an absence states its ceiling beside itself.** A pattern over
  English catches the phrasings it names and not every paraphrase, and on an absence check — the document
  must *not* say X — a missed paraphrase is a **silent pass**: the check reads the reworded instruction as
  gone and stays green while it is still there. Write the ceiling down next to the patterns for one of
  these — a `ponytail:` comment naming it is the house idiom — or every reviewer who finds one more
  evadable phrasing reports a defect, and the guard grows by discovery instead of by decision. The
  convention governs six checks of this shape: `doc-steps-no-suite`, `forcing-branch-flag`,
  `kb-no-backend-call`, `no-second-reader`, `return-to-controller`, and `afk-selection-neutrality`. Only
  `doc-steps-no-suite` carries the worked example today; the other five still owe the note, and a
  maintainer touching one of them adds it. A **presence table** — the document must say X, one row per
  `[document, pattern, expectation]` — needs no such note: a paraphrase it doesn't recognize fails
  *loudly*, the row goes red until the pattern catches up, so the presence tables in `drift/contracts.js`
  (`FIX_BOUNDARY_CONTRACTS` among them) carry none.
- A new drift-check contract is one entry appended at the end of the `drift/checks.js` registry, plus
  its section in the fifty-one-check narrative above and its selftest in the matching
  `drift/selftest/*.test.js` suite. Append rather than insert unless the check belongs earlier for a
  reason, because every ordinal after an insertion point has to be rewritten by hand. The forty-fifth check,
  `narrative-coverage`, enforces two pieces of this by itself: the new id must appear backticked
  somewhere in this file, and this file's and the root `AGENTS.md`'s check-count prose must both state
  the new total. It does not enforce the selftest, or that the write-up is accurate or files the check
  under the right kind. Those stay a review's job.

## Verification

`bun run test` (repo root) runs every script's `--selftest` under `node`, which matches the
production runtime.

## Child DOX Index

None. `scripts/` has no subdirectories with rules of their own.
