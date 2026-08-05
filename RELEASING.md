# Releasing

Releases are deterministic and commit-driven, via [semantic-release](https://semantic-release.gitbook.io).
The version is computed from the [Conventional Commits](https://www.conventionalcommits.org) since the
last release tag — no manual version bumping.

## Repo tooling (Bun)

[Bun](https://bun.sh) is the repo's package manager and task runner. Install dev deps and run tasks with
it:

```
bun install       # install dev deps (semantic-release toolchain); writes bun.lock
bun run test      # run the hook selftests, then validate the plugin manifest
bun run release   # cut a release (see below)
```

The plugin's **hooks stay on `node`** (`hooks.json` invokes `node …`) — `node` is guaranteed in every
user's Claude Code environment, Bun is not. Bun is a maintainer-only tool; `bun run test` executes the
selftests with `node` so they match the production runtime, then runs `claude plugin validate .` as a
manifest-validation gate.

## What a release does

1. Analyse commits since the last `v*` tag → compute the next version:
   - `fix:` → patch, `feat:` → minor. `feat!:` / a `BREAKING CHANGE:` footer → **also minor** while the
     plugin is pre-1.0 (`releaseRules` in `release.config.cjs`); remove that rule to cut the first
     deliberate 1.0.0. The commit still records the break and its notes still list it under
     `BREAKING CHANGES`.
   - Only `feat`/`fix`/`perf` (and breaking) trigger a release; `docs`/`chore`/`refactor`/`style`/`test` do not.
2. Update `CHANGELOG.md` and bump the version in `.claude-plugin/plugin.json`
   (via `semantic-release-replace-plugin` — `plugin.json` is the single source of truth; `marketplace.json`
   carries no version).
3. Commit `chore(release): X.Y.Z [skip ci]` with the release notes, tag `vX.Y.Z`, and push.
4. Publish a **Codeberg Release** (Gitea API) with the generated notes.

## Merging PRs (keep the Conventional Commit type)

semantic-release reads the commit **type** to decide the bump, so a merged PR must land at least one
`feat:`/`fix:` commit on `main`:

- **Squash merge** — Codeberg uses the **PR title** as the squash message, so give the PR a conventional
  title (`feat: …`, `fix: …`). A non-conventional title (e.g. `My feature (#8)`) squashes to a commit
  that triggers **no release** — the change lands on `main` unreleased.
- **Merge commit** — preserves each slice's own `feat:`/`fix:` commits, so the type survives regardless
  of the PR title.

If a squash already landed with a non-conventional message, add one `git commit --allow-empty -m "feat:
…"` before releasing to record the type.

## Running it

Local, off `main`, working tree clean:

```
GITEA_TOKEN=<codeberg-token> bun run release
```

- **`GITEA_TOKEN`** — a Codeberg token with write access to the repo
  (Codeberg → Settings → Applications → *Generate New Token*). The instance URL is pinned in
  `release.config.cjs` (`giteaUrl: https://codeberg.org`); override with `GITEA_URL` if needed.
- Pushing the release commit + tag uses your normal git auth (SSH).
- `bun run release` passes `--no-ci`, so it runs outside a CI environment.

Dry run (computes the next version and notes, changes nothing):

```
GITEA_TOKEN=<token> bunx semantic-release --no-ci --dry-run
```

## Baseline

Release history starts at the tag **`v0.2.0`**. The next release increments from there based on the
commits that follow it.
