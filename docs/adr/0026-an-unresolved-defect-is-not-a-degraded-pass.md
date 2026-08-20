# 0026: An unresolved defect is not a degraded pass

**Status:** Accepted

## Context

A run had one durable record for what went wrong: the ledger's `**Degraded:**` line. `references/scope-mode.md`
scoped it precisely: a degraded pass is a step that did not get the assurance the chain promises, in two
shapes, a dispatch the permission classifier denies and a pass that could not reach what it needed. The
section closed by stating that neither shape is a failure of the code under review, `CONTEXT.md` told a
writer to avoid the word "failure" for the same reason, and `/superdev:ship` copied the bullets into the
pull request under a heading that reads `## Degraded passes`.

Nothing recorded the other outcome: a defect the run found and left standing. A full suite still red at
the three-strike cap, or findings the operator declined to fix, moved the run's stage nowhere and wrote
nothing. `/superdev:ship` then asked the wrong question. It reported that `/superdev:review` had not run,
when the review had run and had found the branch broken.

The `feat/scoped-test-runs` scope tried to close that gap by recording a red suite as a `**Degraded:**`
entry. Three fix cycles and a review cap later, the diagnosis was that the concept had been widened rather
than extended: each cycle pulled one more document into a definition that three binding places contradicted.

## Decision

An unresolved defect gets its **own** ledger line, `**Unresolved:**`, beside `**Stage:**` and
`**Degraded:**`. `scripts/scope.js` owns it as it owns every other part of the ledger schema (ADR 0022),
through two verbs, `unresolved add` and `unresolved clear`. `references/scope-mode.md`'s
`## Unresolved defects` section owns the value shape and the points at which a command writes one.
`## Degraded passes` is untouched.

**A command writes the entry where the run gives up**, never where the defect first appears: the
three-strike cap still red, a fix the operator declined, or an unattended block at that cap. A defect
found and then fixed leaves no trace, because nothing was left standing.

**`unresolved clear` drops the whole line.** Resume is a first-class path through every superdev command,
so a run that comes back, fixes the defect and gets a green suite has to be able to say so. Clearing is
wholesale rather than per-bullet: the run that fixes the defect re-verifies the scope, so no bullet
identity is needed.

**`/superdev:ship` gates on it.** Attended, it names what stands and asks once. A decline opens no pull
request. Unattended, it refuses. This is the shape ship's stage gate already uses, so the command gains a
condition rather than a mechanism.

A **blocked slice** is not an unresolved defect. It already carries a durable record, its own `blocked`
status in the ledger's slice table. This line is for scope-level defects, which had none.

## Considered options

- **A third shape inside `**Degraded:**`.** One line, one verb, one heading in the pull request. It loses
  because three binding places state that a degraded pass is not a failure of the code under review:
  `references/scope-mode.md`'s closing invariant, `CONTEXT.md`'s avoid-note, and the reader-facing heading
  `/superdev:ship` writes. Extending the line would have required rewriting all three to mean something
  weaker, and it puts "a test is failing on this branch" under a heading that says "passes this run did not
  get".
- **Record the defect and never gate.** Smaller: ship's control flow is untouched. It loses because
  superdev would open a pull request from a branch it knows is broken without asking, and `/superdev:afk`
  would do it overnight.
- **No `clear`, matching `degraded add`'s append-only surface.** Defensible, because the entry is written
  only where a run stops, so it cannot go stale inside one run. It loses on the resumed run: the defect is
  fixed, the suite is green, and the line still says otherwise, with no way to correct it short of hand-
  editing a ledger the `ledger-guard` hook denies.

## Consequences

The two records answer different questions and a reader can tell them apart. `**Degraded:**` says how much
of the chain ran. `**Unresolved:**` says whether the branch is sound. A pull request carries each
under its own heading.

A scope can no longer reach a pull request with a known failing suite unnoticed. Attended, that costs one
question. Unattended, it ends the sweep for that scope, which is the outcome `/superdev:afk` already takes
for a blocked anchor.

`scripts/scope.js` grows a second bullet-list line, and `status` reports both. A ledger written before
either existed still parses: an absent header line reads as absent rather than as an error.

Clearing wholesale means a run that fixes one of two standing defects and clears the line loses the record
of the other. The verb is written for the resumed run that re-verifies the whole scope, which is the case
that occurs. A run fixing one defect of several stops at the cap again and writes a fresh entry.
