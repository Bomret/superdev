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
(ADR 0157, ADR 0176, ADR 0183, INV-0111). The operator answers one question. Where the session carries the
desktop app's session tool, the offer recommends starting the next command in a new session with a fresh
context, through a New task card the operator starts.

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

**Detection.** The session carries the session tool when `mcp__ccd_session__start_session` is loaded, or
listed as a deferred tool. Only the Claude desktop app provides it (`docs/known-issues.md`, *The session
tool exists only in the Claude desktop app*). A deferred tool is loaded with `ToolSearch`, query
`select:mcp__ccd_session__start_session`, before the call that proposes the session.

**The question.** Ask one `AskUserQuestion` with one question. With the session tool, offer these options,
in this order:

1. **Start in a new session.** The label is `Start /superdev:<name> in a new session (Recommended)`. The
   description carries the whole command with its arguments exactly as the fence prints them, and says it
   puts up a New task card whose one click starts the command in a fresh context in this checkout.
2. **Start.** The label names the command, `Start /superdev:<name>`. The description carries the whole
   command with its arguments exactly as the fence prints them, and one line on what it does.
3. **Stop here.** The description says the command is printed instead.

Without the session tool, offer these options, in this order:

1. **Stop here.** The label is `Stop here (Recommended)`. The description says the command is printed
   instead, and that `/clear`, then typing the command, starts it with a fresh context.
2. **Start.** The label names the command, `Start /superdev:<name>`. The description carries the whole
   command with its arguments exactly as the fence prints them, and says that a command started here
   reads this whole conversation, and that this costs tokens.

The message that asks carries the command's whole final message except the Next block: its reports,
findings, and summaries. It carries no Next block, because a turn that asks has not ended the command.

**The answer.**

- **Start in a new session** → load the tool if it is deferred, then make one `start_session` call:
  `initiation: "own_initiative"`, `context: "fresh"`, `use_worktree: false`, and no `model`, `effort`, or
  `permission_mode`, so the new session inherits this session's own. The `title` names the command. The
  `prompt` is the command exactly as the fence prints it, then this marker line, verbatim:

  `A superdev offer started this session.`

  The `background` names what the new session starts from. A command with a scope names the scope's
  feature label and its run root's absolute path. A command with no scope names only what exists, such as
  the intent file a bare `/superdev:plan` reads, and never a placeholder for a scope it lacks.
  The call proposes the session and starts nothing: the app shows a New task card in the transcript, and
  the session starts when the operator clicks it. The app refuses a `user_asked` start in a turn that
  another session's prompt began, which is every turn of a session an offer started, so the card is the
  one path that holds on every edge (`docs/known-issues.md`, *The session tool exists only in the Claude
  desktop app*). The call returns the card → end on the Next block, exactly as without this section. One
  line right before `### Next` says the card above starts the command in a new session, and that this
  conversation can be closed once it runs. The block prints the same command, so the operator can still
  type it here.
- **Start** → call the Skill tool with the next command's skill and exactly the arguments the fence would
  print, one skill per call. The started command keeps every gate and every ask it has when the operator
  types it, and its own last message follows this section again. The offering command prints nothing after
  the started command returns, so the last message of the chain carries the one Next block.
- **A proposal the tool refuses, that errors, or that returns no card** → say in one line that no card
  was put up, print the Next block exactly as without this section, and start nothing in this
  conversation.
- **Stop here, any other answer, a question the platform cannot ask, and a start the Skill tool refused,
  errors, or finds no such skill** → print the Next block exactly as without this section, and start
  nothing.

**The started command offers again.** A command an offer's new-session prompt started, its text followed
by the marker line, was started through an offer, so its own end follows this section by the same rule. An unattended run and a command in the
chained posture make no offer, so they propose no session either.

## The brainstorm report

`/superdev:brainstorm` closes with this report (INV-0112), made of an opening line, section headings, and
one-line bullets. It carries no paragraph of prose.

1. **One opening line.** The verdict, then the intent record's store reference after a store handoff
   (`references/intent-handoff.md`), or the path of the intent file for a draft or the handoff's fallback,
   where the line also says the intent exists only in this checkout and names the cause. A discovery that
   wrote no intent file gives the verdict alone, with no path.
2. **`### Settled`.** One bullet per settled decision, as `- **<decision>:** <one line>`.
3. **`### Rejected`.** One bullet per rejected direction, as `- **<direction>:** <one line on why it lost>`.
4. **`### Still open`.** One one-line bullet per decision left open.
5. **`### Findings`.** One one-line bullet per fact the discovery found in the code or the docs.
6. **The Next block**, per `## The Next block` above.

Leave out a section with no bullet. The Next block is always present.
