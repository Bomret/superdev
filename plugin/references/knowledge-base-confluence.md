# Knowledge base: Confluence

An external knowledge base for durable, human-facing docs (feature specifications, design overviews),
published to a Confluence space. In-repo docs (`docs/agents/documentation.md`) remain the source of
truth; the KB is a published view.

## Audience, language & outline

The KB is **human-consumption first**. Recorded at setup:

- **Audience(s):** `<end-users | internal developers | ops/support | stakeholders | …>`
- **Language:** `<e.g. English | German>` — all KB prose is written in this language.
- **Outline** (living skeleton; a top-level page per audience — `/superdev:document`
  fills and extends it):

  - `<Audience A — e.g. User Guide>` → `<topic>` → `<subtopic>`, `<subtopic>`
  - `<Audience B — e.g. Developer Docs>` → `Architecture` → `<subtopic>`
  - `<Audience B — e.g. Developer Docs>` → `Setup`

  Each `→` nests one level deeper. `/superdev:publish-kb` creates a parent before its child.

**`(aggregate)` marks a page many scopes contribute to** — an index, a changelog, a
glossary. `/superdev:document` stages one **section** for such a page (`action: patch`) rather than the
whole page, and `/superdev:publish-kb` merges that section into the live page by its heading. Without the
marker the doc pass stages an `upsert`, which replaces the page wholesale and drops every section written
by a scope it cannot see (ADR 0027). `/superdev:setup` asks which outline pages aggregate; a page no
scope but its own contributes to carries no marker.

**A non-markdown backend marks nothing `aggregate`.** Confluence stores a page as `storage` — XHTML
(`body.representation: storage` below), not markdown. Staged pages stay markdown, and
`scripts/publish-kb.js` converts a whole staged page to `storage` itself before `create` and `update`
(`lib/md-to-storage.js`, ADR 0109). `scripts/kb-patch.js` merges a section by matching markdown ATX
headings in the live page, and a live XHTML page carries none, so a patch has nothing to merge into. Mark
no outline entry `aggregate` here.

## Configuration (fill in at setup)

- **Backend:** Confluence.
- **Body format:** storage. `scripts/publish-kb.js` reads this bullet and refuses an `action: patch`
  page outright — leaving it staged, with the reason reported per page — rather than merge markdown
  headings into XHTML (ADR 0027). Absent means markdown, which is why every markdown-backed seed
  carries no such bullet.
- **Base URL**: `<https://your-domain.atlassian.net/wiki>`
- **Space key**: `<SPACE>` (the CQL folder search takes it)
- **Space id**: `<space-id>` (the v2 API takes it)
- **Auth**: API token in env var `<CONFLUENCE_API_TOKEN>`, user email in `<CONFLUENCE_EMAIL>`. Record
  the env-var NAMES only, never the secrets.
- **What to publish**: `<feature specifications + design overviews>` — durable, reader-facing docs only, not every `AGENTS.md`.
  Decisions stay in the repository's ADRs: the knowledge base carries no ADR digest and no ADR summaries.
- **Parent page or folder** (optional): `<id of the page or folder under which superdev pages are created>` — the `<parent-id>`
  the `### create` template below falls back to for a page that names no parent of its own.

## Staging

Confluence is a **remote** backend, so nothing but `/superdev:publish-kb` calls it (ADR 0023).
`/superdev:document` writes each page as a **staged page** under
`.superdev/kb-pending/<scope>/` in the main working tree, resolved by `scope.js staging <scope>` (ADR 0119) — YAML frontmatter carrying the page `title` and an `action` of `upsert`
or `delete`, the page body below. A page the outline places under another page also carries
`parent: <that page's title>`. `scripts/publish-kb.js` resolves that title through `find` (a page, else a folder), publishes a
parent staged in the same batch first, and leaves the page staged when the parent cannot be found
(ADR 0109). A page reaches the space when a human runs `/superdev:publish-kb`,
after the feature has reached the readers this space is written for.

## REST conventions (curl, Confluence Cloud v2)

What `/superdev:publish-kb` applies. Auth: `-u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN"`,
`-H "Content-Type: application/json"`. curl 7.76 or later is the minimum (`--fail-with-body`). Titles, CQL, and
bodies reach curl on stdin (`--data-urlencode title@-`, `cql@-`, `--data-binary @-`) and jq through its
environment or stdin, so no non-ASCII text or temp-file path travels as an argument.

- **Create a page**: `POST <base>/api/v2/pages` with
  `{ "spaceId": "<id>", "title": "<title>", "parentId": "<optional>",
     "body": { "representation": "storage", "value": "<HTML storage format>" } }`.
- **Find a page** (update, don't duplicate): `GET <base>/api/v2/pages?title=<title>&space-id=<id>&status=current`,
  with `<title>` URL-encoded. The query also returns archived pages, which `status=current` drops, and matches the
  title case-insensitively, so `find` compares the title exactly itself. When no page answers, `find` searches
  folders: `GET <base>/rest/api/search?cql=<cql>` with `space="<SPACE>" and type=folder and title="<title>"`. The title is the sole page-identity key, so an unencoded `&` or space in it
  breaks the query and this step finds nothing — the exact condition that leads §4 to create a duplicate.
- **Check the identity** (before `find` answers absent): `GET <base>/rest/api/user/current`. Confluence
  reads a wrong token as the anonymous user and answers a query with `200` and empty `results`, not `401`.
  Only a response with `type` `known` makes an empty answer mean absence.
- **Read a page's live body**: `GET <base>/api/v2/pages/<id>?body-format=storage`. By default v2 returns
  no body at all; `body-format=storage` is what asks for it. The storage-format text sits at
  `body.storage.value` in the response.
- **Update a page**: `PUT <base>/api/v2/pages/<id>` with the new body and incremented `version.number`.
- **Delete a page** (an `action: delete` staged page): `DELETE <base>/api/v2/pages/<id>`. Already absent
  is the intended end state, not a failure.
- **Verified against Atlassian's published API docs, checked 2026-10-28; no live instance was
  checked.** The v2 OpenAPI document (`dac-static.atlassian.com/cloud/confluence/openapi-v2.v3.json`)
  describes `parentId` of `POST /pages` as "the parent content ID of the page", which the space homepage's
  ID replaces when it is absent and `root-level` is `false`. The v1 document
  (`dac-static.atlassian.com/cloud/confluence/swagger.v3.json`) lists `page` among a folder's descendant
  types, so a folder id is a parent content ID, and gives a `/rest/api/search` result a `content` object
  that carries the `title` and `id` `find` reads. The CQL field reference
  (`developer.atlassian.com/cloud/confluence/cql-fields/`) lists `folder` as a supported `type`. The folder
  parent, the `type=folder` search, and the `.content.title` shape are otherwise proven only against the
  test stub: verify them against your own space before relying on them. The anonymous answer to a wrong
  token, and `type` `known` from `/rest/api/user/current` for a valid one, were observed on a live
  Confluence Cloud instance on 2026-10-29.

## Commands

The **backend command contract** (ADR 0069) `scripts/publish-kb.js` runs. Each command runs as
`sh -c <template> sh <path>`: `$1` names a JSON file holding `title`, the `find` result's fields under
`found` (`read`, `update`, and `delete`, as `.found.id` and `.found.version`), and the `knowledge-base`
section of `.superdev/info.json` under `operator` (ADR 0207). Every command reads its values from that
file with `jq`. `create` and `update` also receive `bodyFile`, a path to the staged body already
converted to `storage` XHTML (the `Body format` bullet above), so the commands send it unchanged.
`create` also receives `parentId` when the staged page names a parent; a `create` template that never
reads it leaves such a page staged. Fill in `<base>`, `<SPACE>`, `<space-id>`, and `<parent-id>` at setup; an empty `<parent-id>` creates a page that
names no parent, which Confluence files under the space homepage (the `parentId` default of `POST
/api/v2/pages` while its `root-level` parameter is `false`). `read`
prints the live page's storage-format body on stdout, nothing else — the text `/superdev:document`
reconciles its prose against and hashes (ADR 0094), never JSON. `find` answers
exit 0 with a JSON object for a page (`id`, `version`) or a folder (`id`, `type: folder`, which reaches the later verbs as
`.found.type`, so `read`, `update`, and `delete` refuse a folder and name it). It answers exit 3 only for an empty page
answer followed by an empty folder search, read by a signed-in user, the only outcome `scripts/publish-kb.js` reads as positive absence. Every other
outcome answers exit 2, "could not answer": a failed request, a response with no `results` array, a response with a further
page, a title that matches only in another case, two or more exact matches, or an empty answer
read by anyone but a signed-in user. A page is never created from an answer `find`
could not read. `create` and `update` write Confluence's error body to stderr, which the publish report carries.

Every command below runs under a **30-second bound** (ADR 0130), or whatever
`knowledge-base.timeoutMs` of `.superdev/info.json` names. `scripts/publish-kb.js` applies it at the spawn, so a command
written here needs no `--max-time` of its own to be safe against a host that accepts the connection and
never answers. A command killed at the bound leaves its page staged and **stops the run**: the remaining
pages are reported untried and stay staged for the next one.

### find

The page query runs first and sends the title on stdin. Only an empty page answer reaches the folder
search, which sends its CQL on stdin as well. Only an empty folder answer reaches the identity check,
which answers absence only for a signed-in user.

```sh
resp=$(jq -j '.title' "$1" | curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  --get "<base>/api/v2/pages" \
  --data-urlencode title@- \
  --data-urlencode "space-id=<space-id>" \
  --data-urlencode "status=current" \
  --data-urlencode "limit=250") || exit 2
printf '%s' "$resp" | jq -e '(.results | type == "array") and ((._links.next // null) == null)' >/dev/null 2>&1 || exit 2
count=$(printf '%s' "$resp" | jq '.results | length') || exit 2
if [ "$count" -gt 0 ]; then
  page=$(printf '%s' "$resp" | jq -ce --slurpfile in "$1" '$in[0].title as $t | [.results[] | select(.title == $t)]
    | if length == 1 then .[0] | {id, version: .version.number} else empty end') || exit 2
  printf '%s\n' "$page"
  exit 0
fi
cql=$(jq -r '"space=\"<SPACE>\" and type=folder and title=" + (.title | @json)' "$1") || exit 2
resp=$(printf '%s' "$cql" | curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  --get "<base>/rest/api/search" \
  --data-urlencode cql@- \
  --data-urlencode "limit=200") || exit 2
printf '%s' "$resp" | jq -e '(.results | type == "array") and ((._links.next // null) == null)' >/dev/null 2>&1 || exit 2
count=$(printf '%s' "$resp" | jq '.results | length') || exit 2
if [ "$count" -eq 0 ]; then
  user=$(curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" "<base>/rest/api/user/current") || exit 2
  printf '%s' "$user" | jq -e '.type == "known"' >/dev/null 2>&1 || exit 2
  exit 3
fi
hit=$(printf '%s' "$resp" | jq -ce --slurpfile in "$1" '$in[0].title as $t | [.results[] | select(.content.title == $t)]
  | if length == 1 then .[0].content | {id, type: "folder"} else empty end') || exit 2
printf '%s\n' "$hit"
```

### read

```sh
[ "$(jq -r '.found.type // ""' "$1")" = folder ] && { printf '"%s" is a Confluence folder, not a page: rename the page or the folder\n' "$(jq -r '.title' "$1")" >&2; exit 1; }
id=$(jq -er '.found.id' "$1") || exit 2
resp=$(curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  --get "<base>/api/v2/pages/$id" --data-urlencode "body-format=storage") || exit 2
printf '%s' "$resp" | jq -ej '.body.storage.value' && echo
```

The storage XHTML `read` returns is stable across reads of an unchanged page, so `/superdev:publish-kb`'s
live-hash guard (ADR 0094) never refuses an upsert Confluence itself reformatted underneath it.

### create

```sh
body=$(jq -Rs --slurpfile in "$1" '{spaceId: "<space-id>", title: $in[0].title,
    body: {representation: "storage", value: .}}
  + (($in[0].parentId // "<parent-id>") as $parent | if $parent == "" then {} else {parentId: ($parent | tostring)} end)' < "$(jq -er '.bodyFile' "$1")") || exit 1
out=$(printf '%s' "$body" | curl -sS --fail-with-body -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  -H "Content-Type: application/json" -X POST "<base>/api/v2/pages" --data-binary @-) \
  || { printf '%s\n' "$out" >&2; exit 1; }
```

### update

```sh
[ "$(jq -r '.found.type // ""' "$1")" = folder ] && { printf '"%s" is a Confluence folder, not a page: rename the page or the folder\n' "$(jq -r '.title' "$1")" >&2; exit 1; }
id=$(jq -er '.found.id' "$1") || exit 1
body=$(jq -Rs --slurpfile in "$1" '{id: $in[0].found.id, status: "current",
    title: $in[0].title, version: {number: (($in[0].found.version | tonumber) + 1)},
    body: {representation: "storage", value: .}}' < "$(jq -er '.bodyFile' "$1")") || exit 1
out=$(printf '%s' "$body" | curl -sS --fail-with-body -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  -H "Content-Type: application/json" -X PUT "<base>/api/v2/pages/$id" --data-binary @-) \
  || { printf '%s\n' "$out" >&2; exit 1; }
```

### delete

```sh
[ "$(jq -r '.found.type // ""' "$1")" = folder ] && { printf '"%s" is a Confluence folder, not a page: rename the page or the folder\n' "$(jq -r '.title' "$1")" >&2; exit 1; }
id=$(jq -er '.found.id' "$1") || exit 1
curl -sf -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  -X DELETE "<base>/api/v2/pages/$id" >/dev/null
```

## superdev usage

- `/superdev:document` — reconciles and extends the KB (via its doc-writer) and stages the pages it
  changed, after a scope lands and on demand.
- `/superdev:publish-kb` — sends the staged pages to the space. The only command that calls Confluence.

## Degrade / switching

No token or unreachable → `/superdev:publish-kb` leaves every page staged, reports why, and deletes
nothing; a later run retries exactly the pages that did not land. The in-repo docs are the record
meanwhile. To move to a different wiki later, re-run `/superdev:setup` and pick a different knowledge
base.
