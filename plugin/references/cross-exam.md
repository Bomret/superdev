# Interview discipline (cross-examination)

`/superdev:plan` runs its interview by this whole discipline. `/superdev:brainstorm` runs the core moves its opening
names, **Prototype what must be seen or run** among them, and stops at its own readiness test.

**The main event.** Applies to `/superdev:plan`'s interview. The interview is the main event, never a warm-up before
slicing or brief-writing. Keep going until the design tree is exhausted and you and the user share the same picture.
"Enough to start" is no stopping point.

## Core moves

**One question at a time.** Applies to every question you ask. Ask one and wait for its answer before you ask the next.
Never batch questions.

**A recommended answer every time.** Applies to every question, except the no-survivor case of **Offer only live
options**. State your best answer and its reasoning, so the user reacts to a concrete position: "I'd do X because Y —
agree?", never "how should we do X?".

- **A question that resolves to discrete options** → ask it through `AskUserQuestion`, never as options listed inline
  in prose. Mark the lean option `(Recommended)`, put the reasoning in that option's description, and never present a
  bare neutral list.
- **A genuinely open question with no option set** → ask it in prose.
- **A genuine toss-up** (two readings truly equal) → say so explicitly, and fabricate no preference.

**Offer only live options.** Applies to every question you compose. Before you ask it, vet every option by checking
each load-bearing claim it rests on: a claim about the repository by reading the repository, a claim about a third
party against its official docs (`references/doc-verification.md` owns what makes a claim load-bearing and how to
check it). **Offer at most two options.**

- **A check fails** → drop the option, and name it with the reason it failed.
- **A past reject** (an `.out-of-scope/` entry, an ADR's considered option, a non-goal) → no failed check, so it never alone drops
  the option. The option stays live while it clears the repository and third-party checks and names its saving. Its description cites the
  reject, its **Horizon**, and the goal it lost under, a reject with no horizon reading as `Deferred`. A `Rejected`
  one is the option the recommendation argues against, and the operator decides.
- **A claim you cannot check** → keep its option, labeled as an assumption.
- **The saving** → every option beside the recommended one states, in its description, what choosing it saves: time,
  scope size, risk, reversibility, a human check. An option that can name no saving is dropped. In a toss-up, each
  option states what it saves over the other.
- **Show the vetting before the question.** A short prose paragraph ahead of the `AskUserQuestion` call cites the
  evidence for each load-bearing claim (`file:line`, or a doc URL), carries every assumption label, and names every
  dropped option with its reason. The option descriptions stay short.
- **Exactly one survivor** → state it in one line with its reason ("fixing X in slice 2, because Y") and continue with
  the next question. The user can object in any later turn.
- **No survivor** → ask no option question: name each failed option with its reason, and put the decision to the user
  as an open question.
- **A fact that could not have been checked before the question** still reopens an answer: name the fact when it
  does.

**A required question.** Applies to a question a skill requires by name: a release, new, extend, or repair, the
feature to extend, the deploy target, where a found defect goes, a brainstorm draft choice, a setup choice,
submit-pr's ship question. It keeps its fixed option set, outside the two-option cap, and is asked every time.

- **An option in that set that can name no saving** → states why, and stays.

**Walk the design tree, branch by branch.** Applies to the order of your questions. Ask a decision that constrains
others first, and never ask a downstream question whose answer a still-open upstream decision would change. Finish a
branch before starting the next.

- **Recompute the open frontier after every answer.** An answer settles some questions and spawns others. The next
  question comes from the recomputed frontier, never from a list drawn up at the start. The frontier is your
  judgment, not a computed graph.

**Explore the code instead of asking.** Applies to a question the repository can answer: does X exist, how does Y
work, what calls Z. Read the code. Ask the user only what the code cannot answer.

**Find facts concurrently.** Applies to a frontier question that needs a fact from the environment that takes real
digging. Dispatch a background sub-agent to find it, and keep interviewing. Only the questions downstream of that
exploration wait for its report.

- **The rest of the frontier** → ask it now.
- **Downstream** → a question any of whose options rests on a claim the exploration would check.

**Prototype what must be seen or run.** Applies to a frontier question whose answer turns on seeing or running
something (how a screen looks or a flow feels, which of several variants reads better, whether a state model or data
shape survives real data), in a repository that can build an artifact the operator can open or run. Recommend a
prototype detour as that question's answer ("I'd prototype this first because … — agree?"), under **Offer only live
options** and its two-option cap. On a yes, build the prototype yourself by
`${CLAUDE_PLUGIN_ROOT}/references/prototype.md`, and take the operator's judgment of the running prototype as the
answer.

- **While the operator judges it** → only its question and the questions downstream of it wait. The skill's own end
  waits for it too: `## Termination` below, or the readiness test of a skill that stops there instead.
- **A declined, inconclusive, or abandoned detour** → return the question to the frontier, or record it where the
  skill keeps its open questions (plan's **Park explicitly, write it down**, brainstorm's **Still-open decisions**),
  naming the prototype branch as local to the planner's clone where the detour cut one.

**Surface, never smuggle.** Applies to every assumption and every answer. State assumptions out loud.

- **Two readings of an answer** → present both, and pick neither silently.
- **A simpler path than the user's framing** → say so.
- **Something unclear** → stop and name the confusing thing.

**Hunt contradictions.** Applies to a new answer that conflicts with an earlier one, or with what the code does. Stop
and put the two side by side: "earlier you said A, now B — which holds?". Let no inconsistency slide.

**Stress-test with concrete scenarios.** Applies to every agreement on a boundary. Probe it with specific edge cases
that force precision: "what happens when two of these arrive at once?", "what does the user see if this step fails?".
Never settle for abstract agreement.

**Park explicitly, write it down.** Applies to a load-bearing decision this session cannot resolve: it is blocked on
something outside the conversation, or the user does not know yet. On a multi-slice plan, park it as a known-open
question, and write it to the epic's `## Parked questions` section (`plan-authoring.md`) the moment it is parked.

- **A single-slice plan** → resolve the decision now, or decompose further.

## Termination

**When to stop.** Applies to every interview. Stop when every load-bearing decision is resolved or explicitly parked,
the picture is shared, and the next question would be ceremony. Stopping at "enough to begin" is too early.

**The shared picture.** Applies once you stop. State the shared picture in a few sentences, listing every decision you
stated rather than asked. **Get the user's explicit confirmation of it before acting on it**: slicing, writing, and
briefing all wait for that confirmation.
