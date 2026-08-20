# 0031: The lite tier writes its own documentation

**Status:** Accepted

**Context.** The implement chain ends with `/superdev:implement`, then `/superdev:review`, then `/superdev:document`, then
`/superdev:ship` (ADR 0013). On the `lite` tier the controller implements every slice itself, inline, in
one scope worktree, the deliberate exception ADR 0001 records, so it reaches the end of the run holding
the whole scope in its own context. `/superdev:document` then dispatches a cold `doc-writer` that rebuilds
that same scope from a diff, and a cold `doc-reader` after it. Two dispatches pay to reconstruct what
existed minutes earlier and was discarded. ADR 0003 settled **when** the reconcile runs relative to the
final review. It never asked **who** performs it.

**Decision.** On the `lite` tier the controller performs the documentation pass itself, as the last step of
its execution playbook, before run handoff, and records the pass in the ledger's `**Docs:**` line.
`/superdev:document` on a scope carrying that line dispatches no `doc-writer`: it dispatches `doc-reader`
alone, over the doc files the scope's own commits touched, and dispatches nothing at all when those
commits touched no doc file. A `doc-reader` finding still gets exactly one `doc-writer` fix round.
`/superdev:review` clears the line when its fix loop lands commits, because those commits made the pass
stale. The procedure both callers follow lives in `references/doc-pass.md`. The `full` tier is unchanged.

**Why.** Writing wants hot context and checking wants fresh eyes. The `lite` controller already holds the
scope, so a cold writer buys nothing there but the tokens to rebuild it. The `doc-reader`'s value is the
opposite property, that it never saw the work, so it stays. The `full` tier keeps its writer because its
implementers sit in isolated parallel worktrees while the controller merges serially: per-slice doc edits
would collide on shared doc files, which is the one conflict class with no mechanical resolution.

The pass runs before the review rather than after it, which does not reopen the race ADR 0003 closed. That
race was a `doc-writer` commit moving the scope tip while `final-reviewer` computed `BASE..HEAD` against
it. A pass that finishes before the review starts leaves the reviewer a stable diff that already contains
the documentation. ADR 0003's ordering continues to govern every `doc-writer` dispatch, which is now the
`full` tier's pass and either tier's fix round.

**Considered options.**

- *Per-slice doc edits inside the lite loop*. Rejected: a later slice supersedes an earlier slice's
  paragraph, so the churn `agents/implementer.md`'s ban prevents across a run returns inside one scope.
- *The pass moves into `agents/implementer.md` for both tiers*. Rejected: the `full` tier's parallel
  worktrees collide on shared doc files, and per-slice doc overhead multiplied by the slice count costs
  more than the single pass it replaces.
- *Infer the pass from the scope worktree instead of recording it*. Rejected: inference cannot separate
  "nothing needed documenting" from "the run ended before its doc step", so it must dispatch the writer on
  exactly the cheap scope this decision optimizes.
- *The knowledge-base pass stays with `doc-writer`*. Rejected: the writer is then dispatched on every
  `lite` scope anyway and most of the saving disappears.
- *The `doc-reader` alone covers a review fix loop's commits*. Rejected: a fix that needs a new paragraph
  is an absence, and a reader detects a false claim far more reliably than a missing one.

**Consequences.** A `lite` run reads the doc-pass procedure, the writing standard, and the content-type
lens in the controller's own context. `references/doc-pass.md` becomes the single statement of the pass, so
`agents/doc-writer.md` keeps only its agent framing, its bootstrap mode, and its report, and the four drift
contract tables that pinned the moved prose to that agent re-point at the reference. The ledger gains a
`**Docs:**` token header, owned by `scripts/scope.js` with the rest of the schema (ADR 0022). A scope whose
review lands fix commits pays the writer dispatch back, which is the price of never shipping documentation
that predates a fix. A `full` run never writes the line and behaves exactly as before.
`/superdev:status` reports nothing new: a completed pass is not a problem state, unlike a degraded pass or
an unresolved defect.
