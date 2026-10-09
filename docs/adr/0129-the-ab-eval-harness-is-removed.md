# 0129: The A/B eval harness is removed

**Status:** Accepted

**Supersedes:** [ADR 0024](0024-the-eval-suite-runs-on-subscription-auth.md),
[ADR 0038](0038-a-prose-ablation-runs-as-two-hand-toggled-eval-runs.md),
[ADR 0067](0067-the-grader-shape-gate-tracks-the-eval-runners-capability.md),
[ADR 0070](0070-the-gate-derives-its-grader-schema-from-the-runner.md).

## Context

ADR 0024 built `scripts/eval-run.js` to answer superdev's central claim: on the same task, in the same
repo, does the plugin beat Claude Code with no plugin at all? It made reading the instrument free in
money, on the reasoning that a suite costing real money per read goes unread.

It went unread anyway. One run exists, from 2026-08-20. It covered two of the seven cases. Every grader
in it reports `n: 1`, and every delta is `0` or `null` — one arm errored outright. Nothing was ever
concluded from it, and no release ever gated on it.

What the instrument cost while producing that: `scripts/eval-run.js`, the cases and graders under
`evals/`, `drift-check`'s `eval-shape` and `scaffold-ledger` checks with their selftest vectors, the
runner's own `--selftest` on every `bun run test`, and four ADRs — two of which (0067, 0070) decide only
how the gate tracks the runner, a question that exists because the runner does.

An A/B whose delta is a single sample is not a measurement. Making it one needs runs per case in the
tens, across cases whose scaffolds each cost a full build, on a subscription window that is the
maintainer's own. That budget was never spent and there is no plan to spend it.

## Decision

Delete the harness: `scripts/eval-run.js`, `evals/`, the `eval` and `eval:plan` package scripts, the
runner's `--selftest` from `bun run test`, and the two `drift-check` checks that exist only to police
eval files (`eval-shape`, `scaffold-ledger`) along with `GRADER_TYPES` and `FOCUS_TYPES`.

The claim superdev makes about itself stands unmeasured, and stating that plainly is better than
pointing at an instrument nobody reads.

## Considered options

- **Keep the cases, drop the runner**, and read them with `claude plugin eval` instead. It removes the
  larger half of the cost and keeps the option of measuring later. It also keeps the `eval-shape` gate
  alive to guard files with no reader, and the cases have never been read by that harness either.
  Rejected as a half-deletion that leaves the maintenance and drops the capability.
- **Keep everything and actually run it.** The honest alternative. It needs a budget decision about the
  subscription window and a per-case run count that makes a delta mean something. Reachable again: the
  cases are in this repository's history, and restoring one is a `git show`.

## Consequences

- `bun run test` loses a step and runs faster. The suites under `tests/` and `drift-check` are unchanged,
  so every shipped executable keeps its coverage.
- superdev has no empirical claim against a no-plugin baseline. Its behaviour contracts are checked by
  `tests/` and `drift-check`, which measure that the plugin does what it says, never that saying it
  helps.
- A prose ablation (ADR 0038) has no mechanism. A contested prompt line is settled by argument again.
- Restoring the harness means restoring deleted files rather than reviving dormant ones. The decision to
  measure would come first, with its budget, and the files follow it.
