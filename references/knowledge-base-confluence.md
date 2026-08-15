# Knowledge base: Confluence

An external knowledge base for durable, human-facing docs (feature specifications, design overviews, ADR summaries),
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

**`(aggregate)` marks a page many scopes contribute to** — an index, a changelog, an ADR-summaries
digest. `/superdev:document` stages one **section** for such a page (`action: patch`) rather than the
whole page, and `/superdev:publish-kb` merges that section into the live page by its heading. Without the
marker the doc pass stages an `upsert`, which replaces the page wholesale and drops every section written
by a scope it cannot see (ADR 0027). `/superdev:setup` asks which outline pages aggregate; a page no
scope but its own contributes to carries no marker.

**A non-markdown backend marks nothing `aggregate`, and so needs no body read.** `scripts/kb-patch.js`
merges by matching markdown ATX headings, and Confluence stores a page as `storage` — XHTML
(`body.representation: storage` below), not markdown. `action: patch` sent as-is finds no heading to match
and appends its markdown section, unrendered, to the end of the XHTML body on every publish. ADR 0027
requires a documented body read for any outline entry marked `(aggregate)`; this seed carries none,
because none is needed while pages stay XHTML storage. Mark no outline entry `aggregate` here until a
markdown conversion is named and a matching read documented.

## Configuration (fill in at setup)

- **Base URL**: `<https://your-domain.atlassian.net/wiki>`
- **Space key**: `<SPACE>`
- **Auth**: API token in env var `<CONFLUENCE_API_TOKEN>`, user email in `<CONFLUENCE_EMAIL>`. Record
  the env-var NAMES only, never the secrets.
- **What to publish**: `<feature specifications + ADR summaries>` — durable, reader-facing docs only, not every `AGENTS.md`.
- **Parent page** (optional): `<page id or title under which superdev pages are created>`.

## Staging

Confluence is a **remote** backend, so nothing but `/superdev:publish-kb` calls it (ADR 0023).
`/superdev:plan` and `/superdev:document` write each page as a **staged page** under
`.superdev/kb-pending/<scope>/` — YAML frontmatter carrying the page `title` and an `action` of `upsert`,
`patch`, or `delete`, the page body below. A page reaches the space when a human runs `/superdev:publish-kb`,
after the feature has reached the readers this space is written for.

## REST conventions (curl, Confluence Cloud v2)

What `/superdev:publish-kb` applies. Auth: `-u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN"`,
`-H "Content-Type: application/json"`.

- **Create a page**: `POST <base>/api/v2/pages` with
  `{ "spaceId": "<id>", "title": "<title>", "parentId": "<optional>",
     "body": { "representation": "storage", "value": "<HTML storage format>" } }`.
- **Find a page** (update, don't duplicate): `GET <base>/api/v2/pages?title=<title>&space-id=<id>`,
  with `<title>` URL-encoded. The title is the sole page-identity key, so an unencoded `&` or space in it
  breaks the query and this step finds nothing — the exact condition that leads §4 to create a duplicate.
- **Update a page**: `PUT <base>/api/v2/pages/<id>` with the new body and incremented `version.number`.
- **Delete a page** (an `action: delete` staged page): `DELETE <base>/api/v2/pages/<id>`. Already absent
  is the intended end state, not a failure.

## superdev usage

- `/superdev:plan` — seeds the in-repo feature specification/ADRs into the outline and stages their pages.
- `/superdev:document` — reconciles and extends the KB (via its doc-writer) and stages the pages it
  changed, after a scope lands and on demand.
- `/superdev:publish-kb` — sends the staged pages to the space. The only command that calls Confluence.

## Degrade / switching

No token or unreachable → `/superdev:publish-kb` leaves every page staged, reports why, and deletes
nothing; a later run retries exactly the pages that did not land. The in-repo docs are the record
meanwhile. To move to a different wiki later, re-run `/superdev:setup` and pick a different knowledge
base.
