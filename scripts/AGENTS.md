# scripts/

## Purpose

Standalone deterministic code that `package.json` runs, alongside `hooks/`. Four executables live
here: `scope.js` (the run-state CLI, ADR 0022), `kb-patch.js` (the knowledge-base section merge, ADR
0027), `eval-run.js` (the eval runner, ADR 0024), and `drift-check.js` (the cross-document contract
checks).

## Ownership

This doc owns what each script guards and the contracts between them. Repo-wide rules — the stack,
the working rules, the release flow — stay in the root [`AGENTS.md`](../AGENTS.md).

## Local Contracts

### scope.js — the run-state CLI (ADR 0022)

`scope.js` owns the ledger's schema and is the only `ledger.md` read and write path in the chain —
`init`, `stage get|set`, `slice`, `degraded add`, `unresolved add|clear`,
`get stage|branch|anchor|slices|unresolved|degraded`, and `status`
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

### kb-patch.js — the knowledge-base section merge (ADR 0027)

`kb-patch.js` is the deterministic half of a staged page's `action: patch`. It reads a live
knowledge-base page and a staged page carrying **one section**, prints the merged markdown on
stdout, and writes nothing. `/superdev:publish-kb` holds the backend credential and calls it;
`agents/doc-writer.md` stages the section and reaches no backend at all (ADR 0023). The merge lives
here rather than in the command's prose so that a reader-facing page is not edited by a model
reading it.

The staged section names itself by the **first ATX heading in its body**, spanning to the next
heading of the same or higher level — so a sub-heading belongs to the section and a sibling ends it.
A heading may carry up to 3 leading spaces, CommonMark's own limit before a fourth space, or a leading
tab, makes it an indented code block instead — so an indented live section is still recognised as a
boundary and is never swallowed into the section ahead of it. The comparison that finds the live
section to replace requires a line to clear that same up-to-3-space gate before it counts as a
candidate at all, then compares it by a key that folds three surface spellings of the same heading —
trailing whitespace, a closed-ATX form (`## A ##`), and the gap between the `#` marker and its text
(one space, several, or a tab) — into one, on the read that a
staged heading is always column-0 — so a live target indented up to 3 spaces still matches instead of
missing and appending a duplicate, while a 4-space or tab-indented line that merely *shows* the heading
text in a code block never matches, no matter how it reads once trimmed. Setext headings are unsupported as a section marker: one notation is what makes "does the
live page carry this heading" a string comparison instead of a parse, and a staged body using one has
no ATX heading and refuses. A *live* page is never validated that way, so the merge separately refuses
when a setext underline falls inside the live region about to be dropped, rather than silently
swallowing that section into the replaced one. `extractSection()` applies the identical `hasSetextHeading()`
check to the **staged** body's own section, refusing there too, rather than accept a shape it would
merge cleanly today and then refuse to ever patch again — that failure belongs on the staged file, which
a doc pass re-runs, not on the live page it would otherwise strand. Heading detection runs on fence-masked lines (matches
`scripts/drift-check.js`'s `maskFences`, including its at-least-as-long closing-fence rule), so a
`#`/`~~~` shown *inside* a fenced code example is never read as a heading, in the staged body, in the
live section being replaced, or by the duplicate-heading scan; an unterminated fence in either input —
which would otherwise mask every line after it and hide real headings — refuses instead of guessing
where it would have closed. The live page carrying that exact heading line has its section replaced; a
page without it gains the section at the end. Sorting is deliberately absent, because where a new
section belongs is editorial, and appending is correct for the ascending-number case (`ADR summaries`)
that motivated the ADR. Appending onto a live page whose trailing blank lines vary collapses them to
exactly one before the new section; harmless, since a blank-line run carries no content.

The merge is **idempotent**: applying the same patch to its own output changes nothing, which is
what makes it safe under `/superdev:publish-kb`'s retry of a staged page whose call failed. It
refuses, nonzero and with a one-line stderr reason, on a staged body with no heading, on a staged body
carrying content before its first heading or more than one section — a patch stages exactly one — on a
live page carrying the heading more than once — because which section to replace cannot be resolved,
the same reason `/superdev:publish-kb` refuses two staged files sharing one title — on an unterminated
fenced code block in either input, and on a setext underline inside the live region a replace would
drop, or inside the section the staged body itself stages. A CRLF live or staged page merges exactly as
an LF one does, the way `scope.js` reads a CRLF ledger.

Removing a single section is out of scope: `patch` replaces or appends, and `delete` still removes a
whole page (ADR 0027, Consequences).

### eval-run.js — the eval runner (ADR 0024)

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
- the grader and judge machinery, including a grader that cannot be evaluated at all — an unknown
  focus, a judge that never returns a verdict, or `regex` criteria that will not compile — reported as
  a grader error and left out of the score, never as a fail and never as a thrown `SyntaxError` that
  ends the run
- aggregation across runs
- the missing-token exit

### drift-check.js — the cross-document contract checks

`drift-check.js` is the entry point only: it walks the check registry and reports. The checks themselves
live beside it, in `scripts/drift/`.

| File | Owns |
|------|------|
| `drift-check.js` | the CLI — `main()`, the ok line, the exit code, and the `--selftest` handoff |
| `drift/checks.js` | the **registry**: one entry per check — `id`, `run`, its `ok` phrase, and how one gap prints. Its array order is the order this narrative numbers them |
| `drift/contracts.js` | the contract tables and patterns. Data only |
| `drift/scanners.js` | the bespoke scanners — every check whose assertion is more than one pattern over one document |
| `drift/lib.js` | what they share: `maskFences`, `extractSection`, the frontmatter readers, `readDoc`, `storeDocuments`, and `scanContract` |
| `drift/selftest/` | `index.js` (the `fixture` helper, `realRoot`, temp-dir cleanup) plus one suite per area: `scanners`, `chain`, `kb-plan` |

The checks named below are the exceptions, and every other one is a **drift assertion**: it compares a
restated fact against its source. `forcing-branch-flag`, `kb-no-backend-call`, `no-second-reader`, and
`return-to-controller` are **negative** assertions — each reports a document that still says something,
rather than one that stopped saying it. `eval-shape` and `adr-status` compare a document against a
**schema**. `afk-existence` is a plain **existence** assertion.

The exceptions are named and the rule covers the rest, deliberately. This sentence used to enumerate
every drift assertion by id, and it fell behind at five separate additions, because a list of forty is
maintained by hand at the moment its author is thinking about code. Naming the exceptions cannot drift
when a forty-fifth check lands.

`drift-check.js` guards forty-five things, in the order `drift/checks.js` registers them. First, the
`reference` contract: every `references/*.md` path named in `commands/`, `agents/`, or `references/`
itself resolves to a file that exists. A reference cites another reference — both execution
playbooks point at `scope-mode.md` — so a rename there dangles like any other. Second, the
`run-root` contract: `commands/implement.md`, `commands/review.md`, `commands/document.md`,
`commands/ship.md`, `commands/publish-kb.md`, `references/implement-full.md`,
`references/implement-lite.md`, `references/scope-mode.md`, `agents/implementer.md`,
`agents/slice-reviewer.md`, `agents/simplicity-reviewer.md`, and `agents/final-reviewer.md` address
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
anchor mechanism — an epic (the `epic` label, matched case-insensitively whether backticked or not,
which also covers the local store's `00-epic-` filename), a change-type label prefix (any of them,
and including a concrete label like `feat/self-improvements`; a type is excluded only when a further
`/`-delimited segment follows it, which is what separates the paths this step legitimately carries —
`docs/agents/…`, the store config it is meant to point at, and `docs/plans/<type>/` — from a label.
A delimiter rule instead reads a real label as a path and passes it, and an allowlist of the two
path literals both misreads an ADR citation as a prefix and lets `docs/plans-refactor` through), a
GitHub sub-issue relation, a Jira parent field — and instead points at the store's `## Scope anchor`
contract. A step that stayed neutral by naming nothing at all still fails this. Naming no mechanism
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
resolved successor, in a backtick-delimited invocation — the contract only, never the label's shape
(ADR 0019). Eleventh, the
`unattended-token` contract: `references/scope-mode.md`
carries the `## Unattended` section (ADR 0016), and `commands/implement.md`, `commands/review.md`,
`commands/document.md`, `commands/ship.md`, `references/implement-full.md`, and
`references/implement-lite.md` each name `--unattended` and carry a read/apply instruction pointing at
that section. Twelfth, the `afk-invocation` contract: `commands/afk.md`'s stage table invokes all
four chain commands and carries `--unattended` on every one of those rows. `scanAfkInvocations()`
checks this row by row: a
whole-file regex would pass the moment any one row carried the token, letting a sibling row lose it
unnoticed. Thirteenth, the `change-type` contract:
`references/scope-mode.md`'s type list, `hooks/scope-prune.js`'s `CHANGE_TYPES` regex,
`CONTEXT.md`'s **Change type** glossary entry, and `scripts/scope.js`'s `CHANGE_TYPES` array state the
same set (ADR 0021). A hook narrower than the prose misreads a live branch of the missing type as gone
— gone is one of the two conditions that make a scope prunable (ADR 0007) — and reaps a shipped run's
root that is still in progress, silently: the Stop hook that runs it reports nothing either way. The
glossary is the copy most likely to drift, because nothing executes it. Fourteenth, the `degraded-pass`
contract:
`references/scope-mode.md` carries the `## Degraded passes` section, and `commands/implement.md`,
`commands/review.md`, `commands/document.md`, `commands/ship.md`, `commands/status.md`,
`references/implement-full.md`, and `references/implement-lite.md` each name the `**Degraded:**`
ledger entry and point at that section. A consumer that drops the wire lets a run report assurance it
never got — a pull request claiming a review that was its author reading their own work. Fifteenth,
the `derived-criteria` contract: `commands/review.md` hands `final-reviewer` the **path**
`<run-root>/dod.md` in its scope-mode dispatch, and `agents/final-reviewer.md` carries its
`## Derive the criteria first` step (ADR 0020). Both halves are needed for the ordering to be real,
because a prompt arrives at once — DoD text inlined in the dispatch is already read by the time the
instruction asks for a derivation. Losing either half degrades the derivation into theater: references
still resolve, the suite stays green, and the reviewer reads the DoD first exactly as before.
Sixteenth, the `label-validation` contract:
`references/scope-mode.md` carries the **Validate both segments.** rule, and `commands/implement.md`
and `commands/afk.md` each point at it. The whole feature label becomes the branch name, so the type
reaches `git switch -c` exactly as the slug does — a rule guarding the slug alone lets `-x/y` through to
git as an option, and lets a non-canonical type make `scope-prune` reap a run root that is still live.
A consumer
that stops pointing at the rule validates nothing and stays valid prose. Seventeenth, the
`green-gate-timeout` contract: `hooks/hooks.json` sets `"timeout": 600` on the green-gate
PostToolUse(Bash) hook entry, and the comment beside `IS_MERGE` in `hooks/green-gate.js` names that
same 600s ceiling and identifies it as Claude Code's own default for a `command` hook. Green-gate
re-runs the scope suite synchronously inside the hook, so a suite slower than the configured timeout
is killed mid-run and the gate silently doesn't fire. The explicit entry states the ceiling where the
suite runs and holds it if that platform default ever moves, so the check pins both the value and the
comment's account of it: a comment naming a wrong default sends a consumer whose suite is too slow to
the wrong knob, and the suite stays green until a run happens to exceed the ceiling.
Eighteenth, the `verb-pointer` contract (ADR 0022): every ledger touchpoint in the chain invokes its
`scope.js` verb — `references/run-init.md` `init`, `references/run-handoff.md` `stage set merged`,
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
publish, create, update, upsert, or
an HTTP `POST`/`PUT`/`DELETE` — aimed at a page, wiki, space, or backend object.
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
`references/implement-lite.md`, and `agents/slice-reviewer.md` each still instruct themselves to read
`references/test-selection.md` **and run the command it selects** — anchored on that clause, not the
bare mention, so a document that keeps the path in a passing aside but drops the run instruction still
fails. Twenty-third, the `full-suite` contract (ADR 0025), six rows: `commands/review.md` still runs the
full suite itself, before dispatching `final-reviewer`; states that a `fail` there is itself a Critical
finding folded into the fix loop; and states that the stage does **not** advance while a full-suite fail
or Critical/Important finding stands — the clause that actually blocks a red scope, distinct from the
finding merely being named. `agents/final-reviewer.md` still names its own re-run as optional and never
the scope's only full-suite run, and states that `Full-suite run: fail` makes the verdict `Ready to
merge? No` on its own. The sixth row covers the other end: `references/run-handoff.md`'s run handoff still
runs the scope's one full suite itself, in place of the review an all-`mechanical`/`docs` scope skips. It
is the one full-suite run the other five rows leave uncovered, and the routing check below sends such a
scope past `/superdev:review` on the strength of it. Losing any one row quietly reopens the gap ADR 0025
closed.
Twenty-fourth, the `entries-standing-gate` contract (ADR 0026), `scanShipGateContract()`: `commands/ship.md`
§3's own "Entries standing." paragraph asks once whether to ship a standing unresolved defect, and refuses
outright under `--unattended`. §3 also carries an unrelated, pre-existing gate (the missing-review/document
warning) using the identical ask-once and `--unattended` → refuse phrasing for a different question, so
both halves are matched inside the "Entries standing." paragraph alone — extracted with the same
`extractSection()` helper `scanAnchorContract()` uses, anchored on the paragraph's bolded lead-in rather
than a markdown heading. A whole-file match lets the unrelated gate satisfy either half after the
entries-standing gate's own clause is deleted; a consumer that keeps §5's `## Unresolved defects`
pull-request heading and loses either half still reads right and ships a broken branch — the exact
failure every other contract in this file exists to catch. Twenty-fifth, the `unresolved-glossary` contract
(ADR 0026), `scanUnresolvedGlossaryContract()`: `CONTEXT.md`'s **Degraded pass** and **Unresolved defect**
entries restate what `references/scope-mode.md`'s `## Degraded passes` and `## Unresolved defects`
sections define — that a degraded pass is never a failure of the code under review, and an unresolved
defect is exactly that. Each fact is pinned once per document, in its own wording, as a canonical clause
that must appear verbatim — the same literal-phrase shape every other contract in this file already is.
What separates a correct sentence from a contradiction here is coreference (which subject a clause
attributes to), which no pattern-matching heuristic can recover, so the check requires the clause's exact
words in their exact order: a negated, reworded, or dropped clause fails the same way a dropped clause
does anywhere else in this file. Both sides of the comparison are whitespace-normalized first — runs of
whitespace, including a line break, collapse to a single space — because `CONTEXT.md` and
`references/scope-mode.md` are hard-wrapped and a canonical clause can span a line break in the real
document. Nothing executes the glossary, so it is the copy most likely to drift.
Twenty-sixth, the `afk-routing` contract (ADR 0025), three rows: `commands/afk.md`'s stage table reads each
slice's `type` off the ledger and routes an all-`mechanical`/`docs` scope from `merged` to
`/superdev:document ... --unattended` and from `documented-unreviewed` to `/superdev:ship ...
--unattended`, and `commands/ship.md` drops `/superdev:review` from its own missing-step warning for that
same scope. Such a scope skips the whole-scope review by design — there is no Definition-of-Done judgment
to attach one to — so a table that routes it into the review strands the feature: the review has nothing
to judge, and `/superdev:ship --unattended` still refuses a scope whose review never ran, which no sweep
can clear. Each afk.md row also requires `--unattended` past the command name: this paragraph is prose,
not a stage-table row, so `scanAfkInvocations`'s row scan never reaches it, and a row that drops the token
strands an unattended sweep at an interactive question with nothing reported. Both documents are pinned
because either alone reads correct while the pair disagrees, which is how the defect reached `main` in
the first place. Twenty-seventh, the `arg-token` contract: `hooks/merge-guard.js`,
`hooks/green-gate.js`, and `hooks/ledger-guard.js` each carry the canonical `const ARG = …` shell-word
token **verbatim**. The three parse the same shape out of a Bash command line by hand, and nothing links
the copies, so this pins the literal rather than testing mutual equality — a token that narrows in one
hook reopens the quoted-argument bypass there (`git -C "my repo" merge` walking past the guard), and a
deliberate improvement is meant to reach all three files and this pin in one commit. Same shape as the
scope-slug charset assertion in `scripts/scope.js --selftest`.
Twenty-eighth, the `audit-set` contract: `commands/setup.md` still records decision C's answer as the
`## Audit set` section of `docs/agents/documentation.md`, `commands/document.md` still reads that
section back with its stated fallback for when it's absent, and `references/documentation.md` still
seeds the section as optional, for `/setup` to fill in. Three documents agree on the section only in
prose, the same shape as the afk-routing and arg-token pairs above — a renamed heading or a dropped
fallback clause leaves the section unreachable in every repo that carries it, unnoticed, until a doc
audit runs on one and finds nothing there.
Twenty-ninth, the `aggregate-page` contract (ADR 0027), four rows: `references/doc-pass.md` and
`commands/plan.md` — the two stagers — each stage `action: patch` carrying one section for an outline
entry marked aggregate, `commands/publish-kb.md` applies it by merging through `scripts/kb-patch.js`,
and `references/knowledge-base-confluence.md` documents the `(aggregate)` marker that decides which
pages get one. The `publish-kb` row is anchored on
the **call**, not on the word `patch`: a document that names the action and then merges the page in its
own prose puts a model back in charge of rewriting a reader-facing page, which is exactly what moving the
merge into a script prevented. The marker row is the quietest to lose — every other document still reads
correct, the doc pass simply never marks a page, and it stages `upsert` forever, replacing an aggregate
page with the one section a scope can see. That is the state that left this repository's own
`ADR summaries` page four decisions stale.
Thirtieth,
the `read-path` contract (ADR 0027), two rows: `commands/publish-kb.md` reads a
`patch`'s live body through the call the config document documents, and splits the outcome into
**positive absence** — the find call does not list the title — which creates the page, and **any other
outcome** — no documented read, a transport or authorisation failure, the read itself reporting the page
absent for a listed title, or an empty body for a listed title — which is a **read failure**, not absence,
and must leave the file staged. The row is anchored on that branch, not on the word "read": a document
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
section stating three universal elements: append creates only new slice records and never edits, closes,
or deletes a merged one; extending a single-slice feature creates the epic first, copying the lone
slice's `acceptance` into it as the global DoD; and amending a promoted epic's own body is the one
sanctioned edit — the clause anchored on that permission's own wording, not on "amend" or "epic" alone,
either of which recurs elsewhere in the section's surrounding prose. Each element is matched on a
bullet's bolded lead-in, the same `scanAnchorContract` shape, over the same candidate-document list.
`references/issue-tracker-local.md` alone carries a fourth element, that append continues file numbering
from the highest number already present and never reuses one — its `id` is the file number `/plan`
itself assigns, unlike an issue backend's server-assigned key, which already satisfies the id rule on
its own. Thirty-fifth, the
`status-seed` contract (ADR 0004), two rows against `references/run-init.md`: it carries a `"status"` field
in the JSON its run init pipes into `scope.js init`, and it states that a slice the store reports as merged
seeds `merged` and is never dispatched. Append mode never renumbers or re-merges a slice already shipped,
so a second run over an appended feature must seed each loaded slice's real status rather than defaulting
every row to `todo`, and skip every row already seeded `merged` rather than re-dispatching it — a document
that drops the field, or drops the never-dispatched clause while keeping the field, silently re-dispatches
a merged slice either way, so the two rows fail independently.
Thirty-sixth, the `plan-append` contract (ADR 0004), five rows all against
`commands/plan.md`: its §0 asks new-vs-extend before the interview begins and states that answering "new"
makes no store call; it states the store refusal signal (a slice `in-progress`, `in-review`, or `blocked`
elsewhere) as one row and the ledger refusal signal's two clauses — a run root whose stage is other than
`shipped`, and a `shipped` stage whose scope branch is neither merged into the base nor gone — as two
further independent rows, so losing any one of the three fails on its own rather than only in aggregate;
and it states the single-slice epic-promotion clause, including that the lone slice is left untouched.
Each ledger-signal row is anchored on the refusal condition's own wording, not on the rationale sentence
that explains the branch test a few lines below it, so a document that keeps the rationale but loses the
condition still fails. Thirty-seventh, the `rotate-on-shipped` contract (ADR 0004, ADR 0007):
`references/run-init.md` states that run init reads a present ledger's stage before choosing between
resume and init, that stage `shipped` rotates `ledger.md` to `ledger-shipped-<date>.md` and then runs
`init` again, that every other stage — `implementing`, `merged`, `reviewed`, `documented`,
`documented-unreviewed` — keeps the existing resume path, and that nothing is deleted, so
`scope-prune`'s seven-day post-merge reap still runs on its own terms. A fourth clause states that the
rotation never overwrites an existing `ledger-shipped-<date>.md`, so a scope that ships twice in one
calendar day keeps both trails instead of the second rotation clobbering the first. `scope-prune` keeps
a shipped run root on disk past merge, so a second `/superdev:implement` run over an appended feature
can land while that ledger is still there; a document that goes back to treating any present ledger as
an in-progress resume re-dispatches a finished run instead of beginning the new one. Thirty-eighth, the
`parked-questions` contract (ADR 0004, ADR 0005), two rows against `commands/plan.md`: it surfaces an
epic's `## Parked questions` the moment §0 loads it, before the interview diverges into new ground; and
a question the interview resolves has its line deleted from that section, with the new slice's `spec`
and `acceptance` standing as the sole record — `references/domain-modeling.md`'s revise-in-place rule
forbids holding both. Losing either row independently: a document that keeps surfacing questions but
stops deleting a resolved one's line leaves two records of the same decision, and one that stops
surfacing them silently strands a load-bearing decision no later interview ever revisits. Thirty-ninth, the
`run-kind` contract (ADR 0028), five rows against `references/scope-mode.md`: its `## Cutting the scope
branch` section specifies the branch step for each of the three run kinds — `fresh` cuts one from
`<base>` and stops, cutting nothing, when a scope-prune reap left a same-named branch standing; `appended`
decides on the same merged-or-gone test `hooks/scope-prune.js` and `commands/plan.md` already run (ADR
0007) rather than a bare `git merge-base --is-ancestor`, which exits 128 on a branch a squash-merging host
already deleted, then stops a contained reuse on the same dirty-checkout/held-elsewhere conditions
`resumed` stops on before it switches the invoking checkout; and `resumed` runs no ancestor test and cuts
nothing. `fresh` and `appended` get two rows each because each carries two independent clauses; `resumed`
gets one. The rows sit against that one document rather than the two playbooks, which hold a pointer plus
their own tier's command: pinning a pointer's prose goes red on a reflow while catching no revert. Losing
any row independently: a document that stops specifying one clause leaves that run's branch step to
whatever a reader infers, which is the gap three consecutive review fix cycles kept re-opening.
Fortieth, the `forcing-branch-flag` contract (ADR 0028), `scanForcingBranchFlag()`: neither execution
playbook names a forcing branch flag —
`git switch -C`/`--force-create`, `git checkout -B`, or `git worktree add … -B`/`--force-create`. Each
resets an existing branch instead of failing on it: `git switch -C` prints `Reset branch` and exits 0
while leaving every slice already merged into that branch unreachable from any ref, and the ledger still
records those slices as `merged`, so nothing in the run rebuilds what it lost. Every spelling is pinned,
not just the two the playbooks happen to use, because the flag a hurried edit reaches for is whichever
one it already knows. It is a **negative** check — it asserts a document no longer matches a pattern,
where most assert that one still does — which is why it is a scanner rather than a contract-table row.
`return-to-controller` below is the other.
Forty-first, the `source-sections` contract: each canonical reference still carries the sections its readers
are sent to — `references/plan-contract.md` (`## Fields`, `## Epic visuals`, `## Slice lifecycle & status`,
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
the diff which deleted it would connect to the readers it silently broke. `references/scope-mode.md` was
already pinned this way, by the eleventh and fourteenth checks' heading rows; this is that treatment for
the five sources that never got it.
Forty-second, the return-to-controller contract (ADR 0029), `scanReturnToController()`: neither execution
playbook, nor `references/run-init.md`, nor `references/run-handoff.md` instructs a return to the command
body. Slices 01-02 made the run one-directional — it opens at run-init.md and ends at run-handoff.md — but
nothing guarded that shape until this check, so a later edit could reintroduce "return to the controller",
"resume at `commands/implement.md`", or any of the other verb/target pairings `contracts.js` enumerates,
with the suite staying green throughout. A bare mention of the controller, the command body, or
`/superdev:implement` is legitimate prose on its own; only a directional verb paired with one of those
targets is a gap.
Forty-third, the `playbook-edges` contract (ADR 0029), four rows: both execution playbooks still name
`references/run-init.md` as their opening step and `references/run-handoff.md` as their closing one. The
return-to-controller check above is the negative half of the run's one-directional shape — an instruction
to go back; this is the positive half — that a playbook still points forward at all. Deleting "read
run-handoff.md as your last step" from a playbook leaves every other check green — the reference still
resolves, nothing points back to the controller either — while the run would end with no
`scope.js stage set merged` write and, on an all-`mechanical`/`docs` scope, with no full-suite run
anywhere in the chain.

Forty-fourth, the `doc-pass` contract (ADR 0031), two rows: `agents/doc-writer.md` and
`references/implement-lite.md` each read `references/doc-pass.md`, the file that states the documentation
pass they perform. The pass has two callers — the dispatched writer, and the `lite` execution playbook's
controller working in its own context — so it is stated once and read by both. A caller that drops the
read keeps performing a pass it
no longer holds the rules for, and nothing else notices: `reference` above only resolves paths that are
still cited, and the content-type, staging, and aggregate contracts moved onto the reference with the
prose, so they stay green while the caller that lost the read quietly writes to no standard at all. The
row is anchored on the `Read` instruction rather than the bare path, for the reason the `content-types`
contract states — a passing mention is not a read.

Forty-fifth, the `narrative-coverage` contract, `scanNarrativeCoverage()`: every check registered in
`drift/checks.js` is written up in this file by its backticked `id`, and both documents that count the
checks in prose — this one and the root `AGENTS.md` — state the number the registry actually holds. The Work
Guidance below already required the write-up; nothing enforced it, and it was skipped twice, for two
checks whose only account was their own code. The count drifted on the same edits, reading forty-one
against a registry of forty-three. Both halves are prose a maintainer updates by hand at the moment they
are thinking about code, which is exactly when they get forgotten. A check the classification sentence
above names by `id` is covered by that mention alone; for every other check the write-up is the only
mention, and this is what holds it in place. The check is otherwise deliberately shallow: it pins that
each check is described **somewhere** and that the counts agree, never that a description is accurate or
that the classification sentence files a check under the right kind. Those stay human judgment, and no
check can replace them.

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
- A new drift-check contract is one entry appended at the end of the `drift/checks.js` registry, plus
  its section in the forty-five-check narrative above and its selftest in the matching
  `drift/selftest/*.test.js` suite. Append rather than insert unless the check belongs earlier for a
  reason — every ordinal after an insertion point has to be rewritten by hand. The forty-fifth check,
  `narrative-coverage`, enforces two pieces of this by itself: the new id must appear backticked
  somewhere in this file, and this file's and the root `AGENTS.md`'s check-count prose must both state
  the new total. It does not enforce the selftest, or that the write-up is accurate or files the check
  under the right kind. Those stay a review's job.

## Verification

`bun run test` (repo root) runs every script's `--selftest` under `node`, which matches the
production runtime.

## Child DOX Index

None. `scripts/` has no subdirectories with rules of their own.
