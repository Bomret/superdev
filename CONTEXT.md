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

**Scope**: a feature's scope branch and all its run artifacts (the `.superdev/scopes/<scope>/` directory, holding the DoD, the ledger, progress logs, and the scopetree or slicetrees). Scope is the namespace that lets multiple features' runs execute in parallel without colliding. `.superdev/` also holds non-scope areas nested outside `scopes/`, for example `.superdev/brainstorm/`. `/status` only scans `.superdev/scopes/*/`, so a sibling area can never be mistaken for a run root.
_Avoid: "run", "branch", "feature branch" (too generic)_

**Scope branch**: the `<type>/<scope>` branch a feature's work lands on, named by its feature label. `/superdev:plan` cuts it into the scopetree, and every slice merges into it (ADR 0079). The ledger's `**Branch:**` line records it, and a reader resolves it from there rather than rebuilding the name. No superdev command commits to the base branch in its place (INV-0001).
_Avoid: "feature branch", "work branch"_

**Base branch**: the branch a scope branch is cut from and its pull request targets, named in `docs/agents/code-management.md`. Containment is tested against it, except by `hooks/scope-prune.js`, which tests against `HEAD`.
_Avoid: "default branch" (git's own term, which the configuration may differ from), "trunk", "main" (one repository's value)_

**Scope anchor**: a feature's root, the single record — an issue, or a `docs/plans/<type>/<feature-slug>/00-epic-*.md` file, or that feature's lone slice file — that carries its scope-level status signal for a run. How a given store expresses this is stated in that store's own `## Scope anchor` section, which specialises `plan-contract.md` → *Scope anchor*, never assumed by a command (ADR 0017).
_Avoid: "epic" (only an epic-bearing feature has one, and the anchor role also falls to a lone slice)_

**Release**: the human agreement that a written plan may be built, carried as a durable signal on the scope anchor. Its consumers are `/plan`, which asks which one it is doing, `/implement` asks for confirmation before building an unreleased feature, and `/afk` passes one over. How a given store expresses it is stated in that store's own `## Release` section, which specialises `plan-contract.md` → *Release* (ADR 0034).
_Avoid: "ready" (that is the `todo` lifecycle state, consumed the moment work starts), "approved" (unused elsewhere)_

**Run root**: the part of `.superdev/scopes/<scope>/` that stays in the repository's main working tree, at both tiers: `dod.md`, `ledger.md`, `run.lock`, and on the full tier `interfaces.md` (the cross-slice interface record). `scope.js root <scope>` resolves its absolute path from any cwd — the invoking checkout, a scopetree, or a slicetree of the same repository (ADR 0080). Never moves into a scopetree or slicetree, so it survives their removal as the post-mortem trail and lets `/status` enumerate runs without touching either.
_Avoid: "run directory", "scope dir" (too generic, because this is the main-worktree-resident subset, not the whole `.superdev/scopes/<scope>/` namespace)_

**Definition of Done (DoD)**: the checkable acceptance criteria for the whole feature, sourced from the epic if one exists, or from the lone slice's `acceptance` if not. `.superdev/scopes/<scope>/dod.md` is the concrete verification plan that gates the final-reviewer and PR. A controller ticks it while the run works, from an implementer's report (`references/dod-ticks.md`, ADR 0091).
_Avoid: "requirements", "specification", "checklist" (DoD is the integrated checklist)_

**Verification ceiling**: the bound on what a chain surface may do to verify a Definition-of-Done criterion. Verification observes, and changes no system outside the repository. `references/scope-mode.md` states it once, and every surface that verifies a criterion carries it, each taking the action its own role allows: `implementer` gets no increment for a criterion needing a deploy, a migration, or any other outward-facing change, and reports it as needing verification after merge; `final-reviewer` reports such a criterion as unverifiable on the branch, needing verification after merge. The prose that dispatches `implementer` and `final-reviewer` carries the same clause (ADR 0084, INV-0006). `/superdev:submit-pr` verifies nothing: it copies a criterion review or document already left unticked with a `ceiling:` note into the pull request as a post-merge checklist (ADR 0091).
_Avoid: "ceiling note" (that is `final-reviewer`'s advisory observation about shallow work, an unrelated term), "read-only" (a verification may write inside the repository), "dry run" (that names a mode of the outward-facing action this bound forbids outright)_

**Append mode**: re-running `/superdev:plan` on a feature that already has slices, which creates only the new records and never edits, closes, or renumbers a merged one (ADR 0004). It amends the epic's Definition of Done in place, so it is available only at `planned`, before any slice has run. A run root from `implementing` through `documented`, and a feature whose anchor has shipped, both refuse. Amending in place there would mix criteria verified against a merged pull request with criteria nobody has verified (ADR 0083, INV-0004). Follow-up work on any of those is a new feature, tied back through the anchor dependency.

**Ledger**: the per-scope recovery map. It tracks the run's stage, the scope branch, each slice's status (todo, then in-progress, then in-review, then merged), its commit range when merged, and the mapping between slice id and issue key. Run init writes the branch as the ledger's `**Branch:**` line once, because a slug alone never names the branch. `.superdev/scopes/<scope>/ledger.md` is the authoritative state during a run, and after a compaction or a resume.
_Avoid: "log", "status file", "tracker"_

**Published snapshot**: the copy of a run's ledger that the scope anchor carries, written as a `## Run state` section after any ledger write the snapshot would show. The ledger stays authoritative and the snapshot is a mirror, so a run whose publish fails is unaffected. It is what lets a run's record outlive `scope-prune`'s reap, a run resume on another machine, and a run's progress be read without a terminal (ADR 0042). Where it lives on a given backend is stated in that store's own `## Run state` section, which specialises `plan-contract.md` → *Run state*.
_Avoid: "remote ledger" (it carries no authority over control flow), "sync", "backup"_

**Adopt**: rebuilding a run root from the anchor's published snapshot, where no local ledger exists and the snapshot's stage is not `shipped`. Run init adopts, writes `dod.md` from the anchor as it does for any run, and reports the run kind `resumed`. `scope.js adopt` reads a whole anchor body and extracts the section itself (ADR 0042).
_Avoid: "restore", "pull", "import", "clone"_

**Stage**: how far a scope has moved through the chain (`/implement`, then `/review`, then `/document`, then `/submit-pr`) and past it, recorded as the ledger's `**Stage:**` line and naming the last completed step: `planned`, `implementing`, `merged`, `reviewed`, `documented` (or `documented-unreviewed` when `/document` ran before `/review` did), `submitted`, `shipped`. `planned` is the one stage that precedes the chain rather than naming a step within it: `/superdev:plan` wrote the ledger, cut the scope branch and scopetree, and no slice has run yet (ADR 0079) — `/superdev:implement`'s run init moves the stage forward out of it, and no later write ever moves it back. `submitted` means `/superdev:submit-pr` opened the pull request, which is where the chain and `/superdev:afk` stop. `shipped` means the pull request is merged: `/superdev:ship` merged it, or adopted a merge someone made by hand (ADR 0096). A ledger an older version left at `shipped` records only an opened pull request, and `/superdev:ship` reads such a run from the host. Distinct from a slice's status, which tracks one slice through the DAG (ADR 0013).
_Avoid: "phase" (that names a step within a playbook's procedure, as in run init or run handoff), "state", "step"_

**Degraded pass**: a step of the chain that did not get the assurance the chain promises: a dispatch the permission classifier denied, or a pass that could not reach what it needed. What each command does about one, attended and unattended, and the `**Degraded:**` ledger entry that carries it to `/superdev:submit-pr` and `/superdev:status`, live in `references/scope-mode.md`'s `## Degraded passes` section (ADR 0018). A denied **verification dispatch** stops an unattended run only where the controller authored what that pass verifies, and the entry quotes the classifier's refusal (ADR 0039). An unattended run also stops at the cap `references/scope-mode.md`'s `## Degraded passes` section states, whoever authored the work. The count comes from its own ledger's `denied: ` bullets, so the stop stays inside superdev rather than reaching the platform's own three-denial kill (ADR 0041). A **denial reset** returns that budget once a human has addressed the cause: it counts from the last reset marker, so every recorded denial survives and the pull request shows the reset and its reason (ADR 0044).
_Avoid: "failure" (the code under review did not fail. The chain's own assurance came up short, and an **Unresolved defect** is that other thing), "warning" (too generic)_

**Unresolved defect**: a defect the run found in the code and left standing, recorded as the ledger's `**Unresolved:**` line and written only where the run gives up. A defect found and then fixed leaves no trace. `references/scope-mode.md`'s `## Unresolved defects` section owns the record and what `/superdev:submit-pr` and `/superdev:status` do with it (ADR 0026). Distinct from a **Degraded pass**, which says how much of the chain ran rather than whether the branch is sound.
_Avoid: "degraded pass" (that names the chain's shortfall, not the code's), "blocked" (a blocked slice carries its own status in the ledger's slice table)_

**Scope checkout**: the working tree holding the scope branch, which every command after `/implement` finds from disk. It is the scopetree, `.superdev/scopes/<scope>/scopetree`, at both tiers (ADR 0045); the invoking checkout is never switched onto the scope branch. Where a chained command's fix commits and documentation commits land.
_Avoid: "the checkout" unqualified (the invoking checkout is a different thing)_

**Containment**: the property that base already holds a scope branch's work, so merging that branch into base would change nothing. It is what every surface asking "has this branch reached base" actually means, and it is tested on content — `git merge-tree --write-tree <base> <branch>` yielding base's own tree — never on ancestry, which a squash-merge destroys by rewriting the branch's commits (ADR 0053). A not-contained verdict against a local base is provisional: the test fetches the base branch from the remote and retests against `FETCH_HEAD`, so a squash-merge the clone has not pulled reads contained (ADR 0065). Where that comparison conflicts — a base that edits the branch's files after taking its work — a second tier asks the neighbouring question, whether base's history took the patch: the patch id of the branch's cumulative diff from the fork point, looked for among the commits base gained since (ADR 0082). Every path that cannot answer answers not contained (INV-0003). `references/scope-mode.md` states the test once, `plugin/scripts/scope.js` implements it, and `hooks/scope-prune.js` calls that implementation with `HEAD` as its base and no fetch. Contained and **gone** are the two ways a scope's work is finished with.
_Avoid: "merged" (the host's action, which containment is the local evidence for), "ancestry", "reachable" (the proxy this replaces)_

**Run kind**: which of two things a `/superdev:implement` run is, computed by run init and read by both execution playbooks to decide what the branch step does. **`fresh`** means a ledger this run wrote, including one written after rotating a shipped ledger aside for a new feature reusing a retired label: cut the scope branch from base, or, where the name is taken because a squash-merging host left the branch standing, reuse it when base already contains it and stop when it does not (ADR 0072, ADR 0083). **`resumed`** means a live ledger — held locally, or adopted from the anchor's published snapshot — whose branch holds unmerged slice work. It cuts nothing: it fetches the branch from the remote first where the checkout does not hold it. It then reattaches the scopetree to it, recreating that scopetree where it is absent (ADR 0042, ADR 0045). One determination, made once, read in three places (ADR 0028).
_Avoid: "re-run" (covers a fresh run over a retired label and a resumed run alike, and they take opposite branch actions), "re-cut" (a run reusing a contained branch re-points it rather than cutting a new one)_

**Scope mode**: the shared rule `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, and `/superdev:ship` each read from `references/scope-mode.md` at runtime: what makes a range or scope slug a live run, how to find the scope checkout from disk for either tier, the refresh-not-create rule for the run lock, and the never-moves-backwards rule for the ledger's stage (ADR 0013). Each command keeps only what is specific to it beyond the shared rule.
_Avoid: "chain mode" (the chain is the four commands. Scope mode is the rule review, document, submit-pr, and ship all read, ship included despite sitting outside the chain), "review mode" (that names `/superdev:review`'s own split between an ad-hoc range and a scope, one level down)_

**Candidate set**: what a command invoked with no argument chooses among, named by that command and resolved through the one cascade `references/scope-mode.md`'s `## Resolving an empty argument` section states — exactly one candidate is used, several are listed with their stage and put to the operator, and none is reported with what exists instead (ADR 0078). Each command names only its own set: `/superdev:implement` the features whose slices are ready, `/superdev:submit-pr` the run roots whose stage is not `shipped`, `/superdev:review` the run roots at `merged` or `documented-unreviewed`, `/superdev:ship` the run roots whose stage is `submitted`. `/superdev:review` puts one local rule ahead of the cascade, because a dirty working tree is a subject of its own. A command whose empty-argument resolution lives in a script refuses and lists rather than asking, since a script cannot put a question — `plugin/scripts/publish-kb.js` is the one.
_Avoid: "default" (the cascade picks nothing when the set is not a singleton, where a default would), "the only run" (names the singleton branch, not the set every branch reads)_

**Slicetree**: an isolated filesystem checkout used to keep one slice's branch work off every other slice and off the invoking checkout. The full tier gives each slice its own (`.superdev/scopes/<scope>/slicetrees/<id>/`, plural), merged into the shared **Scopetree** (defined below) once the slice is reviewed and green. The lite tier has none: it implements every slice inline in the single scopetree instead. Both nest under the git-ignored `.superdev/scopes/<scope>/`.
_Avoid: "worktree" unqualified (ambiguous with git's own generic term and with a scopetree), "branch", "workspace", "checkout"_

**Invoking checkout**: the working tree the user runs superdev from (their clone, usually on main). Neither tier's execution playbook switches it onto the scope branch (ADR 0045): each cuts or reuses the scope branch into the scopetree instead, running the `git worktree add`/`remove` calls themselves from here, exactly as any such call does.
_Avoid: "main checkout", "user branch", "current tree"_

**Scopetree**: the dedicated checkout a run cuts its scope branch into, at both tiers (`.superdev/scopes/<scope>/scopetree/`, ADR 0045) — a lite run implements inline there directly, a full run merges each slice into it from that slice's own slicetree. Isolates the run from the invoking checkout and from other sessions. The run root (the DoD and the ledger) stays in the invoking checkout, not here, so it survives scopetree removal.
_Avoid: "worktree" unqualified, "scratch checkout", "session workspace"_

**Run lock**: the `.superdev/scopes/<scope>/run.lock` file plus the `run-lock` hook that together enforce same-scope mutual exclusion at the scope branch's own cut, at both tiers (ADR 0045). Its mtime marks the run as live, so every command in the chain touches it and the lock spans the whole run rather than one invocation. A stale lock is reclaimable as a crash resume. `/superdev:implement` entering a run root it did not itself create in this invocation reads the ledger's stage alongside the lock's mtime before its first write into that run, because the hook itself guards only the cut (`git worktree add`), never an entry into a scopetree that already exists: any stage other than `planned`, with a lock under an hour old, is a **live implement run** (below), which stops that one caller rather than letting it join silently (INV-0013, ADR 0090). `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, and `/superdev:ship`'s own ordinary hand-off is not tested this way — each is the chain's single designed entry right after the previous command's own exit, not a case a second, independent invocation reaches — and `/superdev:plan` keeps its own separate, narrower check. The lock's content is freeform text — whatever a session chooses to write into it — and carries no identity contract of its own; a human reads it to judge self from another session where the check asks.
_Avoid: "lockfile" (that names a dependency-manifest file elsewhere), "mutex" (too implementation-generic), "heartbeat" (names the refresh mechanic, not the file), "session lock" (the lock marks the run as live, not any one session's claim to it)_

**Live implement run**: a run root whose ledger stage reads past `planned` and whose `run.lock` mtime is under an hour old — the `run-lock` hook's own staleness threshold, scoped to `/superdev:implement`'s own entry check alone (INV-0013) and never to `scope-mode.md`'s own `## A live scope run` (the range-resolution sense `/superdev:review` and `/superdev:document` use) or to any other sense of "live" already in this glossary. A `planned` stage with a fresh lock is not a live implement run: `/superdev:plan` writes that lock at its own cut, before any slice has been implemented, and a caller entering it proceeds as the ordinary hand-off to `/superdev:implement`. A lock that has gone stale while its run is still in progress falls outside this definition: staleness alone never re-admits a run to liveness, whatever its actual progress. `/superdev:afk`'s own eligibility bullet asks a different question — whether *any* session might be working a scope, at any stage, including one `/superdev:plan` just cut — and deliberately reads the lock's freshness alone for that broader purpose, never this term.
_Avoid: "live run" bare, unqualified (this glossary already uses it for `scope-mode.md`'s `## A live scope run`, the range-resolution sense `/superdev:review` and `/superdev:document` read — a different question, asked of different evidence), "active scope" (conflates with the ledger's own `**Stage:**` value, which this term reads alongside the lock rather than replaces), "locked" (the lock exists at every stage past cut; only a fresh one past `planned` makes the run live)_

**Progress log**: the per-slice running record of what happened: agent dispatches, reviews, fixes, and merge results. `.superdev/scopes/<scope>/reports/<id>/progress.md` is append-only, oldest-first, git-ignored. Exists so a human or a resumed controller can see what unfolded without re-reading slicetree state.
_Avoid: "log", "report", "transcript" (logs are broader, and this is slice-specific narrative)_

**Warrant**: the justification a piece of work carries. It scales both cost (which model a dispatch uses) and rigor (which review gates run). Derived from a slice's test-applicability and complexity, never a plan field. A `behavior` slice warrants more than a `mechanical` one. A hook blocks any dispatch that omits an explicit model, so cost stays warrant-scaled.
_Avoid: "priority", "estimate", "weight"_

**Intent**: a rough idea sharpened into something plan-ready: the problem, a few candidate directions, the MLP, the open questions, the rejected directions, and the load-bearing commitments. Output of `/brainstorm`, input to `/plan`.
_Avoid: "idea", "requirements", "specification"_

**Minimal Lovable Product (MLP)**: the smallest end-to-end version of the chosen direction that delivers real value. A complete, if narrow, path through the system a user could use, not a fragment of the final thing. Found in `/brainstorm` step 3, carried into `Intent`'s rough scope.
_Avoid: "skateboard" (Kniberg's MVP-evolution analogy, unclear without the backstory), "MVP" (implies bare-minimum and incomplete, not "usable and complete but narrow")_

**Load-bearing decision**: a decision the plan cannot ship without. Leaving it unresolved means the plan is not decided, not just thin on detail. It triggers `Parked questions` when the interview cannot resolve it, on a multi-slice plan only. On a single-slice plan, an unresolved one signals the plan is not single-slice-simple yet, rather than something to park.
_Avoid: "blocker", "important question" (any open question can be unimportant, and load-bearing means the plan cannot ship without it resolved)_

**Load-bearing commitment**: a principle a discovery or an interview settled that constrains later decisions, carried as a pair — the principle, then the rule it implies. Distinct from a `Load-bearing decision`, which is a question the plan must answer; a commitment is already answered and its risk is being outranked rather than left open. `/brainstorm` names them in the `Intent`; `/plan` converts each into an `Invariant register` entry, or names out loud that it constrains nothing or is an authoring rule this repository has no home for (ADR 0081).
_Avoid: "principle" (that is half of one, and the half that loses), "rationale", "guiding principle", "value"_

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

**Unattended run**: one `/superdev:afk` invocation, a serial sweep that takes each eligible scope anchor through the whole four-command chain. It ends on an interrupt, on two consecutive blocked features, on a `/superdev:submit-pr` failure, or on an empty backlog. It keeps no queue: it re-reads the tracker's labels every iteration and keeps its consecutive-block count in `.superdev/afk-blocks`, so a compaction loses nothing.
_Avoid: "afk mode" (there is no mode, and afk is one command with one run), "batch", "autopilot"_

**Unattended token**: the `--unattended` argument afk passes on every command invocation, which tells that command to take its standing answers instead of asking. An invocation property, never written to the run root, so it cannot outlive the run that passed it (ADR 0016).
_Avoid: "unattended flag" (it is an argument token, not a config setting), "afk mode"_

**Standing answer**: what a command does at a stop where it would otherwise ask the maintainer, when the unattended token is present. Each is written at the stop it governs. A stop with none written blocks the scope anchor, which is the catch-all that keeps an unwritten question from stalling a run until morning.
_Avoid: "default" (a default applies always, and a standing answer applies only unattended), "policy", "auto-answer"_

**Eligible anchor**: a scope anchor `/superdev:afk` may pick up. The conditions live in `skills/afk/SKILL.md` §2. Eligibility deliberately ignores `ready`, so a part-merged plan and a crash-interrupted slice both resume (ADR 0017). An anchor failing the one-root or decomposed condition is **skipped**, not blocked, and reported, because it needs a human rather than a sweep.
_Avoid: "eligible epic" (a single-slice plan has no epic, and its lone slice is the anchor), "ready epic" (`ready` is a slice label, and eligibility deliberately ignores it)_

**Anchor dependency**: a recorded relation between two scope anchors, saying the second feature cannot be built until the first has shipped. It is satisfied once the anchor it names is closed, that scope's ledger stage reads `shipped` (the pull request is merged, ADR 0096), or no such anchor exists, and an anchor whose dependency is unsatisfied is **deferred** for that sweep — no label written, no block counted, named in the report with what it waits on. `/plan` records one when its interview named a prerequisite feature; `/afk` is the only reader. How a given store records it is stated in that store's own `## Scope anchor` section, which specialises `plan-contract.md` → *Scope anchor* (ADR 0040).
_Avoid: "depends-on" (that is the slice-level edge inside one plan, which `/implement` reads), "blocked anchor" (`blocked` is a label a human clears, where a deferred anchor clears itself)_

**Amendment** (of an ADR): the treatment for a recorded decision that stands with a narrow qualification, where supersession is the treatment for one that was overturned. The amending ADR carries the qualification and names what it amends; the amended one keeps its `**Status:**` at `Accepted`, keeps its text, and gains an `**Amended by:**` pointer on its own line. Nothing is edited into an ADR's body, so the dated record stays intact and every document citing it stays current (ADR 0043).
_Avoid: "supersede" (that replaces a decision rather than qualifying it), "revise" (that is the glossary's treatment, where one entry is rewritten in place)_

**Rejected direction**: a direction a brainstorm explored and dropped, carried in the `Intent` with the reason it lost. `/plan` routes each one to a durable home, so it cannot be re-proposed cold later: a dropped approach goes to an ADR's `Considered options`, and dropped scope goes to the epic's non-goals.
_Avoid: "non-goal" (that is the destination for a rejected scope, not the record of why), "alternative"_

**Domain shape**: a named structure a slice's code gives a domain concept, in whatever the repository's language provides: a TypeScript interface or type, a class, a DTO, a Python dataclass or `TypedDict`, a zod schema. A slice `spec` names the shapes the slice needs, by name and in this glossary's vocabulary, and the implementer declares them before its first RED test. Names only. The fields are the implementer's, because a `spec` is a contract of outcomes (ADR 0030).
_Avoid: "type" (too narrow, because a shape is not a static-typing claim, and an untyped language still has shapes), "model", "DTO" (one rendering of a shape, not the concept), "entity"_

**Invariant register**: `docs/invariants.md`, the one place a repository states the rules its system may never break. Each entry carries an id, a `Class`, the `Concepts` it governs, its `Statement`, and how it `Breaks`, and optionally the `Symbols` and `Paths` it governs and the `Check` that proves it. `Concepts` is mandatory and draws on this glossary, because a concept survives a move that unbinds a path. `/plan` reads the register whole, and for each entry a feature touches, routes the entry's id into the touching slice's `spec` and `acceptance` and states the epic's own criterion as the behaviour the entry protects, and records a new invariant the interview settles; `final-reviewer` reads the register itself too, judging an entry covered by either half of that routing (ADR 0077, ADR 0091).
_Avoid: "rule" (that named the `.claude/rules/` file this register replaces), "constraint" (too generic, and a slice `spec` already carries slice-level ones), "business rule" (an architectural and a lifecycle invariant are neither)_

## Acceptance and verification

**Acceptance** (per-slice): the checkable criteria for **one** slice. The slice-reviewer verifies against this, and the implementer treats it as the TDD loop's termination condition, one increment per criterion. Different from the global DoD (acceptance is per-slice, DoD is whole-feature). On a `behavior` slice it names the **domain-level** failure and boundary cases too, stated as observable behaviour: those derivable from the interview without seeing the implementation (empty input, absent config, duplicate, auth failure, concurrent arrival). Implementation-level edges (off-by-one, parser boundary, encoding) belong to the implementer's TDD loop and the reviewers, who read the code the planner never sees.
_Avoid: "specification", "requirements" (acceptance is the test oracle)_

**Reachability criterion**: the Definition-of-Done criterion, led by the word `Reachable:`, that names the entrance through which a user reaches a feature — an endpoint, a command, a screen — in the same interface vocabulary a slice `spec` uses, or `none` with the reason — no in-repo consumer, or an unchanged entrance on a behaviour-preserving
refactor. Every feature carries at least one, on every change type, and a single-slice feature carries it through the lone slice's `acceptance`. It is what makes the tracer-bullet rule an artifact a second reader can check rather than an adjective an agent grades itself against, and it rides `dod.md` to the final-reviewer and to a controller's own tick like any other criterion (ADR 0062).
_Avoid: "entrance" alone (that names the thing the criterion points at, not the criterion), "wiring" (one language's rendering, and a cross-process entrance is not wiring), "integration criterion" (integration names the seam between slices, which `final-reviewer` already covers separately)_

**Criterion tag**: the suffix on an epic's Definition-of-Done line naming the slice ids that deliver the criterion, or `scope` when no single slice does. It decides which criteria a slice implementer's report can tick; the report decides whether they are ticked. A single-slice feature carries none (ADR 0091).
_Avoid: "mapping" alone (the tag is the written form), "owner" (a slice delivers a criterion, it does not own it)_

**Tick**: a controller's judgment on one Definition-of-Done line, on the scope anchor and in `dod.md`: checked with its evidence as the note, or unchecked with the reason it is not met, that only a deploy can verify it, or that an attended operator accepted it as unmet (ADR 0095). A line nobody has judged yet carries no note; a bare tick is invalid (INV-0014). Only a controller writes one (INV-0015).
_Avoid: "check off", "verify" (verification is what earns a tick, not the tick itself)_

**Suite record**: the ledger's record of the last full-suite run — its result and the commit it ran on. A later step reuses a green record whose commit is the scope branch's current tip, or an earlier commit that differs from the tip only in the active store's own plan files, instead of running the suite again (INV-0017).
_Avoid: "suite status", "last run" (the record names its commit, which is what makes it reusable)_

**Pinned merge**: `/superdev:ship`'s merge of a scope's pull request through the host's merge API, bound to the one head a green full-suite run covers — the host refuses it when the pull request's head has moved since. It is the one write superdev makes to the base branch (INV-0001), and it never forces past branch protection or a required approval (INV-0092, ADR 0096).
_Avoid: "auto-merge" (that names a host feature that merges once checks pass, with no pinned head), "fast-forward" (a pinned merge squashes)_

**Test-applicability**: the class of changes a slice carries. `behavior` is new functionality, and needs TDD plus a per-slice reviewer plus a simplicity-reviewer. `mechanical` is a move, a rename, or a format change, uses the existing suite as the net, and skips per-slice reviews. `docs` is documentation-only, and skips reviews.
_Avoid: "slice type", "category"_

**Focused test command**: the **second** fenced block of `docs/agents/verification.md`, required configuration in every repository with a suite (ADR 0085), the command every step inside the loop runs and the documentation step runs over its own doc commits, in place of the full command the first block holds. What defines it is that it **costs less than the full suite**: a `{paths}` form, a fixed fast subset, and a self-detecting runner flag all qualify. Carrying the token `{paths}` makes the caller substitute the **changed-path set** below, shell-quoted, and requires a runner that maps source files to the tests covering them — a form `/superdev:setup` derives with that runner's pass-with-no-tests flag, so a change set holding no tests reports green rather than red. Carrying none takes one of two shapes. A **fixed fast subset** (`pytest tests/unit`) names its own tests and always collects them. A **self-detecting runner flag** (`vitest --changed`, `jest -o`) computes the change set itself and carries that runner's own pass-with-no-tests flag, for the same reason a `{paths}` form does. A runner that cannot narrow records the full command again in this fence, with the reason recorded as prose beside it. A repository carrying only one fenced block has never answered this configuration: a prose caller stops, reports the missing configuration, and names `/superdev:setup`, running no command — `/superdev:plan` and `/superdev:implement` already auto-invoke it. `hooks/green-gate.js` is the one exception, running the full command it found and emitting a notice instead of stopping, because a hook cannot ask an operator. A `verification.md` carrying zero fenced blocks is a different case, not this one: `hooks/green-gate.js` reads it exactly as it reads an absent file, no gate at all. `references/test-selection.md` owns the contract and every consumer reads it at runtime (ADR 0025, ADR 0074, ADR 0085, INV-0007).
_Avoid: "partial test command" (it is cheaper, not incomplete), "incremental tests" (that names a runner's own caching), "narrowed command" (path scoping is one of its forms, not its definition)_

**Changed-path set**: the paths a caller substitutes for `{paths}` in the focused test command, those changed in the range that caller judges. `references/test-selection.md` owns which range each caller uses, and why an **empty** set runs the full command where the focused command consumes `{paths}` — a substitution over no paths proves nothing — while a focused command carrying no such token runs unaffected by that computation. A fixed fast subset is unaffected because it names its own tests regardless. A self-detecting runner flag is unaffected because it derives the change set itself and relies on its own pass-with-no-tests flag rather than this fallback (ADR 0025, ADR 0074).
_Avoid: "diff" (that names the content, not the path list), "touched files" (`Touch map` already claims that phrasing for a different artifact)_

**Timing command**: the optional `## Timing command` section of `docs/agents/verification.md`, whose command reports what the suite's tests cost — per-test durations where the runner gives them, total wall clock otherwise. It holds its command in a backtick span, never a fenced block: `hooks/green-gate.js` reads fenced blocks and takes the first two as the full and focused commands, so a fenced third would run as the focused suite in a repository that has not yet recorded a focused command. A **test audit** is its only reader, and an absent section makes that audit `unmeasured` rather than failing it (ADR 0066).
_Avoid: "benchmark command" (it prices an existing suite, it does not measure throughput), "profiling command" (that names a per-line attribution nothing here asks for), "third block" (it is not a fenced block, which is the whole point)_

**No verdict**: what a spawn that its own bound ended carries. `spawnSync` reports it as a `status` of `null` beside a `signal`, and the distinction is the whole of it: a process killed at its timeout decided nothing, so neither a gate nor an assertion about behaviour may stand on it. `hooks/green-gate.js` reads it on the suite it runs after a controller merge, `scripts/adapter.js`'s OpenCode hook bridge reads it on every hook it spawns, and a test harness reads it on every bounded spawn of its own. It is also the discriminator a duration assertion states instead of a clock — `signal` naming the kill is the evidence a bound held, where an elapsed value only ever reports the scheduler too (ADR 0086, INV-0009).
_Avoid: "timeout" (that names the bound, not the result of hitting it), "failure" (a verdict of fail is a decision this is the absence of), "hang" (the process may have been perfectly healthy and merely slow), "spawn failure" (that is the separate term below, and the two carry different answers)_

**Spawn failure**: what a process that never started carries. `spawnSync` and `child_process.spawn` report it as an error with no `signal`, and its code names one of two classes. An **installation** failure (`ENOENT`, `EACCES`) is a missing binary, a wrong path, or a broken install. A **transient** failure (`EAGAIN`, `EMFILE`, `ENFILE`, `ENOMEM`) is a system out of processes, file descriptors, or memory, which clears as other processes exit. It is not a **No verdict**: the gate never ran, so there is nothing it declined to decide, and the absence is evidence about the machine rather than about the code under the gate. INV-0009 therefore does not govern it, and each surface answers it with its own reason: `hooks/green-gate.js` blocks, because it fires only on a merge and a tree that cannot run its suite is a defect in the thing being gated; `scripts/adapter.js`'s hook bridge retries a transient failure once and otherwise continues with a notice naming the code and its class, because it fires on every tool call and every repair is made through that surface (ADR 0087, ADR 0100).
_Avoid: "no verdict" (the entry above, and the distinction is the whole point), "crash" (the process never ran to crash), "error" alone (too generic to carry the boundary)_

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

**Judge discipline**: the verification principle every review agent carries verbatim. Verify the artifact and the behaviour yourself, and never defer to the implementer's or controller's narrative of what was done. Length or an elaborate structure is not its own evidence of correctness or of warranted complexity. Reject a completion claim resting only on proxy counts (coverage percentage, line count, lint score), and confirm the observable behaviour instead (ADR 0002).
_Avoid: "verification discipline" (too generic, because this means not trusting the builder's account of its own work)_

**Derived criteria**: the acceptance criteria `final-reviewer` writes itself, from the feature's intent alone, before it reads the Definition of Done or the diff. Diffing them against the DoD surfaces criteria the plan never wrote. Scope mode only: it needs a DoD written by someone else to diff against, so `/superdev:review` hands over `dod.md`'s **path** rather than its text and the reviewer opens it after its own list exists (ADR 0020).
_Avoid: "independent criteria", "own criteria" (the point is where they come from, not whose they are)_

**Ceiling note**: the single advisory observation `final-reviewer` may add when a scope met a Definition of Done criterion **shallowly**. The review found the criterion satisfied and the code correct, but the work stopped at the first thing that passed. It is admissible only against four gates: it names the criterion this review found satisfied, it names a concrete consequence, there is exactly one, and the review found nothing Critical or Important. It never gates a merge and never triggers the fix loop, exactly like an over-engineering finding (ADR 0020).
_Avoid: "quality note", "improvement suggestion", "nit" (a ceiling note describes correct code, so it is not a defect at any severity)_

**Standing code**: the subject of an ad-hoc `/superdev:review` when the path it was given exists on disk and its scoped diff is empty — the files under that path at `HEAD`, reviewed as they are rather than as a change. It is the fourth range shape, beside `BASE..HEAD`, a working-tree scope, and a path scope with a non-empty diff. `simplicity-reviewer` is skipped on it: its rubric reads a diff (ADR 0063).
_Avoid: "audit mode" (no flag selects it; an empty scoped diff is what resolves to it), "file review" (names the input, not what makes it a distinct shape)_

**Deferred finding**: a fix-loop finding whose remedy adds a capability the Definition of Done never
named. It starts no fix loop, holds no run stage, and is not an **Unresolved defect**. The scope review
records it under its report's `### Deferred to a plan` heading instead and hands it to `/superdev:plan`.
It reaches several homes at once: a **Triage record** in the slice store, a `**Deferred:**` bullet in the
run's ledger carrying that record's reference, and the pull-request body `/superdev:submit-pr` copies the
bullet into. On an issue backend, the triage record outlives the run root and the closed scope anchor
regardless of whether the scope ever ships. On the local plan-file store, it outlives the run root and
the closed scope anchor only once the scope branch carrying it merges (ADR 0035, 0046, 0048).
_Avoid: "scope growth", "out-of-scope finding" (the point is the DoD boundary, not that the finding is
unwelcome or off-topic)_

**Observation**: a real defect a run meets that no slice of it covers, and that the scope did not cause —
a flaky test in untouched code, a failure the green-gate hook reports on a merge, a defect an implementer
reports alongside its own slice. The controller writes it a **Triage record** the moment it meets one, and
that record is its only artifact: no ledger line, no pull-request heading. It is recorded, never judged,
so it carries no severity, holds no stage, and enters no fix loop (ADR 0088, INV-0010). Distinct from a
**Deferred finding**, which the scope review judged inside its own range and handed to `/superdev:plan`;
an observation was never in range to judge.
_Avoid: "out-of-range finding" (it is not a finding — nothing judged it)_

**Triage record**: the slice-store record a **Deferred finding** or an **Observation** gets — created by
`/superdev:review` at the moment it defers, and by the controller at the moment it meets an observation. It is neither a slice nor a scope anchor, which is what keeps every run and every
sweep from selecting it as work to build. How a given store expresses it is stated in that store's own
`## Triage record` section, which specialises `plan-contract.md` → *Triage record* (ADR 0046).
_Avoid: "draft issue" (no backend the plugin supports has a draft issue state outside GitHub's project
boards), "triage slice" (it has no spec, no acceptance, and no place in a DAG)_

**Untriaged item**: an open record in the slice store that superdev never wrote — it carries neither a
feature label nor the store's triage signal, so it is neither a **Scope anchor**, nor a slice, nor a
**Triage record**. It is work a human filed and no `/superdev:plan` interview has yet reached. How a given
store recognises and lists one is stated in that store's own `## Untriaged item` section; a store with no
inbox of its own, such as the local plan-file store, states there that the set is empty. Only a human acts
on it: reading one is what turns it into a plan or closes it.
_Avoid: "unlabeled issue" (a human's own labels do not make an item triaged, and one backend's records
carry no labels at all), "new issue" (age is not what defines it), "backlog item" (every row in a
**Backlog survey** is one of those)_

**Backlog survey**: the read-only report `/superdev:backlog` prints, grouping every open **Scope anchor**,
every **Triage record**, every **stranded run root**, and every **Untriaged item** in the slice store by the
action each one needs, and ending with one recommended move. A stranded run root is a run whose stage is
short of `shipped` and matches no open anchor. It ranks as the most expensive item in the table, where an
untriaged item ranks last: it is the furthest from finishing, and it is the one bucket the survey caps
rather than printing whole, since a store with real reporters holds more of them than the rest of the
table put together. It reads the store where
`/superdev:status` reads the runs' ledgers, and it shows what `/superdev:afk` passes over by
design: an unreleased plan, an anchor nobody decomposed, a triage record, and an untriaged item. It shares
its facts with that
command's selection and not its verdicts — a survey resolves an ambiguity toward showing the row, where an
unattended sweep resolves one toward deferring (ADR 0049). It writes nothing and sits outside the implement
chain.
_Avoid: "backlog sweep" (a **Sweep** reads a whole tree; the backlog survey reads the slice store
instead), "status" (that command reports runs from their ledgers, not the store)_

**Test audit**: the read-only whole-tree sweep `/superdev:review-tests` runs, pricing a suite that many scopes have grown. It measures where a **timing command** is configured, dispatches `test-auditor` over every test file in one pass, ranks its findings by cost, and hands the survivors to `/superdev:plan` as an intent, except under **Chained posture**. It reaches what a review cannot: a duration is invisible to reading, and a redundant pair has a second half outside any range. A dead or ignored test reports as a fact, and every remaining finding is a judgment the operator may reject before it survives. Unchained, its only writes are the intent and the one-line `.gitignore` entry that keeps `.superdev/` ignored when
absent; chained, it writes nothing at all. It sits outside the implement chain and outside `/superdev:afk` (ADR 0066).
_Avoid: "test review" (review is the code-review family, and this one neither resolves a range nor gates a merge), "suite audit" (`Audit` already names the doc loop's reader-first mode), "coverage audit" (it prices the tests that exist, and never asks for more)_

## Separation of concerns

**Execution playbook**: the linear, tier-specific procedure that runs a scope's whole `/implement` execution, start to finish. It is `references/implement-full.md` (full tier) or `references/implement-lite.md` (lite tier), computed and `Read` by the controller once the tier is known. Each playbook opens by reading `references/run-init.md` (run init) and closes by reading `references/run-handoff.md` (run handoff). The `/implement` command body therefore keeps config and input, the tier computation, the invariants, the model table, the issue-status map, and red flags. Control never returns to it once a playbook starts.
_Avoid: "command" (the playbook is the file the command delegates to, not the command itself)_

**Review checklist**: the shared file (`references/review-checklist.md`) naming concrete anti-patterns, vulnerability classes, design smells, a reuse-audit lens, a consistency lens (convention drift, cross-slice divergence), and a test-cost lens, read at dispatch time. `final-reviewer` applies every lens its own list names, `slice-reviewer` applies anti-patterns and vulnerability classes, and `test-auditor` applies the test lenses plus `## Test cost`, which only it reads because those two need a measured duration (ADR 0066). It follows the same shared-file-read-at-dispatch pattern as `Execution playbook`, one level down: a checklist of things to look for, not a procedure to follow.
_Avoid: "checklist" alone (ambiguous with the DoD's own checklist), "linter rules" (it is read and reasoned about, not mechanically run)_

**Sweep**: a read-only pass over a whole tree, where a review resolves a range. It is what finds a property of a pair — a redundant implementation, a fact stated twice — because the covering half lives wherever it lives and no range is guaranteed to contain it. `/superdev:sweep` is the chain-runner over four legs (code, docs, tests, config); `/superdev:review-tests` sweeps the test tree alone (ADR 0066, ADR 0068).
_Avoid: "audit" (that names the reader-first mode of `/superdev:document`), "scan" (a sweep reasons, it does not pattern-match)_

**Chained posture**: the mode a surface runs in when `/superdev:sweep` invokes it as a leg — it returns its findings and writes nothing. The doc leg dispatches no `doc-writer` and commits nothing; the test leg runs no agreement round and writes no intent. The test leg still labels each finding fact or judgment, returning that split directly to the caller instead of running the round. The code leg reads the same `--chained` signal: it runs no `git add -N :/` and never enters scope mode, whatever the invoking checkout's `HEAD` is, which keeps the leg's path resolving to ad-hoc standing code or an ad-hoc diff, never a live run's own. The config leg needs no signal either — `/superdev:setup check` already writes nothing, so the mode is already the chained posture. The sweep's own intent is the run's only write. Each surface's unchained behaviour is unchanged (ADR 0068).
_Avoid: "dry run" (the leg does its real work, it just does not act on it), "read-only mode" (every leg's reviewers are already read-only; this is about the surface's own writes)_

## Doc loop

**Audit**: the reader-first mode of `/superdev:document` (invoked as `/superdev:document audit`). The doc-reader reads the whole audit set cold and grounds every claim against the repo before any doc-writer involvement. Findings get the standard single doc-writer fix round, except under **Chained posture**.
_Avoid: "full reader-test" (the mechanism, not the mode), "doc review" (review is the code-review family)_

**Audit set**: the file set an audit reads: the documentation convention's own tree (`AGENTS.md` hierarchy, `README.md`, `CONTEXT.md`, local KB pages) by default, extended per repo by an `## Audit set` section in `docs/agents/documentation.md`.
_Avoid: "doc tree" (that is only the default, and the set may include other prose surfaces)_

**Drift assertion**: a deterministic check in the repo's test chain that a fact restated outside its source (a guard regex's coverage of `agents/`, a referenced plugin path) still matches the artifact it derives from.
_Avoid: "drift test" (it is an assertion inside the existing chain, not a suite), "consistency check" (too generic, because that names a review lens)_

**Bootstrap** (mode): the brownfield-seed mode of `/superdev:document` (empty args, `AGENTS.md`-hierarchy convention, root `AGENTS.md` absent). The doc-writer seeds the root and child `AGENTS.md` files from the existing code and proposes `CONTEXT.md` candidate terms, which the controller confirms or prunes with the user before committing. A range or area invocation never bootstraps.
_Avoid: "init", "scaffold" (bootstrap seeds from what already exists, and it does not scaffold empty structure)_

**Writing standard**: the prose style the doc agents apply, recorded as a pointer in a `## Writing standard` section of `docs/agents/documentation.md`. The value is `controlled` (the language-neutral rule set shipped as `references/controlled-prose.md`, merged from ASD-STE100, the tekom rule catalogue, and the *Handbook of Technical Writing*), a repo-relative path to the project's own style guide, or `none`. It binds only the prose an agent writes or rewrites in that dispatch, never untouched text (ADR 0012).
_Avoid: "style guide" (that names one possible value, a repo's own file, not the config), "STE" (one of the three sources, not the standard), "tone" (a voice property, where the standard governs form), "linter" (there is no deterministic check, and the doc-reader is the verifier)_

**Content type**: the kind of information a passage of documentation carries: `interface` (what a part is called), `reference` (data the reader looks up), `conceptual` (why the thing exists and when to reach for it), `procedural` (the steps to perform a task). Shipped as `references/content-types.md`, a lens both doc agents read at dispatch. The doc-writer applies it, and the doc-reader flags an absent conceptual layer as `conceptual:` in its cold read (ADR 0014). Unlike the **Writing standard** it is never configurable and never `none`: coverage is a completeness property, not a style one.
_Avoid: "doc type" (the type classifies a passage, not a whole file, and one `AGENTS.md` carries several), "information type" (the DITA term for a stricter topic-level schema superdev does not adopt), "section"_

**Staged page**: one knowledge-base page `/superdev:plan` or `/superdev:document` writes as a `.md` file to `.superdev/kb-pending/<scope>/` instead of sending to a remote backend. It carries YAML frontmatter with the page `title` and an `action` of `upsert`, `patch`, or `delete`, and the page body below it. A `patch`'s body is one section of an **aggregate page** (ADR 0027). The filename and path rules live with the staging commands. The page waits until `/superdev:publish-kb` applies it, which is the only path from superdev to a remote backend. A local `docs/kb/` backend produces none, because its pages are repository files (ADR 0023). A staged `upsert` records the hash of the live body it was built from, and `/superdev:publish-kb` refuses it when that body has changed, or when it records none and the page exists (ADR 0094).
_Avoid: "draft" (a draft is unfinished, and a staged page is final and merely held), "pending page" (that names the state, not the artifact)_

**Aggregate page**: a knowledge-base page many scopes each contribute one section to, rather than one a single scope owns end to end: an index, a changelog, an ADR-summaries digest. The knowledge-base outline marks which pages aggregate, and `/superdev:setup` asks. A marked page is staged one section at a time (`action: patch`) and merged into the live page by that section's heading, because the doc-writer reaches no backend and so cannot see the sections other scopes already wrote. Replacing it wholesale drops them (ADR 0027).
_Avoid: "shared page" (every page is shared with its readers, and what distinguishes this one is many writers), "index page" (an index is one instance, not the class)_

**Positive absence**: the verdict that a knowledge-base page genuinely does not exist, as against a backend that could not answer. A **Backend command contract**'s `find` template asserts it with a distinct exit code, so every accidental path — a transport error, a filter that matches nothing on an authorization failure — falls through to "could not answer" and leaves the page staged. It is the one verdict that lets `scripts/publish-kb.js` create a page, which is why creating on anything weaker is what drops an **Aggregate page**'s other sections (ADR 0027, ADR 0069).
_Avoid: "not found" (that is what a 404 says, and a 404 from `read` for a title `find` listed is a read failure), "missing" (implies something went wrong, where this is a settled fact), "empty result"_

**Inline doc pass**: the documentation pass a `lite` run performs in the controller's own context, as its playbook's last step, instead of through a dispatched doc-writer. It follows `references/doc-pass.md` and is recorded as the ledger's `**Docs:**` line, which is what tells `/superdev:document` to dispatch `doc-reader` alone (ADR 0031). A `full` run never performs one, because its parallel slicetrees collide on shared doc files.
_Avoid: "inline documentation" (that names code comments), "doc step" (names one step of any pass, not this tier's arrangement)_

## Backends

superdev is tool-agnostic: its backends are pluggable, each chosen by `/setup` and recorded under `docs/agents/`. The commands and agents never hardcode one.

**Seed** (seed template): a backend-config template file under `references/` (for example `issue-tracker-jira.md` or `code-management-github.md`) that `/setup` reads and fills in with repo-specific specifics to produce the matching `docs/agents/*.md`. Adding a backend means a new seed plus the setup step that consumes it.
_Avoid: "template" alone (too generic), "backend file" (that names the `docs/agents/*.md` output, not the `references/` input)_

**Slice store**: the backend where a feature's plan and slices live: local files, or an issue tracker. Configured in `docs/agents/issue-tracker.md`.
_Avoid: "issue tracker" as the concept name (that is one backend), "database"_

**Assignee**: the slice-store account every issue a run creates is assigned to. It is a single store-native identifier (a login for Forgejo or GitHub, an `accountId` for Jira), read from **Operator configuration**, resolving to the API token's own identity when unconfigured and disabled by `none`. Configuration rather than a slice field, applied at creation to the epic and every slice. How a given store applies it is stated in that store's own `## Assignee` section, which specialises `plan-contract.md` → *Assignee* (ADR 0010, ADR 0073).
_Avoid: "owner" (too generic), "creator" or "reporter" (the store already records who filed the issue, and assignee is who owns it), "reviewer" (a pull-request role, owned by the code host)_

**Operator configuration**: `.superdev/info.json`, the untracked, repository-local file holding the identifiers that belong to the person running superdev rather than to the repository — the **Assignee** today. Keyed by backend role (`issue-tracker`), and untracked by construction, because `.superdev/` is git-ignored. Distinct from the tracked `docs/agents/*.md` configuration, which states what the whole team shares (ADR 0073).
_Avoid: "user config" (superdev's user is the repository, not the person), "settings", "profile", "credentials" (tokens stay in environment variables and never enter this file)_

## Portability

**Harness**: an agent runtime a portable pack renders for (Claude Code, OpenCode, Codex, …). The pack treats one as its runtime home (Claude Code today) and every other as a render target.
_Avoid: "agent" (that is the subagent role the controller dispatches), "tool", "plugin host"_

**Harness adapter**: the install-time render from a **Canonical surface** to one harness's native surface set (commands, agents, a hook bridge), together with the generated artifacts it writes. Owns no semantics of its own: every rendered file's meaning derives from the canonical source it came from.
_Avoid: "extension" (that names a harness's own component kind, e.g. Gemini's), "shim" (too thin: it carries the full render), "translator"_

**Canonical surface**: the single authored form a piece of the pack keeps in the repo — skills for prompts, agents for subagents, hook scripts for guardrails. Everything a harness loads derives from it, either natively (Claude Code) or through a **Harness adapter**.
_Avoid: "source of truth" (the repo as a whole already claims that), "template" (that names a backend **Seed**), "primary"_

**Render target**: one file set a harness adapter writes into a consumer's repository (for example `.opencode/skills/`, `.opencode/commands/`, `.opencode/agents/`, `.opencode/plugins/`). Generated, never hand-edited, and reproducible by re-running the adapter.
_Avoid: "artifact" (too generic), "output" (an invocation property), "install" (that is the whole flow, not the file set)_

**Render overlay**: the committed form of a **Render target** whose render is line-aligned with its **Canonical surface** — the rendered frontmatter in full, plus only the body lines that differ from the source, keyed by line number. It is what the `opencode-render` drift check pins the adapter against, roughly 80% smaller than a whole-body fixture, and it changes whenever an edit shifts the body's line count or touches a rewritten line — the same edit a whole-body fixture would also need to absorb. A target with no line-aligned source (the `afk` command render, the generated hook bridge, the synthesized `upgrade` skill) is committed whole instead, and a target whose alignment breaks is refused by name rather than overlaid onto the wrong lines (ADR 0060).
_Avoid: "golden fixture" (that names the whole-body form this replaces for aligned targets), "diff" (there is no diff algorithm: alignment makes it a line-number map), "patch"_

**Model-invocable surface**: a **Render target** the harness's own model can start, as against one only the operator can. Which target kind carries the property is the harness's to decide — on OpenCode a skill does and a command does not — and it is what decides where each surface renders: `/superdev:afk` chains four other surfaces itself, so those four must carry it, and afk must not (ADR 0055).
_Avoid: "auto-invoked" (that names implicit activation by description match, a different property), "callable", "public"_

**Shipped tree**: the `plugin/` subdirectory, which is everything a user's install copies and nothing else, because the marketplace manifest's `source` is `./plugin`. Everything outside it — `tests/`, `scripts/`, `docs/` — is maintainer-only and reaches no user.
_Avoid: "the plugin" (that names the product, not the tree), "dist", "build output" (there is no build step)_

**Guardrail**: one of the deterministic Node hooks in `plugin/hooks/`, wired by `hooks/hooks.json`, that decides a tool call or a session event with no model judgment involved.
_Avoid: "hook" alone (Claude Code's word for the wiring point, which also covers hooks superdev does not ship), "check" (that names a `Check:` proof or a drift assertion)_

**Guardrail parity**: how much of the shipped hook set a **Harness adapter**'s render can make decide on one harness, and what the render does where it cannot. A hook needs both a wiring the harness offers and the payload fields its own decision reads: Codex wires `merge-guard` and still cannot fire it, because no Codex tool event carries the subagent identity the guard decides on (ADR 0056). Parity short of full is stated to the operator and recorded in an ADR, never silently absent.
_Avoid: "hook parity" (the wiring is only half of it — a wired hook with no field to read still decides nothing), "coverage", "degraded pass" (that names a run-level policy in `references/scope-mode.md`)_

**Feature label**: the one slice-store identifier a feature's scope anchor and every one of its slices carry, its **change type** and its slug, in the notation the active `docs/agents/issue-tracker.md` states (a `<type>/<slug>` label on an issue-backed store, the `<type>/<slug>` path under `docs/plans/` on the local-file store). It names the feature to `/superdev:implement`, and it is the scope branch verbatim, so one value fixes which feature gets built and which branch and run root the build uses (ADR 0019, ADR 0021).
_Avoid: "epic label" (`epic` is a different label on one backend, marking which issue is the anchor), "tag", "component"_

**Change type**: the Conventional Commits type of what a feature does to the codebase: `feat`, `fix`, `refactor`, `docs`, `perf`, `test`, `build`, `ci`, `chore`, `style`, or `revert`. `/superdev:plan` picks it, it leads the **Feature label**, and it is the scope branch's first segment (`<type>/<scope>`), so the branch and the pull request report the same kind of work the commits do. `references/scope-mode.md` owns the set. `hooks/scope-prune.js` matches it only on its pre-CLI fallback path, when a scope's ledger carries no `**Branch:**` line to read the branch from directly (ADR 0007).
_Avoid: "commit type" (it labels the feature, not one commit), "category", "kind"_

**Status map**: the agreed mapping from superdev's canonical slice lifecycle (`todo`, then `in-progress`, then `in-review`, then `merged` or done, plus `blocked`) to an issue tracker's real statuses and transitions. Captured by `/setup` for issue-backed slice stores, recorded in `issue-tracker.md`, walked by `/implement` at each lifecycle point.
_Avoid: "status mapping", "workflow" (too generic)_

**Code host**: the backend the scope branch pushes to and where the pull request or merge request opens. Configured in `docs/agents/code-management.md`.
_Avoid: "code-management" (that is the doc slug), "GitHub" (that is one host)_

**PR posture**: the three-state config value controlling how `/superdev:submit-pr` opens the PR: `draft` (open as draft), `ready` (open ready-for-review), or `push-only` (push the branch, skip opening a PR). Set per code host during `/setup`, recorded in `code-management.md`.
_Avoid: "PR mode", "draft mode" (only one of the three states)_

**Knowledge base**: the optional human-first record (feature specifications, design overviews, ADR summaries), distinct from the agent-first `AGENTS.md` docs. It may be `none`. The doc-writer reconciles it, and writes a remote backend's pages as **staged pages** rather than sending them. `/superdev:publish-kb` is the only command that reaches a remote backend (ADR 0023).
_Avoid: "docs" (too broad, because the AGENTS.md tree is separate), "wiki" (that is one KB)_

**Backend command contract**: the five named shell command templates — `find`, `read`, `create`, `update`, `delete` — a remote knowledge base declares under the `## Commands` section of `docs/agents/knowledge-base.md`, one `### <verb>` subsection each. `/superdev:setup` writes them and `scripts/publish-kb.js` is the only runtime reader: it resolves a verb by heading name, never by position, runs it under `/bin/sh -c`, and passes every value as an environment variable rather than interpolating it. Every one of the five runs under a time bound, and a call that exhausts it stops the batch rather than costing that bound once per staged page (ADR 0076). A backend declaring no `read` template can carry no **Aggregate page**, because nothing can fetch a live body to merge into (ADR 0069).
_Avoid: "adapter" (that names the install-time render in `Harness adapter`), "backend config" (that is the whole `docs/agents/knowledge-base.md`, of which this is one section), "hook" (a hook is a shipped guardrail the harness fires)_

**Feature specification**: the KB's one-page-per-feature document, carrying the problem, the solution shape, and the Definition of Done, written for the KB's audiences and language. Distinct from a slice's own `spec`: this is one per-feature narrative for readers, not a per-slice implementer contract.
_Avoid: "PRD" (implies business-case and persona content this doc does not carry), "specification" alone (collides with the per-slice `spec` field)_

## Roles

The subagents the controller dispatches. Each runs in isolated context and only its result returns. **Controller** and **Final-reviewer** carry discipline beyond their name, defined under _Controller discipline_ and _Review discipline_ above.

**Implementer**: builds **one** slice test-first (TDD), the laziest version that works. Never merges (a hook enforces it).
_Avoid: "developer", "coder"_

**Slice-reviewer**: per-slice correctness gate (full tier, `behavior` slices). It verifies against the slice's acceptance, independently re-runs the suite, and reads the produced artifact, hunting uncovered input.
_Avoid: "reviewer" (unqualified, so say which)_

**Simplicity-reviewer**: the over-engineering reviewer. It names what to delete and what a standard-library or native feature replaces; its findings are advisory and gate nothing. Read-only. Two dispatch sites, one per tier: `full` runs it per `behavior` slice and applies the warranted cuts before the slice merges, and `/superdev:review` then skips it on that tier, leaving the cross-slice case to `final-reviewer`'s Brevity axis. `lite` has no per-slice review, so `/superdev:review`'s whole-scope dispatch is the only pass it gets (ADR 0037).
_Avoid: "the simplicity review" unqualified (name the tier, because which site runs is what differs); "linter", "critic"_

**Doc-writer**: reconciles the in-repo docs (the AGENTS.md tree) and the knowledge base with the merged code, removing stale text. Run by `/document`.
_Avoid: "documenter", "technical writer"_

**Doc-reader**: the reader test, a fresh-context, read-only verifier that reads the doc-writer's changed docs cold and checks their claims against the repo (paths, commands, described behavior). Run by `/document` after the doc-writer. Findings trigger one doc-writer fix round.
_Avoid: "doc-reviewer" (it tests grounding and first-read clarity, not prose quality)_

**Test-auditor**: read-only. Prices a whole test tree in one pass against a duration table, naming what each test costs against what it proves. Dispatched once, over the whole swept set, by `/superdev:review-tests` (ADR 0066).
_Avoid: "test reviewer" (review is the code-review family; this prices cost, not correctness)_

**Dispatch prose**: the text a command sends to a subagent, as distinct from that subagent's own body. Both reach the model in one prompt, and the dispatch is the later, more specific instruction, so it wins a conflict between them. A behaviour contract stated in an agent body therefore also has to hold in every dispatch that reaches it, which is why a drift row pins both halves rather than the body alone (ADR 0035).
_Avoid: "the prompt" (ambiguous between the two halves)_
