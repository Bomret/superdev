# 0083: A shipped scope takes no append

**Status:** Accepted

**Amends:** [ADR 0028](0028-the-scope-branch-is-cut-once-and-reused-losslessly.md), and
[ADR 0004](0004-plan-append-semantics.md), whose Decision lets `/superdev:plan` append to any
existing feature, and whose immutability rule protects merged slice records alone.

**Amended by:** [ADR 0124](0124-a-failed-verification-is-repaired-by-its-own-fix-feature.md), which points a
shipped feature holding a criterion observed false at `/superdev:plan`'s repair choice instead of the
`**Blocked by feature:**` remedy below, and adds the anchor's `## Run state` snapshot stage as a third
signal, which alone shows a feature shipped on another machine.
**Amends:** [ADR 0004](0004-plan-append-semantics.md), whose Decision lets `/superdev:plan` append to any
existing feature, and whose immutability rule protects merged slice records alone.

**Context.** ADR 0004 made re-running `/superdev:plan` on an existing feature an append, and fixed what
an append may never touch: a merged slice's own record. Two other records a run keeps fall outside that
protection, and a feature that has already shipped is where both go wrong.

`scope.js init` rotates a finished `ledger.md` aside and writes a fresh one, so the completed run's
slices, ranges, and statuses survive intact. `dod.md` and `interfaces.md` have no rotation. The refresh
that would cover them is `references/run-init.md`'s adopt branch, which is entered only when the anchor's
snapshot stage is **not** `shipped`. One stage value therefore sends the ledger to rotation and sends the
Definition of Done to a path that keeps whatever sits on disk.

Observed on `adjutant`, 2026-09-21: a follow-up planned against epic #10 a few hours after that epic's
pull request merged. The rotated `ledger-shipped-2026-09-21T124235.md` sat beside a fresh `ledger.md` at
stage `planned`, while a single `dod.md` still held the previous run's Definition of Done, every box
ticked and none of the new criteria present. The session regenerated it by hand. Nothing in the machinery
reported the staleness.

The anchor's own Definition-of-Done checklist takes the same damage, and keeps it. An append amends that
checklist in place, so ticked criteria from the shipped run sit beside new unticked ones in an issue body.
`hooks/scope-prune.js` reaps the run root after its TTL, which removes the local half of the mixture and
leaves the anchor's half standing.

The `released` label survives an append too. Anchor #10 carried `released` alongside its new slices, which
inherit a decision made about work that did not exist when it was made. `/superdev:afk` selects on that
label, so an unattended sweep can pick up slices nobody released.

**Decision.** A feature whose anchor has shipped takes no append. `/superdev:plan`'s own extend path
refuses, and names the remedy: plan the follow-up as a new feature carrying `**Blocked by feature:**
#<anchor>`. A `planned` run root, cut but never started, is unchanged: appending there revises the plan
before anything started. A run root from `implementing` through `documented` refuses too — that chain
ends at `shipped`, which the rule above already refuses, so waiting clears nothing and the remedy is the
same new feature, opened now rather than waited for.

The gate reads two signals, and either one refuses: the run root's ledger stage, where a run root still
exists, and the scope anchor's status through the store document's own status map. Neither alone is
enough. A reaped run root leaves no ledger, and that is exactly when the anchor's checklist is the only
mixed record left. `/superdev:ship`'s anchor close is best-effort, so a failed close leaves the anchor
open while the ledger reads `shipped`. Each signal covers the other's gap, and both are contracts every
store document already carries.

`scope.js init` is not the gate. It receives a ledger stage and an envelope, and cannot tell an append
from a new feature reusing a retired label. Only `/superdev:plan` knows, because only it asked new versus
extend.

Closing this path makes the **`appended` run kind** unreachable. It is entered when `/superdev:implement`
finds a `shipped` ledger, and only an append produces one: a new feature reusing a retired label rotates
at plan time and leaves `planned`, which reads as `resumed`. The run kind retires with this decision,
across `references/scope-mode.md`, `references/run-init.md`, both execution playbooks, and
`references/plan-contract.md`. `scope.js`'s `rotateShippedLedger` stays, because that label-reuse path
still needs it.

A separate anchor loses nothing. `**Blocked by feature:** #<n>` already expresses that one feature follows
another, with provenance, and `/superdev:afk` already resolves it. Grouping follow-up work under the
original issue number buys a shared identifier and costs both protections above.

**Why.** The boundary is one stage comparison, which makes it checkable rather than a matter of care. The
alternative keeps the case legal and seals it after the fact, which leaves the judgment in place every
time somebody appends.

Rotation also cannot reach the anchor's checklist, the one mixed record that outlives the reap. A remedy
that fixes the two local files and leaves the durable one mixed answers the smaller half of the problem.

**Considered options.**
- *Rotate `dod.md` and `interfaces.md` the way the ledger already rotates.* Each append seals the previous
  Definition of Done beside the new one, reusing a mechanism that exists and forbidding nothing. Rejected:
  it seals the local copies and leaves the anchor's checklist mixed, and it keeps a case whose correctness
  depends on care at every future append.
- *Forbid the append and rotate anyway.* Rejected: the gate makes rotation's main case unreachable, so it
  builds machinery for the residue.
- *Put the refusal in `scope.js init`.* Rejected on evidence: `init` cannot distinguish an append from a
  label reuse, so the refusal would fire on both.
- *Key the gate on the anchor's status alone.* Rejected: `/superdev:ship`'s close is best-effort, so a
  failed close leaves a shipped feature appendable with nothing to catch it.
- *Declare a `## Shipped` contract in every store seed.* Rejected: the status map already answers the
  question, and a new seed section makes every consumer repository's store document stale until it is
  re-seeded.
- *Treat the reopened anchor as the defect.* Rejected, and checked against the store rather than assumed:
  anchor #10 is open and carries `in-progress`, which is the correct handling of a feature with work in
  flight.
- *Survey the run roots that already hold a mixed `dod.md`.* Rejected: the shape is detectable from a
  rotated ledger sibling, and the category goes permanently empty once this gate lands.

**Consequences.** Follow-up work on a shipped feature gets its own scope anchor and its own issue number.
A reader tracing the history of one feature follows the `**Blocked by feature:**` chain rather than one
issue.

A feature whose anchor a human closed by hand, without shipping, refuses an append. Refusing is the safe
direction, and the refusal names the remedy.

Run roots that already hold a mixed `dod.md` stay as they are. The local half expires with the reap, and
rewriting history is not this decision's job.
