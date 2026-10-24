# 0170: Prompt-concept overlap is judged by rule equivalence

**Status:** Accepted

**Amended by:** [ADR 0190](0190-listed-skill-files-are-written-as-prompt-concepts.md), which applies the
overlap test to a standing-code review, to a reference-only change, and to a governed skill's dispatch prose.

**Amends:** [ADR 0169](0169-agent-bodies-are-written-as-prompt-concepts.md), whose **One home per rule**
the reviewer now checks with a stated test and stated grades, and
[ADR 0098](0098-the-fix-loop-fixes-every-finding-and-only-correctness-holds-the-stage.md), whose scope
review loop also ends on a re-review that leaves only Minor overlap findings.

## Context

ADR 0169 writes every agent body as prompt concepts. The glossary's **No overlap** invariant said that no
sentence states what another concept states, and gave no test for "states what". Two `/superdev:review`
runs on the agent-briefs scope (epic #1166) each reached the 3-cycle cap on that invariant alone. Each fix
cycle removed the overlaps the review listed. Each re-review read the whole scope range (ADR 0137) and
found new overlaps of the same kind. None of them changed what an agent does.

## Decision

- **Overlap is rule equivalence.** Two sentences overlap when they apply under the same condition and give
  the same instruction, so deleting either one leaves every dispatch's instructions unchanged. The same test
  applies to a pair inside one agent body and to a pair of a body sentence and a sentence in a reference
  section the agent reads.
- **The grade follows the harm.** A pair is graded by what it can do to a dispatch's instructions.
  `plugin/references/review-checklist.md`'s `## Prompt-concept overlap` states the grades.
- **A Minor overlap holds nothing.** It breaks no Definition-of-Done criterion. In `/superdev:review`'s
  fix loop, a re-review whose only findings left are Minor overlap findings, with no criterion broken,
  ends that loop (INV-0094). The full tier's per-slice fix loop has no such exit.
- **One home for the test.** `plugin/references/review-checklist.md`'s `## Prompt-concept overlap` states
  the test, the exclusions, the finding, and the grades. The glossary entry defines the term and points
  there.
- **It applies only where a glossary defines Prompt concept.** The checklist ships to adopters, and the
  convention is superdev's own until an adopter's glossary takes it on.

The operator decided each point on 2026-10-22, in the plan for epic #1297.

## Considered options

- *Overlap is a shared word run, checked by a drift check.* Rejected: a trial over the seven agent bodies
  found that repeated seven-word runs matched only condition heads, and that no residual overlap the reviews
  cited was a shared word run. ADR 0153 also limits a drift check to a mechanical fact or a forbidden form.
- *Overlap stays an Important finding.* Rejected: the whole-range re-review finds new pairs on every cycle,
  so the fix loop reaches its cap again.
- *A narrower condition states its own precedence.* Rejected: a reader must then infer which sentence
  applies where the two conditions overlap only in part.

## Consequences

Duplicate sentences can stay in an agent body without holding a scope. The checklist's grades still
catch the drift ADR 0169 names when it starts to matter. The judgment stays a reviewer's,
and two reviews of one branch can still report different pairs. The grades keep that difference from
holding a scope.
