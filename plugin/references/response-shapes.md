# Response shapes

A **Response shape** is a fixed layout for a message a command shows the operator (ADR 0113). This file
defines each one. A skill cites the shape it uses and restates none of it. Each section below is the
anchor a citation names.

## The Next block

Every message that `/superdev:brainstorm`, `/superdev:plan`, `/superdev:implement`, `/superdev:review`,
`/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`, `/superdev:verify-ship`, or
`/superdev:wrap-up` ends on closes with the Next block (INV-0111). The block holds, in this order:

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
