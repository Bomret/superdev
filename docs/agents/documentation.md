# Documentation: in-repo technical docs

Durable in-repo docs live as a hierarchy of `AGENTS.md` files (this repo has a root `AGENTS.md`, plus
`scripts/AGENTS.md`, `plugin/references/AGENTS.md`, and `mods/superdev-view/AGENTS.md`). The optional knowledge base is a separate
concern, see `docs/agents/knowledge-base.md`.

- **Hierarchy.** Root `AGENTS.md` holds project-wide instructions and the top-level index. Add a child
  `AGENTS.md` when a subtree becomes a durable boundary with its own purpose, rules, workflow, or
  verification.
- **Read before editing.** Walk the `AGENTS.md` tree from root to the area you touch, and follow local
  rules.
- **Update after meaningful changes.** When structure, ownership, workflow, contracts, or operating
  rules change, update the nearest owning `AGENTS.md`, plus every parent whose child-index changed.
- **Keep it operational.** Concise, current, stable contracts, not diary entries. Broad rules in parent
  docs, concrete details in child docs. **Delete stale or contradictory text immediately.** Write present-tense, state-of-the-world prose, with no history.
- **Single-source.** A derivable or shared fact (a name-list, a described behavior) lives in exactly one
  owning place. Root `AGENTS.md`'s `Structure` listing is where this repo's `skills/`, `agents/`,
  `hooks/`, and `scripts/` are named. Every other doc links to the owning place instead of restating the
  fact.

superdev usage: `/superdev:plan` records ADRs (`docs/adr/`), the glossary (`CONTEXT.md`), and the
invariant register (`docs/invariants.md`) in their conventional locations, and the `AGENTS.md` tree indexes and points to them. `/superdev:document`
reconciles the `AGENTS.md` tree and `README.md` with the code. It is the third command of the implement
chain (`/superdev:implement`, then `/superdev:review`, then `/superdev:document`, then
`/superdev:submit-pr`), and it also runs on demand at any time.

## Rejected requests

Optional. `.out-of-scope/<concept>.md` records ideas deliberately rejected — one file per **concept**,
never per request, each stating the request shape and why it stays out of scope. `/superdev:plan` reads
the directory before an interview commits to building, and `/superdev:brainstorm` before it explores
directions, both matching by concept rather than keyword. Two
rules keep it useful: the reason must be durable ("too busy right now" is a deferral, not a rejection —
don't record it), and an idea closed because it is **already implemented** never goes here — that is a
built feature, and recording it would poison the check with false rejections. The doc pass maintains the
entries like any other doc. No rejections yet → no directory; never scaffold an empty one.

## Writing standard

**Standard:** `controlled`

The doc agents write prose to `${CLAUDE_PLUGIN_ROOT}/references/controlled-prose.md` (ADR 0012). It binds
only the prose an agent writes or rewrites, so untouched text is never reformatted.

`README.md`'s hero and its before-and-after section are voiced prose, and are exempt by the standard's own
scope rule. The reference material below them is not exempt.

The plugin's own prompt prose in `plugin/skills/`, `plugin/agents/`, and the non-`AGENTS.md` files in
`plugin/references/` sits outside the standard's `## Scope` list, and root `AGENTS.md`'s prompt-architecture
rules govern it instead. Those files appear in the `## Audit set` below for claim grounding, which is a
separate pass from the writing standard.

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
- `docs/known-issues.md`
