# 0108: afk is removed

**Status:** Accepted

**Supersedes:** [ADR 0015](0015-afk-drives-the-chain-through-the-skill-tool.md),
[ADR 0040](0040-the-sweep-defers-an-anchor-whose-blocker-has-not-shipped.md).

## Context

ADR 0015 made `/superdev:afk` the driver of an unattended sweep: it selects each eligible scope anchor
and takes it through `/superdev:implement`, `/superdev:review`, `/superdev:document`, and
`/superdev:submit-pr` with the Skill tool, each invocation carrying `--unattended`. ADR 0040 made the
sweep defer an anchor whose anchor dependency has not shipped.

The command is not used. Its cost is carried on every change: its own skill file, the
`drift-check` checks and selftest vectors that pin its selection, stage table, anchor count, and
ship-free chain, the invariant register entries that name it, and the glossary terms that exist only
for its selection.

## Decision

Delete `/superdev:afk`: `skills/afk/`, the `drift-check` checks that scan only it, their selftest
vectors, the invariant register entries that govern only it, and the glossary term *Eligible anchor*.
Every shipped sentence that names afk as a present command is rewritten around the consumer that
remains, or removed.

Keep everything an unattended invocation needs without a driver. The unattended token, every standing
answer, the unattended block, and the denial cap stay, because an operator or an external loop can pass
`--unattended` to a chain command directly (ADR 0016, ADR 0041). The chain commands stay model-invocable
surfaces. `/superdev:ship` stays human-only and carries no unattended mode (ADR 0096).

Keep the anchor dependency. `/superdev:plan` still records one, and `/superdev:backlog` reads it to
group an anchor as `waiting`. Keep the release: `/superdev:implement` still stops on an unreleased
feature (ADR 0034).

## Considered options

- **Remove afk and the unattended token together.** Every chain command becomes interactive only, and
  the standing answers, the unattended block, and the denial cap go too. Rejected: the token costs
  little once afk is gone, and it is the one entrance an external driver has.

## Consequences

- superdev ships no command that runs the chain unattended. A human or an external loop drives each
  unattended invocation.
- `.superdev/afk-blocks` has no reader. A copy left in an adopter's checkout is git-ignored and inert.
- Restoring afk means restoring deleted files from this repository's history.
