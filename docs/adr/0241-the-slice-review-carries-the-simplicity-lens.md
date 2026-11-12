# 0241: The slice review carries the simplicity lens

**Status:** Accepted

## Context

A full-tier `behavior` slice's first review dispatched two subagents in parallel over the same range: `slice-reviewer`
for correctness and independent verification, and `simplicity-reviewer` for over-engineering. The controller built the
fix list once both returned. Each dispatch pays its own prompt, its own read of the diff, and its own latency, and a
full-tier run makes one such pair per `behavior` slice. The simplicity rubric is short, and both reviewers read the
diff blind.

## Decision

1. **The rubric lives in `references/simplicity-lens.md`.** `simplicity-reviewer` reads it on every dispatch.
2. **A slice's first review applies the lens.** `slice-reviewer` reads the reference on a slice's first review and
   applies it in its blind pass as its Lens 3. Its progress-log entry lists the cuts under `### Simplicity` with the net
   line, and the controller warrants or declines each cut as before. Re-reviews and sweep reviews apply no lens 3.
3. **`/superdev:implement` dispatches no `simplicity-reviewer`.** `/superdev:review` still dispatches it over a whole
   scope or an ad-hoc range.

## Considered options

- **Leave the dispatch decision to the controller.** Rejected: a controller that reviews its own work inline is
  anchored on it, and the run's gates would vary from run to run.
- **Keep two dispatches and shorten them.** Rejected: the second dispatch's fixed cost is the prompt, the diff read,
  and the latency, which shortening does not remove.

## Consequences

A full-tier run makes one review dispatch per `behavior` slice's first review in place of two. The over-engineering
lens runs on `opus` inside `slice-reviewer` rather than on `sonnet`, and one reviewer holds correctness and complexity
in one pass, so the two lenses can compete for its attention.
