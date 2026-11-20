# 0267: The simplicity review reads prompt prose

**Status:** Accepted

## Context

`/superdev:review`'s skip rules skipped `simplicity-reviewer` on a diff with "nothing plausible to cut", and named a
docs-only diff as the first case. A diff to a skill, an agent body, or a reference is Markdown, so the controller
read it as docs-only. That prose is the instruction set a model loads on every run, and a rule it states twice or a
branch for a case that never occurs costs context each time.

A trial on 2026-11-20 dispatched `simplicity-reviewer` by hand on two prose-heavy commits. On `aa31e1ec`, a rewrite
of `references/design-sketch.md`, five of nine findings were rules the file states twice or a rule for a reader who
never loads it. On `32daaefc`, three of its prose findings were real restatements, one of them a dispatch sentence
that repeats its agent body's contract unchanged. One other would cut a pattern every agent body shares, and the
warranted-cut rule declines it.

## Decision

- The skip covers a diff that changes only human-facing docs (a README, an ADR, a glossary), and a diff already
  lean.
- **Prompt prose** (`CONTEXT.md`) counts as code for the skip rules, so a diff that changes it is never docs-only.
  The tiny-diff and already-lean skips still apply to it.
- `references/simplicity-lens.md` applies its tags to prose. A dispatch sentence that repeats its agent body's
  contract unchanged is a duplicate, the same pair `references/prompt-concept-overlap.md` grades as an overlap. One
  that adds a condition, an exception, or a different effect is not.

## Consequences

- A review of a prose-only diff to a governed file costs one more `sonnet` dispatch.
- Cuts that break a documented house pattern still reach the report as declined cuts, by the warranted-cut rule.
- The trial measured two commits. Nothing measures whether the findings keep that rate.
