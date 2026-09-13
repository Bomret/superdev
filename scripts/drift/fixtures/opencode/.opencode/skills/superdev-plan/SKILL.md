superdev-render-overlay
source: skills/plan/SKILL.md
body-lines: 349
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
  Read both with `node "<plugin-root>/scripts/scope.js" get stage --root <run-root>` and `get
@30
  contained in the base, per `<plugin-root>/references/scope-mode.md`'s `## Containment` section
@51
**the message that invoked this skill is the intent, when one is given.** It states what the user wants, never the design, so
@57
git-ignored scratch intents `/superdev-brainstorm` may have left. Exactly one → offer it ("Found intent
@77
**Read `<plugin-root>/references/cross-exam.md` and run the interview by it.** This is the **main
@104
Intent still vague — no clear problem, no checkable success criteria? Suggest `/superdev-brainstorm`
@107
**Read `<plugin-root>/references/doc-verification.md` and apply it whenever the interview leans
@114
(`<plugin-root>/references/plan-contract.md` → *Feature label*). The type is what the feature
@121
`<plugin-root>/references/diagnosis.md` and hold the plan to it: the **red-capable command** —
@128
**Read `<plugin-root>/references/domain-modeling.md` and apply it as you interview.** Read any
@168
  the body below. `/superdev-publish-kb` sends no non-`.md` file; `/superdev-status` prints it as a stray
@170
  `/superdev-publish-kb` sends it when the feature reaches its readers. A **local** `docs/kb/` backend
@181
  `/superdev-publish-kb` merges the
@184
  before `/superdev-publish-kb` ever sees either — append `-2`, `-3`, … to the later ones'
@190
and stale removal happen in `/superdev-document` (ADR 0013).
@203
`<plugin-root>/references/design-sketch.md` and follow it through to the operator's approval of
@207
Decompose into **vertical slices** (`<plugin-root>/references/plan-contract.md` owns the rules
@217
  (`<plugin-root>/references/plan-contract.md` → *Wide refactors*): expand, migrate in batches,
@227
  `/superdev-document` reconciles README, `AGENTS.md`, and the KB after the scope lands. Slice out `docs`
@290
*Scope anchor*, ADR 0040). It is what lets `/superdev/afk` reach the two in the right order. Ask nothing
@302
**Tell the user the expected execution tier** — informational only; `/superdev-plan` persists it nowhere.
@303
`/superdev-implement` derives it fresh from the final slice count — **≤3 slices → `lite`** (the
@306
every slice is on the scope branch — to `/superdev-review`, or straight to `/superdev-document` when
@314
only the commit is outstanding. `/superdev-implement` runs from a fresh worktree checkout of that branch,
@317
`node "<plugin-root>/scripts/scope.js" base-lock acquire`, from the invoking checkout — **before
@319
anything turns out to be dirty, because a second `/superdev-plan` run, or an `/superdev-implement` run
@325
`docs/agents/code-management.md`): `/superdev-ship`'s PR is opened against the remote base, and an
@327
acquired** once the push completes — `node "<plugin-root>/scripts/scope.js" base-lock release` —
@338
  Say that `/superdev-implement` asks for confirmation until then.
@345
the feature label resolved** — `/superdev-implement <feature-label>`, carrying the real label this plan
