superdev-render-overlay
source: skills/implement/SKILL.md
body-lines: 141
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-implement
description: "Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG, with an execution tier sized to the slice count, then hand off to the next command in the chain. Use when a plan exists in the slice store; run /superdev-plan first if not."
---
@15
review `/superdev-review` runs next.
@17
`full` dispatches `implementer`, `slice-reviewer`, and `simplicity-reviewer`
@33
  `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section: work inline, say so,
@43
  no tests — the loop's runs plus the scope's full-suite run at `/superdev-review` are the net
@51
  **`/superdev-setup`**, then continue. **`docs/agents/verification.md` carrying one fenced block** is
@53
  **`/superdev-setup`**, then continue; a repository with no `docs/agents/verification.md` at all needs no
@57
  `Cargo.toml`, `go.mod`, …) → suggest **`/superdev-setup`**; non-blocking, continue.
@58
- **Resolve the message that invoked this skill to one feature.** Take `--unattended` out first, wherever it sits. A **feature
@60
  carries a **change type** and a slug (`<plugin-root>/references/scope-mode.md`'s
@63
  `<plugin-root>/references/scope-mode.md`'s scope-slug rule, both segments** — the whole label
@70
    **`/superdev-plan`**, stop. **`--unattended` → block**.
@73
    `<plugin-root>/references/scope-mode.md`'s `## Resolving an empty argument` cascade,
@75
    **`/superdev-plan`** first, rather than the cascade's own report-and-stop.
@77
  slices → run **`/superdev-plan`** first. **One slice, no epic** → the epic is optional
@87
  releasing the plan in the tracker stays the human's own act. **`--unattended` → block** — `/superdev/afk`
@89
- **`--unattended` present** → read `<plugin-root>/references/scope-mode.md`'s **Unattended**
@91
  command (`/superdev-setup`, `/superdev-plan`). The "slice store or code host missing" and "no slices"
@98
  configured or persisted (`/superdev-plan` derives it the same way). `Read` your playbook and follow it
@100
  - `full` → `<plugin-root>/references/implement-full.md`
@101
  - `lite` → `<plugin-root>/references/implement-lite.md`
@102
  Each playbook ends by reading `<plugin-root>/references/run-handoff.md`.
@114
the run starts, and **`/superdev-ship` closes it**, not you. **On a single-slice plan the anchor rule
@120
`full` dispatches every row; `<plugin-root>/references/run-handoff.md`'s run handoff dispatches the
