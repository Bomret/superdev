# Run handoff

Applies to both execution playbooks (`implement-full.md`, `implement-lite.md`), which read this as their last step.

## Run handoff — hand off to `/superdev:review`

Applies once your playbook returns, every slice `merged` or committed on the scope branch, at both tiers. Run the
concepts below in order.

**Run no test suite here.** Applies to the whole handoff. `/superdev:ship` takes the scope's full-suite evidence,
implement's base merge included. A failing test a slice did not cause, named in an implementer's report or met in your
own loop, goes to the scope review's fix loop.

**Observations.** Applies to a defect an implementer's report surfaces, or one you meet, that no slice of this scope
covers and the scope did not cause. Capture it now, per `scope-findings.md`'s `## Observations`.

**The handoff pass.** Applies to `<run-root>/dod.md`, inline, at both tiers, with no dispatch and no wait on a suite
record. Judge the lines below against the integrated scope branch, one at a time, by `dod-ticks.md`'s note rule and its
controller-only discipline. Write `dod.md` alone; the scope review copies it onto the anchor.

- **`docs`-tagged lines** → leave unjudged, with no tick and no note. The doc pass settles them.
- **The lines this pass settles** → every `scope`-tagged line, every line `dod-ticks.md`'s `## The mapping gate`
  settles as if it read `scope` (an untagged line, and every line of a `dod.md` with no tags at all on a multi-slice
  ledger), and every joint line an earlier tagged slice's genuine `not met:` or `ceiling:` note left open. Tick it,
  leave it unticked with a `not met:` or `ceiling:` note, or leave it as it stands where you cannot yet judge it.
- **A line noted `accepted:`** → leave it exactly as it stands. Never write `accepted:` yourself.
- **Every earlier tick** → re-check it against the integrated branch. A tick that no longer holds comes back off, with a
  `not met:` note naming what broke.
- **A claim an implementer noted on an unmapped criterion** → judge it the same way.
- **An unmet result** → leave the line unticked with its reason. It never blocks this handoff.

**Set the stage to `merged`.** Applies once the handoff pass is done. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"
stage set merged --root <run-root>`. This stage write is the run's closer: publish the snapshot now, the run's one
publish, per `run-state.md`'s `## Publishing run state`.

**Leave the run standing.** Applies at the end of the run. Keep the scopetree and `<run-root>/run.lock`, and leave the
anchor at `in-progress`. `/superdev:review`, `/superdev:document`, and `/superdev:submit-pr` work in the scope checkout
you leave, and `/superdev:wrap-up` takes the run down.

**Report.** Applies to the run's report. Name the scope branch, the slice count, the commit range, and each failing
test a slice named as inherited.

- Each slice merged at the fix cap with only **Pass-to-pass** or **Missing fail-to-pass run** left, named with each
  finding.
- Each unclosable **Pass-to-pass** finding a slice or the Minor sweep took the early escape with, or a lite slice merged
  on, named with its slice or range, its case, and its reason.

**Resolve the next command.** Applies to every exit of the handoff. Compute `BASE`, the scope's range base, with
`scope.js base resolve --branch <branch> --base <base> --root <run-root>` (`scope-mode.md`'s `## The scope's range
base`; `<base>` the value `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" config base` prints, `absent` reading as `main`). The next command is `/superdev:review
<BASE-sha>..<branch>` with the real commit substituted, for every scope whatever its slice types.

**Start the review.** Applies once every slice is on the scope branch and this handoff's closer and publish ran. Start
that command per `response-shapes.md`'s `## The chain start`. A started review leaves this command nothing to print.

**Print the next command.** Applies to every exit that starts no review, a failed start included. Print the resolved
command, plus one line on what it does: review the integrated scope against the DoD, with `/superdev:ship` taking the
scope's full-suite evidence. This line fills the Next block that closes the message, so it comes last. The exit stops
there: no review, no doc pass, no pull request, and no cleanup.
