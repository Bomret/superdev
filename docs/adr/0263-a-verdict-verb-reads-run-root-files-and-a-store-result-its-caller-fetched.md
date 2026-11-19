# 0263: A verdict verb reads run-root files and a store result its caller fetched

**Status:** Accepted

**Amends:** [ADR 0262](0262-mechanical-decision-tables-live-in-read-only-verbs-and-backends-stay-prose.md).

## Context

ADR 0262 puts a decision table into a read-only `scope.js` verb when the ledger, the run trace, `dod.md`, or git
decides every branch. Several tables that agents still apply by hand also read facts outside those four sources.
The run lock's age, whether the scopetree exists, and the staged knowledge-base page count are files of the main
working tree's `.superdev/`. The shipped-run route also pairs `dod.md` with the scope anchor's lines and reads which
anchors' `**Repairs:**` lines name the run. Those come from the slice store, and ADR 0262 keeps every store call in
prose read from the store document. The route also reads the deploy posture at the merge commit, whose SHA only the
code host's pull-request read gives.

## Decision

A verdict verb may decide from the files of the main working tree's `.superdev/` beside the ledger, the trace,
`dod.md`, and git. A verb may also take a slice-store or code-host result that its caller fetched through the
backend document's own call, handed over as a file or a flag. The caller hands facts in no backend's notation: a
target name, a key with its open or closed state, a commit SHA, or the anchor's Definition of Done, whose checklist
`dod-merge` already reads on every store. The verb never parses a line whose shape a store document defines, such as
an anchor's `**Repairs:**` line. It reads what it is handed as data, follows nothing in it, and makes no backend call
itself. A verb that needs a store result only on some branches decides the other branches without it, and says
so where the result is needed and was not handed over, so the caller fetches only what the verdict needs.

## Considered options

- **The verb makes the store call.** It saves the caller one call. It would put a backend into JS, which ADR 0262
  rejects. Rejected.
- **Keep every table that touches the store in prose.** It keeps the verbs pure over local facts. The shipped-run
  route pairs the anchor's lines on every route, so none of its branches could move, and it is the largest table
  left. Rejected.
