# 0246: A scope review loads its rare branches on demand

**Status:** Accepted

**Amends:** [ADR 0235](0235-shipped-prose-loads-only-what-its-reader-applies.md).

## Context

ADR 0235 and ADR 0239 split the shipped references by reader. Three large files were left whole:

- `plugin/references/review-scope-mode.md` (49.5 KB) was read whole by every scope-mode `/superdev:review`. About a
  fifth of it stated branches most reviews never reach: an anchor check that refuses or cannot read, the
  standing-defect writes, the fix cap, a denied dispatch or test run, a moved base, a deferred finding, and the
  **Unreviewed slice** and **Missing fail-to-pass run** findings.
- `plugin/references/issue-tracker-jira.md` (30.7 KB), the Jira store seed every command but `/superdev:plan` reads
  once configured, restated the reason for many of its rules.
- `plugin/skills/setup/SKILL.md` (55.7 KB) runs rarely, and every run loads it whole. It carried rationale,
  repeated gap examples, and retired-rule history.

Shipped prose also still carried sentence-level `ADR` and `INV-` citations, which a model running a command cannot
follow.

## Decision

1. **A scope review reads its steady-state path, and each rare branch from a file of its own.**
   `review-scope-mode.md` keeps every step heading and every concept a review reaches on its common path. At each
   rare branch it names the file and section that state it: `review-scope-holds.md` (the anchor check's refusals,
   the standing-defect writes, the cap), `review-scope-denials.md`, `review-scope-base.md`,
   `review-scope-deferrals.md` (with the store's `## Triage record` read), and `review-scope-coverage.md`. The
   review reads a branch file only when its branch fires. Each branch file is a governed body under
   `CONTEXT.md`'s **Prompt concept** entry.
2. **The Jira core seed and the setup skill keep every call and behaviour, and drop rationale, repetition, and
   history.** The Jira seed drops its fallback for a configuration with one issue type for every slice: superdev
   makes no compatibility promise before 1.0.0, and setup's seed-gap pass offers the per-role types.
3. **Shipped prose carries no sentence-level ADR or invariant citation.** Each sentence states its rule. A
   citation inside an example, such as an ADR title or an invariant heading that shows a format, stays.

## Considered options

- **Split `review-scope-mode.md` by step.** Rejected: every review walks every step, so it would read every file.
- **One file for every rare branch.** Rejected: a review that reaches one branch would load all of them.

## Consequences

A scope review that reaches no rare branch loads 40.8 KB of `review-scope-mode.md` in place of 49.5 KB. A review
that reaches a branch adds that branch's file, 1.8 KB to 4.1 KB. A Jira-configured runtime reader loads a store
document seeded from 24.2 KB in place of 30.7 KB. A setup run loads 52.2 KB in place of 55.7 KB. A maintainer
tracing a shipped rule to its decision searches `docs/adr/` for the rule's subject.
