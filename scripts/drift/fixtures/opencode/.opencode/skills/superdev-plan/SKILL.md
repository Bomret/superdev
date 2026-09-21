superdev-render-overlay
source: skills/plan/SKILL.md
body-lines: 418
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
@28
- The scope's run root — `node "<plugin-root>/scripts/scope.js" root <slug>`'s printed path
@31
  `node "<plugin-root>/scripts/scope.js" get stage --root <run-root>` and the branch with `get
@33
  `<plugin-root>/references/scope-mode.md`'s `## Containment` section which owns the test, or gone
@58
**the message that invoked this skill is the intent, when one is given.** It states what the user wants, never the design, so
@64
git-ignored scratch intents `/superdev-brainstorm` or `/superdev-review-tests` may have left. Exactly
@85
**Read `<plugin-root>/references/cross-exam.md` and run the interview by it.** This is the **main
@106
`<plugin-root>/references/plan-contract.md`'s *The reachability criterion* owns the full rule: read
@121
Intent still vague — no clear problem, no checkable success criteria? Suggest `/superdev-brainstorm`
@124
**Read `<plugin-root>/references/doc-verification.md` and apply it whenever the interview leans
@131
(`<plugin-root>/references/plan-contract.md` → *Feature label*). The type is what the feature
@138
`<plugin-root>/references/diagnosis.md` and hold the plan to it: the **red-capable command** —
@145
**Read `<plugin-root>/references/domain-modeling.md` and apply it as you interview.** Read any
@157
another session stops the run now, per `<plugin-root>/references/scope-mode.md`'s `## The run
@163
(`<run-root>` is `node "<plugin-root>/scripts/scope.js" root <slug>`'s printed path, ADR 0080),
@164
following the one cut rule `<plugin-root>/references/scope-mode.md`'s `## Cutting the scope
@165
branch` states for `/superdev-plan` (ADR 0079). Write that capture, and every capture from then on —
@177
(`<plugin-root>/references/scope-mode.md`'s `## The ledger`), not a corrupt one — `/superdev-status`
@179
after this point still leaves a `ledger.md` beside the branch and the scopetree, so `/superdev-status` and
@180
`/superdev-backlog` see it. An append onto a `planned` ledger finds one already there from the earlier
@221
  the body below. `/superdev-publish-kb` sends no non-`.md` file; `/superdev-status` prints it as a stray
@223
  `/superdev-publish-kb` sends it when the feature reaches its readers. A **local** `docs/kb/` backend
@234
  `/superdev-publish-kb` merges the
@237
  before `/superdev-publish-kb` ever sees either — append `-2`, `-3`, … to the later ones'
@243
and stale removal happen in `/superdev-document` (ADR 0013).
@262
`<plugin-root>/references/design-sketch.md` and follow it through to the operator's approval of
@266
Decompose into **vertical slices** (`<plugin-root>/references/plan-contract.md` owns the rules
@276
  (`<plugin-root>/references/plan-contract.md` → *Wide refactors*): expand, migrate in batches,
@289
  `/superdev-document` reconciles README, `AGENTS.md`, and the KB after the scope lands. Slice out `docs`
@352
*Scope anchor*, ADR 0040). It is what lets `/superdev/afk` reach the two in the right order. Ask nothing
@364
**Tell the user the expected execution tier** — informational only; `/superdev-plan` persists it nowhere.
@365
`/superdev-implement` derives it fresh from the final slice count — **≤3 slices → `lite`** (the
@368
every slice is on the scope branch — to `/superdev-review`, or straight to `/superdev-document` when
@375
`<plugin-root>/references/scope-mode.md`'s `## Cutting the scope branch` (ADR 0079) — the same
@389
`<plugin-root>/references/run-init.md`'s `## Run init — definition of done + ledger` section
@392
`planned` is what hands the scope branch to `/superdev-implement` as ready): carry the anchor this plan
@407
  Say that `/superdev-implement` asks for confirmation until then.
@414
the feature label resolved** — `/superdev-implement <feature-label>`, carrying the real label this plan
