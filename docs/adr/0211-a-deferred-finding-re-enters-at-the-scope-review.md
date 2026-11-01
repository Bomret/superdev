# 0211: A deferred finding re-enters at the scope review

**Status:** Accepted

**Amends:** [ADR 0121](0121-a-run-resolves-a-deferred-finding-it-later-fixes.md): it names where
re-entry happens.

## Context

ADR 0121 re-admits a deferred finding to a fix loop when a later review names a guard-rail remedy for it.
A slice re-review is told to leave every deferred finding out of its list, so inside a slice's fix loop no
review can name that remedy (triage #402). The scope review's `final-reviewer` receives no deferred list.
It reports a deferred finding again with its remedy, and the controller matches every finding against
`scope.js get deferred` before it writes.

## Decision

A deferred finding re-enters a fix loop at the scope review, when `final-reviewer` names a guard-rail
remedy for it. A slice re-review keeps leaving deferred findings out of its list.

## Considered options

- **A deferred-remedy note from the slice re-review.** Rejected: a new path in the agent and in
  `implement-full.md`, for findings the scope review already sees.

## Consequences

A guard-rail remedy for a deferred finding waits for the scope review. The re-entry rule has one home.
