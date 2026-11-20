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
