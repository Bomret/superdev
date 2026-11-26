# Domain-modeling discipline

The *active* discipline of building the project's model while you interview: challenging terms, inventing edge
cases, and writing decisions down the moment they crystallise. Reading `CONTEXT.md` for vocabulary is not this
discipline. It applies when you are **changing** the model.

**Who applies what.** Applies to every reader. `/superdev:plan` applies the whole discipline and writes the durable
docs. `/superdev:brainstorm` uses the active moves to sharpen thinking and writes **nothing durable**.

## Active moves (while interviewing)

**The moves.** Applies throughout an interview.

- **Challenge against the glossary.** A term that conflicts with the existing language in `CONTEXT.md` → call it out
  at once: "your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"
- **Sharpen fuzzy language.** A vague or overloaded term → propose the precise canonical one: "you're saying
  'account' — do you mean the Customer or the User? Those are different things."
- **Probe boundaries with concrete scenarios.** Invent edge cases that force the user to be precise about where one
  concept ends and another begins: a specific "what about when…", never abstract agreement.
- **Cross-reference the code.** When the user states how something works, check whether the code agrees. On a
  contradiction, surface it: "your code cancels entire Orders, but you just said partial cancellation is possible —
  which is right?"

## Capture as it crystallises (write, don't batch)

**Write at once.** Applies to every capture this section names. Write each one the moment it crystallises, never in a
batch at the end.

### Glossary → `CONTEXT.md`

**The glossary.** Applies to every `CONTEXT.md` entry. `CONTEXT.md` is a glossary and **nothing else**: no
specification, no scratchpad, no implementation decisions. Each entry is a tight one-to-two-sentence definition of
what the term **is**, not what it does, with an `_Avoid_:` list of rejected synonyms.

- **Be opinionated** → when several words name one concept, pick the best and list the others under `_Avoid_`.
- **Only terms specific to this project's domain** → a general programming concept (timeout, retry, cache) stays out,
  even if the project uses it heavily.
- **Grouping** → group terms under subheadings when natural clusters emerge; a single cohesive area stays a flat list.
- **A multi-context repo** (root `CONTEXT-MAP.md`) → record the term under the context it belongs to; if unclear, ask.

### ADRs → `docs/adr/NNNN-<slug>.md`

**The three-part test.** Applies to every decision you might record as an ADR. Offer one **only when all three
hold**: **hard to reverse**, **surprising without context**, and **the result of a real trade-off** with genuine
alternatives. Any one missing → no ADR.

- **What usually passes** → architectural shape, integration patterns between contexts, technology choices carrying
  real lock-in, boundary and scope decisions where the explicit no's are as valuable as the yes's, deliberate
  deviations from the obvious path, constraints invisible in the code (compliance, a partner's SLA), and non-obvious
  rejected alternatives.

**The ADR's form.** Applies to every ADR written. It is a short title plus 1–3 sentences: context, decision, why. Add
Status, Considered Options, or Consequences only when they earn their place.

**Only confirmed rejections.** Applies to every rejected alternative an ADR records, in `Considered options` and in
any `## Non-goals` section. An ADR holds only a rejection the operator confirmed. An alternative the interview drops
for this goal only is a deferral, and it goes to the epic's non-goals (`### Dropped directions → …`).

**The numbering rule.** Applies to every new ADR file and every new invariant id. Take the highest existing number in
the target, `docs/adr/` or `docs/invariants.md`, plus 1.

**Subject.** Applies to every decision considered for an ADR. An ADR records a decision that constrains a production
asset the repository or folder holds, the code, configuration, and content it ships or deploys, whatever prompted
the decision. A decision that constrains a production asset and the setup together is an ADR too.

- **A decision that constrains only the build, test, documentation, or release setup** → a working rule of that
  setup, written where its contributors read it, such as `AGENTS.md`.

**Placement.** Applies to where an ADR lives. `docs/adr/` at the repository root.

- **A multi-context repo** (root `CONTEXT-MAP.md`) → a decision belonging to one bounded context lives in that
  context's own `docs/adr/`, and the root keeps the decisions that span contexts.

**Draw the structure when prose can't hold it.** Applies to an ADR deciding how components relate. It carries a
mermaid diagram beside its prose when the relations are non-trivial: roughly three or more components, or any edge a
sentence cannot state plainly. Every node is a component the prose also names.

- **One component, or a relation prose already makes obvious** → no diagram.

### Invariants → `docs/invariants.md`

**The register.** Applies to a rule the system may never break: "a module is loaded once", "the domain layer imports
no infrastructure", "an order total equals the sum of its lines". Record it in the **invariant register**,
`docs/invariants.md`, one file at a fixed path. Create the file only when the first invariant crystallises, and
never scaffold an empty register.

**The entry format.** Applies to every register entry. It carries an id, a `Class`, the `Concepts` it governs, its
`Statement`, and how it `Breaks`, plus the optional `Symbols` and `Paths` it governs. Every field carries a colon.

- **`Concepts`** is mandatory and draws on `CONTEXT.md`'s vocabulary.
- **`Breaks: silently`** → the entry also answers `Check:`, naming the executable proof, or `none` with the reason.
- **Id form** → `INV-NNNN`, zero-padded to four digits, numbered by **The numbering rule**.
- `Symbols:` and `Paths:` are the two fields a resolver greps for.

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

**Convert before you record.** Applies to every **load-bearing commitment**, a sentence about how the system should
be rather than a rule with a subject. Name the rule it implies out loud, even where the principle already sounds like
one, and ask what later decision it constrains. Then sort it by the first branch that matches:

1. **A rule about how the work is done** (how acceptance criteria are written, what a review must cover, when a test
   is required) → an **authoring rule**. Name it out loud as one, and record it nowhere: the register holds rules
   about the system a repository builds.
2. **A rule that constrains only the repository's build, test, documentation, or release setup** → a working rule of
   that setup. Write it where the setup's contributors read it, such as `AGENTS.md`.
3. **A rule that constrains a production asset and a later decision, cheaply testable** → a register entry, its
   `Check:` naming the proof.
4. **The same, with nothing that cheaply tests it** → a register entry all the same, with `Check: none` and its
   reason. Sort on what a commitment constrains, never on whether it is testable.
5. **A commitment that constrains no later decision** → a mood. Say so in the conversation, with the reason, and write
   nothing.

- A rule that constrains a production asset, alone or with the setup, sorts into branch 3 or 4, whatever prompted it.
- A rationale such as "the record is why this is a binary and not `curl`" belongs in no register; the rule under it,
  *every call that reaches the service writes a record*, is an entry with `Breaks: silently` and a test.

**The mood branch is guidance.** Applies to branch 5. Nothing enforces its rate. Reading the rate across runs is a
human's job.

- **A single run** → sees one plan, and a run that sorts every commitment there has mis-sorted.

**Both sources.** Applies to every commitment `/superdev:plan` meets. A commitment plan originates in its own
interview and a commitment a seeded intent carried in its `## Load-bearing commitments` section
(`skills/brainstorm/SKILL.md` §5) both take this conversion.

### Dropped directions → an ADR's `Considered options`, or the epic's non-goals

**Route each cut.** Applies to every **Dropped directions** entry a seeded brainstorm intent carries
(`skills/brainstorm/SKILL.md` §5), and to every alternative the interview itself drops. Route it by kind with its
**Horizon** as the gate, and neither re-explore it nor drop it silently. An entry with no horizon, or an uncertain
one, reads as `Deferred`.

- **A rejected approach the operator confirmed** (a design trade-off, an alternative mechanism) → the relevant ADR's
  `Considered options`, one line each: the option and why it lost.
- **A rejected scope** (a thing deliberately not being built), **and any deferral of either kind** → a non-goal in
  the epic body, led by its horizon word: `- **Deferred:** <what> — <why outside this goal>` or `- **Rejected:**
  <what> — <durable reason>`. A single-slice plan writes no epic: name it in the lone slice's `spec` as deliberately
  excluded, led the same way.

**The filter.** Applies to every reject before you route it. Forward only what passes the ADR's own **surprising
without context** test, what a reader would plausibly re-propose. Filter the rest, and say so out loud.

**No empty section.** Applies to `Considered options` and the epic's non-goals. Rejects that all fail the filter add
nothing on their own account and suppress nothing those sections earn elsewhere: an ADR's own alternatives surfaced
in the interview, the intent's "Rough scope + non-goals" bullet. Write no section only when no source has anything for
it.

### Revise in place

**Revise in place.** Applies to a later answer that changes a decision you already recorded. Bring the record into
line where that decision lives, and never leave the store holding two contradictory decisions.

- **The treatment** → splits by home, and inside the ADR home by how much of the decision stands: an **overturned**
  decision is superseded, and a decision that **stands with a narrow qualification** is amended.
- **A glossary entry is revised in place.** Rewrite the entry to state current truth, and keep exactly one entry per
  term.
- **An invariant register entry is revised in place, the same way.** Find the existing entry by the `Concepts` it
  already names, never by re-deriving the rule, and edit it. Append no second, differently-worded entry for a rule
  the register already records.
- **An overturned ADR is superseded, never edited.** Write the replacement ADR. Set the old one's `**Status:**` line
  to `Superseded`, adding that line under the title when the ADR carries none. Add a pointer to the replacement **on
  its own line**: the status line carries the status word and nothing after it. Everything else in the old ADR
  stands unchanged, its `Considered options` included.
- **A qualified ADR is amended, never edited.** Write the amending ADR, which carries the qualification and names what
  it amends. Leave the amended one's `**Status:**` at `Accepted`. Add an `**Amended by:**` pointer with the bolded key
  opening its own line, off the status line. The amended ADR's own text stands unchanged; the live example,
  `docs/adr/0004-plan-append-semantics.md`, wraps its pointer across three lines.
- **A deferred non-goal a later plan of the same feature builds is revised in place.** Rewrite or remove its line in
  the epic's non-goals, so the epic never holds a non-goal contradicting its own criteria.
