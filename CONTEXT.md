# Glossary — superdev domain language

## Core concepts

**Epic** — the slice-store container for a multi-slice feature: a single issue (or `docs/plans/<type>/<feature-slug>/00-epic-*.md`) that groups all the feature's slices and holds the source text for the global DoD. Optional — a single-slice feature has no epic; that slice's `acceptance` becomes the DoD directly.
_Avoid: "feature issue", "parent issue", "the DoD" (the epic holds/sources the DoD's text; `.superdev/scopes/<scope>/dod.md` is the concrete DoD itself)_

**Slice** — a vertical tracer bullet: a narrow but complete path through every layer (specification → implementation → test), independently green, demoable/verifiable on its own. Each slice carries test-applicability (behavior/mechanical/docs), a specification, acceptance criteria, and explicit dependencies on other slices.
_Avoid: "story", "task", "sub-issue", "chunk" — though GitHub's **sub-issue** is a different sense: the tracker's parent/child relation, which the GitHub slice store uses to link a slice to its epic (ADR 0011), not a synonym for the slice itself_

**Tier** (execution) — the routing decision for a plan, derived from the loaded slice count: `lite` (≤3 slices) or `full` (>3 slices). Never persisted, derived fresh every run; each tier's linear procedure is read from its **execution playbook** (see _Separation of concerns_).
_Avoid: "mode", "strategy", "level", "route", "path"_

**Scope** — a feature's scope branch and all its run artifacts (.superdev/scopes/<scope>/ directory: DoD, ledger, progress logs, worktrees). Scope is the namespace that lets multiple features' runs execute in parallel without colliding. `.superdev/` also holds non-scope areas nested outside `scopes/` (e.g. `.superdev/brainstorm/`) — `/status` only scans `.superdev/scopes/*/`, so a sibling area can never be mistaken for a run root.
_Avoid: "run", "branch", "feature branch" (too generic)_

**Scope anchor** — a feature's root: the single slice-store issue that carries its scope-level status signal for a run. A multi-slice plan's anchor has slices beneath it, and a single-slice plan's anchor is its own lone slice. One rule covers both shapes, so a single-slice plan needs no special case. How a given store expresses this is store configuration, stated in that store's own `## Scope anchor` section, never assumed by a command (ADR 0017). Moves to `in-progress` when the run starts and `merged`/`done` once the whole scope is done — distinct from any individual slice's own status transitions.
_Avoid: "epic" (only an epic-bearing feature has one; the anchor role also falls to a lone slice)_

**Run root** — the part of `.superdev/scopes/<scope>/` that stays in the invoking checkout across both tiers: `dod.md`, `ledger.md`, `run.lock`, and on the full tier `interfaces.md` (the cross-slice interface record). Never moves into a worktree, so it survives worktree removal as the post-mortem trail and lets `/status` enumerate runs without touching any worktree.
_Avoid: "run directory", "scope dir" (too generic — this is specifically the checkout-resident subset, not the whole `.superdev/scopes/<scope>/` namespace)_

**Definition of Done (DoD)** — the checkable acceptance criteria for the whole feature, sourced from the epic if one exists, or from the lone slice's `acceptance` if not. `.superdev/scopes/<scope>/dod.md` is the concrete verification plan that gates the final-reviewer and PR.
_Avoid: "requirements", "specification", "checklist" (DoD is the integrated checklist)_

**Ledger** — the per-scope recovery map: tracks the run's stage, the scope branch, each slice's status (todo → in-progress → in-review → merged), its commit range when merged, and the slice-id ↔ issue-key mapping. Run init writes the branch as the ledger's `**Branch:**` line once, because a slug alone never names the branch. `.superdev/scopes/<scope>/ledger.md` is the authoritative state during a run and after compaction/resume.
_Avoid: "log", "status file", "tracker"_

**Stage** — how far a scope has moved through the four-command chain (`/implement` → `/review` → `/document` → `/ship`), recorded as the ledger's `**Stage:**` line and naming the last completed step: `implementing`, `merged`, `reviewed`, `documented` (or `documented-unreviewed` when `/document` ran before `/review` did), `shipped`. Distinct from a slice's status, which tracks one slice through the DAG (ADR 0013).
_Avoid: "phase" (that names a step within a playbook's procedure, as in run init or run handoff), "state", "step"_

**Degraded pass** — a step of the chain that did not get the assurance the chain promises. Two shapes occur: a dispatch the permission classifier denies (any chain dispatch, not only a review one), or a pass that cannot reach what it needed. A denied dispatch runs inline when attended, and blocks the scope anchor when unattended; the step writes the entry either way (ADR 0018). A pass that cannot reach what it needed writes the entry and the run continues, attended or unattended alike. `/superdev:ship` carries every written bullet into the pull-request body, and `/superdev:status` reports it for an in-flight run.
_Avoid: "failure" (the code under review did not fail — the chain's own assurance came up short; an **Unresolved defect** is that other thing), "warning" (too generic — this names a specific shortfall the ledger tracks), "partial review" (the first shape covers any denied dispatch, not only a review one — a doc-writer or fix-implementer denial both count)_

**Unresolved defect** — a defect the run found in the code and left standing: a full suite still red at the 3-strike cap, findings the operator declined to fix, or an unattended block at that cap. Recorded as the ledger's `**Unresolved:**` line, beside `**Degraded:**` and owned by the same CLI (ADR 0022), and written only where the run gives up — a defect found and then fixed leaves no trace, because nothing was left standing. `scope.js unresolved clear` drops the line wholesale, for the resumed run that fixes the defect and re-verifies the scope. `/superdev:ship` names what stands and asks once, and refuses unattended; the pull-request body carries the bullets under their own heading. Distinct from a **Degraded pass**, which says how much of the chain ran rather than whether the branch is sound (ADR 0026).
_Avoid: "degraded pass" (that names the chain's shortfall, not the code's), "blocked" (a blocked slice already carries its own status in the ledger's slice table — this line is for scope-level defects), "known issue" (too generic — this names something one run found and stopped on)_

**Scope checkout** — the working tree holding the scope branch, which every command after `/implement` finds from disk. It is the scope worktree when one exists (a lite run), otherwise the invoking checkout. A full run leaves the invoking checkout switched to the scope branch until `/superdev:ship`'s §6 returns it to base. Where a chained command's fix commits and documentation commits land.
_Avoid: "the checkout" unqualified (the invoking checkout is a different thing on a lite run)_

**Run kind** — which of three things a `/superdev:implement` run is, computed by run init and read by both execution playbooks to decide what the branch step does: **`fresh`** (no ledger, no scope branch — cut it from base), **`appended`** (a shipped ledger rotated aside, the branch may survive its pull request — reuse it when base already contains it, cut fresh from base when it is gone entirely, ADR 0004), **`resumed`** (a live ledger, the branch holds unmerged slice work — switch to it and cut nothing). One determination, made once, read in three places (ADR 0028).
_Avoid: "re-run" (covers appended and resumed alike, and they take opposite branch actions), "re-cut" (an appended run reuses its branch rather than cutting a new one)_

**Scope mode** — the shared rule `/superdev:review`, `/superdev:document`, and `/superdev:ship` each read from `references/scope-mode.md` at runtime: what makes a range or scope slug a live run, how to find the scope checkout from disk for either tier, the refresh-not-create rule for the run lock, and the never-moves-backwards rule for the ledger's stage (ADR 0013). Each command keeps only what is specific to it beyond the shared rule.
_Avoid: "chain mode" (the chain is the four commands. Scope mode is the one rule the last three share), "review mode" (that names `/superdev:review`'s own ad-hoc/scope split, one level down)_

**Worktree** — an isolated filesystem checkout used to keep a run's branch work off the invoking checkout. The full tier gives each slice its own **per-slice worktree** (`.superdev/scopes/<scope>/worktrees/<id>/`, plural); the lite tier uses a single **scope worktree** (singular — see below) for all its slices. Both nest under the git-ignored `.superdev/scopes/<scope>/`.
_Avoid: "branch", "workspace", "checkout"_

**Invoking checkout** — the working tree the user runs superdev from (their clone, usually on main). Whether and how a tier switches it is owned by that tier's execution playbook (ADR 0001). `/superdev:ship` returns it to base at the end of a `full` run.
_Avoid: "main checkout", "user branch", "current tree"_

**Scope worktree** — the dedicated worktree a lite run cuts its scope branch into (`.superdev/scopes/<scope>/worktree/`), where all inline implementation, commits, and tests run. Isolates the run from the invoking checkout and from other sessions. The run root (dod/ledger) stays in the invoking checkout, not here, so it survives worktree removal.
_Avoid: "scratch checkout", "session workspace"_

**Run lock** — the `.superdev/scopes/<scope>/run.lock` file plus the `run-lock` hook that together enforce same-scope mutual exclusion for the `lite` tier. Its mtime marks the run as live, so every command in the chain touches it and the lock spans the whole run rather than one invocation. A stale lock is reclaimable as a crash resume.
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

**Unattended run** — one `/superdev:afk` invocation: a serial sweep that takes each eligible scope anchor through the whole four-command chain, and ends on an interrupt, on two consecutive blocked features, on a `/superdev:ship` failure, or on an empty backlog. Keeps no queue — the tracker's labels are its only state, re-read every iteration.
_Avoid: "afk mode" (there is no mode; afk is one command with one run), "batch", "autopilot"_

**Unattended token** — the `--unattended` argument afk passes on every command invocation, which tells that command to take its standing answers instead of asking. An invocation property, never written to the run root, so it cannot outlive the run that passed it (ADR 0016).
_Avoid: "unattended flag" (it is an argument token, not a config setting), "afk mode"_

**Standing answer** — what a command does at a stop where it would otherwise ask the maintainer, when the unattended token is present. Each is written at the stop it governs; a stop with none written blocks the scope anchor, which is the catch-all that keeps an unwritten question from stalling a run until morning.
_Avoid: "default" (a default applies always; a standing answer applies only unattended), "policy", "auto-answer"_

**Eligible anchor** — a scope anchor `/superdev:afk` may pick up, per `commands/afk.md` §2: open, carrying no `blocked` label, with no **open** slice beneath it carrying `blocked`, with a feature label presenting one root and matching `scope-mode.md`'s scope-slug rule, decomposed (itself a slice, or carrying at least one slice beneath it), and with no live run on its scope (a run lock newer than an hour, or, absent one, an unshipped ledger newer than an hour). Says nothing about `ready`, so a part-merged plan and a crash-interrupted slice both resume; the store's `## Scope anchor` contract is what tells afk which issue the anchor is (ADR 0017). An anchor failing the one-root or decomposed condition is **skipped**, not blocked, and reported (§6) — it needs a human, not a sweep.
_Avoid: "eligible epic" (a single-slice plan has no epic, and its lone slice is the anchor), "ready epic" (`ready` is a slice label, and eligibility deliberately ignores it), "available", "unblocked issue"_

**Rejected direction** — a direction a brainstorm explored and dropped, carried in the `Intent` with the reason it lost. `/plan` routes each one to a durable home — a dropped approach to an ADR's `Considered options`, dropped scope to the epic's non-goals — so it can't be re-proposed cold later.
_Avoid: "non-goal" (that's the destination for a rejected scope, not the record of why), "alternative"_

**Domain shape** — a named structure a slice's code gives a domain concept, in whatever the repository's language provides: a TypeScript interface or type, a class, a DTO, a Python dataclass or `TypedDict`, a zod schema. A slice `spec` names the shapes the slice needs, by name and in this glossary's vocabulary, and the implementer declares them before its first RED test. Names only — the fields are the implementer's, because a `spec` is a contract of outcomes (ADR 0030).
_Avoid: "type" (too narrow — a shape is not a static-typing claim, and an untyped language still has shapes), "model", "DTO" (one rendering of a shape, not the concept), "entity"_

## Acceptance / verification

**Acceptance** (per-slice) — the checkable criteria for ONE slice; the slice-reviewer verifies against this, and the implementer treats it as the TDD loop's termination condition — one increment per criterion. Different from the global DoD (acceptance is per-slice, DoD is whole-feature). On a `behavior` slice it names the **domain-level** failure and boundary cases too — those derivable from the interview without seeing the implementation (empty input, absent config, duplicate, auth failure, concurrent arrival) — stated as observable behaviour. Implementation-level edges (off-by-one, parser boundary, encoding) belong to the implementer's TDD loop and the reviewers, who read the code the planner never sees.
_Avoid: "specification", "requirements" (acceptance is the test oracle)_

**Test-applicability** — the class of changes a slice carries: `behavior` (new functionality, needs TDD + per-slice reviewer + simplicity-reviewer), `mechanical` (move/rename/format, uses existing suite as the net, skips per-slice reviews), `docs` (documentation-only, skips reviews).
_Avoid: "slice type", "category"_

**Focused test command** — the optional **second** fenced block of `docs/agents/verification.md`: the narrowed run every step inside the loop takes, in place of the full command the first block holds. Carrying the token `{paths}` makes the caller substitute the **changed-path set** below, shell-quoted; carrying none makes it run verbatim, for a runner that detects the change set itself. Absent, every caller runs the full command, which is the behaviour a repository configuring nothing keeps. `references/test-selection.md` owns the contract and every consumer reads it at runtime (ADR 0025).
_Avoid: "partial test command" (it is narrowed, not incomplete), "incremental tests" (that names a runner's own caching), "fast command" (speed is the effect, not the definition)_

**Changed-path set** — the paths a caller substitutes for `{paths}`, always those changed in the range that caller judges: the slice base to the working tree for the implementer's TDD loop and the lite tier's inline loop, the slice branch against the scope branch for the slice-reviewer, and `ORIG_HEAD` against `HEAD` for the green-gate hook, falling back to `HEAD^1` where `ORIG_HEAD` does not resolve. An **empty** set runs the full command rather than a focused run over nothing — a conflicted merge leaves `HEAD` unmoved with `ORIG_HEAD` equal to it, producing exactly that, and a focused run over no paths would report green having tested nothing (ADR 0025).
_Avoid: "diff" (that names the content, not the path list), "touched files" (`Touch map` already claims that phrasing for a different artifact)_

## Controller discipline

**Controller** — the agent driving a plan's slices to merge (you). You dispatch implementers/reviewers, you merge, you integrate serially. You never implement or merge inside a subagent.
_Avoid: "orchestrator", "manager"_

**Depends-on** — the set of slice IDs that must merge before a slice can start (a DAG edge). A slice depends on another only if it cannot be green without it; too-eager dependencies serialize work that could run in parallel.
_Avoid: "blocked by", "dependency" (too generic; "depends-on" is the explicit, load-bearing relationship) — though GitHub's **`blocked_by`** is the literal name of the native relation the GitHub slice store uses to record this same edge (ADR 0011), not a looser competing term_

## Review discipline

**Final-reviewer** — the whole-scope review gate after all slices are merged. Checks the integrated diff against the global DoD. Read-only (`Read`, `Grep`, `Bash` — no `Edit`): its findings drive the dispatching command's 3-strike fix loop (each fix with a RED test; on 3 strikes without going clean, escalate), it never applies a fix itself.
_Avoid: "final review", "scope review" (the role/agent, not just the step)_

**3-strike fix loop** — if a final-review (or per-slice review) fix cycle exposes a new defect, dispatch a fresh fix with a RED test; repeat. On 3 strikes (3 fix cycles each surfacing a new bug), stop: it's a wrong cut (hidden dependency, boundary too big), not a buggy slice. Move it → blocked and escalate.
_Avoid: "retry limit", "attempt count" (the 3 strikes are cycles, not attempts)_

**Judge discipline** — the verification principle shared verbatim by all three review agents: verify the artifact/behaviour yourself, never defer to the implementer's or controller's narrative of what was done; length or an elaborate structure isn't its own evidence of correctness or of warranted complexity; reject a completion claim resting only on proxy counts (coverage %, line count, lint score) — confirm the observable behaviour instead (ADR 0002).
_Avoid: "verification discipline" (too generic — this specifically means not trusting the builder's account of its own work)_

**Derived criteria** — the acceptance criteria `final-reviewer` writes itself, from the feature's intent alone, before it reads the Definition of Done or the diff. Diffing them against the DoD surfaces criteria the plan never wrote. Scope mode only: it needs a DoD written by someone else to diff against, so `/superdev:review` hands over `dod.md`'s **path** rather than its text and the reviewer opens it after its own list exists (ADR 0020).
_Avoid: "independent criteria", "own criteria" (the point is where they come from, not whose they are)_

**Ceiling note** — the single advisory observation `final-reviewer` may add when a scope met a Definition of Done criterion **shallowly**: the review found the criterion satisfied and the code correct, but the work stopped at the first thing that passed. Admissible only against four gates — it names the criterion this review found satisfied, it names a concrete consequence, there is exactly one, and the review found nothing Critical or Important. Never gates a merge and never triggers the fix loop, exactly like an over-engineering finding (ADR 0020).
_Avoid: "quality note", "improvement suggestion", "nit" (a ceiling note describes correct code, so it is not a defect at any severity)_

## Separation of concerns

**Execution playbook** — the linear, tier-specific procedure that runs a scope's whole `/implement` execution, start to finish: `references/implement-full.md` (full tier) or `references/implement-lite.md` (lite tier), computed and `Read` by the controller once the tier is known. Each playbook opens by reading `references/run-init.md` (run init) and closes by reading `references/run-handoff.md` (run handoff), so the `/implement` command body keeps config + input, the tier computation, the invariants, the model table, the issue-status map, and red flags, and control never returns to it once a playbook starts.
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

**Eval-shape check** — the `drift-check.js` check that a grader's frontmatter is one the harness can act on. It requires a known `type`, a positive `weight`, and, for `llm`/`regex`, a `focus` or `target`. It also checks that every case's `scaffold_script` resolves. This check compares a document against a schema, not a fact restated outside its source, so it differs from a Drift assertion.
_Avoid: "drift assertion" (a drift assertion compares a restated fact against its source; this check compares a document against a schema)_

**Arm** — one of the two runs an eval case produces from the same prompt, the same scaffold, and the same graders: the **plugin arm**, which loads superdev, and the **baseline arm**, which loads nothing. The single difference between them is what the delta measures, so a baseline arm that reaches an installed copy of the plugin destroys the case rather than weakening it.
_Avoid: "run" (a case runs each arm several times — the runs sit inside an arm), "variant", "control"/"treatment" alone (name which arm)_

**Eval runner** — `scripts/eval-run.js`: the standalone script that reads `evals/*/case.yaml`, spawns `claude -p` per arm with a throwaway `HOME` and a subscription token, grades the captured transcript and diff against `graders/*.md`, and reports the per-grader delta. `bun run eval` invokes it. Reads the same case and grader files as `claude plugin eval`, which stays available for a key-funded cross-check (ADR 0024).
_Avoid: "the harness" (that names `claude plugin eval`, the other reader of the same files), "eval command", "test runner" (`bun run test` is a different thing)_

**Bootstrap** (mode) — the brownfield-seed mode of `/superdev:document` (empty args, `AGENTS.md`-hierarchy convention, root `AGENTS.md` absent): the doc-writer seeds root/child `AGENTS.md` files from the existing code and proposes `CONTEXT.md` candidate terms, which the controller confirms/prunes with the user before committing. A range or area invocation never bootstraps.
_Avoid: "init", "scaffold" (bootstrap seeds from what already exists, it doesn't scaffold empty structure)_

**Writing standard** — the prose style the doc agents apply, recorded as a pointer in a `## Writing standard` section of `docs/agents/documentation.md`: `controlled` (the language-neutral rule set shipped as `references/controlled-prose.md`, merged from ASD-STE100, the tekom rule catalogue, and the *Handbook of Technical Writing*), a repo-relative path to the project's own style guide, or `none`. Binds only the prose an agent writes or rewrites in that dispatch, never untouched text (ADR 0012).
_Avoid: "style guide" (that names one possible value — a repo's own file — not the config), "STE" (one of the two sources, not the standard), "tone" (a voice property; the standard governs form), "linter" (there is no deterministic check — the doc-reader is the verifier)_

**Content type** — the kind of information a passage of documentation carries: `interface` (what a part is called), `reference` (data the reader looks up), `conceptual` (why the thing exists and when to reach for it), `procedural` (the steps to perform a task). Shipped as `references/content-types.md`, a lens both doc agents read at dispatch — the doc-writer applies it, the doc-reader flags an absent conceptual layer as `conceptual:` in its cold read (ADR 0014). Unlike the **Writing standard** it is never configurable and never `none`: coverage is a completeness property, not a style one.
_Avoid: "doc type" (the type classifies a passage, not a whole file — one `AGENTS.md` carries several), "information type" (the DITA term for a stricter topic-level schema superdev does not adopt), "section"_

**Staged page** — one knowledge-base page `/superdev:plan` or `/superdev:document` writes as a `.md` file to `.superdev/kb-pending/<scope>/` instead of sending to a remote backend: YAML frontmatter carrying the page `title` and an `action` of `upsert`, `patch`, or `delete`, the page body below it. A `patch`'s body is one section of an **aggregate page** rather than a whole page (ADR 0027). The filename is the title's slug (`<title-slug>.md`) for `upsert` and `delete`, so a second write to the same title overwrites the file rather than creating a rival; a `patch` file names itself `<title-slug>--<section-slug>.md` instead, always, since an aggregate page's title is shared by every section staged against it. The path is absolute, resolved from the invoking checkout, because a lite-tier scope worktree sits inside `.superdev/` and `/superdev:ship` removes it. The page waits until `/superdev:publish-kb` applies it, which is the only path from superdev to a remote backend. A local `docs/kb/` backend produces none, because its pages are repository files (ADR 0023).
_Avoid: "draft" (a draft is unfinished; a staged page is final and merely held), "pending page" (that names the state, not the artifact), "queue" (there is no ordering — the pages are a set)_

**Aggregate page** — a knowledge-base page many scopes each contribute one section to, rather than one a single scope owns end to end: an index, a changelog, an ADR-summaries digest. The knowledge-base outline marks which pages aggregate, and `/superdev:setup` asks. A marked page is staged one section at a time (`action: patch`) and merged into the live page by that section's heading, because the doc-writer reaches no backend and so cannot see the sections other scopes already wrote — replacing it wholesale would drop them (ADR 0027).
_Avoid: "shared page" (every page is shared with its readers; what distinguishes this one is many writers), "index page" (an index is one instance, not the class)_

## Backends

superdev is tool-agnostic: three pluggable backends, each chosen by `/setup` and recorded under `docs/agents/`. The commands and agents never hardcode one.

**Seed** (seed template) — a backend-config template file under `references/` (e.g. `issue-tracker-jira.md`, `code-management-github.md`) that `/setup` reads and fills in with repo-specific specifics to produce the matching `docs/agents/*.md`. Adding a backend = a new seed + the setup step that consumes it.
_Avoid: "template" alone (too generic), "backend file" (that names the `docs/agents/*.md` output, not the `references/` input)_

**Slice store** — the backend where a feature's plan and slices live: local files, or an issue tracker. Configured in `docs/agents/issue-tracker.md`.
_Avoid: "issue tracker" as the concept name (that's one backend), "database"_

**Assignee** — the slice-store account every issue a run creates is assigned to: a single store-native identifier (a login for Forgejo/GitHub, an `accountId` for Jira) recorded in `docs/agents/issue-tracker.md`, resolving to the API token's own identity when unconfigured and disabled by `none`. Store configuration rather than a slice field, applied at creation to the epic and every slice (ADR 0010).
_Avoid: "owner" (too generic), "creator"/"reporter" (the store already records who filed the issue — assignee is who owns it), "reviewer" (a pull-request role, owned by the code host)_

**Feature label** — the one slice-store identifier a feature's scope anchor and every one of its slices carry: its **change type** and its slug, in the notation the active `docs/agents/issue-tracker.md` states (a `<type>/<slug>` label on an issue-backed store, the `<type>/<slug>` path under `docs/plans/` on the local-file store). It names the feature to `/superdev:implement`, and it is the scope branch verbatim, so one value fixes which feature gets built and which branch and run root the build uses (ADR 0019, ADR 0021).
_Avoid: "epic label" (`epic` is a different label on one backend, marking which issue is the anchor), "tag", "component"_

**Change type** — the Conventional Commits type of what a feature does to the codebase: `feat`, `fix`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `chore`, `style`, or `revert`. `/superdev:plan` picks it, it leads the **Feature label**, and it is the scope branch's first segment (`<type>/<scope>`), so the branch and the pull request report the same kind of work the commits do. `references/scope-mode.md` owns the set. `hooks/scope-prune.js` matches it only on its pre-CLI fallback path, when a scope's ledger carries no `**Branch:**` line to read the branch from directly (ADR 0007).
_Avoid: "commit type" (it labels the feature, not one commit), "category", "kind"_

**Status map** — the agreed mapping from superdev's canonical slice lifecycle (`todo` → `in-progress` → `in-review` → `merged`/done, plus `blocked`) to an issue tracker's real statuses/transitions. Captured by `/setup` for issue-backed slice stores, recorded in `issue-tracker.md`, walked by `/implement` at each lifecycle point.
_Avoid: "status mapping", "workflow" (too generic)_

**Code host** — the backend the scope branch pushes to and where the PR/MR opens. Configured in `docs/agents/code-management.md`.
_Avoid: "code-management" (that's the doc slug), "GitHub" (that's one host)_

**PR posture** — the three-state config value controlling how `/superdev:ship` opens the PR: `draft` (open as draft), `ready` (open ready-for-review), or `push-only` (push the branch, skip opening a PR). Set per code host during `/setup`, recorded in `code-management.md`.
_Avoid: "PR mode", "draft mode" (only one of the three states)_

**Knowledge base** — the optional human-first record (feature specifications, design overviews, ADR summaries), distinct from the agent-first `AGENTS.md` docs. May be `none`. Reconciled by the doc-writer, which writes a remote backend's pages as **staged pages** rather than sending them; `/superdev:publish-kb` is the only command that reaches a remote backend (ADR 0023).
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
