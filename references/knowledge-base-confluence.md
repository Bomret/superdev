# Knowledge base: Confluence

An external knowledge base for durable, human-facing docs (PRDs, design overviews, ADR summaries),
published to a Confluence space. In-repo docs (`docs/agents/documentation.md`) remain the source of
truth; the KB is a published view.

## Audience, language & outline

The KB is **human-consumption first**. Recorded at setup:

- **Audience(s):** `<end-users | internal developers | ops/support | stakeholders | …>`
- **Language:** `<e.g. English | German>` — all KB prose is written in this language.
- **Outline** (living skeleton; a top-level page per audience — `/superdev:plan` and
  `/superdev:document` fill and extend it):

  - `<Audience A — e.g. User Guide>` → `<topic>`, `<topic>`
  - `<Audience B — e.g. Developer Docs>` → `Architecture`, `Setup`, `ADR summaries`

## Configuration (fill in at setup)

- **Base URL**: `<https://your-domain.atlassian.net/wiki>`
- **Space key**: `<SPACE>`
- **Auth**: API token in env var `<CONFLUENCE_API_TOKEN>`, user email in `<CONFLUENCE_EMAIL>`. Record
  the env-var NAMES only, never the secrets.
- **What to publish**: `<PRDs + ADR summaries>` — durable, reader-facing docs only, not every `AGENTS.md`.
- **Parent page** (optional): `<page id or title under which superdev pages are created>`.

## REST conventions (curl, Confluence Cloud v2)

Auth: `-u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN"`, `-H "Content-Type: application/json"`.

- **Create a page**: `POST <base>/api/v2/pages` with
  `{ "spaceId": "<id>", "title": "<title>", "parentId": "<optional>",
     "body": { "representation": "storage", "value": "<HTML storage format>" } }`.
- **Find a page** (update, don't duplicate): `GET <base>/api/v2/pages?title=<title>&space-id=<id>`.
- **Update a page**: `PUT <base>/api/v2/pages/<id>` with the new body and incremented `version.number`.

## superdev usage

- `/superdev:plan` — after writing the in-repo PRD/ADRs, optionally publish/refresh their pages.
- `/superdev:implement` — the final phase optionally syncs the durable docs to the space once the scope
  branch is green.

## Degrade / switching

No token or unreachable → skip publishing, note it, keep the in-repo docs as the record. To move to a
different wiki later, re-run `/superdev:setup` and pick a different knowledge base.
