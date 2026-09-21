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
