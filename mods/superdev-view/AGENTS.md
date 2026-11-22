# mods/superdev-view/

## Purpose

`mods/superdev-view/` is a maintainer-only Claude Code mod, a hooks module (`hooks/register.tsx`) that
draws a pane of the main working tree's `.superdev/` folder. This document states what the pane reads,
what it draws, how to install it, and how its tests run.

## Ownership

This document owns the mod's behaviour contract and its working steps. It also owns the mod's place in the
repository and the fixture pins that couple it to `scope.js`, `plugin/hooks/run-trace.js`, and `plugin/lib/run-lock.js`. Nothing under `plugin/` requires
the mod, and the root marketplace does not list it, so no adopter install carries it. Paths below that start
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

The main working tree follows the rule of `plugin/lib/main-work-tree.js`'s `mainWorkTree`. The pane asks git for
the shared git directory in the session's cwd. When that directory's own `config` sets `core.worktree`, the main
working tree is the checkout that value names, resolved against the git directory. A submodule takes this branch.
Otherwise the main working tree is the git directory's parent. A cwd outside a git repository, or a failed git
call, reads the cwd itself.

The overview opens with the assignee line, which names the issue-tracker account of `info.json` and no other
role. The line shows the `issue-tracker` role's `displayName`, trimmed, when that is a string with a non-blank
value. Otherwise it shows the role's `assignee` identifier, trimmed, when that is a non-blank string. An `assignee` of
`none`, with or without surrounding spaces, draws no line, whatever `displayName` holds. No such value draws no line, and neither does an `info.json`
that is unreadable, malformed, or no JSON object. The line keeps to one row: a long name is cut at its end. The
mod never asks the slice store for a name: `/superdev:setup` writes it into the file.
Below it, the path line names the main working tree, without the trailing `/.superdev`, and with the home
directory as `~`. A long path is cut at its start.

The overview is a column of collapsible cards: Brainstorm, Scopes, Pending knowledge-base pages, Design
sketches, and DoD drafts. Each card has a rounded, dim border. Its header shows the open mark and the
section name on the left, and the section's value on the right: the active and closed scope counts for
Scopes, the item count for the other cards. In a narrow pane the name gives up width, and the value
stays whole. A card's open state lives in the `sections` plugin state atom for the session, and a press
writes no file. The Scopes card first counts the slices of the active scopes: the share merged, a
stacked bar that keeps a segment for every status that has a slice, and one legend row per such status. A legend row shows the status as the
ledger records it. Then the card lists the active scopes, each row with its stage on the right, a bar segment per
slice, and its counts. The `DoD n/m` count, on a scope row and on the scope page's header line, follows the note
rule (`plugin/references/dod-ticks.md`'s `## The note rule`, INV-0190): `m` is every checklist line of the
scope's `dod.md`, and `n` is the lines whose verdict note is `met:` or `accepted:`, whatever their checkbox shows.
A bare tick, an unjudged line, and a line noted `not met:` or `ceiling:` count as open. `progress` in
`hooks/parse.ts` reads the note label as `plugin/lib/dod-line.js` reads it: of the tagged and untagged note boundaries, the one leaving the shorter criterion wins, and a U+2028 or U+2029 inside a line is text, not a line end. The closed scopes follow as dim rows, the most recently closed first, by the
trace's `ledger stage set closed` line. A closed scope whose trace has no such line comes last. The card
shows the five most recently closed scopes. A fold below them shows the rest on a press and folds them
again, and its state lives in the `sections` atom like a card's. The other
cards draw one row per item, the label on the left and its value on the right. When the session checkout
(`git rev-parse --show-toplevel`) is another tree than the main working tree, the DoD drafts and Design sketches
cards also list that checkout's own `.superdev/dod-draft-*.md` and `.superdev/design/*.html` files. For a slug
that both trees hold, the card lists the session checkout's copy. The pane compares the two trees as real paths
and reads nothing else from the session checkout. A scope row's name is a
Markdown link without a button's chrome. The pane answers a press on it and opens the scope page, the
scope run's event log, oldest first. No surface opens the link's URL. `eventLog` in `hooks/parse.ts` reads the
scope's ledger, `trace.log`, and the `run.lock` mtime to build it. `queuedMinors` in the same file reads the
ledger's `**Minors:**` bullets (the Minor queue, ADR 0174). The scope page draws the queue as one dim line under its
DoD line, `Minors queued: <id>, <id>`, cut to one row. An empty queue draws no line.

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
- one line per dispatch run, at the run's start time. An ended run shows its outcome and duration, from its
  `dispatch-end` line. The pane draws no review verdict: the run trace records none (ADR 0197), and a `verdict` or
  `final-verdict` line in a trace an older release wrote draws nothing. A run with no recorded end shows
  `running` and the time from its start to the scan's now, so each rescan advances it. When the scope's `run.lock`
  is an hour old or older at the scan's now, or absent, such a run shows `lock stale` and no time instead.
  `LOCK_STALE_MS` in `hooks/parse.ts` holds that bound, the run lock's own staleness threshold. A run that a
  `dispatch-resume` line reopened is marked `resumed`.
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
counts the slice's completed slice-reviewer dispatches. A dispatch is a slice-reviewer dispatch when the text after
the last `:` of its agent type is `slice-reviewer`, whatever prefix comes before it. A merged or blocked slice then shows the time
from its first start to its last end, and an `in-progress` slice shows `running` and the time from its
first start. A merged group starts closed, unless it holds a run with no recorded end. Every other group
starts open. The open mark is a Button beside the row's Text parts. A press writes the `groups` plugin
state atom, keyed by scope and slice id, for the session, and writes no file. The day-change rule runs
on the flat log and on each group's lines separately. The flat log dates a group by where it sits. A
group's own lines start from the day of its header time.

One dispatch can have several runs, because a `dispatch-resume` line reopens it. A dispatch can have a
run with no recorded end. A slice can have started and not ended. One line above the log counts those
dispatches and slices when any exist. That line and the overview row's `N running` count leave out a dispatch
whose run reads `lock stale`. They still count a started slice, because the ledger records it. One line after the log
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

The pane rescans every 3 s, on the `/superdev-view` command, and on a press on a scope row. At most one scan runs
at a time. A request while a scan runs queues one follow-up scan, which starts when the running scan ends. Every
later request in that window shares the follow-up. The command and a scope press therefore resolve only after a
scan that started after their own request. A scan that fails at any step stores nothing, so the pane keeps the
last snapshot until the next good scan. Before the first good scan, the pane shows its scanning notice.

The scan reads a closed scope's whole trace while its page is open. Otherwise it reads that trace once, for
the close time, and keeps the time in memory, because a closed trace does not change. The scope stays in the list until
`plugin/hooks/scope-prune.js` reaps its run root. The pane attributes an agent to the scope whose trace
records it and to the slice that trace line names. Therefore `plugin/lib/dispatch.js`'s
`recordDispatch`, which `plugin/hooks/run-trace.js` calls, is the one attribution rule. `tests/run-trace-dispatch.test.js` holds its cases (INV-0136).

## Work Guidance

Install the mod into a session with `/plugin marketplace add <repo>/mods/superdev-view`, then
`/plugin install superdev-view@superdev-view` and `/reload-plugins`. The mod's marketplace lists it with
the relative source `./`, so Claude Code loads it in place from this folder. An edit here, a `git pull`
included, takes effect at the next session start or `/reload-plugins`, with no raise of the `version` in
`.claude-plugin/plugin.json` and no `claude plugin update`
([plugin loading](https://code.claude.com/docs/en/plugins/loading.md#in-place-and-copied-plugins)).
Verified 2026-11-18, on Claude Code 2.1.311: `claude plugin update superdev-view@superdev-view` prints
that the mod is read from its folder and has nothing to update.

## Verification

The mod's own tests run under `claude plugin test mods/superdev-view`. `node scripts/run-tests.js` runs none of them and
reads only the mod's shared fixture files. The focused command runs them when a changed path is under
`mods/superdev-view/`. Each pane test case imports `test` from `hooks/testkit.ts`, which bounds a case at 60 s of wall
clock instead of the kit's 5 s default: the bound counts time a case spends descheduled and only catches a hang.

`hooks/parse.ts` reads the ledger, the run trace, and the Definition-of-Done lines that `scope.js` and
`plugin/hooks/run-trace.js` write. One fixture file and one pin hold each coupling:

- The ledger pin in `tests/scope-ledger.test.js` asserts that `scope.js` writes the lines in
  `hooks/ledger-fixtures.ts`.
- The reviewed-tip pin in `tests/scope-reviewed.test.js` asserts that `scope.js` writes the ledger in
  `hooks/ledger-fixtures.ts`'s `LEDGER_REVIEWED_LINES` and the trace lines in `hooks/trace-fixtures.ts`'s
  `TRACE_REVIEWED_LINES`, with its own sha and digest in the record's place.
- The trace pin in `tests/run-trace-dispatch.test.js` asserts that `plugin/hooks/run-trace.js` writes the lines in
  `hooks/trace-fixtures.ts`.
- The DoD line pin in `tests/scope-dod-line.test.js` asserts that `scope.js dod-line` writes the lines in
  `hooks/dod-fixtures.ts`, one per verdict, tagged and untagged (INV-0190). `tests/scope-dod-open.test.js` also reads
  `hooks/dod-fixtures.ts` and asserts that `scope.js dod-open` agrees with `dod-line` on every line in it.

- The lock pin in `tests/scope-open.test.js` asserts that `LOCK_STALE_MS` in `hooks/parse.ts` equals
  `plugin/lib/run-lock.js`'s `STALENESS_MS`.

`hooks/parse.test.ts` parses each fixture file. A change to the ledger, trace, or DoD line layout fails one of these
suites, so the change updates `hooks/parse.ts` and the fixture file together.

To type-check the mod, copy the main checkout's `mods/superdev-view/.claude-plugin/types/` into the working
checkout's same path, then run `npx -y -p typescript@5.6.3 tsc --noEmit -p mods/superdev-view/tsconfig.json`. The
tsconfig extends `.claude-plugin/types/tsconfig.json`, which exists only once the engine has loaded the mod. The
directory is gitignored, so nothing from it is committed. No CI job and no `run-tests.js` step runs the type check.

## Child DOX Index

None.
