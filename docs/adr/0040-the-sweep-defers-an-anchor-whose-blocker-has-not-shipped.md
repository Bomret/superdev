# 0040: The sweep defers an anchor whose blocker has not shipped

**Status:** Superseded

**Superseded by:** [ADR 0108](0108-afk-is-removed.md), which removes the sweep and keeps the anchor dependency for `/superdev:backlog`.

**Amended by:** [ADR 0106](0106-verifying-and-closing-a-shipped-scope-are-separate-human-only-commands.md),
which satisfies a dependency only by the blocker's closed anchor, or by no such anchor existing.

## Context

`commands/afk.md` §2 takes eligible scope anchors in ascending issue number, on the stated grounds that
nothing models dependencies between features. Two features that collide are left to collide: the second
one hits a merge conflict, which blocks it, and a maintainer resolves it by hand in the morning.

That reasoning holds for features that merely touch the same files. It does not hold for a feature that
cannot be built at all until another has landed — a follow-up that extends a capability the first feature
introduces. Ascending issue number happens to order those correctly whenever the dependent plan was
written later, which is the common case, and silently wrong whenever it was not. The failure is expensive:
the sweep takes the dependent feature through the whole four-command chain, and it blocks or ships
something built against a capability that does not exist.

The relation itself already exists in every slice store. `plan-contract.md`'s `depends-on` is defined
between *slices* of one plan, and each store's `## Field mapping` states how it is recorded — a
`**Depends on:** #<n>` body line on Forgejo, the native `blocked_by` link on GitHub. Nothing writes or
reads that relation between two **scope anchors**.

The `blocked` label is not that relation. An anchor carrying it is ineligible until a human removes it,
which is correct for a feature that is stuck and wrong for one that is merely waiting its turn.

## Decision

**An anchor whose recorded dependency names an unshipped anchor is deferred for that sweep, and the
remaining anchors are taken in ascending issue number.** The deferral changes no label, touches no
consecutive-block count, and is named in the sweep's report with the anchor it waits on.

**A dependency is satisfied when the anchor it names is closed, or its scope's ledger stage reads
`shipped`.** Closing the anchor is best-effort in `/superdev:ship`, so closure alone would stall a
dependent forever on a feature that has in fact shipped. A dependency naming an anchor that does not
exist is satisfied too: there is nothing left to wait for.

**Reading an anchor's dependencies is backend mechanism.** Each store document's `## Scope anchor` section
states it, as a fifth element beside recognising an anchor, listing the candidates, listing the slices
beneath one, and telling an anchor that is itself a slice. The drift check that already asserts those four
asserts this one, so a backend cannot silently lose the feature.

**`/superdev:plan` records the dependency when its interview named a prerequisite feature**, and records
nothing otherwise. It asks no new question: a feature that cannot be built before another one comes up as
a constraint or it does not come up at all.

## Consequences

The sweep is order-correct rather than order-lucky, and it keeps no graph. Because afk drives one anchor
at a time to a pull request and re-reads the tracker every iteration, deferring an unsatisfied anchor
yields exactly the order a topological sort would, one pass later: the blocker ships, the next iteration
finds the dependent satisfied, and it runs.

Two conditions now wait on a human and are reported rather than silently retried forever: a dependency
cycle, where every anchor in it defers, and a dependency on an anchor the sweep itself skips (an
unreleased or malformed one). Both are visible in the report with what they need.

A dependency written between two anchors that could in fact run in either order serializes the sweep for
no reason. This is the same honesty cost `plan-contract.md` already states for slice-level `depends-on`,
and the same rule applies: record one only when the second feature cannot be built without the first.

## Considered options

**A topological sort over every candidate anchor.** Rejected as machinery with no buyer. It would let
independent features run in parallel, and afk is serial by construction — one anchor through the whole
chain, then the next. For a serial consumer the sort and the filter produce the same order.

**The `blocked` label, applied by hand.** Rejected: it does not clear itself when the blocker ships, so
every dependent needs a human twice — once to mark it and once to unmark it — which is the opposite of
what an unattended sweep is for.

**Leaving ascending issue number alone.** Rejected: it is correct only while every dependent plan is
written after the plan it depends on, and nothing enforces or even records that.
