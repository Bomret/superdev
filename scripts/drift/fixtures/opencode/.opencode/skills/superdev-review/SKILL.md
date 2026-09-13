superdev-render-overlay
source: skills/review/SKILL.md
body-lines: 328
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
@71
`/superdev-plan`") and proceed anyway. Never block on it.
@78
- **`final-reviewer`** (`model: opus`) — correctness, consistency, whole-scope brevity,
@81
  the git range (it reads the review checklist itself via `<plugin-root>`).
@85
    `node "<plugin-root>/scripts/scope.js" get anchor --root <run-root>` — the ledger's
@87
    `<plugin-root>/references/scope-mode.md`'s `## The ledger` section), not derived from the
@99
- **`simplicity-reviewer`** (`model: haiku`) — over-engineering only (unnecessary complexity,
@105
- **A `full`-tier scope** → `final-reviewer` alone; skip `simplicity-reviewer` (ADR 0037),
@111
  otherwise. Derive the tier per `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section,
@123
**Exclude `slice-reviewer`.** It verifies one slice's diff against that slice's own
@127
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section and follow it: review
@162
line each, with the follow-up `/superdev-plan`. Omit this section when there is none]
@182
on findings, run `/superdev-plan` to slice the fix, then `/superdev-implement`. **Scope mode is the one
@191
  `<plugin-root>/references/scope-mode.md`. **The scope checkout not on `<type>/<scope>`** →
@194
  `docs/agents/verification.md` per `<plugin-root>/references/test-selection.md` and run it **in
@203
  `/superdev-ship` with none behind it. Write the `**Degraded:**` entry either way, then publish the
@205
  `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since the block
@207
  **Unattended** → **block**, per `<plugin-root>/references/scope-mode.md`'s `## Unattended`
@215
  capability the Definition of Done never named** is recorded and handed to **`/superdev-plan`**: report it
@222
  second `/superdev-review` invocation on the same run, which remembers nothing of the first. "Only on the
@228
  backend `/superdev-setup` seeds a section for, re-running it is what adds one; on an "Other" backend the
@235
  anchor's reference, and a copy-pasteable `/superdev-plan "<the finding>"` line — and **no pull-request
@236
  URL**, because this command runs before `/superdev-ship` opens
@238
  `node "<plugin-root>/scripts/scope.js" deferred add "<text>" --root <run-root>` — **the bullet
@240
  `/superdev-status` to the record. **The create fails** → the bullet names the failure in the
@249
  carries the finding to the pull request `/superdev-ship` opens (ADR 0035). An ad-hoc range has no run
@265
    `node "<plugin-root>/scripts/scope.js" unresolved add "<text>" --root <run-root>`, publish the
@266
    snapshot before stopping — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run
@270
  - **Confirmed** → dispatch **one** `implementer` (`model: sonnet`; `haiku` only for a
@274
    loop first (`<plugin-root>/references/diagnosis.md` — the implementer reads it on any
@279
    `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since no later
@284
  Follow `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section. Write the
@297
  re-verified clean — with `node "<plugin-root>/scripts/scope.js" unresolved clear --root
@299
  `**Stage:**` line with `node "<plugin-root>/scripts/scope.js" stage set <value> --root
@306
    `/superdev-ship` ask for the doc pass again.
@312
  `node "<plugin-root>/scripts/scope.js" docs clear --root <run-root>`. A `lite` run wrote that
@314
  stale, so the next `/superdev-document` must run the full `doc-writer` rather than the reader alone (ADR
@320
  clear` alike — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section.
@322
  Then print the next command with the range already resolved — `/superdev-document <range>`, carrying
@325
  stage and the scope branch carry everything `/superdev-document` reads, so a `/clear` first costs
@327
- **Never merge, push, or open a pull request.** `/superdev-ship` ends the chain.
