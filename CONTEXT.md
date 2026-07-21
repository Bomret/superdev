# Glossary — superdev domain language

## Core concepts

**Epic** — the slice-store container for a multi-slice feature: a single issue (or `docs/plans/<feature-slug>/00-epic-*.md`) that groups all the feature's slices and holds the source text for the global DoD. Optional — a single-slice feature has no epic; that slice's `acceptance` becomes the DoD directly.
_Avoid: "feature issue", "parent issue", "the DoD" (the epic holds/sources the DoD's text; `.superdev/scopes/<scope>/dod.md` is the concrete DoD itself)_

**Slice** — a vertical tracer bullet: a narrow but complete path through every layer (specification → implementation → test), independently green, demoable/verifiable on its own. Each slice carries test-applicability (behavior/mechanical/docs), a specification, acceptance criteria, and explicit dependencies on other slices.
_Avoid: "story", "task", "sub-issue", "chunk"_

**Tier** (execution) — the routing decision for a plan, derived from the loaded slice count, and the procedure that decision runs. `lite` (≤3 slices): controller implements each slice inline in a single scope worktree (test-first, no per-slice worktree branch), never switching the invoking checkout, then one final-reviewer over the whole diff (3-strike loop reused; all-mechanical/docs plans skip even that review) — deliberately relaxes "controller never implements inline" to kill small-plan token + latency overhead. `full` (>3 slices): parallel capped implementers in isolated per-slice worktrees, per-slice slice-reviewer (correctness) + simplicity-reviewer (over-engineering), serial merges into scope, one whole-scope final-reviewer. Never persisted, derived fresh every run. Each tier's linear procedure is read from its **execution playbook** (see _Separation of concerns_).
_Avoid: "mode", "strategy", "level", "route", "path"_

**Scope** — a feature's scope branch and all its run artifacts (.superdev/scopes/<scope>/ directory: DoD, ledger, progress logs, worktrees). Scope is the namespace that lets multiple features' runs execute in parallel without colliding. `.superdev/` also holds non-scope areas nested outside `scopes/` (e.g. `.superdev/brainstorm/`) — `/status` only scans `.superdev/scopes/*/`, so a sibling area can never be mistaken for a run root.
_Avoid: "run", "branch", "feature branch" (too generic)_

**Scope anchor** — the single slice-store issue that carries the scope-level status signal for a run: the epic issue if one exists, otherwise the lone slice on a single-slice feature. Moves to `in-progress` when the run starts and `merged`/`done` once the whole scope is done — distinct from any individual slice's own status transitions.
_Avoid: "epic" (only an epic-bearing feature has one; the anchor role also falls to a lone slice)_

**Run root** — the part of `.superdev/scopes/<scope>/` that stays in the invoking checkout across both tiers: `dod.md`, `ledger.md`, `run.lock`, and on the full tier `interfaces.md` (the cross-slice interface record). Never moves into a worktree, so it survives worktree removal as the post-mortem trail and lets `/status` enumerate runs without touching any worktree.
_Avoid: "run directory", "scope dir" (too generic — this is specifically the checkout-resident subset, not the whole `.superdev/scopes/<scope>/` namespace)_

**Definition of Done (DoD)** — the checkable acceptance criteria for the whole feature, sourced from the epic if one exists, or from the lone slice's `acceptance` if not. `.superdev/scopes/<scope>/dod.md` is the concrete verification plan that gates the final-reviewer and PR.
_Avoid: "requirements", "specification", "checklist" (DoD is the integrated checklist)_

**Ledger** — the per-scope recovery map: tracks each slice's status (todo → in-progress → in-review → merged), its commit range when merged, and the slice-id ↔ issue-key mapping. `.superdev/scopes/<scope>/ledger.md` is the authoritative state during a run and after compaction/resume.
_Avoid: "log", "status file", "tracker"_

**Worktree** — an isolated filesystem checkout used to keep a run's branch work off the invoking checkout. The full tier gives each slice its own **per-slice worktree** (`.superdev/scopes/<scope>/worktrees/<id>/`, plural); the lite tier uses a single **scope worktree** (singular — see below) for all its slices. Both nest under the git-ignored `.superdev/scopes/<scope>/`.
_Avoid: "branch", "workspace", "checkout"_

**Invoking checkout** — the working tree the user runs superdev from (their clone, usually on main). The `lite` tier never switches it: a lite run's branch work happens in its scope worktree, so the invoking checkout's HEAD, index, and files stay untouched and the user can keep working. The `full` tier does switch it — `git switch -c superdev/<scope> <base>` happens directly in the invoking checkout, with only per-slice work isolated in worktrees off that branch (converting full's own scope integration to a worktree too is a deferred follow-on, ADR 0001).
_Avoid: "main checkout", "user branch", "current tree"_

**Scope worktree** — the dedicated worktree a lite run cuts its scope branch into (`.superdev/scopes/<scope>/worktree/`), where all inline implementation, commits, and tests run. Isolates the run from the invoking checkout and from other sessions. The run root (dod/ledger) stays in the invoking checkout, not here, so it survives worktree removal.
_Avoid: "scratch checkout", "session workspace"_

**Run lock** — the `.superdev/scopes/<scope>/run.lock` file plus the `run-lock` hook that together enforce same-scope mutual exclusion for the `lite` tier: a fresh lock blocks a second concurrent run of the same scope from cutting its own scope worktree; a stale lock (past the staleness threshold) is reclaimable as a crash resume.
_Avoid: "lockfile" (that names a dependency-manifest file elsewhere), "mutex" (too implementation-generic)_

**Progress log** — the per-slice running record of what happened: agent dispatches, reviews, fixes, merge results. `.superdev/scopes/<scope>/reports/<id>/progress.md` is append-only, oldest-first, git-ignored. Exists so a human or a resumed controller can see what unfolded without re-reading worktree state.
_Avoid: "log", "report", "transcript" (logs are broader; this is slice-specific narrative)_

**Warrant** — the justification a piece of work carries; scales both cost (which model a dispatch uses) and rigor (which review gates run). Derived from a slice's test-applicability + complexity, never a plan field. A `behavior` slice warrants more than a `mechanical` one; a hook blocks any dispatch that omits an explicit model so cost stays warrant-scaled.
_Avoid: "priority", "estimate", "weight"_

**Intent** — a rough idea sharpened into something plan-ready: the problem, a few candidate directions, the MLP, and the open questions. Output of `/brainstorm`, input to `/plan`.
_Avoid: "idea", "requirements", "specification"_

**Minimal Lovable Product (MLP)** — the smallest end-to-end version of the chosen direction that delivers real value: a complete (if narrow) path through the system a user could actually use, not a fragment of the final thing. Found in `/brainstorm` step 3, carried into `Intent`'s rough scope.
_Avoid: "skateboard" (Kniberg's MVP-evolution analogy — unclear without the backstory), "MVP" (implies bare-minimum/incomplete, not "usable and complete but narrow")_

**Load-bearing decision** — a decision the plan can't ship without: leaving it unresolved means the plan isn't actually decided, not just thin on detail. Triggers `Parked questions` when the interview can't resolve it (multi-slice only); on a single-slice plan, an unresolved one signals the plan isn't single-slice-simple yet, not something to park.
_Avoid: "blocker", "important question" (any open question can be unimportant; load-bearing specifically means the plan can't ship without it resolved)_

**Parked questions** — a load-bearing decision that survived `/plan`'s interview still unresolved, written to the epic's `## Parked questions` section the moment it's parked (cross-exam.md's termination rule permits ending an interview this way). Advisory only: `/implement` never reads it, nothing gates on it. Distinct from `Intent`'s open questions (brainstorm's pre-interview output, which `/plan` is expected to resolve) — a parked question is what's left after `/plan` already tried and couldn't.
_Avoid: "open questions" (that's Intent's pre-interview concept), "blocker", "TODO"_

## Acceptance / verification

**Acceptance** (per-slice) — the checkable criteria for ONE slice; the slice-reviewer verifies against this. Different from the global DoD (acceptance is per-slice, DoD is whole-feature).
_Avoid: "specification", "requirements" (acceptance is the test oracle)_

**Test-applicability** — the class of changes a slice carries: `behavior` (new functionality, needs TDD + per-slice reviewer + simplicity-reviewer), `mechanical` (move/rename/format, uses existing suite as the net, skips per-slice reviews), `docs` (documentation-only, skips reviews).
_Avoid: "slice type", "category"_

## Controller discipline

**Controller** — the agent driving a plan's slices to merge (you). You dispatch implementers/reviewers, you merge, you integrate serially. You never implement or merge inside a subagent.
_Avoid: "orchestrator", "manager"_

**Depends-on** — the set of slice IDs that must merge before a slice can start (a DAG edge). A slice depends on another only if it cannot be green without it; too-eager dependencies serialize work that could run in parallel.
_Avoid: "blocked by", "dependency" (too generic; "depends-on" is the explicit, load-bearing relationship)_

## Review discipline

**Final-reviewer** — the whole-scope review gate after all slices are merged. Checks the integrated diff against the global DoD. Read-only (`Read`, `Grep`, `Bash` — no `Edit`): its findings drive the controller's 3-strike fix loop (each fix with a RED test; on 3 strikes without going clean, escalate), it never applies a fix itself.
_Avoid: "final review", "scope review" (the role/agent, not just the step)_

**3-strike fix loop** — if a final-review (or per-slice review) fix cycle exposes a new defect, dispatch a fresh fix with a RED test; repeat. On 3 strikes (3 fix cycles each surfacing a new bug), stop: it's a wrong cut (hidden dependency, boundary too big), not a buggy slice. Move it → blocked and escalate.
_Avoid: "retry limit", "attempt count" (the 3 strikes are cycles, not attempts)_

**Judge discipline** — the verification principle shared verbatim by all three review agents: verify the artifact/behaviour yourself, never defer to the implementer's or controller's narrative of what was done; length or an elaborate structure isn't its own evidence of correctness or of warranted complexity; reject a completion claim resting only on proxy counts (coverage %, line count, lint score) — confirm the observable behaviour instead (ADR 0002).
_Avoid: "verification discipline" (too generic — this specifically means not trusting the builder's account of its own work)_

## Separation of concerns

**Execution playbook** — the linear, tier-specific procedure the controller `Read`s once the tier is computed: `references/implement-full.md` (full tier) or `references/implement-lite.md` (lite tier). The `/implement` command body keeps only the tier-agnostic core (invariants, config, Phase 0, issue-status map, final review + PR) and delegates the execution flow to the matching playbook, so each run loads only the one it takes.
_Avoid: "command" (the playbook is the file the command delegates to, not the command itself)_

**Review checklist** — the shared file (`references/review-checklist.md`) naming concrete anti-patterns, vulnerability classes, a reuse-audit lens, and a consistency lens (convention drift, cross-slice divergence), read at dispatch time — `final-reviewer` applies all four lenses, `slice-reviewer` applies anti-patterns + vulnerability classes — the same shared-file-read-at-dispatch pattern as `Execution playbook`, one level down (a checklist of things to look for, not a procedure to follow).
_Avoid: "checklist" alone (ambiguous with the DoD's own checklist), "linter rules" (it's read and reasoned about, not mechanically run)_

## Backends

superdev is tool-agnostic: three pluggable backends, each chosen by `/setup` and recorded under `docs/agents/`. The commands and agents never hardcode one.

**Seed** (seed template) — a backend-config template file under `references/` (e.g. `issue-tracker-jira.md`, `code-management-github.md`) that `/setup` reads and fills in with repo-specific specifics to produce the matching `docs/agents/*.md`. Adding a backend = a new seed + the setup step that consumes it.
_Avoid: "template" alone (too generic), "backend file" (that names the `docs/agents/*.md` output, not the `references/` input)_

**Slice store** — the backend where a feature's plan and slices live: local files, or an issue tracker. Configured in `docs/agents/issue-tracker.md`.
_Avoid: "issue tracker" as the concept name (that's one backend), "database"_

**Status map** — the agreed mapping from superdev's canonical slice lifecycle (`todo` → `in-progress` → `in-review` → `merged`/done, plus `blocked`) to an issue tracker's real statuses/transitions. Captured by `/setup` for issue-backed slice stores, recorded in `issue-tracker.md`, walked by `/implement` at each lifecycle point.
_Avoid: "status mapping", "workflow" (too generic)_

**Code host** — the backend the scope branch pushes to and where the PR/MR opens. Configured in `docs/agents/code-management.md`.
_Avoid: "code-management" (that's the doc slug), "GitHub" (that's one host)_

**PR posture** — the three-state config value controlling how `/implement` opens the PR: `draft` (open as draft), `ready` (open ready-for-review), or `push-only` (push the branch, skip opening a PR). Set per code host during `/setup`, recorded in `code-management.md`.
_Avoid: "PR mode", "draft mode" (only one of the three states)_

**Knowledge base** — the optional human-first record (feature specifications, design overviews, ADR summaries), distinct from the agent-first `AGENTS.md` docs. May be `none`. Reconciled by the doc-writer.
_Avoid: "docs" (too broad — the AGENTS.md tree is separate), "wiki" (that's one KB)_

**Feature specification** — the KB's one-page-per-feature document: the problem, solution shape, and Definition of Done, written for the KB's audience(s) and language. Distinct from a slice's own `spec`: this is one per-feature narrative for readers, not a per-slice implementer contract.
_Avoid: "PRD" (implies business-case/persona content this doc doesn't carry), "specification" alone (collides with the per-slice `spec` field)_

## Roles

The subagents the controller dispatches; each runs in isolated context and only its result returns. **Controller** and **Final-reviewer** carry discipline beyond their name — defined under _Controller discipline_ and _Review discipline_ above.

**Implementer** — builds ONE slice test-first (TDD), the laziest version that works. Never merges (a hook enforces it).
_Avoid: "developer", "coder"_

**Slice-reviewer** — per-slice correctness gate (full tier, `behavior` slices): verifies against the slice's acceptance and independently re-runs the suite + reads the produced artifact, hunting uncovered input.
_Avoid: "reviewer" (unqualified — say which)_

**Simplicity-reviewer** — per-slice over-engineering gate (full tier, `behavior` slices): what to delete, what stdlib/native replaces. Read-only.
_Avoid: "linter", "critic"_

**Doc-writer** — reconciles the in-repo docs (AGENTS.md tree) + the knowledge base with the merged code, removing stale text. Run by `/document`.
_Avoid: "documenter", "technical writer"_

**Doc-reader** — the reader test: a fresh-context, read-only verifier that reads the doc-writer's changed docs cold and checks their claims against the repo (paths, commands, described behavior). Run by `/document` after the doc-writer; findings trigger one doc-writer fix round.
_Avoid: "doc-reviewer" (it tests grounding and first-read clarity, not prose quality)_
