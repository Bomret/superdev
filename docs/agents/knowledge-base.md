# Knowledge base: Codeberg Wiki (Forgejo)

Durable, **human-first** reader-facing docs (feature specifications, design overviews, ADR summaries) live in the
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
- **Concepts** — slice store, code host, documentation convention, knowledge base, toolchain, verification.
- **Feature specifications / design notes** — one page per significant feature.
- **ADR summaries** — human-readable digests of `docs/adr/` decisions.
- **Guides** — install, configure a backend, cut a release.

## Staging

This is a **remote** backend, so nothing but `/superdev:publish-kb` calls it (ADR 0023). `/superdev:plan`
and `/superdev:document` write each page as a **staged page** under `.superdev/kb-pending/<scope>/` —
YAML frontmatter carrying the page `title` and an `action` of `upsert` or `delete`, the page body below.
The REST conventions below are what `/superdev:publish-kb` applies when a human runs it, once the feature
has reached the adopters this wiki is written for.

## REST conventions

- **Create/update a page:** `POST /api/v1/repos/bomret/superdev/wiki/new` with
  `{ "title": "...", "content_base64": "<base64 markdown>", "message": "..." }`; update with
  `PATCH /api/v1/repos/bomret/superdev/wiki/page/<pageName>`.
- **Always send `title` on the `PATCH`, even when the title is unchanged.** Forgejo treats an omitted
  `title` as a rename to `unnamed` rather than as "leave it alone", so a titleless update destroys the
  page it meant to edit: the page vanishes from `/wiki/pages` under its own name, and a second titleless
  `PATCH` overwrites the same `unnamed` slot, taking the first page's content with it. The wiki's git
  history (`https://codeberg.org/bomret/superdev.wiki.git`) is what recovers a page lost this way.
- **Find an existing page:** `GET /api/v1/repos/bomret/superdev/wiki/pages` (don't duplicate — update).
- If the token is missing or the Wiki unit is disabled, `/superdev:publish-kb` **leaves every page
  staged**, reports why, and deletes nothing — a later run retries exactly the pages that did not land.
  The in-repo docs are the record meanwhile. Do not fail.

Human-consumption first: shape pages around the audience, write in English, follow the outline above.
