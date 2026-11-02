# Knowledge base: GitHub Wiki

Durable, **human-first** reader-facing docs (guides, mechanism pages, concepts) live in the
GitHub repo **Wiki** for `Bomret/superdev`. Distinct from the agent-first in-repo `AGENTS.md` docs.
In-repo docs (`docs/agents/documentation.md`) remain the source of truth; the wiki is a published view.

## Configuration

- **Backend:** GitHub repo Wiki, reached as the git repository `https://github.com/Bomret/superdev.wiki.git`.
  GitHub offers no wiki API, so every command clones that repository, changes one file, and pushes.
- **Auth:** the `gh` CLI's stored login. Every push passes `gh auth git-credential` as its credential
  helper. No token environment variable is read. No `gh`, or a `gh` with no login, stops the step: each
  template below answers exit 2, "could not answer", and `/superdev:publish-kb` leaves the page staged.
- **Audience:** superdev **adopters** (the people who install and use the plugin) first, then
  **maintainers**.
- **Language:** English.
- **Hierarchy:** links. The wiki nests no pages. Each child page links from a list item in its parent's
  body, and `/superdev:publish-kb` writes that link (ADR 0168).

## Outline

This outline is a living skeleton. `/plan` and `/document` fill and extend it.

- **Home.** The root page, with no parent. Hand-written: what superdev is, the plan and implement loop,
  and the compatibility note. Each group section below holds one link list that `/superdev:publish-kb`
  maintains.
- **`Guide: <task>`.** One page per thing an adopter does: install and configure, plan a feature,
  scope the test runs, ship and wrap up, deploy after the merge, publish to the knowledge base, audit
  tests, sweep a repository, survey the backlog. Parent: `Home`, section `Guides`.
- **`How it works: <mechanism>`.** One page per feature or mechanism, titled by the behavior a reader
  meets, written as what it does, where you meet it, and how to configure it. `/document` stages
  this page once the feature is built, under one title per feature, so one feature has one page. Parent: `Home`, section `How it works`.
- **Concepts.** The terms an adopter configures or sizes: slice store, code host, documentation
  convention, knowledge base, toolchain, verification, execution tiers, unattended runs, deploy
  posture, seed gaps. `(aggregate)`: one `## <concept>` section per concept, contributed by the scope
  that built it. A mechanism belongs on its own `How it works:` page, not here. Parent: `Home`, section
  `Concepts`.

**Create the root page first.** A child published before its root lands, but stays staged as not linked,
because its parent has no page to carry the link yet.

**Links.** A parent's link line has the form `- [<title>](https://github.com/Bomret/superdev/wiki/{sub_url}): <one line>`.
`<title>` is the child's full title, prefix included. `{sub_url}` is written literally. The doc-writer writes
the whole line, placeholder included, and `/superdev:publish-kb` replaces `{sub_url}` with the value the find
call returns for the child once the child has landed. That value is not the title slugged by hand (see Wiki git conventions). `/superdev:publish-kb` then places the line after the last top-level list item of the named section's own content (ahead of any
subsection) and every line that item carries, or below the heading as its first list item when that content
holds none yet.

Decisions stay in the repository's `docs/adr/`, which the code host renders. The knowledge base carries
no ADR digest.

**Naming.** The prefix ends in a colon and one space. No trailing period. No `#` title heading in the
body: the wiki renders the page title itself. A page's `title` is the whole string, prefix included.

An `(aggregate)` page is staged one section at a time (`action: patch`) and merged into the live page
by that section's heading. Every other page is staged whole (ADR 0027).

## Staging

This is a **remote** backend, so nothing but `/superdev:publish-kb` calls it (ADR 0023). `/superdev:plan`
and `/superdev:document` write each page as a **staged page** under `.superdev/kb-pending/<scope>/`. That directory lives in the main working tree, and `scope.js staging <scope>` resolves it (ADR 0119). Each
carries YAML frontmatter with the page `title` and an `action` of `upsert`, `patch`, or `delete`, and the
page body below. The wiki git conventions below are what `/superdev:publish-kb` applies when a human runs it,
once the feature has reached the adopters this wiki is written for.

## Wiki git conventions

- **A page is one file.** A page titled `<title>` is the file `<title with each space as ->.md` at the
  root of the wiki repository. GitHub renders the file name, with each `-` shown as a space, as the page
  title. That file name without `.md` is the page's `sub_url`, and its URL is
  `https://github.com/Bomret/superdev/wiki/<sub_url>`.
- **The page is absent** only when a clone succeeds and holds no file for the title. That is the only
  outcome `/superdev:publish-kb` §4 treats as positive absence (ADR 0027). A failed clone could not answer.
- **The wiki repository exists only once the wiki holds a page.** GitHub creates it when the first page is
  saved in the web editor. Until then every clone fails and every command answers exit 2.
- If `gh` is missing or not logged in, or the wiki cannot be cloned, `/superdev:publish-kb` **leaves every
  page staged**, reports why, and deletes nothing. A later run retries exactly the pages that did not land.

## Commands

The **backend command contract** (ADR 0069) `scripts/publish-kb.js` runs. Each command runs as
`sh -c <template> sh <path>`: `$1` names a JSON file holding `title`, `bodyFile` (`create` and `update`),
the `find` result's fields under `found` (`read`, `update`, and `delete`), and the `knowledge-base`
section of `.superdev/info.json` under `operator` (ADR 0207). Every command reads its values from that
file with `jq`. `find` emits the page's `sub_url`, and `/superdev:publish-kb` fills a `parent-link`
target's `{sub_url}` from it (`sub_url` is the contract's optional named `find` key, ADR 0168). `find`
answers exit 3 only when the clone succeeded and holds no file for the title; any other failure answers
exit 2, "could not answer," so a page never gets created from a clone that failed.

Every template opens with the same lines: check the `gh` login, shallow-clone the wiki into a temporary
directory that is removed on exit, and derive the page file from the title. So each one stands alone
under the bound below.

Every command below runs under a **30-second bound** (ADR 0130), or whatever
`knowledge-base.timeoutMs` of `.superdev/info.json` names. `scripts/publish-kb.js` applies it at the spawn.
A command killed at the bound leaves its page staged and **stops the run**: the remaining pages are
reported untried and stay staged for the next one.

### find

```sh
gh auth status >/dev/null 2>&1 || { echo "superdev: gh is missing or not logged in; run: gh auth login" >&2; exit 2; }
dir=$(mktemp -d) || exit 2; trap 'rm -rf "$dir"' EXIT
git clone -q --depth 1 https://github.com/Bomret/superdev.wiki.git "$dir/w" 2>/dev/null || { echo "superdev: cannot clone https://github.com/Bomret/superdev.wiki.git; check the wiki is enabled and holds a Home page" >&2; exit 2; }
file="$(jq -er '.title' "$1" | tr ' ' '-').md" || exit 2
[ -f "$dir/w/$file" ] || exit 3
jq -cn --arg s "${file%.md}" '{sub_url: $s}'
```

### read

```sh
gh auth status >/dev/null 2>&1 || { echo "superdev: gh is missing or not logged in; run: gh auth login" >&2; exit 2; }
dir=$(mktemp -d) || exit 2; trap 'rm -rf "$dir"' EXIT
git clone -q --depth 1 https://github.com/Bomret/superdev.wiki.git "$dir/w" 2>/dev/null || { echo "superdev: cannot clone https://github.com/Bomret/superdev.wiki.git; check the wiki is enabled and holds a Home page" >&2; exit 2; }
file="$(jq -er '.title' "$1" | tr ' ' '-').md" || exit 2
cat "$dir/w/$file" || exit 1
```

### create

```sh
gh auth status >/dev/null 2>&1 || { echo "superdev: gh is missing or not logged in; run: gh auth login" >&2; exit 2; }
dir=$(mktemp -d) || exit 2; trap 'rm -rf "$dir"' EXIT
git clone -q --depth 1 https://github.com/Bomret/superdev.wiki.git "$dir/w" 2>/dev/null || { echo "superdev: cannot clone https://github.com/Bomret/superdev.wiki.git; check the wiki is enabled and holds a Home page" >&2; exit 2; }
file="$(jq -er '.title' "$1" | tr ' ' '-').md" || exit 2
cp "$(jq -er '.bodyFile' "$1")" "$dir/w/$file" || exit 1
git -C "$dir/w" add -- "$file" || exit 1
git -C "$dir/w" -c user.name="$(gh api user --jq .login)" -c user.email="$(gh api user --jq .login)@users.noreply.github.com" commit -q -m "superdev: publish" || exit 1
git -C "$dir/w" -c credential.helper= -c credential.helper='!gh auth git-credential' push -q origin HEAD 2>/dev/null || exit 1
```

### update

```sh
gh auth status >/dev/null 2>&1 || { echo "superdev: gh is missing or not logged in; run: gh auth login" >&2; exit 2; }
dir=$(mktemp -d) || exit 2; trap 'rm -rf "$dir"' EXIT
git clone -q --depth 1 https://github.com/Bomret/superdev.wiki.git "$dir/w" 2>/dev/null || { echo "superdev: cannot clone https://github.com/Bomret/superdev.wiki.git; check the wiki is enabled and holds a Home page" >&2; exit 2; }
file="$(jq -er '.title' "$1" | tr ' ' '-').md" || exit 2
[ -f "$dir/w/$file" ] || exit 1
cp "$(jq -er '.bodyFile' "$1")" "$dir/w/$file" || exit 1
git -C "$dir/w" add -- "$file" || exit 1
git -C "$dir/w" -c user.name="$(gh api user --jq .login)" -c user.email="$(gh api user --jq .login)@users.noreply.github.com" commit -q -m "superdev: publish" || exit 1
git -C "$dir/w" -c credential.helper= -c credential.helper='!gh auth git-credential' push -q origin HEAD 2>/dev/null || exit 1
```

### delete

```sh
gh auth status >/dev/null 2>&1 || { echo "superdev: gh is missing or not logged in; run: gh auth login" >&2; exit 2; }
dir=$(mktemp -d) || exit 2; trap 'rm -rf "$dir"' EXIT
git clone -q --depth 1 https://github.com/Bomret/superdev.wiki.git "$dir/w" 2>/dev/null || { echo "superdev: cannot clone https://github.com/Bomret/superdev.wiki.git; check the wiki is enabled and holds a Home page" >&2; exit 2; }
file="$(jq -er '.title' "$1" | tr ' ' '-').md" || exit 2
git -C "$dir/w" rm -q -- "$file" || exit 1
git -C "$dir/w" -c user.name="$(gh api user --jq .login)" -c user.email="$(gh api user --jq .login)@users.noreply.github.com" commit -q -m "superdev: publish" || exit 1
git -C "$dir/w" -c credential.helper= -c credential.helper='!gh auth git-credential' push -q origin HEAD 2>/dev/null || exit 1
```

Human-consumption first: shape pages around the audience, write in English, follow the outline above.

## superdev usage

- `/superdev:plan` and `/superdev:document` stage pages; `/superdev:document` reconciles and extends the
  wiki through its doc-writer.
- `/superdev:publish-kb` sends the staged pages to the wiki. The only command that calls it.

## Degrade / switching

No `gh`, no `gh` login, or a wiki that cannot be cloned → `/superdev:publish-kb` leaves every page
staged, reports why, and deletes nothing; a later run retries exactly the pages that did not land. The
in-repo docs are the record meanwhile. To move to a different knowledge base later, re-run
`/superdev:setup` and pick a different one.
