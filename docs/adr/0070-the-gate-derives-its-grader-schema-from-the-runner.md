# 0070: The gate derives its grader schema from the runner

**Status:** Superseded

**Superseded by:** [ADR 0129](0129-the-ab-eval-harness-is-removed.md). The gate this decision derives
and the runner it derives from are both deleted.

**Amends:** [ADR 0067](0067-the-grader-shape-gate-tracks-the-eval-runners-capability.md), whose Decision
stands. One of its Consequences reverses.

**Context.** ADR 0067 pointed `drift-check`'s `eval-shape` gate at what `scripts/eval-run.js` grades
rather than what `claude plugin eval` accepts, and restated the runner's type set as a literal in
`scripts/drift/contracts.js`. Its Consequences named the residual and accepted it: "The gate and the
runner are now one fact in two places, and nothing links them."

Closing the gate's remaining holes adds a second such fact. `graderInput` honours `files` and `trace` and
throws on anything else, while the gate checks only that a selector is present. Restating those two values
beside the type set would make the accepted residual a pattern rather than a single exception, and the
next person to change `graderInput` would have to remember a file in another directory.

The obstacle that made deriving look expensive is not there. `scripts/eval-run.js` already carries
`if (require.main === module) main()`, so requiring it runs no CLI code, and it pulls only Node builtins,
so there is no cycle. Both files are maintainer-only, so nothing shipped is coupled.

**Decision.** `scripts/eval-run.js` exports the sets it grades by, and `scripts/drift/contracts.js`
requires them instead of restating them. Each set is **computed from the dispatch it describes** — the
keys of the map `graderInput` and `gradeOne` dispatch through — so the set cannot disagree with the code
it claims to describe. Adding a grader type or a focus value is one map entry, and the gate follows.

Exporting a hand-written set beside the dispatch would relocate the drift rather than remove it, from
across two files to within one. The map is what makes the guarantee structural instead of a convention a
reader has to hold.

## Consequences

- ADR 0067's residual closes. A value the runner adds or drops moves the gate with it, in one edit, and
  the inverse drift it accepted as "the cheaper direction to notice" stops being reachable at all.
- `gradeOne`'s `llm` branch is extracted to its own function, so both sets derive the same way. That
  restructures working code covered by the runner's own `--selftest`.
- `drift-check` now fails when `scripts/eval-run.js` cannot be required. Both run under `bun run test`, so
  a broken runner already fails the suite; this makes it fail earlier and name the runner.
- The coupling runs one way only: the runner knows nothing of the gate. A future reader adding a grader
  type touches the runner alone, which is the point.
