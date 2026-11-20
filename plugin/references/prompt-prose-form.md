# Writing-standard review lens

## Prompt-prose form

**The gate.** Applies to a review in a repository whose glossary (`CONTEXT.md`) defines **Prompt concept**. A
repository whose glossary has no such entry gets no finding from this section, and its reviewers leave this file
unread. The repository's `## Writing standard` value plays no part in this gate. `review-checklist.md`'s `## Binding
rules` bind every lens of this section.

**The subject.** Applies to a review subject, a change or standing code. The subject is the one
`prompt-concept-overlap.md`'s `## Prompt-concept overlap` names. Read the governed set from the glossary's **Prompt
concept** entry.

- A change that edits only a reference section a governed body directs its reader to read is in the subject with no
  governed body in the diff.

**Lines judged.** Applies to every review this lens runs in. On a change, judge the prompt-prose lines the change adds
or edits. On standing code, judge the whole subject.

- A scope review, an ad-hoc range, and an inline-fix re-review each judge a change.

**Applied sections.** Applies to every judged line. Judge it by these sections of `controlled-prose.md`, cited by
heading: `## Words`, `## Verbs`, `## Sentences` without its word-limit rule, `## Definitions`, `## Procedures (strict
mode)` for its rules and never for strict mode's word limit, `## Headings, lists, tables, and references`, and
`## Punctuation`. Judge it also by `## Declare per language`, through the answers the reviewed repository states under
`### Declare per language` in its `docs/agents/documentation.md`.

- An answer the repository leaves unstated gives no rule, and the repository's labels for its answers can differ from
  that section's.

**Exempt sections.** Applies to every judged line. These parts of `controlled-prose.md` give no rule here: `## Scope`'s
file list and its voiced-prose rule, `## Modes`, the word limits of both modes, `## Descriptive text (relaxed mode)`,
`## Safety and error text (strict mode)`, `## How to count words`, and `## Self-check`.

- The exemption `## Scope` gives to code, identifiers, command syntax, file paths, configuration keys, fenced blocks,
  inline code spans, and quoted text holds here. An output template counts as fenced text.

**Precedence.** Applies to a line that a Prompt concept form or another lens also covers. A form the Prompt concept
convention requires draws no finding: the "Applies to …" condition head, the main-sentence form, and a statement an
invariant register entry requires. Report a defect that is also a **Prompt-concept overlap** finding or a
glossary-drift finding (`review-design-lenses.md`'s `## Consistency`) once, as the more specific finding.

- An `AGENTS.md` file stays under the writing standard alone, and this lens judges none of its lines.

**The finding.** Applies to every finding of this lens. Grade it **Minor**. Label it **Prompt-prose form**, and cite
the line's `file:line` and the controlled-prose heading or the per-language answer it breaks. A line whose broken
section you cannot name is no finding.

| Line | Verdict |
|---|---|
| "Utilize the ledger." added to a governed body | Minor: `## Words`, the shorter and more common word |
| "The ledger is read by the controller." added to a reference section a governed body directs its reader to | Minor: `## Verbs`, the active voice |
| A semicolon inside an inline code span | no finding: `## Scope` exempts code spans |
| "Applies to every dispatch." as a concept's condition head | no finding: the Prompt concept convention requires the head |
| An instruction sentence of 30 words | no finding: the word limits are exempt |
| A line of an `AGENTS.md` file | no finding: the writing standard alone governs that file |
| A spelling the repository's per-language answers do not decide | no finding: an unstated answer gives no rule |
