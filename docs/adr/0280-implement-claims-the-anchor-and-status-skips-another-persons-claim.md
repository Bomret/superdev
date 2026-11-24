# 0280: Implement claims the anchor, and status skips another person's claim

**Status:** Accepted

**Context.** Two people can implement one feature twice: `/superdev:status` recommends `/superdev:implement` for any
`ready` anchor, and `/superdev:implement` starts a run on any anchor, neither reading who it is assigned to.
`/superdev:plan` assigns the epic and every slice to the planner at creation, so the assignee names the planner, not
whoever implements, and an anchor planned with `"assignee": "none"` names nobody.

**Decision.** The anchor's assignee is the **Claim**. `/superdev:status` puts an anchor claimed by someone else in a
`claimed` bucket that is never the recommended move. `/superdev:implement`, before it creates or adopts a run, stops
on an anchor claimed by someone else and asks, blocking under `--unattended`; otherwise, or on a yes, it replaces
the assignees of the anchor and every open slice beneath it with the operator. A store document lacking the calls
this needs skips the check and the claim with a gap line naming the `/superdev:setup` re-run.

**Considered options.**

- **Read-only: implement asks, writes nothing.** Rejected: an unassigned anchor stays open to two starts, and a
  planner's assignment never changes to show who implements.
- **Claim the anchor only.** Rejected: plan assigns every slice too, so the host's per-person views would keep
  showing the planner on the slices.
- **Status only.** Rejected: `/superdev:implement <feature-label>` is reachable without running status first.

**Consequences.** `/superdev:implement` writes to the slice store's assignees, which it never did before. Two
operators starting the same unassigned anchor within the same moment can both claim it; the claim narrows that race
to the seconds between the read and the write, and nothing closes it.
