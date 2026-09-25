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

**A non-markdown backend marks nothing `aggregate`.** `scripts/kb-patch.js` merges by matching markdown
ATX headings, and Confluence stores a page as `storage` — XHTML (`body.representation: storage` below),
not markdown. `action: patch` sent as-is finds no heading to match and appends its markdown section,
unrendered, to the end of the XHTML body on every publish. Mark no outline entry `aggregate` here until a
markdown conversion is named, whatever `### read` template this seed carries below.

## Configuration (fill in at setup)

- **Backend:** Confluence.
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
- **Read a page's live body**: `GET <base>/api/v2/pages/<id>?body-format=storage`. By default v2 returns
  no body at all; `body-format=storage` is what asks for it. The storage-format text sits at
  `body.storage.value` in the response.
- **Update a page**: `PUT <base>/api/v2/pages/<id>` with the new body and incremented `version.number`.
- **Delete a page** (an `action: delete` staged page): `DELETE <base>/api/v2/pages/<id>`. Already absent
  is the intended end state, not a failure.

## Commands

The **backend command contract** (ADR 0069) `scripts/publish-kb.js` runs. `find`'s JSON keys reach
`read`, `update`, and `delete` as `SUPERDEV_KB_ID`/`SUPERDEV_KB_VERSION`; `create`/`update` also receive
`SUPERDEV_KB_BODY_FILE`, a path to the staged body. Fill in `<base>` and `<space-id>` at setup. `read`
prints the live page's storage-format body on stdout, nothing else — the text `/superdev:document`
reconciles its prose against and hashes (ADR 0094), never JSON. Confluence stores a page as XHTML
`storage`, not markdown, so no outline entry here may carry `(aggregate)` regardless (above). `find`
first checks that the response actually carries a `results` array — a
malformed 200 body with no such key (an error object, say) leaves `.results` reading `null` rather than
erroring, which would otherwise read exactly like a genuine empty match list — and answers exit 2 when it
does not. It then maps `jq -e`'s exit 1 (a genuine no-match) to exit 3, the only outcome
`scripts/publish-kb.js` reads as positive absence; any other `jq` exit — a parse error, a usage error —
maps to exit 2, "could not answer," so a page never gets created from a listing `jq` failed to read. The
listing is also capped at `limit=2`: a title is meant to be unique within a space, so two or more matches
mean the result cannot be trusted to hold the one canonical page, and `find` answers exit 2 rather than
picking `.results[0]` at random.

Every command below runs under a **30-second bound** (ADR 0076), or whatever
`SUPERDEV_PUBLISH_KB_TIMEOUT_MS` names. `scripts/publish-kb.js` applies it at the spawn, so a command
written here needs no `--max-time` of its own to be safe against a host that accepts the connection and
never answers. A command killed at the bound leaves its page staged and **stops the run**: the remaining
pages are reported untried and stay staged for the next one.

### find

```sh
resp=$(curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  --get "<base>/api/v2/pages" \
  --data-urlencode "title=$SUPERDEV_KB_TITLE" \
  --data-urlencode "space-id=<space-id>" \
  --data-urlencode "limit=2") || exit 2
printf '%s' "$resp" | jq -e '.results | type == "array"' >/dev/null 2>&1 || exit 2
count=$(printf '%s' "$resp" | jq '.results | length') || exit 2
[ "$count" -ge 2 ] && exit 2
page=$(printf '%s' "$resp" | jq -e '.results[0]')
status=$?
[ "$status" -eq 1 ] && exit 3
[ "$status" -ne 0 ] && exit 2
printf '%s' "$page" | jq -c '{id, version: (.version.number | tostring)}'
```

### read

```sh
resp=$(curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  --get "<base>/api/v2/pages/$SUPERDEV_KB_ID" --data-urlencode "body-format=storage") || exit 2
printf '%s' "$resp" | jq -er '.body.storage.value'
```

The storage XHTML `read` returns is stable across reads of an unchanged page, so `/superdev:publish-kb`'s
live-hash guard (ADR 0094) never refuses an upsert Confluence itself reformatted underneath it.

### create

```sh
body=$(jq -n --arg title "$SUPERDEV_KB_TITLE" --rawfile content "$SUPERDEV_KB_BODY_FILE" \
  '{spaceId: "<space-id>", title: $title, body: {representation: "storage", value: $content}}')
curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" -H "Content-Type: application/json" \
  -X POST "<base>/api/v2/pages" -d "$body" >/dev/null
```

### update

```sh
next_version=$((SUPERDEV_KB_VERSION + 1))
body=$(jq -n --arg title "$SUPERDEV_KB_TITLE" --arg id "$SUPERDEV_KB_ID" --argjson version "$next_version" \
  --rawfile content "$SUPERDEV_KB_BODY_FILE" \
  '{id: $id, status: "current", title: $title, version: {number: $version}, body: {representation: "storage", value: $content}}')
curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" -H "Content-Type: application/json" \
  -X PUT "<base>/api/v2/pages/$SUPERDEV_KB_ID" -d "$body" >/dev/null
```

### delete

```sh
curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  -X DELETE "<base>/api/v2/pages/$SUPERDEV_KB_ID" >/dev/null
```

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
