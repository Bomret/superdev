# 02 — Eval harness + first /plan case

depends-on: [01]
test-applicability: behavior
status: todo

## spec

Create an `evals/` suite runnable by `claude plugin eval`, with at least one case exercising
`/superdev:plan`: a `case.yaml` (or `prompt.md`) that feeds a small feature intent, plus a grader under
`graders/` that checks the produced plan has a global DoD, ≥2 vertical slices, valid `depends-on` ids,
and a `test-applicability` on each slice. Add a `bun run eval` script wrapping `claude plugin eval`.
Keep it to one small case — a seed others extend, not a full suite.

Depends on 01 only because both edit `package.json` scripts (avoid a merge conflict).

## acceptance

- `bun run eval` runs the case and produces a scored result.
- The grader fails a deliberately bad plan (no DoD or no deps) and passes a good one.
- `evals/` matches `claude plugin eval`'s expected layout (`evals/**/case.yaml` or `prompt.md` +
  `graders/*.md`).
