# 0271: Plan, review-lens, and doc-pass references are written as prompt concepts

**Status:** Accepted

**Amends:** [ADR 0270](0270-listed-reference-files-are-written-as-prompt-concepts.md), whose settled rule that a
`docs` or `mechanical` slice of a `fix` feature skips the diagnosis loop now also places the feature's red-capable
command on a `behavior` slice.

## Context

ADR 0270 governs a reference file once the glossary's **Prompt concept** entry lists it, and its first scope listed
sixteen execution and run references. The plan, review-lens, and documentation-pass references are still unlisted.
`/superdev:plan`, `/superdev:brainstorm`, the reviewers, the test auditors, and `doc-writer` read them in the middle
of a task.

ADR 0270 also settled that only a `behavior` slice of a `fix` feature runs the diagnosis loop. `/superdev:plan` and
`diagnosis.md` still put the feature's red-capable command on its first slice, whatever that slice's type. A
`mechanical` or `docs` first slice then carries the reproduction criterion while its builder skips the loop that runs
it (triage #327).

## Decision

- **The second reference set is listed.** `plan-contract.md`, `plan-authoring.md`, `plan-extend.md`,
  `plan-repair.md`, `store-records.md`, `assignee.md`, `intent-handoff.md`, `prior-art.md`, `design-sketch.md`,
  `cross-exam.md`, `domain-modeling.md`, `doc-verification.md`, `diagnosis.md`, `prototype.md`,
  `review-checklist.md`, `simplicity-lens.md`, `review-design-lenses.md`, `review-coverage.md`, `fail-to-pass.md`,
  `untraced-writes.md`, `dependency-verification.md`, `prompt-concept-overlap.md`, `prompt-prose-form.md`,
  `test-cost.md`, `test-gaps.md`, `review-inline-fix.md`, `doc-pass.md`, and `response-shapes.md` are written as
  prompt concepts by ADR 0270's rules, and the glossary lists each one.
- **A `fix` feature's reproduction lands on a `behavior` slice.** The red-capable command is the first acceptance
  criterion of a `behavior` slice that every other `behavior` slice of the feature depends on, directly or through
  other slices. A defect nobody can reproduce yet makes building that command the work of that slice. A `fix` feature with no `behavior` slice states in its first
  slice's `spec` why no command reproduces the defect. `/superdev:plan` hands the feature label to
  `slice-readiness-reviewer`, which reports a `fix` plan that breaks this rule.

## Considered options

- *Every `fix` feature's first slice is `behavior`* (the wording of triage #327). Rejected: a prose-only defect, such
  as a wrong heading in a reference, has no test seam, and the rule would force a test onto it.
- *Append the second set's paragraphs to ADR 0270.* Rejected: an accepted ADR is amended by a new record, never
  edited.
- *One slice for `review-checklist.md` and every lens file.* Rejected: the lens files have different readers
  (`final-reviewer`, `slice-reviewer`, `simplicity-reviewer`, the test auditors, `/superdev:review`), and a slice per
  reader group keeps each change to one reader's prose.

## Consequences

Each rewritten reference keeps every rule of its old text, except where a paragraph below names a settled conflict.
A paragraph per rewritten file states what the rewrite added, removed, and settled.

**`plan-contract.md`.** Added: a condition head and a bold label for each concept; the anchor-line distinctness rule
stated once, as **Distinct notations**, in place of the copy each anchor-line paragraph carried. Removed: the reasons
for the durable release signal, for the operator's confirmation of an unreleased feature, for recording an anchor
dependency sparingly, and for keeping it apart from a slice's `depends-on`, which ADR 0034, ADR 0040, and ADR 0042
carry; the reason the epic's tags start in plan notation, which ADR 0209 carries. Settled: the `mechanical` warrant
gate named a full-suite run at `/superdev:review`'s exit, while `review-scope-mode.md` runs no full suite and takes
the full-suite evidence `/superdev:ship` reads (ADR 0255). The gate now names that full-suite evidence.

**`store-records.md`.** Added: **The writer**, **Read before write**, and **Best-effort** as separate concepts under
`## Triage record`, each condition at its head. Removed: the restated deferral definition (what defers and the three
never-defer cases) and the close-only-if-not-absorbed rule, which now point to `scope-findings.md`'s `## Deferred
findings`. Every reader of the triage record section that defers or closes a record also reads that owner: the full
tier's fix cycle, `review-scope-mode.md`, and `scope-findings.md` itself, so no copy stays. Also removed: the reasons
the trigger command writes the record and an uncertain match creates one, which ADR 0144 and ADR 0145 carry, and the
`triage #505` provenance note. Settled: nothing.

**`assignee.md`.** Added: **Resolving the assignee** and **A bad assignee never costs the run its issues**, each with
its cases as a list. Removed: the reasons for the untracked file and for the single retry, which ADR 0010, ADR 0073,
and ADR 0207 carry. Settled: nothing.

**`plan-authoring.md`.** Added: `### A fix feature's reproduction` under `## Vertical-slice rules`, the one owner
of where a `fix` feature's red-capable command lands, which `skills/plan/SKILL.md`, `plan-repair.md`, and
`slice-readiness-reviewer.md` cite; **The integration branch** as its own concept under `### Wide refactors`; each
`## Append mode` invariant under its own bold label, with the anchor lines that migrate on a single-slice promotion
named once. Removed: the reasons for behaviour over proxy counts, for the uniform `Reachable:` and `Release risk:`
rules, for the epic-visuals floor, for an honest dependency graph, and for each append refusal, which ADR 0004,
ADR 0062, ADR 0083, and ADR 0133 carry. Settled: the plan skill and `plan-repair.md` put the red-capable command on a
`fix` feature's first slice, whatever its type, while ADR 0270 has a `docs` or `mechanical` slice skip the diagnosis
loop. The command now lands on a `behavior` slice every other `behavior` slice depends on, and the readiness check
reports a plan that breaks this.

**`plan-extend.md`.** Added: a condition head for each concept, and the run-root stage cases as a list. Removed: the
reasons the feature loads before §1 and the gate fails closed, which `plan-authoring.md`'s `## Append mode` states as
rules and ADR 0083 carries. Settled: nothing.

**`plan-repair.md`.** Added: each repair mark's meaning as a list. Removed: the restated first-slice reproduction rule,
which now points to `plan-authoring.md`'s `### A fix feature's reproduction`. Settled: the same conflict as
`plan-authoring.md`'s, resolved by that pointer.

**`diagnosis.md`.** Added: **A proven cause skips the loop** and **At plan time** as their own concepts. Removed: the
plan-time sentence that put the red-capable command on the feature's first slice, which now points to
`plan-authoring.md`'s `### A fix feature's reproduction`; the reasons for ranking several hypotheses and for tagging
instrumentation. The gate's stop instruction stays a rule. Settled: the first-slice placement, as in
`plan-authoring.md`'s paragraph.

**`design-sketch.md`.** Added: a condition head on each concept that lacked one. Removed: the reasons for the
top-to-bottom flowchart, for flush-left Mermaid source, and for the `.gitignore` guarantee, and the note that a
declined sketch loads nothing, which ADR 0036 and ADR 0266 carry. Settled: nothing.

**`prototype.md`.** Added: each bullet as a concept with its condition at the head. Removed: the reasons for stating
the question first and for liftable logic. Settled: nothing.

**`cross-exam.md`.** Added: each core move as its own concept under its existing bold name, **A required question** as
a concept apart from **Offer only live options**, and **The shared picture** under `## Termination`. Removed: the
reasons for one question at a time, for a recommended answer, for stating a lone survivor out loud, and for
recomputing the frontier, which ADR 0122 carries. Settled: nothing. `doc-verification.md` now cites **Find facts
concurrently** by name, where it cited "concurrent fact-finding".

**`prior-art.md`.** Added: a condition head on each check. Removed: nothing. Settled: nothing.

**`domain-modeling.md`.** Added: **The numbering rule**, stated once for ADR files and invariant ids, which
`skills/plan/SKILL.md` already cites by that name; the principle-to-rule sort as numbered branches, the first match
winning, in place of the "ask this first" note. Removed: the reasons behind the three-part test, the ADR diagram rule,
`Concepts` as the mandatory coordinate, and superseding over editing, which ADR 0077 and ADR 0081 carry. Settled:
nothing.

**`doc-verification.md`.** Added: a condition head on each concept, and **The source**, **The citation**, and **The
outcome** as separate concepts under `## How to verify`. Removed: the reasons training data goes stale and a stable
API needs no check. Settled: nothing.

**`intent-handoff.md`.** Added: a condition head on each section's concept; each "the fallback below" pointer now
names `## The fallback`. Removed: nothing. Settled: nothing; ADR 0199 carries the reasons.

**`review-checklist.md`.** Added: a condition head for `## Binding rules`, `## Anti-patterns`, and `## Vulnerability
classes`; the judgment-call rule as a third binding rule, so it binds every citing lens as the section did. Removed:
the reasons inside the **Weakened net**, **Tautological test**, **Redundant test coverage**, **Overweight fixture**,
and **Drive-by change** entries, and the reason re-reporting a tooling class is waste. Each condition those reasons
carried stays as a rule. The anti-pattern and vulnerability lists stay lists, and the citing agent bodies keep the
Critical severity of a vulnerability class. Settled: nothing.

**`review-design-lenses.md`.** Added: a condition head on each section's lens, and the binding by `## Binding rules`
as its own concept. Removed: the reasons inside **Single-adapter seam** and **Orphan production symbol**, and the
reason **Convention drift** matches what is there. Settled: nothing.

**`simplicity-lens.md`.** Added: **Prose in the diff** as its own concept under `## Scope of the lens`. Removed: the
sentence that length is no justification of its own, which **Judge discipline**'s remaining rule carries. Settled:
nothing.

**`fail-to-pass.md`.** Added: a bold label and condition head on each concept; **The mark** with its re-judge,
warm re-review, claimed-case, and Missing-run rules as a list. Removed: the "below" pointers in the verdict table and
the judgments, and the reason a `settled-from-trace` line counts, which ADR 0251 carries. The seven verdict heads keep
the words `fail-to-pass-check.js` prints. Settled: nothing.

**`untraced-writes.md`.** Added: **Grading a listed path** as its own concept. Removed: the reason a shell write
leaves no `edit` line, and the restated rule that a `lite` `behavior` slice records a range, which `implement-lite.md`
owns. Settled: nothing.

**`dependency-verification.md`.** Added: the cases of **Unverified dependency** as a list. Removed: the reason the
section sits outside `review-checklist.md`'s `## Anti-patterns`. Settled: nothing.

**`review-coverage.md`.** Added: the cases of **Unreviewed slice** as a list. Removed: the reason a non-`completed`
end reviewed nothing. Settled: nothing.

**`review-inline-fix.md`.** Added: a bold label and condition head on each step's concept; the dispatch now names the
`agents/implementer.md` sections that own the RED-test rule, the sibling surfaces and same-defect instances, the test
runs, the fail-to-pass run, and the report, and hands only the model, the working directory, the findings with
`<cycle-base>`, and the no-run-root values. Removed: the restated sibling-surface and same-defect rules, which
`implementer.md`'s `### Sibling surfaces` already owned for the inline fix dispatch; the "below" pointers. Settled: the
separate-Bash-calls rule lived only in this dispatch, so it moved into `implementer.md`'s `### Running tests` for the
inline fix dispatch before the dispatch dropped it. ADR 0228 carries the reasons.

**`prompt-concept-overlap.md`.** Added: **The gate** and **The subject** as separate concepts in place of the one
opening paragraph; the dispatch-sentence and not-an-overlap cases as lists. Removed: nothing. The test, the grades,
the Minor and Important severities, the gate, and the subject read the same in substance; ADR 0170 carries the
reasons. Settled: nothing.

**`prompt-prose-form.md`.** Added: **The gate**, **The subject**, **Lines judged**, **Applied sections**, **Exempt
sections**, **Precedence**, and **The finding** as concepts with their condition at the head. Removed: nothing. The
applied and exempt section lists keep every heading `scripts/drift/contracts.js`'s `PROMPT_PROSE_FORM_CITED` pins, and
the Minor grade, gate, and subject stand; ADR 0269 carries the reasons. Settled: nothing.

**`test-cost.md`.** Added: a condition head for the section's reader and its lenses. Removed: the reasons the section
sits outside `review-checklist.md`'s `## Anti-patterns` and a dead test costs every run. Settled: nothing.

**`test-gaps.md`.** Added: a condition head for the section's reader and its lenses; the pointer to **Happy-path-only
suite** now names `review-checklist.md`. Removed: the reasons the section sits outside `## Anti-patterns` and a
file-level finding bounds the report. `## Test gaps` stays the section only `test-gap-auditor` reads. Settled:
nothing.

**`doc-pass.md`.** Added: a bold label and condition head on each concept; **Reading the `docs` targets** apart from
the inputs list; the remote backend's parent, parent-link, read, and aggregate rules as concepts with their cases as
lists; **Read before an `upsert` replaces a page** named in `## Read the knowledge base, never write to it` in place of
a "below" pointer. Removed: the reasons the content-type lens weighs more on the knowledge base, a stale `Paths:`
costs only precision, a remote write waits for publish, and a slugged filename and a section filename prevent an
overwrite, which ADR 0031, ADR 0119, ADR 0219, and ADR 0229 carry. No dispatch lives in this file, so no agent body
gained a contract. Settled: nothing.

**`response-shapes.md`.** Added: a bold label and condition head on each concept; under `## The chain start`, **The
successors**, **The repair loop at `submitted`**, and **A typed command** as separate concepts in place of one
paragraph. Removed: the "above" and "below" pointers. `## The Next block` and `## The chain start` keep their headings
and every rule they held; ADR 0113, ADR 0253, and ADR 0268 carry the reasons. Settled: nothing.
