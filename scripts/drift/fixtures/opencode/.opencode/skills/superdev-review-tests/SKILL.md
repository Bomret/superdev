superdev-render-overlay
source: skills/review-tests/SKILL.md
body-lines: 142
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-review-tests
description: "Audit what a test suite costs — sweep the whole test tree, measure it, rank the findings, and hand the survivors to /superdev-plan. Read-only."
---
@6
and writes the survivors as an intent for `/superdev-plan` (ADR 0066).
@9
ad-hoc `/superdev-review` does. Its writes are the intent, under the git-ignored `.superdev/brainstorm/`,
@13
`/superdev/afk` never drives it. You run it when a suite has started to feel expensive.
@24
- **Either file absent** (the repo never ran `/superdev-setup`) → suggest **`/superdev-setup`**,
@46
  command: report it, pointing at `<plugin-root>/references/test-selection.md`'s rule that a
@53
`/superdev/afk` never drives it, so an operator is always there to answer. Once you proceed, give the
@74
Dispatch `test-auditor` **once, over the whole swept set**, with the duration table attached
@83
**A denied dispatch is a degraded pass.** Follow `<plugin-root>/references/scope-mode.md`'s
@110
- **Findings past that round's capacity** reach the intent labelled `unconfirmed`. `/superdev-plan`'s
@116
the git-ignored scratch location `/superdev-brainstorm` already uses (append `.superdev/` to `.gitignore`
@118
`<plugin-root>/references/scope-mode.md`'s `## The scope slug`; a whole-tree sweep (no path
@123
Then print the copy-pasteable handoff, the same bare form `/superdev-brainstorm` prints for the same
@124
`.superdev/brainstorm/` write target: `/superdev-plan` takes no path argument, so the intent this run
@128
/superdev-plan
@136
- **Applying a finding.** This command reports. `/superdev-plan` is where one becomes work.
