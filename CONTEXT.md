# Glossary: superdev domain language

## Core concepts

**Epic**: the slice-store container for a multi-slice feature. A single issue that groups all the feature's slices and holds the source text for the global DoD. An epic is optional. A single-slice feature has no epic, and that slice's `acceptance` becomes the DoD directly.
_Avoid: "feature issue", "parent issue", "the DoD" (the epic holds and sources the DoD's text, while `.superdev/scopes/<scope>/dod.md` is the concrete DoD itself)_

**Slice**: a vertical tracer bullet, a narrow but complete path through every layer (specification, then implementation, then test), independently green, and demoable or verifiable on its own. Each slice carries test-applicability (behavior, mechanical, or docs), a specification, acceptance criteria, and explicit dependencies on other slices.
_Avoid: "story", "task", "sub-issue", "chunk". GitHub's **sub-issue** is a different sense: the tracker's parent-child relation, which the GitHub slice store uses to link a slice to its epic (ADR 0011), not a synonym for the slice itself_

**Expand–contract**: the slicing sequence for a wide refactor, one mechanical change whose blast radius fans across the codebase. An expand slice adds the new form beside the old, migrate slices move call sites over in batches, and a contract slice deletes the old form once no caller remains. Each slice stays independently green. Only when even the batches cannot does the epic name an **Integration branch** (ADR 0033).
_Avoid: "big-bang refactor" (the thing this sequence replaces), "parallel change" (Fowler's synonym, and one name is enough)_

**Integration branch**: the `integration/<scope>` branch a wide refactor's slices merge into when its batches cannot stay green alone, named by the epic's `## Integration branch` section. Green is promised at one node. The branch keeps the scope branch green while batches that cannot stay green alone are in flight. The final integrate-and-verify slice merges it into the scope branch, and the scope review's exit run verifies that merge (ADR 0033, ADR 0155, ADR 0175, ADR 0192).
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

**Release**: the human agreement that a written plan may be built, carried as a durable signal on the scope anchor. Its consumers are `/plan`, which asks which one it is doing, `/implement`, which asks for confirmation before building an unreleased feature, and `/status`, whose backlog survey groups an anchor carrying no release signal as `unreleased`. How a given store expresses it is stated in that store's own `## Release` section, which specialises `plan-contract.md` → *Release* (ADR 0034).
_Avoid: "ready" (that is the `todo` lifecycle state, consumed the moment work starts), "approved" (unused elsewhere)_

**Run root**: the part of `.superdev/scopes/<scope>/` that stays in the repository's main working tree, at both tiers: `dod.md`, `ledger.md`, `run.lock`, and on the full tier `interfaces.md` (the cross-slice interface record). `scope.js root <scope>` resolves its absolute path from any cwd — the invoking checkout, a scopetree, or a slicetree of the same repository (ADR 0080). Never moves into a scopetree or slicetree, so it survives their removal as the post-mortem trail and lets `/status` enumerate runs without touching either.
_Avoid: "run directory", "scope dir" (too generic, because this is the main-worktree-resident subset, not the whole `.superdev/scopes/<scope>/` namespace)_

**Run-state ref**: the git ref `refs/superdev/<scope>` on the remote that `docs/agents/code-management.md`'s `Remote:` value names. It holds one parentless commit of a run root's `trace.log`, `reports/`, `interfaces.md`, and `dod.md`, whichever exist, and nothing else. `dod.md` rides it because implement's ticks never reach the anchor, and adopt merges it into the copy written from the anchor (ADR 0206). `scope.js step clear`, `step block`, and a `stage set` that closes the standing step send it, except `stage set closed`: `/superdev:wrap-up` deletes the ref before that write. Each send is a best-effort lease push against the tip this machine last saw, and builds its commit without touching any checkout (ADR 0202, INV-0179).
_Avoid: "run backup", "state branch" (it is no branch and holds no code)_

**Definition of Done (DoD)**: the checkable acceptance criteria for the whole feature, sourced from the epic if one exists, or from the lone slice's `acceptance` if not. `.superdev/scopes/<scope>/dod.md` is the concrete verification plan that gates the final-reviewer and PR. A controller ticks it while the run works, from an implementer's report (`references/dod-ticks.md`, ADR 0091).
_Avoid: "requirements", "specification", "checklist" (DoD is the integrated checklist)_

**Verification ceiling**: the bound on what a chain surface may do to verify a Definition-of-Done criterion. Verification observes, and changes no system outside the repository. `references/scope-mode.md` states it once, and every surface that verifies a criterion carries it, each taking the action its own role allows: `implementer` gets no increment for a criterion needing a deploy, a migration, or any other outward-facing change, and reports it as needing verification after merge; `final-reviewer` reports such a criterion as unverifiable on the branch, needing verification after merge. The prose that dispatches `implementer` and `final-reviewer` carries the same clause (ADR 0084, INV-0006). `/superdev:submit-pr` verifies nothing: it copies a criterion review or document already left unticked with a `ceiling:` note into the pull request as a post-merge checklist (ADR 0091). `/superdev:verify-ship` verifies after the merge: it observes the deployed system read-only, and runs no deploy target's command (ADR 0106).
_Avoid: "ceiling note" (that is `final-reviewer`'s advisory observation about shallow work, an unrelated term), "read-only" (a verification may write inside the repository), "dry run" (that names a mode of the outward-facing action this bound forbids outright)_

**Append mode**: re-running `/superdev:plan` on a feature that already has slices, which creates only the new records and never edits, closes, or renumbers a merged one (ADR 0004). It amends the epic's Definition of Done in place, so it is available only at `planned`, before any slice has run. A run root from `implementing` through `documented`, and a feature whose anchor has shipped, both refuse. Amending in place there would mix criteria verified against a merged pull request with criteria nobody has verified (ADR 0083, INV-0004). Follow-up work on any of those is a new feature, tied back through the anchor dependency.

**Ledger**: the per-scope recovery map. It tracks the run's stage, the **Step** a command has started, the scope branch, each slice's status (todo, then in-progress, then in-review, then merged), its commit range when merged, and the mapping between slice id and issue key. Run init writes the branch as the ledger's `**Branch:**` line once, because a slug alone never names the branch. `.superdev/scopes/<scope>/ledger.md` is the authoritative state during a run, and after a compaction or a resume.
_Avoid: "log", "status file", "tracker"_

**Published snapshot**: the copy of a run's ledger that the scope anchor carries, written as a `## Run state` section once at the end of each command that wrote the ledger. The ledger stays authoritative and the snapshot is a mirror, so a run whose publish fails is unaffected. It is what lets a run's record outlive `scope-prune`'s reap, a run resume on another machine, and a run's progress be read without a terminal (ADR 0042). Where it lives on a given backend is stated in that store's own `## Run state` section, which specialises `plan-contract.md` → *Run state*.
_Avoid: "remote ledger" (it carries no authority over control flow), "sync", "backup"_

**Adopt**: rebuilding a run root from the anchor's published snapshot, where no local ledger exists. Run init adopts a snapshot whose stage is neither `shipped` nor `closed`, writes `dod.md` from the anchor as it does for any run, and reports the run kind `resumed`. A command that needs a `shipped` original's run root adopts a `shipped` snapshot through `scope.js adopt --shipped`, which refuses every other stage (`shipped-run.md`'s `## Adopting a shipped original`, ADR 0124). `scope.js adopt` reads a whole anchor body and extracts the section itself (ADR 0042).
_Avoid: "restore", "pull", "import", "clone"_

**Stage**: how far a scope has moved through the chain (`/implement`, then `/review`, then `/document`, then `/submit-pr`) and past it, recorded as the ledger's `**Stage:**` line and naming the last completed step: `planned`, `implementing`, `merged`, `reviewed`, `documented` (or `documented-unreviewed` when `/document` ran before `/review` did), `submitted`, `shipped`, `closed`. `planned` is the one stage that precedes the chain rather than naming a step within it: `/superdev:plan` wrote the ledger, cut the scope branch and scopetree, and no slice has run yet (ADR 0079) — `/superdev:implement`'s run init moves the stage forward out of it, and no later write ever moves it back. `submitted` means `/superdev:submit-pr` opened the pull request, which is where the chain stops, attended or unattended. `shipped` means the pull request is merged: `/superdev:ship` merged it, or adopted a merge someone made by hand (ADR 0096). The anchor stays open at `shipped` until `/superdev:wrap-up`, and `/superdev:verify-ship` first settles any criterion only a deployed system can show (ADR 0116). `closed` is terminal: `/superdev:wrap-up` closed the anchor and removed the run's scaffolding (ADR 0106). A ledger an older version left at `shipped` records only an opened pull request, and `/superdev:ship` reads such a run from the host. Distinct from a slice's status, which tracks one slice through the DAG (ADR 0013), and from the **Step**, which names a step started and not yet completed.
**Step**: the chain step a scope has started and not yet completed, recorded as the ledger's `**Step:**` line: `plan`, `implement`, `review`, `document`, `submit`, `ship`, `verify-ship`, or `wrap-up`. The command writes it as the step starts, and each write is traced, also when the step already stands (ADR 0147). A stage write clears it, and a step that completes with no stage write clears it itself, so a step that stops keeps it and records the stop with `step block`, a trace line that leaves the ledger unchanged (ADR 0147). A slice's own step is its status. Every invocation of a chain command writes its step, so each `/superdev:review` invocation writes one, which marks the start of its **3-strike fix loop** (ADR 0140). _Avoid_: phase, current stage.
_Avoid: "phase" (that names a step within a playbook's procedure, as in run init or run handoff), "state", "step"_

**Degraded pass**: a step of the chain that did not get the assurance the chain promises: a dispatch the permission classifier denied, or a pass that could not reach what it needed. What each command does about one, attended and unattended, and the `**Degraded:**` ledger entry that carries it to `/superdev:submit-pr` and `/superdev:status`, live in `references/scope-findings.md`'s `## Degraded passes` section (ADR 0018). A denied **verification dispatch** stops an unattended run only where the controller authored what that pass verifies, and the entry quotes the classifier's refusal (ADR 0039). An unattended run also stops at the cap `references/scope-findings.md`'s `## Degraded passes` section states, whoever authored the work. The count comes from its own ledger's `denied: ` bullets, so the stop stays inside superdev rather than reaching the platform's own three-denial kill (ADR 0041). A **denial reset** returns that budget once a human has addressed the cause: it counts from the last reset marker, so every recorded denial survives and the pull request shows the reset and its reason (ADR 0044).
_Avoid: "failure" (the code under review did not fail. The chain's own assurance came up short, and an **Unresolved defect** is that other thing), "warning" (too generic)_

**Unresolved defect**: a defect the run found in the code and left standing, recorded as the ledger's `**Unresolved:**` line and written only where the run gives up. A defect found and then fixed leaves no trace. `references/scope-findings.md`'s `## Unresolved defects` section owns the record and what `/superdev:submit-pr` and `/superdev:status` do with it (ADR 0026). Distinct from a **Degraded pass**, which says how much of the chain ran rather than whether the branch is sound.
_Avoid: "degraded pass" (that names the chain's shortfall, not the code's), "blocked" (a blocked slice carries its own status in the ledger's slice table)_

**Scope checkout**: the working tree holding the scope branch, which every command after `/implement` finds from disk. It is the scopetree, `.superdev/scopes/<scope>/scopetree`, at both tiers (ADR 0045); the invoking checkout is never switched onto the scope branch. Where a chained command's fix commits and documentation commits land.
_Avoid: "the checkout" unqualified (the invoking checkout is a different thing)_

**Containment**: the property that base already holds a scope branch's work, so merging that branch into base would change nothing. It is what every surface asking "has this branch reached base" actually means, and it is tested on content — `git merge-tree --write-tree <base> <branch>` yielding base's own tree — never on ancestry, which a squash-merge destroys by rewriting the branch's commits (ADR 0053). A not-contained verdict against a local base is provisional: the test fetches the base branch from the remote and retests against `FETCH_HEAD`, so a squash-merge the clone has not pulled reads contained (ADR 0065). Where that comparison conflicts — a base that edits the branch's files after taking its work — a second tier asks the neighbouring question, whether base's history took the patch: the patch id of the branch's cumulative diff from the fork point, looked for among the commits base gained since (ADR 0082). Every path that cannot answer answers not contained (INV-0003). `references/scope-branch.md`'s `## Containment` states the test once, `plugin/scripts/scope.js` implements it, and `hooks/scope-prune.js` calls that implementation with `HEAD` as its base and no fetch. Contained and **gone** are the two ways a scope's work is finished with.
_Avoid: "merged" (the host's action, which containment is the local evidence for), "ancestry", "reachable" (the proxy this replaces)_

**Run kind**: which of two things a `/superdev:implement` run is, computed by run init and read by both execution playbooks to decide what the branch step does. **`fresh`** means a ledger this run wrote, including one written after rotating a closed ledger aside for a new feature reusing a retired label: cut the scope branch from base, or, where the name is taken because a squash-merging host left the branch standing, reuse it when base already contains it and stop when it does not (ADR 0072, ADR 0083). **`resumed`** means a live ledger — held locally, or adopted from the anchor's published snapshot — whose branch holds unmerged slice work. It cuts nothing: it fetches the branch from the remote first where the checkout does not hold it. It then reattaches the scopetree to it, recreating that scopetree where it is absent (ADR 0042, ADR 0045). One determination, made once, read in three places (ADR 0028).
_Avoid: "re-run" (covers a fresh run over a retired label and a resumed run alike, and they take opposite branch actions), "re-cut" (a run reusing a contained branch re-points it rather than cutting a new one)_

**Push mode**: how `scope.js push`, run by `/superdev:plan`, puts the scope branch on the remote, decided from the remote tip it fetched: a plain push when the remote holds no such branch or its tip is an ancestor of the local tip, a lease push naming that exact tip when the containment test proves base holds the tip's content, and no push otherwise (ADR 0167, INV-0169). A refused or failed push is reported in plan's output and changes neither the ledger nor the published snapshot.
_Avoid: "force push" (a push mode never uses a bare force)._

**Scope mode**: the shared rule `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, and `/superdev:ship` each read from `references/scope-mode.md` at runtime: what makes a range or scope slug a live run, how to find the scope checkout from disk for either tier, the refresh-not-create rule for the run lock, and the never-moves-backwards rule for the ledger's stage (ADR 0013). Each command keeps only what is specific to it beyond the shared rule.
_Avoid: "chain mode" (the chain is the four commands. Scope mode is the rule review, document, submit-pr, and ship all read, ship included despite sitting outside the chain), "review mode" (that names `/superdev:review`'s own split between an ad-hoc range and a scope, one level down)_

**Candidate set**: what a command invoked with no argument chooses among, named by that command and resolved through the one cascade `references/scope-mode.md`'s `## Resolving an empty argument` section states — exactly one candidate is used, several are listed with their stage and put to the operator, and none is reported with what exists instead (ADR 0078). Each command's own document names its set. `/superdev:review` puts two local rules ahead of the cascade, because a dirty working tree and a branch ahead of base are each a subject of their own, and one step after it: where the cascade finds no candidate, review reads standing code of the whole repository and lists every run root with its stage (ADR 0165). It resolves a path argument that names the checkout's top level exactly as no argument. A command whose empty-argument resolution lives in a script refuses and lists rather than asking, since a script cannot put a question — `plugin/scripts/publish-kb.js` is the one.
_Avoid: "default" (the cascade picks nothing when the set is not a singleton, where a default would), "the only run" (names the singleton branch, not the set every branch reads)_

**Slicetree**: an isolated filesystem checkout used to keep one slice's branch work off every other slice and off the invoking checkout. The full tier gives each slice its own (`.superdev/scopes/<scope>/slicetrees/<id>/`, plural), merged into the shared **Scopetree** (defined below) once the slice is reviewed and green. The lite tier has none: it implements every slice inline in the single scopetree instead. Both nest under the git-ignored `.superdev/scopes/<scope>/`.
_Avoid: "worktree" unqualified (ambiguous with git's own generic term and with a scopetree), "branch", "workspace", "checkout"_

**Invoking checkout**: the working tree the user runs superdev from (their clone, usually on main). Neither tier's execution playbook switches it onto the scope branch (ADR 0045): each cuts or reuses the scope branch into the scopetree instead, running the `git worktree add`/`remove` calls themselves from here, exactly as any such call does.
_Avoid: "main checkout", "user branch", "current tree"_

**Scopetree**: the dedicated checkout a run cuts its scope branch into, at both tiers (`.superdev/scopes/<scope>/scopetree/`, ADR 0045) — a lite run implements inline there directly, a full run merges each slice into it from that slice's own slicetree. Isolates the run from the invoking checkout and from other sessions. The run root (the DoD and the ledger) stays in the invoking checkout, not here, so it survives scopetree removal.
_Avoid: "worktree" unqualified, "scratch checkout", "session workspace"_

**Run lock**: the `.superdev/scopes/<scope>/run.lock` file that `/superdev:plan` and `/superdev:implement` each read to keep a second session out of one run, at both tiers (ADR 0045, ADR 0227). Its mtime marks the run as live, so every command in the chain touches it and the lock spans the whole run rather than one invocation. Every line written to the run's trace refreshes the mtime too, so a run that keeps working stays live between those steps, and one that stops reads as crashed an hour after its last trace line (ADR 0220). That refresh never creates a lock, never changes its content, and never follows a symlink. A stale lock is reclaimable as a crash resume. `/superdev:implement` entering a run root it did not itself create in this invocation reads the ledger's stage alongside the lock's mtime before its first write into that run: any stage other than `planned`, with a lock under an hour old, is a **live implement run** (below), which stops that one caller rather than letting it join silently (INV-0013, ADR 0090). `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, and `/superdev:ship`'s own ordinary hand-off is not tested this way — each is the chain's single designed entry right after the previous command's own exit, not a case a second, independent invocation reaches — and `/superdev:plan` checks through `scope.js open`, which writes `plan <nonce>` into the lock and stops on a fresh lock naming another nonce (ADR 0185). Outside `/superdev:plan`, the lock's content is freeform text — whatever a session chooses to write into it — and carries no identity contract of its own; a human reads it to judge self from another session where the check asks.
_Avoid: "lockfile" (that names a dependency-manifest file elsewhere), "mutex" (too implementation-generic), "heartbeat" (names the refresh mechanic, not the file), "session lock" (the lock marks the run as live, not any one session's claim to it)_

**Live implement run**: a run root whose ledger stage reads past `planned` and whose `run.lock` mtime is under an hour old — the lock's one-hour staleness threshold, scoped to `/superdev:implement`'s own entry check alone (INV-0013) and never to `scope-mode.md`'s own `## A live scope run` (the range-resolution sense `/superdev:review` and `/superdev:document` use) or to any other sense of "live" already in this glossary. A `planned` stage with a fresh lock is not a live implement run: `/superdev:plan` writes that lock at its own cut, before any slice has been implemented, and a caller entering it proceeds as the ordinary hand-off to `/superdev:implement`. A run that writes no trace line for over an hour lets its lock go stale while it works, and then falls outside this definition: staleness alone never re-admits a run to liveness, whatever its actual progress (ADR 0220).
_Avoid: "live run" bare, unqualified (this glossary already uses it for `scope-mode.md`'s `## A live scope run`, the range-resolution sense `/superdev:review` and `/superdev:document` read — a different question, asked of different evidence), "active scope" (conflates with the ledger's own `**Stage:**` value, which this term reads alongside the lock rather than replaces), "locked" (the lock exists at every stage past cut; only a fresh one past `planned` makes the run live)_

**Progress log**: the per-slice running record of what happened: agent dispatches, reviews, fixes, and merge results. `.superdev/scopes/<scope>/reports/<id>/progress.md` is append-only, oldest-first, git-ignored. Exists so a human or a resumed controller can see what unfolded without re-reading slicetree state. It is also `slice-reviewer`'s after-blind-pass input and a re-review's record of earlier findings.
_Avoid: "log", "report", "transcript" (logs are broader, and this is slice-specific narrative)_

**Self-check**: the implementer's walk of its own diff against its slice's `spec` before it reports: each acceptance item, each named edge case, each cited invariant, and on a `behavior` slice the failing test before each change. Each item is `covered` only where the entry quotes what the item or its cited reference demands beside what the work does, `not covered`, or `not observable` where the implementer has no tool to observe it. Its result goes to the progress log, so the slice reviewer reads it only after its blind pass (ADR 0205, ADR 0231).
_Avoid: "self-review" (a review is an independent reader's act)_

**Run configuration**: the parts of `docs/agents/verification.md` that decide what a test run executes and what a carry trusts: the full and focused commands, the `## Whole-repo command`, the `## Prepare command`, the `## Test paths` entries, and the `## Complete selector` files, each as `plugin/lib/verification.js` reads it. A **Suite record** carries across a change to `verification.md` only where the run configuration at the recorded commit and at the tip is the same. `## Timing command` and the file's prose are outside it (ADR 0230).

**Run trace**: the run's event record, `<run-root>/trace.log`, one line per event, each naming the slice it belongs to or `scope`. superdev's hooks and `scope.js` write it, and no agent does: it records file edits classified as test or implementation, test runs with their outcome, commit, and the directory the command ran in (relative to the tree root, `.` at the root), fail-to-pass outcomes, reverts and restores, subagent dispatches and their ends, each end with its **Dispatch outcome**, and ledger writes, the **Step** among them. Reviewers read it as evidence of what ran and in what order, where the **Progress log** is the agents' own account (ADR 0117).
**Dispatch outcome**: how a subagent dispatch ended, as its `dispatch-end` line in the **Run trace** records it: `completed`, `failed`, `denied`, `stopped`, `unknown`, or `session-end`. `unknown` means no event named the end, so the run-trace hook ended the dispatch at the main session's next turn boundary. `session-end` means the session ended while the dispatch ran. Each run of a dispatch has exactly one: a `SendMessage` that resumes a finished subagent starts a new run of its dispatch, and that run gets its own end (ADR 0140). _Avoid_: dispatch status, exit status.
_Avoid: "TDD log", "increment trace", "run log", "transcript" (the transcript is Claude Code's own record, not superdev's)_

**Review cycle**: the position of one slice review among the slice's reviews: 0 for the first, and one more for each earlier `slice-reviewer` dispatch on the same slice that completed before it was dispatched (ADR 0140); a resumed dispatch counts once, however many runs it ended. A review that was interrupted and retried keeps its number. Cycle n > 0 is the re-review after the n-th fix of the **3-strike fix loop**. Cycle 0 reads the whole slice, and cycle n > 0 reads the n-th fix cycle's range (ADR 0137).

**Observed run**: a test run that `scope.js test` executes itself, so the **Run trace** records the command's own exit status as its outcome, whatever pipe, background, or wrapper the caller puts around the call. A run the hook infers from a Bash command's shape is not one (ADR 0127).
_Avoid: "wrapped run", "recorded run" (every run line is recorded), "traced run"_

**Fail-to-pass run**: the two test runs that show whether a change's tests discriminate. The implementer of the change runs it over its own range before it reports, with a command of its own choosing that runs the change's test files (ADR 0182). The verb reads no word of that command; the outcome records it, and the reviewer judges which test files it runs (ADR 0188). That command runs against the changed code, where they must pass, and again with the change's files outside its test files restored to their state before the change and with every tracked change, untracked file, and ignored file the first run left cleared, where they must fail. The outcome is `fail-to-pass` when both hold, `pass-to-pass` when the tests also pass before the change, and `unknown` when they do not pass against the changed code, or when the run before the change is killed at its bound, ten times the first run's duration or 10 seconds, whichever is larger, or ended by a signal, or when a run's command cannot start, or when the **Prepare command** fails before a run. The **Prepare command** runs in the verb's worktree before each run. Where the repository states a **Prepare command**, a passing run of every one of the change's test files that the **Run trace** holds at the change's tip on a clean tree, with its duration, is the first run, and the verb does not repeat it (ADR 0215, ADR 0218). The **Run trace** records the outcome. A Pass-to-pass finding is **unclosable** when no fix can close it, in exactly three cases: the range's behaviour change lies wholly in test-path files, its test pins existing behaviour on purpose, or its changes outside the test paths preserve behaviour, as a refactor or a cut that removes code with its tests does. The reviewer that raises it marks it, and it takes the escape of the **3-strike fix loop** at once (ADR 0193, ADR 0196).
_Avoid: "replay" (ADR 0118 uses it for re-running reviewers on earlier slices), "mutation test" (nothing is mutated; only the code before the change comes back), "red check" (the invariant register's `Check:` field owns "check")_

**Prepare command**: the one shell command that makes a new worktree of the repository ready to run its tests, such as an install of its dependencies. `docs/agents/verification.md`'s `## Prepare command` section states it, or states `none` when a new worktree needs no preparation. It runs at the root of every worktree superdev creates for a test run: the **Scopetree** at implement start and again at review start, each **Slicetree**, setup's probe worktree, and the **Fail-to-pass run**'s worktree before each of its runs (ADR 0218).
_Avoid: "setup command" (`/superdev:setup` owns "setup"), "install step" (the command can do more than install)_

**Warrant**: the justification a piece of work carries. It scales both cost (which model a dispatch uses) and rigor (which review gates run). Derived from a slice's test-applicability and complexity, never a plan field. A `behavior` slice warrants more than a `mechanical` one. A hook blocks any dispatch that omits an explicit model, so cost stays warrant-scaled.
_Avoid: "priority", "estimate", "weight"_

**Warranted cut**: a `simplicity-reviewer` cut the controller accepts because it honours the rules the repository documents for itself, by the rule `/superdev:review`'s warranted-cut concept states; the controller names each cut it declines with the rule it would break. A warranted cut joins the review's fix set as a Minor finding, in the full tier's per-slice loop, in scope review, and in ad-hoc review alike. Only the entry review gets the over-engineering pass, so a cut never starts the next cycle (ADR 0228). Distinct from **Warrant**, the justification that scales a piece of work's cost and rigor.

**Inline fix**: an ad-hoc `/superdev:review`'s fix of a Minor-only remainder, warranted cuts included, made after one attended yes. It runs only where the subject ends at a commit. One dispatched implementer fixes the whole list on a fresh `review-fix/<short SHA>` branch, cut from the reviewed tip into a **Fix worktree**, and one cycle closes it: a focused run there and a warm re-review of the fix range. Review merges, pushes, and opens nothing; the operator brings the branch in. `--chained` and `--unattended` make none (ADR 0228, INV-0031).
_Avoid: "quick fix", "auto-fix"_

**Fix worktree**: the worktree an **Inline fix** works in, `.superdev/review-fixes/<short SHA>/` under the main working tree, inside the area under `.superdev/` that `tree-guard.js` lets an implementer write to while the repository holds a run. Review removes it at its end when it is clean, keeps and names it when it is dirty, and keeps the branch either way. It is no run root: no ledger, no run lock, and no run trace (ADR 0228).

**Intent**: a rough idea sharpened into something plan-ready: the problem, a few candidate directions, the MLP, the open questions, the rejected directions, and the load-bearing commitments. Output of `/brainstorm`, input to `/plan`. A brainstorm intent is a draft (`status: draft`) while its interview runs and ready (`status: ready`) after the handoff; `/plan` never seeds from a draft (ADR 0112). A ready intent lives in the slice store as an **Intent record**, and stays a local file only when the store write fails (ADR 0199).
_Avoid: "idea", "requirements", "specification"_

**Intent record**: the slice-store record a ready **Intent** becomes at the handoff of `/brainstorm`,
`/sweep`, or `/review-tests` — an ordinary issue carrying the store's `intent` label, created unassigned.
It is neither a slice, a scope anchor, nor a **Triage record**: `/plan` seeds from it and closes it, or
keeps it open while part of the intent is still unplanned. How a given store expresses it is stated in that
store's own `## Intent record` section (ADR 0199).
_Avoid: "intent issue", "brainstorm issue" (sweep and review-tests write them too)_

**Finding id**: the stable label `F1`, `F2`, … that `/sweep` and `/review-tests` give each finding they
write into an **Intent**, one sequence per intent, set when the intent is written and never renumbered.
A scope cites it with the **Intent record**'s reference, as `#<record> F<n>`. The comment `/plan` writes
when it settles a record, whether it closes the record or keeps it open, names the finding ids that
scope planned.
_Avoid: "sweep #28", a finding's list position_

**Intent line**: the scope-anchor line `**Intent:** #<n>[, #<n>]` naming the **Intent record**s a plan
seeded the feature from, so a reader reaches the intent from the anchor (ADR 0200).
_Avoid: "source line", "origin link"_

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

**Anchor dependency**: a recorded relation between two scope anchors, saying the second feature cannot be built until the first's anchor is closed. It is satisfied once the anchor it names is closed, or no such anchor exists — no ledger stage satisfies it (ADR 0106). `/plan` records one when its interview named a prerequisite feature; `/status`'s backlog survey reads it, and groups an anchor whose dependency is unsatisfied as `waiting`, naming the anchor it waits on. How a given store records it is stated in that store's own `## Scope anchor` section, which specialises `plan-contract.md` → *Scope anchor* (ADR 0040, ADR 0108).
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

**Criterion tag**: the suffix on an epic's Definition-of-Done line naming the slice ids that deliver the criterion, `scope` when no single slice does, or `docs` when its deliverable is `AGENTS.md`-hierarchy text the doc pass reconciles (ADR 0161). It decides which criteria a slice implementer's report can tick; the report decides whether they are ticked. A single-slice feature carries none (ADR 0091).
_Avoid: "mapping" alone (the tag is the written form), "owner" (a slice delivers a criterion, it does not own it)_

**Tick**: a controller's judgment on one Definition-of-Done line, in `dod.md` and on the scope anchor, except implement's and run handoff's, which land in `dod.md` alone until the scope review's anchor sync (ADR 0206): checked with its evidence as the note, or unchecked with the reason it is not met, that only a deploy can verify it, or that an attended operator accepted it as unmet (ADR 0095). A line nobody has judged yet carries no note; a bare tick is invalid (INV-0014). Only a controller writes one (INV-0015).
_Avoid: "check off", "verify" (verification is what earns a tick, not the tick itself)_

**Suite record**: the ledger's record of the last full-suite run — its result, the commit it ran on, and its kind: `whole` for a run of the **whole-repo command**, or no kind for a run of the full command. A later step reuses a green record whose commit is the scope branch's current tip instead of running the suite again (INV-0017). It also reuses a green record on an ancestor of the tip when every path changed since is a Markdown file, no test path, and not a `docs/agents/verification.md` whose **Run configuration** changed, no full, whole, path, or focused run at the tip failed, and the latest run there does not read `unknown` (INV-0017 states the full rule), so a doc pass's commits need no test run at all (ADR 0128, ADR 0189). Where the repository carries a **Complete-selector declaration**, it also reuses a green record on an ancestor of the tip when a passing focused run at the tip covered every path changed since (ADR 0175), or at an earlier commit followed only by Markdown commits (ADR 0189), and counts one failed test file green once its recorded rerun passed (ADR 0172), at the failed run's commit and at a later tip reached from it by Markdown-only commits (ADR 0189). A result of `none` is never reusable: it records no test command configured, with kind `whole` a whole-repo run that was killed or never started (INV-0009), or, with no kind, a review's invalidation of a submitted tip, which `/superdev:ship` refuses on. A step that needs a whole-repo run reuses only a record of kind `whole`; any other step reuses either kind (ADR 0105).
_Avoid: "suite status", "last run" (the record names its commit, which is what makes it reusable)_

**Complete-selector declaration**: a section of `docs/agents/verification.md` stating that the **Focused test command**, given the **Changed-path set**, selects every test any changed path can affect. It may list the selector's own files. It takes effect only where the focused command carries `{paths}`, and it is read from the tip commit. Under it, a **Suite record** carries to a later tip on a focused run over everything changed since the record, unless a changed path is a listed file, or a `docs/agents/verification.md` whose **Run configuration** changed. `/superdev:setup` asks for it and writes it only on an explicit yes (ADR 0175).
_Avoid: "trusted selector" (superdev trusts nothing here; the repository states it), "fast gate"_

**Pinned merge**: `/superdev:ship`'s merge of a scope's pull request through the host's merge API, bound to the one head whose **Suite record** `scope.js suite reusable` accepts (INV-0017) — of kind `whole`, in a repository that configures a **whole-repo command** — the host refuses it when the pull request's head has moved since. It is the one write superdev makes to the base branch (INV-0001), and it never forces past branch protection or a required approval (INV-0092, ADR 0096).
_Avoid: "auto-merge" (that names a host feature that merges once checks pass, with no pinned head), "fast-forward" (a pinned merge squashes)_

**Test-applicability**: the class of changes a slice carries. `behavior` is new functionality, and needs TDD plus a per-slice reviewer plus a simplicity-reviewer. `mechanical` is a move, a rename, or a format change, uses the existing suite as the net, and skips per-slice reviews. `docs` is documentation-only, and skips reviews.
_Avoid: "slice type", "category"_

**Focused test command**: the **second** fenced block of `docs/agents/verification.md`, required configuration in every repository with a suite (ADR 0085), the command every step inside the loop runs, in place of the full command the first block holds. What defines it is that it **costs less than the full suite**: a `{paths}` form, a fixed fast subset, and a self-detecting runner flag all qualify. Carrying the token `{paths}` makes the caller substitute the **changed-path set** below, shell-quoted, and requires a runner that maps source files to the tests covering them — a form `/superdev:setup` derives with that runner's pass-with-no-tests flag, so a change set holding no tests reports green rather than red. Carrying none takes one of two shapes. A **fixed fast subset** (`pytest tests/unit`) names its own tests and always collects them. A **self-detecting runner flag** (`vitest --changed`, `jest -o`) computes the change set itself and carries that runner's own pass-with-no-tests flag, for the same reason a `{paths}` form does. A runner that cannot narrow records the full command again in this fence, with the reason recorded as prose beside it. A repository carrying only one fenced block has never answered this configuration: a prose caller stops, reports the missing configuration, and names `/superdev:setup`, running no command — `/superdev:plan` and `/superdev:implement` already auto-invoke it. A `verification.md` carrying zero fenced blocks is a different case, not this one: every caller reads it exactly as it reads an absent file, with no suite to run. `references/test-selection.md` owns the contract and every consumer reads it at runtime (ADR 0025, ADR 0074, ADR 0085, INV-0007).
_Avoid: "partial test command" (it is cheaper, not incomplete), "incremental tests" (that names a runner's own caching), "narrowed command" (path scoping is one of its forms, not its definition)_

**Changed-path set**: the paths a caller substitutes for `{paths}` in the focused test command, those changed in the range that caller judges. `references/test-selection.md` owns which range each caller uses, and why an **empty** set runs the full command where the focused command consumes `{paths}` — a substitution over no paths proves nothing — while a focused command carrying no such token runs unaffected by that computation. A fixed fast subset is unaffected because it names its own tests regardless. A self-detecting runner flag is unaffected because it derives the change set itself and relies on its own pass-with-no-tests flag rather than this fallback (ADR 0025, ADR 0074). A test-first step's failing-test or passing-test run substitutes the test files it works on instead, and the last run before the implementer reports, or before the lite tier commits a slice, substitutes the whole set (ADR 0139). Where the focused command repeats the full one, a step runs its test file through `test path <file>... -- <command>` and that last run does not happen (ADR 0180).
_Avoid: "diff" (that names the content, not the path list), "touched files" (`Touch map` already claims that phrasing for a different artifact)_

**Affected form**: a full command that runs the whole suite of every project the change against the base branch reaches, the changed projects and every project depending on them, as the repository's own dependency-graph tool computes it using nx, turborepo, pnpm, or dotnet-affected. It exits green when the change reaches no project. It selects projects, never tests: a **self-detecting runner flag** selects tests by changed file, and belongs to the focused command (ADR 0105, INV-0105).
_Avoid: "changed suites" (the dependents are what make it safe), "partial full command" (every selected project runs its whole suite), "path-scoped full command" (a path prefix misses a shared library's consumers)_

**Whole-repo command**: the optional `## Whole-repo command` section of `docs/agents/verification.md`, whose command runs every project's suite. A repository configures one only when its full command is an **affected form**. `/superdev:submit-pr` runs it before opening the pull request, `/superdev:ship` runs it on a tip that carries no green whole-repo result (refusing instead while a review invalidation stands, INV-0092), and a scope review runs it in place of the full command while the **suite record** reads red of kind `whole`. It holds its command in a backtick span, never a fenced block, for the same reason the **timing command** does (ADR 0105).
_Avoid: "full-full command", "third fence" (it is not a fenced block), "CI command" (superdev runs it, not a CI system)_

**Timing command**: the optional `## Timing command` section of `docs/agents/verification.md`, whose command reports what the suite's tests cost — per-test durations where the runner gives them, total wall clock otherwise. It holds its command in a backtick span, never a fenced block: `lib/verification.js`'s `verificationCommands` reads fenced blocks and takes the first two as the full and focused commands, so a fenced third would run as the focused suite in a repository that has not yet recorded a focused command. A **test audit** is its only reader, and an absent section makes that audit `unmeasured` rather than failing it (ADR 0066).
_Avoid: "benchmark command" (it prices an existing suite, it does not measure throughput), "profiling command" (that names a per-line attribution nothing here asks for), "third block" (it is not a fenced block, which is the whole point)_

**No verdict**: what a spawn whose own bound expired carries, whether or not its kill succeeded. `spawnSync` reports it as a `status` of `null` beside a `signal`, and the distinction is the whole of it: a process that reached its timeout decided nothing. Neither a gate nor an assertion about behaviour may stand on it, whether the kill that followed succeeded or not. `scope.js fail-to-pass` reads it on the run it bounds, and a test harness reads it on every bounded spawn of its own. It is also the discriminator a duration assertion states instead of a clock — `signal` naming the kill is the evidence a bound held, where an elapsed value only ever reports the scheduler too (ADR 0086, INV-0009).
_Avoid: "timeout" (that names the bound, not the result of hitting it), "failure" (a verdict of fail is a decision this is the absence of), "hang" (the process may have been perfectly healthy and merely slow), "spawn failure" (that is the separate term below, and the two carry different answers)_

**Spawn failure**: what a process that never started carries. `spawnSync` and `child_process.spawn` report it as an error with no `signal`, and a code such as `ENOENT` (a missing binary or a wrong path) or `EMFILE` (a system out of file descriptors). It is not a **No verdict**: the gate never ran, so there is nothing it declined to decide, and the absence is evidence about the machine rather than about the code under the gate. INV-0009 therefore does not govern it, and each surface that spawns answers it with its own stated reason (ADR 0087).
_Avoid: "no verdict" (the entry above, and the distinction is the whole point), "crash" (the process never ran to crash), "error" alone (too generic to carry the boundary)_

## Controller discipline

**Controller**: the agent driving a plan's slices to merge (you). You dispatch implementers and reviewers, you merge, and you integrate serially. You never implement or merge inside a subagent.
_Avoid: "orchestrator", "manager"_

**Depends-on**: the set of slice IDs that must merge before a slice can start (a DAG edge). A slice depends on another only if it cannot be green without it. Too-eager dependencies serialize work that could run in parallel.
_Avoid: "blocked by", "dependency" (too generic, where "depends-on" is the explicit, load-bearing relationship). GitHub's **`blocked_by`** is the literal name of the native relation the GitHub slice store uses to record this same edge (ADR 0011), not a looser competing term_

## Review discipline

**Final-reviewer**: the whole-scope review gate after all slices are merged. It checks the integrated diff against the global DoD. It is read-only (`Read`, `Grep`, and `Bash`, with no `Edit`) and runs no test, reviewing against the suite result the dispatching command hands it, so its findings drive the dispatching command's 3-strike fix loop. It never applies a fix itself. `/superdev:plan` also dispatches it in derive mode, before slicing, to write **Derived criteria** that the plan's controller compares against the drafted DoD (ADR 0158).
_Avoid: "final review", "scope review" (the role and the agent, not just the step)_

**3-strike fix loop**: the fix cycles a final review or a per-slice review drives. Each cycle dispatches one fix carrying every listed finding, Minors included, and repeats until the review lists none. A full-tier per-slice review whose remaining findings are only Minor ends the slice's loop instead: the slice merges, and its Minors go to the **Minor queue** (ADR 0174). A final review also ends the loop when a re-review leaves only Minor Prompt-concept overlap findings and no broken criterion. A per-slice review has no such exit (ADR 0170). A Missing fail-to-pass run finding goes into the fix list like any other, and the fix implementer's own fail-to-pass run answers it (ADR 0182). A fix for a finding that names failing behaviour opens with a RED test. The cap is 3 cycles. At the cap, a remaining Critical or Important finding means a wrong cut (hidden dependency, boundary too big), not a buggy slice: move it to blocked and escalate. A remainder of only Minor findings advances instead (INV-0094). A remainder whose only Critical or Important findings are Pass-to-pass or Missing fail-to-pass run, in any mix, advances too, and the run's final report names each with its slice. Any of them beside a Critical or Important finding of another kind still blocks (ADR 0125, ADR 0134). An unclosable Pass-to-pass finding (see **Fail-to-pass run**) takes that escape at once, before the cap: it enters no fix list, and no cycle runs when no other finding is left to fix (ADR 0193).
_Avoid: "retry limit", "attempt count" (the 3 strikes are cycles, not attempts)_

**Minor queue**: the run's record of Minor findings that full-tier slice reviews left on slices they merged, one ledger entry per slice naming the slice by id. The controller writes and clears it through `scope.js`. The **Minor sweep** settles it (ADR 0174, INV-0171).
_Avoid: "backlog", "deferred Minors" (a deferred finding is a different thing, with a triage record)_

**Minor sweep**: the one fix loop a full-tier run gives its **Minor queue**, after the last slice merges and before run handoff. One fix carries every queued Minor, a slice review over the sweep's range judges it, and it runs under the **3-strike fix loop**'s slice rules. A Critical or Important finding left at its cap blocks the run, and an attended `/superdev:implement` run reopens it for 3 more cycles from the scope branch's tip (ADR 0174).

**Warm cycle**: a fix cycle whose fix list holds only Minor findings, run by continuing the loop's previous fix implementer through SendMessage instead of dispatching a fresh one. In scope review it also continues the `final-reviewer` whose verdict it fixes, the entry review's on cycle 1. The **Minor sweep**'s re-review is always a fresh `slice-reviewer`. A scope review's re-review after a warm cycle reads that cycle's own range, and restates each unclosable Pass-to-pass finding of its last verdict with its mark re-judged (ADR 0174, ADR 0193, INV-0143).
_Avoid: "resume" (a resumed run is a run kind)_

**Sibling surface**: another place in a checkout that states the same rule or behaviour as the text a fix changes, such as a reference, a glossary entry, an ADR, a code comment, or a test. A fix that leaves one stating the old rule is incomplete. The `AGENTS.md` hierarchy and the knowledge base are exceptions: a fix reports them and the doc pass edits them. `CHANGELOG.md` is release history and is no sibling surface.
_Avoid: "sweep" (that names `/superdev:sweep`'s whole-tree pass), "duplicate" (a sibling surface can be a deliberate restatement)_

**Mechanical finding**: a review finding, or a failure in a red suite's output, whose fix changes no stated rule or behaviour, such as a rename, a rewrap, or a typo. A fix that changes a rule or behaviour any surface states needs the sibling-surface search, so its finding is not mechanical. A fix dispatch runs on `haiku` only when every finding in its list is mechanical, and any other finding keeps the whole dispatch on the site's model (ADR 0118). A mechanical *slice* is a different term: a move, a rename, or a format change (see **Test-applicability**).
_Avoid: "trivial" (a one-line fix can change a rule), "small" (size is not the test)_

**Judge discipline**: the verification principle every review agent carries, adapted to the subject it judges. Verify the artifact and the behaviour yourself, and never defer to the implementer's or controller's narrative of what was done. Length or an elaborate structure is not its own evidence of correctness or of warranted complexity. A reviewer that judges a completion claim also rejects one resting only on proxy counts (coverage percentage, line count, lint score), and confirms the observable behaviour instead (ADR 0002).
_Avoid: "verification discipline" (too generic, because this means not trusting the builder's account of its own work)_

**Derived criteria**: the acceptance criteria `final-reviewer` writes itself, from the feature's intent alone, before it reads the Definition of Done or the diff. Diffing them against the DoD surfaces criteria the plan never wrote. It needs a DoD written by someone else to diff against. `/superdev:review` in scope mode hands over the DoD's **path** rather than its text, and the reviewer opens it after its own list exists (ADR 0020). `/superdev:plan` dispatches derive mode in the background before the DoD is final and hands over no DoD at all; its controller diffs the returned list against the final DoD, and every gap becomes a DoD criterion, a fold into an existing criterion, or a named non-goal (INV-0096, INV-0158, ADR 0158).
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

**Standing code**: the subject of an ad-hoc `/superdev:review` when the path it was given exists on disk inside the checkout and its scoped diff is empty, or when no argument resolves to a change or a run — the files under that path, or the whole repository, at `HEAD`, reviewed as they are rather than as a change (ADR 0165). It is the fourth range shape, beside `BASE..HEAD`, a working-tree scope, and a path scope with a non-empty diff. `simplicity-reviewer` is skipped on it: its rubric reads a diff (ADR 0063).
_Avoid: "audit mode" (no flag selects it; an empty scoped diff is what resolves to it), "file review" (names the input, not what makes it a distinct shape)_

**Deferred finding**: a fix-loop finding whose remedy adds a capability the Definition of Done never
named. It starts no fix loop, holds no run stage, and is not an **Unresolved defect**. The scope review's
fix loop, or the full tier's per-slice loop, defers it. The scope review records it under its report's
`### Deferred to a plan` heading and hands it to `/superdev:plan`. The slice loop hands it to the controller,
which records it as a **Triage record** and a ledger bullet without a report heading.
It reaches several homes at once: a **Triage record** in the slice store, a `**Deferred:**` bullet in the
run's ledger carrying that record's reference, and the pull-request body `/superdev:submit-pr` copies the
bullet into. The triage record outlives the run root and the closed scope anchor regardless of whether
the scope ever ships (ADR 0035, 0046, 0110). A deferred finding re-enters the fix loop only at the scope
review, when `final-reviewer` names a **Guard-rail remedy** for it (ADR 0211). Once a re-review confirms that fix, the run resolves it: the
ledger bullet goes, the triage record closes only when its own body names this run's scope anchor and no
open scope anchor absorbs it (on any other record, and when a read of the record or of an Absorbs line fails or
is denied, the run comments with the fixing commit and leaves it open), and an open pull request's
deferred section is rebuilt (ADR 0121, ADR 0145).
_Avoid: "scope growth", "out-of-scope finding" (the point is the DoD boundary, not that the finding is
unwelcome or off-topic)_

**Guard-rail remedy**: a fix-loop remedy that extends what exists and adds no behaviour: a case in an
existing test suite, a case or row for an existing drift check, or a prose fix that makes shipped text
agree with a rule the repository already states. It stays in the fix loop and is never a **Deferred
finding**. A new scanner, check family, hook, or script verb is not one (ADR 0097, ADR 0153).
_Avoid: "small fix", "trivial remedy" (the line is the kind of change, not its size)_

**Plan-coverage gap**: a criterion `final-reviewer` derives from the intent that the code already
satisfies and the Definition of Done never named. It is reported as Minor. Its remedy is the
**Guard-rail remedy** that proves the behaviour, never a new `dod.md` line (ADR 0097).
_Avoid: "missing criterion" (the code is not missing anything; the plan is)_

**Observation**: a real defect a run meets that no slice of it covers, and that the scope did not cause —
a flaky test in untouched code, a defect an implementer
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
`## Triage record` section, which specialises `store-records.md` → *Triage record* (ADR 0046). Every
writer reads the open records before it creates one: a record that plainly states the same defect gets a
comment carrying the new finding, and no second record is created (ADR 0145).
_Avoid: "draft issue" (no backend the plugin supports has a draft issue state outside GitHub's project
boards), "triage slice" (it has no spec, no acceptance, and no place in a DAG)_

**Absorbed triage record**: an open **Triage record** that `/superdev:plan`'s prior-art audit offered
and the operator chose to build in this scope. A Definition-of-Done criterion cites it by its reference,
written `(triage <reference>)`, and one criterion may cite several records of one class. The scope anchor's **Absorbs line**,
`**Absorbs:** #<n>[, #<n>]`, names every record the scope absorbed. The backlog survey shows it in its own
`absorbed` bucket while that anchor is open, and `/superdev:wrap-up` closes it once its citing criterion is
met, or once the operator chooses to close it when that criterion is accepted unmet (ADR 0144).
_Avoid: "folded record" ("fold" is the derive pass's word, the plan controller's judgment, for merging a derived
criterion into an existing one), "planned record" (it stays a triage record, not a slice)_

**Untriaged item**: an open record in the slice store that superdev never wrote — it carries neither a
feature label, nor the store's triage signal, nor its intent signal, so it is neither a **Scope anchor**,
nor a slice, nor a **Triage record**, nor an **Intent record**. It is work a human filed and no `/superdev:plan` interview has yet reached. How a given
store recognises and lists one is stated in that store's own `## Untriaged item` section. Only a human acts
on it: reading one is what turns it into a plan or closes it.
_Avoid: "unlabeled issue" (a human's own labels do not make an item triaged), "new issue" (age is not what defines it), "backlog item" (every row in a
**Backlog survey** is one of those)_

**Backlog survey**: the store half of the read-only report `/superdev:status` prints, after the runs' ledger report, grouping every open **Scope anchor**,
every open **Intent record**, every **Triage record**, every **stranded run root**, and every **Untriaged item** in the slice store by the
action each one needs, and ending with one recommended move. A run is live in another session when its
ledger carries a standing step and its run lock is under an hour old. Such a run takes the `running`
bucket, whatever its stage or anchor match, and is never the recommended move. An open anchor with no local
run root whose published snapshot stage is past `planned` and short of `shipped` takes the `elsewhere`
bucket: a run on another machine, never the recommended move, because the survey cannot tell whether it is
live. A stranded run root is a
run whose stage is short of `shipped`, that matches no open anchor, and that is not live in another
session. It ranks as the most expensive item in the table, where an
untriaged item ranks last: it is the furthest from finishing, and it is the one bucket the survey caps
rather than printing whole, since a store with real reporters holds more of them than the rest of the
table put together. It reads the store where the ledger report above it
reads the runs, and it shows an unreleased plan, an anchor nobody
decomposed, a triage record, and an untriaged item. A survey resolves an ambiguity toward showing the
row (ADR 0049). It writes nothing and sits outside the implement
chain.
_Avoid: "backlog sweep" (a **Sweep** reads a whole tree; the backlog survey reads the slice store
instead), "backlog command" (the survey is part of `/superdev:status`, ADR 0163)_

**Test audit**: the read-only whole-tree sweep `/superdev:review-tests` runs, made of two audits on every run: the **cost audit**, which prices a suite many scopes have grown, and the **gap audit**, which finds the code a suite does not test. The cost audit measures where a **timing command** is configured, dispatches `test-auditor` over every test file in one pass, and ranks its findings by cost. The gap audit dispatches `test-gap-auditor` over the source outside the test paths, and ranks its findings by risk. Survivors of both reach `/superdev:plan` as an intent, except under **Chained posture**. It reaches what a review cannot: a duration is invisible to reading, a redundant pair has a second half outside any range, and standing code outside any scope has no Definition of Done to judge its tests against. A dead or ignored test reports as a fact, and every remaining finding is a judgment the operator may reject before it survives. Unchained, its only writes are the intent, an observation's triage record, and the one-line `.gitignore` entry that keeps `.superdev/` ignored when
absent; chained, it writes nothing at all. It sits outside the implement chain (ADR 0066, ADR 0162).
_Avoid: "test review" (review is the code-review family, and this one neither resolves a range nor gates a merge), "suite audit" (`Audit` already names the doc loop's reader-first mode), "coverage audit" (the gap audit reads statically and measures no line coverage)_

## Separation of concerns

**Execution playbook**: the linear, tier-specific procedure that runs a scope's whole `/implement` execution, start to finish. It is `references/implement-full.md` (full tier) or `references/implement-lite.md` (lite tier), computed and `Read` by the controller once the tier is known. Each playbook opens by reading `references/run-init.md` (run init) and closes by reading `references/run-handoff.md` (run handoff). The `/implement` command body therefore keeps config and input, the tier computation, the invariants, the model table, the issue-status map, and red flags. Control never returns to it once a playbook starts.
_Avoid: "command" (the playbook is the file the command delegates to, not the command itself)_

**Review checklist**: the shared file (`references/review-checklist.md`) naming the binding rules, concrete anti-patterns, and vulnerability classes, read at dispatch time, beside the lens files that only some reviewers read: `references/review-design-lenses.md` (design smells, a reuse-audit lens, a consistency lens with convention drift, cross-slice divergence, and glossary drift), `references/test-cost.md`, `references/test-gaps.md`, `references/review-coverage.md`, `references/fail-to-pass.md`, `references/untraced-writes.md`, `references/dependency-verification.md`, and `references/prompt-concept-overlap.md`. `final-reviewer` applies the checklist and the design lenses, `slice-reviewer` applies anti-patterns and vulnerability classes, and `test-auditor` applies the test lenses plus `test-cost.md`'s `## Test cost`, which only it reads because those two need a measured duration (ADR 0066). A reviewer reads `prompt-concept-overlap.md` only where the reviewed repository's `CONTEXT.md` defines **Prompt concept**. It follows the same shared-file-read-at-dispatch pattern as `Execution playbook`, one level down: a checklist of things to look for, not a procedure to follow.
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

**Drift assertion**: a deterministic check in the repo's test chain that a mechanical fact holds (a link or section target resolves, a number is unique, a file or command exists, a property of code or configuration holds) or that shipped prose carries no forbidden form. It never asserts how a positive clause is worded (ADR 0153).
_Avoid: "drift test" (it is an assertion inside the existing chain, not a suite), "consistency check" (too generic, because that names a review lens)_

**Bootstrap** (mode): the brownfield-seed mode of `/superdev:document` (empty args, `AGENTS.md`-hierarchy convention, root `AGENTS.md` absent). The doc-writer seeds the root and child `AGENTS.md` files from the existing code and proposes `CONTEXT.md` candidate terms, which the controller confirms or prunes with the user before committing. A range or area invocation never bootstraps.
_Avoid: "init", "scaffold" (bootstrap seeds from what already exists, and it does not scaffold empty structure)_

**Writing standard**: the prose style the doc agents apply, recorded as a pointer in a `## Writing standard` section of `docs/agents/documentation.md`. The value is `controlled` (the language-neutral rule set shipped as `references/controlled-prose.md`, merged from ASD-STE100, the tekom rule catalogue, and the *Handbook of Technical Writing*), a repo-relative path to the project's own style guide, or `none`. It binds only the prose an agent writes or rewrites in that dispatch, never untouched text (ADR 0012).
_Avoid: "style guide" (that names one possible value, a repo's own file, not the config), "STE" (one of the three sources, not the standard), "tone" (a voice property, where the standard governs form), "linter" (there is no deterministic check, and the doc-reader is the verifier)_

**Content type**: the kind of information a passage of documentation carries: `interface` (what a part is called), `reference` (data the reader looks up), `conceptual` (why the thing exists and when to reach for it), `procedural` (the steps to perform a task). Shipped as `references/content-types.md`, a lens both doc agents read at dispatch. The doc-writer applies it, and the doc-reader flags an absent conceptual layer as `conceptual:` in its cold read (ADR 0014). Unlike the **Writing standard** it is never configurable and never `none`: coverage is a completeness property, not a style one.
_Avoid: "doc type" (the type classifies a passage, not a whole file, and one `AGENTS.md` carries several), "information type" (the DITA term for a stricter topic-level schema superdev does not adopt), "section"_

**Staged page**: one knowledge-base page `/superdev:document` writes as a `.md` file to `.superdev/kb-pending/<scope>/` in the repository's main working tree, instead of sending to a remote backend. `scope.js staging <scope>` resolves that directory from any checkout, so a page staged from a scopetree survives the scopetree's removal (ADR 0119). It carries YAML frontmatter with the page `title` and an `action` of `upsert`, `patch`, or `delete`, and the page body below it. An optional `parent` names the title of the page it is created under (ADR 0109). On a knowledge base whose hierarchy is body links, a page that names a `parent` also carries `parent-section` and `parent-link`, the **parent link** publish-kb writes into that parent (ADR 0168). A `patch`'s body is one section of an **aggregate page** (ADR 0027). The filename and path rules live with the staging commands. The page waits until `/superdev:publish-kb` applies it, which is the only path from superdev to a remote backend. A local `docs/kb/` backend produces none, because its pages are repository files (ADR 0023). A staged `upsert` records the hash of the live body it was built from, and `/superdev:publish-kb` refuses it when that body has changed, or when it records none and the page exists (ADR 0094). The reader test reads every staged page whose action is not `delete` against the scope's code before publish (ADR 0219).
_Avoid: "draft" (a draft is unfinished, and a staged page is final and merely held), "pending page" (that names the state, not the artifact)_

**Parent link**: the list-item line in a parent page's body that links one child page, on a knowledge base whose configuration declares `- **Hierarchy:** links` because its backend cannot nest pages (a Forgejo wiki). A staged page carries it as `parent-link`, written whole in the link form the configuration states, together with `parent-section`, the ATX heading in the parent it belongs under. A `{sub_url}` placeholder in its link target is filled by `/superdev:publish-kb` from the child's own `find` answer. `/superdev:publish-kb` adds it to the live parent after the child lands, and removes it when the child is deleted. A parent links a child when one of its list items has link text equal to the child's title, whatever the link's target spelling (ADR 0168, INV-0170, INV-0164).
_Avoid: "nesting" (that is the Confluence model `parentId` serves), "index entry"_

**Topic page**: a knowledge-base page the outline names explicitly, holding one subject a reader looks up, such as tests or review. Every scope whose change touches the subject extends that page, so the page outlives the feature that first wrote it. A subject no outline entry covers gets a new outline entry first, never a page of its own.
_Avoid: "feature page", "mechanism page", "feature specification" (each names the per-feature page this replaces), "hub page" (a page of links over other pages)_

**Aggregate page**: a knowledge-base page many scopes each contribute one section to, rather than one a single scope owns end to end: an index, a changelog, a glossary. The knowledge-base outline marks which pages aggregate, and `/superdev:setup` asks. A marked page is staged one section at a time (`action: patch`) and merged into the live page by that section's heading, because the doc-writer reaches no backend and so cannot see the sections other scopes already wrote. Replacing it wholesale drops them (ADR 0027).
_Avoid: "shared page" (every page is shared with its readers, and what distinguishes this one is many writers), "index page" (an index is one instance, not the class)_

**Positive absence**: the verdict that a knowledge-base page genuinely does not exist, as against a backend that could not answer. A **Backend command contract**'s `find` template asserts it with a distinct exit code, so every accidental path — a transport error, a filter that matches nothing on an authorization failure — falls through to "could not answer" and leaves the page staged. It is the one verdict that lets `scripts/publish-kb.js` create a page, which is why creating on anything weaker is what drops an **Aggregate page**'s other sections (ADR 0027, ADR 0069).
_Avoid: "not found" (that is what a 404 says, and a 404 from `read` for a title `find` listed is a read failure), "missing" (implies something went wrong, where this is a settled fact), "empty result"_

**Inline doc pass**: the documentation pass a `lite` run performs in the controller's own context, as its playbook's last step, instead of through a dispatched doc-writer. It follows `references/doc-pass.md` and is recorded as the ledger's `**Docs:**` line. `/superdev:document` dispatches the doc-writer after it all the same, so the writer names the docs it judges current and the doc-reader tests them. On every live run `/superdev:document` hands the doc-reader the scope's own commits as its commit range, so the reader judges the doc lines the inline pass added against the writing standard. `/superdev:document` takes no decision from the `**Docs:**` line (ADR 0031, ADR 0219). A `full` run never performs one, because its parallel slicetrees collide on shared doc files.
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

**Repository component**: the slice-store value that marks an issue as this repository's, for a store several repositories share — a Jira component, set on every issue superdev creates and required by every query it runs. Optional: a store one repository owns names none. Recorded in `docs/agents/issue-tracker.md`.
_Avoid: "component" alone (that names a unit of code, **Component** above), "project" (the shared store itself)_

**Issue-type role**: what an issue does for superdev in a slice store with typed issues — scope anchor, slice, or triage record. Each role names the issue types it allows, each with a one-line "use for", the first being the role's default; superdev creates an issue only in a type its role allows and counts an issue of any other type as none of its own (ADR 0195).
_Avoid: "issue type" for the role (one role allows several types), "kind"_

**Assignee**: the slice-store account every issue a run creates is assigned to. It is a single store-native identifier (a login for Forgejo or GitHub, an `accountId` for Jira), read from **Operator configuration**, resolving to the API token's own identity when unconfigured and disabled by `none`. Configuration rather than a slice field, applied at creation to the epic and every slice. How a given store applies it is stated in that store's own `## Assignee` section, which specialises `plan-contract.md` → *Assignee* (ADR 0010, ADR 0073).
_Avoid: "owner" (too generic), "creator" or "reporter" (the store already records who filed the issue, and assignee is who owns it), "reviewer" (a pull-request role, owned by the code host)_

**Operator configuration**: `.superdev/info.json`, the untracked, repository-local file holding what belongs to the person running superdev rather than to the repository: the **Assignee**, with the name the slice store holds for that account as its display-only `displayName`, the operator's tea login for a Forgejo knowledge base, and the time bounds superdev applies (`code-host.pushTimeoutMs`, `verification.failToPassFloorMs`, `verification.failToPassControlMs`, `knowledge-base.timeoutMs`). It is the only place superdev reads a setting from, since superdev defines no environment variable (ADR 0207). Keyed by role (`issue-tracker`, `code-host`, `verification`, `knowledge-base`), and untracked by construction, because `.superdev/` is git-ignored. Distinct from the tracked `docs/agents/*.md` configuration, which states what the whole team shares (ADR 0073).
_Avoid: "user config" (superdev's user is the repository, not the person), "settings", "profile", "credentials" (tokens stay in an environment variable or the host CLI's login, and never enter this file)_

**Deploy posture**: what `/superdev:ship` does with a feature's deploy targets once the pull request has merged, stated once for the whole repository in `docs/agents/deployment.md`. `none` deploys nothing. `manual` prints each target's command and records the target as pending, because the operator deploys outside superdev. `auto` runs each target's command in a tree checked out at the merge commit. `/superdev:setup` defaults to `manual` and never to `auto`. A repository with no `docs/agents/deployment.md` reads as `none` (ADR 0101, INV-0098).
_Avoid: "deploy mode" (a second name for the same thing), "CI" (superdev asks the host nothing about a deploy), "release" (a release batches every merged feature, and a deploy belongs to one feature)_

**Deploy target**: one named row of `docs/agents/deployment.md`'s targets table. It gives the command that deploys it and how to reach it read-only for verification. A feature's scope anchor lists the targets it deploys to on its `**Deploy:**` line, in deploy order, or carries `**Deploy:** none`. `/superdev:plan` writes that line, and `/superdev:ship` reads it from the anchor when it runs (ADR 0101).
_Avoid: "environment" (a target is one deployable unit, and one environment may hold several), "host" (a target need not be one machine)_

## Plugin surface

**Model-invocable surface**: a skill the model can start on its own through the Skill tool, as against one only the operator can, by typing its slash command. Every skill is one unless its frontmatter carries `disable-model-invocation: true`. An external driver invokes each step of the chain through the Skill tool, and `/superdev:plan` and `/superdev:implement` start `/superdev:setup` and `/superdev:plan` the same way, so each of them must stay one. A covered command starts its successor the same way once the operator agrees to its **Offer**, so every superdev skill, `/superdev:ship` included, stays one (INV-0066, ADR 0157).
_Avoid: "auto-invoked" (that names implicit activation by description match, a different property), "callable", "public"_

**Shipped tree**: the `plugin/` subdirectory, which is everything a user's install copies and nothing else, because the marketplace manifest's `source` names `plugin` as its `path`, at the release tag its `ref` pins (ADR 0131). Everything outside it — `tests/`, `scripts/`, `docs/` — is maintainer-only and reaches no user.
_Avoid: "the plugin" (that names the product, not the tree), "dist", "build output" (there is no build step)_

**Test seam**: code in the **Shipped tree** that exists only so superdev's own suites in `tests/` can drive it: an environment variable only a test sets, a parameter or default value only a test passes or relies on, an option only a test uses, an export nothing requires, or a comment that names a suite. The shipped tree carries none (ADR 0154). The exports a suite requires and the `require.main` guards are the module interface ADR 0059 chose, not test seams. A test reaches a branch a seam used to expose by substituting on its own side.
_Avoid: "test hook" (a hook is a Claude Code event handler), "test mode", "debug flag"_

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

**Knowledge base**: the optional human-first record, organized as **topic pages**, distinct from the agent-first `AGENTS.md` docs. It may be `none`. The doc-writer reconciles it, and writes a remote backend's pages as **staged pages** rather than sending them. `/superdev:publish-kb` is the only command that reaches a remote backend (ADR 0023).
_Avoid: "docs" (too broad, because the AGENTS.md tree is separate), "wiki" (that is one KB)_

**Backend command contract**: the five named shell command templates — `find`, `read`, `create`, `update`, `delete` — a remote knowledge base declares under the `## Commands` section of `docs/agents/knowledge-base.md`, one `### <verb>` subsection each. `/superdev:setup` writes them and `scripts/publish-kb.js` is the only runtime reader: it resolves a verb by heading name, never by position, runs it under `sh -c` with `sh` resolved from PATH (ADR 0150), and passes every value in one JSON file, the template's `$1`, rather than interpolating it (ADR 0207). Every one of the five runs under a time bound, and a call that exhausts it stops the batch rather than costing that bound once per staged page (ADR 0130). A backend declaring no `read` template can carry no **Aggregate page**, because nothing can fetch a live body to merge into (ADR 0069).
_Avoid: "backend config" (that is the whole `docs/agents/knowledge-base.md`, of which this is one section), "hook" (a hook is a shipped guardrail the harness fires)_

**Response shape**: a fixed layout for a message a command shows the operator, defined once in `references/response-shapes.md`. A skill cites the shape it uses and restates none of it (ADR 0113).
_Avoid: "template" alone (a knowledge base's **Backend command contract** templates are shell commands), "output style" (a Claude Code setting that changes every session, not one command's message)_

**Next block**: the `### Next` section that closes a covered command's last message, holding the next command and one line on what it does, defined once in `references/response-shapes.md` (ADR 0113, INV-0111).
_Avoid: "handoff" (run handoff is the closing procedure of an execution playbook), "call to action"_

**Offer**: what an attended covered command makes at its end, before its Next block, to start the one next command that block names. Where the desktop app's session tool is present, it is a New task card put up at once with no question: the card starts the command in a new session with a fresh context, or here through its Do it here button. Without the tool, it is one `AskUserQuestion`: Stop here (recommended) or Start. A command another session's brief asked for offers too. A command another command's step started makes none while the starting command goes on after it; when that step ends the starting command, as `/superdev:verify-ship` starting `/superdev:wrap-up` at its settled exit, the started command offers. An unattended run and a command in the chained posture make none (ADR 0157, ADR 0176, ADR 0183, ADR 0201, ADR 0224, INV-0111).
_Avoid: "prompt" (prompt prose is the text of a skill or agent), "auto-continue" (nothing continues without the operator's yes)_

## Roles

The subagents the controller dispatches. Each runs in isolated context and only its result returns. **Controller** and **Final-reviewer** carry discipline beyond their name, defined under _Controller discipline_ and _Review discipline_ above.

**Implementer**: builds **one** slice test-first (TDD), the laziest version that works. Never merges (a hook enforces it).
_Avoid: "developer", "coder"_

**Slice-reviewer**: per-slice correctness gate (full tier, `behavior` slices). It verifies against the slice's acceptance, reads the slice's recorded runs in the run trace, and reads the produced artifact, hunting uncovered input. It runs no test.
_Avoid: "reviewer" (unqualified, so say which)_

**Simplicity-reviewer**: the over-engineering reviewer. It names what to delete and what a standard-library or native feature replaces; its findings are advisory and gate nothing. Read-only. Two dispatch sites, one per tier: `full` runs it per `behavior` slice, beside the slice's first review, and the warranted cuts join that review's fix list (ADR 0138), and `/superdev:review` then skips it on a full-tier scope whose every slice is `behavior`, leaving the cross-slice case to `final-reviewer`'s Brevity axis; a full-tier scope with a `mechanical` or `docs` slice gets the whole-scope dispatch a `lite` scope gets (ADR 0210). `lite` has no per-slice review, so `/superdev:review`'s whole-scope dispatch is the only pass it gets (ADR 0037).
_Avoid: "the simplicity review" unqualified (name the tier, because which site runs is what differs); "linter", "critic"_

**Doc-writer**: reconciles the in-repo docs (the AGENTS.md tree) and the knowledge base with the merged code, removing stale text. Run by `/document`.
_Avoid: "documenter", "technical writer"_

**Doc-reader**: the reader test, a fresh-context, read-only verifier that reads docs cold and checks their claims against the repo (paths, commands, described behavior). Its file list holds the docs the doc pass changed, the docs the doc-writer judged current, and every **staged page** whose action is not `delete` under the run's staging path. Run by `/document` after every doc pass (ADR 0219). Findings trigger one doc-writer fix round.
_Avoid: "doc-reviewer" (it tests grounding and first-read clarity, not prose quality)_

**Gap audit**: the half of a **test audit** that finds untested code: a symbol no test reaches (`untested`), and a symbol whose tests leave a named argument class or scenario untested (`missing case`). It reads every tracked code file outside the test paths, statically, with no coverage tool, so every finding is a judgment labelled `static`. A gap belongs to one symbol, so the gap audit may split its source set into parallel batches, where the cost audit stays one pass (ADR 0162).
_Avoid: "coverage audit" (it measures no line coverage)_

**Test-auditor**: read-only. Prices a whole test tree in one pass against a duration table, naming what each test costs against what it proves. Dispatched once, over the whole swept set, by `/superdev:review-tests` (ADR 0066).

**Test-gap-auditor**: read-only. Reads a batch of source files with the list of test files, and reports each `untested` symbol or `missing case`, naming the symbol and the case. Dispatched by `/superdev:review-tests`, one per batch, in parallel (ADR 0162).
_Avoid: "test reviewer" (review is the code-review family; this prices cost, not correctness)_

**Dispatch prose**: the text a command sends to a subagent, as distinct from that subagent's own body. Both reach the model in one prompt, and the dispatch is the later, more specific instruction, so it wins a conflict between them. A behaviour contract stated in an agent body therefore also has to hold in every dispatch that reaches it (ADR 0035).
_Avoid: "the prompt" (ambiguous between the two halves)_

**Prompt concept**: the unit of prompt prose in a **governed body**: an agent body, or a skill file this entry lists. The listed skill files are `plugin/skills/review/SKILL.md`, `plugin/references/review-scope-mode.md`, `plugin/skills/ship/SKILL.md`, `plugin/skills/submit-pr/SKILL.md`, `plugin/skills/document/SKILL.md`, `plugin/skills/verify-ship/SKILL.md`, `plugin/skills/wrap-up/SKILL.md`, `plugin/skills/implement/SKILL.md`, `plugin/skills/plan/SKILL.md`, `plugin/skills/setup/SKILL.md`, `plugin/skills/status/SKILL.md`, `plugin/skills/brainstorm/SKILL.md`, `plugin/skills/upgrade/SKILL.md`, `plugin/skills/publish-kb/SKILL.md`, `plugin/skills/review-tests/SKILL.md`, and `plugin/skills/sweep/SKILL.md` (ADR 0190). It is a rule set with a clear boundary. Each one holds seven invariants:

- **Boundary.** It has a name, and its content clearly belongs to it.
- **Encapsulation.** It reads without any sibling. A pointer to another concept is a reference, not content.
- **No overlap.** No two sentences apply under the same condition and give the same instruction, in the body or in a reference section the body directs its reader to read. `prompt-concept-overlap.md`'s `## Prompt-concept overlap` states the test and how a reviewer grades a pair (ADR 0170).
- **Effect.** It changes what the agent does or outputs. Rationale and history are not prompt concepts.
- **Condition at the head.** When it applies is stated once, at its head.
- **No conflict.** No two concepts instruct differently for one situation without a stated precedence.
- **One term per thing.** One name stands for one thing, and it is this glossary's name where one exists.

A prompt concept is stated in at most three **main sentences**. Tables, lists, output templates, and code spans carry data, so the cap does not count them. The cap does not count the condition head either, the "Applies to …" sentence that states when the prompt concept applies. A heading may hold several prompt concepts. In a listed skill file, the numbered steps keep their order and hold the prompt concepts. A prompt concept whose condition is its step's trigger takes that trigger as its condition head.
_Avoid: "concept" unqualified (the invariant register's `Concepts` field names glossary terms), "section" (a heading may hold several), "rule" (one prompt concept may carry several rules)_

**Main sentence**: one simple main clause, with no comma, no subordinate clause, and no other inner punctuation. It is the unit a **Prompt concept**'s three-sentence cap counts. The cap counts main clauses, so a written sentence that joins main clauses counts once for each main clause it joins.
_Avoid: "sentence" unqualified (the controlled-prose limit counts words, not clauses)_
