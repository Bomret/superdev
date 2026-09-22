# Invariant register

Rules this repository's system may never break. `plugin/references/domain-modeling.md` owns the entry
format; `/superdev:plan` adds an entry when one crystallises.

### INV-0001

Class: architecture
Statement: No superdev command commits to the base branch. Every write a run makes lands on that run's own scope branch, in its own scopetree.
Concepts: Base branch, Scope branch, Scopetree, Run root
Breaks: silently
Check: scripts/drift-check.js — no shipped prose instructs a commit to the base branch
Paths: plugin/skills/**, plugin/references/**

### INV-0002

Class: process
Statement: A load-bearing commitment that reaches /superdev:plan leaves the run either as an invariant register entry or as a reason, named out loud, that it implies no entry. None is dropped in silence.
Concepts: Load-bearing commitment, Invariant register, Intent
Breaks: silently
Check: scripts/drift-check.js — the commitment contract, pinned together in brainstorm's prose, plan's prose, and domain-modeling.md
Paths: plugin/skills/brainstorm/**, plugin/skills/plan/**, plugin/references/domain-modeling.md

### INV-0003

Class: architecture
Concepts: Containment, Scope branch, Base branch
Statement: A containment test answers contained only on positive evidence that base holds the branch's work — an equal tree, or a patch id base's history carries. Every path that cannot answer, whether a failed git call, an exhausted bound, or an unresolved ref, answers not contained.
Breaks: silently
Check: tests/scope.test.js, tests/scope-prune.test.js — each failure path asserted to answer not contained
Symbols: testContainment, baseHistoryHasPatch, containedInBase
Paths: plugin/scripts/scope.js, plugin/hooks/scope-prune.js

### INV-0004

Class: architecture
Concepts: Definition of Done, Append mode, Scope anchor
Statement: A Definition of Done is a claim verified at one moment against one change. A ticked criterion is always readable against the change it was verified against, and is never pooled in one record with criteria from another run.
Breaks: silently
Check: scripts/drift-check.js — /superdev:plan's extend path refuses a shipped feature on either signal
Paths: plugin/skills/plan/**, plugin/references/run-init.md

### INV-0005

Class: process
Concepts: Release, Append mode, Scope anchor
Statement: A release decision covers the work that existed when it was made. Work added to a feature after its release does not inherit that release.
Breaks: silently
Check: scripts/drift-check.js — plan's release question applies the operator's answer in both directions on an append
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md

### INV-0006

Class: architecture
Concepts: Definition of Done, Verification ceiling, Scope branch
Statement: Verifying a Definition-of-Done criterion observes. It changes no system outside the repository. An item that needs an outward-facing change to verify stays unticked, with a note, for the operator to verify after merge.
Breaks: silently
Check: scripts/drift-check.js — VERIFICATION_CEILING_CONTRACTS pins the ceiling on scope-mode.md's own `## Verification ceiling` section, on both verifying agent bodies, and on every prose that dispatches them
Paths: plugin/references/scope-mode.md, plugin/agents/final-reviewer.md, plugin/agents/implementer.md, plugin/skills/review/**, plugin/skills/implement/**, plugin/skills/ship/**, plugin/references/run-handoff.md

### INV-0007

Class: process
Concepts: Focused test command, Verification
Statement: A configuration a repository cannot supply is recorded with its reason, never inferred from an absent setting. `hooks/green-gate.js` is the one named exception: firing with no operator to ask, it infers the full command from a one-fence `verification.md` and emits a notice instead of stopping.
Breaks: silently
Check: scripts/drift-check.js — setup writes both fences with the cannot-narrow reason as prose, test-selection.md stops rather than inferring the full command, plan/implement auto-invoke setup on a repository stuck on one fence, and green-gate.js runs the full command with a notice instead of stopping
Paths: plugin/skills/setup/**, plugin/references/test-selection.md, plugin/skills/plan/**, plugin/skills/implement/**, plugin/hooks/green-gate.js

### INV-0008

Class: process
Concepts: Definition of Done, Reachability criterion
Statement: A Definition-of-Done criterion states a requirement the feature meets, never a procedure superdev executes to verify it. A Reachable: criterion names an entrance, which is not a procedure.
Breaks: silently
Check: scripts/drift-check.js `criterion-states-a-requirement` — the rule pinned on plan-contract.md and plan's interview
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md

### INV-0009

Class: architecture
Concepts: No verdict, Containment
Statement: On `plugin/hooks/green-gate.js` and `plugin/scripts/scope.js`, a process that did not finish carries no verdict. No gate reads its absence as a pass, and no assertion about behaviour stands on it. A spawn ended by its own bound is reported as killed, never as a decision it never made. The OpenCode/Codex hook bridge (`plugin/scripts/adapter.js`'s `runBridgeHook`) reads a killed or errored hook spawn as a pass — triage record #606 tracks bringing it under this invariant; until then this Statement does not cover it.
Breaks: silently
Check: tests/spawn-verdict.test.js — the helper's throw-or-not and message for the killed, never-started, EPIPE-but-decided, and genuinely-decided result shapes; tests/green-gate.test.js — a killed suite blocks the merge; tests/scope.test.js — the refetch asserts the kill signal rather than the clock
Paths: plugin/hooks/green-gate.js, plugin/scripts/scope.js, tests/**
