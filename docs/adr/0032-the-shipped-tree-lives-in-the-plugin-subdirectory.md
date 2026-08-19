# 0032 — The shipped tree lives in the plugin/ subdirectory

**Status:** Accepted

**Context.** A Claude Code plugin install copies the whole source directory of its marketplace entry
into the user's plugin cache; there is no manifest field that filters files. With
`marketplace.json`'s source at `./`, every install carried the maintainer-only half of the repo —
`scripts/drift-check.js` with its `drift/` modules and selftests, `scripts/eval-run.js`, `evals/`,
`docs/`, `CHANGELOG.md` — thousands of lines a user's machine never runs. The marketplace does support
a subdirectory source: an entry whose source names a path inside the marketplace repo copies only that
tree.

**Decision.** The shipped tree lives in `plugin/`: `commands/`, `agents/`, `hooks/`, `references/`,
the two runtime CLIs in `scripts/` (`scope.js`, `kb-patch.js`), the manifest in
`.claude-plugin/plugin.json`, and copies of `LICENSE` and `NOTICE`. `marketplace.json` stays at the
repo root and points its source at `./plugin`. Everything maintainer-only stays at the repo root.
Inside `plugin/` every relative relationship is unchanged — `hooks/scope-prune.js` still `require`s
`../scripts/scope.js`, and prose still names plugin-root-relative paths like `scripts/scope.js` —
because `${CLAUDE_PLUGIN_ROOT}` is the plugin root in both layouts. On the maintainer side,
`scripts/drift/lib.js`'s `docPath()` resolves a plugin-relative path against the repo root first (the
fixtures' layout) and under `plugin/` second (the repo's layout), so contract tables and selftest
fixtures keep naming plugin-relative paths.

**Why.** The alternative that keeps the repo layout — a release step that copies the runtime files to
a dist branch the marketplace tracks — adds permanent release machinery and a second branch that can
drift from `main`. The subdirectory source is a one-time move with zero ongoing process: releasing
stays a plain semantic-release commit, and the repo keeps its no-build-step rule.

**Consequences.** An install shrinks to the runtime files alone. `bun run test` and
`release.config.cjs` name the moved paths (`plugin/hooks/…`, `plugin/scripts/…`,
`plugin/.claude-plugin/plugin.json`), and `claude plugin validate` targets `./plugin`.
`hooks/update-check.js` fetches the remote version from the manifest's new path; installs at 0.32.1
or older fetch the old path, get a 404, and stay silent — their marketplace refresh still picks up
the new source, so they update, they just print no notice for the release that moves the tree.
