# 0232: The loop runs its test files directly, and the focused command once

**Status:** Accepted

**Amends:** [ADR 0139](0139-a-test-first-step-runs-the-tests-it-works-on.md): a failing-test or passing-test step
runs its test files through `scope.js test path`, and the focused command runs once, over the whole changed-path set.
[ADR 0215](0215-fail-to-pass-reuses-a-traced-control.md): a reused control is a `path` run that ran at the tree root.

## Context

A full-tier run of 12 slices on a UI scope, read from its transcripts (triage records #158 and #162), spent about
157 of ~290 implementer minutes on tests or on waiting for them. The implementers made 51 focused runs (76 s on
average), about four per slice, 153 direct test-file runs (20 s on average), and 49 sleep polls of backgrounded runs
(50 s on average). `references/test-selection.md` called the focused command the one every step inside the loop runs,
and sent each failing-test and passing-test step through it. Every surface said that a suite longer than the Bash
tool's limit runs in the background, without naming the limit, and a run near the 2-minute default timeout was
backgrounded and polled. Bash takes a per-call `timeout` of up to 600 000 ms, which `BASH_MAX_TIMEOUT_MS` can raise
(code.claude.com/docs/en/tools-reference.md, checked 2026-11-12).

A `path` run line recorded no directory. `scope.js test path` runs its command from the current directory, and
`scope.js fail-to-pass` runs its command at the tree root, so a run made from a subdirectory with the same command
and file names could be reused as the control though it ran elsewhere (triage record #140).

## Decision

1. **A step runs its own test files directly.** Each failing-test or passing-test step of an implementer's loop and
   of the lite tier's inline loop runs the test files it works on through `scope.js test path <file>... -- <command>`,
   a runner filter allowed. The focused command runs once, over the whole changed-path set, as the last run before
   the fail-to-pass run. Where the focused fence repeats the full fence, the loop makes no whole-set run, as before.
2. **A test run takes the Bash ceiling and runs in the foreground.** Every test run passes Bash's `timeout` at its
   ceiling, 600 000 ms unless `BASH_MAX_TIMEOUT_MS` raises it. Only a run that can outlast the ceiling runs in the
   background. A drift check forbids the unnamed limit in shipped prose.
3. **A run line records the directory it ran in.** Every `run` trace line ends with the directory the command ran in,
   relative to the tree root, `.` at the root, normalized as ADR 0150 states. A line without the field decodes as
   before. `scope.js fail-to-pass` reuses as its control only a `path` line whose directory is `.`, and compares
   normalized file names.

## Considered options

- **Leave each step's command to the implementer.** It saves a prose change, but the per-step cost stays a judgment,
  and the measured run shows the judgment follows the reference that names the focused command.
- **Drop the final focused run.** It saves one run per slice, but the scope review's exit run would then be the
  first run of the other tests a slice's source change breaks.
- **Wait on a backgrounded run through the completion notification.** A command a foreground subagent started stops
  when that subagent's run ends (code.claude.com/docs/en/sub-agents.md, checked 2026-11-12), and the implementer is
  dispatched in the foreground, so a foreground run with the ceiling as its timeout is the route that holds.
- **Refuse `scope.js test path` outside the tree root.** It keeps the trace layout and superdev-view's parser
  unchanged, but takes away a subdirectory run from a repository whose runner needs one.

## Consequences

- A slice pays one focused run per build and one per fix cycle, where it paid about four.
- The run-line layout gains a field, so `mods/superdev-view/hooks/parse.ts`, its trace fixtures, and the trace pin in
  `tests/run-trace-dispatch.test.js` change with it.
- A run trace written before this decision offers no reusable control, and the fail-to-pass verb runs its own
  control there.
