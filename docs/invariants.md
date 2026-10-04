# Invariant register

Rules this repository's system may never break. `plugin/references/domain-modeling.md` owns the entry
format; `/superdev:plan` adds an entry when one crystallises.

### INV-0001

Class: architecture
Statement: No superdev command commits to the base branch, with one exception: `/superdev:ship`'s merge of the pull request through the host's merge API, pinned to the tested head (ADR 0096). Every other write a run makes lands on that run's own scope branch, in its own scopetree. No command merges or pushes to the base branch with local git.
Concepts: Base branch, Scope branch, Scopetree, Run root
Breaks: silently
Check: scripts/drift-check.js — no shipped prose instructs a commit to the base branch
Paths: plugin/skills/**, plugin/references/**

### INV-0002

Class: process
Statement: A load-bearing commitment that reaches /superdev:plan leaves the run either as an invariant register entry or as a reason, named out loud, that it implies no entry. A rejected direction a seeded intent carries leaves it in an ADR's Considered options, in the epic's non-goals, or with a reason, named out loud, that it is dropped. None of either is dropped in silence.
Concepts: Load-bearing commitment, Rejected direction, Invariant register, Intent
Breaks: silently
Check: scripts/drift-check.js — the commitment contract, pinned together in brainstorm's prose, plan's prose, and domain-modeling.md; partial: nothing pins the rejected-direction half
Paths: plugin/skills/brainstorm/**, plugin/skills/plan/**, plugin/references/domain-modeling.md

### INV-0003

Class: architecture
Concepts: Containment, Scope branch, Base branch
Statement: A containment test answers contained only on positive evidence that base holds the branch's work — an equal tree, or a patch id base's history carries. Every path that cannot answer, whether a failed git call, an exhausted bound, or an unresolved ref, answers not contained.
Breaks: silently
Check: tests/scope.test.js, tests/scope-prune.test.js — each failure path asserted to answer not contained
Symbols: testContainment, baseHistoryHasPatch, containedInBase
Paths: plugin/scripts/scope.js, plugin/hooks/scope-prune.js

### INV-0004

Class: architecture
Concepts: Definition of Done (DoD), Append mode, Scope anchor
Statement: A Definition of Done is a claim verified at one moment against one change. A ticked criterion is always readable against the change it was verified against, and is never pooled in one record with criteria from another run.
Breaks: silently
Check: scripts/drift-check.js — /superdev:plan's extend path refuses a shipped feature on either signal
Paths: plugin/skills/plan/**, plugin/references/run-init.md

### INV-0005

Class: process
Concepts: Release, Append mode, Scope anchor
Statement: A release decision covers the work that existed when it was made. Work added to a feature after its release does not inherit that release.
Breaks: silently
Check: scripts/drift-check.js — plan's release question applies the operator's answer in both directions on an append
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md

### INV-0006

Class: architecture
Concepts: Definition of Done (DoD), Verification ceiling, Scope branch
Statement: Verifying a Definition-of-Done criterion observes. It changes no system outside the repository. An item that needs an outward-facing change to verify stays unticked, with a note, for the operator to verify after merge. After the merge, `/superdev:verify-ship` observes the deployed system read-only and runs no deploy target's command (ADR 0106).
Breaks: silently
Check: scripts/drift-check.js — VERIFICATION_CEILING_CONTRACTS pins the ceiling on scope-mode.md's own `## Verification ceiling` section, on both verifying agent bodies, and on every surface that verifies a criterion or dispatches one that does
Paths: plugin/references/scope-mode.md, plugin/agents/final-reviewer.md, plugin/agents/implementer.md, plugin/skills/review/**, plugin/skills/implement/**, plugin/skills/document/**, plugin/references/run-handoff.md, plugin/references/dod-ticks.md, plugin/skills/verify-ship/**

### INV-0007

Class: process
Concepts: Focused test command
Statement: A configuration a repository cannot supply is recorded with its reason, never inferred from an absent setting. `hooks/green-gate.js` is the one named exception: firing with no operator to ask, it infers the full command from a one-fence `verification.md` and emits a notice instead of stopping.
Breaks: silently
Check: scripts/drift-check.js — setup writes both fences with the cannot-narrow reason as prose, test-selection.md stops rather than inferring the full command, plan/implement auto-invoke setup on a repository stuck on one fence, and green-gate.js runs the full command with a notice instead of stopping
Paths: plugin/skills/setup/**, plugin/references/test-selection.md, plugin/skills/plan/**, plugin/skills/implement/**, plugin/hooks/green-gate.js

### INV-0008

Class: process
Concepts: Definition of Done (DoD), Reachability criterion
Statement: A Definition-of-Done criterion states a requirement the feature meets, never a procedure superdev executes to verify it. A Reachable: criterion names an entrance, which is not a procedure.
Breaks: silently
Check: scripts/drift-check.js `criterion-states-a-requirement` — the rule pinned on plan-contract.md and plan's interview
Paths: plugin/skills/plan/**, plugin/references/plan-contract.md

### INV-0009

Class: architecture
Concepts: No verdict, Containment
Statement: A spawn whose own bound expired, whether or not its kill succeeded, carries no verdict, on `plugin/hooks/green-gate.js` and `plugin/scripts/scope.js`. No gate reads its absence as a pass, and no assertion about behaviour stands on it. Such a spawn is reported as killed, never as a decision it never made. A spawn that never started carries a Spawn failure instead, which this rule does not govern: the gate never ran, so green-gate answers it with its own stated reason (ADR 0087).
Breaks: silently
Check: tests/spawn-verdict.test.js — the helper's throw-or-not and message for the killed, never-started, EPIPE-but-decided, and genuinely-decided result shapes; tests/green-gate.test.js — a killed suite blocks the merge; tests/scope.test.js — the refetch asserts the kill signal rather than the clock; the never-started half is ADR 0087's, pinned by drift-check `spawn-failure-answers`
Paths: plugin/hooks/green-gate.js, plugin/scripts/scope.js, tests/**

### INV-0010

Class: process
Concepts: Observation, Triage record
Statement: An observation a run meets is recorded, never judged. It carries no severity, holds no stage, enters no fix loop, and blocks no run.
Breaks: silently
Check: scripts/drift-check.js — `observation-capture` pins the rule's own statement in scope-mode.md, and `observation-capture-reminders` pins the reminder at every document that dispatches a `superdev:` subagent
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
Check: scripts/drift-check.js — the stage-plus-freshness check is pinned on scope-mode.md's own `## The run lock` section, scoped to `/superdev:implement`'s entry, on run-init.md and both execution playbooks, which cite it, and (the absence half) `scanRunLockLivenessSilence` asserting review/document/submit-pr carry no such language of their own
Paths: plugin/references/scope-mode.md, plugin/references/run-init.md, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/skills/review/SKILL.md, plugin/skills/document/SKILL.md, plugin/skills/submit-pr/SKILL.md

### INV-0014

Class: process
Concepts: Definition of Done (DoD), Tick
Statement: Every judged Definition-of-Done line carries a note. A ticked criterion names its evidence; an unticked one names why it is not met, that only a deploy can verify it, or that an attended operator accepted it as unmet, with any partial evidence. A bare tick is invalid, and a line nobody has judged yet carries no note.
Breaks: silently
Check: scripts/drift-check.js — the note rule pinned on the shared tick reference and on every surface that writes or takes back a tick (implement's playbooks and run handoff, review, document)
Paths: plugin/references/**, plugin/skills/implement/**, plugin/skills/review/**, plugin/skills/document/**

### INV-0015

Class: process
Concepts: Definition of Done (DoD), Tick, Criterion tag, Controller
Statement: Only a controller writes a Definition-of-Done tick. It ticks a criterion from an implementer's report only where the criterion's tag names that implementer's slice, and settles every other criterion only in run handoff's own pass, in review, or in document's own untick of a criterion its commits broke. Review's controller may also tick a criterion straight from `final-reviewer`'s own `holds` verdict, with the verdict's evidence as the note. After the merge, `/superdev:verify-ship`'s controller ticks a criterion that is neither ticked nor `accepted:`, from its own read-only observation or from the operator's answer (ADR 0106). No subagent writes a tick, and neither `/superdev:submit-pr`, `/superdev:ship`, nor `/superdev:wrap-up` writes one.
Breaks: silently
Check: scripts/drift-check.js — the mapping gate pinned on the shared tick reference and both playbooks; no agent under plugin/agents/ and no ship step instructs a tick; document's own untick (`doc-untick-on-break`) is the controller's own direct check, never a dispatched worker's report
Paths: plugin/references/**, plugin/agents/**, plugin/skills/implement/**, plugin/skills/review/**, plugin/skills/document/**, plugin/skills/submit-pr/**, plugin/skills/ship/**, plugin/skills/verify-ship/**

### INV-0016

Class: process
Concepts: Stage, Definition of Done (DoD), Verification ceiling
Statement: A scope's stage never advances past review while a Definition-of-Done criterion stands unmet, except one only a deploy can verify or one an attended operator accepted as unmet (`accepted:`). Every scope passes review, whatever its slice types.
Breaks: silently
Check: scripts/drift-check.js — review's stage-write condition pinned beside its unmet-criterion rule; run handoff names `/superdev:review` as the next command for every scope; document's closing step (`doc-untick-on-break`) writes no stage and prints `/superdev:review` rather than `/superdev:ship` when it unticks a criterion its own commits broke, or when a standing `**Unresolved:**` entry from an earlier pass already stands
Paths: plugin/skills/review/**, plugin/references/run-handoff.md, plugin/skills/document/**

### INV-0017

Class: process
Concepts: Focused test command, Suite record
Statement: A slice implementer and a fix cycle run only the focused command. The full suite runs at run handoff, once more when a fix loop there first comes back clean, and after review's first clean re-review. Where the repository configures a whole-repo command, it runs once before the pull request opens, on a tip that carries no green whole-repo result at ship (which instead refuses while a review invalidation stands, INV-0092), and in place of the full suite in a review entered while the suite record reads red of kind `whole`. A green result recorded on the commit a step would run on is reused rather than run again. A result recorded on any other commit is not. A step that needs a whole-repo run reuses only a record of kind `whole`.
Breaks: silently
Check: scripts/drift-check.js — the full-suite contract rows on run handoff and review; tests/scope.test.js — the suite record's read and write, and `suite reusable`'s tip-match cases
Paths: plugin/references/run-handoff.md, plugin/skills/review/**, plugin/skills/submit-pr/**, plugin/skills/ship/**, plugin/agents/implementer.md, plugin/scripts/scope.js

### INV-0018

Class: process
Concepts: Slice-reviewer, Implementer
Statement: The slice-reviewer runs the suite itself, independently of the implementer's report, and never passes a slice on the reported result alone.
Breaks: silently
Check: `scripts/drift-check.js` `test-selection-wiring` (the `plugin/agents/slice-reviewer.md` row on Lens 2's independent re-run)
Paths: plugin/agents/slice-reviewer.md

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
Statement: Every review agent carries the judge-discipline text verbatim, so the four copies never diverge.
Breaks: silently
Check: none — no row compares the copies
Paths: plugin/agents/**

### INV-0021

Class: process
Concepts: Final-reviewer, Doc-writer, Scope checkout
Statement: The doc reconcile runs after the final review and its fix loop, never concurrently with them, so it describes the final state.
Breaks: silently
Check: none — enforced by chain structure only
Paths: plugin/skills/review/**, plugin/skills/document/**

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
Paths: plugin/skills/plan/**

### INV-0024

Class: architecture
Concepts: Run root, Scope
Statement: Every run-root scan reads `.superdev/scopes/*/` only. A directory beside `scopes/` under `.superdev/` is never treated as a run root.
Breaks: silently
Check: none — no test covers a sibling area
Paths: plugin/hooks/scope-prune.js, plugin/hooks/slicetree-sweep.js, plugin/hooks/run-lock.js, plugin/scripts/scope.js, plugin/skills/status/SKILL.md

### INV-0025

Class: process
Concepts: Stage, Ledger
Statement: Only `/superdev:submit-pr` writes the `submitted` stage, and only after opening the pull request. Only `/superdev:ship` writes the `shipped` stage, and only once the pull request has merged — through its own pinned merge, or by adopting a merge someone made by hand.
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
Statement: The doc agents read which writing standard applies from the `## Writing standard` pointer in `docs/agents/documentation.md`. None carries a standard of its own. `/superdev:prose-check` applies `references/controlled-prose.md` whatever the pointer says, and whether or not that file exists.
Breaks: silently
Check: `scripts/drift-check.js` `writing-standard` (the pointer half; nothing pins prose-check's independence from the pointer)
Paths: plugin/references/documentation.md, plugin/skills/prose-check/SKILL.md

### INV-0031

Class: process
Concepts: Scope mode, Final-reviewer
Statement: `/superdev:review` writes nothing on an ad-hoc range. It writes only when it reviews a live scope.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/review/SKILL.md

### INV-0032

Class: process
Concepts: Run lock, Scope mode
Statement: `/superdev:review`, `/superdev:document`, `/superdev:submit-pr` and `/superdev:ship` refresh an existing `run.lock`'s mtime and never create one.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/scope-mode.md, plugin/skills/review/SKILL.md, plugin/skills/document/SKILL.md, plugin/skills/submit-pr/SKILL.md, plugin/skills/ship/SKILL.md

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
Check: `scripts/drift-check.js` `content-types` (the read-at-every-dispatch half)
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
Check: `scripts/drift-check.js` `unattended-token` (the `## Unattended` section, plus the token and a read instruction in every chain document)
Paths: plugin/references/scope-mode.md, plugin/skills/**, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/references/run-init.md, plugin/references/run-handoff.md

### INV-0039

Class: architecture
Concepts: Scope anchor, Slice store, Seed, Release, Published snapshot, Triage record, Untriaged item, Assignee, Anchor dependency
Statement: No command or agent names a slice store's own mechanics. Each reads them from the matching section of the active store document, which specialises `references/plan-contract.md`.
Breaks: silently
Check: `scripts/drift-check.js` `anchor-contract`, `release-contract`, `run-state-contract`, `triage-record`, `untriaged-item`, `assignee`, `specialising-citations`, `glossary-specialising-citations` — partial: these pin that each store document carries its sections and that citations specialise; no content-neutrality scan exists, so a skill that hardcodes a store call trips nothing
Paths: plugin/skills/**, plugin/agents/**, plugin/references/plan-contract.md, plugin/references/issue-tracker-*.md

### INV-0041

Class: architecture
Concepts: Feature label, Slice store
Statement: The feature label's notation is stated only by the active store document, and no command hardcodes a prefix. Every caller can still name its target.
Breaks: silently
Check: `scripts/drift-check.js` `feature-label-argument` (the caller-can-name-its-target half)
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
Check: `scripts/drift-check.js` `label-validation` (both label segments validated before a path or branch is built). Nothing pins the verbatim or `**Branch:**`-read halves.
Paths: plugin/references/scope-mode.md

### INV-0045

Class: architecture
Concepts: Staged page, Invoking checkout, Scopetree, Run root
Statement: A staged page is written to an absolute path under `.superdev/kb-pending/<scope>/`, never inside a run root or a scopetree, so no cleanup of either removes it.
Breaks: silently
Check: none — the absolute-path half is unpinned
Paths: plugin/references/doc-pass.md, plugin/skills/document/SKILL.md, plugin/skills/plan/SKILL.md

### INV-0046

Class: architecture
Concepts: Aggregate page, Backend command contract, Staged page, Knowledge base
Statement: A backend declaring no `read` template carries no aggregate page. `publish-kb.js` leaves every `action: patch` page staged with that reason.
Breaks: silently
Check: `tests/publish-kb.test.js` ("a configuration declaring no read template leaves every patch page staged with that reason"); `scripts/drift-check.js` `read-path`
Paths: plugin/scripts/publish-kb.js, plugin/skills/setup/SKILL.md

### INV-0047

Class: architecture
Concepts: Run kind, Execution playbook, Ledger, Stage
Statement: Run init computes a run's kind once, from its ledger alone, as `fresh` or `resumed`. Both execution playbooks read that value and derive none of their own.
Breaks: silently
Check: none — no single-site pin
Paths: plugin/references/run-init.md, plugin/references/implement-full.md, plugin/references/implement-lite.md, plugin/references/scope-mode.md

### INV-0048

Class: process
Concepts: Run kind, Degraded pass, Ledger
Statement: A stop at the scope-branch step writes nothing: no run starts, no ledger entry is written, and no degraded pass is recorded.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/references/scope-mode.md

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
Statement: A `**Docs:**` record stands only for the commits its pass saw. `/superdev:document` skips the doc-writer only while the record stands. A review fix loop that lands commits clears it. A full-tier run never writes one.
Breaks: silently
Check: `scripts/drift-check.js` `verb-pointer` (`docs set` in implement-lite.md, `get docs` in document, `docs clear` in review) and `doc-pass`
Paths: plugin/references/implement-lite.md, plugin/skills/document/SKILL.md, plugin/skills/review/SKILL.md, plugin/references/doc-pass.md

### INV-0051

Class: architecture
Concepts: Shipped tree
Statement: An install carries `plugin/` alone. Every file the runtime reads lives under `plugin/`, nothing under `plugin/` requires or reads a repo-root path, and `plugin/` carries no test code.
Breaks: silently
Check: `scripts/drift-check.js` `marketplace-source` (the source resolves to a directory carrying `plugin/.claude-plugin/plugin.json`). Nothing checks that shipped files never reference a path outside `plugin/`, or that `plugin/` holds no test code.
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
Check: `scripts/drift-check.js` `release-contract` (every store document carries `## Release`, and plan and implement each name it); `release-answer-not-inferred` was not opened by the batch and is not cited
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
Statement: Every scope gets an over-engineering pass. A full-tier scope gets it per `behavior` slice in `implement-full.md`, so `/superdev:review` skips simplicity-reviewer there. A lite-tier scope gets it whole-scope from `/superdev:review`. Its findings gate nothing.
Breaks: silently
Check: `scripts/drift-check.js` `tier-skip` — partial: pins the full-tier skip/dispatch dependency alone; nothing pins that a lite-tier scope gets its pass whole-scope from `/superdev:review`, or that its findings gate nothing
Paths: plugin/skills/review/SKILL.md, plugin/references/implement-full.md

### INV-0056

Class: architecture
Concepts: Tier, Ledger, Execution playbook
Statement: The tier is never stored. Every reader derives it from the loaded slice set by one threshold: three or fewer slices is lite, more is full. An underivable tier resolves to the blocking answer.
Breaks: silently
Check: none — no agreement pin across the derivation sites
Paths: plugin/skills/implement/SKILL.md, plugin/skills/review/SKILL.md, plugin/references/scope-mode.md, plugin/scripts/scope.js

### INV-0058

Class: process
Concepts: Published snapshot, Adopt, Ledger, Scope anchor, Run kind
Statement: The ledger drives control flow, and the anchor's snapshot only mirrors it. Every ledger write the snapshot shows is followed by a publish, and a failed publish changes nothing in the run. Run init adopts only where no local ledger exists and the snapshot's stage is not `shipped`, and reports that run as `resumed`. A store that declares itself snapshot-less publishes and adopts nothing.
Breaks: silently
Check: `scripts/drift-check.js` `publish-run-state`, `adopt-run-state`, `resumed-scopetree-trigger`, `run-state-contract`
Paths: plugin/references/scope-mode.md, plugin/references/run-init.md, plugin/skills/**, plugin/references/implement-full.md, plugin/references/run-handoff.md

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
Paths: plugin/skills/review/SKILL.md

### INV-0061

Class: process
Concepts: Triage record, Deferred finding, Ledger
Statement: Within one run, a finding the ledger already carries as deferred creates no second triage record and no second ledger bullet.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/review/SKILL.md

### INV-0062

Class: process
Concepts: Triage record, Scope anchor
Statement: A triage record's provenance names the feature label, the scope branch and the scope anchor's reference, and never a pull-request URL.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/review/SKILL.md

### INV-0063

Class: process
Concepts: Backlog survey, Slice store, Scope anchor, Triage record, Untriaged item
Statement: A backlog survey writes nothing: no record, label, comment or file. It reads anchors, triage records and untriaged items through the store document's sections, never through a backend's own call, and reads stage through `scope.js get stage`.
Breaks: silently
Check: `scripts/drift-check.js` `backlog-survey` — partial: nothing pins the absence of a backend's own listing call
Paths: plugin/skills/backlog/SKILL.md

### INV-0065

Class: process
Concepts: Untriaged item, Backlog survey
Statement: No superdev surface acts on an untriaged item. The backlog survey lists it, and only a human turns it into a plan or closes it.
Breaks: silently
Check: none — no pin exists today
Paths: plugin/skills/backlog/SKILL.md

### INV-0066

Class: architecture
Concepts: Model-invocable surface, Unattended run
Statement: `/superdev:ship`, `/superdev:verify-ship`, and `/superdev:wrap-up` are never model-invocable surfaces: each carries `disable-model-invocation: true` in its frontmatter. Every chain step (`/superdev:implement`, `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`) stays model-invocable, carrying no such key.
Breaks: silently
Check: `scripts/drift-check.js` `model-invocation-split` (every chain step), `ship-human-only` (ship, verify-ship, wrap-up)
Paths: plugin/skills/ship/SKILL.md, plugin/skills/implement/SKILL.md, plugin/skills/review/SKILL.md, plugin/skills/document/SKILL.md, plugin/skills/submit-pr/SKILL.md, plugin/skills/verify-ship/**, plugin/skills/wrap-up/**

### INV-0068

Class: architecture
Concepts: Guardrail
Statement: Each shipped hook runs its dispatch when spawned and does nothing when `require`d.
Breaks: silently
Check: `tests/green-gate.test.js`, `tests/ledger-guard.test.js`, `tests/merge-guard.test.js`, `tests/model-explicit.test.js`, `tests/run-lock.test.js`, `tests/update-check.test.js`, `tests/slicetree-sweep.test.js` (each asserts that requiring the hook prints nothing)
Paths: plugin/hooks/*.js

### INV-0069

Class: architecture
Concepts: Timing command, Focused test command, Test audit
Statement: `docs/agents/verification.md` holds the timing command in a backtick span, never a fenced block, so `hooks/green-gate.js` never runs it as the full or focused command. An absent timing command makes a test audit `unmeasured` and never fails it.
Breaks: silently
Check: `tests/green-gate.test.js` (the ADR 0066 case: a `## Timing command` backtick span is invisible to the gate)
Paths: plugin/hooks/green-gate.js, plugin/skills/review-tests/SKILL.md, plugin/skills/setup/SKILL.md

### INV-0070

Class: process
Concepts: Test audit, Unattended run
Statement: A test audit runs only on operator invocation. Unchained, its only writes are its intent and the `.gitignore` entry.
Breaks: silently
Check: none — no absence scan exists
Paths: plugin/skills/review-tests/**

### INV-0071

Class: process
Concepts: Test audit, Intent
Statement: A test audit reports a dead or ignored test as a fact, straight to the intent. Every other finding is a judgment the operator can reject before it reaches the intent. Findings past the round's fixed arity reach the intent labelled `unconfirmed`.
Breaks: silently
Check: `scripts/drift-check.js` `chained-test-audit` (the fact and judgment split stays distinguishable on the chained path)
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
Statement: Every backend command a publish runs is bounded at its spawn. The override lives outside the `SUPERDEV_KB_` prefix, so no `find` result can rewrite the bound. A timeout stops the batch and leaves every untried page staged.
Breaks: silently
Check: `tests/publish-kb.test.js` (per-verb timeout cases; "a timeout stops the batch: the rest are named untried, staged, and never spawned")
Symbols: DEFAULT_TIMEOUT_MS, timeoutMs, timedOut, fieldsToEnv
Paths: plugin/scripts/publish-kb.js, plugin/skills/setup/SKILL.md

### INV-0074

Class: architecture
Concepts: Assignee, Operator configuration, Slice store
Statement: The assignee lives only in the untracked `.superdev/info.json`, resolved against the main working tree from any checkout: that file, else the API token's own identity, with `"none"` opting out. No tracked store document carries an assignee bullet, and the plan-contract slice schema carries no assignee field. Tokens never enter the file.
Breaks: silently
Check: `scripts/drift-check.js` `assignee` (forbids the `- **Assignee:**` bullet and requires the `## Assignee` section)
Paths: plugin/references/plan-contract.md, plugin/references/issue-tracker-*.md

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
Paths: plugin/hooks/scope-prune.js, plugin/hooks/slicetree-sweep.js

### INV-0077

Class: process
Concepts: Candidate set, Run root, Stage
Statement: One section, `scope-mode.md`'s `## Resolving an empty argument`, owns how an empty argument resolves. Each run-taking command names only its own candidate set and cites that section. A caller that cannot ask lists the candidates and stops.
Breaks: silently
Check: `scripts/drift-check.js` `empty-argument`; `tests/publish-kb.test.js` (more than one pending scope and no `--scope`: lists every scope with its page count)
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
Paths: plugin/skills/review/SKILL.md, plugin/references/implement-full.md

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
Statement: No superdev command other than /superdev:submit-pr and /superdev:ship pushes a scope branch. Planning, implementing, reviewing, and documenting work on the local scope branch only, so nothing unreviewed reaches the code host before submit-pr opens the pull request. Ship pushes twice over its own run: once for a tested base merge that moved, once for a tested commit review's own fix loop or an operator's own conflict resolution landed at stage submitted with no base merge involved — both gated on a reusable green record for the pushed tip, and both moving the open pull request's head, never straight to base (INV-0001), since the merge onto base still runs only through the host's own merge API.
Breaks: silently
Check: none — no drift row pins it; it holds because the only push instructions in shipped prose are /superdev:submit-pr §5 and /superdev:ship §4, and the code-management seeds they read
Paths: plugin/skills/**, plugin/references/**

### INV-0088

Class: architecture
Concepts: Invariant register
Statement: No script filters or ranks register entries for /superdev:plan or final-reviewer. Both read docs/invariants.md whole, and their judgment is the only matcher, so an entry the plan passes over stays visible to final-reviewer's own read.
Breaks: silently
Check: scripts/drift-check.js — `invariant-compliance` pins plan's whole read of the register and final-reviewer's own read
Paths: plugin/skills/plan/**, plugin/agents/final-reviewer.md



### INV-0089

Class: process
Concepts: Acceptance, Slice
Statement: /superdev:plan writes a behavior slice's domain-level failure and boundary cases into its acceptance, alongside the happy path, each stated as observable behaviour. Implementation-level edges stay with the implementer and the reviewers.
Breaks: silently
Check: none — no drift row pins the clause in plugin/skills/plan/SKILL.md or plugin/references/plan-contract.md; a row would be cheap
Paths: plugin/skills/plan/SKILL.md, plugin/references/plan-contract.md

### INV-0090

Class: process
Concepts: Invariant register
Statement: Every register entry's mandatory fields, its Concepts, and the Paths, Symbols, and Check paths it names are checked by scripts/invariant-check.js, which bun run test runs against this repository. The check fails naming the entry and the field, so a register rule breaks loudly rather than silently.
Breaks: silently
Check: tests/invariant-check.test.js — each format and resolution rule fails naming the entry and the field; the test chain runs the validator against this repository
Symbols: check, parseEntries, globMatcher
Paths: scripts/invariant-check.js, tests/invariant-check.test.js, package.json

### INV-0091

Class: architecture
Concepts: Staged page, Knowledge base
Statement: `/superdev:publish-kb` never replaces a live non-aggregate page its staged `upsert` was not built from. An `upsert` whose recorded body hash differs from the live page's is refused and stays staged, with the refusal reported per page, whether or not the staged file carries a `created-by-publish` marker. A hashless `upsert` on an existing page is refused the same way, unless the staged file carries that marker, which shows the page is this publish's own create landing; the marker substitutes for a hash only where none was recorded.
Breaks: silently
Check: tests/publish-kb.test.js — the mismatched-hash and hashless-existing-page refusals, the hashless new-page create, and the marker retry that sends an update instead of a refusal
Paths: plugin/scripts/publish-kb.js, plugin/references/doc-pass.md, plugin/agents/doc-writer.md

### INV-0092

Class: process
Concepts: Pinned merge, Suite record, Stage
Statement: A merge superdev makes lands only a scope-branch head that a green full-suite run covers, and a green whole-repo run where the repository configures a whole-repo command. That is either a head with a reusable green suite record, or `/superdev:ship`'s own conflict-free merge of base into the scope branch, tested green before it lands. The merge is pinned to that head, so a head that moved after the test is refused by the host. It never forces past the host's branch protection or required approvals. A red, denied, or conflicting result lands nothing, and neither does a head whose suite record review invalidated for a standing unresolved defect (ADR 0096, ADR 0105).
Breaks: silently
Check: scripts/drift-check.js — ship's pinned-merge, no-force, and not-green-lands-nothing clauses; tests for any `scope.js` verb that decides reuse
Paths: plugin/skills/ship/**, plugin/references/code-management-*.md, plugin/scripts/scope.js

### INV-0093

Class: process
Concepts: Unattended run, Stage
Statement: Only a human moves a scope past its open pull request. Every unattended run ends at `/superdev:submit-pr`. `/superdev:ship`, `/superdev:verify-ship`, and `/superdev:wrap-up` each carry no unattended mode and `disable-model-invocation: true`, so no model and no surface starts one on the operator's behalf (ADR 0096, ADR 0106).
Breaks: silently
Check: scripts/drift-check.js — ship, verify-ship, and wrap-up name no `--unattended` branch and carry `disable-model-invocation: true`; partial: nothing pins that an unattended run ends at `submit-pr`
Paths: plugin/skills/submit-pr/**, plugin/skills/ship/**, plugin/skills/verify-ship/**, plugin/skills/wrap-up/**

### INV-0094

Class: process
Concepts: 3-strike fix loop, Stage
Statement: A Minor finding never holds a scope's stage and never blocks a run. The scope review and the full tier's per-slice review fix every listed finding, Minors included, until the review lists none or the 3-cycle cap is reached. At the cap, a remainder of only Minor findings advances the stage, or merges the slice, and leaves no record outside the review's report. A Minor finding whose remedy adds a capability the Definition of Done never named is a deferred finding, like one of any other severity (ADR 0035).
Breaks: silently
Check: scripts/drift-check.js — the Minor-loop rows on the review fix loop and the full-tier per-slice loop, and the deferral-boundary row on the full-tier loop
Paths: plugin/skills/review/**, plugin/references/implement-full.md, plugin/agents/final-reviewer.md, plugin/agents/slice-reviewer.md

### INV-0095

Class: process
Concepts: Guard-rail remedy, Deferred finding, Plan-coverage gap
Statement: A guard-rail remedy stays in the fix loop and never becomes a deferred finding. A plan-coverage gap is fixed by the guard-rail remedy that proves the behaviour, and never by a new line in `dod.md`.
Breaks: silently
Check: scripts/drift-check.js — the guard-rail carve-out row beside the fix-loop boundary in review's prose, and the guard-rail carve-out row beside the deferral boundary in `implement-full.md` step 3
Paths: plugin/skills/review/**, plugin/references/implement-full.md, plugin/agents/final-reviewer.md

### INV-0096

Class: process
Concepts: Derived criteria, Definition of Done (DoD), Intent
Statement: `/superdev:plan` slices no plan while a criterion derived from its intent is neither in the Definition of Done nor named as a non-goal. Every plan runs the derive pass: a new feature, a single-slice plan, and an append.
Breaks: silently
Check: scripts/drift-check.js — the derive-pass row on plan's prose and final-reviewer's derive mode
Paths: plugin/skills/plan/**, plugin/agents/final-reviewer.md

### INV-0098

Class: process
Concepts: Deploy posture, Deploy target, Scope anchor
Statement: Only `/superdev:ship` runs a deploy target's command. It runs one only under the repository's `auto` deploy posture, only after the pull request has merged, and only in a tree checked out at the merge commit. No other command and no unattended run deploys (ADR 0101).
Breaks: silently
Check: scripts/drift-check.js — ship's deploy runs only under `auto`, after the merge, at the merge commit; no other skill or agent names a deploy target's command as something it runs
Paths: plugin/skills/ship/**, plugin/references/deployment.md

### INV-0099

Class: process
Concepts: Deploy posture, Deploy target, Scope anchor, Definition of Done (DoD), Stage
Statement: After the merge, only `/superdev:wrap-up` closes a scope anchor. It closes one only when the pull request has merged, every Definition-of-Done criterion is ticked or `accepted:`, and every deploy target listed on the anchor is recorded `deployed`. A failed close changes neither the stage nor the run's scaffolding. A failed `auto` target keeps the anchor open, and a later ship resumes at the first target not yet deployed (ADR 0101, ADR 0106).
Breaks: silently
Check: scripts/drift-check.js — ship stops on a failed `auto` target, and `wrap-up-gate` guards the close; `tests/scope.test.js` for the ledger's deploy record
Paths: plugin/skills/ship/**, plugin/scripts/scope.js, plugin/skills/wrap-up/**

### INV-0101

Class: architecture
Concepts: Run profile
Statement: The run profile reads Claude Code's transcript directory and writes nothing to it. An entry lacking a field the profile reads is reported as unrecognized, never counted as zero, and a transcript with no entry the profile recognizes produces a report that says so instead of a table of zeros (ADR 0103).
Breaks: silently
Check: tests/profile.test.js — the transcript fixture directory is byte-identical after a run; a fixture with a field removed reports it unrecognized
Paths: plugin/scripts/profile.js, tests/profile.test.js

### INV-0102

Class: architecture
Concepts: Human wait, Idle, Run profile
Statement: Human wait and idle time are each never counted as machine time. Every view of the run profile reports each in its own column, and no total the profile prints adds either to tool, hook, subagent, or model time.
Breaks: silently
Check: tests/profile.test.js — a fixture holding an AskUserQuestion call, a between-turn gap ending in a typed prompt, and a turn end ending in a peer wake with nothing running; every machine total excludes all three
Paths: plugin/scripts/profile.js, tests/profile.test.js

### INV-0103

Class: architecture
Concepts: Run profile, Phase segment
Statement: A tool call with no matching result carries no duration. The run profile reports it as unfinished, names it, and adds nothing for it to any total. A call whose session was interrupted, killed, or ended mid-call decided nothing about how long the call takes.
Breaks: silently
Check: tests/profile.test.js — a fixture with a tool_use and no tool_result reports one unfinished call and leaves every total unchanged
Paths: plugin/scripts/profile.js, tests/profile.test.js

### INV-0104

Class: process
Concepts: Deploy posture, Deploy target
Statement: Under the `auto` deploy posture, `/superdev:ship` runs a deploy target's command only from a `docs/agents/deployment.md` whose every change the operator was shown. A change the merge commit carries against the tested head, and on a merge ship did not gate itself the pull request's own change, is printed and confirmed before the first target runs (ADR 0104).
Breaks: silently
Check: scripts/drift-check.js — ship's post-merge deploy step compares the merge commit's `deployment.md` with the tested head's and asks once before any `auto` target runs
Paths: plugin/skills/ship/**

### INV-0105

Class: process
Concepts: Affected form, Whole-repo command
Statement: An affected form never selects fewer projects than the change can break. It selects through the repository's dependency-graph tool, dependents included, so a change the graph cannot attribute to one project selects every project, and selection by path prefix does not qualify. It exits green when the change reaches no project. `/superdev:setup` writes one only after it has exited green on the base branch's own tip and has selected a project on a committed change in a throwaway worktree and, run on that change, has executed at least one task or test, and only together with a whole-repo command.
Breaks: silently
Check: scripts/drift-check.js — the affected-form clauses pinned together in plugin/references/test-selection.md and plugin/skills/setup/SKILL.md; partial: whether a given tool's graph is complete is that tool's claim, not superdev's
Paths: plugin/references/test-selection.md, plugin/skills/setup/**

### INV-0106

Class: process
Concepts: Run root, Stage
Statement: `hooks/scope-prune.js` reaps a run root only when its ledger stage reads `closed`. A run root at any other stage, `shipped` included, is never reaped (ADR 0106).
Breaks: silently
Check: tests/scope-prune.test.js
Paths: plugin/hooks/scope-prune.js

### INV-0107

Class: process
Concepts: Seed, Seed gap, Seed deviation
Statement: `/superdev:setup` writes a seed section or seed rule into a configured document only on the operator's explicit choice for that seed gap. A gap the operator records as a seed deviation is never applied, and a recorded seed deviation is never reported as a gap (ADR 0107).
Breaks: silently
Check: scripts/drift-check.js — setup's re-run offers each seed gap with apply, record, and leave choices and writes none unasked; check lists a recorded deviation as recorded
Paths: plugin/skills/setup/SKILL.md

### INV-0109

Class: architecture
Concepts: Staged page, Knowledge base
Statement: `/superdev:publish-kb` converts a staged page's body only for a backend whose configuration carries `- **Body format:** storage`. Every other backend receives the staged body byte-identical (ADR 0109).
Breaks: silently
Check: tests/publish-kb.test.js — a markdown backend's `create` and `update` receive the staged body unchanged
Paths: plugin/scripts/publish-kb.js

### INV-0110

Class: process
Concepts: Intent
Statement: `/superdev:plan` never offers or seeds from a `.superdev/brainstorm/*.md` intent whose frontmatter is `status: draft`. Only that frontmatter marks a draft: a file with no frontmatter, or with any other status, is ready (ADR 0112).
Breaks: silently
Check: scripts/drift-check.js — plan's draft skip, refusal, and only-draft marker clause and brainstorm's draft write, keep-current clause, ready step, and start offer are pinned together
Paths: plugin/skills/plan/SKILL.md, plugin/skills/brainstorm/SKILL.md

### INV-0111

Class: process
Concepts: Next block, Response shape
Statement: Every message that `/superdev:brainstorm`, `/superdev:plan`, `/superdev:implement`, `/superdev:review`, `/superdev:document`, `/superdev:submit-pr`, `/superdev:ship`, `/superdev:verify-ship`, or `/superdev:wrap-up` ends on closes with the Next block that `references/response-shapes.md` defines, and nothing follows it. This holds for a refusal, a blocked stop, an ad-hoc run, an unattended run, and a command with no successor. A command in the chained posture prints none. Each of those skills cites the reference and restates none of the block's shape (ADR 0113).
Breaks: silently
Check: scripts/drift-check.js — each covered skill's citation of the Next block rule; partial: nothing checks the message an agent prints
Paths: plugin/references/response-shapes.md, plugin/references/run-handoff.md, plugin/skills/brainstorm/SKILL.md, plugin/skills/plan/SKILL.md, plugin/skills/implement/SKILL.md, plugin/skills/review/SKILL.md, plugin/skills/document/SKILL.md, plugin/skills/submit-pr/SKILL.md, plugin/skills/ship/SKILL.md, plugin/skills/verify-ship/SKILL.md, plugin/skills/wrap-up/SKILL.md

### INV-0112

Class: process
Concepts: Response shape
Statement: A report that `references/response-shapes.md` gives a shape is made of an opening line, section headings, and one-line bullets, closes on the Next block, and carries no paragraph of prose (ADR 0113).
Breaks: silently
Check: scripts/drift-check.js — brainstorm's citation of its report shape; partial: nothing checks the message an agent prints
Paths: plugin/references/response-shapes.md, plugin/skills/brainstorm/SKILL.md

### INV-0113

Class: process
Concepts: Blind pass, Progress log
Statement: Once `slice-reviewer` opens a slice's progress log, it never withdraws a finding and never downgrades a finding's severity. Reading the log can only add a finding or raise one, so the implementer's account of its work can only make a slice review stricter (ADR 0114).
Breaks: silently
Check: scripts/drift-check.js — the one-way rows on `plugin/agents/slice-reviewer.md` and on the slice-reviewer dispatch in `plugin/references/implement-full.md`
Paths: plugin/agents/slice-reviewer.md, plugin/references/implement-full.md

### INV-0114

Class: process
Concepts: Blind pass, Progress log, Dispatch prose
Statement: No slice-reviewer dispatch carries the implementer's report text. The report reaches `slice-reviewer` only through the progress log, whose path the dispatch hands over, and the reviewer opens that log only after its blind pass has settled a verdict (ADR 0114).
Breaks: silently
Check: scripts/drift-check.js — the blind-pass rows on `plugin/agents/slice-reviewer.md` and on the slice-reviewer dispatch in `plugin/references/implement-full.md`
Paths: plugin/agents/slice-reviewer.md, plugin/references/implement-full.md
