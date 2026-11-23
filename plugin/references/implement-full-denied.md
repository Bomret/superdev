# Full tier: a denied dispatch

Applies to the full playbook's controller, with `implement-full.md` still in force, when the permission classifier
denies one of its dispatches: an implementer, a slice-reviewer, or a fix, in a slice's loop or in the Minor sweep.

## A denied dispatch

**A degraded pass.** Applies to every denied dispatch of this tier. It is a **degraded pass**: follow
`scope-findings.md`'s `## Degraded passes`, the `**Degraded:**` entry included. No dispatch of this tier is skippable
on judgment.

**A denied implementer or fix.** Applies to a denied authoring dispatch. Write it with `scope.js degraded add`, then ask
`scope.js denial implementer` (or `fix`), with `--unattended` on an unattended run, for the verdict.

- `block implementer` → block.
- `inline` → build the work yourself by the `agents/implementer.md` sections `implement-full.md`'s **A tiny slice is
  yours** names, with `### RED-test rule` and `### Sibling surfaces` for a fix. `### The loop` applies to a `behavior`
  slice and to a fix whose finding names failing behaviour. On a `behavior` slice build or slice fix with a skill path,
  follow `agents/implementer.md`'s `## The verify skill` as the implementer would, before the self-check.
  - **A slice build or a slice fix** → build it in its slicetree, cut and prepared per `implement-full.md`'s `## Branch
    model` **A slicetree per slice**. Append the `## Self-check` entry under the heading the dispatch would have named
    (`Self-check — build`, or `Self-check — fix cycle <n>`). Then continue the loop at DAG loop step 3.
  - **A sweep fix** → build it in the scopetree, with `## The sweep fix dispatch` too. Then continue the sweep at
    `implement-full-minor-sweep.md`'s step 2, **The sweep's self-check**.

**A denied `slice-reviewer`.** Applies to this tier's one verification dispatch. Write it with `scope.js degraded
add-denial -`, the classifier's refusal piped through a quoted heredoc, then ask `scope.js denial slice-reviewer`, with
`--unattended` on an unattended run, for the verdict.

- `block …` → block.
- `inline` → review the slice inline and carry on. You hold the implementer's report, so the review is not blind.
  Apply `dependency-verification.md`'s `## Dependency verification`, and `agents/slice-reviewer.md`'s `## Reading the
  progress log` one-way rule: reading the log can add a finding or raise its severity, and never withdraws or
  downgrades one.
- An inline re-review takes the subject a dispatched one takes, the fix cycle's range. An inline first review applies
  the over-engineering lens too.
