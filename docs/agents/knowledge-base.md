# Knowledge base: Codeberg Wiki (Forgejo)

Durable, **human-first** reader-facing docs (PRDs, design overviews, ADR summaries) live in the
Codeberg repo **Wiki** for `bomret/superdev`. Distinct from the agent-first in-repo `AGENTS.md` docs.

## Configuration

- **Backend:** Codeberg repo Wiki. **The Wiki unit is enabled** on the repo (`has_wiki: true`; if it's
  ever disabled, re-enable with `PATCH /api/v1/repos/bomret/superdev { "has_wiki": true }` using the
  `GITEA_TOKEN`).
- **Auth:** `GITEA_TOKEN` (header `Authorization: token $GITEA_TOKEN`).
- **Audience:** superdev **adopters** (people installing/using the plugin) first; **maintainers** second.
- **Language:** English.

## Outline (living skeleton — `/plan` and `/document` fill and extend it)

- **Overview** — what superdev is + the plan→implement loop (adopter-facing).
- **Concepts** — slice store, code host, documentation convention, knowledge base, verification.
- **Design notes / PRD summaries** — one page per significant feature.
- **ADR summaries** — human-readable digests of `docs/adr/` decisions.
- **Guides** — install, configure a backend, cut a release.

## REST conventions

- **Create/update a page:** `POST /api/v1/repos/bomret/superdev/wiki/new` with
  `{ "title": "...", "content_base64": "<base64 markdown>", "message": "..." }`; update with
  `PATCH /api/v1/repos/bomret/superdev/wiki/page/<pageName>`.
- **Find an existing page:** `GET /api/v1/repos/bomret/superdev/wiki/pages` (don't duplicate — update).
- If the token is missing or the Wiki unit is disabled, **skip publishing, note it**, and leave the
  in-repo docs as the record — do not fail.

Human-consumption first: shape pages around the audience, write in English, follow the outline above.
