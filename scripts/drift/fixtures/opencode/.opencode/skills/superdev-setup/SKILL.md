superdev-render-overlay
source: skills/setup/SKILL.md
body-lines: 503
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-setup
description: "Configure this repo for superdev: slice store, code host, documentation convention, knowledge base, toolchain, and test command. Run once; /superdev-plan and /superdev-implement auto-invoke it if config is missing."
---
@24
write.** Seed templates live in `<plugin-root>/references/`.
@28
the message that invoked this skill carrying the literal word `check` runs a **read-only drift check** instead of the
@30
entirely. Any other the message that invoked this skill, including none, runs the full interview unchanged: the operator names
@37
- **Absent.** The file does not exist. A repo that never ran `/superdev-setup` reports all of them this
@53
  report the remote with any userinfo stripped, never verbatim: a caller (`/superdev-sweep`'s config leg
@92
proposed default inferred from the remote — `<plugin-root>/references/cross-exam.md`'s
@114
> **Trust boundary.** `/superdev-implement` loads slice specifications from this store and an implementer
@117
> restricted to trusted authors, and only run `/superdev-implement` on slices the run owner authored or
@126
`/superdev-implement` walks each issue along it. If the tracker lacks a state (no separate `in-review` or
@137
- It **survives the lifecycle moves** `/superdev-implement` makes. The status map's own `ready` label is
@141
Record the signal plus the calls that **apply** it (what `/superdev-plan` fires on a release) and **read**
@142
it (what `/superdev-implement` and `/superdev/afk` check). A team that agrees plans elsewhere and wants
@143
every plan live on creation is a valid answer too — write that, and `/superdev-plan` stops asking.
@145
Also capture the **assignee** for any issue backend — the account every issue `/superdev-plan` creates is
@201
Then ask which **documentation sits outside the default tree**. `/superdev-document audit` reads the
@221
  `/superdev-publish-kb` is the only caller of this backend and that `/superdev-plan`/`/superdev-document`
@238
`/superdev-plan` and `/superdev-document` fill and extend it, not reinvent it.
@258
so no conversion is needed. The probe reaches the same host `/superdev-publish-kb` does, so an unbounded
@283
`/superdev-publish-kb` refuses that action on such a backend regardless (ADR 0027). A **local
@494
Tell the user setup is complete and that `/superdev-plan` and `/superdev-implement` now read these files.
@500
If §1 found **no `AGENTS.md` hierarchy**, point the user at **`/superdev-document`** — its bootstrap mode
@501
seeds the initial hierarchy + glossary from the existing code, so per-feature `/superdev-plan` doesn't
