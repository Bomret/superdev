# 0002: Metrics are proxies, and the passing bar is verified independently of the agent that meets it

**Status:** Accepted

**Amended by:** [ADR 0155](0155-a-slice-merge-runs-no-test-suite.md), which deletes the green-gate, so the
test command is a proxy in the implementer's and the slice-reviewer's runs and the run handoff's full run.

**Context.** superdev gates work on measures that each stand in for a goal they do not fully capture:
the green-gate's test command for "code correct", a DoD line for "user-observable behaviour delivered",
slice count for "complexity", the 3-strike fix loop's cap for "converged". The implementer subagent is an optimizer
pointed at these measures, and by Goodhart's law, *a measure under optimization pressure stops measuring
its goal*. The dominant failure mode: an LLM told to make the suite green makes it green without making
the code correct (weakened assertions, narrowed cases, hardcoded returns). That is the adversarial variant, acute
because the implementer both writes the code and would otherwise own the bar it is judged against.

**Decision.** No agent verifies its own passing bar.

- The green-gate is a proxy, not proof. The **slice-reviewer independently re-runs the suite and reads
  the produced artifact**, hunting input the tests miss, and never trusting the implementer's reported green.
- **DoD criteria describe observable, user-facing behaviour**, not gameable proxy counts (coverage percentage,
  line count, lint score). Behaviour cannot be faked without doing the work, and a count can. Where a
  proxy count is used at all, it is a signal a reviewer reads, never a gate an agent optimizes toward.
- The implementer never defines or loosens its own criteria. Author, implementer, and reviewer stay separate.
- Tier slice-count and the 3-strike fix loop's cap are gameable (an author can split or merge slices to land
  the cheaper tier, the Lucas critique), so they are treated as routing heuristics, not correctness
  guarantees. A run nearing the fix loop's cap is a signal to inspect for papering-over, not evidence of
  a fix.

**Consequences.** Reviewer independence is load-bearing, not redundant re-running. Its token cost is
re-running and re-reading what the implementer already produced, and that cost is paid deliberately and
must not be traded away for reusing the implementer's result. DoD authoring (`/superdev:plan`,
`docs/agents/verification.md`) biases toward behavioural criteria over proxy counts. Threshold tuning is a
routing decision, not a correctness one.
