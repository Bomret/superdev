superdev-render-overlay
source: skills/review-tests/SKILL.md
body-lines: 168
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
@20
**`--chained`, if present, comes out of the message that invoked this skill first** — never part of the path argument. It
@21
signals that `/superdev-sweep` dispatched this run as its test leg, in the **chained posture** (CONTEXT.md,
@29
- **Either file absent** (the repo never ran `/superdev-setup`) → suggest **`/superdev-setup`**,
@52
  command: report it, pointing at `<plugin-root>/references/test-selection.md`'s rule that a
@60
`/superdev/afk` never drives it, so an operator is always there to answer. Once you proceed, give the
@81
Dispatch `test-auditor` **once, over the whole swept set**, with the duration table attached
@90
**A denied dispatch is a degraded pass.** Follow `<plugin-root>/references/scope-mode.md`'s
@99
`<plugin-root>/references/scope-mode.md`'s `## Observations` section and follow it: a defect the
@114
**`--chained` present** — this run is `/superdev-sweep`'s test leg, in the **chained posture** (CONTEXT.md,
@130
- **Findings past that round's capacity** reach the intent labelled `unconfirmed`. `/superdev-plan`'s
@136
the caller instead: this run's report **is** the return, and `/superdev-plan` sits past `/superdev-sweep`'s
@141
the git-ignored scratch location `/superdev-brainstorm` already uses (append `.superdev/` to `.gitignore`
@143
`<plugin-root>/references/scope-mode.md`'s `## The scope slug`; a whole-tree sweep (no path
@148
Then print the copy-pasteable handoff, the same bare form `/superdev-brainstorm` prints for the same
@149
`.superdev/brainstorm/` write target: `/superdev-plan` takes no path argument, so the intent this run
@153
/superdev-plan
@162
- **Applying a finding.** This command reports. `/superdev-plan` is where one becomes work.
