# 0101: Ship applies the repository's deploy posture after the merge

**Status:** Accepted

**Amended by:** [ADR 0104](0104-ship-asks-before-deploying-a-deploy-config-nobody-was-shown.md),
which adds one question under `auto`: ship asks before it deploys a `docs/agents/deployment.md` nobody
was shown.

**Context.** `/superdev:ship` merges the pull request, pinned to the tested head (ADR 0096). Nothing in
superdev deploys the merged commit. In a repository whose features only prove themselves once deployed,
such as infrastructure, services or releases, the deploy happened outside superdev or at the wrong point
in the chain. One run converged a live host during implementation, before ADR 0084 forbade it. The
deploy target differs per feature: `proxmox-homelab` has one `deploy:<target>` script per host. How far
superdev may deploy also differs per repository. A pure-software repository deploys nothing, and some
operators want superdev to run a deploy command while others only want to be told.

**Decision.** A repository states one **deploy posture** in `docs/agents/deployment.md`, which
`/superdev:setup` captures from a new seed: `none`, `manual`, or `auto`. Setup defaults to `manual` and
never to `auto`. The same document holds a table of **deploy targets**, each with its deploy command and
how to reach it read-only for verification. A repository without the document reads as `none`.

1. Under `manual` or `auto`, `/superdev:plan` asks what the feature deploys to, offering only the table's
   targets, and writes `**Deploy:** <target>[, <target>]` or `**Deploy:** none` on the scope anchor. The
   list order is the deploy order. Under `none` it asks nothing.
2. `/superdev:ship` reads the `**Deploy:**` line from the anchor when it runs. A listed target the table
   lacks refuses the merge before anything merges. An anchor with no `**Deploy:**` line deploys nothing,
   and ship says so.
3. After the merge, whether ship's own or an adopted hand merge, ship sets the stage to `shipped`, then
   applies the posture, then closes the anchor and cleans up. This amends ADR 0096's point 5, which
   closed the anchor right after the merge.
   - `none` deploys nothing.
   - `manual` prints each target's command and records the target as pending in the ledger. The close and
     the cleanup run.
   - `auto` detaches the scopetree at the host's merge commit and runs each target's command there, in
     listed order. It stops at the first non-zero exit and records that target and its exit in the ledger.
     The anchor stays open, the cleanup is skipped, and ship names the targets not yet deployed. Running
     ship again on that ledger resumes at the first target not yet deployed, then closes and cleans up.
4. `/superdev:afk` never reaches a deploy, because it ends at `/superdev:submit-pr` and ship has no
   unattended mode (INV-0093). No other command deploys (INV-0098). Ship never closes the anchor while an
   `auto` target is not deployed (INV-0099).

**Why.** One posture per repository keeps setup to one question, and a per-target override is additive
later. Reading the targets from the anchor at ship time keeps one source, which an operator may edit
between plan and ship. Deploying the merge commit in the scopetree deploys exactly what landed and never
touches the operator's checkout (ADR 0045). A failed deploy leaves ship's own job unfinished, so rerunning
ship finishes that job. It does not start a second one. Listed order with a stop at the first failure
never deploys a target whose prerequisite just failed. Under `manual`, ship's job ends at printing, so the
interim close runs. A later verification step reads the pending record and does not observe a system
nobody deployed. superdev's own repository states `none`: `bun run release` batches every merged feature,
so it is not a per-feature deploy.

A required host check, such as one that runs `bun run test` on the pull request, makes the host's
mergeable report a real gate. Ship already refuses when the host refuses. The deploy adds no check of its
own there.

**Considered options.**

- *A posture per target.* More flexible, but it adds a setup question per target, and ship would handle
  mixed postures within one anchor.
- *Derive the targets from the paths a feature changed.* A path map is one more thing to maintain, and it
  is ambiguous for shared roles.
- *Merge, close, then deploy* (ADR 0096's order, with the deploy appended). A failed deploy would leave a
  closed anchor over a system that never received the change.
- *Mirror the `**Deploy:**` line into the ledger at plan or run init.* A second copy goes stale when the
  anchor is edited.
- *Run the deploy in the invoking checkout after pulling base.* superdev never moves that checkout, and a
  dirty or switched checkout would deploy the wrong tree.
- *Continue past a failed target.* It can deploy a target whose prerequisite just failed.
- *Record a failed deploy as an `**Unresolved:**` entry and leave the rerun to the operator.* Nothing
  would close the anchor, and a later ship would report "already shipped".
- *Under `manual`, ask once whether the deploy happened.* Ship would block for the whole deploy, and
  calling ship is already the consent. It asks no second question.
- *Refuse an anchor with no `**Deploy:**` line under `manual` or `auto`.* Every anchor planned before this
  decision would need a hand edit before it could ship.
