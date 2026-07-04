# Glossary — superdev domain language

## Core concepts

**Epic** — the global Definition of Done (acceptance checklist) for a feature; a single container for all slices within that feature. The epic issue is optional when a feature has only one slice (that slice's acceptance becomes the DoD).
_Avoid: "feature issue", "parent issue"_

**Slice** — a vertical tracer bullet: a narrow but complete path through every layer (spec → implementation → test), independently green, demoable/verifiable on its own. Each slice carries test-applicability (behavior/mechanical/docs), a spec, acceptance criteria, and explicit dependencies on other slices.
_Avoid: "story", "task", "sub-issue", "chunk"_

**Tier** (execution) — the execution strategy for a plan, derived from the loaded slice count. `lite` (≤3 slices): controller implements each slice inline in a single scope worktree (test-first), then one final-reviewer; `full` (>3 slices): parallel capped implementers in isolated per-slice worktrees, per-slice reviewer + simplicity-reviewer, serial merges, final review. Never persisted, derived fresh every run.
_Avoid: "mode", "strategy", "level"_

**Scope** — a feature's scope branch and all its run artifacts (.superdev/<scope>/ directory: DoD, ledger, progress logs, worktrees). Scope is the namespace that lets multiple features' runs execute in parallel without colliding.
_Avoid: "run", "branch", "feature branch" (too generic)_

**Definition of Done (DoD)** — the checkable acceptance criteria for the whole feature (the epic, or a single slice if there's no epic). `.superdev/<scope>/dod.md` is the concrete verification plan that gates the final-reviewer and PR.
_Avoid: "requirements", "spec", "checklist" (DoD is the integrated checklist)_

**Ledger** — the per-scope recovery map: tracks each slice's status (todo → in-progress → in-review → merged), its commit range when merged, and the slice-id ↔ issue-key mapping. `.superdev/<scope>/ledger.md` is the authoritative state during a run and after compaction/resume.
_Avoid: "log", "status file", "tracker"_

**Worktree** — an isolated filesystem checkout used to keep a run's branch work off the invoking checkout. The full tier gives each slice its own **per-slice worktree** (`.superdev/<scope>/worktrees/<id>/`, plural); the lite tier uses a single **scope worktree** (`.superdev/<scope>/worktree/`, singular) for all its slices. Both nest under the git-ignored `.superdev/<scope>/`.
_Avoid: "branch", "workspace", "checkout"_

**Invoking checkout** — the working tree the user runs superdev from (their clone, usually on main). superdev never switches it: a run's branch work happens in a scope worktree, so the invoking checkout's HEAD, index, and files stay untouched and the user can keep working.
_Avoid: "main checkout", "user branch", "current tree"_

**Scope worktree** — the dedicated worktree a lite run cuts its scope branch into (`.superdev/<scope>/worktree/`), where all inline implementation, commits, and tests run. Isolates the run from the invoking checkout and from other sessions. The run root (dod/ledger) stays in the invoking checkout, not here, so it survives worktree removal.
_Avoid: "scratch checkout", "session workspace"_

**Progress log** — the per-slice running record of what happened: agent dispatches, reviews, fixes, merge results. `.superdev/<scope>/reports/<id>/progress.md` is append-only, oldest-first, git-ignored. Exists so a human or a resumed controller can see what unfolded without re-reading worktree state.
_Avoid: "log", "report", "transcript" (logs are broader; this is slice-specific narrative)_

## Acceptance / verification

**Acceptance** (per-slice) — the checkable criteria for ONE slice; the slice-reviewer verifies against this. Different from the global DoD (acceptance is per-slice, DoD is whole-feature).
_Avoid: "spec", "requirements" (acceptance is the test oracle)_

**Test-applicability** — the class of changes a slice carries: `behavior` (new functionality, needs TDD + per-slice reviewer + simplicity-reviewer), `mechanical` (move/rename/format, uses existing suite as the net, skips per-slice reviews), `docs` (documentation-only, skips reviews).
_Avoid: "slice type", "category"_

## Controller discipline

**Controller** — the agent driving a plan's slices to merge (you). You dispatch implementers/reviewers, you merge, you integrate serially. You never implement or merge inside a subagent.
_Avoid: "orchestrator", "manager"_

**Depends-on** — the set of slice IDs that must merge before a slice can start (a DAG edge). A slice depends on another only if it cannot be green without it; too-eager dependencies serialize work that could run in parallel.
_Avoid: "blocked by", "dependency" (too generic; "depends-on" is the explicit, load-bearing relationship)_

## Review discipline

**Final-reviewer** — the whole-scope review gate after all slices are merged. Checks the integrated diff against the global DoD. Applies the 3-strike fix loop (each fix with a RED test; on 3 strikes without going clean, escalate).
_Avoid: "final review", "scope review" (the role/agent, not just the step)_

**3-strike fix loop** — if a final-review (or per-slice review) fix cycle exposes a new defect, dispatch a fresh fix with a RED test; repeat. On 3 strikes (3 fix cycles each surfacing a new bug), stop: it's a wrong cut (hidden dependency, boundary too big), not a buggy slice. Move it → blocked and escalate.
_Avoid: "retry limit", "attempt count" (the 3 strikes are cycles, not attempts)_

## Separation of concerns

**Lite path** — execution tier for ≤3 slices: controller implements each slice inline in a single scope worktree (test-first, one worktree for all slices, no per-slice worktree branch), never switching the invoking checkout, then one final-reviewer over the whole diff (3-strike loop reused; all-mechanical/docs plans skip even that review). Deliberately relaxes "controller never implements inline" to kill small-plan token + latency overhead.
_Avoid: "inline implementation", "fast path"_

**Full path** — execution tier for >3 slices: parallel capped implementers in isolated worktrees, per-slice slice-reviewer (correctness) + simplicity-reviewer (over-engineering), serial merges into scope, one whole-scope final-reviewer. The existing architecture; unchanged for >3 slices.
_Avoid: "parallel path", "standard path"_
