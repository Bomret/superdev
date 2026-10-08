# Toolchain

## `.`: Markdown and JS plugin (Bun and Node)

- Package manager: **Bun** (`bun.lock`). A dev-only toolchain, not published to npm.
- Commands:
  - Tests: see docs/agents/verification.md. `bun run test` runs every `tests/*.test.js` suite through `scripts/run-tests.js`, then the tail: `scripts/invariant-check.js --root .` against this repository's register, `drift-check.js`'s own `--selftest`, `drift-check.js`, and `claude plugin validate ./plugin`. It arms the green-gate and prints one wall-clock line per step.
  - Focused tests: `node scripts/run-tests.js --related <path>...` runs the tail plus only the suites the changed paths reach. An empty list runs the tail alone, and a code path no rule places runs every suite.
  - Release: `bun run release` runs semantic-release from clean `main`. It needs `GITEA_TOKEN` (see RELEASING.md).
- Runtime: **Node** runs the hooks in production (`hooks.json` invokes `node`, guaranteed in every Claude Code environment). Bun is maintainer-only.
- No linter or formatter configs. There is no `.editorconfig`, `.prettierrc`, or `.eslintrc`. The plugin ships as prose plus CommonJS hooks, with no build step.
- Style prose: `AGENTS.md` "Working rules". Hooks are CommonJS, every shipped executable has a suite in `tests/` named for it, the version lives only in `plugin.json`, and backends stay pluggable.
