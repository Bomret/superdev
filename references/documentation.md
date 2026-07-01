<!--
  Attribution: the AGENTS.md-hierarchy documentation approach below is inspired by
  DOX, by agent0ai — https://github.com/agent0ai/dox. Credit to its author.
  superdev distills the convention in its own words; DOX is not required to be installed.
-->

# Documentation: in-repo technical docs

How this repo keeps durable **in-repo** technical documentation. (The optional external/local
knowledge base is a separate concern — see `docs/agents/knowledge-base.md`.)

Technical docs live in the repo as a hierarchy of `AGENTS.md` files:

- **Hierarchy.** The root `AGENTS.md` holds project-wide instructions + the top-level index. A child
  `AGENTS.md` holds local rules for a subtree, created when a folder becomes a **durable boundary**
  with its own purpose, rules, workflow, or verification.
- **Read before editing.** Walk the `AGENTS.md` tree from the root down to the area you'll touch; follow
  the local rules — don't edit blindly.
- **Update after meaningful changes.** When structure, ownership, workflow, or a child index changes →
  update the parent `AGENTS.md`. When a change alters local rules → update the child.
- **Keep it operational.** Concise, current, stable contracts — not diary entries. Broad rules in
  parent docs, concrete details in child docs. **Delete stale or contradictory text immediately**;
  don't narrate history. Present-tense state-of-the-world prose.

superdev usage:

- `/superdev:plan` records ADRs and the glossary as durable docs under this convention.
- `/superdev:document` runs the **documentation pass**: it brings the affected `AGENTS.md` (and other
  in-repo docs) up to the current state and removes stale text. It runs at the end of every
  `/superdev:implement` and on demand.
