# Contributing to superdev

Thank you for helping. This page states how to propose a change and how it gets merged.

## Before you start

- **A bug or an idea:** open an issue at <https://github.com/Bomret/superdev/issues>. Say what you
  ran, what you expected, and what happened, with your superdev version (`plugin/.claude-plugin/plugin.json`).
- **A security bug:** follow [`SECURITY.md`](SECURITY.md). Do not open a public issue for it.
- **A larger change:** open an issue first, so the design is agreed before you write code.

## Set up

1. Install Node 24 or later and Bun.
2. Clone the repository and run `bun install`.
3. Read [`AGENTS.md`](AGENTS.md). It is the working contract for this repository: its layout, its rules,
   and the rules for each subtree.

To try a change in Claude Code, load the working tree with `claude --plugin-dir ./plugin`.

## Make the change

- Read every `AGENTS.md` on the path to each file you touch. The nearest one governs local detail.
- Every shipped executable has a suite in `tests/`, named for it. A new hook or script gets a new suite.
- Update the docs your change makes wrong. Docs follow the writing standard in
  [`plugin/references/controlled-prose.md`](plugin/references/controlled-prose.md).

## Test

```sh
node scripts/run-tests.js
```

This runs every suite, the drift checks, and the plugin manifest validation. It must pass before a pull
request is merged. While you work, `node scripts/run-tests.js --related <path>...` runs only the suites
your paths reach.

## Open a pull request

- Open it against `main`.
- **Give it a Conventional Commits title** (`type(scope): subject`, for example
  `fix(hooks): …`). Pull requests are squash-merged, so the title becomes the commit message, and
  semantic-release reads it for the version bump and the changelog. `feat` gives a minor release, `fix`
  and `perf` a patch release. A title without a conventional type gives no release.
- Leave `CHANGELOG.md` and the version in `plugin/.claude-plugin/plugin.json` alone. The release
  writes both ([`RELEASING.md`](RELEASING.md)).

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
