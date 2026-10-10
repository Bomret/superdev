# 0084: Verifying a Definition-of-Done criterion observes only

**Status:** Accepted

**Amended by:** [ADR 0133](0133-every-plan-carries-release-risk-criteria.md), which narrows the planning
side below: `/superdev:plan`'s offer to keep a criterion verifiable only on a live system out of the
branch-verifiable set does not apply to a `Release risk:` criterion, which stays in the Definition of Done
unticked until `/superdev:verify-ship` observes it.

**Context.** A `dod.md` criterion is prose an agent reads as an instruction. `/superdev:ship` §4 tells the
agent to confirm every item itself and treats an earlier review as evidence rather than a substitute. That
paragraph states no ceiling on what the agent may *do* to make an item verifiable, and §4 runs before §5's
push and pull request. `agents/final-reviewer.md` reviews the same criteria against the scope branch, and
`agents/implementer.md` works to a slice's `acceptance`, under the same silence.

Observed on one run, in an infrastructure repository:

```
- [ ] After a converge the hypervisor holds a global IPv6 address on vmbr0 and an IPv6 default route.
- [ ] /etc/resolv.conf on the hypervisor lists 192.168.178.1, 2620:fe::fe and 9.9.9.9, in that order
```

Both criteria are exactly what `references/plan-contract.md` asks for — observable, non-gameable,
user-facing behaviour. Both are unverifiable without deploying. The agent ran `ansible-playbook site.yml
--limit pve` from the scope worktree to tick them, before the pull request existed. Production ran unmerged
branch code across implement, review, and ship. That run merged cleanly, so nothing diverged; a rejected
pull request would have left the host on an orphaned branch state with nothing in the chain noticing.
`/superdev:afk` drives this chain unattended.

Because §4 precedes §5, there is no ordering in which a live-system criterion gets verified after merge.
The rule that makes a Definition of Done honest is the rule that makes it require a deploy.

Two criteria of the same run named a verification command (`` `./test/run.sh` is green. ``), which made
ship run the whole suite that `/superdev:review` had already run as its entry and exit gate (ADR 0025,
ADR 0075) — three full-suite runs in one chain. Ship's own prose names no test command. The command came
from the Definition of Done, which came from the plan interview.

**Decision.** Verification observes. It changes no system outside the repository.

The rule is stated once, in `references/scope-mode.md`, which every chain surface already reads, and is
carried on both halves of every surface that verifies a criterion: `agents/final-reviewer.md` and
`agents/implementer.md` in their own bodies, and the prose that dispatches each of them —
`skills/review/SKILL.md`, `skills/implement/SKILL.md`, and `references/run-handoff.md`, which dispatches an
implementer on a red full suite outside `skills/implement/SKILL.md` entirely. `/superdev:ship` §4 carries
its own sentence beside them, because it is the acute site and because "verify the items yourself" is the
instruction the ceiling bounds.

An item needing a deploy, a migration, or any other outward-facing change to verify stays unticked, with a
note. The operator verifies it after merge.

Two rules follow it, on the planning side. A Definition-of-Done criterion states a requirement, never a
procedure superdev executes, so it names no command superdev runs to verify it. The `Reachable:` criterion
is the standing exception and keeps naming a command, because it names the entrance a user reaches the
feature through, never a verification step (ADR 0062). And `/superdev:plan`'s interview surfaces a criterion
verifiable only on a live system, names the pre-merge deploy it would force, and offers to keep it out of
the branch-verifiable set.

`/superdev:ship` ticks a criterion naming the test suite from the run's own recorded result rather than
running a suite: the ledger's stage, read together with the degrade record, is what says a full suite ran
green on this scope branch.

**Considered options.**

- **A native branch-verifiable / post-deploy split in the Definition-of-Done format.** Structural rather
  than per-run judgment, and the heavier change. Held until ship's ceiling and plan's interview flag prove
  insufficient.
- **The ceiling in `/superdev:ship` §4 alone.** The observed run deployed during implement and review as
  well, driven by the same criteria, so a rule written only into ship leaves the two paths that fired most
  often open.
- **Ban every command from the Definition of Done.** It deletes the `Reachable:` criterion, which names an
  entrance by design. The cut is between an entrance and a verification step, not between prose and
  commands.
- **A recorded suite result in the ledger, as a new field and a new `scope.js` verb.** The ledger's stage
  and degrade record already answer the question, so the field would restate state the run already holds.

**Consequences.** A Definition of Done describes the feature and no longer drives the chain. A criterion
that needs a live system reaches the operator as an explicit unticked item with its reason, in the local
copy and in the pull-request body, rather than as a deploy nobody asked for. Ship runs no suite, which
removes the third full-suite run from a chain ADR 0025 meant to carry one.

A criterion that is genuinely unverifiable before merge now always arrives unticked, so a pull request can
carry unticked criteria as its normal state. A reader who treats an unticked box as a failure reads that
wrongly; the note beside it is what distinguishes the two.
