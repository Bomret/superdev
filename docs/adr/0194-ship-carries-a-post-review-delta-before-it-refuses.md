# 0194: Ship carries a post-review delta before it refuses

**Status:** Accepted

**Amends:** [ADR 0175](0175-a-green-suite-record-carries-across-a-delta-a-complete-focused-selector-covered.md),
whose carry serves the scope review's exit run and ship's moved-base gate only, and
[ADR 0192](0192-the-full-suite-runs-once-after-review-comes-back-clean.md), under which ship's first gate
is unchanged.

**Context.** The scope review records the suite green at commit A. The doc pass after it can land commits
that are not Markdown only, such as an HTML page of a lesson. Ship's first gate then calls
`scope.js suite reusable`, which refuses: the range from A to the tip changes a path that is not Markdown,
and no focused run covers that range. Ship refuses to merge and points at `/superdev:review`. The review
then pays a re-review dispatch, and before ADR 0175 it also paid a full-suite run, only to cover a doc
delta. Two weaver scopes show this (`focused-test-paths`, 2026-10-21, and `blazor-wasm-ui-bundle`,
2026-10-28). In the second, the operator started the focused run by hand, and `suite reusable` then accepted
the tip.

**Decision.**

- **Every ship gate whose `suite reusable` call refuses takes `references/test-selection.md`'s
  `## The carry run` before it refuses.** That covers §3's first gate, §3's whole-repo gate, and §4's push
  gate, in addition to §4's moved-base gate.
- **A carried tip merges.** The gate runs no full command and writes no suite record.
- **A failing carry run is the gate's red result.** Ship records `red` at the tip, with `--whole` at the
  whole-repo gate, merges nothing, and points at `/superdev:review <scope>`.
- **A tip with no carry keeps the gate's earlier behavior.** The plain gate refuses. The whole-repo gate runs
  the whole-repo command, as the moved-base gate does.
- **The ship call is the consent to the carry run.** Ship asks nothing more.

**Consequences.** In a repository that declares `## Complete selector`, a doc delta after review costs one
focused run at ship, not a second review. A repository without the declaration still sends a non-Markdown
delta back to review. Ship runs a test where it ran none before, so a slow focused command makes ship
slower. `scope.js` needs no change: `suite reusable` already accepts a focused-selector carry from the run
trace, over a `whole` record too. A red record left by a recorded rerun cannot carry, so a non-Markdown delta after it still goes back to review. A green record at the tip itself, or one without the kind `whole` at a gate that calls `suite reusable --whole`, cannot carry either: its focused run would have no path to run over, or would cover no whole-repo run, so the plain gate still refuses and runs no full suite. The carry hands deleted paths to the focused command, so a runner that fails on a missing file reads a deletion as red, at ship as at the gates that already carry.

**Considered options.**

- *`/superdev:submit-pr` takes the carry before it opens the pull request.* Rejected: commits that land at
  stage `submitted`, such as a conflict resolution or a review fix, still reach ship without cover, so ship
  needs the carry anyway.
- *`/superdev:document` ends with a focused run.* Rejected: it breaks ADR 0189 and INV-0175, under which no
  test runs after review in the doc pass.
- *Widen the Markdown-only carry to more documentation file types.* Rejected: superdev cannot know which
  files a consumer's suite reads. The complete-selector declaration decides that per repository.
- *Ask before the carry run starts.* Rejected: the moved-base gate already runs the carry under the ship
  call's consent, and a second ask adds a stop with no new information.
