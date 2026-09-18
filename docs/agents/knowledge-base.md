# Knowledge base: Codeberg Wiki (Forgejo)

Durable, **human-first** reader-facing docs (feature specifications, design overviews, ADR summaries) live in the
Codeberg repo **Wiki** for `bomret/superdev`. Distinct from the agent-first in-repo `AGENTS.md` docs.

## Configuration

- **Backend:** Codeberg repo Wiki. **The Wiki unit is enabled** on the repo (`has_wiki: true`). When it is
  ever disabled, re-enable it with `PATCH /api/v1/repos/bomret/superdev { "has_wiki": true }` using the
  `GITEA_TOKEN`.
- **Auth:** `GITEA_TOKEN` (header `Authorization: token $GITEA_TOKEN`).
- **Audience:** superdev **adopters** (the people who install and use the plugin) first, then
  **maintainers**.
- **Language:** English.

## Outline

This outline is a living skeleton. `/plan` and `/document` fill and extend it.

- **Overview.** What superdev is, and the plan and implement loop (adopter-facing).
- **Concepts.** Slice store, code host, documentation convention, knowledge base, toolchain,
  verification. `(aggregate)`: one `## <concept>` section per concept, contributed by the scope that built it.
- **Feature specifications and design notes.** One page per significant feature.
- **ADR summaries.** Human-readable digests of `docs/adr/` decisions. `(aggregate)`: one `## NNNN —
  title` section per decision.
- **Guides.** Install, configure a backend, cut a release.

An `(aggregate)` page is staged one section at a time (`action: patch`) and merged into the live page
by that section's heading. Every other page is staged whole (ADR 0027).

## Staging

This is a **remote** backend, so nothing but `/superdev:publish-kb` calls it (ADR 0023). `/superdev:plan`
and `/superdev:document` write each page as a **staged page** under `.superdev/kb-pending/<scope>/`. Each
carries YAML frontmatter with the page `title` and an `action` of `upsert`, `patch`, or `delete`, and the
page body below. The REST conventions below are what `/superdev:publish-kb` applies when a human runs it,
once the feature has reached the adopters this wiki is written for.

## REST conventions

- **Create or update a page:** `POST /api/v1/repos/bomret/superdev/wiki/new` with
  `{ "title": "...", "content_base64": "<base64 markdown>", "message": "..." }`. Update with
  `PATCH /api/v1/repos/bomret/superdev/wiki/page/<sub_url>`, using the same `sub_url` the find call below
  returns for that title. It is not the title slugged by hand (see below).
- **Always send `title` on the `PATCH`, even when the title is unchanged.** Forgejo treats an omitted
  `title` as a rename to `unnamed` rather than as "leave it alone". A titleless update therefore destroys
  the page it meant to edit. The page vanishes from `/wiki/pages` under its own name, and a second
  titleless `PATCH` overwrites the same `unnamed` slot, taking the first page's content with it. The
  wiki's git history (`https://codeberg.org/bomret/superdev.wiki.git`) is what recovers a page lost this
  way.
- **Find an existing page:** `GET /api/v1/repos/bomret/superdev/wiki/pages`. It returns metadata only
  (`title`, `html_url`, `sub_url`, `last_commit`), and **no body**.
- **Read a page's body:** `GET /api/v1/repos/bomret/superdev/wiki/page/<sub_url>` returns
  `content_base64`, which decodes to the page markdown. `<sub_url>` is not the title slugged by hand. A
  title's `sub_url` diverges in ways a slugger cannot guess: `ADR 0023: The knowledge-base publish is
  its own command` becomes `ADR+0023%3A+The-knowledge-base-publish-is-its-own-command.-`. Get it from the
  find call's matching entry. **The page is absent** only when the find call does not list the title.
  That is the only outcome `/superdev:publish-kb` §4 treats as positive absence (ADR 0027). This call
  itself returning **404** for a title the find call does list is not absence. The identifier only exists
  because the find call listed it. A 404 there means the identifier is stale, or the page was renamed
  between the two calls, so `/superdev:publish-kb` treats it as a read failure instead.
- If the token is missing or the Wiki unit is disabled, `/superdev:publish-kb` **leaves every page
  staged**, reports why, and deletes nothing. A later run retries exactly the pages that did not land.
  The in-repo docs are the record meanwhile. Do not fail.

## Commands

The **backend command contract** (ADR 0069) `scripts/publish-kb.js` runs. `find` lists every wiki page
and filters by title, emitting the matching entry's `sub_url`; `read`, `update`, and `delete` take
`$SUPERDEV_KB_SUB_URL` from it. `update` always sends `title`, even when it is unchanged — an omitted
`title` is the hazard the REST conventions above name: Forgejo reads it as a rename to `unnamed` and
destroys the page. `find` maps `jq -e`'s exit 1 (a genuine no-match) to exit 3, the only outcome
`scripts/publish-kb.js` reads as positive absence; any other `jq` exit — a parse error, a usage
error — maps to exit 2, "could not answer," so a page never gets created from a listing `jq` failed to
read. The listing itself is capped at `limit=50`, Forgejo's own `max_response_items` ceiling
(`https://forgejo.org/docs/latest/user/api/usage/`); a listing that returns exactly that many entries
without finding the title also answers exit 2, since the title could sit on a page this call never
fetched.

### find

```sh
pages=$(curl -sf -H "Authorization: token $GITEA_TOKEN" \
  "https://codeberg.org/api/v1/repos/bomret/superdev/wiki/pages?limit=50") || exit 2
count=$(printf '%s' "$pages" | jq 'length') || exit 2
page=$(printf '%s' "$pages" | jq -e --arg title "$SUPERDEV_KB_TITLE" '[.[] | select(.title == $title)][0]')
status=$?
if [ "$status" -eq 1 ]; then
  [ "$count" -ge 50 ] && exit 2
  exit 3
fi
[ "$status" -ne 0 ] && exit 2
printf '%s' "$page" | jq -c '{sub_url}'
```

### read

```sh
curl -sf -H "Authorization: token $GITEA_TOKEN" \
  "https://codeberg.org/api/v1/repos/bomret/superdev/wiki/page/$SUPERDEV_KB_SUB_URL" \
  | jq -r '.content_base64' | base64 -d
```

### create

```sh
content_base64=$(base64 < "$SUPERDEV_KB_BODY_FILE" | tr -d '\n')
body=$(jq -n --arg title "$SUPERDEV_KB_TITLE" --arg content "$content_base64" \
  '{title: $title, content_base64: $content, message: "superdev: publish"}')
curl -sf -H "Authorization: token $GITEA_TOKEN" -H "Content-Type: application/json" \
  -X POST "https://codeberg.org/api/v1/repos/bomret/superdev/wiki/new" -d "$body" >/dev/null
```

### update

```sh
content_base64=$(base64 < "$SUPERDEV_KB_BODY_FILE" | tr -d '\n')
body=$(jq -n --arg title "$SUPERDEV_KB_TITLE" --arg content "$content_base64" \
  '{title: $title, content_base64: $content, message: "superdev: publish"}')
curl -sf -H "Authorization: token $GITEA_TOKEN" -H "Content-Type: application/json" \
  -X PATCH "https://codeberg.org/api/v1/repos/bomret/superdev/wiki/page/$SUPERDEV_KB_SUB_URL" -d "$body" >/dev/null
```

### delete

```sh
curl -sf -H "Authorization: token $GITEA_TOKEN" \
  -X DELETE "https://codeberg.org/api/v1/repos/bomret/superdev/wiki/page/$SUPERDEV_KB_SUB_URL" >/dev/null
```

Human-consumption first: shape pages around the audience, write in English, follow the outline above.
