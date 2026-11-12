# 0239: The store document holds only the calls every command makes

**Status:** Accepted

**Amends:** [ADR 0235](0235-shipped-prose-loads-only-what-its-reader-applies.md).

## Context

ADR 0235 split the shipped references by reader. The slice-store configuration was left whole:
`/superdev:setup` wrote one `docs/agents/issue-tracker.md` from one seed, and every chain command, `/superdev:status`,
and the intent-record writers read it whole. The GitHub seed was 41 KB, the Forgejo seed 39 KB, the Jira seed 49 KB, and
this repository's own document 39 KB. About a third of each document held calls only `/superdev:plan` makes: issue
creation, the dependency and anchor-line writes, the assignee, the criterion-tag rewrite, append mode, and the plan-only
epic sections. Much of the rest restated the reason for a rule beside the rule.

`references/fail-to-pass.md` (12.6 KB) is read by `slice-reviewer` and `final-reviewer` on every dispatch, and carried
the same narration.

## Decision

1. **Two store documents.** `docs/agents/issue-tracker.md` holds the calls every command makes: reading and listing
   issues, the body-edit chain, labels and the close, the scope anchor's reads, release, triage and intent records,
   untriaged items, run state, the criterion tick, the status workflow, and loading slices.
   `docs/agents/issue-tracker-plan.md` holds the calls only `/superdev:plan` makes. `/superdev:plan` reads both, and every
   other reader reads the first alone.
2. **Two seeds per backend.** `issue-tracker-<backend>.md` seeds the store document and `issue-tracker-<backend>-plan.md`
   seeds the plan document. `/superdev:setup` writes both, and its seed-gap pass compares each document with its own
   seed. A configured repository with a store document and no plan document has one seed gap: its apply writes the plan
   document and moves the matching sections out of the store document.
3. **Rules without their reasons.** The seeds and `fail-to-pass.md` keep every rule and every call, and drop rationale,
   history, and repetition. The ADRs keep the reasons.

## Considered options

- **Move plan-only sections into a part of the one seed that setup does not copy.** Rejected: `/superdev:plan` needs those
  calls filled in with the repository's values at runtime, so they must reach a consumer document.
- **A plan document only where present, the store document otherwise.** Rejected: a fallback branch in `/superdev:plan`
  for a shape setup's re-run converts in one step. superdev makes no compatibility promise before 1.0.0.

## Consequences

A runtime reader other than `/superdev:plan` loads 17 KB in place of 41 KB on GitHub, 19 KB in place of 39 KB on Forgejo,
31 KB in place of 49 KB on Jira, and 18 KB in place of 39 KB for this repository's own document. `/superdev:plan` loads
about 26 KB on GitHub and Forgejo and 39 KB on Jira. A slice or final review loads 7 KB of fail-to-pass rules in place of
12.6 KB. An adopter's existing store document keeps working for every command except `/superdev:plan`, which calls
`/superdev:setup` when the plan document is missing; the re-run offers the plan document as a seed gap.
