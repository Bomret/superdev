# Glossary: superdev domain language

## Core concepts

**Epic**: the slice-store container for a multi-slice feature. A single issue (or `docs/plans/<type>/<feature-slug>/00-epic-*.md`) that groups all the feature's slices and holds the source text for the global DoD. An epic is optional. A single-slice feature has no epic, and that slice's `acceptance` becomes the DoD directly.
_Avoid: "feature issue", "parent issue", "the DoD" (the epic holds and sources the DoD's text, while `.superdev/scopes/<scope>/dod.md` is the concrete DoD itself)_

**Slice**: a vertical tracer bullet, a narrow but complete path through every layer (specification, then implementation, then test), independently green, and demoable or verifiable on its own. Each slice carries test-applicability (behavior, mechanical, or docs), a specification, acceptance criteria, and explicit dependencies on other slices.
_Avoid: "story", "task", "sub-issue", "chunk". GitHub's **sub-issue** is a different sense: the tracker's parent-child relation, which the GitHub slice store uses to link a slice to its epic (ADR 0011), not a synonym for the slice itself_

**Expand–contract**: the slicing sequence for a wide refactor, one mechanical change whose blast radius fans across the codebase. An expand slice adds the new form beside the old, migrate slices move call sites over in batches, and a contract slice deletes the old form once no caller remains. Each slice stays independently green. Only when even the batches cannot does the epic name an **Integration branch** (ADR 0033).
_Avoid: "big-bang refactor" (the thing this sequence replaces), "parallel change" (Fowler's synonym, and one name is enough)_

**Integration branch**: the `integration/<scope>` branch a wide refactor's slices merge into when its batches cannot stay green alone, named by the epic's `## Integration branch` section. Green is promised at one node. The final integrate-and-verify slice merges it into the scope branch, where the green-gate fires. The gate defers on merges into `integration/*` (ADR 0033).
_Avoid: "staging branch" (a deploy-pipeline term), "scope branch" (the branch the integration branch merges into)_

**Tier** (execution): the routing decision for a plan, derived from the loaded slice count. `lite` covers 3 slices or fewer, and `full` covers more than 3. Never persisted, and derived fresh every run. Each tier's linear procedure is read from its **execution playbook** (see _Separation of concerns_).
_Avoid: "mode", "strategy", "level", "route", "path"_

**Scope**: a feature's scope branch and all its run artifacts (the `.superdev/scopes/<scope>/` directory, holding the DoD, the ledger, progress logs, and worktrees). Scope is the namespace that lets multiple features' runs execute in parallel without colliding. `.superdev/` also holds non-scope areas nested outside `scopes/`, for example `.superdev/brainstorm/`. `/status` only scans `.superdev/scopes/*/`, so a sibling area can never be mistaken for a run root.
_Avoid: "run", "branch", "feature branch" (too generic)_

**Scope anchor**: a feature's root, the single slice-store issue that carries its scope-level status signal for a run. A multi-slice plan's anchor has slices beneath it. A single-slice plan's anchor is its own lone slice, so one rule covers both shapes. How a given store expresses this is stated in that store's own `## Scope anchor` section, never assumed by a command (ADR 0017).
_Avoid: "epic" (only an epic-bearing feature has one, and the anchor role also falls to a lone slice)_

**Release**: the human agreement that a written plan may be built, carried as a durable signal on the scope anchor. A tracker holds a backlog of tickets written but not yet agreed, so writing a plan and releasing it are two acts: `/plan` asks which one it is doing, `/implement` asks for confirmation before building an unreleased feature, and `/afk` passes one over. The signal is distinct from the `ready` lifecycle state, which the dispatch swaps away. How a given store expresses it is stated in that store's own `## Release` section (ADR 0034).
_Avoid: "ready" (that is the `todo` lifecycle state, consumed the moment work starts), "approved" (unused elsewhere)_

**Run root**: the part of `.superdev/scopes/<scope>/` that stays in the invoking checkout across both tiers: `dod.md`, `ledger.md`, `run.lock`, and on the full tier `interfaces.md` (the cross-slice interface record). Never moves into a worktree, so it survives worktree removal as the post-mortem trail and lets `/status` enumerate runs without touching any worktree.
_Avoid: "run directory", "scope dir" (too generic, because this is the checkout-resident subset, not the whole `.superdev/scopes/<scope>/` namespace)_

**Definition of Done (DoD)**: the checkable acceptance criteria for the whole feature, sourced from the epic if one exists, or from the lone slice's `acceptance` if not. `.superdev/scopes/<scope>/dod.md` is the concrete verification plan that gates the final-reviewer and PR.
_Avoid: "requirements", "specification", "checklist" (DoD is the integrated checklist)_

**Ledger**: the per-scope recovery map. It tracks the run's stage, the scope branch, each slice's status (todo, then in-progress, then in-review, then merged), its commit range when merged, and the mapping between slice id and issue key. Run init writes the branch as the ledger's `**Branch:**` line once, because a slug alone never names the branch. `.superdev/scopes/<scope>/ledger.md` is the authoritative state during a run, and after a compaction or a resume.
_Avoid: "log", "status file", "tracker"_

**Published snapshot**: the copy of a run's ledger that the scope anchor carries, written as a `## Run state` section after any ledger write the snapshot would show. The ledger stays authoritative and the snapshot is a mirror, so a run whose publish fails is unaffected. It is what lets a run's record outlive `scope-prune`'s reap, a run resume on another machine, and a run's progress be read without a terminal (ADR 0042). Where it lives on a given backend is stated in that store's own `## Run state` section.
_Avoid: "remote ledger" (it carries no authority over control flow), "sync", "backup"_

**Adopt**: rebuilding a run root from the anchor's published snapshot, where no local ledger exists and the snapshot's stage is not `shipped`. Run init adopts, writes `dod.md` from the anchor as it does for any run, and reports the run kind `resumed`. `scope.js adopt` reads a whole anchor body and extracts the section itself (ADR 0042).
_Avoid: "restore", "pull", "import", "clone"_

**Stage**: how far a scope has moved through the four-command chain (`/implement`, then `/review`, then `/document`, then `/ship`), recorded as the ledger's `**Stage:**` line and naming the last completed step: `implementing`, `merged`, `reviewed`, `documented` (or `documented-unreviewed` when `/document` ran before `/review` did), `shipped`. Distinct from a slice's status, which tracks one slice through the DAG (ADR 0013).
_Avoid: "phase" (that names a step within a playbook's procedure, as in run init or run handoff), "state", "step"_

**Degraded pass**: a step of the chain that did not get the assurance the chain promises: a dispatch the permission classifier denied, or a pass that could not reach what it needed. What each command does about one, attended and unattended, and the `**Degraded:**` ledger entry that carries it to `/superdev:ship` and `/superdev:status`, live in `references/scope-mode.md`'s `## Degraded passes` section (ADR 0018). A denied **verification dispatch** stops an unattended run only where the controller authored what that pass verifies, and the entry quotes the classifier's refusal (ADR 0039). An unattended run also stops at the cap `references/scope-mode.md`'s `## Degraded passes` section states, whoever authored the work. The count comes from its own ledger's `denied: ` bullets, so the stop stays inside superdev rather than reaching the platform's own three-denial kill (ADR 0041). A **denial reset** returns that budget once a human has addressed the cause: it counts from the last reset marker, so every recorded denial survives and the pull request shows the reset and its reason (ADR 0044).
_Avoid: "failure" (the code under review did not fail. The chain's own assurance came up short, and an **Unresolved defect** is that other thing), "warning" (too generic)_

**Unresolved defect**: a defect the run found in the code and left standing, recorded as the ledger's `**Unresolved:**` line and written only where the run gives up. A defect found and then fixed leaves no trace. `references/scope-mode.md`'s `## Unresolved defects` section owns the record and what `/superdev:ship` and `/superdev:status` do with it (ADR 0026). Distinct from a **Degraded pass**, which says how much of the chain ran rather than whether the branch is sound.
_Avoid: "degraded pass" (that names the chain's shortfall, not the code's), "blocked" (a blocked slice carries its own status in the ledger's slice table)_

**Scope checkout**: the working tree holding the scope branch, which every command after `/implement` finds from disk. It is the scope worktree, `.superdev/scopes/<scope>/worktree`, at both tiers (ADR 0045); the invoking checkout is never switched onto the scope branch. Where a chained command's fix commits and documentation commits land.
_Avoid: "the checkout" unqualified (the invoking checkout is a different thing)_

**Run kind**: which of three things a `/superdev:implement` run is, computed by run init and read by both execution playbooks to decide what the branch step does. **`fresh`** means no ledger and no scope branch, so cut it from base. **`appended`** means a shipped ledger rotated aside, where the branch may survive its pull request: reuse it when base already contains it, and cut fresh from base when it is gone entirely (ADR 0004). **`resumed`** means a live ledger — held locally, or adopted from the anchor's published snapshot — whose branch holds unmerged slice work. It cuts nothing: it fetches the branch from the remote first where the checkout does not hold it. It then reattaches the scope worktree to it, recreating that worktree where it is absent (ADR 0042, ADR 0045). One determination, made once, read in three places (ADR 0028).
_Avoid: "re-run" (covers appended and resumed alike, and they take opposite branch actions), "re-cut" (an appended run reuses its branch rather than cutting a new one)_

**Scope mode**: the shared rule `/superdev:review`, `/superdev:document`, and `/superdev:ship` each read from `references/scope-mode.md` at runtime: what makes a range or scope slug a live run, how to find the scope checkout from disk for either tier, the refresh-not-create rule for the run lock, and the never-moves-backwards rule for the ledger's stage (ADR 0013). Each command keeps only what is specific to it beyond the shared rule.
_Avoid: "chain mode" (the chain is the four commands. Scope mode is the one rule the last three share), "review mode" (that names `/superdev:review`'s own split between an ad-hoc range and a scope, one level down)_

**Worktree**: an isolated filesystem checkout used to keep a run's branch work off the invoking checkout. The full tier gives each slice its own **per-slice worktree** (`.superdev/scopes/<scope>/worktrees/<id>/`, plural), merged into the shared **scope worktree** (singular, defined below). The lite tier uses that same scope worktree alone, for all its slices. Both nest under the git-ignored `.superdev/scopes/<scope>/`.
_Avoid: "branch", "workspace", "checkout"_

**Invoking checkout**: the working tree the user runs superdev from (their clone, usually on main). Neither tier's execution playbook switches it onto the scope branch (ADR 0045): each cuts or reuses the scope branch into the scope worktree instead, running the `git worktree add`/`remove` calls themselves from here, exactly as any such call does.
_Avoid: "main checkout", "user branch", "current tree"_

**Scope worktree**: the dedicated worktree a run cuts its scope branch into, at both tiers (`.superdev/scopes/<scope>/worktree/`, ADR 0045) — a lite run implements inline there directly, a full run merges each slice into it from that slice's own per-slice worktree. Isolates the run from the invoking checkout and from other sessions. The run root (the DoD and the ledger) stays in the invoking checkout, not here, so it survives worktree removal.
_Avoid: "scratch checkout", "session workspace"_

**Run lock**: the `.superdev/scopes/<scope>/run.lock` file plus the `run-lock` hook that together enforce same-scope mutual exclusion, at both tiers (ADR 0045). Its mtime marks the run as live, so every command in the chain touches it and the lock spans the whole run rather than one invocation. A stale lock is reclaimable as a crash resume.
_Avoid: "lockfile" (that names a dependency-manifest file elsewhere), "mutex" (too implementation-generic)_

**Progress log**: the per-slice running record of what happened: agent dispatches, reviews, fixes, and merge results. `.superdev/scopes/<scope>/reports/<id>/progress.md` is append-only, oldest-first, git-ignored. Exists so a human or a resumed controller can see what unfolded without re-reading worktree state.
_Avoid: "log", "report", "transcript" (logs are broader, and this is slice-specific narrative)_

**Warrant**: the justification a piece of work carries. It scales both cost (which model a dispatch uses) and rigor (which review gates run). Derived from a slice's test-applicability and complexity, never a plan field. A `behavior` slice warrants more than a `mechanical` one. A hook blocks any dispatch that omits an explicit model, so cost stays warrant-scaled.
_Avoid: "priority", "estimate", "weight"_

**Intent**: a rough idea sharpened into something plan-ready: the problem, a few candidate directions, the MLP, the open questions, and the rejected directions. Output of `/brainstorm`, input to `/plan`.
_Avoid: "idea", "requirements", "specification"_

**Minimal Lovable Product (MLP)**: the smallest end-to-end version of the chosen direction that delivers real value. A complete, if narrow, path through the system a user could use, not a fragment of the final thing. Found in `/brainstorm` step 3, carried into `Intent`'s rough scope.
_Avoid: "skateboard" (Kniberg's MVP-evolution analogy, unclear without the backstory), "MVP" (implies bare-minimum and incomplete, not "usable and complete but narrow")_

**Load-bearing decision**: a decision the plan cannot ship without. Leaving it unresolved means the plan is not decided, not just thin on detail. It triggers `Parked questions` when the interview cannot resolve it, on a multi-slice plan only. On a single-slice plan, an unresolved one signals the plan is not single-slice-simple yet, rather than something to park.
_Avoid: "blocker", "important question" (any open question can be unimportant, and load-bearing means the plan cannot ship without it resolved)_

**Parked questions**: a load-bearing decision that survived `/plan`'s interview still unresolved, written to the epic's `## Parked questions` section. Advisory only: `/implement` never reads it, and nothing gates on it.
_Avoid: "open questions" (that is Intent's pre-interview concept), "blocker", "TODO"_

**Slice graph**: the epic's `## Slice graph` section, a mermaid rendering of the plan's depends-on DAG, written only when the graph's shape defeats a numbered list. For human readers of the epic. Advisory, like `Parked questions`.
_Avoid: "the DAG" (that is the dependency structure itself, which exists whether or not it is drawn), "diagram"_

**Touch map**: the epic's `## Touch map` section, a plain-text file tree marking which slices touch which files, and where slices that run in parallel collide. Evidence for the dependency order, not an instruction: no slice `spec` names file paths, and no reviewer gates on it.
_Avoid: "file map" (too generic, because the collisions are the point), "impact analysis"_

**Design sketch**: the throwaway HTML page `/superdev:plan` writes before it decomposes, inventorying the components a plan intends to add, change, or delete and the interactions between them. Written only when the operator asks for one, at `.superdev/design/<slug>.html`, git-ignored and overwritten per feature slug. The step waits for the operator's approval, so a design the operator did not expect is corrected while correcting it is still free. It never reaches the epic or the pull request, and `/superdev:document` never reconciles it (ADR 0036).
_Avoid: "plan preview" (it shows the design, not the plan, which is what the §5 quiz presents), "architecture diagram" (it is per-plan and throwaway, where that names a standing picture of the whole system), "slice graph" (that draws the dependency DAG, and this draws the components)_

**Component**: a unit of a repository that acts — a module, a class, a command file, a hook, a service — named in the implementation language's own terms rather than a superdev word. What a **Design sketch** inventories. Distinct from a **Domain shape**, which is data the code declares rather than a unit that does something; a component's sketch card may name the shapes it introduces, and omits that line in a repository whose language has none.
_Avoid: "module" (one language's rendering of the concept, and superdev must name them all), "service" (a deployment unit), "domain shape" (that is the data a component moves, not the actor)_

**Unattended run**: one `/superdev:afk` invocation, a serial sweep that takes each eligible scope anchor through the whole four-command chain. It ends on an interrupt, on two consecutive blocked features, on a `/superdev:ship` failure, or on an empty backlog. It keeps no queue: it re-reads the tracker's labels every iteration and keeps its consecutive-block count in `.superdev/afk-blocks`, so a compaction loses nothing.
_Avoid: "afk mode" (there is no mode, and afk is one command with one run), "batch", "autopilot"_

**Unattended token**: the `--unattended` argument afk passes on every command invocation, which tells that command to take its standing answers instead of asking. An invocation property, never written to the run root, so it cannot outlive the run that passed it (ADR 0016).
_Avoid: "unattended flag" (it is an argument token, not a config setting), "afk mode"_

**Standing answer**: what a command does at a stop where it would otherwise ask the maintainer, when the unattended token is present. Each is written at the stop it governs. A stop with none written blocks the scope anchor, which is the catch-all that keeps an unwritten question from stalling a run until morning.
_Avoid: "default" (a default applies always, and a standing answer applies only unattended), "policy", "auto-answer"_

**Eligible anchor**: a scope anchor `/superdev:afk` may pick up. The conditions live in `commands/afk.md` §2. Eligibility deliberately ignores `ready`, so a part-merged plan and a crash-interrupted slice both resume (ADR 0017). An anchor failing the one-root or decomposed condition is **skipped**, not blocked, and reported, because it needs a human rather than a sweep.
_Avoid: "eligible epic" (a single-slice plan has no epic, and its lone slice is the anchor), "ready epic" (`ready` is a slice label, and eligibility deliberately ignores it)_

**Anchor dependency**: a recorded relation between two scope anchors, saying the second feature cannot be built until the first has shipped. It is satisfied once the anchor it names is closed, that scope's ledger stage reads `shipped`, or no such anchor exists, and an anchor whose dependency is unsatisfied is **deferred** for that sweep — no label written, no block counted, named in the report with what it waits on. `/plan` records one when its interview named a prerequisite feature; `/afk` is the only reader. How a given store records it is stated in that store's own `## Scope anchor` section (ADR 0040).
_Avoid: "depends-on" (that is the slice-level edge inside one plan, which `/implement` reads), "blocked anchor" (`blocked` is a label a human clears, where a deferred anchor clears itself)_

**Amendment** (of an ADR): the treatment for a recorded decision that stands with a narrow qualification, where supersession is the treatment for one that was overturned. The amending ADR carries the qualification and names what it amends; the amended one keeps its `**Status:**` at `Accepted`, keeps its text, and gains an `**Amended by:**` pointer on its own line. Nothing is edited into an ADR's body, so the dated record stays intact and every document citing it stays current (ADR 0043).
_Avoid: "supersede" (that replaces a decision rather than qualifying it), "revise" (that is the glossary's treatment, where one entry is rewritten in place)_

**Rejected direction**: a direction a brainstorm explored and dropped, carried in the `Intent` with the reason it lost. `/plan` routes each one to a durable home, so it cannot be re-proposed cold later: a dropped approach goes to an ADR's `Considered options`, and dropped scope goes to the epic's non-goals.
_Avoid: "non-goal" (that is the destination for a rejected scope, not the record of why), "alternative"_

**Domain shape**: a named structure a slice's code gives a domain concept, in whatever the repository's language provides: a TypeScript interface or type, a class, a DTO, a Python dataclass or `TypedDict`, a zod schema. A slice `spec` names the shapes the slice needs, by name and in this glossary's vocabulary, and the implementer declares them before its first RED test. Names only. The fields are the implementer's, because a `spec` is a contract of outcomes (ADR 0030).
_Avoid: "type" (too narrow, because a shape is not a static-typing claim, and an untyped language still has shapes), "model", "DTO" (one rendering of a shape, not the concept), "entity"_

## Acceptance and verification

**Acceptance** (per-slice): the checkable criteria for **one** slice. The slice-reviewer verifies against this, and the implementer treats it as the TDD loop's termination condition, one increment per criterion. Different from the global DoD (acceptance is per-slice, DoD is whole-feature). On a `behavior` slice it names the **domain-level** failure and boundary cases too, stated as observable behaviour: those derivable from the interview without seeing the implementation (empty input, absent config, duplicate, auth failure, concurrent arrival). Implementation-level edges (off-by-one, parser boundary, encoding) belong to the implementer's TDD loop and the reviewers, who read the code the planner never sees.
_Avoid: "specification", "requirements" (acceptance is the test oracle)_

**Test-applicability**: the class of changes a slice carries. `behavior` is new functionality, and needs TDD plus a per-slice reviewer plus a simplicity-reviewer. `mechanical` is a move, a rename, or a format change, uses the existing suite as the net, and skips per-slice reviews. `docs` is documentation-only, and skips reviews.
_Avoid: "slice type", "category"_

**Focused test command**: the optional **second** fenced block of `docs/agents/verification.md`, the narrowed run every step inside the loop takes and the documentation step takes over its own doc commits, in place of the full command the first block holds. Carrying the token `{paths}` makes the caller substitute the **changed-path set** below, shell-quoted. Carrying none makes it run verbatim, for a runner that detects the change set itself. Absent, every caller runs the full command, which is the behaviour a repository configuring nothing keeps. `references/test-selection.md` owns the contract and every consumer reads it at runtime (ADR 0025).
_Avoid: "partial test command" (it is narrowed, not incomplete), "incremental tests" (that names a runner's own caching), "fast command" (speed is the effect, not the definition)_

**Changed-path set**: the paths a caller substitutes for `{paths}` in the focused test command, those changed in the range that caller judges. `references/test-selection.md` owns which range each caller uses and why an **empty** set runs the full command instead of a focused run over nothing (ADR 0025).
_Avoid: "diff" (that names the content, not the path list), "touched files" (`Touch map` already claims that phrasing for a different artifact)_

## Controller discipline

**Controller**: the agent driving a plan's slices to merge (you). You dispatch implementers and reviewers, you merge, and you integrate serially. You never implement or merge inside a subagent.
_Avoid: "orchestrator", "manager"_

**Depends-on**: the set of slice IDs that must merge before a slice can start (a DAG edge). A slice depends on another only if it cannot be green without it. Too-eager dependencies serialize work that could run in parallel.
_Avoid: "blocked by", "dependency" (too generic, where "depends-on" is the explicit, load-bearing relationship). GitHub's **`blocked_by`** is the literal name of the native relation the GitHub slice store uses to record this same edge (ADR 0011), not a looser competing term_

## Review discipline

**Final-reviewer**: the whole-scope review gate after all slices are merged. It checks the integrated diff against the global DoD. It is read-only (`Read`, `Grep`, and `Bash`, with no `Edit`), so its findings drive the dispatching command's 3-strike fix loop (each fix with a RED test, and on 3 strikes without going clean, escalate). It never applies a fix itself.
_Avoid: "final review", "scope review" (the role and the agent, not just the step)_

**3-strike fix loop**: when a final-review or per-slice-review fix cycle exposes a new defect, dispatch a fresh fix with a RED test, and repeat. On 3 strikes (3 fix cycles each surfacing a new bug), stop: it is a wrong cut (hidden dependency, boundary too big), not a buggy slice. Move it to blocked and escalate.
_Avoid: "retry limit", "attempt count" (the 3 strikes are cycles, not attempts)_

**Judge discipline**: the verification principle shared verbatim by all three review agents. Verify the artifact and the behaviour yourself, and never defer to the implementer's or controller's narrative of what was done. Length or an elaborate structure is not its own evidence of correctness or of warranted complexity. Reject a completion claim resting only on proxy counts (coverage percentage, line count, lint score), and confirm the observable behaviour instead (ADR 0002).
_Avoid: "verification discipline" (too generic, because this means not trusting the builder's account of its own work)_

**Derived criteria**: the acceptance criteria `final-reviewer` writes itself, from the feature's intent alone, before it reads the Definition of Done or the diff. Diffing them against the DoD surfaces criteria the plan never wrote. Scope mode only: it needs a DoD written by someone else to diff against, so `/superdev:review` hands over `dod.md`'s **path** rather than its text and the reviewer opens it after its own list exists (ADR 0020).
_Avoid: "independent criteria", "own criteria" (the point is where they come from, not whose they are)_

**Ceiling note**: the single advisory observation `final-reviewer` may add when a scope met a Definition of Done criterion **shallowly**. The review found the criterion satisfied and the code correct, but the work stopped at the first thing that passed. It is admissible only against four gates: it names the criterion this review found satisfied, it names a concrete consequence, there is exactly one, and the review found nothing Critical or Important. It never gates a merge and never triggers the fix loop, exactly like an over-engineering finding (ADR 0020).
_Avoid: "quality note", "improvement suggestion", "nit" (a ceiling note describes correct code, so it is not a defect at any severity)_

**Deferred finding**: a fix-loop finding whose remedy adds a capability the Definition of Done never
named. It starts no fix loop, holds no run stage, and is not an **Unresolved defect**. The scope review
records it under its report's `### Deferred to a plan` heading instead and hands it to `/superdev:plan`.
It reaches three homes at once: a **Triage record** in the slice store, a `**Deferred:**` bullet in the
run's ledger carrying that record's reference, and the pull-request body `/superdev:ship` copies the
bullet into. On an issue backend, the triage record outlives the run root and the closed scope anchor
regardless of whether the scope ever ships. On the local plan-file store, it outlives the run root and
the closed scope anchor only once the scope branch carrying it merges (ADR 0035, 0046, 0048).
_Avoid: "scope growth", "out-of-scope finding" (the point is the DoD boundary, not that the finding is
unwelcome or off-topic)_

**Triage record**: the slice-store record a **Deferred finding** gets, created by `/superdev:review` at
the moment it defers. It records unplanned work. It is neither a slice nor a scope anchor, which is what
keeps every run and every sweep from selecting it as work to build. Only a human acts on it, or a later
`/superdev:plan` interview a human starts. How a given store expresses it is stated in that store's own
`## Triage record` section (ADR 0046).
_Avoid: "draft issue" (no backend the plugin supports has a draft issue state outside GitHub's project
boards), "triage slice" (it has no spec, no acceptance, and no place in a DAG)_

**Backlog survey**: the read-only report `/superdev:backlog` prints, grouping every open **Scope anchor**,
every **Triage record**, and every **stranded run root** in the slice store by the action each one needs,
and ending with one recommended move. A stranded run root is a run whose stage is short of `shipped` and
matches no open anchor. It ranks as the most expensive item in the table. It reads the store where
`/superdev:status` reads the runs' ledgers, and it shows the three things `/superdev:afk` passes over by
design: an unreleased plan, an anchor nobody decomposed, and a triage record. It shares its facts with that
command's selection and not its verdicts — a survey resolves an ambiguity toward showing the row, where an
unattended sweep resolves one toward deferring (ADR 0049). It writes nothing and sits outside the implement
chain.
_Avoid: "backlog sweep" (a sweep is `/superdev:afk`, which acts; this only reports), "status" (that
command reports runs from their ledgers, not the store)_

## Separation of concerns

**Execution playbook**: the linear, tier-specific procedure that runs a scope's whole `/implement` execution, start to finish. It is `references/implement-full.md` (full tier) or `references/implement-lite.md` (lite tier), computed and `Read` by the controller once the tier is known. Each playbook opens by reading `references/run-init.md` (run init) and closes by reading `references/run-handoff.md` (run handoff). The `/implement` command body therefore keeps config and input, the tier computation, the invariants, the model table, the issue-status map, and red flags. Control never returns to it once a playbook starts.
_Avoid: "command" (the playbook is the file the command delegates to, not the command itself)_

**Review checklist**: the shared file (`references/review-checklist.md`) naming concrete anti-patterns, vulnerability classes, a reuse-audit lens, and a consistency lens (convention drift, cross-slice divergence), read at dispatch time. `final-reviewer` applies all four lenses, and `slice-reviewer` applies anti-patterns and vulnerability classes. It follows the same shared-file-read-at-dispatch pattern as `Execution playbook`, one level down: a checklist of things to look for, not a procedure to follow.
_Avoid: "checklist" alone (ambiguous with the DoD's own checklist), "linter rules" (it is read and reasoned about, not mechanically run)_

## Doc loop

**Audit**: the reader-first mode of `/superdev:document` (invoked as `/superdev:document audit`). The doc-reader reads the whole audit set cold and grounds every claim against the repo before any doc-writer involvement. Findings get the standard single doc-writer fix round.
_Avoid: "full reader-test" (the mechanism, not the mode), "doc review" (review is the code-review family)_

**Audit set**: the file set an audit reads: the documentation convention's own tree (`AGENTS.md` hierarchy, `README.md`, `CONTEXT.md`, local KB pages) by default, extended per repo by an `## Audit set` section in `docs/agents/documentation.md`.
_Avoid: "doc tree" (that is only the default, and the set may include other prose surfaces)_

**Drift assertion**: a deterministic check in the repo's test chain that a fact restated outside its source (a guard regex's coverage of `agents/`, a referenced plugin path) still matches the artifact it derives from.
_Avoid: "drift test" (it is an assertion inside the existing chain, not a suite), "consistency check" (too generic, because that names a review lens)_

**Eval-shape check**: the `drift-check.js` check that a grader's frontmatter is one the harness can act on. It requires a known `type`, a positive `weight`, and, for an `llm` or `regex` grader, a `focus` or `target`. It also checks that every case's `scaffold_script` resolves. This check compares a document against a schema, not a fact restated outside its source, so it differs from a Drift assertion.
_Avoid: "drift assertion" (a drift assertion compares a restated fact against its source, and this check compares a document against a schema)_

**Arm**: one of the two runs an eval case produces from the same prompt, the same scaffold, and the same graders. The **plugin arm** loads superdev, and the **baseline arm** loads nothing. The single difference between them is what the delta measures, so a baseline arm that reaches an installed copy of the plugin destroys the case rather than weakening it.
_Avoid: "run" (a case runs each arm several times, and the runs sit inside an arm), "variant", "control" or "treatment" alone (name which arm)_

**Prose ablation**: a pair of whole eval runs of one case, whose plugin arms differ by a single edit to the plugin's own prose, read plugin arm against plugin arm. It is how a contested instruction is settled by running the document rather than by argument. The runner knows nothing of it: the toggle is a manual edit between two ordinary invocations, and the baseline arm runs in both and is ignored (ADR 0038).
_Avoid: "arm" (an arm sits inside one run, and a prose ablation spans two), "variant" (the same reason the Arm entry rejects it), "A/B" alone (every case is already an A/B against no plugin)_

**Eval runner**: `scripts/eval-run.js`, the standalone script that reads `evals/*/case.yaml`, spawns `claude -p` per arm with a throwaway `HOME` and a subscription token, grades the captured transcript and diff against `graders/*.md`, and reports the per-grader delta. `bun run eval` invokes it. It reads the same case and grader files as `claude plugin eval`, which stays available for a key-funded cross-check (ADR 0024).
_Avoid: "the harness" (that names `claude plugin eval`, the other reader of the same files), "eval command", "test runner" (`bun run test` is a different thing)_

**Bootstrap** (mode): the brownfield-seed mode of `/superdev:document` (empty args, `AGENTS.md`-hierarchy convention, root `AGENTS.md` absent). The doc-writer seeds the root and child `AGENTS.md` files from the existing code and proposes `CONTEXT.md` candidate terms, which the controller confirms or prunes with the user before committing. A range or area invocation never bootstraps.
_Avoid: "init", "scaffold" (bootstrap seeds from what already exists, and it does not scaffold empty structure)_

**Writing standard**: the prose style the doc agents apply, recorded as a pointer in a `## Writing standard` section of `docs/agents/documentation.md`. The value is `controlled` (the language-neutral rule set shipped as `references/controlled-prose.md`, merged from ASD-STE100, the tekom rule catalogue, and the *Handbook of Technical Writing*), a repo-relative path to the project's own style guide, or `none`. It binds only the prose an agent writes or rewrites in that dispatch, never untouched text (ADR 0012).
_Avoid: "style guide" (that names one possible value, a repo's own file, not the config), "STE" (one of the three sources, not the standard), "tone" (a voice property, where the standard governs form), "linter" (there is no deterministic check, and the doc-reader is the verifier)_

**Content type**: the kind of information a passage of documentation carries: `interface` (what a part is called), `reference` (data the reader looks up), `conceptual` (why the thing exists and when to reach for it), `procedural` (the steps to perform a task). Shipped as `references/content-types.md`, a lens both doc agents read at dispatch. The doc-writer applies it, and the doc-reader flags an absent conceptual layer as `conceptual:` in its cold read (ADR 0014). Unlike the **Writing standard** it is never configurable and never `none`: coverage is a completeness property, not a style one.
_Avoid: "doc type" (the type classifies a passage, not a whole file, and one `AGENTS.md` carries several), "information type" (the DITA term for a stricter topic-level schema superdev does not adopt), "section"_

**Staged page**: one knowledge-base page `/superdev:plan` or `/superdev:document` writes as a `.md` file to `.superdev/kb-pending/<scope>/` instead of sending to a remote backend. It carries YAML frontmatter with the page `title` and an `action` of `upsert`, `patch`, or `delete`, and the page body below it. A `patch`'s body is one section of an **aggregate page** (ADR 0027). The filename and path rules live with the staging commands. The page waits until `/superdev:publish-kb` applies it, which is the only path from superdev to a remote backend. A local `docs/kb/` backend produces none, because its pages are repository files (ADR 0023).
_Avoid: "draft" (a draft is unfinished, and a staged page is final and merely held), "pending page" (that names the state, not the artifact)_

**Aggregate page**: a knowledge-base page many scopes each contribute one section to, rather than one a single scope owns end to end: an index, a changelog, an ADR-summaries digest. The knowledge-base outline marks which pages aggregate, and `/superdev:setup` asks. A marked page is staged one section at a time (`action: patch`) and merged into the live page by that section's heading, because the doc-writer reaches no backend and so cannot see the sections other scopes already wrote. Replacing it wholesale drops them (ADR 0027).
_Avoid: "shared page" (every page is shared with its readers, and what distinguishes this one is many writers), "index page" (an index is one instance, not the class)_

**Inline doc pass**: the documentation pass a `lite` run performs in the controller's own context, as its playbook's last step, instead of through a dispatched doc-writer. It follows `references/doc-pass.md` and is recorded as the ledger's `**Docs:**` line, which is what tells `/superdev:document` to dispatch `doc-reader` alone (ADR 0031). A `full` run never performs one, because its parallel slice worktrees collide on shared doc files.
_Avoid: "inline documentation" (that names code comments), "doc step" (names one step of any pass, not this tier's arrangement)_

## Backends

superdev is tool-agnostic: three pluggable backends, each chosen by `/setup` and recorded under `docs/agents/`. The commands and agents never hardcode one.

**Seed** (seed template): a backend-config template file under `references/` (for example `issue-tracker-jira.md` or `code-management-github.md`) that `/setup` reads and fills in with repo-specific specifics to produce the matching `docs/agents/*.md`. Adding a backend means a new seed plus the setup step that consumes it.
_Avoid: "template" alone (too generic), "backend file" (that names the `docs/agents/*.md` output, not the `references/` input)_

**Slice store**: the backend where a feature's plan and slices live: local files, or an issue tracker. Configured in `docs/agents/issue-tracker.md`.
_Avoid: "issue tracker" as the concept name (that is one backend), "database"_

**Assignee**: the slice-store account every issue a run creates is assigned to. It is a single store-native identifier (a login for Forgejo or GitHub, an `accountId` for Jira) recorded in `docs/agents/issue-tracker.md`, resolving to the API token's own identity when unconfigured and disabled by `none`. Store configuration rather than a slice field, applied at creation to the epic and every slice (ADR 0010).
_Avoid: "owner" (too generic), "creator" or "reporter" (the store already records who filed the issue, and assignee is who owns it), "reviewer" (a pull-request role, owned by the code host)_

**Feature label**: the one slice-store identifier a feature's scope anchor and every one of its slices carry, its **change type** and its slug, in the notation the active `docs/agents/issue-tracker.md` states (a `<type>/<slug>` label on an issue-backed store, the `<type>/<slug>` path under `docs/plans/` on the local-file store). It names the feature to `/superdev:implement`, and it is the scope branch verbatim, so one value fixes which feature gets built and which branch and run root the build uses (ADR 0019, ADR 0021).
_Avoid: "epic label" (`epic` is a different label on one backend, marking which issue is the anchor), "tag", "component"_

**Change type**: the Conventional Commits type of what a feature does to the codebase: `feat`, `fix`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `chore`, `style`, or `revert`. `/superdev:plan` picks it, it leads the **Feature label**, and it is the scope branch's first segment (`<type>/<scope>`), so the branch and the pull request report the same kind of work the commits do. `references/scope-mode.md` owns the set. `hooks/scope-prune.js` matches it only on its pre-CLI fallback path, when a scope's ledger carries no `**Branch:**` line to read the branch from directly (ADR 0007).
_Avoid: "commit type" (it labels the feature, not one commit), "category", "kind"_

**Status map**: the agreed mapping from superdev's canonical slice lifecycle (`todo`, then `in-progress`, then `in-review`, then `merged` or done, plus `blocked`) to an issue tracker's real statuses and transitions. Captured by `/setup` for issue-backed slice stores, recorded in `issue-tracker.md`, walked by `/implement` at each lifecycle point.
_Avoid: "status mapping", "workflow" (too generic)_

**Code host**: the backend the scope branch pushes to and where the pull request or merge request opens. Configured in `docs/agents/code-management.md`.
_Avoid: "code-management" (that is the doc slug), "GitHub" (that is one host)_

**PR posture**: the three-state config value controlling how `/superdev:ship` opens the PR: `draft` (open as draft), `ready` (open ready-for-review), or `push-only` (push the branch, skip opening a PR). Set per code host during `/setup`, recorded in `code-management.md`.
_Avoid: "PR mode", "draft mode" (only one of the three states)_

**Knowledge base**: the optional human-first record (feature specifications, design overviews, ADR summaries), distinct from the agent-first `AGENTS.md` docs. It may be `none`. The doc-writer reconciles it, and writes a remote backend's pages as **staged pages** rather than sending them. `/superdev:publish-kb` is the only command that reaches a remote backend (ADR 0023).
_Avoid: "docs" (too broad, because the AGENTS.md tree is separate), "wiki" (that is one KB)_

**Feature specification**: the KB's one-page-per-feature document, carrying the problem, the solution shape, and the Definition of Done, written for the KB's audiences and language. Distinct from a slice's own `spec`: this is one per-feature narrative for readers, not a per-slice implementer contract.
_Avoid: "PRD" (implies business-case and persona content this doc does not carry), "specification" alone (collides with the per-slice `spec` field)_

## Roles

The subagents the controller dispatches. Each runs in isolated context and only its result returns. **Controller** and **Final-reviewer** carry discipline beyond their name, defined under _Controller discipline_ and _Review discipline_ above.

**Implementer**: builds **one** slice test-first (TDD), the laziest version that works. Never merges (a hook enforces it).
_Avoid: "developer", "coder"_

**Slice-reviewer**: per-slice correctness gate (full tier, `behavior` slices). It verifies against the slice's acceptance, independently re-runs the suite, and reads the produced artifact, hunting uncovered input.
_Avoid: "reviewer" (unqualified, so say which)_

**Simplicity-reviewer**: per-slice over-engineering gate (full tier, `behavior` slices). It names what to delete and what a standard-library or native feature replaces. Read-only.
_Avoid: "linter", "critic"_

**Doc-writer**: reconciles the in-repo docs (the AGENTS.md tree) and the knowledge base with the merged code, removing stale text. Run by `/document`.
_Avoid: "documenter", "technical writer"_

**Doc-reader**: the reader test, a fresh-context, read-only verifier that reads the doc-writer's changed docs cold and checks their claims against the repo (paths, commands, described behavior). Run by `/document` after the doc-writer. Findings trigger one doc-writer fix round.
_Avoid: "doc-reviewer" (it tests grounding and first-read clarity, not prose quality)_

**Dispatch prose**: the text a command sends to a subagent, as distinct from that subagent's own body. Both reach the model in one prompt, and the dispatch is the later, more specific instruction, so it wins a conflict between them. A behaviour contract stated in an agent body therefore also has to hold in every dispatch that reaches it, which is why a drift row pins both halves rather than the body alone (ADR 0035).
_Avoid: "the prompt" (ambiguous between the two halves)_
