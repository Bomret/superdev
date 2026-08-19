<!--
  Attribution: the prototype discipline below is distilled from the prototype skill,
  by Matt Pocock (https://github.com/mattpocock). Credit to its author.
-->

# Prototype discipline

A throwaway artifact that answers **one design question** conversation cannot settle — "does this state
model feel right", "which of these two shapes survives real data". `/superdev:brainstorm` detours here
when it hits such a question; the answer feeds the intent, never the codebase.

- **State the question first, in the artifact itself.** A prototype that answers the wrong question is
  pure waste; the stated question is what keeps it honest and tells a later reader what it proved.
- **Logic prototypes stay liftable.** Keep the logic in one pure module, with the page or harness as a
  thin shell around it. Logic that references the DOM or the harness is no longer liftable, and lifting
  the validated shape is the point.
- **UI prototypes ship variants.** When the question is "which of these", build switchable variants in
  one artifact rather than serial rebuilds.
- **Capture, then throw away.** Fold the validated decision into the intent (and from there the plan).
  Commit the prototype itself to a throwaway branch off the base — never onto the base branch — and
  leave a pointer to that branch where the decision landed. The base branch keeps only the validated
  decision.
- **A decision-rich snippet may enter the plan.** A slice `spec` states outcomes and interfaces, never
  implementation — with one exception (`plan-contract.md` → *Fields*): a prototype-produced snippet that
  encodes a decision more precisely than prose can (a state machine, a reducer, a schema, a type shape)
  may be inlined in the `spec`, trimmed to the decision-rich parts and marked as prototype-sourced.
