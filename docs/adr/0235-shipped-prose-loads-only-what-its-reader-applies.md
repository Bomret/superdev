# 0235: Shipped prose loads only what its reader applies

**Status:** Accepted

**Amended by:** [ADR 0239](0239-the-store-document-holds-only-the-calls-every-command-makes.md), which splits the
slice-store configuration into a store document every command reads and a plan document only `/superdev:plan` reads,
and trims `fail-to-pass.md` to its rules.

## Context

Every chain command and every subagent dispatch reads its references whole, because the Read tool returns a whole
file. An audit of the shipped prose (1.1 MB) measured what each reader loads:

- `review-checklist.md` (39 KB) was read whole by `slice-reviewer` and `final-reviewer` on every dispatch, and by the
  test auditors. Each reader applies only some of its sections. The fail-to-pass grading rules stood in it and,
  in part, again in `agents/implementer.md`.
- `plan-contract.md` (54 KB) was read whole by implement, review, status, and other runtime readers. Most of them
  use its slice schema or one record shape, and only `/superdev:plan` uses its authoring rules.
- `response-shapes.md`'s `## The offer` (8 KB) and `scope-findings.md`'s `## Degraded passes` and `## Deferred
  findings` (19 KB) were loaded by most chain commands and carried rationale and edge-case narration beside their
  rules.
- Shipped prose carried 903 `ADR` and 276 `INV-` citations. No ADR ships with the plugin, so a model running a
  command cannot follow one.

## Decision

1. **A reference holds what its readers share.** `review-checklist.md` keeps the binding rules, anti-patterns, and
   vulnerability classes. Each section only some readers apply lives in a file of its own under
   `plugin/references/`, and each reader names the files it applies. The fail-to-pass grading rules live once, in
   `fail-to-pass.md`. The prompt-concept lens loads only where the repository's `CONTEXT.md` carries a
   **Prompt concept** entry.
2. **Plan-time rules leave the runtime contract.** `plan-contract.md` keeps the slice schema, lifecycle, scope
   anchor, release, and run-state rules. `plan-authoring.md` holds the rules only `/superdev:plan` applies, and
   `store-records.md` holds the triage-record and intent-record shapes.
3. **Always-loaded sections state rules, not their history.** The offer, degraded-pass, and deferred-finding
   sections keep every rule and drop rationale. Legacy handling for repositories configured by older superdev
   versions is removed, under the rule that superdev makes no compatibility promise before 1.0.0.
4. **Shipped prose carries no parenthetical ADR or invariant citation.** The ADRs and the invariant register keep
   the reasons, and `AGENTS.md` files and ADRs keep their citations.

## Considered options

- **Tell readers to read a section at an offset.** Rejected: nothing enforces it, and a model that reads the whole
  file pays the full cost.
- **Move the agents' shared boilerplate into one shared reference.** Rejected: every agent would read the shared file
  on every dispatch, so the tokens loaded stay the same.

## Consequences

A slice review loads about 43 KB in place of 55 KB, an ad-hoc final review about 35 KB in place of 61 KB, and a
runtime reader of `plan-contract.md` 27 KB in place of 54 KB. `/superdev:plan` loads the three plan files, about as
much as before. A maintainer tracing a shipped rule to its decision searches `docs/adr/` for the rule's subject
instead of following an inline citation.
