superdev-render-overlay
source: skills/submit-pr/SKILL.md
body-lines: 127
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-submit-pr
description: "Submit a pull request for a superdev scope — the stage gate, the Unresolved ask-once, and the pull request body. The last step of the implement chain; run it after /superdev-review and /superdev-document."
---
@6
the scopetree, the slicetrees, and the run lock stay, and `/superdev/ship` is what takes them down, after
@11
**`--unattended`, if present, comes out first** — per `<plugin-root>/references/scope-mode.md`'s
@14
Resolve the message that invoked this skill to one scope — a **run root**, per that file's `## A live scope run` section:
@19
  `<plugin-root>/references/scope-mode.md`'s `## Resolving an empty argument` cascade over that
@22
Read `<plugin-root>/references/scope-mode.md` for how to capture `<run-root>` and how the run lock
@27
Find the scope checkout per `<plugin-root>/references/scope-mode.md`. You need it for §4's git
@33
`node "<plugin-root>/scripts/scope.js" get stage --root <run-root>` (`absent` means no line at
@38
  `node "<plugin-root>/scripts/scope.js" get pr --root <run-root>` and print that pull request; a
@42
- **`documented-unreviewed`** → `/superdev-document` ran while the stage was earlier than `reviewed`, so
@43
  the review step never ran. Treat it exactly like the review-missing case below: name `/superdev-review`
@46
  has not run (`/superdev-review`, `/superdev-document`, or both) and **ask once** whether to submit
@54
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` — one bullet per line,
@55
never through cwd-dependent `status` — per `<plugin-root>/references/scope-mode.md`'s
@69
is an API call skips this: it closes the anchor after the merge instead, which is `/superdev/ship`'s job,
@78
`node "<plugin-root>/scripts/scope.js" pr set <n> --root <run-root>`, `<n>` the number the host's
@79
own open call returned. This is what lets `/superdev/ship` read the pull request back by number instead of
@87
`<plugin-root>/references/scope-mode.md`'s `## Degraded passes` section;
@88
`node "<plugin-root>/scripts/scope.js" get degraded --root <run-root>` reports it, one bullet per
@94
`node "<plugin-root>/scripts/scope.js" get unresolved --root <run-root>` reports it, one bullet
@100
line lists every finding `/superdev-review` handed to `/superdev-plan` rather than fixing, per that file's
@101
`## Deferred findings` section; `node "<plugin-root>/scripts/scope.js" get deferred --root
@109
`<plugin-root>/references/dod-ticks.md`'s note rule — under its own `## Post-merge checklist`
@115
`node "<plugin-root>/scripts/scope.js" stage set submitted --root <run-root>`. Publish the
@116
snapshot afterwards, per `<plugin-root>/references/scope-mode.md`'s `## Publishing run state`
@118
anchor on a remote store stays open. `/superdev/ship` closes it, on the merge, and takes the run's
@121
**Print `/superdev/ship <scope>` as the next command.** One line on what it does: it merges the pull
@123
`/superdev-publish-kb <scope>` itself once the merge lands, when pages are staged.
@125
This is the chain's own end. `/superdev-submit-pr` hands off to `/superdev/ship`, and only a human runs
