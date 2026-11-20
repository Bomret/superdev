# Response shapes

A **Response shape** is a fixed layout for a message a command shows the operator. This file defines each one, and
each `##` section is the anchor a citation names. A skill cites the shape it uses and restates none of it.

## The Next block

**The block.** Applies to every message that `/superdev:brainstorm`, `/superdev:plan`, `/superdev:implement`,
`/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`, `/superdev:verify-ship`,
`/superdev:wrap-up`, `/superdev:sweep`, or `/superdev:review-tests` ends on. Close it with the Next block, which holds
these parts in this order. Nothing follows the block.

1. A `### Next` heading.
2. The next command in a fenced code block, arguments resolved.
3. One line on what that command does.
4. Optional `Or:` lines, one per alternative command, each with one line on what it does.

**The skill's answer.** Applies to the command the block names. The skill keeps its own logic for which command comes
next, and the block carries that answer.

### Variants

**The variants.** Applies to an exit that is not a plain hand-off.

- **Blocked.** A blocked stop puts `Blocked: <reason>` on a line before the fence. The fence holds the command that
  resumes the run.
- **Waiting on the operator.** A stop that waits on an action only the operator can take puts `First: <action>` on a
  line before the fence. The fence holds the command that follows the action.
- **No successor.** A command with no next command keeps the heading and writes one line in place of the fence and its
  description, such as "Nothing. Scope `<scope>` is closed."

### Where it applies

**Where it applies.** Applies to every exit of the commands **The block** names.

- **Every exit.** A hand-off, a refusal, a blocked stop, an ad-hoc run, and a command with no successor each end on
  the block.
- **An unattended run** prints the same block. The caller that passed `--unattended` reads the output an operator
  reads.
- **The chained posture** prints no block. A command run as a `/superdev:sweep` leg returns its findings to
  `/superdev:sweep`, which is its reader.
- **A turn that stops on an `AskUserQuestion` call** has not ended the command. The block closes the message the
  command ends on, never a turn that asks.
- **A chain started by a step that ends the starting command** ends on the block once, at the started command's last
  message. The starting command prints no block of its own on that exit.

## The chain start

**The successors.** Applies to every exit of a chain command: `/superdev:implement`, `/superdev:review`,
`/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`, and `/superdev:verify-ship`. Each starts its own
successor, and only that one. Its own skill names the exit that starts.

- implement starts review, review starts document, and document starts submit-pr.
- submit-pr starts ship on the yes to its ship question.
- ship starts verify-ship or wrap-up on those routes, and verify-ship starts wrap-up at its settled exit.

**The repair loop at `submitted`.** Applies to a scope at `submitted`, after a ship refusal. Review starts document
when it unticked the `docs` line, and ship otherwise, and document starts ship. Each start of ship there asks `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" consent --root <run-root>` first, and starts only on `carried` in an attended
run.

- **`none`, or an unattended run** → print ship instead of starting it.

**When it starts.** Applies to every exit of a chain command. It starts only when every condition holds. Every other
exit prints its Next block and starts nothing.

- The exit is the one its skill names as a start.
- The Next block it would print names exactly that one command, with no `Or:`-only alternative chosen and no
  `Blocked:` or `First:` line. A refusal or a non-clean review verdict starts nothing.
- The run is a live scope: never an ad-hoc run, and never the chained posture of a `/superdev:sweep` leg.

**A typed command.** Applies to a chain command the operator typed on a live scope. It chains on from there, exactly
as one its predecessor started.

**How it starts.** Applies to every start. Run these steps in order, as the first action of the closing, ahead of any
`mcp__ccd_turn__wrap_up` call and of any closing text, and with no question first:

1. Close its own step, with `step clear` or the stage write its skill names, then publish its run state.
2. Call the Skill tool with the successor's skill and the arguments the Next block would print, plus `--unattended`
   when its own run is unattended.

**After the start.** Applies once the successor is started. The started command owns the last message. The starter
prints no Next block on that exit and nothing after the started command returns.

- **A start the Skill tool refuses or fails** → print the starter's Next block, naming the command it did not start.

**The started command's limits.** Applies to every started command. It takes its gates, questions, and bars from its
own skill alone. A step-scoped bar of the starter, such as review's integration bar or document's bar on test runs,
ends at the start.

## The brainstorm report

**The report.** Applies to `/superdev:brainstorm`'s closing message. Close with this report, made of an opening line,
section headings, and one-line bullets, in this order. It carries no paragraph of prose.

1. **One opening line.** The verdict, then the intent record's store reference after a store handoff
   (`references/intent-handoff.md`), or the path of the intent file for a draft or the handoff's fallback, where the
   line also says the intent exists only in this checkout and names the cause. A discovery that wrote no intent file
   gives the verdict alone, with no path.
2. **`### Settled`.** One bullet per settled decision, as `- **<decision>:** <one line>`.
3. **`### Rejected`.** One bullet per rejected direction, as `- **<direction>:** <one line on why it lost>`.
4. **`### Still open`.** One one-line bullet per decision left open.
5. **`### Findings`.** One one-line bullet per fact the discovery found in the code or the docs.
6. **`### Intent challenge`.** The challenge outcome on every exit that reached §4: one bullet per finding, `- none
   found`, or `- not run: <reason>`.
7. **The Next block**, per `## The Next block`.

**Empty sections.** Applies to every section of the report. Leave out a section with no bullet. `### Intent challenge`
always has a bullet once the brainstorm reached §4, and the Next block is always present.
