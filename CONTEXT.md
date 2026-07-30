# Glossary — superdev domain language

## Core concepts

**Epic** — the slice-store container for a multi-slice feature: a single issue (or `docs/plans/<feature-slug>/00-epic-*.md`) that groups all the feature's slices and holds the source text for the global DoD. Optional — a single-slice feature has no epic; that slice's `acceptance` becomes the DoD directly.
_Avoid: "feature issue", "parent issue", "the DoD" (the epic holds/sources the DoD's text; `.superdev/scopes/<scope>/dod.md` is the concrete DoD itself)_

**Slice** — a vertical tracer bullet: a narrow but complete path through every layer (specification → implementation → test), independently green, demoable/verifiable on its own. Each slice carries test-applicability (behavior/mechanical/docs), a specification, acceptance criteria, and explicit dependencies on other slices.
_Avoid: "story", "task", "sub-issue", "chunk" — though GitHub's **sub-issue** is a different sense: the tracker's parent/child relation, which the GitHub slice store uses to link a slice to its epic (ADR 0011), not a synonym for the slice itself_

**Tier** (execution) — the routing decision for a plan, derived from the loaded slice count: `lite` (≤3 slices) or `full` (>3 slices). Never persisted, derived fresh every run; each tier's linear procedure is read from its **execution playbook** (see _Separation of concerns_).
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

**Invoking checkout** — the working tree the user runs superdev from (their clone, usually on main). Whether and how a tier switches it is owned by that tier's execution playbook (ADR 0001).
_Avoid: "main checkout", "user branch", "current tree"_

**Scope worktree** — the dedicated worktree a lite run cuts its scope branch into (`.superdev/scopes/<scope>/worktree/`), where all inline implementation, commits, and tests run. Isolates the run from the invoking checkout and from other sessions. The run root (dod/ledger) stays in the invoking checkout, not here, so it survives worktree removal.
_Avoid: "scratch checkout", "session workspace"_

**Run lock** — the `.superdev/scopes/<scope>/run.lock` file plus the `run-lock` hook that together enforce same-scope mutual exclusion for the `lite` tier. A stale lock is reclaimable as a crash resume.
_Avoid: "lockfile" (that names a dependency-manifest file elsewhere), "mutex" (too implementation-generic)_

**Progress log** — the per-slice running record of what happened: agent dispatches, reviews, fixes, merge results. `.superdev/scopes/<scope>/reports/<id>/progress.md` is append-only, oldest-first, git-ignored. Exists so a human or a resumed controller can see what unfolded without re-reading worktree state.
_Avoid: "log", "report", "transcript" (logs are broader; this is slice-specific narrative)_

**Warrant** — the justification a piece of work carries; scales both cost (which model a dispatch uses) and rigor (which review gates run). Derived from a slice's test-applicability + complexity, never a plan field. A `behavior` slice warrants more than a `mechanical` one; a hook blocks any dispatch that omits an explicit model so cost stays warrant-scaled.
_Avoid: "priority", "estimate", "weight"_

**Intent** — a rough idea sharpened into something plan-ready: the problem, a few candidate directions, the MLP, the open questions, and the rejected directions. Output of `/brainstorm`, input to `/plan`.
_Avoid: "idea", "requirements", "specification"_

**Minimal Lovable Product (MLP)** — the smallest end-to-end version of the chosen direction that delivers real value: a complete (if narrow) path through the system a user could actually use, not a fragment of the final thing. Found in `/brainstorm` step 3, carried into `Intent`'s rough scope.
_Avoid: "skateboard" (Kniberg's MVP-evolution analogy — unclear without the backstory), "MVP" (implies bare-minimum/incomplete, not "usable and complete but narrow")_

**Load-bearing decision** — a decision the plan can't ship without: leaving it unresolved means the plan isn't actually decided, not just thin on detail. Triggers `Parked questions` when the interview can't resolve it (multi-slice only); on a single-slice plan, an unresolved one signals the plan isn't single-slice-simple yet, not something to park.
_Avoid: "blocker", "important question" (any open question can be unimportant; load-bearing specifically means the plan can't ship without it resolved)_

**Parked questions** — a load-bearing decision that survived `/plan`'s interview still unresolved, written to the epic's `## Parked questions` section. Advisory only: `/implement` never reads it, nothing gates on it.
_Avoid: "open questions" (that's Intent's pre-interview concept), "blocker", "TODO"_

**Slice graph** — the epic's `## Slice graph` section: a mermaid rendering of the plan's depends-on DAG, written only when the graph's shape defeats a numbered list. For human readers of the epic; advisory, like `Parked questions`.
_Avoid: "the DAG" (that's the dependency structure itself, which exists whether or not it's drawn), "diagram"_

**Touch map** — the epic's `## Touch map` section: a plain-text file tree marking which slices touch which files, and where slices that run in parallel collide. Evidence for the dependency order, not an instruction — no slice `spec` names file paths, and no reviewer gates on it.
_Avoid: "file map" (too generic — the collisions are the point), "impact analysis"_

**Rejected direction** — a direction a brainstorm explored and dropped, carried in the `Intent` with the reason it lost. `/plan` routes each one to a durable home — a dropped approach to an ADR's `Considered options`, dropped scope to the epic's non-goals — so it can't be re-proposed cold later.
_Avoid: "non-goal" (that's the destination for a rejected scope, not the record of why), "alternative"_

## Acceptance / verification

**Acceptance** (per-slice) — the checkable criteria for ONE slice; the slice-reviewer verifies against this, and the implementer treats it as the TDD loop's termination condition — one increment per criterion. Different from the global DoD (acceptance is per-slice, DoD is whole-feature). On a `behavior` slice it names the **domain-level** failure and boundary cases too — those derivable from the interview without seeing the implementation (empty input, absent config, duplicate, auth failure, concurrent arrival) — stated as observable behaviour. Implementation-level edges (off-by-one, parser boundary, encoding) belong to the implementer's TDD loop and the reviewers, who read the code the planner never sees.
_Avoid: "specification", "requirements" (acceptance is the test oracle)_

**Test-applicability** — the class of changes a slice carries: `behavior` (new functionality, needs TDD + per-slice reviewer + simplicity-reviewer), `mechanical` (move/rename/format, uses existing suite as the net, skips per-slice reviews), `docs` (documentation-only, skips reviews).
_Avoid: "slice type", "category"_

## Controller discipline

**Controller** — the agent driving a plan's slices to merge (you). You dispatch implementers/reviewers, you merge, you integrate serially. You never implement or merge inside a subagent.
_Avoid: "orchestrator", "manager"_

**Depends-on** — the set of slice IDs that must merge before a slice can start (a DAG edge). A slice depends on another only if it cannot be green without it; too-eager dependencies serialize work that could run in parallel.
_Avoid: "blocked by", "dependency" (too generic; "depends-on" is the explicit, load-bearing relationship) — though GitHub's **`blocked_by`** is the literal name of the native relation the GitHub slice store uses to record this same edge (ADR 0011), not a looser competing term_

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

## Doc loop

**Audit** — the reader-first mode of `/superdev:document` (invoked as `/superdev:document audit`): the doc-reader reads the whole audit set cold and grounds every claim against the repo before any doc-writer involvement; findings get the standard single doc-writer fix round.
_Avoid: "full reader-test" (the mechanism, not the mode), "doc review" (review is the code-review family)_

**Audit set** — the file set an audit reads: the documentation convention's own tree (`AGENTS.md` hierarchy, `README.md`, `CONTEXT.md`, local KB pages) by default, extended per repo by an `## Audit set` section in `docs/agents/documentation.md`.
_Avoid: "doc tree" (that's only the default; the set may include other prose surfaces)_

**Drift assertion** — a deterministic check in the repo's test chain that a fact restated outside its source (a guard regex's coverage of `agents/`, a referenced plugin path) still matches the artifact it derives from.
_Avoid: "drift test" (it's an assertion inside the existing chain, not a suite), "consistency check" (too generic — that names a review lens)_

**Bootstrap** (mode) — the brownfield-seed mode of `/superdev:document` (empty args, `AGENTS.md`-hierarchy convention, root `AGENTS.md` absent): the doc-writer seeds root/child `AGENTS.md` files from the existing code and proposes `CONTEXT.md` candidate terms, which the controller confirms/prunes with the user before committing. A range or area invocation never bootstraps.
_Avoid: "init", "scaffold" (bootstrap seeds from what already exists, it doesn't scaffold empty structure)_

**Writing standard** — the prose style the doc agents apply, recorded as a pointer in a `## Writing standard` section of `docs/agents/documentation.md`: `controlled` (the language-neutral rule set shipped as `references/controlled-prose.md`, merged from ASD-STE100 and the tekom rule catalogue), a repo-relative path to the project's own style guide, or `none`. Binds only the prose an agent writes or rewrites in that dispatch, never untouched text (ADR 0012).
_Avoid: "style guide" (that names one possible value — a repo's own file — not the config), "STE" (one of the two sources, not the standard), "tone" (a voice property; the standard governs form), "linter" (there is no deterministic check — the doc-reader is the verifier)_

## Backends

superdev is tool-agnostic: three pluggable backends, each chosen by `/setup` and recorded under `docs/agents/`. The commands and agents never hardcode one.

**Seed** (seed template) — a backend-config template file under `references/` (e.g. `issue-tracker-jira.md`, `code-management-github.md`) that `/setup` reads and fills in with repo-specific specifics to produce the matching `docs/agents/*.md`. Adding a backend = a new seed + the setup step that consumes it.
_Avoid: "template" alone (too generic), "backend file" (that names the `docs/agents/*.md` output, not the `references/` input)_

**Slice store** — the backend where a feature's plan and slices live: local files, or an issue tracker. Configured in `docs/agents/issue-tracker.md`.
_Avoid: "issue tracker" as the concept name (that's one backend), "database"_

**Assignee** — the slice-store account every issue a run creates is assigned to: a single store-native identifier (a login for Forgejo/GitHub, an `accountId` for Jira) recorded in `docs/agents/issue-tracker.md`, resolving to the API token's own identity when unconfigured and disabled by `none`. Store configuration rather than a slice field, applied at creation to the epic and every slice (ADR 0010).
_Avoid: "owner" (too generic), "creator"/"reporter" (the store already records who filed the issue — assignee is who owns it), "reviewer" (a pull-request role, owned by the code host)_

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
