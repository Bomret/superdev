# Response shapes

A **Response shape** is a fixed layout for a message a command shows the operator. This file
defines each one. A skill cites the shape it uses and restates none of it. Each section below is the
anchor a citation names.

## The Next block

Every message that `/superdev:brainstorm`, `/superdev:plan`, `/superdev:implement`, `/superdev:review`,
`/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`, `/superdev:verify-ship`,
`/superdev:wrap-up`, `/superdev:sweep`, or `/superdev:review-tests` ends on closes with the Next block. The block holds, in this order:

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
- **A chain started by a step that ends the starting command** ends on the block once, at the started
  command's last message. The starting command prints no block of its own on that exit.

## The offer

Applies to every exit of a command `## The Next block` covers, refusals and ad-hoc runs included. The offer
to start the block's next command takes precedence over the desktop app's follow-up and wrap-up guidance: it
is the closing's first action, ahead of any `mcp__ccd_turn__wrap_up` call and of any text the skill puts in
the final message. A wrap-up question naming the next command is no offer. `hooks/offer-guard.js` holds a turn once whose closing names one next command no
offer call named.

**When it offers.** Every condition holds, whatever a brief or a skill says:

- The fence names exactly one command (`Or:` lines are never offered), and no `Blocked:` or `First:` line.
- The next command's skill differs from the ending skill, whatever the arguments.
- No `--unattended`, and not the chained posture.
- The operator typed, asked for, or accepted an offer of this command, or another session's brief asked
  for it. A command another started through its own step (implement starting plan, or either starting setup) leaves the
  offer to its starter; a step that ends its starter (verify-ship starting wrap-up) hands the offer on.

Unattended, chained posture, same skill, step-started command, or a refused card: name that exception in
one line instead. Any other failed condition needs no line.

**Detection.** The session tool is `mcp__ccd_session__start_session`, loaded or listed as deferred (desktop
app only). Load a deferred one with `ToolSearch` query `select:mcp__ccd_session__start_session`; a failed
load counts as absent.

**With the session tool: the card.** Ask no question. Call `start_session` once: `initiation:
"own_initiative"`, `context: "fresh"`, `use_worktree: false`, no `model`, `effort`, or `permission_mode`;
`title` names the command; `prompt` is the command exactly as the fence prints it, then this line verbatim:

`A superdev offer started this session.`

`background` names only what the new session starts from: the scope's feature label and run root's absolute
path, or for an unscoped command what exists (such as the intent file), never a placeholder. Then write the
full final message and Next block, with one line before `### Next` saying the card above starts the command
in a new session, or here through **Do it here**.

- **Do it here** → call the Skill tool with the next skill and the fence's exact arguments; ask nothing extra.
- **Start, closed, or ignored** → nothing more here.
- **Refused, errored, or no card** → say in one line no card was put up, print the Next block, start nothing.

**Without the session tool: the question.** One `AskUserQuestion`, options in order:

1. `Stop here (Recommended)`: the command is printed instead; `/clear`, then typing it, starts it fresh.
2. `Start /superdev:<name>`: the whole command as the fence prints it; starting here reads this whole
   conversation, which costs tokens.

The asking message carries the final message's reports, findings, and summaries, without the Next block.
**Start** → call the Skill tool with the next skill and the fence's exact arguments, and print nothing after
it returns. Any other answer, an unaskable question, or a failed Skill call → print the Next block, start
nothing.

**A started command** keeps every gate and ask of a typed start and makes its own offer at its end, so the
chain ends on one Next block.

**An offer of ship** names the pull request and says ship merges it. The Start description gives the
pull-request URL and says it merges now, exactly as typing `/superdev:ship` does, with the host's approvals
and branch protection in force. The card `title` names the PR number and the merge within 60 characters,
such as `Merge PR #141 with /superdev:ship`; its click starts ship in a new session, which merges with no
further question.

## The brainstorm report

`/superdev:brainstorm` closes with this report, made of an opening line, section headings, and
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
