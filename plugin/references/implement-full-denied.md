# Full tier: a denied dispatch

The full playbook's controller reads this, with `implement-full.md` still in force, when the permission
classifier denies one of its dispatches: an implementer, a slice-reviewer, or a fix, in a slice's loop or in
the Minor sweep.

## A denied dispatch

A denied dispatch is a **degraded pass**, not a step to redo silently inline. None is ever skipped on judgment
in this tier, so scope-findings.md's own skip carve-out never exempts one here. Read
`${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` section and follow it, including the
`**Degraded:**` entry it defines for `<run-root>/ledger.md`.

- **A denied implementer or fix** is an authoring dispatch: write it with `scope.js degraded add`.
  Ask `scope.js denial implementer` (or `fix`), with `--unattended` on an unattended run, for the verdict:
  `block implementer` blocks.
- **A denied `slice-reviewer`** is this tier's one verification dispatch: write it with
  `scope.js degraded add-denial -`, piping the classifier's refusal through a quoted heredoc rather than a
  shell argument, then ask `scope.js denial slice-reviewer --unattended` (without `--unattended` on an attended
  run) for the verdict. A `block …` verdict blocks. On `inline`, review the slice inline — the controller already
  holds the implementer's report, so that review is not blind — applying
  `${CLAUDE_PLUGIN_ROOT}/references/dependency-verification.md`'s `## Dependency verification` check and the
  one-way rule of `implement-full.md`'s slice-reviewer dispatch (reading the log can add a finding or raise a
  finding's severity, and never withdraws or downgrades one), where an inline re-review takes the same subject
  as a dispatched one, the fix cycle's range, and carry on. An inline first review applies the
  over-engineering lens too.
