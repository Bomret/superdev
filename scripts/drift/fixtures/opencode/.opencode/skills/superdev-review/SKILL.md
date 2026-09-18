superdev-render-overlay
source: skills/review/SKILL.md
body-lines: 358
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-review
description: "Review a change — a commit range, a branch, a path, or the working tree — for correctness, architecture, security, and over-engineering. Read-only on an ad-hoc range; on a live superdev scope it reviews against the DoD and can drive the fix loop."
---
@7
  `/superdev-sweep`'s code leg under `--chained` (§1). No plan behind it, and **read-only end to end** (§3).
@10
  after asking once, and hands off to `/superdev-document`. **§4 owns everything that differs.**
@30
**`--unattended`, if present, comes out first** — per `<plugin-root>/references/scope-mode.md`'s
@34
either. It signals that `/superdev-sweep` dispatched this run as its code leg, in the **chained posture**
@38
Parse the message that invoked this skill into a **range** and an optional trailing description of what the change should do:
@47
- **Scope mode wins over both, otherwise.** Read `<plugin-root>/references/scope-mode.md` for what
@69
standing tree `/superdev-sweep` asked this leg to read.
@94
`/superdev-plan`") and proceed anyway. Never block on it.
@101
- **`final-reviewer`** (`model: opus`) — correctness, consistency, whole-scope brevity,
@106
  checklist itself via `<plugin-root>`).
@110
    `node "<plugin-root>/scripts/scope.js" get anchor --root <run-root>` — the ledger's
@112
    `<plugin-root>/references/scope-mode.md`'s `## The ledger` section), not derived from the
@124
- **`simplicity-reviewer`** (`model: haiku`) — over-engineering only (unnecessary complexity,
@130
- **A `full`-tier scope** → `final-reviewer` alone; skip `simplicity-reviewer` (ADR 0037),
@136
  otherwise. Derive the tier per `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section,
@153
**Exclude `slice-reviewer`.** It verifies one slice's diff against that slice's own
@157
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section and follow it: review
@192
line each, with the follow-up `/superdev-plan`. Omit this section when there is none]
@212
on findings, run `/superdev-plan` to slice the fix, then `/superdev-implement`. **Scope mode is the one
@221
  `<plugin-root>/references/scope-mode.md`. **The scope checkout not on `<type>/<scope>`** →
@224
  `docs/agents/verification.md` per `<plugin-root>/references/test-selection.md` and run it **in
@233
  `/superdev-ship` with none behind it. Write the `**Degraded:**` entry either way, then publish the
@235
  `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since the block
@237
  **Unattended** → **block**, per `<plugin-root>/references/scope-mode.md`'s `## Unattended`
@245
  capability the Definition of Done never named** is recorded and handed to **`/superdev-plan`**: report it
@252
  second `/superdev-review` invocation on the same run, which remembers nothing of the first. "Only on the
@258
  backend `/superdev-setup` seeds a section for, re-running it is what adds one; on an "Other" backend the
@265
  anchor's reference, and a copy-pasteable `/superdev-plan "<the finding>"` line — and **no pull-request
@266
  URL**, because this command runs before `/superdev-ship` opens
@268
  `node "<plugin-root>/scripts/scope.js" deferred add "<text>" --root <run-root>` — **the bullet
@270
  `/superdev-status` to the record. **The create fails** → the bullet names the failure in the
@279
  carries the finding to the pull request `/superdev-ship` opens (ADR 0035). An ad-hoc range has no run
@295
    `node "<plugin-root>/scripts/scope.js" unresolved add "<text>" --root <run-root>`, publish the
@296
    snapshot before stopping — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run
@300
  - **Confirmed** → dispatch **one** `implementer` (`model: sonnet`; `haiku` only for a
@304
    loop first (`<plugin-root>/references/diagnosis.md` — the implementer reads it on any
@309
    `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since no later
@314
  Follow `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section. Write the
@327
  re-verified clean — with `node "<plugin-root>/scripts/scope.js" unresolved clear --root
@329
  `**Stage:**` line with `node "<plugin-root>/scripts/scope.js" stage set <value> --root
@336
    `/superdev-ship` ask for the doc pass again.
@342
  `node "<plugin-root>/scripts/scope.js" docs clear --root <run-root>`. A `lite` run wrote that
@344
  stale, so the next `/superdev-document` must run the full `doc-writer` rather than the reader alone (ADR
@350
  clear` alike — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section.
@352
  Then print the next command with the range already resolved — `/superdev-document <range>`, carrying
@355
  stage and the scope branch carry everything `/superdev-document` reads, so a `/clear` first costs
@357
- **Never merge, push, or open a pull request.** `/superdev-ship` ends the chain.
