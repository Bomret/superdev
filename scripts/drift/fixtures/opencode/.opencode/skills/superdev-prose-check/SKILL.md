superdev-render-overlay
source: skills/prose-check/SKILL.md
body-lines: 113
---
# generated-by: superdev-adapter — a re-render overwrites this directory
name: superdev-prose-check
description: "Check one piece of prose against the controlled-prose writing standard — a file, a commit range, or pasted text. Reports violations by section, and rewrites on request."
allowed-tools: "Read, Grep, Bash, Edit"
---
@4
Apply `<plugin-root>/references/controlled-prose.md` to **one** piece of prose, on demand, in any
@5
repo. `/superdev-document` applies that standard to the docs a run touched, gated on the repo's own
@15
Take the **fix instruction** out of the message that invoked this skill first, when the text after the last ` -- ` separator
@18
split (the whole of the message that invoked this skill, when no tail qualifies) is the target, and it is exactly one of four
@49
- **`<plugin-root>/references/controlled-prose.md`, always.** Read it every run, whatever
@91
A trailing ` -- fix` (the last ` -- ` in the message that invoked this skill, with exactly `fix` after it) switches this
@109
  nothing else here. A repo that never ran `/superdev-setup` gets the same check (ADR 0057).
