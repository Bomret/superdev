superdev-render-overlay
source: skills/ship/SKILL.md
body-lines: 136
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-ship
description: "Close out a superdev scope — tick the Definition of Done, close the scope anchor, open the PR, and clean up the run. The last step of the implement chain; run it after /superdev-review and /superdev-document."
---
@10
**`--unattended`, if present, comes out first** — per `<plugin-root>/references/scope-mode.md`'s
@13
Resolve the message that invoked this skill to one scope — a **run root**, per that file's `## A live scope run` section:
@23
Read `<plugin-root>/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
@28
Find the scope checkout per `<plugin-root>/references/scope-mode.md`. You need it for §5's git
@34
`node "<plugin-root>/scripts/scope.js" get stage --root <run-root>` (`absent` means no line at
@40
- **`documented-unreviewed`** → `/superdev-document` ran while the stage was earlier than `reviewed`, so
@41
  the review step never ran. Treat it exactly like the review-missing case below: name `/superdev-review`
@44
  has not run (`/superdev-review`, `/superdev-document`, or both) and **ask once** whether to ship anyway.
@50
  `node "<plugin-root>/scripts/scope.js" get slices --root <run-root>`, one tab-separated row per
@51
  slice) → drop `/superdev-review` from that warning, whether it applies to this bullet or to
@53
  stage only once `/superdev-implement`'s run handoff has run the full suite and found it green, found no
@55
  `/superdev-review` as missing would train the reader to dismiss the question. If that drop empties the
@59
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` — one bullet per line,
@60
never through cwd-dependent `status` — per `<plugin-root>/references/scope-mode.md`'s
@88
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section;
@89
`node "<plugin-root>/scripts/scope.js" get degraded --root <run-root>` reports it, one bullet per
@95
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` reports it, one bullet
@101
line lists every finding `/superdev-review` handed to `/superdev-plan` rather than fixing, per that file's
@102
`## Deferred findings` section; `node "<plugin-root>/scripts/scope.js" get deferred --root
@110
`node "<plugin-root>/scripts/scope.js" stage set shipped --root <run-root>`. Publish the snapshot
@111
afterwards, per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state` section.
@130
`.superdev/kb-pending/<scope>/` holds staged pages → print `/superdev-publish-kb <scope>` with one line on
@134
This is a pointer, not a chain handoff. `/superdev-ship` still ends the chain. **No staged pages** → print
