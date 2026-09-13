superdev-render-overlay
source: skills/implement/SKILL.md
body-lines: 129
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-implement
description: "Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG, with an execution tier sized to the slice count, then hand off to the next command in the chain. Use when a plan exists in the slice store; run /superdev-plan first if not."
---
@15
review `/superdev-review` runs next.
@17
`full` dispatches `implementer`, `slice-reviewer`, and `simplicity-reviewer`
@32
  `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section: work inline, say so,
@49
  **`/superdev-setup`**, then continue. **Advisory:** `docs/agents/toolchain.md` absent while the repo has
@51
  `Cargo.toml`, `go.mod`, …) → suggest **`/superdev-setup`**; non-blocking, continue.
@52
- **Resolve the message that invoked this skill to one feature.** Take `--unattended` out first, wherever it sits. A **feature
@54
  carries a **change type** and a slug (`<plugin-root>/references/scope-mode.md`'s
@57
  `<plugin-root>/references/scope-mode.md`'s scope-slug rule, both segments** — the whole label
@64
    **`/superdev-plan`**, stop. **`--unattended` → block**.
@66
    **`--unattended` → block**. None → run **`/superdev-plan`** first.
@68
  slices → run **`/superdev-plan`** first. **One slice, no epic** → the epic is optional
@75
  releasing the plan in the tracker stays the human's own act. **`--unattended` → block** — `/superdev/afk`
@77
- **`--unattended` present** → read `<plugin-root>/references/scope-mode.md`'s **Unattended**
@79
  command (`/superdev-setup`, `/superdev-plan`). The "slice store or code host missing" and "no slices"
@86
  configured or persisted (`/superdev-plan` derives it the same way). `Read` your playbook and follow it
@88
  - `full` → `<plugin-root>/references/implement-full.md`
@89
  - `lite` → `<plugin-root>/references/implement-lite.md`
@90
  Each playbook ends by reading `<plugin-root>/references/run-handoff.md`.
@102
the run starts, and **`/superdev-ship` closes it**, not you. **On a single-slice plan the anchor rule
@108
`full` dispatches every row; `<plugin-root>/references/run-handoff.md`'s run handoff dispatches the
