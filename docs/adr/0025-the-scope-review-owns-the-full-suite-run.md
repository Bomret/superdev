# 0025 — The scope review owns the full-suite run

**Status:** Accepted

## Context

`docs/agents/verification.md` named one test command, and five places in the chain ran it: the
implementer's TDD loop after every RED→GREEN increment, the lite tier's inline loop, the slice-reviewer's
independent re-run, the green-gate hook after every controller merge, and the final reviewer. A full-tier
scope of eight slices therefore ran the whole suite roughly fifty-five times, and all but a handful of
those runs proved code no slice had touched.

The cost is invisible in this repository, whose own suite finishes in under six seconds. It is the
adopter with a ten-minute suite who pays it, and pays it in hours per scope.

The final reviewer's run was also the weakest of the five. It was optional — the reviewer *may* re-run
the suite — and it lived inside a subagent, so a dispatch the permission classifier denied took the run
with it.

## Decision

`docs/agents/verification.md` carries an optional **second** fenced block: the **focused test command**.
Where it contains the token `{paths}`, the caller substitutes the shell-quoted paths that changed in the
range it judges; where it does not, the command runs verbatim, for a runner that detects the change set
itself. `references/test-selection.md` owns the contract, and every consumer reads it at runtime — the
same shared-file-read-at-dispatch pattern as `references/scope-mode.md`.

Every run inside the loop is focused: the implementer's TDD increments, the lite tier's inline loop, the
slice-reviewer's independent re-run, and the green-gate hook after a controller merge.

**One full-suite run remains, and `/superdev:review` in scope mode owns it.** The command runs it itself
and hands the result to `final-reviewer`, rather than delegating the run to that subagent. A denied
dispatch is then a lost review, not a lost verification.

Two fallbacks run the full command. **No second block** configured reproduces the previous behaviour
exactly, so a repository that configures nothing is untouched. An **empty changed-path set** never
degrades into a focused run over no paths, which would report green having tested nothing.

## Considered options

- **Prose only, with no configuration field.** Instruct the implementer to narrow its own invocation
  from `docs/agents/toolchain.md` and add nothing to `verification.md`. It is the smallest change and
  needs no schema. It loses because `hooks/green-gate.js` is deterministic JavaScript that cannot reason
  about a toolchain: the merge gate could then only keep its full run or be dropped, and the merge gate
  is where roughly a fifth of the runs live.
- **Cut the duplicate full runs instead of shrinking them.** The slice-reviewer runs the suite and the
  green-gate runs it again on merge, minutes apart, over a near-identical tree; drop one. It costs
  nothing to build. It loses because it saves one run per slice while the TDD loop, which holds most of
  the runs, stays untouched.

## Consequences

A scope's whole-suite verification happens once, at the point where the integrated branch is judged
against the Definition of Done, instead of continuously throughout the run.

A scope whose slices are all `mechanical`/`docs` skips the whole-scope review by design — there is no
Definition-of-Done judgment to attach a full-suite run to. `/superdev:implement`'s Final phase runs the
full suite itself instead, once, immediately before handing off to `/superdev:document` in place of
`/superdev:review`. A red result there stops the handoff, the same way a red verdict at review would.
The permission classifier can deny that Bash call. Attended, the run records a `**Degraded:**` entry
and continues. Unattended, it blocks instead. An attended denial reaches the pull request with zero
full-suite runs for this scope.

A cross-slice break surfaces later than it did. On the full tier the green-gate still catches it at the
merge that introduced it, because the focused run covers the paths that merge brought in. On the **lite
tier there is no merge at all** — slices commit straight to the scope branch — so no gate fires between
the first slice and `/superdev:review`. A lite run is at most three slices in one worktree and hands off
to the review immediately, so the window is accepted rather than closed.

A focused command reaches only what the repository's own runner maps to the changed paths. superdev
performs no test-impact analysis of its own and does not intend to: a repository whose runner cannot
narrow simply configures no second block and keeps the previous behaviour.

A merge that leaves `HEAD` unmoved — a conflict — produces an empty changed-path set, and the fallback
above is what keeps the gate from passing such a merge silently.

This repository configures no focused command. Its suite is fast enough not to need one, so the path it
dogfoods is the no-block fallback.
