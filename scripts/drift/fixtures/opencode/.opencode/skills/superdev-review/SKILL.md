superdev-render-overlay
source: skills/review/SKILL.md
body-lines: 487
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
@91
    3. **Otherwise** → run `<plugin-root>/references/scope-mode.md`'s `## Resolving an empty
@96
       take `<plugin-root>/references/scope-mode.md`'s `## The scope branch` shape-scan fallback
@100
       adding a `/superdev-review <scope-slug>` line for the operator to type directly, and dispatch
@104
    `<plugin-root>/references/scope-mode.md`'s `## The scope slug` charset
@109
    (a `<run-root>/ledger.md` per `<plugin-root>/references/scope-mode.md`'s `## A live scope
@111
    `node "<plugin-root>/scripts/scope.js" get branch --root <run-root>` and verify it
@114
    does not verify** → take `<plugin-root>/references/scope-mode.md`'s `## The scope branch`
@124
`/superdev-plan`") and proceed anyway. Never block on it.
@131
- **`final-reviewer`** (`model: opus`) — correctness, consistency, whole-scope brevity,
@136
  checklist itself via `<plugin-root>`).
@140
    `node "<plugin-root>/scripts/scope.js" get anchor --root <run-root>` — the ledger's
@142
    `<plugin-root>/references/scope-mode.md`'s `## The ledger` section), not derived from the
@165
- **`simplicity-reviewer`** (`model: haiku`) — over-engineering only (unnecessary complexity,
@171
- **A `full`-tier scope** → `final-reviewer` alone; skip `simplicity-reviewer` (ADR 0037),
@177
  otherwise. Derive the tier per `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section,
@194
**Exclude `slice-reviewer`.** It verifies one slice's diff against that slice's own
@198
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section and follow it: review
@233
line each, with the follow-up `/superdev-plan`. Omit this section when there is none]
@253
on findings, run `/superdev-plan` to slice the fix, then `/superdev-implement`. **Scope mode is the one
@262
  `<plugin-root>/references/scope-mode.md`. **The scope checkout not on `<type>/<scope>`** →
@266
  `node "<plugin-root>/scripts/scope.js" suite reusable --branch <branch> [--plan-files]
@274
  `docs/agents/verification.md` per `<plugin-root>/references/test-selection.md` and run it **in
@276
  `node "<plugin-root>/scripts/scope.js" suite set <green|red|denied|none> <sha> --root <run-root>`
@287
  `/superdev-ship` with none behind it. Write the `**Degraded:**` entry either way, then publish the
@289
  `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since the block
@291
  **Unattended** → **block**, per `<plugin-root>/references/scope-mode.md`'s `## Unattended`
@297
  — per `<plugin-root>/references/test-selection.md`, over the commits that cycle's implementer
@312
  `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section. **Attended** →
@315
  `<plugin-root>/references/scope-mode.md`'s `## Observations` section and follow it: a defect the
@320
  capability the Definition of Done never named** is recorded and handed to **`/superdev-plan`**: report it
@327
  second `/superdev-review` invocation on the same run, which remembers nothing of the first. "Only on the
@333
  backend `/superdev-setup` seeds a section for, re-running it is what adds one; on an "Other" backend the
@340
  anchor's reference, and a copy-pasteable `/superdev-plan "<the finding>"` line — and **no pull-request
@341
  URL**, because this command runs before `/superdev-ship` opens
@344
  `node "<plugin-root>/scripts/scope.js" deferred add - --root <run-root>` — the sole word `-`
@348
  `/superdev-status` to the record. **The create fails** → the bullet names the failure in the
@357
  carries the finding to the pull request `/superdev-ship` opens (ADR 0035). An ad-hoc range has no run
@377
  `<plugin-root>/references/dod-ticks.md`'s mapping gate: the fix cycle's dispatch below hands the
@407
    `node "<plugin-root>/scripts/scope.js" unresolved add - --root <run-root>` — the sole word
@410
    snapshot before stopping — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run
@414
  - **Confirmed** → dispatch **one** `implementer` (`model: sonnet`; `haiku` only for a
@418
    loop first (`<plugin-root>/references/diagnosis.md` — the implementer reads it on any
@423
    `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section — since no later
@430
  Follow `<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section. Write the
@443
  (`<plugin-root>/references/scope-mode.md`'s `## Verification ceiling`): no work on this branch
@450
  `<plugin-root>/references/dod-ticks.md`'s `## Reading the report`. A listed line the fix
@456
  re-verified clean — with `node "<plugin-root>/scripts/scope.js" unresolved clear --root
@458
  `**Stage:**` line with `node "<plugin-root>/scripts/scope.js" stage set <value> --root
@465
    `/superdev-ship` ask for the doc pass again.
@471
  `node "<plugin-root>/scripts/scope.js" docs clear --root <run-root>`. A `lite` run wrote that
@473
  stale, so the next `/superdev-document` must run the full `doc-writer` rather than the reader alone (ADR
@479
  clear` alike — per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section.
@481
  Then print the next command with the range already resolved — `/superdev-document <range>`, carrying
@484
  stage and the scope branch carry everything `/superdev-document` reads, so a `/clear` first costs
@486
- **Never merge, push, or open a pull request.** `/superdev-ship` ends the chain.
