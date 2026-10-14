# 0050: Carry the plugin as skills-canonical prose with install-time, per-harness adapters

**Status:** Superseded

**Amended by:** [ADR 0055](0055-the-opencode-render-carries-prompts-as-skills-and-afk-as-a-command.md),
[ADR 0056](0056-the-codex-render-withholds-afk-and-accepts-merge-guards-authorship-gap.md), and
[ADR 0051](0051-the-opencode-agent-render-uses-a-tools-map-not-permission.md), which
corrects the rendered agents' access-control mechanism named below from a `permission:` mapping to a
`tools:` map, and [ADR 0052](0052-opencode-gets-a-synthesized-native-upgrade-command.md), which reverses
the Consequences' call to exclude `upgrade` outright, giving it a synthesized native command instead.

**Superseded by:** [ADR 0102](0102-superdev-is-a-claude-code-only-plugin.md), which makes superdev a Claude Code-only plugin and removes the harness renders.

## Context

superdev shipped Claude Code-only: `plugin/commands/*.md` for slash commands, `plugin/agents/*.md` for
subagents, `plugin/hooks/hooks.json` for deterministic guardrails, and `${CLAUDE_PLUGIN_ROOT}` written
into prose and hook wiring alike. Issue #372 (2026-08-29) recorded full research on reaching other agent
runtimes — Codex CLI, Gemini CLI, OpenCode, Cursor, Cline, Roo Code, Continue — without giving up the
deterministic hooks or the no-build-step release.

The research's load-bearing findings, verified against primary sources on 2026-08-30:

- The Agent Skills standard (`SKILL.md`) is the prompt-pack format every target already reads; Claude
  Code itself merges commands and skills into one user-invocable surface (`/name`), so a skills move
  costs the user nothing.
- MCP's `prompts` primitive cannot carry the command surface: most target harnesses are tools-only MCP
  clients. MCP has no hook primitive and no subagent primitive.
- Deterministic hooks are no longer Claude Code-only (Codex, Cursor, Gemini CLI, OpenCode, Cline), but
  no two harnesses wire them identically; Roo Code and Continue have none.
- Subagent dispatch exists on enough harnesses that the full tier survives, with the existing lite tier
  as the degraded mode elsewhere.

## Decision

**Prompt prose becomes skills-canonical; a third runtime CLI renders per-harness surfaces at install
time.**

- `plugin/commands/*.md` moves to `plugin/skills/<name>/SKILL.md`, one skill per former command, with an
  explicit `name` and all frontmatter preserved. Claude Code presents the identical `/superdev:<name>`
  surface, because its merged commands/skills model resolves plugin skills by name (verified 2026-08-30
  against `code.claude.com/docs/en/plugins` and `/docs/en/skills`).
- The six agent bodies stay single-source; the eight hook scripts stay position-independent Node.
- A new runtime CLI, `plugin/scripts/adapter.js` (CommonJS, `--selftest`, same discipline as
  `scope.js` and `kb-patch.js`), is the only expansion point. Given `--harness`, `--plugin-root`, and
  `--dest`, it renders a consumer repository's native surfaces: for OpenCode, ten command files
  under `.opencode/commands/superdev/` (`/superdev/<name>` naming, subdir namespacing verified
  2026-08-30 against `src/config/entry-name.ts` on the `dev` branch), six `mode: subagent` agents with
  a permission mapping and an explicit `--model-map` for Claude's `sonnet`/`opus`/`haiku` aliases, and
  one `.opencode/plugins/superdev.js` bridging the eight hooks (`tool.execute.before/after`,
  `session.created`, `session.idle`; throw-to-block; `CLAUDE_PLUGIN_ROOT` set in the child's env).
- Rendered prose is rewritten deterministically: `${CLAUDE_PLUGIN_ROOT}` becomes the absolute plugin
  checkout path, `/superdev:<cmd>` becomes `/superdev/<cmd>`, `superdev:<agent>` becomes the bare
  agent name.
- Golden fixtures in the repo guard canonical source against render logic: `bun run test` regenerates
  to a temporary directory and diffs against committed snapshots.
- **Claude Code compatibility is non-negotiable**: the first slice's Definition of Done is the smoke
  table proving the twelve surfaces, the six dispatches, and the hooks behave identically after the
  canonical move.
- Deferred, deliberately: `/superdev:afk` per-harness rework (its Skill-tool chain is a Claude Code
  equivalence, ADR 0015, dated), the eval runner beyond Claude Code (ADR 0024), every harness past
  OpenCode, and any deeper `/superdev:setup` integration.

## Consequences

- One source of truth per surface; no dual maintenance of commands and skills.
- The plugin's install stays a plain copy; per-harness wiring is an explicit, repeatable CLI step that
  the consumer (or a later setup step) runs.
- afk is excluded from OpenCode renders until its driver mapping is resolved against a verified
  OpenCode equivalent. Upgrade is excluded outright, since its body drives Claude Code's own `claude
  plugin update`, which has no OpenCode equivalent.
- Each future harness costs a small mapping in `adapter.js` plus fixtures, not a fork of the pack.
- Hook parity is unachievable on hookless harnesses (Roo Code, Continue today); those remain out of
  scope and are not claimed.

## Considered options

**MCP-first: wrap the CLIs as MCP tools, ship commands as MCP prompts.** Rejected: the command
surface dies on tools-only clients (Cursor, Cline, Roo, Codex, OpenCode), and MCP offers neither a hook
primitive nor a subagent primitive — the two hard problems remain. A server may come later as a
convenience facade; it is not the spine.

**Standalone orchestrator: superdev as its own agent runner.** Rejected: it abandons the plugin model,
rebuilds what harnesses give free, replaces subscription economics with API-key economics the eval
runner deliberately avoids (ADR 0024), and turns "no prerequisite" into "install our runner". A
headless-supervisor variant remains the likely future home of `/afk` per harness, not of the pack.

**Keep `commands/` canonical, generate skill shims.** Rejected: Claude Code already merges the two
surfaces, and the Agent Skills standard is the only prompt format read across every target; keeping
commands as the source leaves the single-source question unresolved in the other direction, with
skills as second-class ghosts.
