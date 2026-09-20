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
