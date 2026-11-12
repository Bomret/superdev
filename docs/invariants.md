# Invariant register

Rules this repository's system may never break. `plugin/references/domain-modeling.md` owns the entry
format; `/superdev:plan` adds an entry when one crystallises.

On a `Check:` line, backtick only drift check ids after `scripts/drift-check.js`, and write other words
there unquoted. The `invariant-register-join` drift check reads every backticked token of lowercase words
joined by hyphens there as a check id, and fails an id that the registry does not carry.

### INV-0001

Class: architecture
Statement: No superdev command commits to the base branch, with one exception: `/superdev:ship`'s merge of the pull request through the host's merge API, pinned to the tested head (ADR 0096). Every other write a run makes lands on that run's own scope branch, in its own scopetree. No command merges or pushes to the base branch with local git. The only local-git write to the base branch is implement's ref-only fast-forward of the local base ref to the fetched remote tip, `git fetch . <tip>:refs/heads/<base>`, which git refuses when the base is checked out in any worktree or the update is not a fast-forward (ADR 0120).
Concepts: Base branch, Scope branch, Scopetree, Run root
Breaks: silently
Check: scripts/drift-check.js `no-base-branch-commit` — no shipped prose instructs a commit to the base branch
Paths: plugin/skills/**, plugin/references/**

### INV-0002

Class: process
Statement: A load-bearing commitment that reaches /superdev:plan leaves the run either as an invariant register entry or as a reason, named out loud, that it implies no entry. A rejected direction a seeded intent carries leaves it in an ADR's Considered options, in the epic's non-goals, or with a reason, named out loud, that it is dropped. None of either is dropped in silence.
Concepts: Load-bearing commitment, Rejected direction, Invariant register, Intent
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/brainstorm/**, plugin/skills/plan/**, plugin/references/domain-modeling.md

### INV-0003

Class: architecture
Concepts: Containment, Scope branch, Base branch
Statement: A containment test answers contained only on positive evidence that base holds the branch's work — an equal tree, or a patch id base's history carries. Every path that cannot answer, whether a failed git call, an exhausted bound, or an unresolved ref, answers not contained.
Breaks: silently
Check: tests/scope-containment.test.js, tests/scope-prune-containment.test.js, tests/scope-prune-guards.test.js — each failure path asserted to answer not contained
Symbols: testContainment, judgeContainment, baseHistoryHasPatch, containedInBase
Paths: plugin/lib/containment.js, plugin/lib/git-spawn.js, plugin/hooks/scope-prune.js, plugin/references/scope-mode.md, plugin/references/scope-branch.md

### INV-0004

Class: architecture
Concepts: Definition of Done (DoD), Append mode, Scope anchor
Statement: A Definition of Done is a claim verified at one moment against one change. A ticked criterion is always readable against the change it was verified against, and is never pooled in one record with criteria from another run.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/plan/**, plugin/references/run-init.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/plan-extend.md

### INV-0005

Class: process
Concepts: Release, Append mode, Scope anchor
Statement: A release decision covers the work that existed when it was made. Work added to a feature after its release does not inherit that release.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md

### INV-0006

Class: architecture
Concepts: Definition of Done (DoD), Verification ceiling, Scope branch
Statement: Verifying a Definition-of-Done criterion observes. It changes no system outside the repository. An item that needs an outward-facing change to verify stays unticked, with a note, for the operator to verify after merge. After the merge, `/superdev:verify-ship` observes the deployed system read-only and runs no deploy target's command (ADR 0106).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/scope-mode.md, plugin/agents/final-reviewer.md, plugin/agents/implementer.md, plugin/skills/review/**, plugin/references/review-scope-mode.md, plugin/skills/implement/**, plugin/skills/document/**, plugin/references/run-handoff.md, plugin/references/dod-ticks.md, plugin/skills/verify-ship/**

### INV-0007

Class: process
Concepts: Focused test command
Statement: A configuration a repository cannot supply is recorded with its reason, never inferred from an absent setting.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/setup/**, plugin/references/test-selection.md, plugin/skills/plan/**, plugin/skills/implement/**

### INV-0008

Class: process
Concepts: Definition of Done (DoD), Reachability criterion
Statement: A Definition-of-Done criterion states a requirement the feature meets, never a procedure superdev executes to verify it. A Reachable: criterion names an entrance, which is not a procedure.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md

### INV-0009

Class: architecture
Concepts: No verdict, Containment
Statement: A spawn whose own bound expired, whether or not its kill succeeded, carries no verdict, on `plugin/scripts/scope.js`, `plugin/lib/containment.js`, `plugin/lib/push.js`, and the `plugin/skills/ship/SKILL.md` and `plugin/skills/submit-pr/SKILL.md` skills. No gate reads its absence as a pass, and no assertion about behaviour stands on it. Such a spawn is reported as killed, never as a decision it never made. A spawn that never started carries a Spawn failure instead, which this rule does not govern (ADR 0087).
Breaks: silently
Check: tests/spawn-verdict.test.js — the helper's throw-or-not and message for the killed, never-started, EPIPE-but-decided, and genuinely-decided result shapes; tests/scope-containment.test.js — the refetch asserts the kill signal rather than the clock; tests/scope-push.test.js — a refetch of base its bound ended prints `timed-out`, never `refused`
Paths: plugin/scripts/scope.js, plugin/lib/containment.js, plugin/lib/push.js, plugin/skills/ship/SKILL.md, plugin/skills/submit-pr/SKILL.md, tests/**

### INV-0010

Class: process
Concepts: Observation, Triage record
Statement: An observation a run meets is recorded, never judged. It carries no severity, holds no stage, enters no fix loop, and blocks no run.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/**, plugin/skills/**, plugin/agents/**

### INV-0011

Class: process
Concepts: Definition of Done (DoD), Ledger, Verification ceiling
Statement: A run's record never claims more than the run earned. A cap reads as held only where it held, a criterion as verified only where it was verified, a release as decided only where somebody decided it.
Breaks: silently
Check: none — a general rule with no single test. Its instances carry their own: INV-0004 (criteria are never pooled), INV-0009 (a process that did not finish carries no verdict), ADR 0084 (verifying observes only).
Paths: plugin/skills/**, plugin/references/**
### INV-0012

Class: architecture
Concepts: Slicetree, Scope branch, Scopetree
Statement: A sweep removes a working tree only on positive evidence that it holds work of its own — a commit unreachable from the default branch, and a tip off its scope branch's first-parent chain. Every path that cannot answer, whether an unreadable ledger, a ledger naming no branch, or a branch that does not resolve, leaves that scope's directories alone. The first-parent half distinguishes a worked slice from a fresh one only because `plugin/references/implement-full.md`'s merge step folds each slice with `--no-ff`; a fast-forward merge would land a worked slice's tip back on that chain and the sweep would stop reaping it.
Breaks: silently
Check: tests/slicetree-sweep.test.js — a slice cut from a scope branch ahead of base survives; an unreadable ledger and an unresolvable branch each sweep nothing for their own scope while siblings sweep normally; its `fold()` helper merges with `--no-ff`, matching the merge step's own flag
Paths: plugin/hooks/slicetree-sweep.js, plugin/references/implement-full.md, tests/slicetree-sweep.test.js

### INV-0013

Class: process
Concepts: Run lock, Live implement run
Statement: `/superdev:implement` entering a run root it did not itself create in this invocation reads the ledger's stage and the lock's freshness before its first write into that run. Any stage other than `planned`, with a lock under an hour old, is a live implement run: attended, the caller asks before writing; unattended, it blocks. A `planned` stage, or a stale or absent lock, imposes no such stop. This governs `/superdev:implement`'s own entry alone — `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, and `/superdev:ship`'s ordinary hand-off is each the chain's own single designed entry, not a case this rule tests, and `/superdev:plan` keeps its own separate, narrower check (triage #510).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/scope-mode.md, plugin/references/run-init.md, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/skills/document/SKILL.md, plugin/skills/submit-pr/SKILL.md

### INV-0014

Class: process
Concepts: Definition of Done (DoD), Tick
Statement: Every judged Definition-of-Done line carries a note. A ticked criterion names its evidence; an unticked one names why it is not met, that only a deploy can verify it, or that an attended operator accepted it as unmet, with any partial evidence. A bare tick is invalid, and a line nobody has judged yet carries no note.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/**, plugin/references/review-scope-mode.md, plugin/skills/implement/**, plugin/skills/review/**, plugin/skills/document/**

### INV-0015

Class: process
Concepts: Definition of Done (DoD), Tick, Criterion tag, Controller
Statement: Only a controller writes a Definition-of-Done tick. It ticks a criterion from an implementer's report only where the criterion's tag names that implementer's slice, and settles every other criterion only in run handoff's own pass, in review, or in document's own untick of a criterion its commits broke. Review's controller may also tick a criterion straight from `final-reviewer`'s own `holds` verdict, with the verdict's evidence as the note. Before the merge, a criterion tagged `docs` is settled only by review's `holds` tick, by review's untick after a fix cycle that landed commits, and by document's own judgment of it after its pass, which ticks it or unticks it (ADR 0161); run handoff leaves it unjudged. After the merge, `/superdev:verify-ship`'s controller ticks a criterion that is neither ticked nor `accepted:`, from its own read-only observation or from the operator's answer (ADR 0106). No subagent writes a tick, and neither `/superdev:submit-pr`, `/superdev:ship`, nor `/superdev:wrap-up` writes one.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/**, plugin/references/review-scope-mode.md, plugin/agents/**, plugin/skills/implement/**, plugin/skills/review/**, plugin/skills/document/**, plugin/skills/submit-pr/**, plugin/skills/ship/**, plugin/skills/verify-ship/**

### INV-0016

Class: process
Concepts: Stage, Definition of Done (DoD), Verification ceiling
Statement: A scope's stage never advances past review while a Definition-of-Done criterion stands unmet, except one only a deploy can verify, one an attended operator accepted as unmet (`accepted:`), or one tagged `docs`, which the doc pass settles (ADR 0161). The stage never advances past the doc pass while a `docs` criterion stands unmet and not `accepted:`. Every scope passes review, whatever its slice types.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/review/**, plugin/references/review-scope-mode.md, plugin/references/run-handoff.md, plugin/skills/document/**

### INV-0017

Class: process
Concepts: Focused test command, Suite record, Run trace
Statement: A slice implementer and a fix cycle run only the tests of their own work: the focused command over their own paths, a direct run of a test file, and the fail-to-pass run over their own range. The full suite runs once per scope, in the scope review, on whichever route of the exit run that `plugin/references/review-scope-mode.md` §4.2 lists the review takes first, and again after a fix cycle that a red result there opened (ADR 0192). The scope review starts that full-suite run at its entry, in the background beside its first reviews, and its exit run reuses a pass at a tip no commit has moved (ADR 0234). Where the repository configures a whole-repo command, it runs once before the pull request opens, on a tip that carries no green whole-repo result at ship (which instead refuses while a review invalidation stands, INV-0092), and in place of the full suite in a review entered while the suite record reads red of kind `whole`. A green result recorded on the commit a step would run on is reused rather than run again, but only where the latest run of that command the run trace records at that commit passed on a clean working tree (ADR 0117). With no record, or a record on another commit, the step reuses the latest full or whole run the run trace records at that commit, whoever wrote it, where it passed on a clean tree; a step that needs a whole-repo run reuses only a whole one (ADR 0182). A green result recorded on an ancestor of that commit is reused too, but only where every path that differs between the two ends in `.md`, is no test path, and is not a `docs/agents/verification.md` whose run configuration differs from the recorded commit's (ADR 0230), the run trace backs the recorded commit with a passing full or whole run on a clean tree, and no full, whole, path, or focused run it records at the tip failed and its latest run there does not read `unknown`. The carry needs no test run at the tip, and a passing run on a dirty tree refuses nothing (ADR 0128, ADR 0189). Where `docs/agents/verification.md` at the tip carries the complete-selector declaration and the focused command carries `{paths}`, a green record on an ancestor is reused too when the run trace backs the recorded commit with a passing full or whole run on a clean tree, the run trace records at the tip a passing focused run on a clean tree, written by `scope.js` with the path set it ran over, that covers every path changed since the record, no changed path is a `docs/agents/verification.md` whose run configuration differs from the recorded commit's, nor a file the declaration lists, and no full or whole run, nor any run of a test file named directly, at the tip failed (ADR 0175). No verb writes a carried record, so every carry is judged from the recorded commit. Every ship gate whose reuse check refuses takes the focused carry before it refuses: a carried tip merges, a failing carry run is the gate's red result, and a tip with no carry refuses or runs the whole-repo command as before (ADR 0194). Under the same declaration the two carries chain once: a green record on an ancestor is reused too when some commit on the ancestry path to the tip takes the focused carry from the recorded commit, judged at that commit, and the range from that commit to the tip passes the Markdown-only rule, judged at the tip (ADR 0189). Under the same declaration, a full run at the tip that failed in one test file counts green once, when the ledger records a rerun naming that file, the tip, and a triage record, that file alone then passed at the tip on a clean tree, run at the tree root (ADR 0232), with every run of it alone the run trace records there after the failed full run passing on a clean tree and the runs recorded before that failure counting for nothing, a focused run over the scope's range then passed there, and no other full run, nor any run of another test file, at the tip failed (ADR 0172). That red record counts at a later tip too, when its commit is an ancestor of that tip, every rerun condition holds when judged at its commit, and the range from its commit to the tip passes the Markdown-only rule, judged at the tip (ADR 0189). Nothing reruns a failed run on its own. Any git error while deciding this refuses reuse. A result recorded on any other commit is not, and neither is one the run trace does not back. A step that needs a whole-repo run reuses only a record of kind `whole`. A fail-to-pass run is no suite run: it runs the command its caller hands it, which names the range's test files, records no suite result, and its control run writes a `path` run line that backs no suite record (ADR 0134, ADR 0182).
Breaks: silently
Check: tests/scope-suite.test.js — the suite record's read and write, and `suite reusable`'s tip-match cases, Markdown-only carry cases, focused-run carry cases, rerun cases, and run-trace backing
Paths: plugin/references/run-handoff.md, plugin/references/scope-mode.md, plugin/references/run-state.md, plugin/references/test-selection.md, plugin/lib/suite-base-get.js, plugin/lib/test-verb.js, plugin/lib/fail-to-pass.js, plugin/skills/review/**, plugin/references/review-scope-mode.md, plugin/skills/submit-pr/**, plugin/skills/ship/**, plugin/agents/implementer.md, plugin/scripts/scope.js

### INV-0018

Class: process
Concepts: Slice-reviewer, Implementer
Statement: The slice-reviewer runs no test and never passes a slice on the implementer's reported result. It reviews against the slice's runs the run trace records: the implementer's own test runs and the control run of its fail-to-pass run. The controller hands it no test result and runs no test for it (ADR 0178, ADR 0182).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/slice-reviewer.md, plugin/references/implement-full.md, plugin/skills/review/**, plugin/references/review-scope-mode.md

### INV-0019

Class: process
Concepts: Definition of Done (DoD), Acceptance
Statement: A Definition-of-Done criterion names observable, user-facing behaviour. A proxy count (coverage, line count, lint score) may appear as a reviewer signal, never as a gate.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/plan-contract.md, plugin/skills/plan/**

### INV-0020

Class: process
Concepts: Judge discipline, Final-reviewer, Slice-reviewer, Simplicity-reviewer, Test-auditor
Statement: Every review agent verifies the artifact itself and never defers to a narrative about it, and treats length or an elaborate structure as no evidence on its own, adapted to the subject it judges.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/**, plugin/skills/plan/SKILL.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/skills/review-tests/SKILL.md, plugin/references/implement-full.md

### INV-0021

Class: process
Concepts: Final-reviewer, Doc-writer, Scope checkout
Statement: The doc reconcile runs after the final review and its fix loop, never concurrently with them, so it describes the final state.
Breaks: silently
Check: none — enforced by chain structure only
Paths: plugin/skills/review/**, plugin/references/review-scope-mode.md, plugin/skills/document/**

### INV-0022

Class: process
Concepts: Parked questions, Slice graph, Touch map, Epic
Statement: The epic's `## Parked questions`, `## Slice graph` and `## Touch map` are advisory. `/superdev:implement` and its references never read them or gate on them.
Breaks: silently
Check: none — no absence scan exists
Paths: plugin/skills/implement/**, plugin/references/run-init.md, plugin/references/implement-*.md

### INV-0023

Class: process
Concepts: Load-bearing decision, Parked questions, Epic
Statement: An unresolved load-bearing decision is parked on the epic only on a multi-slice plan. A single-slice plan has no epic to park it on.
Breaks: silently
Check: none — a judgment
Paths: plugin/skills/plan/**, plugin/references/plan-extend.md

### INV-0024

Class: architecture
Concepts: Run root, Scope
Statement: Every run-root scan reads `.superdev/scopes/*/` only. A directory beside `scopes/` under `.superdev/` is never treated as a run root.
Breaks: silently
Check: none — no test covers a sibling area
Paths: plugin/hooks/scope-prune.js, plugin/hooks/slicetree-sweep.js, plugin/scripts/scope.js, plugin/lib/main-work-tree.js, plugin/skills/status/SKILL.md

### INV-0025

Class: process
Concepts: Stage, Ledger
Statement: Only `/superdev:submit-pr` writes the `submitted` stage, and only after opening the pull request. Only `/superdev:ship` writes the `shipped` stage, and only once the pull request has merged — through its own pinned merge, or by adopting a merge someone made by hand. `scope.js adopt --shipped`, run by `/superdev:plan`'s repair choice, `/superdev:verify-ship`, and `/superdev:wrap-up`, writes a ledger reading `shipped` only as a copy of the stage the anchor's own `## Run state` snapshot already records, so it moves no stage (INV-0132).
Breaks: silently
Check: none — no single-writer pin
Paths: plugin/skills/submit-pr/SKILL.md, plugin/skills/ship/SKILL.md

### INV-0026

Class: process
Concepts: Implementer, Slice, Acceptance
Statement: No agent writes a slice's tests ahead of its implementation. The loop writes one failing test, the minimal code that passes it, and repeats.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/agents/implementer.md, plugin/references/implement-lite.md

### INV-0027

Class: architecture
Concepts: Feature label, Slice store, Epic, Depends-on
Statement: On the GitHub store, a feature's slices are listed by feature label only. Sub-issue and dependency relations record structure and are never used to find slices.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/issue-tracker-github.md

### INV-0028

Class: process
Concepts: Depends-on, Slice store
Statement: A failed dependency write stops the run, because it would corrupt the execution order. A failed sub-issue link is logged and the run continues.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/issue-tracker-github.md

### INV-0029

Class: process
Concepts: Writing standard, Doc-writer, Doc-reader
Statement: The writing standard binds only prose a doc agent writes or rewrites in that dispatch. It never governs untouched text.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/controlled-prose.md, plugin/agents/doc-reader.md, plugin/agents/doc-writer.md

### INV-0030

Class: architecture
Concepts: Writing standard, Seed
Statement: The doc agents read which writing standard applies from the `## Writing standard` pointer in `docs/agents/documentation.md`. None carries a standard of its own.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/documentation.md

### INV-0031

Class: process
Concepts: Scope mode, Final-reviewer
Statement: `/superdev:review` writes nothing to the operator's checkout on an ad-hoc range. Its one ad-hoc write is the inline fix, which runs only after an attended yes and lands on a fresh `review-fix/` branch in a worktree under the main working tree's `.superdev/`; review merges, pushes, and opens nothing there. `--chained` and `--unattended` write nothing (ADR 0228). It writes elsewhere only when it reviews a live scope.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/review-inline-fix.md

### INV-0032

Class: process
Concepts: Run lock, Scope mode
Statement: `/superdev:review`, `/superdev:document`, `/superdev:submit-pr` and `/superdev:ship` refresh an existing `run.lock`'s mtime and never create one.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/scope-mode.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/skills/document/SKILL.md, plugin/skills/submit-pr/SKILL.md, plugin/skills/ship/SKILL.md

### INV-0033

Class: architecture
Concepts: Stage, Ledger
Statement: A chain command reads where a scope stands from the ledger's recorded stage, never from git history or report files.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/**

### INV-0034

Class: process
Concepts: Stage
Statement: `/superdev:submit-pr` warns when the ledger shows a skipped review or doc pass, and does not refuse on it.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/submit-pr/SKILL.md

### INV-0035

Class: process
Concepts: Content type, Doc-writer, Doc-reader, Writing standard
Statement: Both doc agents read `references/content-types.md` at every dispatch, independent of the writing standard. The reader checks coverage in its whole-file cold pass, audit included. The lens is never configurable and never `none`.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/content-types.md, plugin/agents/doc-writer.md, plugin/agents/doc-reader.md

### INV-0037

Class: architecture
Concepts: Unattended token, Run root
Statement: `--unattended` is an argument of one invocation and is never written to a run root. After an interrupted sweep, the next command a maintainer types asks its questions as usual.
Breaks: silently
Check: none — an absence with no scan
Paths: plugin/references/scope-mode.md

### INV-0038

Class: process
Concepts: Unattended token, Standing answer, Unattended run, Scope anchor
Statement: A command carrying the unattended token never asks a question and never starts an interview command. At each stop it takes the standing answer written there, or blocks the scope anchor where none is written.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/scope-mode.md, plugin/skills/**, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/references/run-init.md, plugin/references/run-handoff.md

### INV-0039

Class: architecture
Concepts: Scope anchor, Slice store, Seed, Release, Published snapshot, Triage record, Untriaged item, Assignee, Anchor dependency
Statement: No command or agent names a slice store's own mechanics. Each reads them from the matching section of the active store document, which specialises `references/plan-contract.md`.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/**, plugin/agents/**, plugin/references/plan-contract.md, plugin/references/issue-tracker-*.md

### INV-0041

Class: architecture
Concepts: Feature label, Slice store
Statement: The feature label's notation is stated only by the active store document, and no command hardcodes a prefix. Every caller can still name its target.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/implement/SKILL.md, plugin/skills/plan/SKILL.md

### INV-0042

Class: process
Concepts: Ceiling note, Final-reviewer, 3-strike fix loop
Statement: final-reviewer writes at most one ceiling note, only on a review with no Critical or Important finding. It names a satisfied criterion and a concrete consequence, never gates a merge, and never triggers the fix loop.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/agents/final-reviewer.md

### INV-0043

Class: architecture
Concepts: Feature label, Change type, Run root, Ledger, Scope branch
Statement: The scope branch is the feature label verbatim, `<type>/<slug>`, and the run root is keyed on the slug alone. A command reads the branch from the ledger's `**Branch:**` line and never computes it from the slug.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/scope-mode.md, plugin/references/run-state.md

### INV-0045

Class: architecture
Concepts: Staged page, Invoking checkout, Scopetree, Run root
Statement: A staged page is written to an absolute path under `.superdev/kb-pending/<scope>/`, never inside a run root or a scopetree, so no cleanup of either removes it.
Breaks: silently
Check: none — the absolute-path half is unpinned
Paths: plugin/references/doc-pass.md, plugin/skills/document/SKILL.md

### INV-0046

Class: architecture
Concepts: Aggregate page, Backend command contract, Staged page, Knowledge base
Statement: A backend declaring no `read` template carries no aggregate page. `publish-kb.js` leaves every `action: patch` page staged with that reason.
Breaks: silently
Check: `tests/publish-kb-patch.test.js` ("a configuration declaring no read template leaves every patch page staged with that reason")
Paths: plugin/lib/kb-backend.js, plugin/skills/setup/SKILL.md

### INV-0047

Class: architecture
Concepts: Run kind, Execution playbook, Ledger, Stage
Statement: Run init computes a run's kind once, from its ledger alone, as `fresh` or `resumed`. Both execution playbooks read that value and derive none of their own.
Breaks: silently
Check: none — no single-site pin
Paths: plugin/references/run-init.md, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/references/scope-mode.md, plugin/references/scope-branch.md

### INV-0048

Class: process
Concepts: Run kind, Degraded pass, Ledger
Statement: A stop at the scope-branch step writes nothing: no run starts, no ledger entry is written, and no degraded pass is recorded.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/scope-mode.md, plugin/references/scope-branch.md

### INV-0049

Class: process
Concepts: Domain shape, Implementer, Slice
Statement: A slice `spec` names its domain shapes by name, never their fields. The implementer declares those shapes before its first RED test, on both tiers.
Breaks: silently
Check: none — ordering is invisible in a finished diff (the ADR's own reason)
Paths: plugin/agents/implementer.md, plugin/references/plan-contract.md

### INV-0050

Class: process
Concepts: Inline doc pass, Ledger, Tier
Statement: A `**Docs:**` record stands only for the commits its pass saw. `/superdev:document` takes no decision from the record: on every live run it dispatches the doc-writer and hands the doc-reader the scope's own commits as its commit range (ADR 0219). A review fix loop that lands commits clears it. A full-tier run never writes one.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/implement-lite.md, plugin/skills/document/SKILL.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/run-handoff.md, plugin/references/doc-pass.md

### INV-0051

Class: architecture
Concepts: Shipped tree
Statement: An install carries `plugin/` alone. Every file the runtime reads lives under `plugin/`, nothing under `plugin/` requires or reads a repo-root path, and `plugin/` carries no test code.
Breaks: silently
Check: `scripts/drift-check.js` `marketplace-source` (the source's path resolves to a directory carrying `plugin/.claude-plugin/plugin.json`). Nothing checks that shipped files never reference a path outside `plugin/`, or that `plugin/` holds no test code.
Paths: .claude-plugin/marketplace.json, plugin/**, tests/**

### INV-0052

Class: process
Concepts: Expand–contract, Integration branch, Epic
Statement: A plan names an integration branch only when its expand–contract batches cannot each stay green on their own.
Breaks: silently
Check: none — a judgment
Paths: plugin/skills/plan/**

### INV-0053

Class: process
Concepts: Release, Scope anchor, Unattended run
Statement: A feature is built only once released, or on a human's explicit confirmation. `/superdev:implement` stops on an unreleased feature before its first write and blocks under `--unattended`. A confirmation leaves the release signal unapplied.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/plan-contract.md, plugin/skills/implement/SKILL.md, plugin/skills/plan/SKILL.md

### INV-0054

Class: process
Concepts: Design sketch, Component, Epic
Statement: A design sketch is written only when the operator asks, after the grounding and before decomposition, and blocks until approved. It is self-contained HTML with inline CSS and no JavaScript or network. It stays git-ignored and unreconciled, and never reaches the epic or the pull request.
Breaks: silently
Check: none — the ADR rejected a pin on cost
Paths: plugin/skills/plan/SKILL.md, plugin/references/design-sketch.md

### INV-0055

Class: process
Concepts: Tier, Simplicity-reviewer, Final-reviewer, Execution playbook
Statement: Every scope gets an over-engineering pass. A full-tier scope whose every slice is `behavior` gets it per slice in `implement-full.md`, so `/superdev:review` skips simplicity-reviewer there. Every other scope gets it whole-scope from `/superdev:review`, under the skip rules a lite scope takes. Its findings gate nothing on their own, and each cut the controller warrants joins the review's fix set as a Minor; only the entry review gets the pass (ADR 0228).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/implement-full.md

### INV-0056

Class: architecture
Concepts: Tier, Ledger, Execution playbook
Statement: The tier is never stored. Every reader derives it from the loaded slice set by one threshold: three or fewer slices is lite, more is full. An underivable tier resolves to the blocking answer.
Breaks: silently
Check: none — no agreement pin across the derivation sites
Paths: plugin/skills/implement/SKILL.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/scope-mode.md, plugin/references/scope-findings.md, plugin/scripts/scope.js, plugin/lib/suite-base-get.js

### INV-0058

Class: process
Concepts: Published snapshot, Adopt, Ledger, Scope anchor, Run kind
Statement: The ledger drives control flow, and the anchor's snapshot only mirrors it. Every ledger write the snapshot shows is followed by a publish, and a failed publish changes nothing in the run. Run init adopts only where no local ledger exists and the snapshot's stage is not `shipped`, and reports that run as `resumed`. A store that declares itself snapshot-less publishes and adopts nothing.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/scope-mode.md, plugin/references/run-state.md, plugin/references/run-init.md, plugin/skills/**, plugin/references/implement-full.md, plugin/references/run-handoff.md

### INV-0059

Class: architecture
Concepts: Slicetree, Scopetree, Tier
Statement: A lite-tier run implements every slice inline in its scopetree and creates no slicetree.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/implement-lite.md

### INV-0060

Class: process
Concepts: Triage record, Ledger, Slice store
Statement: A triage-record create that fails or is denied is reported once per run. The ledger bullet is still written, naming the failure where the reference would be, and the review carries on.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md

### INV-0061

Class: process
Concepts: Triage record, Deferred finding, Ledger
Statement: Within one run, a finding the ledger already carries as deferred creates no second triage record and no second ledger bullet. Across runs, a finding that an open triage record plainly states gets a comment on that record and no second record; the ledger bullet carries that record's reference (ADR 0145).
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/implement-full.md, plugin/references/scope-mode.md, plugin/references/scope-findings.md

### INV-0062

Class: process
Concepts: Triage record, Scope anchor
Statement: A triage record's provenance names the feature label, the scope branch and the scope anchor's reference, and never a pull-request URL.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md

### INV-0063

Class: process
Concepts: Backlog survey, Slice store, Scope anchor, Triage record, Untriaged item
Statement: A backlog survey writes nothing: no record, label, comment or file. It reads anchors, triage records and untriaged items through the store document's sections, never through a backend's own call. It reads a stage through the ledger (`scope.js get stage`) for an anchor with a local run root, and from the anchor's published snapshot for an anchor without one.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/status/SKILL.md

### INV-0065

Class: process
Concepts: Untriaged item, Backlog survey
Statement: No superdev surface acts on an untriaged item. The backlog survey lists it, and only a human turns it into a plan or closes it.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/status/SKILL.md

### INV-0066

Class: architecture
Concepts: Model-invocable surface, Unattended run
Statement: Every chain step (`/superdev:implement`, `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`) stays model-invocable, carrying no `disable-model-invocation: true` key, and so do `/superdev:setup`, `/superdev:plan`, `/superdev:verify-ship`, `/superdev:wrap-up`, and `/superdev:publish-kb`. `/superdev:plan` and `/superdev:implement` start setup and plan through the Skill tool, and a covered command starts its successor through it when the operator agrees to its offer's Start. `/superdev:verify-ship` starts `/superdev:wrap-up` through it at its exit where every line is settled, no line waits for a hand-sync, and the anchor's lines were read; a start the Skill tool refuses or fails falls back to printing `/superdev:wrap-up <scope>` and its offer. An offer's new-session start runs the successor in a new session, whose model starts it through the Skill tool from the prompt's text (ADR 0132, ADR 0157, ADR 0176, ADR 0201, ADR 0224).
Breaks: silently
Check: scripts/drift-check.js `past-pr-skills` (ship, verify-ship, wrap-up, publish-kb); final-reviewer's invariant compliance judges the other skills
Paths: plugin/skills/ship/SKILL.md, plugin/skills/setup/SKILL.md, plugin/skills/plan/SKILL.md, plugin/skills/implement/SKILL.md, plugin/skills/review/SKILL.md, plugin/skills/document/SKILL.md, plugin/skills/submit-pr/SKILL.md, plugin/skills/verify-ship/**, plugin/skills/wrap-up/**, plugin/skills/publish-kb/SKILL.md

### INV-0068

Class: architecture
Concepts: Guardrail
Statement: Each shipped hook runs its dispatch when spawned and does nothing when `require`d. Each module in `plugin/lib/` prints nothing, spawns nothing, and runs nothing when `require`d.
Breaks: silently
Check: `tests/plugin-layout.test.js` — one child process requires every file of `plugin/lib/` and `plugin/hooks/` and asserts that none prints, spawns, or exits, and that no lib module requires an entry point; its DIRECT table runs each hook as a process and asserts it decides on its payload
Paths: plugin/hooks/*.js, plugin/lib/*.js

### INV-0069

Class: architecture
Concepts: Timing command, Focused test command, Test audit
Statement: `docs/agents/verification.md` holds the timing command in a backtick span, never a fenced block, because the full and focused readers take fences by index (`lib/verification.js`'s `verificationCommands`), so neither runs it as the full or focused command. An absent timing command makes a test audit `unmeasured` and never fails it.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/lib/verification.js, plugin/skills/review-tests/SKILL.md, plugin/skills/setup/SKILL.md

### INV-0070

Class: process
Concepts: Test audit, Unattended run
Statement: A test audit runs only on operator invocation. Unchained, its only writes are its intent — an intent record in the slice store, or the local intent file when that write fails (ADR 0199) — the `.gitignore` entry, and an observation's triage record. Chained, it writes nothing, and returns an observation to its caller.
Breaks: silently
Check: none — no absence scan exists
Paths: plugin/skills/review-tests/**

### INV-0071

Class: process
Concepts: Test audit, Intent
Statement: A test audit reports a dead or ignored test as a fact, straight to the intent. Every other finding is a judgment the operator can reject before it reaches the intent. Findings past the round's fixed arity reach the intent labelled `unconfirmed`.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/review-tests/SKILL.md

### INV-0072

Class: process
Concepts: Positive absence, Backend command contract
Statement: `/superdev:setup` writes a `## Commands` section only after its `find` template, probed once against a title that cannot exist, exits 3.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/setup/SKILL.md

### INV-0073

Class: architecture
Concepts: Backend command contract, Staged page, Knowledge base
Statement: Every backend command a publish runs is bounded at its spawn. The bound comes from the operator configuration, and a `find` result reaches later commands only under `found` in the values file, so no `find` field can rewrite it. A timeout stops the batch and leaves every untried page staged.
Breaks: silently
Check: `tests/publish-kb-timeout.test.js` (per-verb timeout cases; "a timeout stops the batch: the rest are named untried, staged, and never spawned")
Symbols: DEFAULT_TIMEOUT_MS, timeoutMs, timedOut, runVerb
Paths: plugin/lib/kb-backend.js, plugin/skills/setup/SKILL.md

### INV-0074

Class: architecture
Concepts: Assignee, Operator configuration, Slice store
Statement: The assignee lives only in the untracked `.superdev/info.json`, resolved against the main working tree from any checkout: that file, else the API token's own identity, with `"none"` opting out. No tracked store document carries an assignee bullet, and the plan-contract slice schema carries no assignee field. Tokens never enter the file. The file's `displayName` is display-only: no issue-tracker call reads it, so it never changes who is assigned.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/plan-contract.md, plugin/references/issue-tracker-*.md, plugin/skills/setup/SKILL.md

### INV-0075

Class: process
Concepts: Assignee, Operator configuration
Statement: A malformed `.superdev/info.json`, or an absent or empty assignee, falls through to the token's identity and is reported once per run. It never stops the plan.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/plan-contract.md

### INV-0076

Class: architecture
Concepts: Operator configuration, Run root, Slicetree
Statement: The reaping hooks delete only inside `.superdev/scopes/<scope>/`, and never touch `.superdev/info.json`.
Breaks: silently
Check: none — no test covers it
Paths: plugin/hooks/scope-prune.js, plugin/hooks/slicetree-sweep.js, plugin/lib/git-spawn.js

### INV-0077

Class: process
Concepts: Candidate set, Run root, Stage
Statement: One section, `scope-mode.md`'s `## Resolving an empty argument`, owns how an empty argument resolves. Each run-taking command names only its own candidate set and cites that section. A caller that cannot ask lists the candidates and stops. A command may add its own step after that cascade finds no candidate, and the step still reports every run root with its stage before it acts: `/superdev:review` reads standing code of the whole repository there (ADR 0165).
Breaks: silently
Check: `tests/publish-kb-scope.test.js` (more than one pending scope and no `--scope`: lists every scope with its page count)
Paths: plugin/references/scope-mode.md, plugin/skills/implement/SKILL.md, plugin/skills/submit-pr/SKILL.md, plugin/skills/review/SKILL.md, plugin/scripts/publish-kb.js

### INV-0078

Class: process
Concepts: Epic, Slice, Acceptance, Definition of Done (DoD)
Statement: A single-slice feature has no epic. Its lone slice's `acceptance` is its Definition of Done.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md

### INV-0079

Class: process
Concepts: Progress log, Controller
Statement: A slice's `progress.md` is only ever appended to, oldest entry first.
Breaks: silently
Check: none — nothing enforces it

### INV-0080

Class: process
Concepts: Touch map, Slice
Statement: No slice `spec` names file paths, and no reviewer gates on the touch map.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md

### INV-0081

Class: process
Concepts: Test-applicability, Slice-reviewer, Simplicity-reviewer
Statement: A `mechanical` slice skips the per-slice reviews and relies on the existing suite. A `docs` slice skips reviews.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/implement-full.md, plugin/references/implement-lite.md

### INV-0082

Class: process
Concepts: Depends-on, Slice
Statement: A `depends-on` edge is written only where a slice cannot be green without the other.
Breaks: silently
Check: none — a judgment
Paths: plugin/skills/plan/**

### INV-0083

Class: architecture
Concepts: Final-reviewer, 3-strike fix loop
Statement: final-reviewer never applies a fix. Its tool allowlist carries no Edit or Write.
Breaks: silently
Check: none — nothing pins the frontmatter
Paths: plugin/agents/final-reviewer.md

### INV-0084

Class: process
Concepts: 3-strike fix loop, Final-reviewer, Slice-reviewer
Statement: After 3 fix cycles that each surface a new defect, the loop stops and escalates instead of trying a fourth.
Breaks: silently
Check: none — the stop is unpinned
Paths: plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/implement-full.md

### INV-0085

Class: process
Concepts: Doc-reader, Doc-writer, Audit
Statement: Doc-reader findings trigger exactly one doc-writer fix round.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/document/SKILL.md

### INV-0086

Class: process
Concepts: Bootstrap
Statement: `/superdev:document` never bootstraps a documentation hierarchy when invoked on a range or an area.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/document/SKILL.md

### INV-0087

Class: architecture
Concepts: Scope branch, Code host
Statement: No superdev command other than /superdev:plan, /superdev:submit-pr, and /superdev:ship pushes a scope branch. Plan pushes once, at the end of its run and before any slice runs, so the pushed branch holds no slice work (ADR 0167). Implementing, reviewing, and documenting work on the local scope branch only, so no unreviewed code reaches the code host before submit-pr opens the pull request. Ship pushes twice over its own run: once for a base merge that moved, once for a commit review's own fix loop or an operator's own conflict resolution landed at stage submitted with no base merge involved — both gated on a reusable green record for the pushed tip, and both moving the open pull request's head, never straight to base (INV-0001), since the merge onto base still runs only through the host's own merge API.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it; it holds because the only push instructions in shipped prose are /superdev:plan §6 (through `scope.js push`), /superdev:submit-pr §5, and /superdev:ship §4, and the code-management seeds they read
Paths: plugin/skills/**, plugin/references/**, plugin/lib/**, plugin/scripts/scope.js

### INV-0088

Class: architecture
Concepts: Invariant register
Statement: No script filters or ranks register entries for /superdev:plan or final-reviewer. Both read docs/invariants.md whole, and their judgment is the only matcher, so an entry the plan passes over stays visible to final-reviewer's own read.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/plan/**, plugin/agents/final-reviewer.md

### INV-0089

Class: process
Concepts: Acceptance, Slice
Statement: /superdev:plan writes a behavior slice's domain-level failure and boundary cases into its acceptance, alongside the happy path, each stated as observable behaviour. Implementation-level edges stay with the implementer and the reviewers.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/plan/SKILL.md, plugin/references/plan-contract.md

### INV-0090

Class: process
Concepts: Invariant register
Statement: Every register entry's mandatory fields, its Concepts, and the Paths, Symbols, and Check paths it names are checked by scripts/invariant-check.js, which node scripts/run-tests.js runs against this repository. The check fails naming the entry and the field, so a register rule breaks loudly rather than silently.
Breaks: silently
Check: tests/invariant-check.test.js — each format and resolution rule fails naming the entry and the field; the test chain runs the validator against this repository
Symbols: check, parseEntries, globMatcher
Paths: scripts/invariant-check.js, tests/invariant-check.test.js, package.json

### INV-0091

Class: architecture
Concepts: Staged page, Knowledge base
Statement: `/superdev:publish-kb` never replaces a live non-aggregate page its staged `upsert` was not built from. An `upsert` whose recorded body hash differs from the live page's is refused and stays staged, with the refusal reported per page, whether or not the staged file carries a `created-by-publish` marker. A hashless `upsert` on an existing page is refused the same way, unless the staged file carries that marker, which shows the page is this publish's own create landing; the marker substitutes for a hash only where none was recorded.
Breaks: silently
Check: tests/publish-kb-guard.test.js — the mismatched-hash refusal; tests/publish-kb-timeout.test.js — the hashless-existing-page refusal, the hashless new-page create, and the marker retry that sends an update instead of a refusal
Paths: plugin/lib/kb-backend.js, plugin/lib/kb-staged-page.js, plugin/references/doc-pass.md, plugin/agents/doc-writer.md, plugin/skills/document/SKILL.md

### INV-0092

Class: process
Concepts: Pinned merge, Suite record, Stage
Statement: A merge superdev makes lands only a scope-branch head whose suite record `scope.js suite reusable` accepts (INV-0017 states the full rule), and a green whole-repo run where the repository configures a whole-repo command. The record is accepted directly, across Markdown-only commits (ADR 0128), across a delta a passing focused run covered under the complete-selector declaration (ADR 0175), or, for a record that reads red at the head or at an ancestor of it followed only by Markdown-only commits, on its one recorded rerun (ADR 0172, ADR 0189). That is either such a head, or `/superdev:ship`'s own conflict-free merge of base into the scope branch, tested green before it lands. The merge is pinned to that head, so a head that moved after the test is refused by the host. It never forces past the host's branch protection or required approvals. A red result `suite reusable` does not accept, a denied result, or a conflicting result lands nothing, and neither does a head whose suite record review invalidated for a standing unresolved defect (ADR 0096, ADR 0105).
Breaks: silently
Check: scripts/drift-check.js `code-management-no-force` — no code-management document forces a merge; tests/scope-suite.test.js — `suite reusable`, the verb that decides reuse; final-reviewer's invariant compliance judges ship's pinned-merge and not-green-lands-nothing clauses
Paths: plugin/skills/ship/**, plugin/references/code-management-*.md, plugin/scripts/scope.js, plugin/lib/suite-base-get.js

### INV-0093

Class: process
Concepts: Unattended run, Stage
Statement: Only the operator's answer moves a scope past its open pull request: the operator types `/superdev:ship`, asks for it, or answers yes to an offer of it, which `/superdev:submit-pr` makes where ship's plain suite gate accepts the tip or the carry's preconditions hold, and any other command whose Next block prints `/superdev:ship` makes too. Where the gate would refuse with no carry, submit-pr offers `/superdev:review` instead (ADR 0230). Every offer of ship carries the merge wording `references/response-shapes.md`'s `## The offer` states. Every unattended run ends at `/superdev:submit-pr`, and no unattended run makes an offer. `/superdev:ship`, `/superdev:verify-ship`, and `/superdev:wrap-up` each carry no unattended mode, and ship refuses an `--unattended` argument. No model starts any of the three unless the operator typed the command, asked for it, or agreed to an offer, or another session's brief asked for it (for ship, only after the operator gave the one yes asked first), or, for wrap-up, verify-ship started it. Verify-ship starts wrap-up through the Skill tool only at its exit where every Definition-of-Done line is settled and no line waits for a hand-sync of the anchor's criterion text, and the anchor's lines were read, on every start of verify-ship and with no question first; the wrap-up it starts keeps every gate and every ask, and makes the chain's one offer. A command started from an offer keeps every gate and every ask it has when typed. Ship, started from another session's brief with no offer's marker line, asks the operator one yes as its first act, before any write or host call, and a declined yes writes nothing; a brief is never merge consent. Typed by the operator, started by an offer's Start or the card's Do it here in the conversation that offered it, or started from an offer's new-session prompt (the command followed by the offer's marker line), ship asks no extra question. Verify-ship and wrap-up ask no extra question on any start. The three skills' descriptions and their own gates carry that bound, because the platform does not (ADR 0096, ADR 0106, ADR 0132, ADR 0157, ADR 0176, ADR 0201, ADR 0214, ADR 0223, ADR 0224, ADR 0225, ADR 0230).
Breaks: silently
Check: scripts/drift-check.js `past-pr-skills` — neither verify-ship nor wrap-up names `--unattended`, and none of ship, verify-ship, and `plugin/references/response-shapes.md` names `--from-ship`; final-reviewer's invariant compliance judges ship's refusal, the offers, and the start conditions; partial: nothing stops a model that ignores a description, and nothing stops a brief that copies the offer's marker line from starting ship with no yes (ADR 0225)
Paths: plugin/references/response-shapes.md, plugin/skills/submit-pr/**, plugin/skills/ship/**, plugin/skills/verify-ship/**, plugin/skills/wrap-up/**

### INV-0094

Class: process
Concepts: 3-strike fix loop, Stage
Statement: A Minor finding never holds a scope's stage and never blocks a run. The scope review and the full tier's per-slice review fix every listed finding, Minors included, until the review lists none or the 3-cycle cap is reached. A full-tier slice review that leaves only Minor findings ends the slice's loop instead: the slice merges, and its Minors go to the Minor queue, which the Minor sweep fixes before run handoff (ADR 0174, INV-0171). The scope review also ends its loop when a re-review leaves only Minor Prompt-concept overlap findings and no broken criterion, and the per-slice review has no such exit (ADR 0170). At the cap, a remainder of only Minor findings advances the stage, merges the slice into the Minor queue, or ends the Minor sweep, and the sweep's and the scope review's leftover Minors leave no record outside the report. A Minor finding whose remedy adds a capability the Definition of Done never named is a deferred finding, like one of any other severity (ADR 0035).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/review/**, plugin/references/review-scope-mode.md, plugin/references/implement-full.md, plugin/agents/final-reviewer.md, plugin/agents/slice-reviewer.md

### INV-0095

Class: process
Concepts: Guard-rail remedy, Deferred finding, Plan-coverage gap
Statement: A guard-rail remedy stays in the fix loop and never becomes a deferred finding. A plan-coverage gap is fixed by the guard-rail remedy that proves the behaviour, and never by a new line in `dod.md`.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/review/**, plugin/references/review-scope-mode.md, plugin/references/implement-full.md, plugin/agents/final-reviewer.md

### INV-0096

Class: process
Concepts: Derived criteria, Definition of Done (DoD), Intent
Statement: `/superdev:plan` slices no plan while a criterion derived from its intent is neither in the Definition of Done nor named as a non-goal. Every plan runs the derive pass: a new feature, a single-slice plan, an append, and a repair.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/plan/**, plugin/agents/final-reviewer.md

### INV-0098

Class: process
Concepts: Deploy posture, Deploy target, Scope anchor
Statement: Only `/superdev:ship` runs a deploy target's command. It runs one only under the repository's `auto` deploy posture, only after the pull request has merged, and only in a tree checked out at the merge commit. No other command and no unattended run deploys (ADR 0101).
Breaks: silently
Check: scripts/drift-check.js `deploy-runner-exclusivity` — no skill or agent but ship names a deploy target's command as something it runs; final-reviewer's invariant compliance judges the auto, after-merge, and merge-commit conditions
Paths: plugin/skills/ship/**, plugin/references/deployment.md, plugin/skills/verify-ship/**

### INV-0099

Class: process
Concepts: Deploy posture, Deploy target, Scope anchor, Definition of Done (DoD), Stage
Statement: After the merge, only `/superdev:wrap-up` closes a scope anchor. It closes one only when the pull request has merged, every Definition-of-Done criterion is ticked or `accepted:`, and every deploy target listed on the anchor is recorded `deployed`. A failed close changes neither the stage nor the run's scaffolding. A failed `auto` target keeps the anchor open, and a later ship resumes at the first target not yet deployed (ADR 0101, ADR 0106).
Breaks: silently
Check: `tests/scope-ledger.test.js` for the ledger's deploy record; final-reviewer's invariant compliance judges ship's stop and wrap-up's close gate
Paths: plugin/skills/ship/**, plugin/scripts/scope.js, plugin/lib/ledger-records.js, plugin/skills/wrap-up/**

### INV-0104

Class: process
Concepts: Deploy posture, Deploy target
Statement: Under the `auto` deploy posture, `/superdev:ship` runs a deploy target's command only from a `docs/agents/deployment.md` whose every change the operator was shown. A change the merge commit carries against the tested head, and on a merge ship did not gate itself the pull request's own change, is printed and confirmed before the first target runs (ADR 0104).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/ship/**

### INV-0105

Class: process
Concepts: Affected form, Whole-repo command
Statement: An affected form never selects fewer projects than the change can break. It selects through the repository's dependency-graph tool, dependents included, so a change the graph cannot attribute to one project selects every project, and selection by path prefix does not qualify. It exits green when the change reaches no project. `/superdev:setup` writes one only after read-only tool queries in a throwaway worktree, with remote caching off, show that it selects a project on a committed change and that its target exists on the selected projects, or after the operator chose to write it where such a query failed or could not decide, and once the operator has confirmed how it exits when no project is affected, and only together with a whole-repo command. Setup runs no test command to validate it (INV-0175).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/test-selection.md, plugin/skills/setup/**

### INV-0106

Class: process
Concepts: Run root, Stage
Statement: `hooks/scope-prune.js` reaps a run root only when its ledger stage reads `closed`. A run root at any other stage, `shipped` included, is never reaped (ADR 0106).
Breaks: silently
Check: tests/scope-prune.test.js, tests/scope-prune-main.test.js
Paths: plugin/hooks/scope-prune.js

### INV-0107

Class: process
Concepts: Seed, Seed gap, Seed deviation
Statement: `/superdev:setup` writes a seed section or seed rule into a configured document only on the operator's explicit choice for that seed gap. A gap the operator records as a seed deviation is never applied, and a recorded seed deviation is never reported as a gap (ADR 0107).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/setup/SKILL.md

### INV-0109

Class: architecture
Concepts: Staged page, Knowledge base
Statement: `/superdev:publish-kb` converts a staged page's body only for a backend whose configuration carries `- **Body format:** storage`. Every other backend receives the staged body byte-identical (ADR 0109).
Breaks: silently
Check: tests/publish-kb-guard.test.js — a markdown backend's `create` and `update` receive the staged body unchanged
Paths: plugin/lib/kb-apply.js

### INV-0110

Class: process
Concepts: Intent
Statement: `/superdev:plan` never offers or seeds from a `.superdev/brainstorm/*.md` intent whose frontmatter is `status: draft`. Only that frontmatter marks a draft: a file with no frontmatter, or with any other status, is ready (ADR 0112).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/plan/SKILL.md, plugin/skills/brainstorm/SKILL.md

### INV-0111

Class: process
Concepts: Next block, Offer, Response shape
Statement: Every message that `/superdev:brainstorm`, `/superdev:plan`, `/superdev:implement`, `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`, `/superdev:verify-ship`, `/superdev:wrap-up`, `/superdev:sweep`, or `/superdev:review-tests` ends on closes with the Next block that `references/response-shapes.md` defines, and nothing follows it. This holds for a refusal, a blocked stop, an ad-hoc run, an unattended run, and a command with no successor. A command in the chained posture prints none. An attended run of one of those commands whose Next block names exactly one next command, of another skill, with no `Blocked:` or `First:` line, first makes the offer the same reference defines, at every exit, since a skill adds no offer condition of its own (ADR 0223); a command another command started through its own step makes none, and a command another session's brief asked for makes one, since a brief is no such step. A step that ends the starting command hands the hand-off to the started command: `/superdev:verify-ship` starting `/superdev:wrap-up` at its settled exit prints no Next block and makes no offer on that exit, and the chain ends on wrap-up's one Next block and wrap-up's offer, with nothing from verify-ship after it. Where the desktop app's session tool is present, the offer asks no question: it puts up a New task card at once and the command ends on its Next block; the card's Do it here runs the next command in the same conversation, a closed card starts nothing, and a refused or failed proposal prints the block and starts nothing. Without the tool, the offer asks Stop here (recommended) or Start. A command the card started makes its own offer by the same rule. Each of those skills cites the reference and restates none of the block's or the offer's shape (ADR 0113, ADR 0157, ADR 0176, ADR 0183, ADR 0201, ADR 0224).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/response-shapes.md, plugin/references/run-handoff.md, plugin/skills/brainstorm/SKILL.md, plugin/skills/plan/SKILL.md, plugin/skills/implement/SKILL.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/skills/document/SKILL.md, plugin/skills/submit-pr/SKILL.md, plugin/skills/ship/SKILL.md, plugin/skills/verify-ship/SKILL.md, plugin/skills/wrap-up/SKILL.md, plugin/skills/sweep/SKILL.md, plugin/skills/review-tests/SKILL.md

### INV-0112

Class: process
Concepts: Response shape
Statement: A report that `references/response-shapes.md` gives a shape is made of an opening line, section headings, and one-line bullets, closes on the Next block, and carries no paragraph of prose (ADR 0113).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/response-shapes.md, plugin/skills/brainstorm/SKILL.md

### INV-0113

Class: process
Concepts: Blind pass, Progress log
Statement: Once `slice-reviewer` opens a slice's progress log, it never withdraws a finding and never downgrades a finding's severity. Reading the log can only add a finding or raise one, so the implementer's account of its work can only make a slice review stricter (ADR 0114).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/slice-reviewer.md, plugin/references/implement-full.md

### INV-0114

Class: process
Concepts: Blind pass, Progress log, Dispatch prose
Statement: No slice-reviewer dispatch carries the implementer's report text. The report reaches `slice-reviewer` only through the progress log, whose path the dispatch hands over, and the reviewer opens that log only after its blind pass has settled a verdict (ADR 0114).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/slice-reviewer.md, plugin/references/implement-full.md

### INV-0115

Class: architecture
Concepts: Scope anchor
Statement: An edit to a scope anchor's body runs only when the read of the current body and the command that built the new body both succeeded and the new body is non-empty, and the edit reads that body from a file. A failed read, producer, or payload build leaves the anchor body as it was (ADR 0115).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/issue-tracker-*.md, docs/agents/issue-tracker.md, plugin/references/scope-mode.md, plugin/references/run-state.md

### INV-0116

Class: process
Concepts: Stage, Scope anchor, Definition of Done (DoD), Deploy target
Statement: `/superdev:ship`'s final hand-off, `/superdev:status`'s routing of a `shipped` run, `/superdev:document`'s leave-alone hand-off, run init's shipped-run stops, `/superdev:verify-ship`'s end, and `/superdev:wrap-up`'s hand-off from a closed repair to its original apply one rule, stated once in `references/shipped-run.md`, so all name the same next command for the same run state: for a run holding a `not met:` note `/superdev:verify-ship` wrote, which carries the repair citation, `/superdev:verify-ship` with `/superdev:plan`'s repair choice as the alternative once a closed anchor's `**Repairs:**` line names the run, the line's `not met:` note does not yet cite that anchor in its repair citation, and no open anchor's line names the run, and `/superdev:plan`'s repair choice or `/superdev:verify-ship` again otherwise, an open anchor's line outranking every closed one and adding a line that names each open repair; otherwise `/superdev:verify-ship` or `/superdev:wrap-up`, a `not met:` note written before merge counting as a line still to verify (ADR 0116, ADR 0124).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/ship/SKILL.md, plugin/skills/status/SKILL.md, plugin/skills/document/SKILL.md, plugin/references/run-init.md, plugin/references/scope-mode.md, plugin/references/shipped-run.md, plugin/skills/verify-ship/SKILL.md, plugin/skills/wrap-up/SKILL.md

### INV-0117

Class: process
Concepts: Run trace
Statement: Only superdev's hooks and `scope.js` write a run trace, and `scope.js` detects any other write after the fact. A sidecar in the run root, `digest.json`, holds the digest of the trace and of the ledger. Every `scope.js` verb that writes to a run compares both files with it first, and a rewrite, a foreign append, or a deletion of the trace is reported once, on stderr and as a `tamper trace.log` trace line, after which the verb goes on and the digest seals what is on disk. A run with no sidecar is sealed on its first check and reports nothing. No `scope.js` verb appends an event its caller chooses: `scope.js test` appends only the exit status of a command it ran itself. A ledger write's mirror line, such as a stage or **Step** write, records state the controller declares and is no evidence event: no reviewer judges a slice on it. Every evidence event a reviewer reads there is one the agent under review did not author, unless that agent rewrote both the trace and its digest, which the check does not see (ADR 0117, ADR 0127, ADR 0140, ADR 0227).
Breaks: silently
Check: tests/scope-digest.test.js — a trace rewrite, `sed -i`, `echo >>` append, and deletion are each reported once by the next writing verb, which completes, `open` over an edited planned ledger among them; hook appends, eight parallel appenders, a killed holder's lock, a live holder's lock that a bounded wait outlasts, a broken holder that removes only its own lock, a hook append that races adopt, `init`'s rotation, `discard`, and a push then adopt report nothing; a run with no sidecar is sealed silently
Paths: plugin/hooks/**, plugin/scripts/scope.js, plugin/lib/trace-log.js, plugin/lib/dispatch.js, plugin/lib/run-digest.js, plugin/lib/run-check.js

### INV-0119

Class: process
Concepts: Run trace, Slice-reviewer, Degraded pass
Statement: On the full tier, every `behavior` slice merged into the scope branch has a `slice-reviewer` dispatch recorded in the run trace that ends after the slice's last `implementer` dispatch, or a degraded-pass entry naming that slice's denied review. `final-reviewer` reports a slice with neither as an Important finding (ADR 0117).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/final-reviewer.md, plugin/skills/review/**, plugin/references/review-scope-mode.md

### INV-0120

Class: process
Concepts: Implementer, Sibling surface, Dispatch prose
Statement: Every fix dispatch to the implementer, and the implementer's own brief for a fix dispatch, require it to bring each sibling surface in its own checkout into agreement with the rule or behaviour its fix changes, to report each place it checked and each it changed, and to report rather than edit a place outside its checkout, and to report rather than edit the `AGENTS.md` hierarchy and the knowledge base, which the doc pass owns. Every dispatching site sends back a fix report that omits the checked-and-changed list before the next step. Before the next step, every dispatching site also greps the checkout for the key phrase of the rule the fix changed, in its old wording and its new, and sends the report back in the same cycle for each hit in a file its checked list does not name, outside the `AGENTS.md` hierarchy and the knowledge base. A hit in `CHANGELOG.md` is release history and needs no change (ADR 0118).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/implementer.md, plugin/skills/implement/SKILL.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/implement-full.md, plugin/references/run-handoff.md

### INV-0121

Class: architecture
Concepts: Staged page, Scopetree
Statement: A staged page is written only into the main working tree's `.superdev/kb-pending/<scope>/`, whichever checkout the staging step runs from. Every staging instruction and the staged-page scan resolve that directory through `scope.js staging`, which refuses outside a git repository rather than fall back to the cwd (ADR 0119).
Breaks: silently
Check: tests/scope-root-base.test.js — the verb and the staged-page scan run from a linked worktree's cwd
Paths: plugin/scripts/scope.js, plugin/lib/status.js, plugin/skills/document/SKILL.md, plugin/references/doc-pass.md, plugin/references/implement-lite.md, plugin/agents/doc-writer.md

### INV-0122

Class: process
Concepts: Staged page, Scopetree, Run root
Statement: Only `/superdev:publish-kb` removes a staged page. `/superdev:wrap-up` refuses to close a run while its scopetree or a slicetree holds any file under its own `.superdev/kb-pending/`, before it removes either checkout (ADR 0119).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/wrap-up/SKILL.md

### INV-0123

Class: process
Concepts: Staged page, Next block, Stage
Statement: `/superdev:ship`'s post-merge hand-off, `/superdev:verify-ship`'s end message, and `/superdev:wrap-up`'s finish name a scope's staged pages by one rule, stated once in `references/shipped-run.md`, from a page count read in the same run. A count of zero names nothing. On verify-ship's exit that starts wrap-up, verify-ship's message names none, and wrap-up's last message names them, whether it finishes, refuses, or stops (ADR 0119, ADR 0224).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/ship/SKILL.md, plugin/skills/verify-ship/SKILL.md, plugin/skills/wrap-up/SKILL.md, plugin/references/scope-mode.md, plugin/references/shipped-run.md

### INV-0124

Class: process
Concepts: Base branch, Scope branch, Scopetree, Run kind
Statement: Every `/superdev:implement` invocation, at both execution tiers and every run kind, brings the base into the scope branch after the run lock is written and before the first slice starts (the one exception: at the `lite` tier a dirty scopetree with an `in-progress` slice skips the step, and the next invocation runs it). `/superdev:review` on a live scope run at a stage before `submitted` brings the base in the same way before its entry focused run, and again before each exit run and at each fix cycle's end when the scope branch lacks the fetched base tip; a merge that resolved a conflict takes a whole-range `final-reviewer` re-review before the exit run, and neither the merge nor that re-review counts as a fix cycle. At `submitted` it merges nothing and names the moved base for `/superdev:ship` (ADR 0173, ADR 0221). It merges the fetched remote base tip whether or not the local base could advance to it, and records that tip in the ledger's `**Base:**` header. Every range of the scope's own commits starts from the range base `scope.js base resolve` prints, the newer of `merge-base(<base>, <branch>)` and the recorded tip. A base that cannot be fetched is a degraded pass: the local base is merged and no tip is recorded (ADR 0120).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/scope-mode.md, plugin/references/scope-branch.md, plugin/references/implement-lite.md, plugin/references/implement-full.md, plugin/skills/review/**, plugin/references/review-scope-mode.md, plugin/scripts/scope.js, plugin/lib/suite-base-get.js

### INV-0125

Class: process
Concepts: Deferred finding, Guard-rail remedy, Ledger
Statement: A deferred finding leaves the ledger's `**Deferred:**` record only after a fix cycle that carried it lands a commit and a later re-review no longer lists it. It re-enters a fix loop only at the scope review, when `final-reviewer` names a guard-rail remedy for it (ADR 0121, ADR 0211).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/implement-full.md, plugin/references/scope-mode.md, plugin/references/scope-findings.md

### INV-0126

Class: process
Concepts: Intent
Statement: In an attended `/superdev:plan` or `/superdev:brainstorm` interview, no question the agent composes offers an option whose load-bearing claims went unchecked. Each claim is checked against the repository or the third party's official docs before the question is asked, or is labeled as an assumption, and the evidence and every dropped option are shown in prose before the question (ADR 0122).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/cross-exam.md, plugin/skills/brainstorm/SKILL.md, plugin/skills/plan/SKILL.md

### INV-0127

Class: process
Concepts: Intent, Derived criteria
Statement: A question the agent composes in a `/superdev:plan` or `/superdev:brainstorm` interview offers at most two options. A single surviving option is stated in one line with its reason and is not asked, and no surviving option means no question. Brainstorm offers at most two directions, never every direction it explored, and plan's derive pass states its gap settlement as one proposal the operator confirms before slicing. A question a skill requires by name keeps its fixed option set (ADR 0122).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/cross-exam.md, plugin/skills/brainstorm/SKILL.md, plugin/skills/plan/SKILL.md, plugin/agents/final-reviewer.md

### INV-0128

Class: architecture
Concepts: Controller, Scope branch, Suite record
Statement: No hook runs a test suite on a merge. A slice merge into the scope branch runs no suite, and the scope review's exit run is the first full-suite verification of the integrated scope. Implement's base merge runs no suite: the scope review's exit run verifies it together with the slices, and the review's own base merge at entry the same way (ADR 0192). Ship's merge of the base is followed by a full-suite gate that ship takes itself. The gate is met by a suite record `scope.js suite reusable` accepts at the merged tip, by the carry (ADR 0175), or by the recorded rerun (ADR 0172), each without a green full run at the merged tip: a carried tip writes no suite record, and a rerun's record stays `red`. Otherwise the merging step runs `scope.js test full`, or `scope.js test whole` where ship's whole-repo rule selects it, and that run's result is the suite record. INV-0017 states which records, carries, and reruns count.
Breaks: silently
Check: scripts/drift-check.js `implement-no-full-run`
Paths: plugin/hooks/hooks.json, plugin/references/scope-mode.md, plugin/references/scope-branch.md, plugin/skills/ship/SKILL.md, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/references/run-handoff.md, plugin/references/review-scope-mode.md

### INV-0129

Class: architecture
Concepts: Run trace
Statement: The run trace holds a test run only from `scope.js test` and `scope.js fail-to-pass`, each writing the run line itself, and an edit only from an Edit, Write, or NotebookEdit tool call. A Bash command adds no trace line, so a test command run directly, a redirect, `sed -i`, `cp`, or `git apply` leaves no trace (ADR 0227, INV-0017, ADR 0175).
Breaks: silently
Check: tests/run-trace.test.js — a Bash call adds no trace line on any hook event, and hooks.json registers run-trace.js on no Bash matcher
Paths: plugin/hooks/run-trace.js, plugin/hooks/hooks.json

### INV-0130

Class: architecture
Concepts: Run lock, Run root
Statement: A fresh run lock stops a second plan session, through `scope.js open`'s nonce check, and a second implement session, through implement's entry liveness check. No hook refuses a scopetree's creation, so a run recreates its own absent scopetree with a plain `git worktree add` (ADR 0227).
Breaks: silently
Check: tests/scope-open.test.js — `scope.js open` stops a second plan session on a fresh lock; tests/plugin-layout.test.js — no run-lock hook exists or is registered
Paths: plugin/lib/plan-open.js

### INV-0131

Class: process
Concepts: Repair, Definition of Done (DoD), Scope anchor, Stage
Statement: A repair writes nothing to the original scope's records: not its anchor, its `dod.md`, or its ledger, and merging the repair closes nothing. Recreating the original's missing local run root from its anchor's own `shipped` snapshot copies those records and changes none of them (INV-0132). The original's line observed false is settled only by `/superdev:verify-ship` on the original scope, and no repair moves the original's stage (ADR 0124).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md, plugin/skills/verify-ship/**, plugin/skills/wrap-up/**, plugin/references/scope-mode.md, plugin/references/shipped-run.md, plugin/references/plan-repair.md

### INV-0132

Class: architecture
Concepts: Adopt, Repair, Run root, Scope anchor, Stage
Statement: A `shipped` run whose run root is missing locally is recreated only from its own scope anchor's `## Run state` snapshot at stage `shipped`, through `scope.js adopt --shipped`, which refuses every other stage. Plain `adopt` and run init keep refusing a `shipped` snapshot, adoption writes nothing to the anchor, and `/superdev:status` adopts nothing (ADR 0124).
Breaks: silently
Check: tests/scope-publish-adopt.test.js — `adopt --shipped` adopts a shipped payload and refuses a live, closed, or stage-less one while plain adopt refuses shipped; final-reviewer's invariant compliance judges each caller
Symbols: adoptLines
Paths: plugin/scripts/scope.js, plugin/lib/run-state.js, plugin/references/scope-mode.md, plugin/references/shipped-run.md, plugin/skills/plan/**, plugin/skills/verify-ship/**, plugin/skills/wrap-up/**, plugin/skills/status/**

### INV-0133

Class: process
Concepts: Run trace, Slice-reviewer, Implementer
Statement: Every superdev subagent dispatch a run makes, in the foreground or the background, lands in the run trace as a `dispatch` line and, once the subagent finishes, a `dispatch-end` line, both mapped to the slice its prompt names. A run that reviewed every slice therefore passes `final-reviewer`'s per-slice review check (INV-0119) on the trace alone (ADR 0127).
Breaks: silently
Check: tests/run-trace-dispatch.test.js — the dispatch and dispatch-end cases
Paths: plugin/lib/dispatch.js, plugin/hooks/run-trace.js, plugin/hooks/hooks.json

### INV-0134

Class: process
Concepts: Numbering collision, Scope branch, Base branch
Statement: A scope branch never reaches the base branch carrying a numbering collision. The base step at implement start moves each colliding number of the scope to the next free one before it merges the base. After the move, no line the scope branch added still cites the old number, except a line the attended operator kept as a legitimate citation of it. `/superdev:ship` merges nothing while one stands. In this repository, the test run fails while two ADRs share a number (ADR 0126).
Breaks: silently
Check: tests/scope-citations-collisions.test.js — the collision verb reports a same-number ADR with a different slug, and an invariant id, that base holds; tests/scope-citations-collisions.test.js — the citations verb reports an added line citing an old number, and none for a longer number or an unchanged line; scripts/drift-check.js `adr-numbers` — no two ADRs in docs/adr/ share a number
Paths: plugin/scripts/scope.js, plugin/lib/citations.js, plugin/lib/collisions.js, plugin/references/scope-mode.md, plugin/references/scope-branch.md, plugin/references/merge-conflicts.md, plugin/skills/ship/SKILL.md

### INV-0135

Class: architecture
Concepts: Run trace, Scope
Statement: The superdev-view mod only reads. It registers no hook on a tool call, a model step, a turn's end, or a subagent spawn, so it can deny, rewrite, or delay none of them, and it writes no file. The pane draws from the files under `.superdev/` alone (ADR 0141).
Breaks: silently
Check: mods/superdev-view/hooks/pane.test.tsx — the mod registers no agent, tool-call, model-step, or turn hook
Paths: mods/superdev-view/hooks/**

### INV-0136

Class: architecture
Concepts: Run trace, Run root, Slicetree
Statement: The run trace's `recordDispatch` attributes a subagent dispatch to a scope and slice: a run root counts only when it holds a ledger, exactly one run root attributes, and exactly one slice id names the slice while zero or several give the scope level. superdev-view applies no attribution rule of its own: it shows an agent under the scope whose trace records it and the slice that trace line names, so the pane and the trace never disagree about which scope and slice an agent works on (ADR 0141).
Breaks: silently
Check: tests/run-trace-dispatch.test.js — the dispatch attribution cases; mods/superdev-view/hooks/parse.test.ts — an agent's slice is its trace line's slice field
Symbols: recordDispatch
Paths: plugin/lib/dispatch.js, mods/superdev-view/hooks/**

### INV-0137

Class: process
Concepts: Definition of Done (DoD), Release-risk criterion
Statement: Every Definition of Done `/superdev:plan` writes, on every change type and plan kind, names each release-risk category — rollback path, deploy-window data compatibility, consumer compatibility, production visibility — in exactly one `Release risk:` criterion or in one `Release risk: none` line that gives each category's reason. Whether the step runs is never plan's judgment (ADR 0133).
Breaks: silently
Check: the `scope.js dod-check` suite — a Definition of Done whose `Release risk:` lines leave a category unnamed is refused (INV-0189); that a category is named exactly once stays final-reviewer's invariant compliance judgement
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md

### INV-0138

Class: process
Concepts: Fail-to-pass run, Run trace, Slice-reviewer
Statement: A `behavior` slice, and a fix cycle whose commits change both a test-path file and another file, carries an outcome line of a fail-to-pass run in the run trace before the reviewer that next reads the trace, unless every test-path file it changes is deleted, so no test of its own can run, and its changes outside the test paths add no behaviour (ADR 0196). Such a change that adds behaviour outside the test paths is a Missing fail-to-pass run finding. The implementer of the change runs it over its own range before its report; the controller runs none (ADR 0182). A `pass-to-pass` outcome is an Important finding, and so is such a change with no outcome line: `slice-reviewer`'s on the full tier, `final-reviewer`'s on the lite tier and in `/superdev:review`'s fix loop. Both take the 3-cycle cap and the escape path of ADR 0125: at the cap, a remainder whose only Critical or Important findings are Pass-to-pass or Missing fail-to-pass run, in any mix, proceeds and the report names each, and any of them beside a Critical or Important finding of another kind blocks. A Pass-to-pass finding the reviewer marks unclosable, in one of the closed cases of `review-checklist.md`'s `## Fail-to-pass run`, takes that escape at once, before the cap: it never enters a fix list or review's ask-once, and no fix cycle runs when no other finding is left to fix (ADR 0193). A `pass-to-pass` finding closes only on a `fail-to-pass` outcome over a range from the original change's base to the tip current when that closing run ran, and stays closed once that outcome is written (ADR 0134, ADR 0125, ADR 0193, ADR 0196).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/slice-reviewer.md, plugin/agents/final-reviewer.md, plugin/agents/implementer.md, plugin/references/review-checklist.md, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/references/run-handoff.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/skills/implement/SKILL.md

### INV-0139

Class: process
Concepts: Fail-to-pass run, Run trace
Statement: A fail-to-pass run records `fail-to-pass` or `pass-to-pass` only after the tests passed against the changed code in the same worktree, or in a `path` run the run trace holds at the change's tip, recorded as run at the tree root, where `docs/agents/verification.md` states a `## Prepare command` (ADR 0215, ADR 0218, ADR 0232). A run against the changed code that does not pass, a run killed at its bound or ended by a signal, a run whose command could not start, and a prepare command that fails before a run record `unknown`, which no reviewer reads as a failing or a passing run and no gate reads as green (ADR 0134, INV-0009).
Breaks: silently
Check: tests/scope-fail-to-pass-verdict.test.js, tests/scope-fail-to-pass-signals.test.js, tests/scope-fail-to-pass-bound.test.js, tests/scope-fail-to-pass-trace.test.js, tests/scope-fail-to-pass-environment.test.js, tests/scope-fail-to-pass-interrupt.test.js, tests/scope-fail-to-pass-concurrency.test.js, tests/scope-fail-to-pass-watcher.test.js, tests/scope-fail-to-pass-prepare.test.js, tests/scope-fail-to-pass-reuse.test.js — the fail-to-pass cases
Paths: plugin/scripts/scope.js, plugin/lib/fail-to-pass.js, plugin/lib/test-verb.js, plugin/lib/run-supervision.js, plugin/lib/verification.js, plugin/lib/prepare.js

### INV-0141

Class: safety
Concepts: Guardrail
Statement: merge-guard reads no shell words and requires no module (ADR 0227). For a call that carries `agent_id` it denies one raw-text rule: a line, read after a backslash-newline is joined, that holds a lead word (`git`, `gh`, `tea`, or `scope.js`, in any letter case, at the line's start or after whitespace, `/`, a backslash, a quote, a backtick, `;`, `&`, `|`, or `(`) and later a verb word (`push`, `merge`, `rebase`, `pull`, or `m` after `tea`), a verb word being bounded on both sides by the line's ends, whitespace, `/`, a quote, a backtick, `;`, `&`, `|`, `)`, `<`, or `>`. So `git -C /x merge main`, `rtk git push`, `\git push`, `/usr/bin/git rebase main`, `gh api -X PUT repos/o/r/pulls/1/merge`, `node "…/scope.js" push`, and `git stash push` are denied, and `git add src/push.ts`, `dod-merge`, and `merge-guard.test.js` hold no verb. A commit message holding a verb passes when written through a heredoc on the lines after the command, as long as no line of the heredoc holds a lead word followed by a verb word, and the denial message names that form and that limit. A call with no `agent_id` passes whatever its text, and a deliberately obfuscated command (`G=git; $G push`) is outside the rule.
Breaks: silently
Check: tests/merge-guard.test.js — a subagent's call is denied for each spelling of a lead word and verb word above and allowed where the line holds no verb word, the controller's call passes, and the denial names the heredoc form and its limit
Paths: plugin/hooks/merge-guard.js

### INV-0143

Class: process
Concepts: Final-reviewer, Slice-reviewer, Review cycle
Statement: The scope review's `final-reviewer` reads the whole scope range on every dispatch, its re-reviews after a fix cycle included, because a full-tier slice re-review reads only its fix cycle's range (ADR 0137). The one exception is the re-review after a fix cycle whose fix list held only Minor findings: it reads that cycle's own range, because the verdict it follows already read the whole range and found nothing blocking outside unclosable Pass-to-pass findings (ADR 0174). It restates each such finding of that verdict with its slice or range, its case, and its reason, its mark re-judged against the cycle's range, and the combined verdict reads the restated findings (ADR 0193).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/final-reviewer.md, plugin/skills/review/**, plugin/references/review-scope-mode.md, plugin/references/scope-mode.md, plugin/references/scope-findings.md

### INV-0144

Class: architecture
Concepts: Run trace, Ledger
Statement: superdev-view draws only facts the ledger and the run trace state. A fact the run files lack is not drawn, never derived by the mod from order, timing, or a dispatch description (ADR 0140, ADR 0197).
Breaks: silently
Check: none — a heuristic can enter the mod's parser in any form, and no cheap test tells a reading from a derivation; a reviewer of a `mods/superdev-view/` change applies it.
Paths: mods/superdev-view/hooks/**

### INV-0145

Class: process
Concepts: Run trace, Dispatch outcome
Statement: Every `dispatch` line in a run trace, and every `dispatch-resume` line that reopens one, gets exactly one `dispatch-end` line once the session that made it has ended, written only by the run-trace hook and carrying one dispatch outcome: completed, failed, denied, stopped, unknown, or session-end. The first end written for a run of a dispatch wins (ADR 0140).
Breaks: silently
Check: tests/run-trace-dispatch.test.js — the dispatch outcome cases
Paths: plugin/lib/dispatch.js, plugin/lib/dispatch-lines.js, plugin/hooks/run-trace.js, plugin/hooks/hooks.json

### INV-0147

Class: architecture
Concepts: Run trace, Ledger, Stage, Step
Statement: Every label superdev-view draws is a value the ledger or the run trace records, a `CONTEXT.md` glossary term, or a term the shipped prose defines. A label that needs a new term gets its glossary entry before the mod draws it (ADR 0141).
Breaks: silently
Check: none — a label can enter the mod's drawing code in any form, and no cheap test tells a recorded value from a coined one; a reviewer of a `mods/superdev-view/` change applies it.
Paths: mods/superdev-view/hooks/**

### INV-0150

Class: process
Concepts: Triage record, Deferred finding, Observation
Statement: Every finding or observation a trigger meets reaches a triage record, as a new record or as a comment on an open record that plainly states the same defect. An uncertain match, a comment that fails or is denied, and a store document that defines no comment call create a new record. The one exception is a store document that defines no triage record (ADR 0145).
Breaks: silently
Check: none — whether two findings state the same defect is a judgment no test can check; a reviewer of a change to a triage-record writer applies it.
Paths: plugin/references/plan-contract.md, plugin/references/scope-mode.md, plugin/references/scope-findings.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/implement-full.md, plugin/skills/plan/SKILL.md

### INV-0151

Class: process
Concepts: Absorbed triage record, Triage record, Scope anchor
Statement: `/superdev:plan` absorbs a triage record only when the operator picks it. Only `/superdev:wrap-up` closes an absorbed record, and only once its citing criterion's verdict is met or the operator chose to close it. A run that resolves a deferred finding closes only a record whose provenance names its own scope anchor and that no open scope anchor absorbs, and a read of the record or of an Absorbs line that fails or is denied leaves the record open (ADR 0144, ADR 0145).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/plan/SKILL.md, plugin/skills/wrap-up/SKILL.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/implement-full.md

### INV-0152

Class: safety
Concepts: Implementer, Slicetree, Invoking checkout, Guardrail
Statement: A dispatched implementer's Edit, Write, or NotebookEdit call never lands in a working tree of a repository that holds a superdev run outside that repository's main-working-tree `.superdev/` directory, nor under that repository's main `.git/` directory, its linked working trees' and submodules' gitdirs included, whatever the target's spelling. A git directory spelled by its real path outside `<repo>/.git` (a `.git` symlink's target, a `--separate-git-dir` directory), or through a symlinked `.git` in another letter case, is outside this rule. A call the guard cannot judge passes, and Bash writes are outside this rule (ADR 0148).
Breaks: silently
Check: tests/tree-guard.test.js — an implementer write into the main checkout, into another linked working tree, into the main `.git/` (through a `.git` that is a symlink included), into a linked working tree's gitdir, and into a submodule's gitdir under `.git/modules/` is denied, one into a slicetree, a run root, a repository holding no run, or a bare repository holding no run inside the main checkout passes, and every other caller passes
Paths: plugin/hooks/tree-guard.js, plugin/lib/main-work-tree.js, plugin/hooks/hooks.json

### INV-0153

Class: architecture
Concepts: Backend command contract
Statement: A shipped executable hands text to a shell only to run an operator-supplied command: the repository's test command or a knowledge-base backend command template. That shell is `sh`, resolved from PATH. No shipped executable names a shell by absolute path, starts `bash`, or runs a command through Node's default shell (`exec`, `execSync`, or `shell: true`) (ADR 0150).
Breaks: loudly
Check: scripts/drift-check.js `shell-spawn` — fails on a shell start under `plugin/hooks/`, `plugin/scripts/`, or `plugin/lib/` that breaks the rule
Paths: plugin/hooks/*.js, plugin/scripts/*.js, plugin/lib/*.js

### INV-0154

Class: process
Concepts: Timing command, Focused test command
Statement: Test suites run at the same time, so a suite writes only inside a temporary directory it created itself. It reads the repository's files and never writes them, and it uses no fixed path that another suite could also use.
Breaks: silently
Check: none — a general rule with no single test. A breach shows as a suite that fails only when another suite runs beside it.
Paths: tests/**

### INV-0155

Class: process
Concepts: Timing command, Focused test command
Statement: The full test command runs every suite and every fixed tail step on every call. It gets faster by running steps at the same time and by cheaper setup, never by running fewer of them.
Breaks: silently
Check: tests/run-tests.test.js — a full run starts every suite it discovers and every tail step
Paths: scripts/run-tests.js

### INV-0156

Class: architecture
Concepts: Test seam, Shipped tree
Statement: No JavaScript file in the shipped tree holds a test seam: no code path, parameter, default value, option, environment read, export, or comment that exists only for superdev's own suites. The exports a suite requires and the `require.main === module` guards are the module interface, not seams. Shipped JavaScript reads only an environment variable a Markdown document in the shipped tree names, or one whose name starts with `CLAUDE_` (ADR 0154).
Breaks: silently
Check: scripts/drift-check.js `test-seams` — fails on shipped JavaScript that names one of superdev's own test files or reads an environment variable outside the rule; a reviewer catches an injected parameter or an unused export
Paths: plugin/**/*.js

### INV-0157

Class: process
Concepts: Implementer, Slice-reviewer, Controller
Statement: An implementer, a slice-reviewer, or the lite tier's inline controller that meets a failing test its own slice did not cause names it in its report, neither fixes it nor blocks the slice on it, and leaves it to the scope review's fix loop. A scope review fix dispatch whose finding is a red focused run at entry or a red exit run makes those failing tests the implementer's task. A failing test in the scope review's entry or exit run is that review's Critical finding and joins its fix list, even when the scope did not cause it; a triage record may sit beside its fix, never in its place. The rule stands in the agent body and in the dispatch prose that reaches it.
Breaks: silently
Check: scripts/drift-check.js `observation-no-suite-run` — the scope review's observation concept names no suite run as a source; final-reviewer's invariant compliance judges the rest
Paths: plugin/agents/implementer.md, plugin/agents/slice-reviewer.md, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/references/review-scope-mode.md, plugin/references/scope-mode.md, plugin/references/scope-findings.md

### INV-0158

Class: process
Concepts: Derived criteria, Definition of Done (DoD), Intent
Statement: `/superdev:plan`'s derive dispatch carries no line of the plan's Definition of Done, by path or by text, and `final-reviewer` in derive mode reads no Definition of Done by any route, on every plan kind (ADR 0158).
Breaks: silently
Check: scripts/drift-check.js `derive-no-dod` — plan's derive dispatch bullet hands no Definition of Done, and final-reviewer's derive mode reads none
Paths: plugin/skills/plan/SKILL.md, plugin/agents/final-reviewer.md

### INV-0159

Class: safety
Concepts: Guardrail
Statement: Each guardrail reads its own hook input and writes its own decision with code in its own file. A guardrail loads every plugin module it uses through a guarded require, and it keeps the failure posture it documents for each module on its own: when one module cannot load, when only some of its modules load, and when a function of a loaded module throws. merge-guard requires no module (INV-0141). tree-guard allows (ADR 0148). run-trace records nothing. scope-prune and slicetree-sweep remove nothing (ADR 0151).
Breaks: silently
Check: tests/merge-guard.test.js, tests/scope-prune-guards.test.js, tests/slicetree-sweep.test.js, tests/tree-guard.test.js — each runs its hook copied away from the modules it loads, with a stub module in each module's place that the test confirms was loaded, and asserts that hook's documented verdict; tests/run-trace-guards.test.js runs its hook in place under a `-r` preload that intercepts `Module._load`, stubs each module at the request its requiring module makes, confirms each stub loaded through a marker file, and asserts that hook's documented verdict; tests/run-trace-guards.test.js also runs each module the run-trace hook loads, directly or through another module, unloadable, with the stub loaded at its requiring module's request; tests/run-trace-guards.test.js also runs each function the run-trace hook takes from a new module of `plugin/lib/` missing and throwing, on the event that calls it, a review's stop and a foreground review's result included, and asserts that the event records no dispatch-end; tests/run-trace-guards.test.js also runs a function that throws only for the second of two dispatches a Stop closes, and asserts that the event records no dispatch-end; tests/scope-prune-guards.test.js also runs with its containment module throwing on load or carrying no probe, and asserts it prunes by tree comparison alone; tests/scope-prune-guards.test.js and tests/slicetree-sweep.test.js also run each hook with `plugin/lib/git-spawn.js` unloadable, missing a function the hook takes, or with one of those functions throwing, each beside a control stub that does prune or sweep, and assert that the hook prunes or sweeps nothing; tests/slicetree-sweep.test.js also runs a `parseBranchList` that throws for only one of two scopes, and asserts that the hook skips that scope and sweeps the other
Paths: plugin/hooks/*.js, plugin/lib/*.js

### INV-0160

Class: safety
Concepts: Run trace
Statement: run-trace guards nothing: whatever fails in it, such as an unloadable module or a throwing function, it denies no call, prints nothing, records no partial event, and exits 0 (ADR 0159, ADR 0227).
Breaks: loudly
Check: tests/run-trace-guards.test.js — with any module it loads unloadable, or a function of one throwing, the hook records nothing
Paths: plugin/hooks/run-trace.js, plugin/hooks/hooks.json

### INV-0162

Class: process
Concepts: Implementer, Slice, Criterion tag, Doc-writer
Statement: An implementer edits the `AGENTS.md` hierarchy only on a `docs` slice whose `spec` names that `AGENTS.md` text as its deliverable. Every other slice's implementer, and every fix implementer, leaves the `AGENTS.md` hierarchy to the doc pass. The agent body and every dispatch that reaches it state the same boundary (ADR 0161).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/implementer.md, plugin/skills/implement/**, plugin/references/**, plugin/references/review-scope-mode.md, plugin/skills/review/**

### INV-0163

Class: architecture
Concepts: Test audit, Gap audit, Test-auditor, Test-gap-auditor
Statement: A test audit's cost audit dispatches one `test-auditor` over the whole swept test set, because a redundant pair has two halves and a split sweep sees one of them. Only the gap audit splits its source set across `test-gap-auditor` dispatches, because a gap belongs to one symbol (ADR 0162).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/review-tests/SKILL.md, plugin/agents/test-*.md

### INV-0164

Class: architecture
Concepts: Parent link, Backend command contract
Statement: A parent-link edit reads the live parent through the `read` command at publish time and changes exactly one list-item line of it: it adds the child's `parent-link` line, with the blank lines that set it apart in a section whose own content, ahead of any subsection, holds no list item yet, or removes the child's own link line, with the blank line above it when it is the only list item of the section's own content, nested items counted. Every other byte of the parent stays as read, line endings included. The edit never replaces a section or the whole page, and the `update` it sends carries the parent's own title (ADR 0168).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/lib/kb-parent-link.js

### INV-0165

Class: process
Concepts: Backlog survey, Slice store, Ledger
Statement: `/superdev:status` prints every run's ledger block before it reads the slice store. An unconfigured store or a failed store listing prints one line naming the gap or the failure in place of the survey table and its move, so a store problem never hides local run state and never reads as an empty backlog (ADR 0163).
Breaks: silently
Check: none — the survey is prose a model runs, and final-reviewer's invariant compliance judges it
Paths: plugin/skills/status/SKILL.md

### INV-0166

Class: process
Concepts: Backlog survey, Ledger, Run lock
Statement: The backlog survey never recommends, and never offers to delete, a run live in another session: a run root whose ledger carries a standing `**Step:**` line and whose `run.lock` is under an hour old takes the `running` bucket, whatever its stage or anchor match, and is never the recommended move (ADR 0163).
Breaks: silently
Check: none — the survey is prose a model runs, and final-reviewer's invariant compliance judges it
Paths: plugin/skills/status/SKILL.md

### INV-0167

Class: process
Concepts: Backlog survey, Scope anchor, Published snapshot
Statement: The backlog survey never recommends taking over a run it cannot see live: an open scope anchor with no local run root whose `## Run state` snapshot stage is past `planned` and short of `shipped` takes the `elsewhere` bucket, and an `elsewhere` row is never the recommended move (ADR 0164).
Breaks: silently
Check: none — the survey is prose a model runs, and final-reviewer's invariant compliance judges it
Paths: plugin/skills/status/SKILL.md

### INV-0168

Class: process
Concepts: Candidate set, Standing code, Chained posture
Statement: `/superdev:review` resolves a path argument that names the invoking checkout's top level (its git top level is the checkout's own, and its git prefix is empty) exactly as it resolves no argument, in every repository state and under `--unattended` and `--chained` alike. A path into a subdirectory keeps the path shape. A named argument that resolves to nothing stops and names itself, and never falls through to the empty cascade (ADR 0165).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/review/SKILL.md

### INV-0169

Class: architecture
Concepts: Scope branch, Containment, Code host
Statement: A superdev push overwrites a remote scope branch only when the containment test proves base already holds that remote tip's content, and only through a lease naming that exact tip; no superdev push uses a bare force, and a remote tip the test does not prove contained is never overwritten (ADR 0167).
Breaks: silently
Check: tests/scope-push.test.js — the lease push on a contained remote tip, the rejected lease on a remote that moved after the fetch, and the refusal of a foreign remote tip, a local namesake included, and a `**Branch:**` line naming base refused with nothing pushed
Paths: plugin/lib/**, plugin/scripts/scope.js, plugin/skills/plan/SKILL.md, plugin/references/scope-mode.md, plugin/references/scope-branch.md

### INV-0170

Class: architecture
Concepts: Staged page, Parent link, Knowledge base
Statement: On a knowledge base whose configuration declares `- **Hierarchy:** links`, `/superdev:publish-kb` reports a staged page that names a `parent` as published only once the live parent body links it. A page whose link cannot be written is reported as not linked with its reason, its staged file stays, and the next run retries the link without refusing the page because of this run's own write to it. No link is written before the page itself has landed (ADR 0168).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/lib/kb-apply.js, plugin/lib/kb-parent-link.js, plugin/skills/publish-kb/**

### INV-0171

Class: process
Concepts: Minor queue, Minor sweep, 3-strike fix loop
Statement: Every Minor finding a full-tier slice review leaves is fixed and reviewed inside the run, named in the run's report when it remains at the Minor sweep's cap, or deferred like any finding whose remedy adds a capability the Definition of Done never named. A slice merged with only Minor findings keeps its Minor queue entry, naming the slice by id, in the ledger until the Minor sweep settles it, and a run that stops or blocks before the sweep settles keeps the entry (ADR 0174, ADR 0098).
Breaks: silently
Check: tests/scope-ledger.test.js — the Minor queue verb's add, read, and clear, and a ledger with no queue section reading as an empty queue
Paths: plugin/references/implement-full.md, plugin/references/run-handoff.md, plugin/lib/ledger-records.js, plugin/scripts/scope.js

### INV-0172

Class: architecture
Concepts: Offer, Run root, Next block
Statement: A chain command takes its state from its own arguments and the run root, never from the conversation that preceded it. Started with the arguments its predecessor's Next block prints, it behaves the same in the conversation that offered it, after `/clear`, and in a new session (ADR 0176).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it; a fact only a conversation holds has no file a test could read
Paths: plugin/references/response-shapes.md, plugin/references/run-handoff.md, plugin/skills/implement/SKILL.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md, plugin/skills/document/SKILL.md, plugin/skills/submit-pr/SKILL.md, plugin/skills/ship/SKILL.md, plugin/skills/verify-ship/SKILL.md, plugin/skills/wrap-up/SKILL.md

### INV-0173

Class: process
Concepts: Final-reviewer, Focused test command
Statement: `final-reviewer` runs no test, in scope mode and in ad-hoc mode, and reviews against the result `/superdev:review` hands it. In ad-hoc mode the review skill runs one focused run over the subject's changed paths, and only where the subject's tip is the checked-out tree: the working tree's uncommitted changes, or a range ending at `HEAD` on a clean working tree. Every other subject runs no test, and the report names the reason. An inline fix adds one focused run over the fix range's changed paths in the fix worktree (ADR 0228). The full suite runs in ad-hoc mode only when the operator asks for it, and never under `--chained` (ADR 0179). In scope mode the review skill runs one focused run at entry over the paths the scope's range changes, and hands no run where that path set is empty or the focused command repeats the full one; the full suite runs only at the scope review's exit (ADR 0192).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/agents/final-reviewer.md, plugin/skills/review/SKILL.md, plugin/references/review-scope-mode.md

### INV-0175

Class: process
Concepts: Doc-writer, Affected form, Suite record
Statement: `/superdev:document` runs no test command, in any mode or fix round, and `/superdev:setup` runs no test command in any configuration. Setup validates an affected form only through read-only tool queries, and asks the operator where a query fails or cannot decide (ADR 0189). Running the prepare command in a probe worktree is no test run (ADR 0218).
Breaks: silently
Check: scripts/drift-check.js `doc-setup-no-test-run`
Paths: plugin/skills/document/**, plugin/skills/setup/**, plugin/agents/doc-writer.md, plugin/agents/doc-reader.md, plugin/references/doc-pass.md

### INV-0176

Class: process
Concepts: Fail-to-pass run, 3-strike fix loop, Slice-reviewer, Final-reviewer
Statement: A Pass-to-pass finding carries the unclosable mark only when the reviewer that raised it sets it, in one of the closed cases: the range's behaviour change lies wholly in test-path files, a file the outcome line's command does not read carrying none, its test pins existing behaviour on purpose, or its changes outside the test paths preserve behaviour. An implementer's or the lite controller's claim of a case is input the reviewer checks. A marked finding enters no fix list, and a Missing fail-to-pass run finding never carries the mark (ADR 0193, ADR 0196).
Breaks: silently
Check: none — the mark is a reviewer's reading of a diff, and no cheap test tells a sound case from a waved-off weak test; final-reviewer's invariant compliance judges it.
Paths: plugin/references/review-checklist.md, plugin/agents/slice-reviewer.md, plugin/agents/final-reviewer.md, plugin/agents/implementer.md, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/references/review-scope-mode.md

### INV-0177

Class: architecture
Concepts: Run trace
Statement: The run trace carries a line kind only while a shipped superdev decision or a reviewer rule reads it. A kind that only superdev-view reads is not written (ADR 0197).
Breaks: silently
Check: none — whether a reader acts on a kind is a reading of prose and code together; a reviewer of a change that adds a trace kind applies it.
Paths: plugin/hooks/run-trace.js, plugin/lib/trace-log.js

### INV-0178

Class: process
Concepts: Intent, Intent record
Statement: A handoff of a ready intent (`/superdev:brainstorm`, `/superdev:sweep`, `/superdev:review-tests`) reports the intent handed off only once its intent record exists in the slice store, and then leaves no local intent file. A write that loses the record's intent signal counts as failed. A draft intent never reaches the store. When the record could not be written, the local file stays ready and the report says the intent exists only in this checkout. `/superdev:plan` offers every open intent record and never requires the local file (ADR 0199).
Breaks: silently
Check: none — the handoff is skill prose against a live store; final-reviewer's invariant compliance judges it
Paths: plugin/skills/brainstorm/SKILL.md, plugin/skills/sweep/SKILL.md, plugin/skills/review-tests/SKILL.md, plugin/skills/plan/SKILL.md, plugin/references/intent-handoff.md

### INV-0179

Class: safety
Concepts: Run-state ref, Run root
Statement: A run-state push to `refs/superdev/<scope>` never changes the files, the index, or the checked-out branch of any checkout. It builds its commit without touching them (ADR 0202).
Breaks: silently
Check: the scope.js suite asserts a checkout's status, index, and HEAD unchanged across a push
Paths: plugin/lib/ledger-lifecycle.js, plugin/scripts/scope.js

### INV-0180

Class: architecture
Concepts: Operator configuration, Backend command contract, Knowledge base
Statement: The shipped plugin reads no environment variable that superdev defines, and passes none to a child process. Every knob comes from the operator configuration, and a knowledge-base backend command takes its values only from the JSON file named by `$1`, never from its command text (ADR 0207).
Breaks: silently
Check: the drift check that forbids a `SUPERDEV_` environment variable in shipped code and prose; the publish-kb suites that run a template against the values file
Paths: plugin/lib/push.js, plugin/lib/fail-to-pass.js, plugin/lib/kb-backend.js, plugin/lib/kb-backend-config.js, plugin/lib/operator-config.js, plugin/references/knowledge-base-forgejo.md, plugin/references/knowledge-base-confluence.md

### INV-0181

Class: architecture
Concepts: Ledger, Run trace, Run root
Statement: A delete of a run's `ledger.md` or `trace.log`, by whatever means, is detected like any other outside write: the next `scope.js` verb that writes to the run finds the file absent while its digest is present, warns once on stderr naming the file, appends a `tamper <file>` trace line, and goes on. A delete of any other path in a run root is no concern of the check. Only `scope.js discard` removes a run's ledger, run trace, and digest sidecar (ADR 0208, ADR 0227).
Breaks: silently
Check: tests/scope-digest.test.js — the ledger deletion and trace deletion cases; the `scope.js discard` suite
Paths: plugin/lib/run-check.js, plugin/lib/run-digest.js, plugin/lib/discard.js, plugin/scripts/scope.js, plugin/skills/plan/SKILL.md

### INV-0182

Class: architecture
Concepts: Definition of Done (DoD), Criterion tag, Scope anchor
Statement: Every unjudged checklist line of a multi-slice epic's Definition of Done reaches the store with a tag `dod-line` reads: slice ids, store references joined by `, ` with no brackets, `scope`, or `docs`. `/superdev:plan` writes store-notation tags only through `scope.js dod-tags`, which refuses a body holding an untagged unjudged line or a slice id its map lacks (ADR 0209).
Breaks: silently
Check: the `scope.js dod-tags` suite
Paths: plugin/scripts/scope.js, plugin/lib/dod-line.js, plugin/skills/plan/SKILL.md, plugin/references/plan-contract.md, plugin/references/issue-tracker-forgejo.md, plugin/references/issue-tracker-github.md, plugin/references/issue-tracker-jira.md

### INV-0183

Class: architecture
Concepts: Next block, Offer
Statement: A main-session turn that ends on a Next block naming one command, with no `Blocked:` or `First:` line, or with no Next heading names one command in a lone-command fence or in a `/superdev:` code span on a line saying "next", both in its last paragraph, ends only after an offer call of that turn named that command, or after one block by `hooks/offer-guard.js`. The block reason names the exceptions. The hook fails open on every malformed input and never blocks twice in a row. A turn whose one next command is the superdev skill the session transcript last started passes (ADR 0213, ADR 0216, ADR 0222, ADR 0226).
Breaks: silently
Check: the `offer-guard.js` suite
Paths: plugin/hooks/offer-guard.js, plugin/lib/running-skill.js, plugin/hooks/hooks.json, plugin/references/response-shapes.md

### INV-0184

Class: process
Concepts: Offer, Next block
Statement: An offer's `start_session` call carries in its `prompt` only the command as the fence prints it and the offer's marker line, and in its `background` only what the new session starts from. No rule, bar, or limit of the command that is ending reaches the started command, which takes its limits from its own skill. A step-scoped bar, such as `/superdev:review`'s integration bar, ends with its step.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/response-shapes.md, plugin/references/review-scope-mode.md

### INV-0185

Class: process
Concepts: Doc-reader, Doc-writer, Staged page
Statement: Every doc pass `/superdev:document` runs, ad hoc or on a live run, ends with a reader test, or with the degraded entry a denied reader writes, except the pass with an empty file list below. The reader's file list holds every doc the pass changed, every doc the writer judged current, and every page staged under the run's staging path whose action is not `delete`. A pass whose writer judged no doc relevant and that staged nothing has an empty file list: it dispatches no reader and ends with the writer's stated reason in the report. Every other doc pass ends on a reader's result, never on the writer's claim alone (ADR 0219).
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/skills/document/SKILL.md, plugin/agents/doc-reader.md, plugin/agents/doc-writer.md, plugin/references/implement-lite.md, plugin/references/doc-pass.md

### INV-0186

Class: architecture
Concepts: Run lock, Run trace
Statement: Each line written to a run root's `trace.log` sets that run root's `run.lock` mtime to the current time when the lock exists as a regular file. The refresh never creates a lock, never changes its content, never follows a symlink, and never changes whether the trace line counts as written (ADR 0220).
Breaks: silently
Check: tests/scope-trace.test.js — a trace line refreshes a two-hour-old lock with its bytes unchanged, creates no lock, leaves a symlinked lock's target, a directory lock, another run root's lock, and a removed run root as they were, refreshes nothing on a failed append, and a ledger verb's line refreshes the lock
Paths: plugin/lib/trace-log.js

### INV-0187

Class: architecture
Concepts: Guardrail
Statement: No shipped hook or module reads a Bash call's `tool_input.command`, except merge-guard's raw-text check (ADR 0227).
Breaks: silently
Check: tests/plugin-layout.test.js — the files under `plugin/` that read the command field are merge-guard.js alone, and the same scan finds a fixture file outside `plugin/` that reads it
Paths: plugin/hooks/*.js, plugin/lib/*.js, plugin/scripts/*.js

### INV-0188

Class: architecture
Concepts: Topic page, Knowledge base, Staged page
Statement: The doc pass writes knowledge-base text only to a page the outline names explicitly. An outline entry that holds a placeholder names no page. Text no named page fits goes to a new outline entry, added to `docs/agents/knowledge-base.md` in the scope's doc commit with its reason, before any page for it is written. A page the outline does not name is corrected when the change makes it stale, and receives no new text.
Breaks: silently
Check: none — final-reviewer's invariant compliance judges it
Paths: plugin/references/doc-pass.md, plugin/agents/doc-writer.md, plugin/skills/document/SKILL.md, plugin/references/knowledge-base-*.md

### INV-0189

Class: process
Concepts: Absorbed triage record, Scope anchor, Definition of Done (DoD), Release-risk criterion
Statement: Before ship, every entry on a scope anchor's Absorbs line is cited as `(triage <reference>)` by exactly one Definition-of-Done criterion, and every such citation names an entry on that line. The Definition of Done carries a `Reachable:` criterion and `Release risk:` criteria naming all four release-risk categories. `/superdev:plan` refuses to write an anchor that breaks this, and a scope review of one holds the stage with an `**Unresolved:**` entry per problem. Both read it through `scope.js dod-check`, never by their own judgement (ADR 0233).
Breaks: silently
Check: the `scope.js dod-check` suite
Paths: plugin/scripts/scope.js, plugin/lib/dod-check.js, plugin/skills/plan/SKILL.md, plugin/references/review-scope-mode.md, plugin/references/plan-contract.md
