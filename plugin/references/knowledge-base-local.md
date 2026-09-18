# Knowledge base: Local file storage

An in-repo knowledge base — durable, human-facing docs (feature specifications, design overviews, ADR summaries) kept as
markdown files in the repo. No external service. (This is distinct from the in-repo `AGENTS.md` docs in
`docs/agents/documentation.md`: those are the agent-facing contract; this KB is the reader-facing library.)

## Audience, language & outline

The KB is **human-consumption first**. Recorded at setup:

- **Audience(s):** `<end-users | internal developers | ops/support | stakeholders | …>`
- **Language:** `<e.g. English | German>` — all KB prose is written in this language.
- **Outline** (living skeleton; a top-level section per audience — `/superdev:plan` and
  `/superdev:document` fill and extend it):

  - `<Audience A — e.g. User Guide>` → `<topic>`, `<topic>`
  - `<Audience B — e.g. Developer Docs>` → `Architecture`, `Setup`, `ADR summaries`

## Location

- **Backend:** local file storage.

`docs/kb/` — one markdown file per document, e.g. `docs/kb/<feature>-spec.md`,
`docs/kb/adr-summary.md`. A `docs/kb/README.md` index lists them.

## Conventions

- **Publish** a doc: write/update the markdown file under `docs/kb/` and add it to the index.
- **Find/update**: read the file by path; update in place (no versioning beyond git history).
- **Format**: plain markdown, present-tense state-of-the-world prose.

**This backend stages nothing.** Its pages are repository files, so they ride the scope branch and merge
with the code that makes them true — there is no moment where a reader sees a page the code does not back.
Staging exists for a **remote** backend, whose pages go live the instant they are sent (ADR 0023), and
`/superdev:publish-kb` has nothing to do here.

## superdev usage

- `/superdev:plan` — seed the feature specification / ADR summaries into the outline under `docs/kb/` and
  update the index.
- `/superdev:document` — reconcile and extend the affected `docs/kb/` docs (via its doc-writer) after a
  scope lands, and on demand.

## Switching later

To move to an external wiki, re-run `/superdev:setup` and pick a knowledge-base software backend.
