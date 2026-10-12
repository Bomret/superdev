# Glossary: superdev domain language

## Core concepts

**Epic**: the slice-store container for a multi-slice feature. A single issue that groups all the feature's slices and holds the source text for the global DoD. An epic is optional. A single-slice feature has no epic, and that slice's `acceptance` becomes the DoD directly.
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

**Range base**: the commit a scope's own range starts from: the newer of `merge-base(<base branch>, <scope branch>)` and the remote base tip the base step recorded in the ledger, when that tip is an ancestor of the scope branch. `scope.js base resolve` computes it, and `references/scope-mode.md`'s `## The scope's range base` states the rule.
_Avoid: "merge base" (git's own term for one of the two candidates), "base commit"_

**Numbering collision**: an ADR number in one ADR directory, or an invariant id, that a scope branch adds and the base branch already holds. It is found by comparing numbers, whether or not git reports a conflict. The base step moves the scope's number, and `/superdev:ship` stops on one (ADR 0126).
_Avoid: "duplicate ADR" (what a collision becomes once it lands), "number conflict" (a git conflict is neither required nor sufficient)_

**Scope anchor**: a feature's root, the single record — the epic issue, or that feature's lone slice issue — that carries its scope-level status signal for a run. How a given store expresses this is stated in that store's own `## Scope anchor` section, which specialises `plan-contract.md` → *Scope anchor*, never assumed by a command (ADR 0017).
_Avoid: "epic" (only an epic-bearing feature has one, and the anchor role also falls to a lone slice)_

**Release**: the human agreement that a written plan may be built, carried as a durable signal on the scope anchor. Its consumers are `/plan`, which asks which one it is doing, `/implement`, which asks for confirmation before building an unreleased feature, and `/backlog`, which groups an anchor carrying no release signal as `unreleased`. How a given store expresses it is stated in that store's own `## Release` section, which specialises `plan-contract.md` → *Release* (ADR 0034).
_Avoid: "ready" (that is the `todo` lifecycle state, consumed the moment work starts), "approved" (unused elsewhere)_

**Run root**: the part of `.superdev/scopes/<scope>/` that stays in the repository's main working tree, at both tiers: `dod.md`, `ledger.md`, `run.lock`, and on the full tier `interfaces.md` (the cross-slice interface record). `scope.js root <scope>` resolves its absolute path from any cwd — the invoking checkout, a scopetree, or a slicetree of the same repository (ADR 0080). Never moves into a scopetree or slicetree, so it survives their removal as the post-mortem trail and lets `/status` enumerate runs without touching either.
_Avoid: "run directory", "scope dir" (too generic, because this is the main-worktree-resident subset, not the whole `.superdev/scopes/<scope>/` namespace)_

**Definition of Done (DoD)**: the checkable acceptance criteria for the whole feature, sourced from the epic if one exists, or from the lone slice's `acceptance` if not. `.superdev/scopes/<scope>/dod.md` is the concrete verification plan that gates the final-reviewer and PR. A controller ticks it while the run works, from an implementer's report (`references/dod-ticks.md`, ADR 0091).
_Avoid: "requirements", "specification", "checklist" (DoD is the integrated checklist)_

**Verification ceiling**: the bound on what a chain surface may do to verify a Definition-of-Done criterion. Verification observes, and changes no system outside the repository. `references/scope-mode.md` states it once, and every surface that verifies a criterion carries it, each taking the action its own role allows: `implementer` gets no increment for a criterion needing a deploy, a migration, or any other outward-facing change, and reports it as needing verification after merge; `final-reviewer` reports such a criterion as unverifiable on the branch, needing verification after merge. The prose that dispatches `implementer` and `final-reviewer` carries the same clause (ADR 0084, INV-0006). `/superdev:submit-pr` verifies nothing: it copies a criterion review or document already left unticked with a `ceiling:` note into the pull request as a post-merge checklist (ADR 0091). `/superdev:verify-ship` verifies after the merge: it observes the deployed system read-only, and runs no deploy target's command (ADR 0106).
_Avoid: "ceiling note" (that is `final-reviewer`'s advisory observation about shallow work, an unrelated term), "read-only" (a verification may write inside the repository), "dry run" (that names a mode of the outward-facing action this bound forbids outright)_

**Append mode**: re-running `/superdev:plan` on a feature that already has slices, which creates only the new records and never edits, closes, or renumbers a merged one (ADR 0004). It amends the epic's Definition of Done in place, so it is available only at `planned`, before any slice has run. A run root from `implementing` through `documented`, and a feature whose anchor has shipped, both refuse. Amending in place there would mix criteria verified against a merged pull request with criteria nobody has verified (ADR 0083, INV-0004). Follow-up work on any of those is a new feature, tied back through the anchor dependency.

**Ledger**: the per-scope recovery map. It tracks the run's stage, the **Step** a command has started, the scope branch, each slice's status (todo, then in-progress, then in-review, then merged), its commit range when merged, and the mapping between slice id and issue key. Run init writes the branch as the ledger's `**Branch:**` line once, because a slug alone never names the branch. `.superdev/scopes/<scope>/ledger.md` is the authoritative state during a run, and after a compaction or a resume.
_Avoid: "log", "status file", "tracker"_

**Published snapshot**: the copy of a run's ledger that the scope anchor carries, written as a `## Run state` section after any ledger write the snapshot would show. The ledger stays authoritative and the snapshot is a mirror, so a run whose publish fails is unaffected. It is what lets a run's record outlive `scope-prune`'s reap, a run resume on another machine, and a run's progress be read without a terminal (ADR 0042). Where it lives on a given backend is stated in that store's own `## Run state` section, which specialises `plan-contract.md` → *Run state*.
_Avoid: "remote ledger" (it carries no authority over control flow), "sync", "backup"_

**Adopt**: rebuilding a run root from the anchor's published snapshot, where no local ledger exists. Run init adopts a snapshot whose stage is neither `shipped` nor `closed`, writes `dod.md` from the anchor as it does for any run, and reports the run kind `resumed`. A command that needs a `shipped` original's run root adopts a `shipped` snapshot through `scope.js adopt --shipped`, which refuses every other stage (`scope-mode.md`'s `## Adopting a shipped original`, ADR 0124). `scope.js adopt` reads a whole anchor body and extracts the section itself (ADR 0042).
_Avoid: "restore", "pull", "import", "clone"_

**Stage**: how far a scope has moved through the chain (`/implement`, then `/review`, then `/document`, then `/submit-pr`) and past it, recorded as the ledger's `**Stage:**` line and naming the last completed step: `planned`, `implementing`, `merged`, `reviewed`, `documented` (or `documented-unreviewed` when `/document` ran before `/review` did), `submitted`, `shipped`, `closed`. `planned` is the one stage that precedes the chain rather than naming a step within it: `/superdev:plan` wrote the ledger, cut the scope branch and scopetree, and no slice has run yet (ADR 0079) — `/superdev:implement`'s run init moves the stage forward out of it, and no later write ever moves it back. `submitted` means `/superdev:submit-pr` opened the pull request, which is where the chain stops, attended or unattended. `shipped` means the pull request is merged: `/superdev:ship` merged it, or adopted a merge someone made by hand (ADR 0096). The anchor stays open at `shipped` until `/superdev:wrap-up`, and `/superdev:verify-ship` first settles any criterion only a deployed system can show (ADR 0116). `closed` is terminal: `/superdev:wrap-up` closed the anchor and removed the run's scaffolding (ADR 0106). A ledger an older version left at `shipped` records only an opened pull request, and `/superdev:ship` reads such a run from the host. Distinct from a slice's status, which tracks one slice through the DAG (ADR 0013), and from the **Step**, which names a step started and not yet completed.
**Step**: the chain step a scope has started and not yet completed, recorded as the ledger's `**Step:**` line: `plan`, `implement`, `review`, `document`, `submit`, `ship`, `verify-ship`, or `wrap-up`. The command writes it as the step starts, and each write is traced, also when the step already stands (ADR 0147). A stage write clears it, and a step that completes with no stage write clears it itself, so a step that stops keeps it and records the stop with `step block`, a trace line that leaves the ledger unchanged (ADR 0147). A slice's own step is its status. Every invocation of a chain command writes its step, so each `/superdev:review` invocation writes one, which marks the start of its **3-strike fix loop** (ADR 0140). _Avoid_: phase, current stage.
_Avoid: "phase" (that names a step within a playbook's procedure, as in run init or run handoff), "state", "step"_

**Degraded pass**: a step of the chain that did not get the assurance the chain promises: a dispatch the permission classifier denied, or a pass that could not reach what it needed. What each command does about one, attended and unattended, and the `**Degraded:**` ledger entry that carries it to `/superdev:submit-pr` and `/superdev:status`, live in `references/scope-mode.md`'s `## Degraded passes` section (ADR 0018). A denied **verification dispatch** stops an unattended run only where the controller authored what that pass verifies, and the entry quotes the classifier's refusal (ADR 0039). An unattended run also stops at the cap `references/scope-mode.md`'s `## Degraded passes` section states, whoever authored the work. The count comes from its own ledger's `denied: ` bullets, so the stop stays inside superdev rather than reaching the platform's own three-denial kill (ADR 0041). A **denial reset** returns that budget once a human has addressed the cause: it counts from the last reset marker, so every recorded denial survives and the pull request shows the reset and its reason (ADR 0044).
_Avoid: "failure" (the code under review did not fail. The chain's own assurance came up short, and an **Unresolved defect** is that other thing), "warning" (too generic)_

**Unresolved defect**: a defect the run found in the code and left standing, recorded as the ledger's `**Unresolved:**` line and written only where the run gives up. A defect found and then fixed leaves no trace. `references/scope-mode.md`'s `## Unresolved defects` section owns the record and what `/superdev:submit-pr` and `/superdev:status` do with it (ADR 0026). Distinct from a **Degraded pass**, which says how much of the chain ran rather than whether the branch is sound.
_Avoid: "degraded pass" (that names the chain's shortfall, not the code's), "blocked" (a blocked slice carries its own status in the ledger's slice table)_

**Scope checkout**: the working tree holding the scope branch, which every command after `/implement` finds from disk. It is the scopetree, `.superdev/scopes/<scope>/scopetree`, at both tiers (ADR 0045); the invoking checkout is never switched onto the scope branch. Where a chained command's fix commits and documentation commits land.
_Avoid: "the checkout" unqualified (the invoking checkout is a different thing)_

**Containment**: the property that base already holds a scope branch's work, so merging that branch into base would change nothing. It is what every surface asking "has this branch reached base" actually means, and it is tested on content — `git merge-tree --write-tree <base> <branch>` yielding base's own tree — never on ancestry, which a squash-merge destroys by rewriting the branch's commits (ADR 0053). A not-contained verdict against a local base is provisional: the test fetches the base branch from the remote and retests against `FETCH_HEAD`, so a squash-merge the clone has not pulled reads contained (ADR 0065). Where that comparison conflicts — a base that edits the branch's files after taking its work — a second tier asks the neighbouring question, whether base's history took the patch: the patch id of the branch's cumulative diff from the fork point, looked for among the commits base gained since (ADR 0082). Every path that cannot answer answers not contained (INV-0003). `references/scope-mode.md` states the test once, `plugin/scripts/scope.js` implements it, and `hooks/scope-prune.js` calls that implementation with `HEAD` as its base and no fetch. Contained and **gone** are the two ways a scope's work is finished with.
_Avoid: "merged" (the host's action, which containment is the local evidence for), "ancestry", "reachable" (the proxy this replaces)_

**Run kind**: which of two things a `/superdev:implement` run is, computed by run init and read by both execution playbooks to decide what the branch step does. **`fresh`** means a ledger this run wrote, including one written after rotating a closed ledger aside for a new feature reusing a retired label: cut the scope branch from base, or, where the name is taken because a squash-merging host left the branch standing, reuse it when base already contains it and stop when it does not (ADR 0072, ADR 0083). **`resumed`** means a live ledger — held locally, or adopted from the anchor's published snapshot — whose branch holds unmerged slice work. It cuts nothing: it fetches the branch from the remote first where the checkout does not hold it. It then reattaches the scopetree to it, recreating that scopetree where it is absent (ADR 0042, ADR 0045). One determination, made once, read in three places (ADR 0028).
_Avoid: "re-run" (covers a fresh run over a retired label and a resumed run alike, and they take opposite branch actions), "re-cut" (a run reusing a contained branch re-points it rather than cutting a new one)_

**Scope mode**: the shared rule `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, and `/superdev:ship` each read from `references/scope-mode.md` at runtime: what makes a range or scope slug a live run, how to find the scope checkout from disk for either tier, the refresh-not-create rule for the run lock, and the never-moves-backwards rule for the ledger's stage (ADR 0013). Each command keeps only what is specific to it beyond the shared rule.
_Avoid: "chain mode" (the chain is the four commands. Scope mode is the rule review, document, submit-pr, and ship all read, ship included despite sitting outside the chain), "review mode" (that names `/superdev:review`'s own split between an ad-hoc range and a scope, one level down)_

**Candidate set**: what a command invoked with no argument chooses among, named by that command and resolved through the one cascade `references/scope-mode.md`'s `## Resolving an empty argument` section states — exactly one candidate is used, several are listed with their stage and put to the operator, and none is reported with what exists instead (ADR 0078). Each command's own document names its set. `/superdev:review` puts one local rule ahead of the cascade, because a dirty working tree is a subject of its own. A command whose empty-argument resolution lives in a script refuses and lists rather than asking, since a script cannot put a question — `plugin/scripts/publish-kb.js` is the one.
_Avoid: "default" (the cascade picks nothing when the set is not a singleton, where a default would), "the only run" (names the singleton branch, not the set every branch reads)_

**Slicetree**: an isolated filesystem checkout used to keep one slice's branch work off every other slice and off the invoking checkout. The full tier gives each slice its own (`.superdev/scopes/<scope>/slicetrees/<id>/`, plural), merged into the shared **Scopetree** (defined below) once the slice is reviewed and green. The lite tier has none: it implements every slice inline in the single scopetree instead. Both nest under the git-ignored `.superdev/scopes/<scope>/`.
_Avoid: "worktree" unqualified (ambiguous with git's own generic term and with a scopetree), "branch", "workspace", "checkout"_

**Invoking checkout**: the working tree the user runs superdev from (their clone, usually on main). Neither tier's execution playbook switches it onto the scope branch (ADR 0045): each cuts or reuses the scope branch into the scopetree instead, running the `git worktree add`/`remove` calls themselves from here, exactly as any such call does.
_Avoid: "main checkout", "user branch", "current tree"_

**Scopetree**: the dedicated checkout a run cuts its scope branch into, at both tiers (`.superdev/scopes/<scope>/scopetree/`, ADR 0045) — a lite run implements inline there directly, a full run merges each slice into it from that slice's own slicetree. Isolates the run from the invoking checkout and from other sessions. The run root (the DoD and the ledger) stays in the invoking checkout, not here, so it survives scopetree removal.
_Avoid: "worktree" unqualified, "scratch checkout", "session workspace"_

**Run lock**: the `.superdev/scopes/<scope>/run.lock` file plus the `run-lock` hook that together enforce same-scope mutual exclusion at the scope branch's own cut, at both tiers (ADR 0045). Its mtime marks the run as live, so every command in the chain touches it and the lock spans the whole run rather than one invocation. A stale lock is reclaimable as a crash resume. `/superdev:implement` entering a run root it did not itself create in this invocation reads the ledger's stage alongside the lock's mtime before its first write into that run, because the hook itself guards only the cut (`git worktree add`), never an entry into a scopetree that already exists: any stage other than `planned`, with a lock under an hour old, is a **live implement run** (below), which stops that one caller rather than letting it join silently (INV-0013, ADR 0090). `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, and `/superdev:ship`'s own ordinary hand-off is not tested this way — each is the chain's single designed entry right after the previous command's own exit, not a case a second, independent invocation reaches — and `/superdev:plan` keeps its own separate, narrower check. The lock's content is freeform text — whatever a session chooses to write into it — and carries no identity contract of its own; a human reads it to judge self from another session where the check asks.
_Avoid: "lockfile" (that names a dependency-manifest file elsewhere), "mutex" (too implementation-generic), "heartbeat" (names the refresh mechanic, not the file), "session lock" (the lock marks the run as live, not any one session's claim to it)_

**Live implement run**: a run root whose ledger stage reads past `planned` and whose `run.lock` mtime is under an hour old — the `run-lock` hook's own staleness threshold, scoped to `/superdev:implement`'s own entry check alone (INV-0013) and never to `scope-mode.md`'s own `## A live scope run` (the range-resolution sense `/superdev:review` and `/superdev:document` use) or to any other sense of "live" already in this glossary. A `planned` stage with a fresh lock is not a live implement run: `/superdev:plan` writes that lock at its own cut, before any slice has been implemented, and a caller entering it proceeds as the ordinary hand-off to `/superdev:implement`. A lock that has gone stale while its run is still in progress falls outside this definition: staleness alone never re-admits a run to liveness, whatever its actual progress.
_Avoid: "live run" bare, unqualified (this glossary already uses it for `scope-mode.md`'s `## A live scope run`, the range-resolution sense `/superdev:review` and `/superdev:document` read — a different question, asked of different evidence), "active scope" (conflates with the ledger's own `**Stage:**` value, which this term reads alongside the lock rather than replaces), "locked" (the lock exists at every stage past cut; only a fresh one past `planned` makes the run live)_

**Progress log**: the per-slice running record of what happened: agent dispatches, reviews, fixes, and merge results. `.superdev/scopes/<scope>/reports/<id>/progress.md` is append-only, oldest-first, git-ignored. Exists so a human or a resumed controller can see what unfolded without re-reading slicetree state. It is also `slice-reviewer`'s after-blind-pass input and a re-review's record of earlier findings.
_Avoid: "log", "report", "transcript" (logs are broader, and this is slice-specific narrative)_

**Run trace**: the run's event record, `<run-root>/trace.log`, one line per event, each naming the slice it belongs to or `scope`. superdev's hooks and `scope.js` write it, and no agent does: it records file edits classified as test or implementation, test runs with their outcome and commit, fail-to-pass outcomes, reverts and restores, subagent dispatches and their ends, each end with its **Dispatch outcome**, each full-tier slice review's **Review verdict**, each scope review's **Final-review verdict**, and ledger writes, the **Step** among them. Reviewers read it as evidence of the order work happened in, where the **Progress log** is the agents' own account (ADR 0117).
**Dispatch outcome**: how a subagent dispatch ended, as its `dispatch-end` line in the **Run trace** records it: `completed`, `failed`, `denied`, `stopped`, `unknown`, or `session-end`. `unknown` means no event named the end, so the run-trace hook ended the dispatch at the main session's next turn boundary. `session-end` means the session ended while the dispatch ran. Each run of a dispatch has exactly one: a `SendMessage` that resumes a finished subagent starts a new run of its dispatch, and that run gets its own end (ADR 0140). _Avoid_: dispatch status, exit status.
_Avoid: "TDD log", "increment trace", "run log", "transcript" (the transcript is Claude Code's own record, not superdev's)_

**Green-gate**: the hook that runs the test suite on a merge the controller landed, `hooks/green-gate.js`. A **landed merge** is one whose tree's top `HEAD` reflog entry reads `merge …` or `commit (merge)…`: a completed `git merge`, a fast-forward, or a commit that concludes a conflicted merge. The gate runs whether the Bash call that landed it succeeded or failed, in the merge's own tree, and reports a red suite to the controller, which fixes or reverts before the run continues. It cannot undo the merge (ADR 0047, ADR 0123).
_Avoid: "merge blocker" (the merge has already run when the gate fires)_

**Review verdict**: the outcome of one full-tier `slice-reviewer` dispatch as the **Run trace** records it: a `verdict` line carrying the specification verdict (pass, fail, or unknown), the quality verdict (approved, changes-needed, or unknown), the **Review cycle**, and the implementer dispatch the review covered. The run-trace hook writes it from the reviewer's own report, and no agent does. A dispatch that ends with no report the hook can read has none, which a reader treats as a verdict not recorded (ADR 0136, ADR 0140).
_Avoid: "review result" (it also names the report text, which the line never carries)_

**Review cycle**: the position of one slice review among the slice's reviews: 0 for the first, and one more for each earlier `slice-reviewer` dispatch on the same slice that completed before it was dispatched (ADR 0140); a resumed dispatch counts once, however many runs it ended. A review that was interrupted and retried keeps its number. Cycle n > 0 is the re-review after the n-th fix of the **3-strike fix loop** (ADR 0136). Cycle 0 reads the whole slice, and cycle n > 0 reads the n-th fix cycle's range (ADR 0137).
**Final-review verdict**: the outcome of one `final-reviewer` dispatch in a scope review, as the **Run trace** records it: a `final-verdict` line carrying the report's ready-to-merge answer (yes, no, with-fixes, or unknown) and the review's cycle in its **3-strike fix loop**. The cycle is 0 for the review that opens the loop, and one more for each `final-reviewer` dispatch that completed inside the loop's open **Step** (from its `review` line to the next step line, which a stage write that removes the step also writes) and before this one was dispatched; a resumed dispatch counts once. The run-trace hook writes it from the reviewer's own report, and no agent does (ADR 0140). _Avoid_: scope verdict.

**Observed run**: a test run that `scope.js test` executes itself, so the **Run trace** records the command's own exit status as its outcome, whatever pipe, background, or wrapper the caller puts around the call. A run the hook infers from a Bash command's shape is not one (ADR 0127).
_Avoid: "wrapped run", "recorded run" (every run line is recorded), "traced run"_

**Fail-to-pass run**: the two test runs that show whether a change's tests discriminate. The tests the change's paths select run against the changed code, where they must pass, and again with the change's files outside its test files restored to their state before the change and with every tracked change, untracked file, and ignored file the first run left cleared, where they must fail. The outcome is `fail-to-pass` when both hold, `pass-to-pass` when the tests also pass before the change, and `unknown` when they do not pass against the changed code, or when the run before the change is killed at its bound, ten times the first run's duration or 10 seconds, whichever is larger, or ended by a signal, or when a run's command cannot start. The **Run trace** records the outcome.
_Avoid: "replay" (ADR 0118 uses it for re-running reviewers on earlier slices), "mutation test" (nothing is mutated; only the code before the change comes back), "red check" (the invariant register's `Check:` field owns "check")_

**Warrant**: the justification a piece of work carries. It scales both cost (which model a dispatch uses) and rigor (which review gates run). Derived from a slice's test-applicability and complexity, never a plan field. A `behavior` slice warrants more than a `mechanical` one. A hook blocks any dispatch that omits an explicit model, so cost stays warrant-scaled.
_Avoid: "priority", "estimate", "weight"_

**Intent**: a rough idea sharpened into something plan-ready: the problem, a few candidate directions, the MLP, the open questions, the rejected directions, and the load-bearing commitments. Output of `/brainstorm`, input to `/plan`. A brainstorm intent is a draft (`status: draft`) while its interview runs and ready (`status: ready`) after the handoff; `/plan` never seeds from a draft (ADR 0112).
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

**Unattended run**: one chain-command invocation carrying the unattended token. Nobody watches it, so it takes its standing answers and blocks where none is written. It ends at `/superdev:submit-pr` at the latest, because `/superdev:ship` carries no unattended mode (ADR 0096). superdev ships no driver that starts one: an operator or an external loop passes the token (ADR 0108).
_Avoid: "unattended mode" (there is no mode, only an argument on one invocation), "batch", "autopilot"_

**Unattended token**: the `--unattended` argument a chain-command invocation carries, which tells that command to take its standing answers instead of asking. An invocation property, never written to the run root, so it cannot outlive the run that passed it (ADR 0016).
_Avoid: "unattended flag" (it is an argument token, not a config setting)_

**Standing answer**: what a command does at a stop where it would otherwise ask the maintainer, when the unattended token is present. Each is written at the stop it governs. A stop with none written blocks the scope anchor, which is the catch-all that keeps an unwritten question from stalling a run until morning.
_Avoid: "default" (a default applies always, and a standing answer applies only unattended), "policy", "auto-answer"_

**Anchor dependency**: a recorded relation between two scope anchors, saying the second feature cannot be built until the first's anchor is closed. It is satisfied once the anchor it names is closed, or no such anchor exists — no ledger stage satisfies it (ADR 0106). `/plan` records one when its interview named a prerequisite feature; `/backlog` reads it, and groups an anchor whose dependency is unsatisfied as `waiting`, naming the anchor it waits on. How a given store records it is stated in that store's own `## Scope anchor` section, which specialises `plan-contract.md` → *Scope anchor* (ADR 0040, ADR 0108).
_Avoid: "depends-on" (that is the slice-level edge inside one plan, which `/implement` reads), "blocked anchor" (`blocked` is a label a human clears, where a waiting anchor clears itself)_

**Repair**: a `fix` feature planned through `/superdev:plan`'s repair choice for a `shipped` scope whose Definition of Done holds a line `/superdev:verify-ship` observed false (a `not met:` note carrying its repair citation). It has its own scope anchor, label, branch, and run, and its own Definition of Done. Its anchor carries a **Repairs line**, `**Repairs:** #<original anchor>`, the only record linking it to the original. Only the original's `/superdev:verify-ship` settles the original's line (ADR 0124).
_Avoid: "repair run" (a repair is a whole feature, not a second run under the original anchor), "fix-up", "follow-up" (that is a feature carrying an **Anchor dependency**)_

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

**Release-risk criterion**: a Definition-of-Done criterion led by `Release risk:` that answers one of the release-risk categories for a feature — rollback path, deploy-window data compatibility, consumer compatibility, production visibility — as a requirement the feature meets, or one `Release risk: none` line naming each category that does not apply, with its reason. Every plan carries them, on every change type, and `/superdev:plan` writes them after the deploy question; they ride `dod.md` to the final-reviewer like any other criterion (ADR 0133).
_Avoid: "risk assessment" (a document, where this is a checklist line), "launch checklist" (a gate superdev does not run), "rollback criterion" alone (one category, not the term)_

**Criterion tag**: the suffix on an epic's Definition-of-Done line naming the slice ids that deliver the criterion, or `scope` when no single slice does. It decides which criteria a slice implementer's report can tick; the report decides whether they are ticked. A single-slice feature carries none (ADR 0091).
_Avoid: "mapping" alone (the tag is the written form), "owner" (a slice delivers a criterion, it does not own it)_

**Tick**: a controller's judgment on one Definition-of-Done line, on the scope anchor and in `dod.md`: checked with its evidence as the note, or unchecked with the reason it is not met, that only a deploy can verify it, or that an attended operator accepted it as unmet (ADR 0095). A line nobody has judged yet carries no note; a bare tick is invalid (INV-0014). Only a controller writes one (INV-0015).
_Avoid: "check off", "verify" (verification is what earns a tick, not the tick itself)_

**Suite record**: the ledger's record of the last full-suite run — its result, the commit it ran on, and its kind: `whole` for a run of the **whole-repo command**, or no kind for a run of the full command. A later step reuses a green record whose commit is the scope branch's current tip instead of running the suite again (INV-0017). It also reuses a green record on an ancestor of the tip when every path changed since is a Markdown file, no test path, and not `docs/agents/verification.md`, the latest test-command run at the tip passed on a clean tree, and no full or whole run, nor any run of a test file named directly, at the tip failed (INV-0017 states the full rule), so a doc pass's commits need no second full-suite run (ADR 0128). A result of `none` is never reusable: it records no test command configured, with kind `whole` a whole-repo run that was killed or never started (INV-0009), or, with no kind, a review's invalidation of a submitted tip, which `/superdev:ship` refuses on. A step that needs a whole-repo run reuses only a record of kind `whole`; any other step reuses either kind (ADR 0105).
_Avoid: "suite status", "last run" (the record names its commit, which is what makes it reusable)_

**Pinned merge**: `/superdev:ship`'s merge of a scope's pull request through the host's merge API, bound to the one head a green full-suite run covers — a whole-repo run, in a repository that configures a **whole-repo command** — the host refuses it when the pull request's head has moved since. It is the one write superdev makes to the base branch (INV-0001), and it never forces past branch protection or a required approval (INV-0092, ADR 0096).
_Avoid: "auto-merge" (that names a host feature that merges once checks pass, with no pinned head), "fast-forward" (a pinned merge squashes)_

**Test-applicability**: the class of changes a slice carries. `behavior` is new functionality, and needs TDD plus a per-slice reviewer plus a simplicity-reviewer. `mechanical` is a move, a rename, or a format change, uses the existing suite as the net, and skips per-slice reviews. `docs` is documentation-only, and skips reviews.
_Avoid: "slice type", "category"_

**Focused test command**: the **second** fenced block of `docs/agents/verification.md`, required configuration in every repository with a suite (ADR 0085), the command every step inside the loop runs and the documentation step runs over its range, in place of the full command the first block holds. What defines it is that it **costs less than the full suite**: a `{paths}` form, a fixed fast subset, and a self-detecting runner flag all qualify. Carrying the token `{paths}` makes the caller substitute the **changed-path set** below, shell-quoted, and requires a runner that maps source files to the tests covering them — a form `/superdev:setup` derives with that runner's pass-with-no-tests flag, so a change set holding no tests reports green rather than red. Carrying none takes one of two shapes. A **fixed fast subset** (`pytest tests/unit`) names its own tests and always collects them. A **self-detecting runner flag** (`vitest --changed`, `jest -o`) computes the change set itself and carries that runner's own pass-with-no-tests flag, for the same reason a `{paths}` form does. A runner that cannot narrow records the full command again in this fence, with the reason recorded as prose beside it. A repository carrying only one fenced block has never answered this configuration: a prose caller stops, reports the missing configuration, and names `/superdev:setup`, running no command — `/superdev:plan` and `/superdev:implement` already auto-invoke it. `hooks/green-gate.js` is the one exception, running the full command it found and emitting a notice instead of stopping, because a hook cannot ask an operator. A `verification.md` carrying zero fenced blocks is a different case, not this one: `hooks/green-gate.js` reads it exactly as it reads an absent file, no gate at all. `references/test-selection.md` owns the contract and every consumer reads it at runtime (ADR 0025, ADR 0074, ADR 0085, INV-0007).
_Avoid: "partial test command" (it is cheaper, not incomplete), "incremental tests" (that names a runner's own caching), "narrowed command" (path scoping is one of its forms, not its definition)_

**Changed-path set**: the paths a caller substitutes for `{paths}` in the focused test command, those changed in the range that caller judges. `references/test-selection.md` owns which range each caller uses, and why an **empty** set runs the full command where the focused command consumes `{paths}` — a substitution over no paths proves nothing — while a focused command carrying no such token runs unaffected by that computation. A fixed fast subset is unaffected because it names its own tests regardless. A self-detecting runner flag is unaffected because it derives the change set itself and relies on its own pass-with-no-tests flag rather than this fallback (ADR 0025, ADR 0074). A test-first step's failing-test or passing-test run substitutes the test files it works on instead, and the last run before the implementer reports, or before the lite tier commits a slice, substitutes the whole set (ADR 0139).
_Avoid: "diff" (that names the content, not the path list), "touched files" (`Touch map` already claims that phrasing for a different artifact)_

**Affected form**: a full command that runs the whole suite of every project the change against the base branch reaches, the changed projects and every project depending on them, as the repository's own dependency-graph tool computes it using nx, turborepo, pnpm, or dotnet-affected. It exits green when the change reaches no project. It selects projects, never tests: a **self-detecting runner flag** selects tests by changed file, and belongs to the focused command (ADR 0105, INV-0105).
_Avoid: "changed suites" (the dependents are what make it safe), "partial full command" (every selected project runs its whole suite), "path-scoped full command" (a path prefix misses a shared library's consumers)_

**Whole-repo command**: the optional `## Whole-repo command` section of `docs/agents/verification.md`, whose command runs every project's suite. A repository configures one only when its full command is an **affected form**. `/superdev:submit-pr` runs it before opening the pull request, `/superdev:ship` runs it on a tip that carries no green whole-repo result (refusing instead while a review invalidation stands, INV-0092), and a scope review runs it in place of the full command while the **suite record** reads red of kind `whole`. It holds its command in a backtick span, never a fenced block, for the same reason the **timing command** does (ADR 0105).
_Avoid: "full-full command", "third fence" (it is not a fenced block), "CI command" (superdev runs it, not a CI system)_

**Timing command**: the optional `## Timing command` section of `docs/agents/verification.md`, whose command reports what the suite's tests cost — per-test durations where the runner gives them, total wall clock otherwise. It holds its command in a backtick span, never a fenced block: `hooks/green-gate.js` reads fenced blocks and takes the first two as the full and focused commands, so a fenced third would run as the focused suite in a repository that has not yet recorded a focused command. A **test audit** is its only reader, and an absent section makes that audit `unmeasured` rather than failing it (ADR 0066).
_Avoid: "benchmark command" (it prices an existing suite, it does not measure throughput), "profiling command" (that names a per-line attribution nothing here asks for), "third block" (it is not a fenced block, which is the whole point)_

**No verdict**: what a spawn whose own bound expired carries, whether or not its kill succeeded. `spawnSync` reports it as a `status` of `null` beside a `signal`, and the distinction is the whole of it: a process that reached its timeout decided nothing. Neither a gate nor an assertion about behaviour may stand on it, whether the kill that followed succeeded or not. `hooks/green-gate.js` reads it on the suite it runs after a controller merge, and a test harness reads it on every bounded spawn of its own. It is also the discriminator a duration assertion states instead of a clock — `signal` naming the kill is the evidence a bound held, where an elapsed value only ever reports the scheduler too (ADR 0086, INV-0009).
_Avoid: "timeout" (that names the bound, not the result of hitting it), "failure" (a verdict of fail is a decision this is the absence of), "hang" (the process may have been perfectly healthy and merely slow), "spawn failure" (that is the separate term below, and the two carry different answers)_

**Spawn failure**: what a process that never started carries. `spawnSync` and `child_process.spawn` report it as an error with no `signal`, and a code such as `ENOENT` (a missing binary or a wrong path) or `EMFILE` (a system out of file descriptors). It is not a **No verdict**: the gate never ran, so there is nothing it declined to decide, and the absence is evidence about the machine rather than about the code under the gate. INV-0009 therefore does not govern it, and `hooks/green-gate.js` answers it with its own reason: it blocks, because it fires only on a merge and a tree that cannot run its suite is a defect in the thing being gated (ADR 0087).
_Avoid: "no verdict" (the entry above, and the distinction is the whole point), "crash" (the process never ran to crash), "error" alone (too generic to carry the boundary)_

## Controller discipline

**Controller**: the agent driving a plan's slices to merge (you). You dispatch implementers and reviewers, you merge, and you integrate serially. You never implement or merge inside a subagent.
_Avoid: "orchestrator", "manager"_

**Depends-on**: the set of slice IDs that must merge before a slice can start (a DAG edge). A slice depends on another only if it cannot be green without it. Too-eager dependencies serialize work that could run in parallel.
_Avoid: "blocked by", "dependency" (too generic, where "depends-on" is the explicit, load-bearing relationship). GitHub's **`blocked_by`** is the literal name of the native relation the GitHub slice store uses to record this same edge (ADR 0011), not a looser competing term_

## Review discipline

**Final-reviewer**: the whole-scope review gate after all slices are merged. It checks the integrated diff against the global DoD. It is read-only (`Read`, `Grep`, and `Bash`, with no `Edit`), so its findings drive the dispatching command's 3-strike fix loop. It never applies a fix itself. `/superdev:plan` also dispatches it in derive mode, before slicing, to write **Derived criteria** against a drafted DoD.
_Avoid: "final review", "scope review" (the role and the agent, not just the step)_

**3-strike fix loop**: the fix cycles a final review or a per-slice review drives. Each cycle dispatches one fix carrying every listed finding, Minors included, and repeats until the review lists none. A cycle dispatches no fix only when the controller answers a Missing fail-to-pass run finding with its own fail-to-pass run and no fix goes out before the next re-review. That run and that re-review then count as one cycle. When a fix goes out before the same re-review, the run, the fix, and the re-review count together as one cycle (ADR 0134). A fix for a finding that names failing behaviour opens with a RED test. The cap is 3 cycles. At the cap, a remaining Critical or Important finding means a wrong cut (hidden dependency, boundary too big), not a buggy slice: move it to blocked and escalate. A remainder of only Minor findings advances instead (INV-0094). A remainder whose only Critical or Important findings are Missing RED, Pass-to-pass, or Missing fail-to-pass run, in any mix, advances too, and the run's final report names each with its slice. Any of them beside a Critical or Important finding of another kind still blocks (ADR 0125, ADR 0134).
_Avoid: "retry limit", "attempt count" (the 3 strikes are cycles, not attempts)_

**Sibling surface**: another place in a checkout that states the same rule or behaviour as the text a fix changes, such as a reference, a glossary entry, an ADR, a code comment, or a test. A fix that leaves one stating the old rule is incomplete. The `AGENTS.md` hierarchy and the knowledge base are exceptions: a fix reports them and the doc pass edits them. `CHANGELOG.md` is release history and is no sibling surface.
_Avoid: "sweep" (that names `/superdev:sweep`'s whole-tree pass), "duplicate" (a sibling surface can be a deliberate restatement)_

**Mechanical finding**: a review finding, or a failure in a red suite's output, whose fix changes no stated rule or behaviour, such as a rename, a rewrap, or a typo. A fix that changes a rule or behaviour any surface states needs the sibling-surface search, so its finding is not mechanical. A fix dispatch runs on `haiku` only when every finding in its list is mechanical, and any other finding keeps the whole dispatch on the site's model (ADR 0118). A mechanical *slice* is a different term: a move, a rename, or a format change (see **Test-applicability**).
_Avoid: "trivial" (a one-line fix can change a rule), "small" (size is not the test)_

**Judge discipline**: the verification principle every review agent carries verbatim. Verify the artifact and the behaviour yourself, and never defer to the implementer's or controller's narrative of what was done. Length or an elaborate structure is not its own evidence of correctness or of warranted complexity. Reject a completion claim resting only on proxy counts (coverage percentage, line count, lint score), and confirm the observable behaviour instead (ADR 0002).
_Avoid: "verification discipline" (too generic, because this means not trusting the builder's account of its own work)_

**Derived criteria**: the acceptance criteria `final-reviewer` writes itself, from the feature's intent alone, before it reads the Definition of Done or the diff. Diffing them against the DoD surfaces criteria the plan never wrote. It needs a DoD written by someone else to diff against, so the dispatch hands over the DoD's **path** rather than its text, and the reviewer opens it after its own list exists (ADR 0020). Two surfaces dispatch it: `/superdev:review` in scope mode, and `/superdev:plan` before slicing, where every gap becomes a DoD criterion, a fold into an existing criterion, or a named non-goal (INV-0096).
_Avoid: "independent criteria", "own criteria" (the point is where they come from, not whose they are)_

**Failure-mode class**: a family of inputs or states in the code a feature changes that fail the same
way, named once instead of case by case: every shell-word spelling that `eval` and `sh -c` accept, every
way a path can be spelled, every listing that can return less than every record. `/superdev:plan`'s derive
pass reads the changed code and names each class it finds, and the plan settles it as a criterion stated
as the class, a fold into an existing criterion, or a named non-goal. A later instance of a class the
Definition of Done names is in scope for the fix loop, never a **Deferred finding** (ADR 0146).
_Avoid: "edge case" (that names one instance, and the class is the point)_

**Blind pass**: the part of a full-tier slice review that settles a verdict from the slice's specification, its acceptance criteria, and its diff, before `slice-reviewer` opens the slice's **Progress log**. The log carries the implementer's account of its own work, so the dispatch hands over the log's **path** and never the implementer's report text. Reading the log afterwards can add a finding or raise one's severity, and never withdraws or downgrades one.
_Avoid: "first pass", "independent review" (the point is what the reviewer has not yet read, not how many passes it makes)_

**Ceiling note**: the single advisory observation `final-reviewer` may add when a scope met a Definition of Done criterion **shallowly**. The review found the criterion satisfied and the code correct, but the work stopped at the first thing that passed. It is admissible only against four gates: it names the criterion this review found satisfied, it names a concrete consequence, there is exactly one, and the review found nothing Critical or Important. It never gates a merge and never triggers the fix loop, exactly like an over-engineering finding (ADR 0020).
_Avoid: "quality note", "improvement suggestion", "nit" (a ceiling note describes correct code, so it is not a defect at any severity)_

**Standing code**: the subject of an ad-hoc `/superdev:review` when the path it was given exists on disk and its scoped diff is empty — the files under that path at `HEAD`, reviewed as they are rather than as a change. It is the fourth range shape, beside `BASE..HEAD`, a working-tree scope, and a path scope with a non-empty diff. `simplicity-reviewer` is skipped on it: its rubric reads a diff (ADR 0063).
_Avoid: "audit mode" (no flag selects it; an empty scoped diff is what resolves to it), "file review" (names the input, not what makes it a distinct shape)_

**Deferred finding**: a fix-loop finding whose remedy adds a capability the Definition of Done never
named. It starts no fix loop, holds no run stage, and is not an **Unresolved defect**. The scope review's
fix loop, or the full tier's per-slice loop, defers it. The scope review records it under its report's
`### Deferred to a plan` heading and hands it to `/superdev:plan`. The slice loop hands it to the controller,
which records it as a **Triage record** and a ledger bullet without a report heading.
It reaches several homes at once: a **Triage record** in the slice store, a `**Deferred:**` bullet in the
run's ledger carrying that record's reference, and the pull-request body `/superdev:submit-pr` copies the
bullet into. The triage record outlives the run root and the closed scope anchor regardless of whether
the scope ever ships (ADR 0035, 0046, 0110). A deferred finding re-enters the fix loop only when a later
review names a **Guard-rail remedy** for it. Once a re-review confirms that fix, the run resolves it: the
ledger bullet goes, the triage record closes only when its own body names this run's scope anchor and no
open scope anchor absorbs it (on any other record, and when a read of the record or of an Absorbs line fails or
is denied, the run comments with the fixing commit and leaves it open), and an open pull request's
deferred section is rebuilt (ADR 0121, ADR 0145).
_Avoid: "scope growth", "out-of-scope finding" (the point is the DoD boundary, not that the finding is
unwelcome or off-topic)_

**Guard-rail remedy**: a fix-loop remedy that extends what exists and adds no behaviour: a new test in an
existing suite, a new row in an existing drift contract table, or a prose fix that makes shipped text
agree with a rule the repository already states. It stays in the fix loop and is never a **Deferred
finding**. A new scanner, check family, hook, or script verb is not one (ADR 0097).
_Avoid: "small fix", "trivial remedy" (the line is the kind of change, not its size)_

**Plan-coverage gap**: a criterion `final-reviewer` derives from the intent that the code already
satisfies and the Definition of Done never named. It is reported as Minor. Its remedy is the
**Guard-rail remedy** that proves the behaviour, never a new `dod.md` line (ADR 0097).
_Avoid: "missing criterion" (the code is not missing anything; the plan is)_

**Observation**: a real defect a run meets that no slice of it covers, and that the scope did not cause —
a flaky test in untouched code, a failure the green-gate hook reports on a merge, a defect an implementer
reports alongside its own slice, a defect a `/superdev:plan` interview finds and places later. The
controller — or the plan, for that last one — writes it a **Triage record** the moment it meets one, and
that record is its only artifact: no ledger line, no pull-request heading. It is recorded, never judged,
so it carries no severity, holds no stage, and enters no fix loop (ADR 0088, INV-0010). Distinct from a
**Deferred finding**, which the scope review judged inside its own range and handed to `/superdev:plan`;
an observation was never in range to judge.
_Avoid: "out-of-range finding" (it is not a finding — nothing judged it)_

**Triage record**: the slice-store record a **Deferred finding** or an **Observation** gets — created by
the scope review's fix loop or the full tier's per-slice loop at the moment it defers, by the controller at
the moment it meets an observation, and by `/superdev:plan` at the moment its interview places a found
defect later. It is neither a slice nor a scope anchor, which is what keeps every run and every sweep from
selecting it as work to build. How a given store expresses it is stated in that store's own
`## Triage record` section, which specialises `plan-contract.md` → *Triage record* (ADR 0046). Every
writer reads the open records before it creates one: a record that plainly states the same defect gets a
comment carrying the new finding, and no second record is created (ADR 0145).
_Avoid: "draft issue" (no backend the plugin supports has a draft issue state outside GitHub's project
boards), "triage slice" (it has no spec, no acceptance, and no place in a DAG)_

**Absorbed triage record**: an open **Triage record** that `/superdev:plan`'s prior-art audit offered
and the operator chose to build in this scope. A Definition-of-Done criterion cites it by its reference,
written `(triage <reference>)`, and one criterion may cite several records of one class. The scope anchor's **Absorbs line**,
`**Absorbs:** #<n>[, #<n>]`, names every record the scope absorbed. `/superdev:backlog` shows it in its own
`absorbed` bucket while that anchor is open, and `/superdev:wrap-up` closes it once its citing criterion is
met, or once the operator chooses to close it when that criterion is accepted unmet (ADR 0144).
_Avoid: "folded record" ("fold" is the derive pass's word for merging a derived criterion into an existing
one), "planned record" (it stays a triage record, not a slice)_

**Untriaged item**: an open record in the slice store that superdev never wrote — it carries neither a
feature label nor the store's triage signal, so it is neither a **Scope anchor**, nor a slice, nor a
**Triage record**. It is work a human filed and no `/superdev:plan` interview has yet reached. How a given
store recognises and lists one is stated in that store's own `## Untriaged item` section. Only a human acts
on it: reading one is what turns it into a plan or closes it.
_Avoid: "unlabeled issue" (a human's own labels do not make an item triaged), "new issue" (age is not what defines it), "backlog item" (every row in a
**Backlog survey** is one of those)_

**Backlog survey**: the read-only report `/superdev:backlog` prints, grouping every open **Scope anchor**,
every **Triage record**, every **stranded run root**, and every **Untriaged item** in the slice store by the
action each one needs, and ending with one recommended move. A stranded run root is a run whose stage is
short of `shipped` and matches no open anchor. It ranks as the most expensive item in the table, where an
untriaged item ranks last: it is the furthest from finishing, and it is the one bucket the survey caps
rather than printing whole, since a store with real reporters holds more of them than the rest of the
table put together. It reads the store where
`/superdev:status` reads the runs' ledgers, and it shows an unreleased plan, an anchor nobody
decomposed, a triage record, and an untriaged item. A survey resolves an ambiguity toward showing the
row (ADR 0049). It writes nothing and sits outside the implement
chain.
_Avoid: "backlog sweep" (a **Sweep** reads a whole tree; the backlog survey reads the slice store
instead), "status" (that command reports runs from their ledgers, not the store)_

**Test audit**: the read-only whole-tree sweep `/superdev:review-tests` runs, pricing a suite that many scopes have grown. It measures where a **timing command** is configured, dispatches `test-auditor` over every test file in one pass, ranks its findings by cost, and hands the survivors to `/superdev:plan` as an intent, except under **Chained posture**. It reaches what a review cannot: a duration is invisible to reading, and a redundant pair has a second half outside any range. A dead or ignored test reports as a fact, and every remaining finding is a judgment the operator may reject before it survives. Unchained, its only writes are the intent and the one-line `.gitignore` entry that keeps `.superdev/` ignored when
absent; chained, it writes nothing at all. It sits outside the implement chain (ADR 0066).
_Avoid: "test review" (review is the code-review family, and this one neither resolves a range nor gates a merge), "suite audit" (`Audit` already names the doc loop's reader-first mode), "coverage audit" (it prices the tests that exist, and never asks for more)_

**Run profile**: the read-only account of where a scope run's wall-clock time went, which `/superdev:profile` prints from Claude Code's own session and subagent transcripts. It shows one row per **Phase segment**, repeated Bash commands grouped with their count and total, and one row per subagent dispatch. **Human wait** and **Idle** each always have their own row, apart from machine time. It closes with its **Time sinks**. It needs no run root, so a reaped scope still has one, and it sits outside the implement chain (ADR 0103, ADR 0143).
_Avoid: "timing report" (a **timing command** is the per-test duration command a test audit reads), "trace" (nothing is instrumented)_

**Time sink**: one line of the **Run profile**'s closing section, naming where a scope run's time pooled. A machine-time sink holds at least 20% of the scope's machine time, its wall time less **Human wait** and **Idle**; the wait sink names human wait and idle together when they exceed that machine time. Each sink states its figures and either a lever the operator controls in their own repository or session, or that the repository holds none. A fixed rule in the profile script produces every sink (ADR 0143).
_Avoid: "verdict" (a **Review verdict** and a **Final-review verdict** are reviewers' outcomes), "diagnosis" (the defect-reproduction discipline a `fix` feature starts from), "bottleneck" (a sink need not be on the critical path)_

**Phase segment**: one run of one chain command (implement, review, document, submit-pr, or ship) inside a session transcript. It runs from that command's invocation to the next superdev command's invocation, or to the session's end. It belongs to a scope when an argument is the scope's whole feature label, a `BASE..branch` or `BASE...branch` review range whose right-hand side is one, or its bare slug given alone and some cwd read elsewhere in the transcripts evidences that slug as a real run root. Only with none of these does it fall back to the run root any of its entries, or those of a subagent it dispatched, ran under — so a session that worked several scopes counts each segment only toward its own scope, never toward one a leftover cwd still points at. A command run twice, such as a second review, makes two segments.
_Avoid: "phase" alone (a slice's lifecycle and a stage are different axes), "step"_

**Human wait**: time a run spent waiting for the operator rather than working: an `AskUserQuestion` call from its question to its answer, a rejected dispatch's own window from its call to the rejection, and the gap from a turn's end — or a run of consecutive turn ends, measured from the last real, non-synthetic model output, from an interrupt entry that cuts that output short, from a Stop hook summary that follows it, or from the block's earliest turn end where it holds none of these — to the next prompt the operator typed. A typed prompt includes one carrying only an image, with no text of its own. The **Run profile** never counts it as machine time. In a permission mode that prompts, a tool call's own duration also holds its approval wait, which the transcript does not separate, so the profile names the mode instead of estimating the share.
_Avoid: "idle time" (**Idle** is a narrower, disjoint measure: a between-turn gap a typed prompt ends is human wait, never idle), "user time" (a process-accounting term)_

**Idle**: time a run sat at a turn's end — or a run of consecutive turn ends, measured from the last real, non-synthetic model output, from an interrupt entry that cuts that output short, from a Stop hook summary that follows it, or from the block's earliest turn end where it holds none of these — with nothing running, until whatever closes the gap is anything other than a typed prompt: a cross-session message from a peer Claude Code session, a resumption note the harness inserts after a rate limit or a cut-off response or a context compaction, or a task notification arriving with no subagent interval and no background Bash call covering the gap. The **Run profile** never counts it as machine time. Where a subagent interval covers the gap, that time stays subagent time instead, and where a background Bash call covers it, tool time (ADR 0143).
_Avoid: "human wait" (idle ends in a wake the operator did not type), "dead time", "downtime" (process-accounting terms this glossary avoids elsewhere)_

## Separation of concerns

**Execution playbook**: the linear, tier-specific procedure that runs a scope's whole `/implement` execution, start to finish. It is `references/implement-full.md` (full tier) or `references/implement-lite.md` (lite tier), computed and `Read` by the controller once the tier is known. Each playbook opens by reading `references/run-init.md` (run init) and closes by reading `references/run-handoff.md` (run handoff). The `/implement` command body therefore keeps config and input, the tier computation, the invariants, the model table, the issue-status map, and red flags. Control never returns to it once a playbook starts.
_Avoid: "command" (the playbook is the file the command delegates to, not the command itself)_

**Review checklist**: the shared file (`references/review-checklist.md`) naming concrete anti-patterns, vulnerability classes, design smells, a reuse-audit lens, a consistency lens (convention drift, cross-slice divergence, glossary drift), and a test-cost lens, read at dispatch time. `final-reviewer` applies every lens its own list names, `slice-reviewer` applies anti-patterns and vulnerability classes, and `test-auditor` applies the test lenses plus `## Test cost`, which only it reads because those two need a measured duration (ADR 0066). It follows the same shared-file-read-at-dispatch pattern as `Execution playbook`, one level down: a checklist of things to look for, not a procedure to follow.
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

**Staged page**: one knowledge-base page `/superdev:plan` or `/superdev:document` writes as a `.md` file to `.superdev/kb-pending/<scope>/` in the repository's main working tree, instead of sending to a remote backend. `scope.js staging <scope>` resolves that directory from any checkout, so a page staged from a scopetree survives the scopetree's removal (ADR 0119). It carries YAML frontmatter with the page `title` and an `action` of `upsert`, `patch`, or `delete`, and the page body below it. An optional `parent` names the title of the page it is created under (ADR 0109). A `patch`'s body is one section of an **aggregate page** (ADR 0027). The filename and path rules live with the staging commands. The page waits until `/superdev:publish-kb` applies it, which is the only path from superdev to a remote backend. A local `docs/kb/` backend produces none, because its pages are repository files (ADR 0023). A staged `upsert` records the hash of the live body it was built from, and `/superdev:publish-kb` refuses it when that body has changed, or when it records none and the page exists (ADR 0094).
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

**Seed gap**: a seed section with no matching section in the configured `docs/agents/*.md` document, or a seed rule that a matching section lacks or contradicts. Sections match by concept, not by exact heading. A fill-in value, setup-facing instruction text, and a section only the document carries are not gaps. `/superdev:setup check` reports seed gaps, and a `/superdev:setup` re-run offers each one (ADR 0107).
_Avoid: "seed drift" (drift names a fact the repository no longer supports), "missing section" (a gap can be a stale rule inside a present section)_

**Seed deviation**: a seed gap the operator declined on purpose, recorded with its reason in the document's own `## Seed deviations` section. `/superdev:setup` lists it as recorded and never offers or reports it as a gap again. A backend switch drops it (ADR 0107, INV-0107).
_Avoid: "override", "exception"_

**Stale deviation**: a `## Seed deviations` bullet that names no rule in the current seed, for example after a plugin release renames the rule. `/superdev:setup check` lists it and never reports it as a gap. A `/superdev:setup` re-run offers to drop it or keep it, and offers a kept one again until it is dropped (ADR 0107).
_Avoid: "orphaned deviation", "dead deviation"_

**Slice store**: the backend where a feature's plan and slices live: an issue tracker. Configured in `docs/agents/issue-tracker.md`.
_Avoid: "issue tracker" as the concept name (that is one backend), "database"_

**Assignee**: the slice-store account every issue a run creates is assigned to. It is a single store-native identifier (a login for Forgejo or GitHub, an `accountId` for Jira), read from **Operator configuration**, resolving to the API token's own identity when unconfigured and disabled by `none`. Configuration rather than a slice field, applied at creation to the epic and every slice. How a given store applies it is stated in that store's own `## Assignee` section, which specialises `plan-contract.md` → *Assignee* (ADR 0010, ADR 0073).
_Avoid: "owner" (too generic), "creator" or "reporter" (the store already records who filed the issue, and assignee is who owns it), "reviewer" (a pull-request role, owned by the code host)_

**Operator configuration**: `.superdev/info.json`, the untracked, repository-local file holding the identifiers that belong to the person running superdev rather than to the repository — the **Assignee** today. Keyed by backend role (`issue-tracker`), and untracked by construction, because `.superdev/` is git-ignored. Distinct from the tracked `docs/agents/*.md` configuration, which states what the whole team shares (ADR 0073).
_Avoid: "user config" (superdev's user is the repository, not the person), "settings", "profile", "credentials" (tokens stay in an environment variable or the host CLI's login, and never enter this file)_

**Deploy posture**: what `/superdev:ship` does with a feature's deploy targets once the pull request has merged, stated once for the whole repository in `docs/agents/deployment.md`. `none` deploys nothing. `manual` prints each target's command and records the target as pending, because the operator deploys outside superdev. `auto` runs each target's command in a tree checked out at the merge commit. `/superdev:setup` defaults to `manual` and never to `auto`. A repository with no `docs/agents/deployment.md` reads as `none` (ADR 0101, INV-0098).
_Avoid: "deploy mode" (a second name for the same thing), "CI" (superdev asks the host nothing about a deploy), "release" (a release batches every merged feature, and a deploy belongs to one feature)_

**Deploy target**: one named row of `docs/agents/deployment.md`'s targets table. It gives the command that deploys it and how to reach it read-only for verification. A feature's scope anchor lists the targets it deploys to on its `**Deploy:**` line, in deploy order, or carries `**Deploy:** none`. `/superdev:plan` writes that line, and `/superdev:ship` reads it from the anchor when it runs (ADR 0101).
_Avoid: "environment" (a target is one deployable unit, and one environment may hold several), "host" (a target need not be one machine)_

## Plugin surface

**Model-invocable surface**: a skill the model can start on its own through the Skill tool, as against one only the operator can, by typing its slash command. Every skill is one unless its frontmatter carries `disable-model-invocation: true`. An external driver invokes each step of the chain through the Skill tool, and `/superdev:plan` and `/superdev:implement` start `/superdev:setup` and `/superdev:plan` the same way, so each of them must stay one. `/superdev:ship` starts `/superdev:verify-ship` and `/superdev:wrap-up` the same way once the operator agrees, so both must stay one too. Only `/superdev:ship` must not (INV-0066, ADR 0132).
_Avoid: "auto-invoked" (that names implicit activation by description match, a different property), "callable", "public"_

**Shipped tree**: the `plugin/` subdirectory, which is everything a user's install copies and nothing else, because the marketplace manifest's `source` names `plugin` as its `path`, at the release tag its `ref` pins (ADR 0131). Everything outside it — `tests/`, `scripts/`, `docs/` — is maintainer-only and reaches no user.
_Avoid: "the plugin" (that names the product, not the tree), "dist", "build output" (there is no build step)_

**Guardrail**: one of the deterministic Node hooks in `plugin/hooks/`, wired by `hooks/hooks.json`, that decides a tool call or a session event with no model judgment involved.
_Avoid: "hook" alone (Claude Code's word for the wiring point, which also covers hooks superdev does not ship), "check" (that names a `Check:` proof or a drift assertion)_

**Feature label**: the one slice-store identifier a feature's scope anchor and every one of its slices carry, its **change type** and its slug, in the notation the active `docs/agents/issue-tracker.md` states (a `<type>/<slug>` label). It names the feature to `/superdev:implement`, and it is the scope branch verbatim, so one value fixes which feature gets built and which branch and run root the build uses (ADR 0019, ADR 0021).
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

**Backend command contract**: the five named shell command templates — `find`, `read`, `create`, `update`, `delete` — a remote knowledge base declares under the `## Commands` section of `docs/agents/knowledge-base.md`, one `### <verb>` subsection each. `/superdev:setup` writes them and `scripts/publish-kb.js` is the only runtime reader: it resolves a verb by heading name, never by position, runs it under `/bin/sh -c`, and passes every value as an environment variable rather than interpolating it. Every one of the five runs under a time bound, and a call that exhausts it stops the batch rather than costing that bound once per staged page (ADR 0130). A backend declaring no `read` template can carry no **Aggregate page**, because nothing can fetch a live body to merge into (ADR 0069).
_Avoid: "backend config" (that is the whole `docs/agents/knowledge-base.md`, of which this is one section), "hook" (a hook is a shipped guardrail the harness fires)_

**Feature specification**: the KB's one-page-per-feature document, carrying the problem, the solution shape, and the Definition of Done, written for the KB's audiences and language. Distinct from a slice's own `spec`: this is one per-feature narrative for readers, not a per-slice implementer contract.
_Avoid: "PRD" (implies business-case and persona content this doc does not carry), "specification" alone (collides with the per-slice `spec` field)_

**Response shape**: a fixed layout for a message a command shows the operator, defined once in `references/response-shapes.md`. A skill cites the shape it uses and restates none of it (ADR 0113).
_Avoid: "template" alone (a knowledge base's **Backend command contract** templates are shell commands), "output style" (a Claude Code setting that changes every session, not one command's message)_

**Next block**: the `### Next` section that closes a covered command's last message, holding the next command and one line on what it does, defined once in `references/response-shapes.md` (ADR 0113, INV-0111).
_Avoid: "handoff" (run handoff is the closing procedure of an execution playbook), "call to action"_

## Roles

The subagents the controller dispatches. Each runs in isolated context and only its result returns. **Controller** and **Final-reviewer** carry discipline beyond their name, defined under _Controller discipline_ and _Review discipline_ above.

**Implementer**: builds **one** slice test-first (TDD), the laziest version that works. Never merges (a hook enforces it).
_Avoid: "developer", "coder"_

**Slice-reviewer**: per-slice correctness gate (full tier, `behavior` slices). It verifies against the slice's acceptance, independently re-runs the suite, and reads the produced artifact, hunting uncovered input.
_Avoid: "reviewer" (unqualified, so say which)_

**Simplicity-reviewer**: the over-engineering reviewer. It names what to delete and what a standard-library or native feature replaces; its findings are advisory and gate nothing. Read-only. Two dispatch sites, one per tier: `full` runs it per `behavior` slice, beside the slice's first review, and the warranted cuts join that review's fix list (ADR 0138), and `/superdev:review` then skips it on that tier, leaving the cross-slice case to `final-reviewer`'s Brevity axis. `lite` has no per-slice review, so `/superdev:review`'s whole-scope dispatch is the only pass it gets (ADR 0037).
_Avoid: "the simplicity review" unqualified (name the tier, because which site runs is what differs); "linter", "critic"_

**Doc-writer**: reconciles the in-repo docs (the AGENTS.md tree) and the knowledge base with the merged code, removing stale text. Run by `/document`.
_Avoid: "documenter", "technical writer"_

**Doc-reader**: the reader test, a fresh-context, read-only verifier that reads the doc-writer's changed docs cold and checks their claims against the repo (paths, commands, described behavior). Run by `/document` after the doc-writer. Findings trigger one doc-writer fix round.
_Avoid: "doc-reviewer" (it tests grounding and first-read clarity, not prose quality)_

**Test-auditor**: read-only. Prices a whole test tree in one pass against a duration table, naming what each test costs against what it proves. Dispatched once, over the whole swept set, by `/superdev:review-tests` (ADR 0066).
_Avoid: "test reviewer" (review is the code-review family; this prices cost, not correctness)_

**Dispatch prose**: the text a command sends to a subagent, as distinct from that subagent's own body. Both reach the model in one prompt, and the dispatch is the later, more specific instruction, so it wins a conflict between them. A behaviour contract stated in an agent body therefore also has to hold in every dispatch that reaches it, which is why a drift row pins both halves rather than the body alone (ADR 0035).
_Avoid: "the prompt" (ambiguous between the two halves)_
