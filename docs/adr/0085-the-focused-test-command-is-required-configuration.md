# 0085: The focused test command is required configuration

**Status:** Accepted

**Amends:** [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md) and
[ADR 0074](0074-the-focused-test-command-is-the-loops-cheap-command.md), whose focused command is
optional, and whose absence falls back to the full command in every caller.

**Context.** `references/test-selection.md`'s *Fallback to the full command* runs the full command wherever
no second fenced block is configured. That fallback reaches the implementer's TDD loop, the
slice-reviewer's Lens 2, the documentation step, and `hooks/green-gate.js`. In a repository that configures
no focused command — deliberately, because its runner cannot narrow from a changed path — every one of
those callers runs the whole suite on every RED→GREEN increment, which is the cost ADR 0025 and ADR 0074
exist to remove.

The absent setting is what hides the cost. It reads as a repository that never answered the question, and
it silently selects a default, so nothing surfaces when the constraint behind it changes — a runner
upgrade that makes narrowing possible leaves the repository running full suites forever.

**Decision.** A configuration a repository cannot supply is recorded, never inferred.
`docs/agents/verification.md` carries two fenced blocks in every repository that has a suite. A repository
whose runner cannot narrow records the **full** command in the second fence, with prose beside it stating
why narrowing is impossible, so a later reader sees the duplication is deliberate and re-examines it when
the runner changes. A repository with no suite at all carries no `docs/agents/verification.md`, exactly as
it does today, and is untouched by all of this.

`references/test-selection.md`'s fallback becomes a stop: a prose caller that finds one fenced block
reports the missing configuration and names `/superdev:setup`, running no command. That case is unreachable
in a configured repository, because `/superdev:plan` and `/superdev:implement` already auto-invoke
`/superdev:setup` when configuration is missing, and an absent focused command is now missing
configuration. Making it loud rather than silent is what keeps it unreachable.

`hooks/green-gate.js` is the exception. A hook cannot ask an operator, and a hook that blocks a merge it
could have verified is strictly worse than one that verifies it: the full command is still present and
still correct. Finding one fenced block, the gate runs the full command and emits a one-line notice naming
`/superdev:setup`. It never blocks on that condition. This is distinct from the blind-spot block, where the
gate cannot resolve the working tree it would test at all — a safety gap, not a configuration gap.

**Considered options.**

- **The green-gate blocks on one fenced block**, consistently with the stop every other caller takes. It
  blocks every merge in a repository not yet re-run through `/superdev:setup`, over a condition where a
  correct command is sitting in the first fence.
- **A migration pass over existing repositories.** The auto-invoke in `/superdev:plan` and
  `/superdev:implement` already self-migrates a repository on its next planned run, with no migration
  script, no version check, and no new surface.
- **Leave the fallback and accept the cost in repositories that cannot narrow.** It keeps the setting
  absent, which is the shape that hides the cost from the reader.
- **Derive a test-file-only `{paths}` token**, which would let a file-based runner such as bats narrow and
  shrink the cannot-narrow set toward zero. Worth doing, and independent of this decision.

**Consequences.** `/superdev:setup` asks one question it used to skip, and every repository it configures
answers it. An adopter upgrading meets the auto-invoke on the next `/superdev:plan` or
`/superdev:implement`, rather than a broken run.

A repository that cannot narrow now holds the same command twice in one file. That reads as duplication,
and the prose beside the second fence is the only thing distinguishing deliberate duplication from a
copy-paste error — a reader who deletes the second fence as redundant reinstates the fallback this
decision removed.
