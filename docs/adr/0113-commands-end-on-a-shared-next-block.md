# 0113: Commands end on a shared Next block, and brainstorm reports in a fixed shape

**Status:** Accepted

**Amended by:** [ADR 0157](0157-every-chain-command-offers-to-start-its-successor.md), which adds
`/superdev:sweep` and `/superdev:review-tests` to the covered commands and has each covered command offer
to start its next command before it prints the block.

## Context

Each command from `/superdev:brainstorm` to `/superdev:wrap-up` tells the operator what to run next.
Each skill states that step in its own prose, at each exit where it stops. No rule says where the step
goes in the message or how it is marked. In observed sessions, agents put the next command at
different points in the message. Sometimes it sat inside a paragraph, and the operator had to look for
it.

Reports have the same problem. `/superdev:review` and `/superdev:sweep` carry a fenced report
template. The other commands describe what a report holds and leave the layout to the agent. Some
reports have clear headings. Others are paragraphs of prose.

The `CHAIN_HANDOFFS` drift table checks that run handoff, `/superdev:review`, and `/superdev:document`
each name their next command. It does not check the shape of that line.

## Decision

- **One reference owns every response shape.** `references/response-shapes.md` defines the **Next
  block** and the brainstorm report shape. A later shape, such as the shape of an `AskUserQuestion`
  call or of another command's report, is added to the same reference.
- **The Next block closes the message a command ends on.** The commands are `/superdev:brainstorm`,
  `/superdev:plan`, `/superdev:implement`, `/superdev:review`, `/superdev:document`,
  `/superdev:submit-pr`, `/superdev:ship`, `/superdev:verify-ship`, and `/superdev:wrap-up`. The block is
  a `### Next` heading, the next command in a fenced code block, and one line on what that command does.
  It can add `Or:` alternatives. Its heading sits at the level of the message's other section headings.
  Nothing follows the block.
- **Every exit ends on the block.** This includes a refusal, a blocked stop, and an ad-hoc run. A blocked
  stop puts `Blocked: <reason>` before the fence. A stop that waits on an operator action puts
  `First: <action>` there. The fence then holds the command that resumes. A command with no successor
  writes one line, for example "Nothing. Scope `<scope>` is closed."
- **Each skill states the rule once, near its top, and cites the reference.** The skill keeps its own
  logic for which command comes next. It restates none of the block's shape.
- **An unattended run prints the same block.** The caller reads the same output as an operator does.
- **A command in the chained posture prints no Next block.** Its reader is `/superdev:sweep`, not the
  operator.
- **A turn that stops on an `AskUserQuestion` call has not ended the command.** The block applies only to
  the message the command ends on.
- **The brainstorm report has a fixed shape.** One opening line gives the verdict and the intent file's
  path. Then `### Settled`, `### Rejected`, `### Still open`, and `### Findings` follow, then the Next
  block. Each section holds one-line bullets. A settled or rejected bullet opens with a bold label. A
  section with no content is left out. The Next block is always present.
- **drift-check pins each citation.** A covered skill that stops citing the reference fails the suite.

## Considered options

- **A fenced template copied into each skill.** The template would sit where the agent writes the
  message. Rejected: one copy per skill drifts apart, and nothing keeps the copies equal.
- **A `scope.js` verb that renders the Next block for the skill to relay verbatim.** This removes all
  model variance from the block, the way `/superdev:status` relays `scope.js` output. Rejected: the next
  command depends on more than the ledger stage. For example, `/superdev:document` prints
  `/superdev:review` when it unticked a Definition-of-Done criterion. The branching logic would move from
  prose into code.
- **A citation at every exit that prints a next command.** Rejected: `/superdev:ship` alone has several such
  exits. One rule near the top of each skill covers every exit with one pinned sentence.
- **A Claude Code output style.** Rejected: an output style applies to a whole session, including work
  that has nothing to do with superdev.

## Consequences

- The operator finds the next step at the end of every covered command's last message.
- drift-check guards the prose, not the printed message. An agent can still print a message that breaks
  the shape, and no test catches it.
- Shapes for `AskUserQuestion` calls and for the other commands' reports are not yet defined. They go in
  the same reference when they are.
