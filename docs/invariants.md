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
