superdev-render-overlay
source: skills/plan/SKILL.md
body-lines: 437
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
**Toolchain freshness (advisory).** As in `/superdev-implement`'s **Config + input**: an absent
@13
`docs/agents/toolchain.md` alongside build/package manifests gets a non-blocking **`/superdev-setup`**
@27
- The scope's run root — `node "<plugin-root>/scripts/scope.js" root <slug>`'s printed path
@29
  `node "<plugin-root>/scripts/scope.js" get stage --root <run-root>`. A stage from
@49
own: a reaped run root leaves no ledger to read, and `/superdev-ship`'s anchor close is best-effort, so a
@70
**the message that invoked this skill is the intent, when one is given.** It states what the user wants, never the design, so
@76
git-ignored scratch intents `/superdev-brainstorm` or `/superdev-review-tests` may have left. Exactly
@97
**Read `<plugin-root>/references/cross-exam.md` and run the interview by it.** This is the **main
@118
`<plugin-root>/references/plan-contract.md`'s *The reachability criterion* owns the full rule: read
@133
Intent still vague — no clear problem, no checkable success criteria? Suggest `/superdev-brainstorm`
@136
**Read `<plugin-root>/references/doc-verification.md` and apply it whenever the interview leans
@143
(`<plugin-root>/references/plan-contract.md` → *Feature label*). The type is what the feature
@150
`<plugin-root>/references/diagnosis.md` and hold the plan to it: the **red-capable command** —
@157
**Read `<plugin-root>/references/domain-modeling.md` and apply it as you interview.** Read any
@169
another session stops the run now, per `<plugin-root>/references/scope-mode.md`'s `## The run
@175
(`<run-root>` is `node "<plugin-root>/scripts/scope.js" root <slug>`'s printed path, ADR 0080),
@176
following the one cut rule `<plugin-root>/references/scope-mode.md`'s `## Cutting the scope
@177
branch` states for `/superdev-plan` (ADR 0079). Write that capture, and every capture from then on —
@189
(`<plugin-root>/references/scope-mode.md`'s `## The ledger`), not a corrupt one — `/superdev-status`
@191
after this point still leaves a `ledger.md` beside the branch and the scopetree, so `/superdev-status` and
@192
`/superdev-backlog` see it. An append onto a `planned` ledger finds one already there from the earlier
@233
  the body below. `/superdev-publish-kb` sends no non-`.md` file; `/superdev-status` prints it as a stray
@235
  `/superdev-publish-kb` sends it when the feature reaches its readers. A **local** `docs/kb/` backend
@246
  `/superdev-publish-kb` merges the
@249
  before `/superdev-publish-kb` ever sees either — append `-2`, `-3`, … to the later ones'
@255
and stale removal happen in `/superdev-document` (ADR 0013).
@274
`<plugin-root>/references/design-sketch.md` and follow it through to the operator's approval of
@278
Decompose into **vertical slices** (`<plugin-root>/references/plan-contract.md` owns the rules
@288
  (`<plugin-root>/references/plan-contract.md` → *Wide refactors*): expand, migrate in batches,
@301
  `/superdev-document` reconciles README, `AGENTS.md`, and the KB after the scope lands. Slice out `docs`
@364
*Scope anchor*, ADR 0040). It is what lets `/superdev/afk` reach the two in the right order. Ask nothing
@376
**Tell the user the expected execution tier** — informational only; `/superdev-plan` persists it nowhere.
@377
`/superdev-implement` derives it fresh from the final slice count — **≤3 slices → `lite`** (the
@380
every slice is on the scope branch — to `/superdev-review`, or straight to `/superdev-document` when
@387
`<plugin-root>/references/scope-mode.md`'s `## Cutting the scope branch` (ADR 0079) — the same
@401
`<plugin-root>/references/run-init.md`'s `## Run init — definition of done + ledger` section
@404
`planned` is what hands the scope branch to `/superdev-implement` as ready): carry the anchor this plan
@419
  Say that `/superdev-implement` asks for confirmation until then.
@425
`/superdev/afk` slices nobody released. **Release now** applies it as it always does. On a first plan
@433
the feature label resolved** — `/superdev-implement <feature-label>`, carrying the real label this plan
