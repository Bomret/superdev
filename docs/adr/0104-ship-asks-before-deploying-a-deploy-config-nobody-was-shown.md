# 0104: Ship asks before it deploys a deploy config nobody was shown

**Status:** Accepted

**Amends:** [ADR 0101](0101-ship-applies-the-deploy-posture-after-the-merge.md)

**Context.** Under the `auto` posture, `/superdev:ship` runs each listed target's command at the host's
merge commit (ADR 0101). Calling ship is the consent to exactly those commands, so its gate prints every
change to `docs/agents/deployment.md` before anything merges. The gate reads the document at the tested
head. The host's squash merge applies onto the base as it stands at merge time. When another merge changes
`docs/agents/deployment.md` on the base in between, the merge commit carries a document the gate never
printed, and ship runs its commands. An adopted hand merge has the same gap in a wider form: ship's gate
never ran, so nothing printed the pull request's own change to the document either.

**Decision.** Under `auto`, after the merge and before the first target runs, ship compares the merge
commit's `docs/agents/deployment.md` with the tested head's. A document present on one side only reads as
posture `none` on the other, and counts as a difference. When this invocation did not run its own
pre-merge gate (an adopted hand merge, or a resumed deploy), ship also takes the pull request's own change
to the document. Either one non-empty → ship prints the changed posture and target lines and asks once
whether to deploy.

- **Confirmed** → the deploy runs as ADR 0101 states.
- **Declined** → nothing deploys. Each listed target with no deploy record yet is recorded `pending`, so
  the run stays in ship's resume set. The anchor stays open, the cleanup is skipped, and ship prints
  `/superdev:ship <scope>` as the resume. The resume asks again.

No difference, or a posture other than `auto`, asks nothing. Under `manual` the printed command is the
whole deploy step, so there is nothing to consent to in advance.

This amends ADR 0101's rejected option *Under `manual`, ask once whether the deploy happened*, whose
reason stated that ship asks no second question. Ship asks one here, under `auto` only, and only for a
document nobody was shown.

**Why.** The consent that calling ship gives covers the commands its gate printed. A command from a
document nobody printed has no consent behind it, and under `auto` it runs against a live system. Ship has
no unattended mode (ADR 0096), so a human is present to answer. Recording `pending` on a decline keeps the
resume reachable: with no deploy record, a later ship reads the run as finished and reports "already
shipped".

**Considered options.**

- *Stop with no ask, and leave the deploy to the operator.* It adds no prompt after the merge. The resume
  would compare the same two documents and stop again, so the run could finish only by hand, through
  `scope.js deploy set`.
- *Print the difference and continue.* It adds no stop. The operator sees the new commands only as they
  run, so the consent gap stays open.
- *Compare only the merge commit with the tested head on an adopted hand merge.* One rule for every path.
  A hand-merged pull request that changes a deploy command would still run it unshown.
