superdev-render-overlay
source: skills/implement/SKILL.md
body-lines: 133
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
@42
  no tests — the loop's runs plus the scope's full-suite run at `/superdev-review` are the net
@50
  **`/superdev-setup`**, then continue. **Advisory:** `docs/agents/toolchain.md` absent while the repo has
@52
  `Cargo.toml`, `go.mod`, …) → suggest **`/superdev-setup`**; non-blocking, continue.
@53
- **Resolve the message that invoked this skill to one feature.** Take `--unattended` out first, wherever it sits. A **feature
@55
  carries a **change type** and a slug (`<plugin-root>/references/scope-mode.md`'s
@58
  `<plugin-root>/references/scope-mode.md`'s scope-slug rule, both segments** — the whole label
@65
    **`/superdev-plan`**, stop. **`--unattended` → block**.
@68
    `<plugin-root>/references/scope-mode.md`'s `## Resolving an empty argument` cascade,
@70
    **`/superdev-plan`** first, rather than the cascade's own report-and-stop.
@72
  slices → run **`/superdev-plan`** first. **One slice, no epic** → the epic is optional
@79
  releasing the plan in the tracker stays the human's own act. **`--unattended` → block** — `/superdev/afk`
@81
- **`--unattended` present** → read `<plugin-root>/references/scope-mode.md`'s **Unattended**
@83
  command (`/superdev-setup`, `/superdev-plan`). The "slice store or code host missing" and "no slices"
@90
  configured or persisted (`/superdev-plan` derives it the same way). `Read` your playbook and follow it
@92
  - `full` → `<plugin-root>/references/implement-full.md`
@93
  - `lite` → `<plugin-root>/references/implement-lite.md`
@94
  Each playbook ends by reading `<plugin-root>/references/run-handoff.md`.
@106
the run starts, and **`/superdev-ship` closes it**, not you. **On a single-slice plan the anchor rule
@112
`full` dispatches every row; `<plugin-root>/references/run-handoff.md`'s run handoff dispatches the
