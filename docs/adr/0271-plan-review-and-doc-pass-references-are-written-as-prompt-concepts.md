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
