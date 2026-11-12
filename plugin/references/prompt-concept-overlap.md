# Prompt-concept overlap — the overlap test for governed prompt prose

## Prompt-concept overlap

Applies to a review subject, a change or standing code, that includes a governed body or a reference
section a governed body directs its reader to read, in a repository whose glossary (`CONTEXT.md`) defines
**Prompt concept**. A governed body is an agent body, or a skill file the glossary's **Prompt concept**
entry lists. Read the governed set from that entry. A repository whose glossary has no such entry gets no
finding from this section, and its reviewers leave this file unread. `review-checklist.md`'s `## Binding rules` bind every lens below.

- **The test.** Two sentences overlap when they apply under the same condition and give the same
  instruction, so deleting either one leaves every dispatch's instructions unchanged. Apply it to a pair
  inside one governed body, and to a pair of one body sentence and one sentence in a reference section the
  body directs its reader to read. A change that edits only such a reference section gets the test on
  every pair that section forms with a body that directs its reader to it.
- **A dispatch sentence.** In a listed skill file, a sentence the controller relays to an agent, as the
  text of a dispatch or as an instruction the dispatch hands the agent, forms a pair with the sentences of
  the agent body it reaches. Judge that pair by the test above. A sentence that tells the controller what
  to do, such as when to dispatch, what to read, or what to do with the report, is a controller-only
  instruction and forms no pair, even where it names agent behaviour. To tell the two apart, ask who acts
  on the sentence: the agent receives and acts on a relayed sentence, and the controller acts on a
  controller-only one. Dispatch prose of a skill the glossary does not list stays outside the test.
- **Not an overlap.** A sentence that adds a condition, an exception, or a different effect. A pointer that
  names a prompt concept or a reference section and adds no instruction of its own. A statement an
  invariant register entry requires in that governed body. A pointer that
  also restates its target's instruction is a restatement, and the test applies to the restated part. A
  pair that is no overlap can still differ, and `Grades` judges it.
- **Grades.** A same-instruction pair is **Minor**. A pair that instructs differently for one situation is
  **Important**, the glossary's No conflict invariant, unless one of the two sentences names the rule it
  departs from: "instead of", "except", or a pointer to that concept. A narrower condition alone states no
  precedence.
- **The finding.** Label it **Prompt-concept overlap**, and cite both `file:line`s, the shared condition,
  and the shared instruction. A pair whose shared condition or shared instruction you cannot name is no
  finding.

| Pair | Verdict |
|---|---|
| "Applies to every dispatch. You report to the controller." beside "On every dispatch, report to the controller." | Minor: same condition, same instruction |
| "Name the specific smell." beside "For a security finding, also name the vulnerability class." | no finding: the second adds a condition and an effect |
| "Apply `## Binding rules` in `review-checklist.md` to every finding." beside that section | no finding: a pointer that adds no instruction |
| "Run the suite once." beside "On a docs slice, run no suite." | Important: neither sentence names the rule it departs from |
| A listed skill's dispatch sentence "Run the suite once." beside the agent body's "Run the suite once." | Minor: the controller relays the sentence, so it forms a pair with the body it reaches |
| A listed skill's "Dispatch the reviewer after the merge." beside the agent body's "Review the merge." | no finding: the first tells the controller when to dispatch and forms no pair |
| A change that edits only a reference section, whose sentence repeats a sentence of the agent body that directs its reader to it | Minor: the section forms the pair, although no body is in the diff |
