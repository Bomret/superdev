# 0126: A numbering collision is found by number, not by conflict

**Status:** Accepted

**Amends:** [ADR 0120](0120-implement-brings-the-remote-base-into-the-scope-branch-before-the-first-slice.md)
for what the base step does before it merges the base.

**Amended by:** [ADR 0156](0156-maintainer-documents-are-checked-against-each-other.md), which checks
that a renumber leaves no citation of the old number among the lines the scope branch added.

## Context

An ADR number and an invariant id each take the next free slot in their home. `/superdev:plan` checks
a new number against every other live plan run. `references/merge-conflicts.md` moves a scope's number
only when git reports a conflict. Two ADR files with the same number and different slugs never
conflict, so the duplicate lands silently. When this was decided, this repository carried two such pairs, `0071` and `0076`.
Both landed on 2026-09-18, and one of them came from a direct commit that no plan run saw.

Heimeshoff's Agentheim (ADR-0058 there) settles an ADR number at the one point that integrates work into
the base, against the numbers the base already holds.

## Decision

- **Compare numbers, not files.** A collision is an ADR number, in one ADR directory, or an invariant
  id, that the scope branch adds and the base already holds. A git conflict is not required. A file
  the scope renames into a number adds that number. An ADR file at the same path on both sides, or an
  invariant entry with the same text on both sides, is no collision: the scope took it in from the base.
  A base file at a path the range base already held, where the scope no longer holds that path, is no
  collision either: the scope renamed or replaced that ADR, and after the merge only the scope's file
  carries the number. Two files are the same ADR only where one side kept the range base's path. A
  file base renamed or added is a different ADR, so a rename of one ADR to two different paths, one on
  each side, collides, and git's rename detection decides nothing.
- **One `scope.js` verb detects it.** The verb prints each collision and the next free number. It
  renames nothing and rewrites nothing. A citation of the base's ADR and a citation of the scope's ADR
  with the same number read the same, so only the controller can tell them apart.
- **The base step renumbers.** Before the base step at implement start merges the base, it calls the
  verb. It moves each colliding number of this scope to the next free one, updates every citation on
  the scope branch, and reports each renumber, old and new.
- **The next free number is free on every live plan run.** Both callers pass the verb each other live
  plan run's scope branch whose ref resolves. A run whose branch no longer resolves is skipped, so it
  never stops another run.
- **Ship stops.** Before ship's own base merge, it calls the verb. A collision stops ship, nothing
  merges, and ship names each collision and its next free number. The operator renumbers, then runs
  `/superdev:review` and `/superdev:ship` again, the same recovery a git conflict at ship takes.
- **This repository fails its test run on a duplicate ADR number.** The register validator already
  fails on a duplicate invariant id.

## Considered options

- **Ship renumbers itself.** Rejected: ship never lands a change nobody reviewed, and a renumber
  rewrites citations.
- **Recover through `/superdev:implement`.** Rejected: its hand-off sets the stage to `merged`, which
  rewinds a `submitted` scope that already has an open pull request.
- **Detection in prose at both callers.** Rejected: the same comparison would exist twice, judged by
  the model each time.
- **Keep the existing duplicates as exceptions.** Rejected: a citation of `ADR 0071` stays ambiguous.
  The later-landed file of each pair takes a new number instead.
