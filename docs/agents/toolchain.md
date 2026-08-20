# Toolchain

## `.`: Markdown and JS plugin (Bun and Node)

- Package manager: **Bun** (`bun.lock`). A dev-only toolchain, not published to npm.
- Commands:
  - Tests: see docs/agents/verification.md. It runs the hook `--selftest`s, the `scope.js`, `kb-patch.js`, and `eval-run.js` `--selftest`s, `drift-check.js`, and `claude plugin validate ./plugin`, and it arms the green-gate.
  - Evals: `bun run eval` runs `scripts/eval-run.js` over `evals/` on a Claude subscription (ADR 0024). `bun run eval:plan` runs the cheap plan-only arms. Both need `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`.
  - Release: `bun run release` runs semantic-release from clean `main`. It needs `GITEA_TOKEN` (see RELEASING.md).
- Runtime: **Node** runs the hooks in production (`hooks.json` invokes `node`, guaranteed in every Claude Code environment). Bun is maintainer-only.
- No linter or formatter configs. There is no `.editorconfig`, `.prettierrc`, or `.eslintrc`. The plugin ships as prose plus CommonJS hooks, with no build step.
- Style prose: `AGENTS.md` "Working rules". Hooks are CommonJS, every hook ships a `--selftest`, the version lives only in `plugin.json`, and backends stay pluggable.
