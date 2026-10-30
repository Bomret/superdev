# 0201: The offer puts up the card first

**Status:** Accepted

**Amends:** [ADR 0183](0183-the-offer-proposes-the-new-session-as-a-card.md) points 1 and 3, and
[ADR 0176](0176-the-offer-recommends-a-new-session.md) points 1 and 5.

## Context

Under ADR 0176 and ADR 0183, an offer with the desktop app's session tool asks one `AskUserQuestion` with
three options. Its recommended answer then puts up a New task card, and the card needs a second click. The
card itself carries a **Do it here** button, which runs the work in the conversation that proposed it. The
question's *Start* option and the card's *Do it here* button do the same thing.

A command whose first message is another session's brief made no offer. The offer contract excludes a
command "another command starts through its own step", and that wording also read as covering a parent
session's brief. A session that a plan run started for `/superdev:implement` therefore ended with no offer
of `/superdev:review`.

## Decision

1. **With the session tool, the offer is the card.** The command asks no `AskUserQuestion`. It makes one
   `start_session` proposal, `initiation: "own_initiative"`, with the prompt, `context`, `use_worktree`,
   and `background` ADR 0176 states, and ends on its Next block. One line before `### Next` names the card.
2. **The card's buttons are the answers.** *Do it here* runs the next command in the same conversation
   through the Skill tool, with the fence's arguments, and asks no extra question. The new-session button
   starts it in a new session. A closed or ignored card starts nothing.
3. **Without the tool, the question stays.** A tool that is absent, or that fails to load, gets the two
   options ADR 0176 point 2 states: *Stop here* recommended, then *Start*.
4. **A brief counts as asked for.** A chain command another session's brief asked for makes the offer,
   when every other condition holds. A parent session's brief is not one command starting another through
   its own step. No mechanism detects a brief: the command sees its own first message.
5. **A brief is no consent.** `/superdev:ship`, `/superdev:verify-ship`, and `/superdev:wrap-up` started
   by another session's brief ask the operator one yes first, as a start from the offer's card does.

## Considered options

- *Keep the question, and put up the card on the new-session answer.* Two clicks for the recommended path,
  and two of the four answers duplicate the card's own buttons.
- *Detect a parent-session brief by its text.* The brief is model-written, and the command already sees
  that its first message came from another session.

## Consequences

The recommended path costs one click. The operator who wants the command here clicks *Do it here*. A
closed card leaves the Next block in the transcript, which still prints the command. A session started
from a brief offers its successor, so a plan session's implement child offers review. The consent-gated
commands treat a brief as they treat a card's prompt.
