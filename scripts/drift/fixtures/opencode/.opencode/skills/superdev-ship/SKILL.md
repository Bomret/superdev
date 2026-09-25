superdev-render-overlay
source: skills/ship/SKILL.md
body-lines: 127
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-ship
description: "Close out a superdev scope — close the scope anchor, open the PR, and clean up the run. The last step of the implement chain; run it after /superdev-review and /superdev-document."
---
@10
**`--unattended`, if present, comes out first** — per `<plugin-root>/references/scope-mode.md`'s
@13
Resolve the message that invoked this skill to one scope — a **run root**, per that file's `## A live scope run` section:
@18
  `<plugin-root>/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that
@21
Read `<plugin-root>/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
@26
Find the scope checkout per `<plugin-root>/references/scope-mode.md`. You need it for §4's git
@32
`node "<plugin-root>/scripts/scope.js" get stage --root <run-root>` (`absent` means no line at
@38
- **`documented-unreviewed`** → `/superdev-document` ran while the stage was earlier than `reviewed`, so
@39
  the review step never ran. Treat it exactly like the review-missing case below: name `/superdev-review`
@42
  has not run (`/superdev-review`, `/superdev-document`, or both) and **ask once** whether to ship anyway.
@49
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` — one bullet per line,
@50
never through cwd-dependent `status` — per `<plugin-root>/references/scope-mode.md`'s
@70
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section;
@71
`node "<plugin-root>/scripts/scope.js" get degraded --root <run-root>` reports it, one bullet per
@77
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` reports it, one bullet
@83
line lists every finding `/superdev-review` handed to `/superdev-plan` rather than fixing, per that file's
@84
`## Deferred findings` section; `node "<plugin-root>/scripts/scope.js" get deferred --root
@92
`<plugin-root>/references/dod-ticks.md`'s note rule — under its own `## Post-merge checklist`
@100
`node "<plugin-root>/scripts/scope.js" stage set shipped --root <run-root>`. Publish the snapshot
@101
afterwards, per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section.
@121
`.superdev/kb-pending/<scope>/` holds staged pages → print `/superdev-publish-kb <scope>` with one line on
@125
This is a pointer, not a chain handoff. `/superdev-ship` still ends the chain. **No staged pages** → print
