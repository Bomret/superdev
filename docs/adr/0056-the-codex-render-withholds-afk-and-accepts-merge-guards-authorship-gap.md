# 0056: The Codex render withholds afk and model-explicit, and accepts merge-guard's authorship gap

**Status:** Superseded

**Superseded by:** [ADR 0102](0102-superdev-is-a-claude-code-only-plugin.md), which makes superdev a Claude Code-only plugin and removes the harness renders.

**Extends:** [ADR 0050](0050-carry-the-plugin-as-skills-canonical-prose-with-install-time-adapters.md),
which deferred every harness past OpenCode, and
[ADR 0055](0055-the-opencode-render-carries-prompts-as-skills-and-afk-as-a-command.md), whose
skills-plus-one-command split this decision reaches a different answer to, because Codex offers no
project-local surface with the property that split depends on.

## Context

Codex CLI is the second harness the pack renders for. Issue #372's research (2026-08-28) picked it first,
because its hook system carries Claude Code's own event names and payload shape, so the guardrails
port as configuration rather than as a bridge.

Verified 2026-09-10 against the official Codex documentation:

- **Hooks are a near-copy of Claude Code's.** `.codex/hooks.json` or a `[hooks]` table in
  `.codex/config.toml`, at the repository or the user level. The events are `SessionStart`, `SessionEnd`,
  `PreToolUse`, `PostToolUse`, `PermissionRequest`, `PreCompact`, `PostCompact`, `UserPromptSubmit`,
  `SubagentStart`, `SubagentStop`, `Stop` and `Interrupt`. Every payload carries `session_id`,
  `transcript_path`, `cwd`, `hook_event_name` and `model`; a turn-scoped one adds `turn_id`, and
  `PreToolUse` and `PostToolUse` carry `tool_name`, `tool_use_id`, `tool_input`, `permission_mode`, and
  — on `PostToolUse` — `tool_response`. A `PreToolUse` hook denies through
  `hookSpecificOutput.permissionDecision` or exit code 2 with a reason on stderr. Matchers are regexes
  over the tool name and accept alternation. `[features] hooks = false` disables all of them
  ([hooks](https://learn.chatgpt.com/docs/hooks)).
- **The edit tool is `apply_patch`.** The matcher examples accept `Edit` and `Write` besides, but
  `apply_patch` is the canonical name Codex emits for a file edit, and shell commands arrive as `Bash`
  ([hooks](https://learn.chatgpt.com/docs/hooks)).
- **`PreToolUse` and `PostToolUse` carry no subagent identity.** No field marks a call as a subagent's
  rather than the main agent's. `agent_id` and `agent_type` exist, but only on the `SubagentStart` and
  `SubagentStop` events ([hooks](https://learn.chatgpt.com/docs/hooks)).
- **Skills are the prompt surface, and every one of them is model-invocable.** Codex scans
  `$CWD/.agents/skills`, the parent directory's, `$REPO_ROOT/.agents/skills`, `$HOME/.agents/skills` and
  `/etc/codex/skills` — **not** `.claude/skills/`. A skill is invoked explicitly as `$skill-name`, and
  implicitly whenever Codex judges the task to match its `description`. Names are flat: two skills
  sharing a `name` are not merged and both appear in the selectors
  ([skills](https://learn.chatgpt.com/docs/build-skills)).
- **Custom prompts are the only operator-typed prompt surface, and they are deprecated.** "Custom prompts
  are deprecated. Use skills for reusable instructions that Codex can invoke explicitly or implicitly."
  They live in `~/.codex/prompts/`, the user's home rather than the project
  ([custom prompts](https://learn.chatgpt.com/docs/custom-prompts)).
- **Subagents are TOML, parallel, and carry their own model.** `.codex/agents/*.toml` with `name`,
  `description` and `developer_instructions` required, plus optional `model`,
  `model_reasoning_effort`, `sandbox_mode`, `mcp_servers` and `skills.config`. `sandbox_mode` is
  `read-only` or `workspace-write`. Codex does not spawn one on its own: dispatch is an explicit
  delegation prompt. Tool access is inherited from the parent rather than restricted per agent
  ([subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents.md)).
- **The Agent Plugins standard does not carry hooks or agents.** Its 1.0.0 specification defines
  `plugin.json`, `skills/` and `mcp.json`, and states that "other component types — such as commands,
  hooks, agents, rules, and LSP servers — remain too client-specific for a stable portable contract and
  are outside the v1 format" ([spec](https://github.com/agentplugins/agent-plugins-spec)).

Three of superdev's shipped surfaces have no faithful Codex target. afk must not be model-invocable
(ADR 0055), and every Codex skill is. `model-explicit` matches `PreToolUse(Agent)`, and Codex has no such
tool. `merge-guard` decides on `agent_id`, which Codex's tool events do not carry.

## Decision

**The Codex render carries every surface it can render faithfully, withholds the two it cannot, and
records merge-guard's gap rather than papering over it.**

- **Eleven skills render to `.agents/skills/superdev-<name>/SKILL.md`.** The `superdev-` prefix is what
  keeps a flat, unnamespaced registry from colliding with a consumer's own skill, the same reason
  ADR 0055 gives for OpenCode. `upgrade` renders a synthesized Codex-native body, ADR 0052's precedent
  applied to a third harness.
- **afk renders nowhere.** Codex's only non-model-invocable prompt surface is a deprecated feature living
  in the operator's home directory, outside the project tree the adapter writes to, so there is no target
  that both reproduces `disable-model-invocation` and stays inside the render's own contract. A reference
  to afk in another skill's prose renders as its plain name, advertising no invocation. Unattended sweeps
  run on Claude Code or OpenCode until a Codex answer is verified.
- **Six agents render to `.codex/agents/superdev-<name>.toml`**, the body becoming
  `developer_instructions`, the model alias resolved through `--model-map`, and `sandbox_mode` carrying
  the read-only property Claude Code expresses as a `tools:` list: `read-only` for `slice-reviewer`,
  `simplicity-reviewer`, `final-reviewer` and `doc-reader`, `workspace-write` for `implementer` and
  `doc-writer`.
- **`model-explicit` is withheld, because the render satisfies its contract structurally.** The hook
  exists to stop a dispatch that names no model. Every rendered agent TOML carries an explicit `model`,
  so on Codex there is no unpinned dispatch left for a hook to catch.
- **`merge-guard` renders and cannot fire.** It allows any call whose payload carries no `agent_id`, and
  no Codex tool event carries one, so the subagent merge block is inert there. It is wired anyway: the
  wiring costs nothing, and the guard starts working the day Codex adds the field. The gap is stated in
  the README's Codex section, so an operator reads it as a known limit rather than discovering it.
- **`ledger-guard` learns `apply_patch`.** Its `decide()` gains a branch for Codex's own edit-input
  shape, beside the `file_path` and `command` shapes it already reads. This is a change to a shipped
  hook, additive on every harness.
- **A codex render requires `--model-map` for every alias it uses.** The interactive fallback queries an
  OpenCode configuration for the available models, which says nothing about what a Codex install can
  run. A missing alias exits nonzero naming the alias and the flag.
- **`.codex/hooks.json` is never overwritten.** JSON carries no comment, so the render cannot mark a
  file as its own the way the agent and skill renders do. A file the render did not write stops the
  render with a one-line reason instead of being clobbered.

## Consequences

- superdev's chain runs on Codex: the prompts, the six subagents, and every guardrail except the
  subagent merge block. The full execution tier survives, since Codex subagents are parallel,
  isolated and `workspace-write`.
- Guardrail parity on Codex is partial, and named as such. `green-gate` is unaffected in the direction
  that matters: it allows a call carrying `agent_id` and blocks otherwise, so an absent field makes it
  gate more merges rather than fewer.
- afk is the one surface a Codex operator does not get. That is the same position ADR 0050 left OpenCode
  in, and it reopens the moment Codex ships a project-local surface the model cannot start.
- Each rendered agent pins a concrete model, which is what retires `model-explicit` there. An operator
  editing a rendered TOML by hand can undo that, and the file says it is generated.
- The render writes into two trees, `.agents/skills/` and `.codex/`, where the OpenCode render writes
  into one. `.agents/skills/` is the standard's shared location, so marker-keyed cleanup matters more
  there than in a namespaced directory.

## Considered options

**Render afk as a Codex custom prompt.** Rejected: the surface is deprecated in favor of skills, and it
lives in `~/.codex/prompts/`. Writing outside the project root would give the adapter a second, global
render target and a second cleanup contract, for one surface, on a feature its own vendor is retiring.

**Render afk as a skill and tell the operator to disable it.** Rejected for the reason ADR 0055 gives:
a fresh install would be model-invocable until the operator acted on prose, and Codex's implicit
activation makes that worse than OpenCode's, since a description match alone can start a skill.

**Reconstruct authorship from `SubagentStart`.** Rejected: `SubagentStart` carries `agent_id`, so a hook
could record live subagent ids for `PreToolUse` to read back, but the correlation is cross-process
state shared by parallel subagents, and the events carry no key tying a tool call to the agent that made
it. A racy guardrail is worse than an absent one, because it reads as enforcement.

**Wait for the Agent Plugins standard to cover hooks and agents.** Rejected: its own 1.0.0 text puts
both outside the format as too client-specific, so the per-harness render ADR 0050 chose stays the
answer rather than an interim measure.
