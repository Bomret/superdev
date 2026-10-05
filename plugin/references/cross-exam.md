# Interview discipline (cross-examination)

`/superdev:plan` and `/superdev:brainstorm` both run their conversation by this. The interview is the
**main event**, not a warm-up before slicing or brief-writing: keep going until the design tree is
exhausted and you and the user share the same picture — **not** until you have "enough to start."

## Core moves

- **One question at a time.** Multiple at once is bewildering. Ask, wait for the answer, then ask the
  next. Never batch.
- **A recommended answer every time.** Never pose a bare open question, except in the
  no-survivor case of "Offer only live options" — state your best answer and the
  reasoning behind it, so the user reacts to a concrete position instead of
  generating one from nothing.
  "I'd do X because Y — agree?" beats "how should we do X?". **Whenever a question resolves to discrete
  options, ask it through `AskUserQuestion` — never list the options inline in prose.** Mark the lean
  option `(Recommended)` (the tool's own labeling convention), put the reasoning in that option's
  description, and never present a bare neutral list. Reserve prose for genuinely open questions that have
  no option set to offer. A genuine toss-up (two readings truly equal) → say so explicitly rather than
  fabricate a preference.
- **Offer only live options.** Before you ask a question you compose, vet every option: check each
  load-bearing claim it rests on — a claim about the repository by reading the repository, a claim about
  a third party against its official docs (`references/doc-verification.md` owns what makes a claim
  load-bearing and how to check it). Drop an option a check fails, and name it with the reason it failed.
  A claim you cannot check keeps its option, labeled as an assumption. Then every option beside the
  recommended one states, in its description, what choosing it saves — time, scope size, risk, reversibility, a
  human check — and an option that can name no saving is dropped too. In a toss-up, with no recommended option,
  each option states what it saves over the other. **Show the vetting before the question.** A short prose
  paragraph ahead of the `AskUserQuestion` call cites the evidence for each load-bearing claim (`file:line`, or
  a doc URL), carries every assumption label, and names every dropped option with its reason, so the option
  descriptions stay short. **Offer at most two options.**
  Exactly one survivor → the decision has one defensible answer: state it in one line with its reason
  ("fixing X in slice 2, because Y") and continue with the next question. Stating it out loud is what
  keeps it surfaced, and the user can object in any later turn. No survivor → ask no option question:
  name each failed option with its reason, and put the decision to the user as an open question. A fact
  that could not have been checked before the question still reopens an answer; name the fact when it
  does. A question a skill requires by name — a release, new vs extend, the feature to extend, the deploy
  target, where a found defect goes, a brainstorm draft choice, a setup choice — keeps its fixed option
  set, outside the two-option cap, and is asked every time regardless: an option in that set that can
  name no saving states why instead of being dropped.
- **Walk the design tree, branch by branch.** Resolve dependencies between decisions one by one: a
  decision that constrains others is asked first; never ask a downstream question whose answer a still-open
  upstream decision would change. Finish a branch before starting the next. **Recompute the open frontier
  after every answer**: an answer reshapes the tree — settling some questions, spawning others — so the
  next question comes from the recomputed frontier, not from a list drawn up at the start. The frontier is
  your judgment, not a computed graph; recomputing it is what makes a long interview converge instead of
  wander.
- **Explore the code instead of asking.** If a question is answerable from the repo — does X exist, how
  does Y work, what calls Z — read it. Spend a tool call, not the user's attention. Only ask what the code
  cannot answer.
- **Find facts concurrently.** Facts are your job, never the user's. When a frontier question needs a
  fact from the environment that takes real digging, dispatch a background sub-agent to find it and keep
  interviewing — a running exploration is an unsettled prerequisite, so only the questions downstream of
  it wait for the report; ask the rest of the frontier now. A question is downstream of an exploration
  whenever any of its options rests on a claim that exploration would check.
- **Surface, never smuggle.** State assumptions out loud. Two readings of an answer → present both, don't
  silently pick one. A simpler path than the user's framing → say so. Something unclear → stop and name the
  confusing thing.
- **Hunt contradictions.** When a new answer conflicts with an earlier one, or with what the code does,
  stop and put the two side by side: "earlier you said A, now B — which holds?" A relentless interview is
  one that refuses to let an inconsistency slide.
- **Stress-test with concrete scenarios.** Probe boundaries with specific edge cases that force precision
  — "what happens when two of these arrive at once?", "what does the user see if this step fails?" —
  never settle for abstract agreement.

- **Park explicitly, write it down.** A load-bearing decision genuinely can't be resolved this session
  (blocked on something outside the conversation, the user doesn't know yet)? Park it as a known-open
  question rather than forcing a premature answer — but write it to the epic's `## Parked questions`
  section (`plan-contract.md`) the moment it's parked, not batched at the end. A multi-slice plan only:
  on a single-slice plan, a genuinely open load-bearing decision means the plan isn't single-slice-simple
  yet — resolve it now or decompose further (ADR 0005).

## Termination

Stop when every load-bearing decision is resolved (or explicitly parked as a known-open question), the
picture is shared, and the next question would be ceremony. Stopping earlier — at "enough to begin" — is
the failure this discipline exists to prevent. Then state the shared picture in a few sentences, listing
every decision you stated rather than asked, and **get the user's explicit confirmation of it before
acting on it** — slicing, writing, and briefing all wait
for that confirmation, not just for the questions to run out.
