# 0118: Review and fix model tiers follow measured evidence

**Status:** Accepted

**Amends:** [ADR 0037](0037-the-full-tier-skips-the-whole-scope-over-engineering-pass.md),
[ADR 0063](0063-test-cost-is-a-review-lens.md): `simplicity-reviewer` moves from `haiku` to `sonnet`.

**Context.** On a `full`-tier run, each finding the scope review reports costs a whole-scope fix cycle:
an implementer dispatch, an `opus` re-review, and the full suite entering and leaving. Transcripts of seven
`full`-tier scopes (classified 2026-10-05, one reader) showed where the findings came from:

- Of 64 first-pass final-review findings, 20 sat in one slice's diff and were visible from that slice's
  spec and diff alone. 27 needed context the slice reviewer is not handed, and 11 spanned slices.
- Of 44 re-review findings, 37 were introduced by the scope fix cycles. 16 were new defects in the fix
  diff. 20 were incomplete fixes, most of them leaving another file stating the old rule. So 36 of the
  37 fix-introduced findings were new defects or incomplete fixes. Every scope fix implementer ran on
  `sonnet`.
- Fix cycles per `/superdev:review` invocation: 2, 2, 2, 3, 1, 2 and 3 across the scopes with complete
  transcripts. `affected-suites` is excluded, because five of its cycles left no transcript.
- Only 4 first-pass findings were over-engineering, and 1 of them sat in one slice. The per-slice
  `simplicity-reviewer` on `haiku` returned "Lean already" on 30 of 34 dispatches, with a median of 147 s.

Two replays re-ran the reviewers on historical slices, one run per model, with no suite run and no
progress log (branch `prototype/slice-review-replay`). On the 10 slices behind the 16 slice-visible
findings the original slice reviews missed or dismissed, `slice-reviewer` on `opus` caught 7 and 3
partially, on `sonnet` 5 and 1, and on `sonnet` with the final reviewer's lenses added 3 and 1. On the
6 slices behind the over-engineering findings, `simplicity-reviewer` on `haiku` caught 0 of 6 and said
"Lean already" on all 6 in 106-226 s. On `sonnet` it caught 2 in 13-26 s, and on `opus` 1 in 24-50 s.
Some `sonnet` cuts contradicted repository rules, such as dropping drift rows.

**Decision.** `slice-reviewer` runs on `opus`. `simplicity-reviewer` runs on `sonnet`, wherever it is
dispatched. The scope review's fix-cycle implementer runs on `opus`. The fix runs on `haiku` only when
the controller classifies every finding in the list as a mechanical finding, and any non-mechanical
finding keeps the whole dispatch on `opus`. A mechanical finding is one whose fix changes no stated rule
or behaviour, such as a rename, a rewrap, or a typo. A fix that changes a rule or behaviour any surface states
needs the sibling-surface search, so it stays off `haiku`. The per-slice fix loop and the run handoff's red-suite fix keep
their models. Every fix dispatch requires the implementer to bring each **sibling surface** in its own
checkout into agreement and to report what it checked and changed. A place outside the checkout is
reported, not edited. The `AGENTS.md` hierarchy and the knowledge base are reported unedited too, because
the doc pass owns them. A fix report that omits the checked-and-changed list is sent back to the
implementer before the next step. Before that step, the controller also greps the checkout for the key
phrase of the rule the fix changed, in its old wording and its new, and compares the hits with the
report's checked list. A hit in a file the list does not name is a missed sibling surface, and the
controller sends the report back, naming the hit, in the same cycle. A hit in the `AGENTS.md` hierarchy
or the knowledge base is reported instead. A hit in `CHANGELOG.md` is release history and needs no
change.
When run handoff's red-suite fix loop lands commits after a `lite` run's inline doc pass, it
clears the inline-doc-pass record, so the full doc writer runs next. The controller applies a
recommended cut only when the cut honours the rules the repository documents for itself, and it
names each cut it declines.

A change to one of these model tiers cites a measurement of the same kind, so the next change can rerun
it. The success check is the same transcript classification, rerun after three more `full`-tier scopes.
Fix cycles per review invocation should fall below the baseline above, and fix-introduced re-review
findings that are new defects or incomplete fixes should fall below the baseline of 36 of those 37.

**Considered options**

- **`sonnet` slice reviewer with the final reviewer's lenses added.** It lost because it scored below the
  plain `sonnet` control (3 and 1 against 5 and 1). The `opus` reviewers reported stale sibling docs
  without the added lenses.
- **Slice reviewer on `opus` alone.** It lost because 37 of 44 re-review findings came from the scope fix
  cycles, which the slice reviewer never sees.
- **`simplicity-reviewer` stays on `haiku`.** It lost because it reported nothing on every replayed
  slice and was the slowest of the three models.
- **Re-review each applied cut.** It lost because it adds an `opus` dispatch per cut, against the
  wall-clock goal. No applied cut caused a final-review finding in the data.

**Consequences.** The replays ran once per model on 16 and 6 findings, so the gap between `sonnet` and
`opus` on slice reviews is within run-to-run noise. The rerun after three scopes is what confirms or
reverses this decision.

The controller's grep catches a missed sibling surface only where that surface repeats the rule's key
phrase. A sibling that states the rule in other words passes the cross-check, so the implementer's own
search stays the primary reconciliation.
