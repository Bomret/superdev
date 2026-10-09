# 0131: The marketplace source is pinned to the release tag

**Status:** Accepted

**Amends:** [ADR 0032](0032-the-shipped-tree-lives-in-the-plugin-subdirectory.md), whose Decision
points the marketplace source at the relative path `./plugin`.

**Context.** ADR 0032 points `marketplace.json`'s plugin source at the relative path `./plugin`. A
relative source carries no ref of its own: it resolves inside whatever commit of the marketplace
repository Claude Code fetched, and that is the tip of `main`. A pull request merges to `main` some time
before semantic-release cuts the release that bumps `plugin/.claude-plugin/plugin.json`. In that window a
fresh install, or a `/plugin marketplace update`, copies unreleased code and labels it with the previous
release's version. Two installs reporting the same version can then run different code, and nothing on the
user's side shows it. Heimeshoff's Agentheim (ADR-0081 there) pins its marketplace source to the release
tag for the same reason.

Claude Code's plugin sources offer `git-subdir`: one subdirectory of a git repository, fetched with a
sparse checkout, with optional `ref` and `sha` fields (the [marketplace
reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md), checked 2026-10-09).

**Decision.** The marketplace entry's source is
`{"source": "git-subdir", "url": "https://codeberg.org/bomret/superdev.git", "path": "plugin", "ref": "v<version>"}`,
where `<version>` is `plugin/.claude-plugin/plugin.json`'s version. The entry carries no `version`
field, as before. `release.config.cjs` rewrites the `ref` to `v${nextRelease.version}` in the same
`semantic-release-replace-plugin` step that bumps `plugin.json`, and `@semantic-release/git` commits
`marketplace.json` with it, so the release commit names its own tag. A rewrite that matches nothing fails
the release, through the replacement's `results` and `countMatches`. `drift-check`'s
`marketplace-source` check holds the shape in place between releases: the `url` is this repository's
clone URL, the `path` names a directory that carries `.claude-plugin/plugin.json`, and the `ref` equals `v`
followed by that file's version.

**Why.** The alternatives keep `./plugin` and move the problem: a release branch the marketplace tracks
adds the second branch ADR 0032 rejected, and a `sha` pin cannot be written into the commit it names. A
tag ref is one string that semantic-release already computes, in a file it already commits.

**Consequences.** An install copies the tree the named tag holds, never `main`'s tip. A clone of this
repository no longer installs its own working tree through the marketplace: a maintainer loads a clone
with `claude --plugin-dir ./plugin` instead. The release commit is pushed a few seconds before its tag,
and an install in that window names a tag the remote does not hold yet and fails. The install succeeds on
retry. Closing that window needs a release step outside semantic-release's order, and this decision does
not add one. An existing install picks up the new source on its next marketplace refresh, once a release
carrying it is published.
