# 0122: Interview options are vetted before they are offered

**Status:** Accepted

**Amends:** [ADR 0099](0099-plan-derives-criteria-from-the-intent-before-slicing.md).

**Context.** `references/cross-exam.md`'s "Offer only live options" rule (feature #711) requires every
option beside the recommended one to state what choosing it saves. It does not require the option to be
viable. In `/superdev:brainstorm` and `/superdev:plan` interviews the agent sometimes offered an option
whose viability rested on a claim it had not checked: a file, a hook, a contract, a platform behaviour.
After the operator picked it, the agent checked the claim, found the option unviable, and reversed. The
operator spent a decision on an option that never stood. "Find facts concurrently" let a question go out
while a background exploration that could kill one of its options was still running.

A second symptom came up while this feature was being planned. Brainstorm §2 asked for 2–4 directions to
be offered, and its opening asked for "options rather than a single recommended answer". The agent then
listed every candidate it generated and left the vetting to the operator. The operator answered three
such questions in a row with "explore these options and make one solid suggestion", including the plan's
derive-pass gap settlement.

**Decision.** The agent vets, and the operator decides. Before a question the agent composes is asked,
every load-bearing claim of every option is checked: a claim about the repository against the
repository, a claim about a third party against its official docs (`references/doc-verification.md`
owns what makes a claim load-bearing). An option that fails is dropped and named with the reason. A claim
that cannot be checked is labeled as an assumption. The evidence, the assumption labels, and the dropped
options go in prose before the question, never in the option descriptions. A composed question offers at
most two options. One survivor is stated in one line with its reason and is not asked. No survivor means
no question: the failures are named and the decision is put as an open question. A question waits for
any running exploration its options depend on.

Brainstorm keeps its divergence and moves it inside: it explores 2–4 directions, offers at most two that
survive, and marks a recommendation the way plan does. Plan's derive pass settles each gap itself and
states the settlement as one proposal the operator confirms before slicing.
The other questions a skill requires by
name keep their fixed option sets and stay outside the cap.

**Considered options**

- **A PreToolUse hook on `AskUserQuestion`.** It loses because a hook can check only the text form of a
  description, never whether its claim is true, so the agent can satisfy it without verifying anything.
- **A verifier subagent per option set.** It loses because a fresh-context subagent lacks the
  conversation the options depend on, and it adds a dispatch round trip to every question.
- **Brainstorm offers 2–4 directions for the operator to vet.** This was brainstorm §2. It loses because
  it hands the vetting to the operator, who rejected it.
- **Brainstorm stays neutral among at most two options.** It loses because it keeps a second rule beside
  plan's for no gain the operator wanted.
- **Evidence inside each option description.** It loses because it makes every option dense; a grounding
  paragraph before the question carries the same evidence once.
- **A rule with no visible evidence.** It loses because "Explore the code instead of asking" already
  existed and the reversals happened anyway. Citing a file and line cannot be done without opening the
  file, so the citation forces the check.

**Consequences.** Superdev measures no prompt change (ADR 0129), so nothing shows that the change helps.
The rule is enforced by prose and by drift rows on `cross-exam.md`, `skills/brainstorm/SKILL.md`,
and `skills/plan/SKILL.md`. Nothing mechanical checks that a cited line says what the agent claims,
or that a question the agent asked was vetted. A fact that genuinely could not have been checked
before the question still reopens a pick. Every composed question costs the reads its options need
before it is asked, and a question that depends on a slow exploration waits for it.
