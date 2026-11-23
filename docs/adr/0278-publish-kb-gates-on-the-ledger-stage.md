# 0278: publish-kb gates on the ledger stage

**Status:** Accepted

**Amends:** [ADR 0053](0053-containment-not-ancestry-decides-that-a-scope-branch-reached-base.md), whose
containment test `/superdev:publish-kb` no longer runs, and
[ADR 0191](0191-plan-stages-no-knowledge-base-page.md), whose Context names that containment test as the
publish's guard.

## Context

`/superdev:publish-kb` asked git whether a scope's work reached base before it sent the scope's staged pages. It
resolved the scope branch, read the base branch from `docs/agents/code-management.md`, and ran the containment test.
It refused with `— nothing published (pass --allow-unmerged to publish anyway)` on every verdict but contained, and
also when the branch and the run root were both gone.

On 2026-11-23, four publish runs across four repositories refused on states the chain had already settled, and each
was forced through with `--allow-unmerged`:

- Three read `no branch resolved`. Each ledger read `**Stage:** closed` with a merged `**PR:**`. The host had deleted
  the branch on merge, and `hooks/scope-prune.js` had not yet reaped the run root.
- One read `names no base branch`. The Base branch bullet carried the seed's own prose shape, which the parser
  rejected.

A refusal on a settled scope trains the operator to pass `--allow-unmerged` by reflex. The refusal that names
genuinely unmerged work then reads like the false ones.

## Decision

- **The gate reads the chain's own merge record.** `publish-kb` publishes a scope when its run root is gone, or when
  the ledger's `**Stage:**` reads exactly `shipped` or `closed`. `/superdev:ship` writes `shipped` only after the host
  reported the pull request merged, `/superdev:wrap-up` writes `closed` only from `shipped`, and `scope-prune` reaps a
  run root only at `closed`.
- **Everything else refuses.** Any other stage, a missing or unreadable ledger, or a ledger with no `**Stage:**` line
  refuses with the stage it read. Below `shipped`, the refusal names `/superdev:ship <scope>` first, whose hand-merge
  adopt writes `shipped`, and `--allow-unmerged` second.
- **The gate runs no git command and reads no `code-management.md`.** Branch resolution, the base-branch parse, and
  the containment test leave publish-kb's path.
- **`_adhoc` stays ungated.**

## Considered options

- *Keep containment, and add a stage fallback for a gone branch plus a lenient base-branch parse.* Rejected: it
  settles the observed cases but keeps branch resolution and base parsing, and a stale remote-tracking ref left after
  the host deleted the branch still resolves and still refuses a settled scope.
- *Git containment as a fallback below `shipped`.* Rejected: it recovers a hand merge nobody ran ship on, which ship's
  adopt already covers, at the cost of keeping all of the above on a cold path.
- *Demote containment to a warning.* Rejected: it removes the gate for genuinely unmerged work.
- *Ask the host whether the pull request merged.* Rejected: backend-specific, and the ledger already records it.
- *Have `scope-prune` leave a settled marker in a non-empty staging directory, so a gone run root counts only with
  it.* Rejected: new hook code and a carve-out for scopes reaped before it, to guard a run root removed by hand.

## Consequences

A scope the chain shipped or closed publishes without a flag, whatever its branch, its remote-tracking refs, or the
Base branch bullet read. A hand merge nobody ran ship on refuses until `/superdev:ship` adopts it. A run root removed by
hand while its branch is unmerged publishes silently: without its run root the run itself is already broken, and a
gone branch with a gone run root published silently before this decision too.

Two further cases publish without the flag and are accepted. A ledger an older superdev version left at `shipped`
records only an opened pull request, so a run root of that age whose pull request never merged publishes; superdev is
below 1.0.0 and carries no compatibility promise for such run roots. A scope whose work base later reverted still
reads `shipped` or `closed` and publishes; retracting a published page stays the operator's act
(`references/scope-branch.md`).
