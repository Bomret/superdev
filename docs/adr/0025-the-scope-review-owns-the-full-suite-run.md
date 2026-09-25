# 0025: The scope review owns the full-suite run

**Status:** Accepted

**Amended by:** [ADR 0074](0074-the-focused-test-command-is-the-loops-cheap-command.md), which redefines
the focused command below by what it costs rather than by narrowing, requires a source-to-test mapping
for `{paths}`, and narrows the empty-changed-path-set fallback to a command consuming that token —
[ADR 0075](0075-the-scope-review-gates-on-a-full-suite-entering-and-leaving.md), which makes the review's
one full-suite run two, one entering its fix loop and one leaving it — and
[ADR 0085](0085-the-focused-test-command-is-required-configuration.md), which makes the focused command
required configuration and supersedes the "no second block configured" fallback this record still
describes below — and
[ADR 0091](0091-the-definition-of-done-is-ticked-while-the-run-works.md), which supersedes this record's
skip of the whole-scope review for an all-`mechanical`/`docs` scope, and that skip's stand-in full-suite
run at run handoff: every scope now passes `/superdev:review`, and run handoff's full-suite run is the
same one every scope gets, never a stand-in for it. Everything else below holds.

## Context

`docs/agents/verification.md` named one test command, and five places in the chain ran it: the
implementer's TDD loop after every RED-to-GREEN increment, the lite tier's inline loop, the slice-reviewer's
independent re-run, the green-gate hook after every controller merge, and the final reviewer. A full-tier
scope of eight slices therefore ran the whole suite roughly fifty-five times, and all but a handful of
those runs proved code no slice had touched.

The cost is invisible in this repository, whose own suite finishes in seconds. It is the adopter with a
ten-minute suite who pays it, and pays it in hours per scope.

The final reviewer's run was also the weakest of the five. It was optional, because the reviewer *may* re-run
the suite, and it lived inside a subagent, so a dispatch the permission classifier denied took the run
with it.

## Decision

`docs/agents/verification.md` carries an optional **second** fenced block: the **focused test command**.
Where it contains the token `{paths}`, the caller substitutes the shell-quoted paths that changed in the
range it judges. Where it does not, the command runs verbatim, for a runner that detects the change set
itself. `references/test-selection.md` owns the contract, and every prose consumer reads it at runtime, the
same shared-file-read-at-dispatch pattern as `references/scope-mode.md`. `hooks/green-gate.js` is the
exception, reimplementing the rule in code: a hook fires with no dispatch to read a reference at.

Every run inside the loop is focused: the implementer's TDD increments, the lite tier's inline loop, the
slice-reviewer's independent re-run, and the green-gate hook after a controller merge.

**One full-suite run remains, and `/superdev:review` in scope mode owns it.** The command runs it itself
and hands the result to `final-reviewer`, rather than delegating the run to that subagent. A denied
dispatch is then a lost review, not a lost verification. `final-reviewer` reviews a live scope against
that handed result and runs no suite of its own; on an ad-hoc range, where no controller ran one, its own
re-run stays available and is the only verification there is.

**The ship step, and the `doc-writer` the documentation step dispatches, run no full suite at all.**
`/superdev:ship` and the writer would each be re-proving a tree the review just verified. The
`doc-steps-no-suite` drift check enforces that silence, rather than a line of prose in each document
forbidding the run.

**The documentation step itself runs the focused command, over its own commits.** A doc commit lands on
the scope branch after the review has already passed, and nothing else re-verifies it before the pull
request — the green-gate hook fires only on a controller merge, and a doc commit is not one.
`/superdev:document` therefore reads `references/test-selection.md` and runs the focused command over the
doc commits it just landed, the same rule the implement loop already applies. **The invariant this
decision keeps is one full-suite run per scope, at the review — not one full-suite run per scope,
full stop.** Where a repository configures no second fenced block, `references/test-selection.md`'s
own fallback runs the full command verbatim for the documentation step too, the same bargain the
implementer's TDD loop and the slice-reviewer's re-run already make there. That repository pays a
second full-suite run at the documentation step; a repository whose focused command narrows does not.

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
  green-gate runs it again on merge, minutes apart, over a near-identical tree, so drop one. It costs
  nothing to build. It loses because it saves one run per slice while the TDD loop, which holds most of
  the runs, stays untouched.

## Consequences

A scope's whole-suite verification **gate** happens once, at the point where the integrated branch is
judged against the Definition of Done, instead of continuously throughout the run. A repository whose
documentation step falls back to the full command still pays a run there — that run judges nothing
against the Definition of Done, so it is not a second gate.

A scope whose slices are all `mechanical` or all `docs` skips the whole-scope review by design, because
there is no Definition-of-Done judgment to attach a full-suite run to. `/superdev:implement`'s Final phase runs the
full suite itself instead, once, immediately before handing off to `/superdev:document` in place of
`/superdev:review`. A red result there stops the handoff, the same way a red verdict at review would.
The permission classifier can deny that Bash call. Attended, the run records a `**Degraded:**` entry
and continues. Unattended, it blocks instead. An attended denial reaches the pull request with no
full-suite verification gate behind it for this scope — the documentation step's own fallback run,
where one happens, judges only its own doc commits and is not a gate either.

A cross-slice break surfaces later than it did. On the full tier the green-gate still catches it at the
merge that introduced it, because the focused run covers the paths that merge brought in. On the **lite
tier there is no merge at all**, because slices commit straight to the scope branch, so no gate fires between
the first slice and `/superdev:review`. A lite run is at most three slices in one scopetree and hands off
to the review immediately, so the window is accepted rather than closed.

A focused command reaches only what the repository's own runner maps to the changed paths. superdev
performs no test-impact analysis of its own and does not intend to: a repository whose runner cannot
narrow configures no second block and keeps the previous behaviour.

A merge that leaves `HEAD` unmoved, which is a conflict, produces an empty changed-path set. The fallback
above is what keeps the gate from passing such a merge silently.

This repository configures no focused command. Its suite is fast enough not to need one, so the path it
dogfoods is the no-block fallback. **Superseded by ADR 0085:** the focused command is required
configuration, so this repository's `docs/agents/verification.md` now records the full command a second
time, with that reason as prose beside it, rather than configuring nothing.
