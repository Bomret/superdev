## External knowledge base — Confluence

Durable, human-facing docs (PRDs, design overviews, ADR summaries) are mirrored to a Confluence space.
In-repo DOX docs remain the source of truth; the KB is a published view.

### Configuration (fill in at setup)

- **Base URL**: `<https://your-domain.atlassian.net/wiki>`
- **Space key**: `<SPACE>`
- **Auth**: API token in env var `<CONFLUENCE_API_TOKEN>`, user email in `<CONFLUENCE_EMAIL>`. Record
  the env-var NAMES only, never the secrets.
- **What to publish**: `<PRDs + ADR summaries>` (keep it to durable, reader-facing docs — not every
  AGENTS.md).
- **Parent page** (optional): `<page id or title under which superdev pages are created>`.

### REST conventions (curl, Confluence Cloud v2)

Auth: `-u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN"`, `-H "Content-Type: application/json"`.

- **Create a page**: `POST <base>/api/v2/pages` with
  `{ "spaceId": "<id>", "title": "<title>", "parentId": "<optional>",
     "body": { "representation": "storage", "value": "<HTML storage format>" } }`.
- **Find a page** (to update instead of duplicate): `GET <base>/api/v2/pages?title=<title>&space-id=<id>`.
- **Update a page**: `PUT <base>/api/v2/pages/<id>` with the new body and the incremented `version.number`.

### superdev usage

- `/superdev:plan` — after writing the in-repo PRD/ADRs, optionally publish/refresh their Confluence
  pages.
- `/superdev:implement` — the final phase optionally syncs the durable docs (design overview, ADR
  summaries) to the space once the scope branch is green.

### Switching later

Confluence is one backend. To move to another wiki, re-run `/superdev:setup` and pick a different KB (or
"other" with a freeform description) — no skill or agent changes.

### Degrade

No token / unreachable → skip publishing, note it, and leave the in-repo DOX docs as the record.
