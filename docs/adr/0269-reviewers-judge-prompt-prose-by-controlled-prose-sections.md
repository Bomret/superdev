# 0269: Reviewers judge prompt prose by controlled-prose sections

**Status:** Accepted

## Context

`references/controlled-prose.md` is the writing standard for documentation (ADR 0012). Its `## Scope` covers
human-facing prose, and `docs/agents/documentation.md` puts prompt prose outside it. Prompt prose has the
prompt-architecture rules in root `AGENTS.md`, the **Prompt concept** convention (ADR 0169, ADR 0190), and the
overlap lens (ADR 0170). None of those judges a sentence's form. Most of controlled prose's rules on words,
verbs, sentences, definitions, procedures, headings, lists, tables, references, and punctuation hold for a model
reader as well as for a human one.

## Decision

- A review lens, `references/prompt-prose-form.md`, applies named controlled-prose sections to prompt prose. It
  cites the sections by heading and names its exemptions, and it copies no rule.
- It applies: Words, Verbs, Sentences except the word limit, Definitions, Procedures, "Headings, lists, tables,
  and references", Punctuation, and the reviewed repository's own *Declare per language* answers.
- It exempts: Scope's file list and voiced-prose rule, Modes, the word limits of both modes, Descriptive text,
  Safety and error text, How to count words, and Self-check. The prompt-concept cap governs length, and
  Descriptive text forbids the imperative an instruction needs. Scope's exemption of code, paths, fenced
  blocks, code spans, and quoted text still holds.
- A form the Prompt concept convention requires, such as the "Applies to …" condition head, takes precedence
  over a controlled-prose sentence rule. An `AGENTS.md` file stays under the writing standard alone. A defect
  that is also an overlap or a glossary-drift finding is reported once, as the more specific finding.
- Its gate and subject are the overlap lens's: a repository whose `CONTEXT.md` defines **Prompt concept**, and
  the governed bodies with the reference sections they direct their reader to read.
- On a change it judges the lines the change adds or edits. On a standing-code review it judges the whole
  subject.
- Every finding is Minor. `final-reviewer` and `slice-reviewer` read the lens.
- A scope review's re-review whose only remaining findings are Minor **Prompt-concept overlap** or
  **Prompt-prose form** findings, with no broken criterion, ends the fix loop. A criterion only such findings
  leave unmet holds.

## Considered options

- **Merge controlled prose and the Prompt concept convention into one standard.** Rejected: the two govern
  different readers at different levels. Controlled prose is an adopter's choice of doc standard, and the
  merge would tie that choice to a prompt-structure convention. Some rules also conflict, such as the ban on
  the imperative in descriptive text.
- **A pointer only, from the glossary and `AGENTS.md`, with no reader.** Rejected: a rule no agent reads
  changes no output. ADR 0171 removed the on-demand checker `/superdev:prose-check` because nothing ran it.
- **Gate on the `controlled` writing standard as well.** Rejected: that pointer configures documentation, which
  excludes prompt prose.
- **Restate the applicable rules bullet by bullet.** Rejected: the copy would drift from controlled prose, and
  the overlap test would flag it.
- **Grade ambiguity rules Important.** Rejected: a form defect alone changes no behavior, and an ambiguity that
  does reaches Important through the overlap lens's No conflict grade or a correctness finding.

## Consequences

- A review that touches prompt prose in a governed repository can list more Minor findings, and the scope review
  fixes them.
- A heading rename in `controlled-prose.md` breaks the lens's citation. A drift contract row pins each cited
  heading.
- Existing prompt prose carries em dashes and semicolons. A change review flags only the lines it edits, so
  that text surfaces only on a standing-code review.
