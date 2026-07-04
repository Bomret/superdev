# 0002 — Metrics are proxies; the passing bar is verified independently of the agent that meets it

**Status:** Accepted

**Context.** superdev gates work on measures that each stand in for a goal they don't fully capture:
the green-gate's test command for "code correct", a DoD line for "user-observable behaviour delivered",
slice count for "complexity", the fix-loop cap for "converged". The implementer subagent is an optimizer
pointed at these measures — and by Goodhart's law, *a measure under optimization pressure stops measuring
its goal*. The dominant failure mode: an LLM told to make the suite green makes it green without making
the code correct (weakened assertions, narrowed cases, hardcoded returns) — the adversarial variant, acute
because the implementer both writes the code and would otherwise own the bar it's judged against.

**Decision.** No agent verifies its own passing bar.

- The green-gate is a proxy, not proof. The **slice-reviewer independently re-runs the suite and reads
  the produced artifact**, hunting input the tests miss — never trusting the implementer's reported green.
- **DoD criteria describe observable, user-facing behaviour**, not gameable proxy counts (coverage %,
  line count, lint score). Behaviour can't be faked without doing the work; a count can. Where a proxy
  count is used at all, it's a signal a reviewer reads — never a gate an agent optimizes toward.
- The implementer never defines or loosens its own criteria; author, implementer, reviewer stay separate.
- Tier slice-count and fix-loop cap are gameable (an author can split/merge slices to land the cheaper
  tier — the Lucas critique), so they're treated as routing heuristics, not correctness guarantees. A run
  nearing the fix-loop cap is a signal to inspect for papering-over, not evidence of a fix.

**Consequences.** Reviewer independence is load-bearing, not redundant re-running: its token cost —
re-running and re-reading what the implementer already produced — is paid deliberately and must not be
traded away for reusing the implementer's result. DoD authoring (`/superdev:plan`,
`docs/agents/verification.md`) biases toward behavioural criteria over proxy counts. Threshold tuning is a
routing decision, not a correctness one.
