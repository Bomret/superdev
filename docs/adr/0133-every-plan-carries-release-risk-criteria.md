# 0133: Every plan carries release-risk criteria

**Status:** Accepted

**Context.** An adopter takes a production feature through `/superdev:plan`, `/superdev:implement`,
`/superdev:review`, and `/superdev:ship`, and nothing in that chain asks about the risk of releasing it.
The reviewers catch code smells, test smells, and the vulnerability classes in `review-checklist.md`.
Nobody asks whether the release can be undone, whether the previous release keeps working against changed
data while the deploy runs, whether a changed name or format breaks a consumer the merge does not update,
or whether a failure on a new production path reaches the operator.

The only coverage is one clause in `final-reviewer.md`'s Correctness axis, "backward compatibility /
migration handled if a schema changed". `deployment.md` gives each target a deploy command and a read-only
reach, and no undo. ADR 0033's expand–contract covers call sites inside the repository, not two releases
running side by side against shared data. The ideas come from addyosmani/agent-skills (MIT), whose
`shipping-and-launch`, `deprecation-and-migration`, `api-and-interface-design`, and
`observability-and-instrumentation` skills carry them.

**Decision.** `/superdev:plan` runs a release-risk step after the deploy question. It covers four
categories:

1. **Rollback path.** It applies to every deploying feature.
2. **Deploy-window data compatibility.** It applies to a deploying feature that changes persisted data or
   its schema.
3. **Consumer compatibility.** It applies to a feature that changes a name, format, or behaviour whose
   consumer the same merge does not update: an external user, another repository, data an older release
   wrote, or a separately installed component of the same repository. It applies under any posture.
4. **Production visibility.** It applies to a deploying feature that adds a production path.

Each category is named in exactly one place in the Definition of Done. It is either its own criterion led
by `Release risk:`, or part of one `Release risk: none — <category>: <reason>; …` line naming every
category that does not apply. The step fires on every plan and every change type, as `Reachable:` does
(ADR 0062). An append adds its own lines for the extension, and a repair `fix` feature answers for its own
change.

Rollback, deploy-window data compatibility, and production visibility are the deploy-dependent categories.
They apply to a deploying feature: one that lists a recorded deploy target, or, in a repository with no
recorded posture, one that reaches a running production system. A recorded posture with no deploy target
on the feature answers them `none` without a question. A repository with no recorded posture gets one
question per plan, whether the feature reaches a running production system. Plan answers each category from the code where it can, and asks only what the code
cannot answer.

The step emits Definition-of-Done criteria only. It adds no review lens, no agent, and no runtime command.
A rollback criterion states a requirement the change meets (INV-0008). `/superdev:ship` and
`/superdev:verify-ship` run no undo (INV-0006, INV-0098, ADR 0106).

**Why.** The Definition of Done is where a feature's decisions are pinned, and `final-reviewer` and the
tick machinery already judge every line of it. A release-risk decision is about intent: who consumes a
surface and how the release is undone. A reviewer reading the diff cannot know either. A uniform,
prefixed criterion leaves an artifact whose absence a second reader can see, which a pass that fires on
plan's judgment does not.

**Considered options.**
- *Review lenses only*, new `review-checklist.md` entries such as Breaking interface change.
  Rejected: a reviewer cannot judge rollback or consumers without the intent, it finds the problem after
  the code exists, and ADR 0118 measured that extra lenses can lower a reviewer's catch.
- *Triggered firing*, a line only where plan judges a category applies. Rejected: a skipped pass then
  reads exactly like "nothing applied".
- *A token per category* (`Rollback:`, `Visible:`, and so on). Rejected: four drift pin pairs and up to
  four `none` lines per feature, for a category a line's prose already names.
- *Consumers outside the repository only.* Rejected: it misses a separately installed component of the
  same repository, the cross-process case ADR 0062 says `Reachable:` cannot see.
- *Key the deploy-dependent categories off the deploy line alone.* Rejected: a repository that never
  recorded a posture reads as `none`, and it misses an adopter who deploys outside superdev.
- *A rollback column in `deployment.md`, run by `/superdev:ship` or `/superdev:verify-ship`.* Rejected: it
  adds an outward-facing action, and ADR 0124 repairs a failed verification forward.
- *Port the agent-skills skills into superdev.* Rejected: an adopter can install them beside superdev, the
  namespaced commands do not collide, and a port duplicates content superdev would then maintain.
- *A standing Definition-of-Done file.* Rejected: `docs/invariants.md`, which `final-reviewer` checks,
  already holds a repository-wide rule with its check.
- *Accessibility as a fifth category.* Deferred: its criterion is mostly verifiable only by running the
  UI, which the branch reviewers cannot do, and it is UI quality, not release risk.

**Consequences.** Every plan writes at least one more Definition-of-Done line. On a repository with posture
`none` and no consumed surface changed, that line is one `none` line. An adopter with no recorded posture
answers one more question per plan, until `/superdev:setup` records a posture. `final-reviewer`'s
Correctness clause stays, because ad-hoc `/superdev:review` has no Definition of Done and the clause is its
only compatibility lens. Plans written before this decision carry no `Release risk:` line, and nothing
flags them. A `Release risk:` criterion that only a deployed system can show stays in the Definition of
Done, unticked, until `/superdev:verify-ship` observes it (INV-0006). Plan's offer to move a criterion
verifiable only on a live system out of the Definition of Done (ADR 0084) does not apply to it. This
narrows ADR 0084's planning side.
