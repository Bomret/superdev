<!--
  Attribution: the prototype discipline below is distilled from the prototype skill,
  by Matt Pocock (https://github.com/mattpocock). Credit to its author.
-->

# Prototype discipline

A throwaway artifact that answers **one design question** conversation cannot settle, such as "does this state model
feel right" or "which of these two shapes survives real data". `/superdev:brainstorm` detours here when it hits such a
question. The answer feeds the intent, never the codebase.

**State the question first.** Applies to every prototype. Write the one question it answers in the artifact itself.

**Logic prototypes stay liftable.** Applies to a prototype of logic. Keep the logic in one pure module, with the page
or harness as a thin shell around it. The logic references neither the DOM nor the harness.

**UI prototypes ship variants.** Applies to a "which of these" question. Build switchable variants in one artifact,
never serial rebuilds.

**Capture, then throw away.** Applies once the prototype answers its question. Fold the validated decision into the
intent, and from there the plan. Commit the prototype itself to a throwaway branch off the base, never onto the base
branch, and leave a pointer to that branch where the decision landed.

- The base branch keeps only the validated decision.

**A decision-rich snippet may enter the plan.** Applies to a prototype-produced snippet that encodes a decision more
precisely than prose can: a state machine, a reducer, a schema, a type shape. It may be inlined in a slice `spec`,
trimmed to the decision-rich parts and marked as prototype-sourced (`plan-contract.md` → *Fields*). It is the one
exception to a `spec` stating outcomes and interfaces only.
