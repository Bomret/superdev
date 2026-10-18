# mods/superdev-view/

## Purpose

`mods/superdev-view/` is a maintainer-only Claude Code mod, a hooks module (`hooks/register.tsx`) that
draws a pane of the main working tree's `.superdev/` folder. This document states what the pane reads,
what it draws, how to install it, and how its tests run.

## Ownership

This document owns the mod's behaviour contract and its working steps. The root
[`AGENTS.md`](../../AGENTS.md) owns the mod's place in the repository: that no adopter install carries it,
and the fixture pins that couple it to `scope.js` and `plugin/hooks/run-trace.js`. Paths below that start
with `hooks/` name files in this folder. Paths that start with `plugin/` or `tests/` name files from the
repository root.

## Local Contracts

The mod reads only the items superdev's own docs define in `.superdev/` (`info.json`, `brainstorm/`,
`scopes/`, `kb-pending/`, `design/`, `dod-draft-<slug>.md`) and ignores every other entry. The pane draws
from the run files alone. It registers no hook on the session's subagent spawn, tool call, model step, or
turn end. It writes no file (INV-0135, ADR 0141).

The pane is a docked side tab, often narrow. On every surface, every word the pane shows is Text at the
host's own text size. An Svg in the pane holds no text, because the surface scales a drawing to the
pane's width, and text inside a scaled drawing shrinks with it. An Svg draws only a bar, at a fixed
height. A legend square is Text in its bar's fill. The terminal has no Svg and draws the same bars as colored glyphs, one glyph per slice in a scope's bar.

The overview is a column of collapsible cards: Brainstorm, Scopes, Pending knowledge-base pages, Design
sketches, and DoD drafts. Each card has a rounded, dim border. Its header shows the open mark and the
section name on the left, and the section's value on the right: the active and closed scope counts for
Scopes, the item count for the other cards. In a narrow pane the name gives up width, and the value
stays whole. A card's open state lives in the `sections` plugin state atom for the session, and a press
writes no file. The Scopes card first counts the slices of the active scopes: the share merged, a
stacked bar that keeps a segment for every status that has a slice, and one legend row per such status. A legend row shows the status as the
ledger records it. Then the card lists the active scopes, each row with its stage on the right, a bar segment per
slice, and its counts. The closed scopes follow as dim rows, the most recently closed first, by the
trace's `ledger stage set closed` line. A closed scope whose trace has no such line comes last. The card
shows the five most recently closed scopes. A fold below them shows the rest on a press and folds them
again, and its state lives in the `sections` atom like a card's. The other
cards draw one row per item, the label on the left and its value on the right. A scope row's name is a
Markdown link without a button's chrome. The pane answers a press on it and opens the scope page, the
scope run's event log, oldest first. No surface opens the link's URL. `eventLog` in `hooks/parse.ts` reads the
scope's ledger and `trace.log` to build it.

A header line opens each chain command the trace records as started. Its mark is done, stopped, or
running, and only the running header carries the elapsed time. Every command starts at its
`ledger step set` line. A repeated `step set` of one command is a start of its own. Until a
`step set plan` line has passed, the run's first `ledger init` at `planned` starts `plan`. Until a
`step set implement` line has passed, the first `implementing` stage write starts `implement`. A start
made from `ledger init` or the `implementing` stage write opens a fallback header. A later `step set` of
the same command takes that header over only when no log entry was drawn since. Otherwise the step line
ends the fallback command and opens a new one. An end line follows each command and shows its duration.
The header shows a stopped mark when the trace records a `step block` for it. A trace with no
`ledger step set` line that holds a stage write past `merged` was written before the step lines
existed. The pane draws each stage write after `implement` of such a trace as a plain line under no
command.

Between the headers the log draws these lines:
- one line per dispatch run, at the run's start time. An ended run shows the first `verdict` and
  `final-verdict` line of its dispatch, its outcome, and its duration. A run with no recorded end shows
  `running` and the time from its start to the scan's now, so each rescan advances it. A run that a
  `dispatch-resume` line reopened is marked `resumed`. A slice-review verdict shows its quality part
  alone when its spec part is `pass` or empty. Otherwise it shows `spec <value>` before the quality part.
- one group per slice that a trace line names.
- a wait of a minute or more between two commands.
- a date line on a day change.

A slice group sits where the first trace line naming the slice falls. Every later line whose slice
field names the slice draws inside the group, also after the slice merged or blocked, and under a later
command. The group holds the slice's dispatch runs, without the slice id. It holds a summary line for
each time the slice ran, when any count exists. The summary holds the path-test and suite run counts,
the review count, and the fail-to-pass outcome. A slice that ran more than once also keeps the end line
of each earlier run, with its status and duration. A slice that goes `blocked` and then `merged`, with no
`in-progress` line between, keeps the `blocked` end line too, because the header stands for the merge. A slice that only the ledger lists draws no group.
The group's header row shows these parts in order: the open mark, a time, the status mark, the slice id,
and the title. The time is the first `in-progress` time, or the first line's time when none exists. The
status mark comes from the latest `ledger slice` line of the run trace that names the slice. It is ✓
for `merged`, ✗ for `blocked`, and ▶ for `in-progress`, and absent for any other status. `review ×N`
counts the slice's completed slice-reviewer dispatches. A merged or blocked slice then shows the time
from its first start to its last end, and an `in-progress` slice shows `running` and the time from its
first start. A merged group starts closed, unless it holds a run with no recorded end. Every other group
starts open. The open mark is a Button beside the row's Text parts. A press writes the `groups` plugin
state atom, keyed by scope and slice id, for the session, and writes no file. The day-change rule runs
on the flat log and on each group's lines separately. The flat log dates a group by where it sits. A
group's own lines start from the day of its header time.

One dispatch can have several runs, because a `dispatch-resume` line reopens it. A dispatch can have a
run with no recorded end. A slice can have started and not ended. One line above the log counts those
dispatches and slices when any exist. One line after the log
names the commands still ahead, when any remain, or `closed` once the scope has closed. That ahead line
is absent when the trace records no command yet, when the trace predates the step lines and is past
`implement`, and when no command is left.

The pane cuts every log line to one row. Each line is a row Box of sibling Text parts, and no Text
holds a nested Text, because desktop wraps a nested Text at its child instead of cutting the line.
When a line is too wide, only the part that `row()` in `hooks/register.tsx` flags `shrink` gives up
width. Every other part keeps its width. On a dispatch run line it is the agent type and, outside a
group, the slice. On a header or command end line it is the command name. On a slice group
header it is the title, and a header with an empty title draws no title part. On an earlier run's end
line inside a group it is the status. On a stage, wait, date, or ahead line it is the label after the
time and mark. A slice summary line is one dim part that shrinks. A wait, date, or ahead line has only
that label part.

The scan reads a closed scope's whole trace while its page is open. Otherwise it reads that trace once, for
the close time, and keeps the time in memory, because a closed trace does not change. The scope stays in the list until
`plugin/hooks/scope-prune.js` reaps its run root. The pane attributes an agent to the scope whose trace
records it and to the slice that trace line names. Therefore `plugin/lib/dispatch.js`'s
`recordDispatch`, which `plugin/hooks/run-trace.js` calls, is the one attribution rule. `tests/run-trace-dispatch.test.js` holds its cases (INV-0136).

## Work Guidance

Install the mod into a session with `/plugin marketplace add <repo>/mods/superdev-view`, then
`/plugin install superdev-view@superdev-view` and `/reload-plugins`. Claude Code caches an install by
the `version` in the mod's own `.claude-plugin/plugin.json`, which is set by hand: a change reaches an
install only after that version is raised and `claude plugin update superdev-view@superdev-view` runs.

## Verification

The mod's own tests run under `claude plugin test mods/superdev-view`. `bun run test` runs none of them and
reads only the mod's shared fixture files. The focused command runs them when a changed path is under
`mods/superdev-view/`, so a `fail-to-pass` run over a mod-only range judges the mod's tests. The fixture
pins that couple `hooks/parse.ts` to the ledger and the run trace are stated in the root
[`AGENTS.md`](../../AGENTS.md), in the `mods/superdev-view/` entry of its Child DOX Index.

## Child DOX Index

None.
