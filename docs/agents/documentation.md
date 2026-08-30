# Documentation: in-repo technical docs

Durable in-repo docs live as a hierarchy of `AGENTS.md` files (this repo has a root `AGENTS.md` plus one
child, `scripts/AGENTS.md`).

- **Hierarchy.** Root `AGENTS.md` holds project-wide instructions and the top-level index. Add a child
  `AGENTS.md` when a subtree becomes a durable boundary with its own rules.
- **Read before editing.** Walk the `AGENTS.md` tree from root to the area you touch, and follow local
  rules.
- **Update after meaningful changes.** When structure, ownership, workflow, contracts, or operating
  rules change, update the nearest owning `AGENTS.md`, plus every parent whose child-index changed.
- **Keep it operational.** Concise, current, stable contracts, not diary entries. **Delete stale or
  contradictory text immediately.** Write present-tense, state-of-the-world prose, with no history.
- **Single-source.** A derivable or shared fact (a count, a name-list, a described behavior) lives in
  exactly one owning place. This repo's own file, agent, and hook counts belong to the `Structure`
  listing in root `AGENTS.md`, and are restated nowhere else. Every other doc links to the owning place
  instead of restating the fact.

superdev usage: `/superdev:plan` records ADRs (`docs/adr/`), the glossary (`CONTEXT.md`), and path-scoped
rules (`.claude/rules/`) in their conventional locations. `/superdev:document` reconciles the `AGENTS.md`
tree and `README.md` with the code. It is the third command of the implement chain (`/superdev:implement`,
then `/superdev:review`, then `/superdev:document`, then `/superdev:ship`), and it also runs on demand at
any time.

## Writing standard

**Standard:** `controlled`

The doc agents write prose to `${CLAUDE_PLUGIN_ROOT}/references/controlled-prose.md` (ADR 0012). It binds
only the prose an agent writes or rewrites, so untouched text is never reformatted.

`README.md`'s hero and its before-and-after section are voiced prose, and are exempt by the standard's own
scope rule. The reference material below them is not exempt.

The plugin's own prompt prose (`plugin/skills/`, `plugin/agents/`, `plugin/references/`) sits outside
the standard's `## Scope` list, and root `AGENTS.md`'s prompt-architecture rules govern it instead. Those
files appear in the `## Audit set` below for claim grounding, which is a separate pass from the writing
standard.

### Declare per language

- **Spelling:** American English.
- **Compound formation:** hyphenate a multi-word modifier before the noun it modifies (`test-first
  discipline`, `read-only reviewer`). Leave it open elsewhere.
- **Numbers and dates:** numerals from 10 up, words below. Dates as `YYYY-MM-DD`.
- **Quotation marks:** straight double quotes. Interface text, paths, and identifiers take backticks
  instead of quotes.
- **Case and possessive forms:** the possessive of a singular noun takes `'s` (`hook's`). The possessive
  of a plural noun ending in `s` takes `s'` (`hooks'`).

Untranslated terms do not arise in an English repo, so this repo leaves that one unanswered.

## Audit set

`/superdev:document audit` reads these in addition to the default tree (`AGENTS.md` + `README.md` +
`CONTEXT.md` + local KB):

- `plugin/skills/*/SKILL.md`
- `plugin/agents/*.md`
- `plugin/references/*.md`
- `RELEASING.md`
