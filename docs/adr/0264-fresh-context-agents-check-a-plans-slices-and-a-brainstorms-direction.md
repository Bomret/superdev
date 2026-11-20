# 0264: Fresh-context agents check a plan's slices and a brainstorm's direction

**Status:** Accepted

## Context

`/superdev:plan` writes every slice's `spec` and `acceptance` in the same conversation that settled the design. The
derive dispatch (ADR 0158) reads the intent before the Definition of Done exists, so nothing reads the written slices
without the interview's context. A slice that leaves an interface, behaviour a user observes, or the owner of a
shared file undecided reaches the implementer, who decides it, and a review cycle repairs the decision. The
`slice-reviewer` and `final-reviewer` read the diff, too late to change the slice.

`/superdev:brainstorm` runs inline. Its prior-art audit checks redundancy and prior rejection, and nothing outside
the conversation challenges the direction the operator leans toward. Plan's release-risk pass (ADR 0133) asks about
rollback and deploy-window compatibility only after the direction is chosen.

The elephant-goldfish model (google/elephant-goldfish-model) separates the agent that holds the context from
reviewers that read only the document and the code it names. Its reviewers open with a paraphrase of the document,
because a list of undefined terms misses a document whose terms are all defined and whose parts do not connect.

## Decision

`/superdev:plan` dispatches `slice-readiness-reviewer` after §3 and §4 have drafted every slice and before §5
presents the breakdown. The dispatch hands the paths of the Definition-of-Done draft and a slice draft, and no
interview text. The agent opens with a paraphrase of what the plan builds and how the existing system works per the
slices. It reports an open decision only where the decision changes what a slice's `acceptance` observes or what
another slice or a consumer relies on. A choice about how to build stays the implementer's, per
`plan-authoring.md`'s **Negotiable** rule. It also reports a named interface or file the code contradicts, an
`acceptance` line two readers would verify differently, and a slice that three or more other slices depend on, as a
split candidate. The controller settles every finding and shows the paraphrase and the settlement with the
breakdown, for one confirmation.

`/superdev:brainstorm` dispatches `intent-challenger` at §4 on the chosen direction, handing the intent file's path.
The agent opens with a paraphrase of the direction, then applies two lenses: a false compromise, a trade-off the
direction accepts as unavoidable where a known pattern removes it, and migration and rollback safety. A lens that
finds nothing says so in its own words, "No false compromise detected" or "No migration hazard detected".

A dispatch of either agent that ends without a result is retried once. A second failure is reported as `not run`
with its reason, and the controller does not apply the lens itself.

## Considered options

- **A readiness mode on `final-reviewer`.** It saves registering a new agent. Derive mode on the same agent must
  read no Definition of Done, and readiness must read it, so one file would carry two opposite read rules.
  Rejected.
- **The controller applies the lens inline when the dispatch fails, as derive does.** It saves a plan that goes
  unchecked. The controller wrote the slices, so its own check carries the author's context the agent exists to
  exclude, and a self-check that reads as a fresh one hides that. Rejected.
- **Report every implementer choice, as the elephant-goldfish readiness reviewer does.** It contradicts the
  **Negotiable** rule: a slice states outcomes and leaves the how to the implementer. Rejected.
- **Run the readiness check after the operator approves the breakdown.** A settled finding then changes an approved
  slice, and the operator approves twice. Rejected.

## Consequences

Every plan pays one more agent dispatch before the breakdown, and every brainstorm one at §4. A plan whose readiness
dispatch fails twice proceeds with the check named `not run` in the breakdown. Triage record #163's split-candidate
hint lives in the readiness agent's lens rather than in a separate plan step.
