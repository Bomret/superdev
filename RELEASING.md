# Releasing

Releases are deterministic and commit-driven, via [semantic-release](https://semantic-release.gitbook.io).
The version is computed from the [Conventional Commits](https://www.conventionalcommits.org) since the
last release tag — no manual version bumping.

## What a release does

1. Analyse commits since the last `v*` tag → compute the next version:
   - `fix:` → patch, `feat:` → minor, `feat!:` / a `BREAKING CHANGE:` footer → major.
   - Only `feat`/`fix`/`perf` (and breaking) trigger a release; `docs`/`chore`/`refactor`/`style`/`test` do not.
2. Update `CHANGELOG.md` and bump the version in `.claude-plugin/plugin.json`
   (via `scripts/bump-version.mjs` — `plugin.json` is the single source of truth; `marketplace.json`
   carries no version).
3. Commit `chore(release): X.Y.Z [skip ci]` with the release notes, tag `vX.Y.Z`, and push.
4. Publish a **Codeberg Release** (Gitea API) with the generated notes.

## Running it

Local, off `main`, working tree clean:

```
GITEA_TOKEN=<codeberg-token> npm run release
```

- **`GITEA_TOKEN`** — a Codeberg token with write access to the repo
  (Codeberg → Settings → Applications → *Generate New Token*). The instance URL is pinned in
  `.releaserc.json` (`giteaUrl: https://codeberg.org`); override with `GITEA_URL` if needed.
- Pushing the release commit + tag uses your normal git auth (SSH).
- `npm run release` passes `--no-ci`, so it runs outside a CI environment.

Dry run (computes the next version and notes, changes nothing):

```
GITEA_TOKEN=<token> npx semantic-release --no-ci --dry-run
```

## Baseline

Release history starts at the tag **`v0.2.0`**. The next release increments from there based on the
commits that follow it.
