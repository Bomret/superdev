superdev-render-overlay
source: skills/plan/SKILL.md
body-lines: 508
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-plan
description: "Plan a feature for superdev — a relentless interview that pins intent and the Definition of Done, then decomposes the work into independently-green vertical slices in the configured slice store. Run before /superdev-implement."
---
@5
to the slice store, ready for `/superdev-implement`. Interactive — this needs the user's judgment.
@9
Read `docs/agents/issue-tracker.md` (the slice store). Missing → run **`/superdev-setup`** first, then
@12
**Focused-command configuration.** As in `/superdev-implement`'s **Config + input**:
@14
command was never recorded (ADR 0085, INV-0007) → run **`/superdev-setup`** first, then continue; a
@18
**Toolchain freshness (advisory).** As in `/superdev-implement`'s **Config + input**: an absent
@19
`docs/agents/toolchain.md` alongside build/package manifests gets a non-blocking **`/superdev-setup`**
@33
- The scope's run root — `node "<plugin-root>/scripts/scope.js" root <slug>`'s printed path
@35
  `node "<plugin-root>/scripts/scope.js" get stage --root <run-root>`. A stage from
@55
own: a reaped run root leaves no ledger to read, and `/superdev/ship`'s anchor close is best-effort, so a
@76
**the message that invoked this skill is the intent, when one is given.** It states what the user wants, never the design, so
@82
git-ignored scratch intents `/superdev-brainstorm` or `/superdev-review-tests` may have left. Exactly
@103
**Read `<plugin-root>/references/cross-exam.md` and run the interview by it.** This is the **main
@122
verify it. `<plugin-root>/references/plan-contract.md`'s Definition-of-Done rules own the full
@134
criterion would reach `/superdev/ship` unticked. Name the pre-merge deploy it would force, and offer to
@142
`<plugin-root>/references/plan-contract.md`'s *The reachability criterion* owns the full rule: read
@157
Intent still vague — no clear problem, no checkable success criteria? Suggest `/superdev-brainstorm`
@160
**Read `<plugin-root>/references/doc-verification.md` and apply it whenever the interview leans
@167
(`<plugin-root>/references/plan-contract.md` → *Feature label*). The type is what the feature
@174
`<plugin-root>/references/diagnosis.md` and hold the plan to it: the **red-capable command** —
@184
`<plugin-root>/references/scope-mode.md`'s `## Observations` capture rules, with the provenance
@196
**Read `<plugin-root>/references/domain-modeling.md` and apply it as you interview.** Read any
@208
another session stops the run now, per `<plugin-root>/references/scope-mode.md`'s `## The run
@214
(`<run-root>` is `node "<plugin-root>/scripts/scope.js" root <slug>`'s printed path, ADR 0080),
@215
following the one cut rule `<plugin-root>/references/scope-mode.md`'s `## Cutting the scope
@216
branch` states for `/superdev-plan` (ADR 0079). Write that capture, and every capture from then on —
@227
`CONTEXT.md` (`<plugin-root>/references/domain-modeling.md`'s numbering rule) — a slot this
@230
(`<plugin-root>/references/scope-mode.md`'s `## A live scope run` → *Run-root enumeration*) whose
@238
(`<plugin-root>/references/scope-mode.md`'s `## The ledger`), not a corrupt one — `/superdev-status`
@240
after this point still leaves a `ledger.md` beside the branch and the scopetree, so `/superdev-status` and
@241
`/superdev-backlog` see it. An append onto a `planned` ledger finds one already there from the earlier
@285
  the body below. `/superdev-publish-kb` sends no non-`.md` file; `/superdev-status` prints it as a stray
@287
  `/superdev-publish-kb` sends it when the feature reaches its readers. A **local** `docs/kb/` backend
@298
  `/superdev-publish-kb` merges the
@301
  before `/superdev-publish-kb` ever sees either — append `-2`, `-3`, … to the later ones'
@307
and stale removal happen in `/superdev-document` (ADR 0013).
@331
`<plugin-root>/references/design-sketch.md` and follow it through to the operator's approval of
@335
Decompose into **vertical slices** (`<plugin-root>/references/plan-contract.md` owns the rules
@345
  (`<plugin-root>/references/plan-contract.md` → *Wide refactors*): expand, migrate in batches,
@363
  `/superdev-document` reconciles README, `AGENTS.md`, and the KB after the scope lands. Slice out `docs`
@430
*Scope anchor*, ADR 0040). It is what lets `/superdev/afk` reach the two in the right order. Ask nothing
@442
**Tell the user the expected execution tier** — informational only; `/superdev-plan` persists it nowhere.
@443
`/superdev-implement` derives it fresh from the final slice count — **≤3 slices → `lite`** (the
@446
every slice is on the scope branch — to `/superdev-review`, or straight to `/superdev-document` when
@453
`<plugin-root>/references/scope-mode.md`'s `## Cutting the scope branch` (ADR 0079) — the same
@469
`<plugin-root>/references/run-init.md`'s `## Run init — definition of done + ledger` section
@472
`planned` is what hands the scope branch to `/superdev-implement` as ready): carry the anchor this plan
@487
  Say that `/superdev-implement` asks for confirmation until then.
@493
`/superdev/afk` slices nobody released. **Release now** applies it as it always does. On a first plan
@504
the feature label resolved** — `/superdev-implement <feature-label>`, carrying the real label this plan
