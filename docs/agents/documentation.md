# Documentation: in-repo technical docs

Durable in-repo docs live as a hierarchy of `AGENTS.md` files (this repo currently has a single root
`AGENTS.md`).

- **Hierarchy.** Root `AGENTS.md` holds project-wide instructions + the top-level index. Add a child
  `AGENTS.md` when a subtree becomes a durable boundary with its own rules.
- **Read before editing.** Walk the `AGENTS.md` tree from root to the area you touch; follow local rules.
- **Update after meaningful changes.** When structure, ownership, workflow, contracts, or operating
  rules change → update the nearest owning `AGENTS.md` (and parents whose child-index changed).
- **Keep it operational.** Concise, current, stable contracts — not diary entries. **Delete stale or
  contradictory text immediately**; present-tense, state-of-the-world prose, no history.

superdev usage: `/superdev:plan` records ADRs (`docs/adr/`), the glossary (`CONTEXT.md`), and path-scoped
rules (`.claude/rules/`) in their conventional locations; `/superdev:document` reconciles the `AGENTS.md`
tree + `README.md` with the code at the end of every `/superdev:implement` and on demand.
