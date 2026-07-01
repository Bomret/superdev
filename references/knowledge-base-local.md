# Knowledge base: Local file storage

An in-repo knowledge base — durable, human-facing docs (PRDs, design overviews, ADR summaries) kept as
markdown files in the repo. No external service. (This is distinct from DOX `AGENTS.md` docs in
`docs/agents/documentation.md`: DOX is the agent-facing contract; this KB is the reader-facing library.)

## Location

`docs/kb/` — one markdown file per document, e.g. `docs/kb/<feature>-prd.md`,
`docs/kb/adr-summary.md`. A `docs/kb/README.md` index lists them.

## Conventions

- **Publish** a doc: write/update the markdown file under `docs/kb/` and add it to the index.
- **Find/update**: read the file by path; update in place (no versioning beyond git history).
- **Format**: plain markdown, present-tense state-of-the-world prose.

## superdev usage

- `/superdev:plan` — write the PRD / ADR summaries under `docs/kb/` and update the index.
- `/superdev:implement` — the final phase refreshes the affected `docs/kb/` docs once the scope branch
  is green.

## Switching later

To move to an external wiki, re-run `/superdev:setup` and pick a knowledge-base software backend.
