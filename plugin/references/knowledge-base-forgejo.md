# Knowledge base: Forgejo repository wiki

Durable, human-facing docs (guides, topic pages, concepts) published to the wiki of a Forgejo
repository, reached through the `tea` CLI only. In-repo docs (`docs/agents/documentation.md`) remain the
source of truth; the wiki is a published view. Gitea shares the wiki API this seed calls, but this seed is
untested against Gitea.

## Configuration

- **Backend:** Forgejo repository wiki, `<owner>/<repo>` on `<host>`. `<host>` is the base URL in the form
  `tea login list` reports, scheme included and no trailing slash, such as `https://codeberg.org`.
- **The wiki unit is enabled** on the repository (`has_wiki: true`). When it is ever disabled, re-enable it
  with `tea api --login <login> --repo <owner>/<repo> -X PATCH -F has_wiki=true /repos/<owner>/<repo>`,
  where `<login>` is the login resolved below.
- **Auth:** the `tea` CLI's stored login for `<host>`. The login is resolved, never stored: it is the one
  `tea login list -o json` entry whose `url` is `<host>`, and every call passes its `name` as `--login`,
  because outside the repository's checkout `tea` otherwise falls back to another stored login. No `tea` on
  the path, no matching login, or two or more matching logins stops the step: each template below answers
  exit 2, "could not answer", and `/superdev:publish-kb` leaves the page staged. The optional key
  `knowledge-base.teaLogin` of the operator configuration (`.superdev/info.json`, which each command reads
  as `.operator.teaLogin` from its values file) names one of several matching logins: set and naming
  exactly one entry whose `url` is `<host>`, that login is used; set and naming none, the step stops with
  exit 2 and lists the matching names. No token environment variable is read.
- **Hierarchy:** links. A Forgejo wiki nests no pages. Each child page links from a list item in its
  parent's body, and `/superdev:publish-kb` writes that link.

## Audience, language & outline

The wiki is **human-consumption first**. Recorded at setup:

- **Audience(s):** `<end-users | internal developers | ops/support | stakeholders | …>`
- **Language:** `<e.g. English | German>`. All wiki prose is written in this language.

- **Decisions:** stay in the repository's ADRs. The knowledge base carries no ADR digest and no ADR
  summaries.

## Outline

A living skeleton. `/superdev:document` extends it. The entries below are examples: setup replaces them
with the repository's own topics, each named by its exact title.

- **`Home`.** The root page, with no parent. Hand-written. Each section below holds one link list that
  `/superdev:publish-kb` maintains.
- **`Guide: Getting started`.** One task a reader does, step by step. Parent: `Home`, section `Guides`.
- **`Architecture`.** One subject a reader looks up: how the parts fit together and why. Parent: `Home`,
  section `Topics`.
- **`Configuration`.** One subject a reader looks up: every setting, what it changes, and when to use it.
  Parent: `Home`, section `Topics`.
- **`Concepts`.** `(aggregate)`: one `##` section per term, contributed by the scope that built it.
  Parent: `Home`, section `Concepts`.

**Every outline entry names a topic page**. An entry gives one page's exact title,
and the page holds one subject a reader looks up, such as `Architecture` or `Configuration`. An entry holding a placeholder (`<...>`)
names no page, and the doc pass writes no page under it. `/superdev:document`'s doc pass extends the topic page a change touches. Only when no topic fits does it
add one explicit entry here, in the scope's doc commit, with its reason. A page per feature is no entry.

**Create the root page first.** A child published before its root lands, but stays staged as not linked,
because its parent has no page to carry the link yet.

**`(aggregate)` marks a page many scopes contribute to.** Such a page is staged one section at a time
(`action: patch`) and merged into the live page by that section's heading. Every other page is staged
whole.

**Links.** A parent's link line has the form `- [<title>](<host>/<owner>/<repo>/wiki/{sub_url}): <one line>`.
`<title>` is the child's full title. `{sub_url}` is written literally. The doc-writer writes the whole line,
placeholder included, and `/superdev:publish-kb` replaces `{sub_url}` with the value the find call returns
for the child once the child has landed. That value is not the title slugged by hand (see Wiki API
conventions). `/superdev:publish-kb` then places the line after the last top-level list item of the named
section's own content, or below the heading as its first list item when that content holds none yet.

## Staging

This is a **remote** backend, so nothing but `/superdev:publish-kb` calls it.
The doc pass writes each page as a **staged page**: `/superdev:document` runs it, and on the `lite` tier
`/superdev:implement` runs it inline first. Each page is staged under `.superdev/kb-pending/<scope>/` in the
main working tree, resolved by `scope.js staging <scope>`. Each carries YAML frontmatter with
the page `title` and an `action` of `upsert`, `patch`, or `delete`, and the page body below. A page reaches
the wiki when a human runs `/superdev:publish-kb`, after the feature has reached the readers this wiki is
written for.

## Wiki API conventions

Every call is `tea api --login <login> --repo <owner>/<repo>`. Add `-i` to every call whose answer decides
anything: `tea api` exits 0 on an HTTP 4xx or 5xx, and `-i` writes the status line to stderr. `tea wiki` is
not used: it reads a disabled wiki's 404 as an empty listing.

- **Create or update a page:** `tea api -X POST -d @- /repos/<owner>/<repo>/wiki/new` with
  `{ "title": "...", "content_base64": "<base64 markdown>", "message": "..." }` on stdin. Update with
  `tea api -X PATCH -d @- /repos/<owner>/<repo>/wiki/page/<sub_url>`, using the `sub_url` the find call
  returns for that title.
- **Always send `title` on the `PATCH`, even when the title is unchanged.** Forgejo treats an omitted
  `title` as a rename to `unnamed`. A titleless update therefore destroys the page it meant to edit, and a
  second titleless `PATCH` overwrites the same `unnamed` slot. The wiki's git history recovers a page lost
  this way.
- **Find an existing page:** `tea api '/repos/<owner>/<repo>/wiki/pages?page=<p>&limit=50'`, paged until a
  page returns fewer than 50 entries. It returns metadata only (`title`, `html_url`, `sub_url`,
  `last_commit`), and no body.
- **`sub_url` comes from the listing, never from the title slugged by hand.** A title's `sub_url` diverges
  in ways a slugger cannot guess (`ADR 0023: The knowledge-base publish is its own command` becomes
  `ADR+0023%3A+The-knowledge-base-publish-is-its-own-command.-`).
- **Read a page's body:** `tea api /repos/<owner>/<repo>/wiki/page/<sub_url>` returns `content_base64`,
  which decodes to the page markdown. A 404 there, for a title the find call listed, is a read failure,
  never absence.
- **An enabled empty wiki answers the listing with 404.** Forgejo answers the first listing page 404 also
  when the wiki is enabled and holds no pages yet (observed 2026-10-22 on Codeberg, `bomret/open-settlers`:
  listing 404 "no such file or directory", repository `has_wiki: true`, `external_wiki: null`). A 404 first
  page is therefore followed by a repository read, `tea api -i /repos/<owner>/<repo>`. The title is absent
  only when that read answers 200 with `has_wiki: true` and `external_wiki: null`. `has_wiki: false` is a
  disabled wiki. A non-null `external_wiki` is an external wiki: Forgejo sets `has_wiki: true` for an
  external-only wiki too, so `has_wiki` alone does not confirm an internal one. Either one, or a failed
  repository read, could not answer.

## Commands

The **backend command contract** `scripts/publish-kb.js` runs. Each command runs as
`sh -c <template> sh <path>`: `$1` names a JSON file holding `title`, `bodyFile` (`create` and `update`),
the `find` result's fields under `found` (`read`, `update`, and `delete`), and the `knowledge-base`
section of `.superdev/info.json` under `operator`. Every command reads its values from that
file with `jq`. `find` lists every wiki page and filters by title, emitting the matching entry's
`sub_url`; `read`, `update`, and `delete` take `.found.sub_url` from it, and `/superdev:publish-kb` fills a parent link's `{sub_url}` from it (ADR
0168). `update` always sends `title`, for the reason the wiki API conventions above state. `find` maps
`jq -e`'s exit 1 (a genuine no-match) to exit 3, the only outcome `scripts/publish-kb.js` reads as positive
absence; any other `jq` exit maps to exit 2, "could not answer". `find` reads page after page until one
holds the title, or until a page returns fewer than 50 entries, which ends the listing. A full listing,
every page answering 200, that lacks the title reads as absent. The empty-wiki rule above is the one other
absent outcome: a 404 first page, then a repository read that answers 200 with `has_wiki: true` and
`external_wiki: null`. A disabled wiki, an external wiki, or a failed repository read answers exit 2 with
its cause on stderr. Any other non-200 page answers exit 2, and so does a 404 on a page after the first,
with no repository read. Each call reads its status line, and a line it cannot read answers exit 2.

Every template opens with the same login line: `tea login list -o json` narrowed to the one entry whose
`url` is `<host>`, exit 2 on none, no `tea`, several, or a `knowledge-base.teaLogin` naming none of them,
after writing the cause and the `tea login add --url <host>` command to stderr, which `publish-kb.js`
appends to the failure reason it reports. `create` and `update` map a non-2xx answer to exit 1.

Every command below runs under a **30-second bound**, or whatever
`knowledge-base.timeoutMs` of `.superdev/info.json` names. `scripts/publish-kb.js` applies it at the spawn. A command killed at
the bound leaves its page staged and **stops the run**: the remaining pages are reported untried and stay
staged for the next one.

### find

```sh
want=$(jq -r '.operator.teaLogin // ""' "$1") || exit 2
logins=$(tea login list -o json 2>/dev/null) || { echo "superdev: tea is missing or cannot list logins; install it, then run: tea login add --url <host>" >&2; exit 2; }
login=$(printf '%s' "$logins" | jq -er --arg want "$want" '[.[] | select(.url == "<host>")] | if $want != "" then map(select(.name == $want)) else . end | if length == 1 then .[0].name else empty end' 2>/dev/null) || { names=$(printf '%s' "$logins" | jq -r '[.[] | select(.url == "<host>") | .name] | join(", ")' 2>/dev/null); n=$(printf '%s' "$logins" | jq '[.[] | select(.url == "<host>")] | length' 2>/dev/null); if [ -n "$want" ] && [ "$n" -ge 1 ] 2>/dev/null; then echo "superdev: knowledge-base.teaLogin=$want names none of the tea logins for <host> ($names)" >&2; elif [ "$n" -gt 1 ] 2>/dev/null; then echo "superdev: several tea logins match <host> ($names); set knowledge-base.teaLogin in .superdev/info.json to pick one, or add the right one: tea login add --url <host>" >&2; else echo "superdev: no tea login for <host>; run: tea login add --url <host>" >&2; fi; exit 2; }
p=1
while :; do
  hdr=$(mktemp) || exit 2
  pages=$(tea api --login "$login" --repo <owner>/<repo> -i \
    "/repos/<owner>/<repo>/wiki/pages?page=$p&limit=50" 2>"$hdr") || { rm -f "$hdr"; exit 2; }
  code=$(head -1 "$hdr" | cut -d' ' -f2); rm -f "$hdr"
  if [ "$code" = 404 ] && [ "$p" = 1 ]; then
    hdr=$(mktemp) || exit 2
    repo=$(tea api --login "$login" --repo <owner>/<repo> -i /repos/<owner>/<repo> 2>"$hdr") || { rm -f "$hdr"; echo "superdev: wiki listing answered 404 and the repository read failed" >&2; exit 2; }
    code=$(head -1 "$hdr" | cut -d' ' -f2); rm -f "$hdr"
    [ "$code" = 200 ] || { echo "superdev: wiki listing answered 404 and the repository read failed (status: ${code:-unreadable})" >&2; exit 2; }
    wiki=$(printf '%s' "$repo" | jq -er 'if .has_wiki == false then "disabled" elif .has_wiki == true and .external_wiki == null then "internal" elif .has_wiki == true then "external" else error("no has_wiki") end' 2>/dev/null) || { echo "superdev: wiki listing answered 404 and the repository read failed (unparseable body)" >&2; exit 2; }
    case "$wiki" in
      internal) exit 3 ;;
      disabled) echo "superdev: the wiki is disabled on <owner>/<repo>; re-enable it: tea api --login $login --repo <owner>/<repo> -X PATCH -F has_wiki=true /repos/<owner>/<repo>" >&2; exit 2 ;;
      *) echo "superdev: <owner>/<repo> uses an external wiki, which the wiki API cannot reach" >&2; exit 2 ;;
    esac
  fi
  [ "$code" = 200 ] || exit 2
  count=$(printf '%s' "$pages" | jq 'length') || exit 2
  page=$(printf '%s' "$pages" | jq -e --slurpfile in "$1" '[.[] | select(.title == $in[0].title)][0]')
  status=$?
  [ "$status" -eq 0 ] && { printf '%s' "$page" | jq -c '{sub_url}'; exit 0; }
  [ "$status" -eq 1 ] || exit 2
  [ "$count" -lt 50 ] && exit 3
  p=$((p + 1))
done
```

### read

```sh
want=$(jq -r '.operator.teaLogin // ""' "$1") || exit 2
logins=$(tea login list -o json 2>/dev/null) || { echo "superdev: tea is missing or cannot list logins; install it, then run: tea login add --url <host>" >&2; exit 2; }
login=$(printf '%s' "$logins" | jq -er --arg want "$want" '[.[] | select(.url == "<host>")] | if $want != "" then map(select(.name == $want)) else . end | if length == 1 then .[0].name else empty end' 2>/dev/null) || { names=$(printf '%s' "$logins" | jq -r '[.[] | select(.url == "<host>") | .name] | join(", ")' 2>/dev/null); n=$(printf '%s' "$logins" | jq '[.[] | select(.url == "<host>")] | length' 2>/dev/null); if [ -n "$want" ] && [ "$n" -ge 1 ] 2>/dev/null; then echo "superdev: knowledge-base.teaLogin=$want names none of the tea logins for <host> ($names)" >&2; elif [ "$n" -gt 1 ] 2>/dev/null; then echo "superdev: several tea logins match <host> ($names); set knowledge-base.teaLogin in .superdev/info.json to pick one, or add the right one: tea login add --url <host>" >&2; else echo "superdev: no tea login for <host>; run: tea login add --url <host>" >&2; fi; exit 2; }
sub_url=$(jq -er '.found.sub_url' "$1") || exit 1
hdr=$(mktemp) || exit 1
page=$(tea api --login "$login" --repo <owner>/<repo> -i \
  "/repos/<owner>/<repo>/wiki/page/$sub_url" 2>"$hdr") || { rm -f "$hdr"; exit 1; }
code=$(head -1 "$hdr" | cut -d' ' -f2); rm -f "$hdr"
[ "$code" = 200 ] || exit 1
printf '%s' "$page" | jq -j '.content_base64' | base64 -d
```

### create

```sh
want=$(jq -r '.operator.teaLogin // ""' "$1") || exit 2
logins=$(tea login list -o json 2>/dev/null) || { echo "superdev: tea is missing or cannot list logins; install it, then run: tea login add --url <host>" >&2; exit 2; }
login=$(printf '%s' "$logins" | jq -er --arg want "$want" '[.[] | select(.url == "<host>")] | if $want != "" then map(select(.name == $want)) else . end | if length == 1 then .[0].name else empty end' 2>/dev/null) || { names=$(printf '%s' "$logins" | jq -r '[.[] | select(.url == "<host>") | .name] | join(", ")' 2>/dev/null); n=$(printf '%s' "$logins" | jq '[.[] | select(.url == "<host>")] | length' 2>/dev/null); if [ -n "$want" ] && [ "$n" -ge 1 ] 2>/dev/null; then echo "superdev: knowledge-base.teaLogin=$want names none of the tea logins for <host> ($names)" >&2; elif [ "$n" -gt 1 ] 2>/dev/null; then echo "superdev: several tea logins match <host> ($names); set knowledge-base.teaLogin in .superdev/info.json to pick one, or add the right one: tea login add --url <host>" >&2; else echo "superdev: no tea login for <host>; run: tea login add --url <host>" >&2; fi; exit 2; }
content_base64=$(base64 < "$(jq -er '.bodyFile' "$1")" | tr -d '\n')
body=$(jq --arg content "$content_base64" \
  '{title, content_base64: $content, message: "superdev: publish"}' "$1")
hdr=$(mktemp) || exit 1
printf '%s' "$body" | tea api --login "$login" --repo <owner>/<repo> -i -X POST -d @- \
  /repos/<owner>/<repo>/wiki/new >/dev/null 2>"$hdr" || { rm -f "$hdr"; exit 1; }
code=$(head -1 "$hdr" | cut -d' ' -f2); rm -f "$hdr"
case "$code" in 2??) ;; *) exit 1 ;; esac
```

### update

```sh
want=$(jq -r '.operator.teaLogin // ""' "$1") || exit 2
logins=$(tea login list -o json 2>/dev/null) || { echo "superdev: tea is missing or cannot list logins; install it, then run: tea login add --url <host>" >&2; exit 2; }
login=$(printf '%s' "$logins" | jq -er --arg want "$want" '[.[] | select(.url == "<host>")] | if $want != "" then map(select(.name == $want)) else . end | if length == 1 then .[0].name else empty end' 2>/dev/null) || { names=$(printf '%s' "$logins" | jq -r '[.[] | select(.url == "<host>") | .name] | join(", ")' 2>/dev/null); n=$(printf '%s' "$logins" | jq '[.[] | select(.url == "<host>")] | length' 2>/dev/null); if [ -n "$want" ] && [ "$n" -ge 1 ] 2>/dev/null; then echo "superdev: knowledge-base.teaLogin=$want names none of the tea logins for <host> ($names)" >&2; elif [ "$n" -gt 1 ] 2>/dev/null; then echo "superdev: several tea logins match <host> ($names); set knowledge-base.teaLogin in .superdev/info.json to pick one, or add the right one: tea login add --url <host>" >&2; else echo "superdev: no tea login for <host>; run: tea login add --url <host>" >&2; fi; exit 2; }
sub_url=$(jq -er '.found.sub_url' "$1") || exit 1
content_base64=$(base64 < "$(jq -er '.bodyFile' "$1")" | tr -d '\n')
body=$(jq --arg content "$content_base64" \
  '{title, content_base64: $content, message: "superdev: publish"}' "$1")
hdr=$(mktemp) || exit 1
printf '%s' "$body" | tea api --login "$login" --repo <owner>/<repo> -i -X PATCH -d @- \
  "/repos/<owner>/<repo>/wiki/page/$sub_url" >/dev/null 2>"$hdr" || { rm -f "$hdr"; exit 1; }
code=$(head -1 "$hdr" | cut -d' ' -f2); rm -f "$hdr"
case "$code" in 2??) ;; *) exit 1 ;; esac
```

### delete

```sh
want=$(jq -r '.operator.teaLogin // ""' "$1") || exit 2
logins=$(tea login list -o json 2>/dev/null) || { echo "superdev: tea is missing or cannot list logins; install it, then run: tea login add --url <host>" >&2; exit 2; }
login=$(printf '%s' "$logins" | jq -er --arg want "$want" '[.[] | select(.url == "<host>")] | if $want != "" then map(select(.name == $want)) else . end | if length == 1 then .[0].name else empty end' 2>/dev/null) || { names=$(printf '%s' "$logins" | jq -r '[.[] | select(.url == "<host>") | .name] | join(", ")' 2>/dev/null); n=$(printf '%s' "$logins" | jq '[.[] | select(.url == "<host>")] | length' 2>/dev/null); if [ -n "$want" ] && [ "$n" -ge 1 ] 2>/dev/null; then echo "superdev: knowledge-base.teaLogin=$want names none of the tea logins for <host> ($names)" >&2; elif [ "$n" -gt 1 ] 2>/dev/null; then echo "superdev: several tea logins match <host> ($names); set knowledge-base.teaLogin in .superdev/info.json to pick one, or add the right one: tea login add --url <host>" >&2; else echo "superdev: no tea login for <host>; run: tea login add --url <host>" >&2; fi; exit 2; }
sub_url=$(jq -er '.found.sub_url' "$1") || exit 1
hdr=$(mktemp) || exit 1
tea api --login "$login" --repo <owner>/<repo> -i -X DELETE \
  "/repos/<owner>/<repo>/wiki/page/$sub_url" >/dev/null 2>"$hdr" || { rm -f "$hdr"; exit 1; }
code=$(head -1 "$hdr" | cut -d' ' -f2); rm -f "$hdr"
case "$code" in 2??) ;; *) exit 1 ;; esac
```

## superdev usage

- `/superdev:document` reconciles and extends the wiki's topic pages through its doc-writer, and stages
  the pages it changed.
- `/superdev:implement` runs the same doc pass inline first on the `lite` tier, and stages the pages it
  changed; `/superdev:document`'s doc-writer then extends them.
- `/superdev:publish-kb` sends the staged pages to the wiki. The only command that calls it.

## Degrade / switching

No `tea`, no login for `<host>`, or a disabled or external wiki → `/superdev:publish-kb` leaves every page
staged, reports why, and deletes nothing; a later run retries exactly the pages that did not land. The
in-repo docs are the record meanwhile. To move to a different knowledge base later, re-run
`/superdev:setup` and pick a different one.
