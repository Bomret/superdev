# 0203: Scope mode is split by job

**Status:** Accepted

## Context

`references/scope-mode.md` holds 25 `##` sections in about 104 KB. Five commands tell the controller to
read it whole: review, document, submit-pr, ship, and wrap-up. Each needs only the run basics, such as
what a live scope run is, how to capture `<run-root>`, and the run lock. A whole read stays in the
controller's context, and every later turn of that session reads it again. Transcripts of full-tier runs
from 2026-10-24 to 2026-10-29 show superdev's own reference prose as about 18% of the controller's context
growth.

## Decision

`scope-mode.md` keeps the run basics: the scope slug, the change type, a live scope run, resolving an empty
argument, the scope branch, the scope checkout, the run lock, the scope's range base, unattended runs, the
verification ceiling, and the rule that the stage never moves backwards. The other sections move into one
reference file per job:

- the branch work: containment, cutting, pushing, and bringing the scope branch to base;
- the run state: the ledger and publishing run state;
- the findings: degraded passes, unresolved defects, deferred findings, warm cycles, and observations;
- the shipped run: the posture at the merge commit, routing, adopting a shipped original, and staged pages
  at close.

Every citation of a moved section names its new file. `scope-mode.md` opens with a map naming each moved
section and the file that holds it, so a citation written against the one-file layout, in an adopter's
store document or in an ADR, still leads to its section. The playbooks `review-scope-mode.md` and
`implement-full.md` stay whole, because each serves one command, which reads most of it.

## Considered options

- **Name the sections in each whole-file read, and keep one file.** It changes fewer citations. It loses
  because a model handed a file path tends to read the whole file, so the saving depends on behaviour no
  check can hold.
- **A `scope.js` verb that prints one section.** It adds a CLI surface and a call per section. It loses for
  the same reason as above, and because transcripts showed few controller reads go through `scope.js` at all.

## Consequences

A command that reads `scope-mode.md` whole loads about an eighth of what it loaded before. Citations of the
moved sections change across skills, references, library messages, and drift checks, and the drift checks
that pin a section by file follow the section to its new file.
