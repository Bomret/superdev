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
- **Single-source.** A derivable or shared fact (a count, a name-list, a described behavior) lives in
  exactly one owning place — e.g. this repo's own file/agent/hook counts belong to the `Structure`
  listing in root `AGENTS.md`, not restated elsewhere. Every other doc links to the owning place instead
  of restating the fact.

superdev usage: `/superdev:plan` records ADRs (`docs/adr/`), the glossary (`CONTEXT.md`), and path-scoped
rules (`.claude/rules/`) in their conventional locations. `/superdev:document` reconciles the `AGENTS.md`
tree + `README.md` with the code. It is the third command of the implement chain (`/superdev:implement` →
`/superdev:review` → `/superdev:document` → `/superdev:ship`), and it also runs on demand at any time.

## Writing standard

**Standard:** `controlled`

The doc agents write prose to `${CLAUDE_PLUGIN_ROOT}/references/controlled-prose.md` (ADR 0012). It binds
only the prose an agent writes or rewrites, so untouched text is never reformatted.

`README.md`'s hero and before/after section is voiced prose and is exempt by the standard's own scope
rule. The reference material below it is not exempt.

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

- `commands/*.md`
- `agents/*.md`
- `references/*.md`
- `RELEASING.md`
