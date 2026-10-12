# 0142: The fail-to-pass bound has a floor

**Status:** Accepted

**Amends:** [ADR 0134](0134-a-fail-to-pass-run-shows-a-change-s-tests-discriminate.md), which bounds the
run before the change at ten times the duration the run against the changed code took.

**Context.** ADR 0134 bounds the second run of a fail-to-pass run at ten times the control's duration,
because code missing the feature can hang. A control that finishes in milliseconds gives a bound of the
same order. Triage #1059 records a control of about 14 ms, a bound of 142 ms, and a second run killed at
that bound under machine load. The outcome was `unknown` with no defect present. Scheduler delay alone
exceeds a bound that short, so any fast test command can lose its verdict on a busy machine. The same
pattern made `tests/publish-kb.test.js` fail under load (triage #876) until its bound got a floor.

**Decision.** The second run's bound is ten times the control's duration or 10 000 ms, whichever is
larger. The factor still governs a slow suite. The floor governs a fast one, where the factor gives a bound
smaller than the delays a loaded machine adds. A run killed at the bound still carries no verdict
(INV-0009), and the outcome line still names the bound it ran under.

`SUPERDEV_FAIL_TO_PASS_FLOOR_MS` overrides the floor, in milliseconds. A value that is empty, not a
positive whole number, or above 2147483647 reads as absent, so the floor stays 10 000 ms. The verb names a
rejected non-empty value in one line on stderr. The outcome line does not change.

**Considered options.**

- **Factor only (ADR 0134).** Rejected: a millisecond control gives a millisecond bound, and the verb
  records `unknown` on a loaded machine with no defect present.
- **A floor of 1000 ms.** Rejected: `tests/publish-kb.test.js` used that floor and still failed under
  load (triage #876).
- **Slower test fixtures only.** Rejected: the fixtures stop flaking, but the verb keeps losing the verdict
  for any fast real suite.

**Consequences.** A fast suite keeps its fail-to-pass verdict on a loaded machine. A put-back run that
hangs costs up to 10 seconds before the verb kills it, where a fast control used to cost a few hundred
milliseconds. The root `AGENTS.md` duration rule governs test assertions, not this production bound, so
the floor does not conflict with it: a floor only makes a healthy run less likely to be killed.
