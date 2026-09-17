superdev-render-overlay
source: skills/review/SKILL.md
body-lines: 344
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-review
description: "Review a change — a commit range, a branch, a path, or the working tree — for correctness, architecture, security, and over-engineering. Read-only on an ad-hoc range; on a live superdev scope it reviews against the DoD and can drive the fix loop."
---
@10
  after asking once, and hands off to `/superdev-document`. **§4 owns everything that differs.**
@30
**`--unattended`, if present, comes out first** — per `<plugin-root>/references/scope-mode.md`'s
@33
Parse the message that invoked this skill into a **range** and an optional trailing description of what the change should do:
@37
- **Scope mode wins over both.** Read `<plugin-root>/references/scope-mode.md` for what makes the
@80
`/superdev-plan`") and proceed anyway. Never block on it.
@87
- **`final-reviewer`** (`model: opus`) — correctness, consistency, whole-scope brevity,
@92
  checklist itself via `<plugin-root>`).
@96
    `node "<plugin-root>/scripts/scope.js" get anchor --root <run-root>` — the ledger's
@98
    `<plugin-root>/references/scope-mode.md`'s `## The ledger` section), not derived from the
@110
- **`simplicity-reviewer`** (`model: haiku`) — over-engineering only (unnecessary complexity,
@116
- **A `full`-tier scope** → `final-reviewer` alone; skip `simplicity-reviewer` (ADR 0037),
@122
  otherwise. Derive the tier per `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section,
@139
**Exclude `slice-reviewer`.** It verifies one slice's diff against that slice's own
@143
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section and follow it: review
@178
line each, with the follow-up `/superdev-plan`. Omit this section when there is none]
@198
on findings, run `/superdev-plan` to slice the fix, then `/superdev-implement`. **Scope mode is the one
@207
  `<plugin-root>/references/scope-mode.md`. **The scope checkout not on `<type>/<scope>`** →
@210
  `docs/agents/verification.md` per `<plugin-root>/references/test-selection.md` and run it **in
@219
  `/superdev-ship` with none behind it. Write the `**Degraded:**` entry either way, then publish the
@221
  `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since the block
@223
  **Unattended** → **block**, per `<plugin-root>/references/scope-mode.md`'s `## Unattended`
@231
  capability the Definition of Done never named** is recorded and handed to **`/superdev-plan`**: report it
@238
  second `/superdev-review` invocation on the same run, which remembers nothing of the first. "Only on the
@244
  backend `/superdev-setup` seeds a section for, re-running it is what adds one; on an "Other" backend the
@251
  anchor's reference, and a copy-pasteable `/superdev-plan "<the finding>"` line — and **no pull-request
@252
  URL**, because this command runs before `/superdev-ship` opens
@254
  `node "<plugin-root>/scripts/scope.js" deferred add "<text>" --root <run-root>` — **the bullet
@256
  `/superdev-status` to the record. **The create fails** → the bullet names the failure in the
@265
  carries the finding to the pull request `/superdev-ship` opens (ADR 0035). An ad-hoc range has no run
@281
    `node "<plugin-root>/scripts/scope.js" unresolved add "<text>" --root <run-root>`, publish the
@282
    snapshot before stopping — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run
@286
  - **Confirmed** → dispatch **one** `implementer` (`model: sonnet`; `haiku` only for a
@290
    loop first (`<plugin-root>/references/diagnosis.md` — the implementer reads it on any
@295
    `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since no later
@300
  Follow `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section. Write the
@313
  re-verified clean — with `node "<plugin-root>/scripts/scope.js" unresolved clear --root
@315
  `**Stage:**` line with `node "<plugin-root>/scripts/scope.js" stage set <value> --root
@322
    `/superdev-ship` ask for the doc pass again.
@328
  `node "<plugin-root>/scripts/scope.js" docs clear --root <run-root>`. A `lite` run wrote that
@330
  stale, so the next `/superdev-document` must run the full `doc-writer` rather than the reader alone (ADR
@336
  clear` alike — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section.
@338
  Then print the next command with the range already resolved — `/superdev-document <range>`, carrying
@341
  stage and the scope branch carry everything `/superdev-document` reads, so a `/clear` first costs
@343
- **Never merge, push, or open a pull request.** `/superdev-ship` ends the chain.
