# Interview discipline (grilling)

`/superdev:plan` and `/superdev:brainstorm` both run their conversation by this. The interview is the
**main event**, not a warm-up before slicing or brief-writing: keep going until the design tree is
exhausted and you and the user share the same picture — **not** until you have "enough to start."

## Core moves

- **One question at a time.** Multiple at once is bewildering. Ask, wait for the answer, then ask the
  next. Never batch.
- **A recommended answer every time.** Never pose a bare open question — state your best answer and the
  reasoning behind it, so the user reacts to a concrete position instead of generating one from nothing.
  "I'd do X because Y — agree?" beats "how should we do X?".
- **Walk the design tree, branch by branch.** Resolve dependencies between decisions one by one: a
  decision that constrains others is asked first; never ask a downstream question whose answer a still-open
  upstream decision would change. Finish a branch before starting the next.
- **Explore the code instead of asking.** If a question is answerable from the repo — does X exist, how
  does Y work, what calls Z — read it. Spend a tool call, not the user's attention. Only ask what the code
  cannot answer.
- **Surface, never smuggle.** State assumptions out loud. Two readings of an answer → present both, don't
  silently pick one. A simpler path than the user's framing → say so. Something unclear → stop and name the
  confusing thing.
- **Hunt contradictions.** When a new answer conflicts with an earlier one, or with what the code does,
  stop and put the two side by side: "earlier you said A, now B — which holds?" A relentless interview is
  one that refuses to let an inconsistency slide.
- **Stress-test with concrete scenarios.** Probe boundaries with specific edge cases that force precision
  — "what happens when two of these arrive at once?", "what does the user see if this step fails?" —
  never settle for abstract agreement.

## Termination

Stop when every load-bearing decision is resolved (or explicitly parked as a known-open question), the
picture is shared, and the next question would be ceremony. Stopping earlier — at "enough to begin" — is
the failure this discipline exists to prevent.
