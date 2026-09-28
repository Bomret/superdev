superdev-render-overlay
source: skills/implement/SKILL.md
body-lines: 147
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-implement
description: "Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG, with an execution tier sized to the slice count, then hand off to the next command in the chain. Use when a plan exists in the slice store; run /superdev-plan first if not."
---
@15
review `/superdev-review` runs next.
@17
`full` dispatches `implementer`, `slice-reviewer`, and `simplicity-reviewer`
@29
  `<plugin-root>/references/scope-mode.md`'s `## Observations` section and follow it: a defect a
@38
  `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section: work inline, say so,
@57
  **`/superdev-setup`**, then continue. **`docs/agents/verification.md` carrying one fenced block** is
@59
  **`/superdev-setup`**, then continue; a repository with no `docs/agents/verification.md` at all needs no
@63
  `Cargo.toml`, `go.mod`, …) → suggest **`/superdev-setup`**; non-blocking, continue.
@64
- **Resolve the message that invoked this skill to one feature.** Take `--unattended` out first, wherever it sits. A **feature
@66
  carries a **change type** and a slug (`<plugin-root>/references/scope-mode.md`'s
@69
  `<plugin-root>/references/scope-mode.md`'s scope-slug rule, both segments** — the whole label
@76
    **`/superdev-plan`**, stop. **`--unattended` → block**.
@79
    `<plugin-root>/references/scope-mode.md`'s `## Resolving an empty argument` cascade,
@81
    **`/superdev-plan`** first, rather than the cascade's own report-and-stop.
@83
  slices → run **`/superdev-plan`** first. **One slice, no epic** → the epic is optional
@93
  releasing the plan in the tracker stays the human's own act. **`--unattended` → block** — `/superdev/afk`
@95
- **`--unattended` present** → read `<plugin-root>/references/scope-mode.md`'s **Unattended**
@97
  command (`/superdev-setup`, `/superdev-plan`). The "slice store or code host missing" and "no slices"
@104
  configured or persisted (`/superdev-plan` derives it the same way). `Read` your playbook and follow it
@106
  - `full` → `<plugin-root>/references/implement-full.md`
@107
  - `lite` → `<plugin-root>/references/implement-lite.md`
@108
  Each playbook ends by reading `<plugin-root>/references/run-handoff.md`.
@120
the run starts, and **`/superdev/ship` closes it**, not you. **On a single-slice plan the anchor rule
@126
`full` dispatches every row; `<plugin-root>/references/run-handoff.md`'s run handoff dispatches the
