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

A glossary and **nothing else** — no spec, no scratchpad, no implementation decisions. Each entry: a tight
one-to-two-sentence definition of what the term **is** (not what it does), with an `_Avoid_:` list of
rejected synonyms. Be **opinionated** — when several words name one concept, pick the best and list the
others under `_Avoid_`. Include **only terms specific to this project's domain** — a general programming
concept (timeout, retry, cache) does not belong even if the project uses it heavily. In a multi-context
repo (root `CONTEXT-MAP.md`), record the term under the context it belongs to; if unclear, ask.

### ADRs → `docs/adr/NNNN-<slug>.md`

Offer one **only when all three hold**: **hard to reverse** (changing your mind later is costly),
**surprising without context** (a future reader will wonder "why this way?"), and **the result of a real
trade-off** (there were genuine alternatives). Any one missing → skip it. An ADR is a short title plus 1–3
sentences (context, decision, why); add Status / Considered Options / Consequences only when they earn
their place. Number by scanning `docs/adr/` for the highest existing number + 1.

### Revise in place

When a later answer overturns a decision you already recorded, revise it where it lives — update the
glossary entry, rewrite the ADR (or mark it superseded and write the replacement). Never leave the store
holding two contradictory decisions; the record states current truth, not its history.
