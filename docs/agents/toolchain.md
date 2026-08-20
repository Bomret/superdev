# Toolchain

## `.` — Markdown + JS plugin (Bun / Node)

- Package manager: **Bun** (`bun.lock`); dev-only toolchain, not published to npm.
- Commands:
  - Tests — see docs/agents/verification.md  (hook `--selftest`s + `scope.js`/`kb-patch.js`/`eval-run.js` `--selftest`s + `drift-check.js` + `claude plugin validate ./plugin`; arms the green-gate)
  - Evals — `bun run eval`  (`scripts/eval-run.js` over `evals/` on a Claude subscription, ADR 0024; `bun run eval:plan` for the cheap plan-only arms; needs `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`)
  - Release — `bun run release`  (semantic-release from clean `main`; needs `GITEA_TOKEN` — see RELEASING.md)
- Runtime: **Node** runs the hooks in production (`hooks.json` invokes `node`, guaranteed in every Claude Code env); Bun is maintainer-only.
- No linter/formatter configs — there is no `.editorconfig`/`.prettierrc`/`.eslintrc`; the plugin ships as prose + CommonJS hooks with no build step.
- Style prose: `AGENTS.md` "Working rules" (hooks are CommonJS; every hook ships a `--selftest`; version lives only in `plugin.json`; backends stay pluggable).
