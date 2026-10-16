# 0158: The derive dispatch runs in the background and reads no Definition of Done

**Status:** Accepted

**Amends:** [ADR 0099](0099-plan-derives-criteria-from-the-intent-before-slicing.md), whose reviewer
diffed its derived criteria against the drafted Definition of Done;
[ADR 0146](0146-derive-mode-reads-the-changed-code-for-failure-mode-classes.md), whose reviewer opened the
Definition of Done after its class pass; and, for derive mode only,
[ADR 0020](0020-the-final-reviewer-derives-its-own-criteria.md), whose path handoff let the reviewer open the
Definition of Done after its own list existed.

## Context

`/superdev:plan` dispatched `final-reviewer` in derive mode only after the Definition of Done was pinned,
and the operator waited for it. In 44 derive dispatches in this repository's transcripts, 2026-09-26 to
2026-10-16, the dispatch took 0.6 to 6.7 minutes, about 1.5 minutes before ADR 0146 and about 2.5 minutes
after it. The controller's settlement added 0.3 to 3.4 minutes. Time scales with the reviewer's serial
exploration turns, not with tool execution. The interview could not continue in that time.

## Decision

Plan dispatches derive mode in the background as soon as the problem, the solution shape, and the
changed-file list settle, before the Definition-of-Done passes, and keeps interviewing while it runs. The
dispatch carries no line of the plan's Definition of Done, and derive mode reads none by any route. The
reviewer returns every derived criterion and failure-mode class with a lean of criterion or non-goal. Once
the Definition of Done is final, the controller judges each item covered, fold, criterion, or non-goal,
checks every Definition-of-Done line for ambiguity, and puts one settlement to the operator.

A change to the problem or the solution shape re-dispatches, and only the current dispatch's result is
settled. A changed file added after the dispatch gets the class pass inline from the controller, for the
added files only. A dispatch that ends without a result falls back inline, as a denied one does.

The derivation stays blind to the Definition of Done, which is what ADR 0099 protects. The comparison
moves to the controller, which wrote the Definition of Done. ADR 0099 rejected the controller as the
deriver, not as the comparer, and the operator confirms every settlement.

## Considered options

- **Limit the reviewer's exploration.** Prose limits on what derive mode reads would shrink the wait. They
  are not enforced, and they narrow the class pass ADR 0146 added. It stays open as a later change if the
  wait remains long.
- **Two parallel dispatches**, criteria from the intent and classes from the code. The class pass is the
  slow half, so wall time barely drops.
- **Sonnet for derive mode.** Turns are faster, but no measurement shows Sonnet keeps the catch rate the
  pass exists for.
- **Re-dispatch on every change, including an added file.** One rule, every class judged blind to the
  Definition of Done. Each re-dispatch costs another 1 to 7 minutes, in the common case where the interview
  only finds one more file.

## Consequences

The operator waits only for what the dispatch has left when the Definition of Done is final. The
controller owns the ambiguous-line check and the fold judgment. A class in a file added late is judged by
the controller, which is not blind to the Definition of Done.
