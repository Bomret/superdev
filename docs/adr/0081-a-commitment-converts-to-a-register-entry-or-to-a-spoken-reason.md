# 0081: A commitment converts to a register entry or to a spoken reason

**Status:** Accepted

**Context.** A discovery settles commitments — the sentences that explain why a design is the shape it
is. They are captured today, in the intent's prose, and they still fail to reach the decisions later made
under them. The failure is not capture. A planning agent held an intent whose own section argued that a
tool's run log was the reason it was a binary rather than a `curl` invocation, restated that argument in
the same sentence that proposed cutting the log, and proposed the cut anyway. The commitment was read and
repeated back, and it lost, because a paragraph in an intent is weighed as one consideration among many.
The invariant register (ADR 0077) is the artifact `/superdev:plan` already judges a decomposition
against, and the sentence was never in it.

Nothing looked wrong either. The plan was complete and self-consistent, and the loss was caught only
because another session happened to still hold the reasoning.

A commitment does not look like an invariant until someone asks what rule it implies. "The record is why
this is a binary" is a rationale and belongs in no register; the rule under it — every call that reaches
the tool writes a record — is an invariant with a `Breaks: silently` and a test.

**Decision.** `/superdev:brainstorm` names a discovery's load-bearing commitments in the intent's
`## Load-bearing commitments` section, each one a prose pair: the principle, then the rule it implies.
The pairing is the test rather than a schema — a principle alone is cheap to invent under the pressure of
an empty field, and a principle carrying its implied rule is not. A discovery that settled none writes no
section and says so. Brainstorm acquires no durable output: the intent is git-ignored scratch, and the
section rides it.

`/superdev:plan` converts each commitment, whether it was handed one in a seeded intent or originated it
in its own interview, which is the more common source. The conversion lives once, in
`references/domain-modeling.md`, so both sources hit identical prose. It sorts on what the commitment
constrains:

- a rule about **how the work is done** — how acceptance criteria are written, what a review must cover
  — is an authoring rule, is out of scope, and is named out loud as unhandled;
- a rule about **the system the repository builds** that constrains a later decision becomes a register
  entry, its `Check:` naming the proof, or `Check: none` with the reason where nothing cheaply tests it;
- a commitment that constrains no later decision is a mood: it is named out loud with the reason, and
  nothing is written.

The third branch is guidance and not a check, and says so. One run cannot see its own sort rate; a plan
sorting every commitment there has certainly mis-sorted, and the rate across runs is a human's to read.

`/superdev:plan`'s delete-gate on a seeded intent covers commitments alongside `Rejected direction`: an
intent is deleted only once every commitment it carried has a durable home or a spoken reason.

**Why.** The register already judges decompositions, already carries `Check: none` for a rule nothing
cheaply tests, and is already audited by `/superdev:document` and `doc-reader`. The mechanism that would
have caught the lost commitment exists; no entry was ever written into it. So the change is a conversion
step and a hand-over, with no new artifact, no new check, and no new stage.

Sorting on *what the commitment constrains* rather than on *whether it implies a testable rule* is what
keeps the register honest in both directions. "This tool serves agents, not humans" binds a hundred
decisions and is no single testable rule; treating untestability as disqualifying would drop exactly the
commitments most worth keeping. `Check: none` already anticipated this.

The authoring-rule branch exists even though its destination is deferred. Without it the deferral
silently routes an authoring rule into the register instead of leaving it visibly unhandled, and this
repository makes that worse than average: superdev's system *is* the thing that writes criteria, so one
sentence reads as a system rule here and as a process rule everywhere else.

**Considered options.**

- *A persistent brain agent the later stages query.* Either a session kept alive, whose context is
  summarized until it answers from something no better than the artifact, or a fresh agent primed with
  the artifact, which can say nothing the artifact does not. It also makes the written record worse: an
  oracle that can always be asked removes the reason to write anything down, and the oracle is mortal. It
  serializes against parallel slicetrees.
- *Cross-session consultation as a mechanism.* It worked in the case that produced this record because a
  long session happened to still be open. A plugin cannot provision that, an `AskUserQuestion` prompt
  cannot be answered by a peer, and permission modes gate delivery. Useful when present, never
  dependable.
- *A pair-programming role in `/superdev:implement`.* Two agents building one scope and consulting each
  other — distinct from the brain agent, and rejected on a count rather than on theory. Five
  consultations happened across eight slices. Four were findings the slice reviewers and the controller's
  own cross-slice reading already produce, and one duplicated an obligation `doc-verification.md` already
  places on the `implementer`. The single new finding came from comparing a slice against the intent's
  success criteria — from an artifact, not from a second opinion. The consulting session also wrote no
  code and never entered the repository, so one party was inside a slice and the other across the set:
  attention pointed elsewhere is the active ingredient, and a reviewer already supplies it. ADR 0071
  forbids claiming a benefit nothing measures.
- *Moving the drift-style contradiction check to every stage boundary.* `/superdev:plan` judges against
  the register, `/superdev:implement` pre-flights for contradictions, `/superdev:document` audits the
  register. The boundaries were already watched, and were watching for the wrong thing because the
  register was empty.
- *A seventh prose field in the intent holding prose alone.* The sentence that failed was already prose
  in a section of its own. The pair is what distinguishes the new section from that field.
- *Routing an authoring rule to a destination in the consuming repository.* superdev's own authoring
  rules live in its `AGENTS.md` because superdev is a tool for writing criteria. A consuming repository
  building a product mostly produces commitments about that product, which is the register branch, and
  superdev can name no equivalent authoring-rules destination there. superdev's own case needs one
  hand-written sentence rather than a feature, so building the general destination now would invent a
  category before anyone had hand-rolled it twice.
- *Keeping the seeded intent instead of deleting it.* The deletion is deliberate and its gate works: a
  leftover scratch intent resurfaces as a stale option, and the gate refuses to drop anything without a
  durable home. The fix is to give commitments a home, not to keep the scratch file.

**Consequences.** A whole category of real commitment — the authoring rule — has no durable home in a
consuming repository, and the interview says so out loud rather than pretending otherwise. That is the
live cost of deferring the authoring half, and it is paid visibly.

The third sort branch has no floor that anything enforces. It is labelled guidance, and a register that
fills with ceremony, or a third branch that becomes a drain, is caught by a human reading several plans
and by nothing else.
