superdev-render-overlay
source: skills/backlog/SKILL.md
body-lines: 199
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-backlog
description: "Backlog survey — what is planned, stuck, waiting, or unbuilt in the slice store, and what to work on next. Read-only."
allowed-tools: "Read, Bash"
---
@5
`/superdev-status` reports the runs already started, from their ledgers. This reports the **store**: the
@9
answers a question and stops. Acting on a row is `/superdev-plan`, `/superdev-implement`, or a human
@12
**Its rules are looser than `/superdev/afk`'s, deliberately** (ADR 0049). That command acts unattended, so
@15
`/superdev-implement` on it gets that command's own checks. Share no rule set with it and derive nothing
@21
**`/superdev-setup`**, and stop. List nothing and run `/superdev-setup` yourself for nobody: it is an
@40
  `references/issue-tracker-*.md` seed — `/superdev-setup` only rewrites this file on a backend switch,
@62
directory there holding a `ledger.md` (`<plugin-root>/references/scope-mode.md`'s `## A live
@63
scope run`). For each, read its stage: `node "<plugin-root>/scripts/scope.js" get stage --root
@64
<run-root>`. This is the same ledger `/superdev-status` reports from, so the two agree about a scope by
@68
prefix (`<plugin-root>/references/scope-mode.md`'s `## The change type`) against the run root's
@77
reads `shipped` gets **no row at all** — `/superdev/ship` closes the anchor and sets that stage in the
@104
| `awaiting merge` | its matched run root's stage reads `submitted` and its pull request is open on the host, or none is recorded to check | the operator's merge on the host, then `/superdev/ship <scope-slug>` |
@105
| `merge unrecorded` | its matched run root's stage reads `submitted` and its pull request shows merged on the host by hand | `/superdev/ship <scope-slug>` — record the merge |
@108
| `needs planning` | a triage record, or an anchor that is neither itself a slice nor has slices beneath it | `/superdev-plan` |
@110
| `ready` | every remaining **anchor**: released, dependencies satisfied, and no run root or a matched run root at stage `planned` — `/superdev-plan` already cut the branch and scopetree, but no slice has run (triage #509) | `/superdev-implement <feature-label>` |
@115
`node "<plugin-root>/scripts/scope.js" get pr --root <run-root>`. **A number** → read that pull
@135
The `in flight` row's act is the chain command its stage has not reached — `<plugin-root>/references/run-handoff.md`
@136
and `<plugin-root>/skills/afk/SKILL.md`'s `## 3. Take it through the chain` table map a stage to it.
@138
feature label verbatim (`<plugin-root>/references/scope-mode.md`, "The scope branch is the
@143
A scope with a run root is **one row**, carrying its stage. Its individual slices are `/superdev-status`'s
@159
#368 backlog survey        in flight       reviewed → /superdev-document main..feat/backlog
@160
#412 export formats        ready           /superdev-implement feat/export-formats
@163
#402 retry storms          needs planning  triage record → /superdev-plan "retry storms"
@180
`/superdev-plan`. A stranded run root is the most expensive item in the backlog: it holds a branch, a
@193
- **Expanding into `/superdev-status`.** A scope with a run root is one row. Per-slice detail is that
@195
- **Inheriting `/superdev/afk`'s defer-on-doubt.** Its skips hide unreleased anchors, undecomposed
