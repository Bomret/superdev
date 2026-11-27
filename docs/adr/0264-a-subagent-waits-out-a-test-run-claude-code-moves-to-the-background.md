# 0264: A subagent waits out a test run Claude Code moves to the background

**Status:** Accepted

**Amends:** [ADR 0232](0232-the-loop-runs-test-files-and-the-focused-command-once.md), whose foreground rule with
the Bash ceiling stands.

**Amended by:** [ADR 0291](0291-test-runs-share-per-repository-slots-and-wait-in-the-background.md), which extends this background wait to every test run, fail-to-pass run, and prepare call, in the main session too.

## Context

ADR 0232 runs every test run in the foreground with Bash's `timeout` at its ceiling, on the premise that such a run
holds until it ends. Inside a dispatched subagent, Claude Code moves a foreground Bash call to the background after
180 s, whatever its `timeout` (`docs/known-issues.md`, *A subagent's foreground Bash call moves to the background
after 180 s*). From 2026-11-14 to 2026-11-20, 31 test runs in subagents were moved to the background. `scope.js test` prints no
line that marks a run's end, so each implementer improvised its wait: `pgrep` loops, `sleep` chains the tool
refused, and polls on markers of its own. A moved command stops when the subagent's run ends, and no tool the
implementer holds blocks until it ends.

## Decision

A subagent redirects every test run and fail-to-pass run to a file outside the working tree and appends the
command's exit status to that file, as `exit=<status>`. When Bash returns the call as moved to the background, the
subagent waits for that line with repeated Bash calls that each end within 170 s, then reads the file. It starts no
second copy of a moved run and ends no turn while the run lasts. `references/test-selection.md`'s
`## The two commands` states the procedure, and `agents/implementer.md` and the full-tier dispatch prose point to it.
The main session keeps ADR 0232's foreground rule unchanged.

## Considered options

- **`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`.** It stops the move, but a run then stops at its timeout, it is an
  operator's environment setting no plugin file sets, and it also removes `run_in_background` everywhere.
- **Add `Monitor` or `TaskStop` to the implementer's tools.** Neither blocks until a command ends, so the wait
  still needs a loop.
- **An end line printed by `scope.js test`.** It fixes the marker for the runner alone; `scope.js fail-to-pass` and
  a direct command still need the appended status, so one rule for every run is shorter.

## Consequences

- A moved run costs one Bash call per 170 s of waiting, and no duplicate run.
- The rule holds only while the platform moves subagent calls at 180 s. A platform fix makes the wait unused but
  harmless, and the known-issues entry is where to re-check it.
