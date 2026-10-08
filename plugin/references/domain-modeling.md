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

### Invariants → `docs/invariants.md`

A rule the system may never break — "a module is loaded once", "the domain layer imports no
infrastructure", "an order total equals the sum of its lines" — goes to the **invariant register**,
`docs/invariants.md`, one file at a fixed path. Create it only when the first invariant crystallises;
an empty register is never scaffolded.

Each entry carries an id, a `Class`, the `Concepts` it governs, its `Statement`, and how it `Breaks`,
plus the optional `Symbols` and `Paths` it governs. `Concepts` is mandatory and draws on `CONTEXT.md`'s
vocabulary — a concept survives the refactor that unbinds a path or renames a symbol, which is why it
is the coordinate every entry carries. An entry whose `Breaks` reads `silently` also answers `Check:`,
naming the executable proof, or `none` with the reason an invariant nobody can cheaply test today stays
recorded anyway.

**Id form:** `INV-NNNN`, zero-padded to four digits. Number by scanning `docs/invariants.md` for the
highest existing id + 1 — the same allocation rule the ADR home above uses for its own filenames,
applied to entries in one file instead of files in one directory.

A worked example, showing every field's rendering: every field carries a colon, and the optional
`Symbols:` and `Paths:` are the two a resolver greps for.

```
### INV-0001

Class: architecture
Concepts: Order, OrderLine
Statement: An order total equals the sum of its lines.
Breaks: silently
Check: tests/order-total.test.ts
Symbols: Order.total
Paths: src/domain/order/**
```

#### From a principle to the rule it implies

A **load-bearing commitment** arrives as a principle — a sentence about how the system should be, not a
rule with a subject. "The record is why this is a binary and not `curl`" is a rationale and belongs in no
register; the rule under it, *every call that reaches the service writes a record*, is an entry with a
`Breaks: silently` and a test. Convert before you record, and ask what later decision the commitment
constrains (ADR 0081):

- **A rule about how the work is done** — how acceptance criteria are written, what a review must cover,
  when a test is required — is an **authoring rule**. Name it out loud as one, and record it nowhere: this
  register holds rules about the system a repository builds, and an authoring rule belongs to the working
  rules of whatever writes the criteria. Ask this first, because such a rule does constrain later
  decisions and would otherwise answer yes below.
- **A rule about the system the repository builds** that constrains a later decision, where the constraint
  is cheaply testable → a register entry, its `Check:` naming the proof.
- **The same, where nothing cheaply tests it** → a register entry all the same, with `Check: none` and its
  reason. A commitment binding a hundred decisions and no single test is what `none` exists for, so sort
  on what a commitment constrains rather than on whether it is testable: treating untestability as
  disqualifying drops exactly the commitments most worth keeping.
- **A commitment that constrains no later decision** is a mood. Say so in the conversation, with the
  reason, and write nothing.

Name the implied rule out loud even where the principle already sounds like one. A principle is cheap to
invent under the pressure of an empty field, and the rule it implies is not, so naming it is the test of
whether a commitment is load-bearing.

The last branch is **guidance rather than a check** — a single run sees one plan and cannot know its own
sort rate, and a run sorting *every* commitment there has certainly mis-sorted. Reading the rate across
runs is a human's job, and nothing enforces it.

Both sources reach this same conversion: a commitment `/superdev:plan` originates in its own interview,
which is the more common one, and a commitment a seeded intent carried in its `## Load-bearing
commitments` section (`skills/brainstorm/SKILL.md` §5).

### Rejected directions → an ADR's `Considered options`, or the epic's non-goals

A direction explored and dropped is worth keeping only where a future reader will look for it. When
`/plan` seeds from a brainstorm intent carrying **Rejected directions** (`skills/brainstorm/SKILL.md` §5), route each
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

When a later answer changes a decision you already recorded, bring the record into line where that
decision lives. Never leave the store holding two contradictory decisions. Treatments split first by
home, and then — inside the ADR home — by how much of the decision the later answer leaves standing: a
decision **overturned** is superseded, a decision that **stands with a narrow qualification** is amended.

- **A glossary entry is revised in place.** It states current truth, not its history, so rewrite the
  entry and keep exactly one per term.
- **An invariant register entry is revised in place, the same way.** Find the existing entry by the
  `Concepts` it already names — never by re-deriving the rule from scratch — and edit it, rather than
  appending a second, differently-worded entry for a rule the register already records.
- **An overturned ADR is superseded, never edited.** It is a dated record of what was decided at the
  time, and editing it destroys the record the ADR exists to be. Superseding has three parts: write the
  replacement ADR, set the old one's `**Status:**` line to `Superseded`, adding that line under
  the title when the ADR carries none, and add a pointer to the replacement **on its own line** —
  the status line carries the status word and nothing after it, so it stays readable by eye and by
  tool alike. Everything else in the old ADR stands unchanged, including its `Considered options`:
  an option that lost then still lost, and the replacement records what changed and why.
- **A qualified ADR is amended, never edited.** The decision still holds and one condition is added to
  it, so marking it replaced would state something false about a record that is otherwise intact.
  Amending has three parts too: write the amending ADR, which carries the qualification and names what
  it amends; leave the amended one's `**Status:**` at `Accepted`, because the decision still stands;
  and add an `**Amended by:**` pointer with the bolded key opening its own line, the same as the
  supersession pointer — keeping it off the status line is what leaves both readable by eye and by tool.
  The live example, `docs/adr/0004-plan-append-semantics.md`, wraps its pointer across three lines. The
  amended ADR's own text stands unchanged.
