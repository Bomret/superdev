# 0014: Content coverage is a documentation lens, not a writing standard

**Status:** Accepted

**Context.** The doc agents check two properties of prose. `doc-writer` applies the configured writing
standard (ADR 0012). `doc-reader` verifies that claims are true and that the standard was followed.
Nothing checks what *kind* of information a document owes its reader. Technical writing names four
content types: interface, reference, conceptual, and procedural. Conceptual information answers why a
thing exists and when to reach for it. It is the hardest type to write, because it needs understanding
beyond the interface. It is also the type most often absent.

**Decision.** The taxonomy lives in `references/content-types.md`, a non-seed reference that both doc
agents read at dispatch. `doc-writer` applies it when it writes. `doc-reader` checks it in Pass 1, its
cold read, and reports a gap as `conceptual:`. A drift assertion holds both wires in place.

**Why.** Content coverage is not a style. The writing standard is a pointer, and a repo may set it to
`none` or to its own editorial guide. A repo that declines a style standard still owes its readers the
conceptual layer, so binding the taxonomy to that pointer would delete a completeness check for a style
reason. `references/review-checklist.md` already established the shape this needs: a named lens, in its
own file, read at dispatch by the agents that use it.

Pass 1 is the right home in the reader. It is already whole-file and already cold, so the check needs no
new scoping rule and runs in audit mode unchanged. A missing conceptual layer is a property of a
document, not of a diff. The writing-standard pass is diff-scoped for a different reason: it judges
sentences the writer wrote. A cold reader who notices that a document explains how without ever
explaining why has made a first-read observation, which is what Pass 1 collects.

The check fires only where the gap leaves a reader unable to decide whether the thing applies to them. A
pure lookup table is exempt when a document that links to it carries the why.

**Considered options.**

- *A `## Content types` section in `references/controlled-prose.md`*. Rejected: the smallest diff, but
  `Standard: none` and a repo-relative path both disable the whole file, which would take a completeness
  check down with a style choice.
- *A `## Content types` section in the `references/documentation.md` seed*. Rejected: the seed becomes
  each repo's `docs/agents/documentation.md`, whose job is to record repo-specific choices. The taxonomy
  is fixed, so every repo would carry an identical copy that freezes at setup time.
- *A new Pass 4 in `doc-reader`, scoped whole-file*. Rejected: two adjacent passes with two scoping
  rules, and it duplicates the cold read that Pass 1 already performs.
- *Writer-side only, with no reader check*. Rejected: the doc loop is writer-proposes and
  reader-verifies. An unverified rule is one the writer can skip without consequence.
- *Named severity bands for the reader's findings*. Rejected: the seven existing tags already carry the
  distinction. An ordered list delivers the same fix-round priority without a new term.
- *Flag any document missing any of the four types*. Rejected: mechanical and consistent, but most
  documents legitimately carry one or two types, so the finding becomes noise.

**Consequences.** `doc-reader` reports findings most-severe-first, in a stated tag order, so the single
fix round in `/superdev:document` spends itself on false claims before style. The order is a convention
of the report, and it adds no lifecycle status and no gate. `conceptual:` joins the seven existing tags
and stays distinct from `assumes:`, which names an undefined term rather than an absent rationale.
Because Pass 1 is whole-file, the reader may report a conceptual gap that predates the writer's edit. The
writer is already dispatched for the fix round, so the cost is one line of report against a gap that a
real reader would otherwise hit.
