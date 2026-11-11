# Knowledge base: Local file storage

An in-repo knowledge base — durable, human-facing topic pages, each holding one subject a reader looks up,
kept as markdown files in the repo. No external service. (This is distinct from the in-repo `AGENTS.md` docs in
`docs/agents/documentation.md`: those are the agent-facing contract; this KB is the reader-facing library.)

## Audience, language & outline

The KB is **human-consumption first**. Recorded at setup:

- **Audience(s):** `<end-users | internal developers | ops/support | stakeholders | …>`
- **Language:** `<e.g. English | German>` — all KB prose is written in this language.
- **Outline** (living skeleton; a top-level section per audience, each topic named by its exact title —
  `/superdev:document` extends it). Example entries, which setup replaces with the repository's own:

  - `User Guide` → `Getting started`, `Configuration`
  - `Developer Docs` → `Architecture`, `Setup`

**Every outline entry names a topic page** (ADR 0229, INV-0188). An entry gives one page's exact title,
and the page holds one subject a reader looks up, such as `Configuration` or `Architecture`. An entry holding a placeholder (`<...>`)
names no page, and the doc pass writes no page under it. `/superdev:document`'s doc pass extends the topic page a change touches. Only when no topic fits does it
add one explicit entry here, in the scope's doc commit, with its reason. A page per feature is no entry.

## Location

- **Backend:** local file storage.

`docs/kb/` — one markdown file per topic page, `docs/kb/<topic>.md`, such as `docs/kb/architecture.md`. A
`docs/kb/README.md` index lists them under their audience.
Decisions stay in the repository's ADRs: the knowledge base carries no ADR digest and no ADR summaries.

## Conventions

- **Publish** a doc: write/update the markdown file under `docs/kb/` and add it to the index.
- **Find/update**: read the file by path; update in place (no versioning beyond git history).
- **Format**: plain markdown, present-tense state-of-the-world prose.

**This backend stages nothing.** Its pages are repository files, so they ride the scope branch and merge
with the code that makes them true — there is no moment where a reader sees a page the code does not back.
Staging exists for a **remote** backend, whose pages go live the instant they are sent (ADR 0023), and
`/superdev:publish-kb` has nothing to do here.

## superdev usage

- `/superdev:document` — reconcile and extend the affected `docs/kb/` docs (via its doc-writer) after a
  scope lands, and on demand.
- `/superdev:implement` — on the `lite` tier, runs the same doc pass inline first and edits the affected
  `docs/kb/` docs; `/superdev:document`'s doc-writer then extends them.

## Switching later

To move to an external wiki, re-run `/superdev:setup` and pick a knowledge-base software backend.
