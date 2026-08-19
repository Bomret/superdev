# Domain-modeling discipline

The *active* discipline of building the project's model while you interview — challenging terms,
inventing edge cases, and writing decisions down the moment they crystallise. Merely *reading*
`CONTEXT.md` for vocabulary is not this; this is for when you are **changing** the model. `/superdev:plan`
applies the whole discipline (it writes the durable docs); `/superdev:brainstorm` uses the active moves
below to sharpen thinking but writes **nothing durable**.

## Active moves (while interviewing)

- **Challenge against the glossary.** A term that conflicts with the existing language in `CONTEXT.md` →
  call it out at once: "your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"
- **Sharpen fuzzy language.** A vague or overloaded term → propose the precise canonical one: "you're
  saying 'account' — do you mean the Customer or the User? Those are different things."
- **Probe boundaries with concrete scenarios.** Invent edge cases that force the user to be precise about
  where one concept ends and another begins — not abstract agreement, a specific "what about when…".
- **Cross-reference the code.** When the user states how something works, check whether the code agrees;
  on a contradiction, surface it: "your code cancels entire Orders, but you just said partial cancellation
  is possible — which is right?"

## Capture as it crystallises (write, don't batch)

### Glossary → `CONTEXT.md`

A glossary and **nothing else** — no specification, no scratchpad, no implementation decisions. Each entry: a tight
one-to-two-sentence definition of what the term **is** (not what it does), with an `_Avoid_:` list of
rejected synonyms. Be **opinionated** — when several words name one concept, pick the best and list the
others under `_Avoid_`. Include **only terms specific to this project's domain** — a general programming
concept (timeout, retry, cache) does not belong even if the project uses it heavily. Group terms under
subheadings when natural clusters emerge; a single cohesive area stays a flat list. In a multi-context
repo (root `CONTEXT-MAP.md`), record the term under the context it belongs to; if unclear, ask.

### ADRs → `docs/adr/NNNN-<slug>.md`

Offer one **only when all three hold**: **hard to reverse** (changing your mind later is costly),
**surprising without context** (a future reader will wonder "why this way?"), and **the result of a real
trade-off** (there were genuine alternatives). Any one missing → skip it — a decision that is easy to
reverse gets no ADR, because you'll just reverse it. What usually passes all three: architectural shape,
integration patterns between contexts, technology choices carrying real lock-in (the ones that would take
a quarter to swap out — not every library), boundary and scope decisions where the explicit no's are as
valuable as the yes's, deliberate deviations from the obvious path (these stop the next engineer from
"fixing" something deliberate), constraints invisible in the code (compliance, a partner's SLA), and
non-obvious rejected alternatives. An ADR is a short title plus 1–3
sentences (context, decision, why); add Status / Considered Options / Consequences only when they earn
their place. Number by scanning the target directory for the highest existing number + 1.

**Placement:** `docs/adr/` at the repo root. In a multi-context repo (root `CONTEXT-MAP.md`), a decision
belonging to one bounded context lives beside it — that context's own `docs/adr/` — with the root
reserved for decisions that span contexts.

**Draw the structure when prose can't hold it.** An ADR deciding how components relate carries a mermaid
diagram alongside its prose when the relations are non-trivial — roughly three or more components, or any
edge a sentence can't state plainly. One component, or a relation prose already makes obvious, gets no
diagram. An ADR is a point-in-time record, so its diagram documents what was decided and never goes stale
the way a live architecture picture would. Every node must be a component the prose also names.

### Rejected directions → an ADR's `Considered options`, or the epic's non-goals

A direction explored and dropped is worth keeping only where a future reader will look for it. When
`/plan` seeds from a brainstorm intent carrying **Rejected directions** (`brainstorm.md` §5), route each
one — don't re-explore it, and don't drop it silently:

- a rejected **approach** (a design trade-off, an alternative mechanism) → the relevant ADR's
  `Considered options`, one line each: the option and why it lost — one of several sources that can earn
  that optional section, alongside genuine alternatives surfaced directly in the interview;
- a rejected **scope** (a thing deliberately not being built) → a non-goal in the epic body. A
  single-slice plan writes no epic, so there is nowhere to put one: name it in the lone slice's `spec` as
  deliberately excluded — a `spec` bounds what the slice delivers, and saying what it doesn't is part of
  that. A rejected **approach** needs no carve-out; its ADR exists whether or not the plan has an epic.

Forward only what passes the ADR's own **surprising without context** test — what a reader would
plausibly re-propose. Filter the rest, and say so rather than letting it vanish unremarked. Nothing
surviving the filter means the rejects contribute nothing to `Considered options` or the epic's non-goals
**on their own account** — it doesn't suppress content those sections earn from elsewhere (an ADR's own
alternatives surfaced in the interview, the intent's "Rough scope + non-goals" bullet). Write no section
only when no source, rejects included, has anything for it; an empty one is worse than none.

### Revise in place

When a later answer overturns a decision you already recorded, revise it where it lives — update the
glossary entry, rewrite the ADR (or mark it superseded and write the replacement). Never leave the store
holding two contradictory decisions; the record states current truth, not its history.
