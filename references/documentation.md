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
- **Single-source.** A derivable or shared fact (a count, a name-list, a described behavior) lives in
  exactly one owning place. Every other doc that needs it links to the owning place instead of
  restating it — a restated fact drifts the moment the owning place changes.

## Writing standard

**Standard:** `<controlled | <repo-relative path> | none>`

The prose style the doc agents apply (ADR 0012). One of:

- `controlled`: the language-neutral rule set shipped with the plugin. The agents read
  `${CLAUDE_PLUGIN_ROOT}/references/controlled-prose.md`.
- a repo-relative path (for example, `docs/style-guide.md`): the agents read the project's own guide.
- `none`: no standard. The agents write as they otherwise would.

It binds only the prose an agent writes or rewrites in a dispatch. Untouched text is never reformatted,
so docs converge on the standard as they are touched.

superdev usage:

- `/superdev:plan` records the glossary (`CONTEXT.md`), ADRs (`docs/adr/`), and any path-scoped rules
  (`.claude/rules/`) in their conventional locations; the `AGENTS.md` tree indexes and points to them.
- `/superdev:document` runs the **documentation pass**: it brings the affected `AGENTS.md` (and other
  in-repo docs) up to the current state and removes stale text. It runs at the end of every
  `/superdev:implement` and on demand.
