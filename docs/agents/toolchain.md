# Toolchain

## `.`: Markdown and JS plugin (Bun and Node)

- Package manager: **Bun** (`bun.lock`). A dev-only toolchain, not published to npm.
- Commands:
  - Tests: see docs/agents/verification.md. It runs every suite under `tests/`, then `scripts/invariant-check.js --root .` against this repository's register, `drift-check.js`'s own `--selftest`, `drift-check.js`, and `claude plugin validate ./plugin`, and it arms the green-gate.
  - Regenerate the harness golden fixtures: `bun run render-fixtures` rewrites `scripts/drift/fixtures/opencode/` and `scripts/drift/fixtures/codex/` from the shipped plugin tree, which `drift-check`'s `opencode-render` and `codex-render` checks compare against. Run it in the same commit as a skills, agents, or adapter edit that changes either render.
  - Release: `bun run release` runs semantic-release from clean `main`. It needs `GITEA_TOKEN` (see RELEASING.md).
- Runtime: **Node** runs the hooks in production (`hooks.json` invokes `node`, guaranteed in every Claude Code environment). Bun is maintainer-only.
- No linter or formatter configs. There is no `.editorconfig`, `.prettierrc`, or `.eslintrc`. The plugin ships as prose plus CommonJS hooks, with no build step.
- Style prose: `AGENTS.md` "Working rules". Hooks are CommonJS, every shipped executable has a suite in `tests/` named for it, the version lives only in `plugin.json`, and backends stay pluggable.
