# Response shapes

A **Response shape** is a fixed layout for a message a command shows the operator (ADR 0113). This file
defines each one. A skill cites the shape it uses and restates none of it. Each section below is the
anchor a citation names.

## The Next block

Every message that `/superdev:brainstorm`, `/superdev:plan`, `/superdev:implement`, `/superdev:review`,
`/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`, `/superdev:verify-ship`,
`/superdev:wrap-up`, `/superdev:sweep`, or `/superdev:review-tests` ends on closes with the Next block
(INV-0111). The block holds, in this order:

1. A `### Next` heading.
2. The next command in a fenced code block, arguments resolved.
3. One line on what that command does.
4. Optional `Or:` lines, one per alternative command, each with one line on what it does.

Nothing follows the block. A skill keeps its own logic for which command comes next, and the block
carries that answer.

### Variants

- **Blocked.** A blocked stop puts `Blocked: <reason>` on a line before the fence. The fence holds the
  command that resumes the run.
- **Waiting on the operator.** A stop that waits on an action only the operator can take puts
  `First: <action>` on a line before the fence. The fence holds the command that follows the action.
- **No successor.** A command with no next command keeps the heading and writes one line in place of the
  fence and its description, such as "Nothing. Scope `<scope>` is closed."

### Where it applies

- **Every exit.** A hand-off, a refusal, a blocked stop, an ad-hoc run, and a command with no successor
  each end on the block.
- **An unattended run** prints the same block. The caller that passed `--unattended` reads the output an
  operator reads.
- **The chained posture** prints no block. A command run as a `/superdev:sweep` leg returns its findings
  to `/superdev:sweep`, which is its reader.
- **A turn that stops on an `AskUserQuestion` call** has not ended the command. The block closes the
  message the command ends on, never a turn that asks.
- **A chain started by an offer** ends on the block once, at its last message, per `## The offer` below.

## The offer

Each command `## The Next block` covers offers to start its next command before it prints the block
(ADR 0157, INV-0111). The operator answers one question, and a yes starts the command in this
conversation.

**When it offers.** Offer when every condition below holds, at every exit, a refusal and an ad-hoc run
included:

- The Next block names exactly one next command in its fence. An `Or:` line is printed and never offered.
- The block carries no `Blocked:` line and no `First:` line.
- The next command's skill differs from the skill that is ending, whatever the arguments.
- The run is attended: the arguments carry no `--unattended`, and the command does not run in the chained
  posture.
- The operator typed the command, asked for it, or started it through an offer. A command another command
  starts through its own step, such as `/superdev:implement` starting `/superdev:plan` or either starting
  `/superdev:setup`, makes no offer: the command that started it owns the hand-off.

A skill that states conditions of its own for the offer adds them to these.

**The question.** Ask one `AskUserQuestion` with one question and two options:

1. **Start.** The label names the command, `Start /superdev:<name>`. The description carries the whole
   command with its arguments exactly as the fence prints them, and one line on what it does.
2. **Stop here.** The description says the command is printed instead, and that `/clear`, then typing the
   command, starts it with a fresh context: a command started here reads this whole conversation, and that
   costs tokens.

The message that asks carries the command's whole final message except the Next block: its reports,
findings, and summaries. It carries no Next block, because a turn that asks has not ended the command.

**The answer.**

- **Start** → call the Skill tool with the next command's skill and exactly the arguments the fence would
  print, one skill per call. The started command keeps every gate and every ask it has when the operator
  types it, and its own last message follows this section again. The offering command prints nothing after
  the started command returns, so the last message of the chain carries the one Next block.
- **Stop here, any other answer, a question the platform cannot ask, and a start the Skill tool refused,
  errors, or finds no such skill** → print the Next block exactly as without this section, and start
  nothing.

## The brainstorm report

`/superdev:brainstorm` closes with this report (INV-0112), made of an opening line, section headings, and
one-line bullets. It carries no paragraph of prose.

1. **One opening line.** The verdict, then the path of the intent file. A discovery that wrote no intent
   file gives the verdict alone, with no path.
2. **`### Settled`.** One bullet per settled decision, as `- **<decision>:** <one line>`.
3. **`### Rejected`.** One bullet per rejected direction, as `- **<direction>:** <one line on why it lost>`.
4. **`### Still open`.** One one-line bullet per decision left open.
5. **`### Findings`.** One one-line bullet per fact the discovery found in the code or the docs.
6. **The Next block**, per `## The Next block` above.

Leave out a section with no bullet. The Next block is always present.
