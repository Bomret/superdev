# 0171: profile and prose-check are removed

**Status:** Accepted

**Supersedes:** [ADR 0057](0057-prose-check-applies-controlled-prose-unconditionally.md),
[ADR 0103](0103-the-run-profile-reads-claude-codes-transcripts.md),
[ADR 0143](0143-the-run-profile-names-time-sinks-by-fixed-rules.md).

## Context

ADR 0057 made `/superdev:prose-check` apply `references/controlled-prose.md` to one piece of prose on
demand. ADR 0103 made `/superdev:profile` report where a scope run's wall-clock time went, read from
Claude Code's session transcripts, and ADR 0143 made that report close with time sinks produced by
fixed rules.

Neither command is used in daily practice. Their cost is carried on every change. profile ships
`scripts/profile.js`, five modules in `plugin/lib/`, eight test files, five invariant register entries,
and five glossary terms. prose-check ships a skill and one `drift-check` contract row that pins the
doc-reader section it cites.

## Decision

Delete `/superdev:profile`: `skills/profile/`, `scripts/profile.js`, the modules `transcripts.js`,
`command-keys.js`, `session-events.js`, `time-sinks.js`, and `profile-report.js`, the `tests/profile*`
suites, the invariant register entries INV-0101, INV-0102, INV-0103, INV-0148, and INV-0149, and the
glossary terms *Run profile*, *Time sink*, *Phase segment*, *Human wait*, and *Idle*.

Delete `/superdev:prose-check`: `skills/prose-check/` and the `drift-check` contract row that pinned
doc-reader's `## Pass 3` for it. INV-0030 keeps its rule for the doc agents and drops the sentence that
named prose-check.

Keep `references/controlled-prose.md`. The doc agents apply it through the repository's
`## Writing standard` pointer (ADR 0012), and doc-reader's Pass 3 still verifies it.

The operator decided this on 2026-10-23.

## Considered options

- **Remove only the two skills.** `scripts/profile.js` stays runnable by hand. Rejected: the script,
  its modules, and its suites would ship with no surface that runs them.

## Consequences

The plugin has two fewer commands. A slow run has no built-in report of where its time went, and an
operator reads the transcripts directly. Prose is checked against the controlled standard only where the
repository's `## Writing standard` pointer names it, through `/superdev:document`'s doc pass.
