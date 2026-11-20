# Sentence-pair review lens

## Prompt-concept overlap

**The gate.** Applies to a review in a repository whose glossary (`CONTEXT.md`) defines **Prompt concept**. A
repository whose glossary has no such entry gets no finding from this section, and its reviewers leave this file
unread. `review-checklist.md`'s `## Binding rules` bind every lens of this section.

**The subject.** Applies to a review subject, a change or standing code, that includes a governed body or a reference
section a governed body directs its reader to read. A governed body is an agent body, or a file the glossary's
**Prompt concept** entry lists. Read the governed set from that entry.

**The test.** Applies to every pair of sentences in the subject. Two sentences overlap when they apply under the same
condition and give the same instruction, so deleting either one leaves every dispatch's instructions unchanged.

- **Within one governed body** → test every pair inside it.
- **A body and a reference section** → test every pair of one body sentence and one sentence in a reference section
  the body directs its reader to read.
- **A change that edits only such a reference section** → test every pair that section forms with a body that
  directs its reader to it.

**A dispatch sentence.** Applies to a sentence in a listed skill or reference file that the controller relays to an
agent, as the text of a dispatch or as an instruction the dispatch hands the agent. It forms a pair with each sentence
of the agent body it reaches, and with each sentence of every reference section that agent body directs its reader to
read. Judge each pair by **The test**.

- **A controller-only instruction** → a sentence that tells the controller what to do, such as when to dispatch, what
  to read, or what to do with the report. It forms no pair, even where it names agent behaviour.
- **Telling the two apart** → ask who acts on the sentence: the agent acts on a relayed sentence, and the controller
  acts on a controller-only one.
- **Dispatch prose of a file the glossary does not list** stays outside the test.

**Not an overlap.** Applies to a pair the test formed.

- A sentence that adds a condition, an exception, or a different effect.
- A pointer that names a prompt concept or a reference section and adds no instruction of its own. A pointer that also
  restates its target's instruction is a restatement, and the test applies to the restated part.
- A statement an invariant register entry requires in that governed body.
- A pair that is no overlap can still differ, and **Grades** judges it.

**Grades.** Applies to every pair that overlaps or differs. A same-instruction pair is **Minor**. A pair that
instructs differently for one situation is **Important**, the glossary's No conflict invariant, unless one of the two
sentences names the rule it departs from: "instead of", "except", or a pointer to that concept.

- A narrower condition alone states no precedence.

**The finding.** Applies to every finding of this lens. Label it **Prompt-concept overlap**, and cite both `file:line`s,
the shared condition, and the shared instruction. A pair whose shared condition or shared instruction you cannot name
is no finding.

| Pair | Verdict |
|---|---|
| "Applies to every dispatch. You report to the controller." beside "On every dispatch, report to the controller." | Minor: same condition, same instruction |
| "Name the specific smell." beside "For a security finding, also name the vulnerability class." | no finding: the second adds a condition and an effect |
| "Apply `## Binding rules` in `review-checklist.md` to every finding." beside that section | no finding: a pointer that adds no instruction |
| "Run the suite once." beside "On a docs slice, run no suite." | Important: neither sentence names the rule it departs from |
| A listed skill's dispatch sentence "Run the suite once." beside the agent body's "Run the suite once." | Minor: the controller relays the sentence, so it forms a pair with the body it reaches |
| A listed reference's dispatch sentence "Run the suite once." beside "Run the suite once." in a reference section the agent body directs its reader to read | Minor: the relayed sentence forms a pair with that section too |
| A listed skill's "Dispatch the reviewer after the merge." beside the agent body's "Review the merge." | no finding: the first tells the controller when to dispatch and forms no pair |
| A change that edits only a reference section, whose sentence repeats a sentence of the agent body that directs its reader to it | Minor: the section forms the pair, although no body is in the diff |
