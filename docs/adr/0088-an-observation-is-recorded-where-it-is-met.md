# 0088: An observation is recorded where it is met

**Status:** Accepted

**Amended by:** [ADR 0121](0121-a-run-resolves-a-deferred-finding-it-later-fixes.md), which lets a run
resolve a deferred finding it later fixes, so a `Deferred:` entry is no longer permanent.

**Amended by:** [ADR 0145](0145-a-triage-write-comments-on-a-matching-open-record.md), which has the
capture comment on a matching open record instead of writing nothing.

**Context.** A run meets defects that no slice covers. `/superdev:review` has a path for a finding whose
remedy adds a capability the Definition of Done never named: it writes a triage record and a `Deferred:`
ledger bullet (ADR 0035). That path fires only on a finding the reviewer reports, and
`agents/final-reviewer.md` reviews exactly the range its dispatch names. A defect the scope did not cause,
met in the course of the work, is outside that range. The reviewer declines it correctly — a finding
carries a severity, a severity implies a gate, and gating a merge on a pre-existing defect in untouched
code is wrong.

Observed on one run. A network-dependent assertion took 118,965 ms to fail. Two implementers reported it,
the controller met it itself through the green-gate hook on a merge, the controller reported it to its
operator, and the operator reported it onward. The information existed four times over. It reached a
record only because a human filed one by hand. Nothing in plan, implement, review, document, or ship
classifies "I met a real defect that is not this scope's work" as anything at all.

The controller is where the information first lands: it reads every subagent report, it runs the merges,
and it holds every slice's specification, so it is the only participant that can answer whether a slice
covers the thing it just met.

**Decision.** The controller writes a triage record for an observation no slice covers, at the moment it
meets it.

- **At the moment it is met**, never at a handoff. A run that blocks at the cap, a run that is abandoned,
  and an observation met after the last handoff are all covered by the same rule, rather than by three
  rules that each name a lifecycle point.
- **The triage record is the only artifact.** No ledger line and no pull-request heading. The record
  already carries the finding, the conditions, the date, the feature label, the scope branch, the anchor,
  and a copy-pasteable `/superdev:plan` line, and it outlives the run.
- **An observation is not a finding.** It carries no severity, holds no stage, and enters no fix loop.
- **Capture reads before it writes.** The store's open triage records are read first, and a defect already
  recorded is not recorded again. The comparison is a judgment about two prose descriptions, so the
  mechanism is the contract and the judgment is stated where the reader applies it.
- **Capture blocks no run.** A store that defines no triage-record section names no create call. An
  observation met there is reported to the operator once and dropped, never recorded. A create that
  fails or is denied, and a read that fails or is denied, are each reported once and the run continues.
  A failed or denied read still writes the possible duplicate, because a second record is noise a human
  deletes. A dropped observation is the failure this decision exists to prevent.

**Considered options.**

- **A run-level register** — one more ledger line beside `Degraded:`, `Unresolved:` and `Deferred:`,
  carrying anything the run surfaced that no contract assigned. Rejected: a logged default converts
  silence into an artifact that reads like a decision somebody weighed, which is worse than silence.
  `deferred add` has no `clear` counterpart, so an entry is permanent, and a line that is usually
  non-empty trains readers to skip the block that currently works.
- **Reusing the `Deferred:` bullet as the carrier.** Rejected: `skills/ship/SKILL.md` copies those bullets
  into the pull-request body under `## Deferred to a plan`, a heading whose job is to say this feature
  chose not to build this. A defect the scope never touched, filed there, reads as a weighed decision.
- **Reviewer-side capture**, shaped like `### Ceiling` — advisory, non-gating, outside the severity
  ladder. Rejected as the right shape at the wrong hop: a reviewer judges only the range it was handed and
  cannot answer whether a slice covers the thing, while the controller holds every slice's specification
  and met the observation before any review existed. `### Ceiling` remains the precedent if controller-side
  capture proves insufficient.
- **A configurable escalation address**, defaulting to the human with a session as the unattended
  stand-in. Rejected: it answers who to tell and leaves what counts as unowned open, which is the half
  that matters. Cheap routing is what stops rules from being written — every decision that acquires an
  address stops being a candidate for a default.

**Consequences.** Capture costs a store read and a store write per observation, both best-effort, on a
path that previously cost nothing because it dropped the information. A controller that meets the same
repository-wide defect in every scope of an unattended sweep writes one record per scope unless the read
compares across scopes, which the store's own triage listing supports. The judgment about sameness stays
with the controller and is not checkable by any test, so the mechanism is what a Definition of Done can
state and the judgment is not.
