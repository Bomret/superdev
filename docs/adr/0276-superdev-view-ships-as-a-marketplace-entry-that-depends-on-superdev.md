# 0276: superdev-view ships as a marketplace entry that depends on superdev

**Status:** Accepted

**Amends:** [ADR 0131](0131-the-marketplace-source-is-pinned-to-the-release-tag.md), whose pinned source
covers one marketplace entry.

**Context.** `mods/superdev-view/` is a Claude Code mod: a hooks module that draws a pane of a repository's
`.superdev/` folder. It had its own marketplace in its folder, with the relative source `./`, and the root
marketplace did not list it. Only a maintainer with a clone could install it. An adopter of superdev had no way
to get the pane.

Claude Code accepts a `dependencies` array on a marketplace plugin entry. Installing the entry installs every
dependency it names, and a bare name resolves in the same marketplace. Claude Code offers no way for one plugin
to install an optional companion
([plugin dependencies](https://code.claude.com/docs/en/plugins/dependencies.md), checked 2026-11-23, on Claude
Code 2.1.327). A mod needs Claude Code 2.1.287 or later and no build step
([create a mod](https://code.claude.com/docs/en/plugins/mods/create.md), checked 2026-11-23).

**Decision.** The root `.claude-plugin/marketplace.json` lists `superdev-view` as a second entry. Its source is
`{"source": "git-subdir", "url": "https://github.com/Bomret/superdev.git", "path": "mods/superdev-view", "ref": "v<version>"}`,
and the entry carries `"dependencies": ["superdev"]`. Installing `superdev-view@superdev` installs superdev too.
Installing `superdev@superdev` installs no pane.

- **The mod is versioned with the plugin.** `release.config.cjs` sets the `version` of
  `mods/superdev-view/.claude-plugin/plugin.json` to the release version, and rewrites both entries' `ref` in
  `marketplace.json`. Claude Code caches an install by version, so a mod whose version stayed fixed would never
  update an adopter's copy. `drift-check`'s `marketplace-source` check holds every entry's `ref` to `v` followed
  by its own tree's version.
- **The dependency lives on the marketplace entry**, not in the mod's `plugin.json`. The mod's own marketplace,
  which a maintainer installs in place, lists no `superdev`, so a dependency in `plugin.json` would not resolve
  there.
- **The dependency names no version range.** For a git source, Claude Code resolves a range against tags named
  `<plugin-name>--v<version>`. This repository tags `v<version>`, so a range would match no tag.
- **The mod folder carries `LICENSE` and `NOTICE`**, as `plugin/` does, because an install copies that folder
  alone.

**Why.** The pane reads `.superdev/` and nothing else, so it is useless without superdev, and the dependency
states that. An optional entry keeps the pane off every install that did not ask for it. Bundling the mod into
`plugin/` would put a pane in every adopter's session and make superdev's install fail wherever mods are blocked
(`--safe-mode`, `--bare`, `disableAllHooks`, managed settings).

**Considered options.** *Bundle the mod into `plugin/`.* Rejected for the reasons above. *A separate
repository for the mod.* Rejected: the mod's parser is pinned to `scope.js` and `run-trace.js` output by suites
in this repository, and one release tag keeps the two in step. *Keep the mod's own version.* Rejected: it would
need a hand bump on every change to reach an adopter, and nothing would fail when one was missed.

**Consequences.** An install of `superdev-view` copies the mod's whole folder at the release tag, its test files
included. Claude Code loads only the module `hooks/hooks.json` names. A maintainer keeps loading the mod in place
from its own folder marketplace, unchanged. The mod's version jumps from its own series to the plugin's.
