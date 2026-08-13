# scripts/

## Purpose

Standalone deterministic code that `package.json` runs, alongside `hooks/`. Three executables live
here: `scope.js` (the run-state CLI, ADR 0022), `eval-run.js` (the eval runner, ADR 0024), and
`drift-check.js` (the cross-document contract checks).

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
- the grader and judge machinery
- aggregation across runs
- the missing-token exit

### drift-check.js — the cross-document contract checks

The reference, run-root, assignee, anchor-contract, afk-selection-neutrality, writing-standard,
content-types, command-resolution, chain-handoff, feature-label-argument, unattended-token,
afk-invocation, change-type, degraded-pass, derived-criteria, label-validation,
green-gate-timeout, verb-pointer, kb-staging, kb-no-backend-call, no-second-reader,
test-selection-wiring, full-suite, entries-standing-gate, unresolved-glossary, afk-routing,
arg-token, and audit-set checks are drift
assertions. They compare a restated fact against its source. The eval-shape check compares a document
against a schema. The afk-existence check is a plain existence assertion.

`drift-check.js` guards thirty things, in the order its `main()` computes them. First, that every
`references/*.md` path named in `commands/`, `agents/`, or `references/` itself resolves to a file that
exists. A reference cites
another reference — both execution playbooks point at `scope-mode.md` — so a rename there dangles like
any other. Second, that `commands/implement.md`,
`commands/review.md`, `commands/document.md`, `commands/ship.md`, `commands/publish-kb.md`,
`references/implement-full.md`,
`references/implement-lite.md`, `references/scope-mode.md`, `agents/implementer.md`,
`agents/slice-reviewer.md`, `agents/simplicity-reviewer.md`, and `agents/final-reviewer.md` address
run-root artifacts by absolute
`<run-root>/…` path. Third, that every issue-backend document carries the `**Assignee` config bullet.
The filename alone triggers that check, with no content gate on how the doc phrases issue creation.
`references/issue-tracker-local.md` is exempt, because it has no assignee concept. Fourth, that every
slice-store document (every `references/issue-tracker-*.md` plus this repo's own
`docs/agents/issue-tracker.md`) carries a `## Scope anchor` section stating all four of its elements: how
to recognise an anchor, list its candidates, list the slices beneath one, and tell that an anchor is
itself a slice (ADR 0017). Each element is matched on a bullet's bolded lead-in (`- **Recognise one.**`
style, `-` or `*`, American or British spelling) rather than anywhere in the section, so intro prose
that merely lists the four concepts satisfies none of them. Fifth, that `commands/afk.md`'s selection
step (§2) names no backend's own
anchor mechanism — an epic (the `epic` label, matched case-insensitively whether backticked or not,
which also covers the local store's `00-epic-` filename), a change-type label prefix (any of them, and
including a concrete label like `feat/self-improvements`; a type is excluded only when a further
`/`-delimited segment follows it, which is what separates the paths this step legitimately carries —
`docs/agents/…`, the store config it is meant to point at, and `docs/plans/<type>/` — from a label. A
delimiter rule instead reads a real label as a path and passes it, and an allowlist of the two path
literals both misreads an ADR citation as a prefix and lets `docs/plans-refactor` through),
a GitHub sub-issue relation,
a Jira parent field — and instead points at the store's `## Scope anchor` contract. A step that
stayed neutral by naming nothing at all still fails this. Naming no mechanism is only half the property.
`scanAnchorContract()` and `scanAfkSelectionNeutrality()` share one
helper, `extractSection()`, which masks fenced code blocks first. (CommonMark's at-least-as-long
closing-fence rule applies, so a shorter inner fence never closes a longer outer one.) Then it
isolates the text of one heading's section before either scans its body. Sixth, that
`references/documentation.md` still offers a `## Writing standard` section (ADR 0012).
Seventh, that `agents/doc-writer.md` and `agents/doc-reader.md` each still instruct themselves to read
`references/content-types.md` (ADR 0014). Eighth, that every
`/superdev:<name>` reference in `commands/` or `agents/` resolves to a `commands/<name>.md` file, so a
chain handoff never points the reader at a command that does not exist. Ninth, that
`commands/implement.md`, `commands/review.md`, and `commands/document.md` each name their successor in
the chain. `commands/ship.md` ends the chain and is deliberately outside that check.

The tenth, eleventh, thirteenth, fourteenth, fifteenth, sixteenth, seventeenth, and eighteenth checks
share one scanner, `scanContract()`, run over
a table of `[document, pattern, expectation]` rows instead of one function each. It reads every
document a table names and reports the rows whose pattern that document no longer matches. Tenth, the
feature-label-argument contract: `commands/implement.md` declares an `argument-hint` naming a feature
label and resolves `$ARGUMENTS`, and `commands/plan.md` names `/superdev:implement <label>` as its
resolved successor, in a backtick-delimited invocation — the contract only, never the label's shape
(ADR 0019). Eleventh, the
unattended-token contract: `references/scope-mode.md`
carries the `## Unattended` section (ADR 0016), and `commands/implement.md`, `commands/review.md`,
`commands/document.md`, `commands/ship.md`, `references/implement-full.md`, and
`references/implement-lite.md` each name `--unattended` and carry a read/apply instruction pointing at
that section. Twelfth, that `commands/afk.md`'s stage table invokes all four chain commands and
carries `--unattended` on every one of those rows. `scanAfkInvocations()` checks this row by row: a
whole-file regex would pass the moment any one row carried the token, letting a sibling row lose it
unnoticed. Thirteenth, the change-type contract:
`references/scope-mode.md`'s type list, `hooks/scope-prune.js`'s `CHANGE_TYPES` regex,
`CONTEXT.md`'s **Change type** glossary entry, and `scripts/scope.js`'s `CHANGE_TYPES` array state the
same set (ADR 0021). A hook narrower than the prose misreads a live branch of the missing type as gone
— gone is one of the two conditions that make a scope prunable (ADR 0007) — and reaps a shipped run's
root that is still in progress, silently: the Stop hook that runs it reports nothing either way. The
glossary is the copy most likely to drift, because nothing executes it. Fourteenth, the degraded-pass
contract:
`references/scope-mode.md` carries the `## Degraded passes` section, and `commands/implement.md`,
`commands/review.md`, `commands/document.md`, `commands/ship.md`, `commands/status.md`,
`references/implement-full.md`, and `references/implement-lite.md` each name the `**Degraded:**`
ledger entry and point at that section. A consumer that drops the wire lets a run report assurance it
never got — a pull request claiming a review that was its author reading their own work. Fifteenth,
the derived-criteria contract: `commands/review.md` hands `final-reviewer` the **path**
`<run-root>/dod.md` in its scope-mode dispatch, and `agents/final-reviewer.md` carries its
`## Derive the criteria first` step (ADR 0020). Both halves are needed for the ordering to be real,
because a prompt arrives at once — DoD text inlined in the dispatch is already read by the time the
instruction asks for a derivation. Losing either half degrades the derivation into theater: references
still resolve, the suite stays green, and the reviewer reads the DoD first exactly as before.
Sixteenth, the label-validation contract:
`references/scope-mode.md` carries the **Validate both segments.** rule, and `commands/implement.md`
and `commands/afk.md` each point at it. The whole feature label becomes the branch name, so the type
reaches `git switch -c` exactly as the slug does — a rule guarding the slug alone lets `-x/y` through to
git as an option, and lets a non-canonical type make `scope-prune` reap a run root that is still live.
A consumer
that stops pointing at the rule validates nothing and stays valid prose. Seventeenth, the
green-gate-timeout contract: `hooks/hooks.json` sets `"timeout": 600` on the green-gate
PostToolUse(Bash) hook entry, and the comment beside `IS_MERGE` in `hooks/green-gate.js` names that
same 600s ceiling, distinct from Claude Code's own 60s default hook timeout. Green-gate re-runs the
scope suite synchronously inside the hook, so a suite slower than the configured timeout is killed
mid-run and the gate silently doesn't fire — a hooks.json entry that loses its `timeout` field falls
back to the 60s default unnoticed, because the suite stays green until a run happens to exceed it.
Eighteenth, the verb-pointer contract (ADR 0022): every ledger touchpoint in the chain invokes its
`scope.js` verb — `commands/implement.md` `init`, `stage set merged`, `unresolved add`, and
`unresolved clear`, `commands/review.md` `stage set`, `get anchor`, `unresolved add`, and
`unresolved clear`, `commands/document.md` `stage set`, `commands/ship.md` `get stage`,
`stage set shipped`, `get unresolved` (for the unresolved-defect record its §3 gate and §5 body
read), and `get degraded` (for the degrade record its §5 body reads),
`commands/status.md` `status`, `commands/afk.md` `get stage`,
`commands/publish-kb.md` `get branch` for its merge check, both execution
playbooks `slice`, and `references/scope-mode.md` `degraded add`. A document that drops its verb goes
back to hand-editing or hand-parsing the ledger, which the `ledger-guard` hook only catches as a tool
call at runtime, never as prose.
Nineteenth and twentieth, the ADR 0023 knowledge-base contracts, checked in two halves because either
alone passes while the invariant is gone. Nineteenth, the staging half: `commands/plan.md`,
`commands/document.md`, and `agents/doc-writer.md` each name `.superdev/kb-pending/` as the place a
remote backend's page goes instead of a live call. Twentieth, the no-call half, `scanKbNoBackendCall()`:
none of those same three documents carries a backend-directed verb — publish, create, update, upsert, or
an HTTP `POST`/`PUT`/`DELETE` — aimed at a page, wiki, space, or backend object.
`commands/publish-kb.md` is exempt, because reaching the backend is its job. The check reads the
instruction's shape rather than a backend's literal endpoint or credential name, because
**Backends are pluggable** already forbids these three documents from naming a backend at all, so a
literal-only marker would catch almost nothing.
Twenty-first, the no-second-reader contract (ADR 0022), `scanHookLedgerParsers()` scans every
`hooks/*.js` file for a literal `**…:**`-shaped header regex. This pattern marks whether a hook grows a
ledger-header reader of its own instead of `require`ing `scope.js`'s `readLedgerHeader`. It reads the
pattern's shape rather than running the hooks, because the same drift happened to `scope-prune.js`'s own
copy. A second reader can diverge on anchoring, capture width, newline handling, or markup normalisation
silently, and prose alone would not have caught it.
Twenty-second, the test-selection wiring contract (ADR 0025): `agents/implementer.md`,
`references/implement-lite.md`, and `agents/slice-reviewer.md` each still instruct themselves to read
`references/test-selection.md` **and run the command it selects** — anchored on that clause, not the
bare mention, so a document that keeps the path in a passing aside but drops the run instruction still
fails. Twenty-third, the full-suite contract (ADR 0025), six rows: `commands/review.md` still runs the
full suite itself, before dispatching `final-reviewer`; states that a `fail` there is itself a Critical
finding folded into the fix loop; and states that the stage does **not** advance while a full-suite fail
or Critical/Important finding stands — the clause that actually blocks a red scope, distinct from the
finding merely being named. `agents/final-reviewer.md` still names its own re-run as optional and never
the scope's only full-suite run, and states that `Full-suite run: fail` makes the verdict `Ready to
merge? No` on its own. The sixth row covers the other end: `commands/implement.md`'s Final phase still
runs the scope's one full suite itself, in place of the review an all-`mechanical`/`docs` scope skips. It
is the one full-suite run the other five rows leave uncovered, and the routing check below sends such a
scope past `/superdev:review` on the strength of it. Losing any one row quietly reopens the gap ADR 0025
closed.
Twenty-fourth, the entries-standing gate contract (ADR 0026), `scanShipGateContract()`: `commands/ship.md`
§3's own "Entries standing." paragraph asks once whether to ship a standing unresolved defect, and refuses
outright under `--unattended`. §3 also carries an unrelated, pre-existing gate (the missing-review/document
warning) using the identical ask-once and `--unattended` → refuse phrasing for a different question, so
both halves are matched inside the "Entries standing." paragraph alone — extracted with the same
`extractSection()` helper `scanAnchorContract()` uses, anchored on the paragraph's bolded lead-in rather
than a markdown heading. A whole-file match lets the unrelated gate satisfy either half after the
entries-standing gate's own clause is deleted; a consumer that keeps §5's `## Unresolved defects`
pull-request heading and loses either half still reads right and ships a broken branch — the exact
failure every other contract in this file exists to catch. Twenty-fifth, the unresolved-glossary contract
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
Twenty-sixth, the afk-routing contract (ADR 0025), three rows: `commands/afk.md`'s stage table reads each
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
the first place. Twenty-seventh, the arg-token contract: `hooks/merge-guard.js`,
`hooks/green-gate.js`, and `hooks/ledger-guard.js` each carry the canonical `const ARG = …` shell-word
token **verbatim**. The three parse the same shape out of a Bash command line by hand, and nothing links
the copies, so this pins the literal rather than testing mutual equality — a token that narrows in one
hook reopens the quoted-argument bypass there (`git -C "my repo" merge` walking past the guard), and a
deliberate improvement is meant to reach all three files and this pin in one commit. Same shape as the
scope-slug charset assertion in `scripts/scope.js --selftest`.
Twenty-eighth, the audit-set contract: `commands/setup.md` still records decision C's answer as the
`## Audit set` section of `docs/agents/documentation.md`, `commands/document.md` still reads that
section back with its stated fallback for when it's absent, and `references/documentation.md` still
seeds the section as optional, for `/setup` to fill in. Three documents agree on the section only in
prose, the same shape as the afk-routing and arg-token pairs above — a renamed heading or a dropped
fallback clause leaves the section unreachable in every repo that carries it, unnoticed, until a doc
audit runs on one and finds nothing there.
Twenty-ninth,
that `commands/afk.md` exists at all. Nothing else in the plugin names `/superdev:afk` for the eighth
check to resolve, so its absence would otherwise go unnoticed. Thirtieth, that every
`evals/*/graders/*.md` declares a known `type` and a positive `weight`, that an `llm` or `regex`
grader also declares a `focus` or `target`, and that every case's `scaffold_script` resolves. Nothing
else validates a grader, so without this a typo surfaces part-way through a run that costs real API
spend.

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
- A new drift-check contract gets its own entry in the thirty-check narrative above, in
  `main()` order.

## Verification

`bun run test` (repo root) runs every script's `--selftest` under `node`, which matches the
production runtime.

## Child DOX Index

None. `scripts/` has no subdirectories with rules of their own.
