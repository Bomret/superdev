# 0265: Listed reference files are written as prompt concepts

**Status:** Accepted

**Amends:** [ADR 0190](0190-listed-skill-files-are-written-as-prompt-concepts.md), whose convention now also
governs the reference files the glossary lists, and
[ADR 0170](0170-prompt-concept-overlap-is-judged-by-rule-equivalence.md), whose dispatch-sentence test now
also pairs a relayed sentence with the reference sections the receiving agent reads.

## Context

ADR 0169 and ADR 0190 write every agent body and every skill file as prompt concepts. The runtime references
under `plugin/references/` hold more prompt prose than the skills and agents together. Skills and agents
read them in the middle of a task. Most of them state rationale and history inline, state conditions in the
middle of a paragraph, and join several rules in one sentence. Only `review-scope-mode.md` and its branch
files are governed.

The overlap lens pairs a listed skill's relayed dispatch sentence only with the agent body it reaches. The
glossary's No overlap invariant also covers the reference sections that agent body directs its reader to
read, so the lens and the glossary disagree on that case (triage #56).

## Decision

- **The convention governs listed reference files.** A reference file is written as prompt concepts when
  the glossary's **Prompt concept** entry lists it. A scope adds a reference file to the list when it
  rewrites that file. Backend seeds stay outside the list, because `/superdev:setup` offers a seed's new
  wording to every adopter's configuration document as a seed gap (ADR 0107).
- **Headings and steps are the frame.** A reference's prompt concepts live under its headings, and inside
  its numbered steps where it has them. A concept whose condition is its heading's or its step's condition
  takes that as its condition head. A heading, a step number, or a bold or italic anchor that another file
  cites keeps its exact text, or every citation to it moves in the same change.
- **Dispatch prose points.** As in ADR 0190, a dispatch in a listed reference names the agent concept that
  owns a rule, and it hands the data that rule needs. A rule the agent body lacks moves into the body
  before the dispatch drops it.
- **The overlap test decides extraction.** A rule two files state is kept once, in one owning section, where
  the overlap test forms a pair of the two copies. Where no reader reads both copies, the test forms no pair
  and each copy stays where its reader finds it.
- **Rationale leaves the prompt.** As in ADR 0190, a governed reference states what its reader does. The
  reason for a rule lives in the ADR its citation names.
- **A dispatch sentence also pairs with the agent's reference sections.** In a listed skill or reference
  file, a sentence the controller relays to an agent forms a pair with the agent body it reaches and with
  each reference section that body directs its reader to read.
- **The rollout runs in two scopes.** This scope rewrites the execution playbooks, the run basics, test
  selection, and the Definition-of-Done ticks. A later scope rewrites the plan, review-lens, and
  documentation-pass references.

## Considered options

- *Rewrite every reference in one scope.* Rejected: one pull request about twice the size of the skill
  rewrite, and its review-lens part would collide with a scope that edits `review-checklist.md` at the same
  time.
- *Extract every repeated rule to one shared reference.* Rejected: a subagent reads only the sections its
  dispatch hands it, so a pointer to a shared section costs it a read at runtime.
- *Govern the backend seeds too.* Rejected: a reworded seed reaches every adopter as a seed gap and changes
  no runtime behaviour.

## Consequences

Each rewritten reference keeps every rule of its old text, except where a paragraph below names a settled
conflict. A paragraph per rewritten file states what the rewrite added, removed, and settled.
