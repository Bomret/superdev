# 0055: The OpenCode render carries prompts as skills, and afk as a command

**Status:** Accepted

**Amends:** [ADR 0050](0050-carry-the-plugin-as-skills-canonical-prose-with-install-time-adapters.md),
which named `.opencode/commands/superdev/<name>.md` as the OpenCode prompt render target and deferred
`/superdev:afk` for want of a verified OpenCode driver, and
[ADR 0052](0052-opencode-gets-a-synthesized-native-upgrade-command.md), whose synthesized `upgrade`
render becomes a skill along with the other ten.

## Context

`/superdev:afk` drives the implement chain unattended: it invokes `/superdev:implement`,
`/superdev:review`, `/superdev:document` and `/superdev:ship` itself, one scope anchor at a time
(ADR 0015). The model performs those invocations, not the operator. ADR 0050 rendered every OpenCode
prompt surface as a command and excluded afk, because no OpenCode equivalent of Claude Code's Skill
tool had been verified.

Verified 2026-09-09, against `opencode.ai/docs` and `anomalyco/opencode@dev` (the repository
`sst/opencode` now redirects to):

- **An OpenCode command is not model-invocable.** It is triggered by the operator typing `/<name>`, by
  `opencode run --command <name>`, or by `POST /session/:id/command`. The tool registry
  (`packages/opencode/src/tool/registry.ts`) carries no command tool, so nothing the model emits can
  start one. A command's `agent` and `subtask` frontmatter change which agent executes it, never what
  triggers it.
- **An OpenCode skill is.** A built-in `skill` tool (`packages/opencode/src/tool/skill.ts`, id
  `skill`, one `name` parameter) loads a `SKILL.md` by name, and the available set is injected into
  that tool's description.
- **A skill also registers itself as a slash command.** `packages/opencode/src/command/index.ts`
  iterates `Skill.all()` and registers each with `source: "skill"`. The reverse does not hold, so a
  skill carries both surfaces where a command carries one.
- **Skill names are flat and globally unique**, `^[a-z0-9]+(-[a-z0-9]+)*$`, matching the containing
  directory. OpenCode has no skill namespacing to mirror the `superdev/` command subdirectory.
- **Skill frontmatter recognizes `name`, `description`, `license`, `compatibility` and `metadata`
  only**; anything else is ignored. A skill cannot pin a model.
- **OpenCode has no `disable-model-invocation`.** The consumer-side equivalents are an agent's
  `tools: { skill: false }` and a `permission.skill.<name>: "deny"` rule, both of which live in the
  consumer's own configuration rather than in anything the adapter writes.

Verified live against a real OpenCode install, opencode 1.18.20:

- **2026-09-09 — `opencode debug skill` lists all eleven rendered skills by their `superdev-` names.**
- **2026-09-09 — the `SKILL_MARKER` YAML comment does not disturb OpenCode's frontmatter parsing.**
  A rendered skill carrying that comment still resolved every other field correctly.
- **2026-09-09 — `opencode run --command superdev/afk` resolves the subdirectory-namespaced name.**
  With `--print-logs --log-level DEBUG`, an unknown command name throws inside
  `SessionPrompt.command` before any model lookup, while `superdev/afk` reaches
  `SessionPrompt.getModel` — the command was found.
- **2026-09-10 — OpenCode's `skill` tool returns a skill's body carrying a literal `$ARGUMENTS`.**
  The tool takes only a `name` parameter, so nothing on that surface substitutes Claude Code's own
  command-argument token. The render rewrites it to name the invoking message instead (`renderSkill`
  in `plugin/scripts/adapter.js`).
- **2026-09-10 — a rendered skill's auto-registered slash command does substitute `$ARGUMENTS`.**
  `SessionPrompt.command` replaces the token when the template carries it (`t.arguments`), and when
  the template carries neither `$ARGUMENTS` nor a `$N`, it appends the operator's typed arguments to
  the prompt instead of dropping them. That append fallback is what makes removing `$ARGUMENTS` from
  a rendered skill safe on this second path too, since nothing the operator types is lost either way.

afk is the one superdev surface Claude Code deliberately withholds from the model
(`disable-model-invocation: true`): a model that could start an unattended backlog sweep on its own
judgment is a hazard the plugin does not accept. Rendering afk as a skill would hand OpenCode's model
exactly that button.

## Decision

**The OpenCode render emits skills for the eleven surfaces the operator or the model may invoke, and a
command for afk alone.**

- Eleven surfaces render to `.opencode/skills/superdev-<name>/SKILL.md`, the frontmatter `name` being
  `superdev-<name>`. The `superdev-` prefix is what keeps flat, globally unique skill names from
  colliding with a consumer's own. `upgrade` keeps ADR 0052's synthesized OpenCode body and renders as
  a skill like the rest.
- afk renders to `.opencode/commands/superdev/afk.md`. A command's not being model-invocable is what
  reproduces `disable-model-invocation`, deterministically and with no consumer configuration. The
  operator launches a sweep headless: `opencode run --auto --command superdev/afk`.
- afk's rendered body carries synthesized OpenCode content for its chain step, naming the `skill` tool
  and the `superdev-<name>` names, in place of the Claude Code Skill tool its canonical body names.
  This is ADR 0052's synthesis precedent applied to a second surface.
- The prose rewrite maps `/superdev:<cmd>` to `/superdev-<cmd>`, replacing ADR 0050's
  `/superdev/<cmd>`.
- Cleanup keys on a marker the render writes, never on the bare `superdev-` name prefix, so a
  consumer's own skill whose name begins that way survives a re-render. This is the rule the agent
  render already follows for the shared `.opencode/agents/` directory.
- A drift check pins the split: afk renders as a command and never as a skill, and every surface afk
  chains renders as a skill. The safety property above is otherwise one silent edit away from
  regressing while the suite stays green.

## Consequences

- afk runs on OpenCode. The chain no longer has to be walked by hand, one command at a time.
- `backlog`, `status` and `upgrade` lose their model pin on OpenCode and run on the session's model.
  The pin is a cost optimization and no behaviour depends on it. The six subagents keep theirs, since
  agent frontmatter does support `model`.
- The user-facing OpenCode names change from `/superdev/<name>` to `/superdev-<name>`. A re-render
  over an install made under ADR 0050 clears the old commands tree, so the rename does not strand
  files.
- The render writes two kinds of prompt target instead of one. The split is a contract, not an
  accident, and the drift check above states it.
- A headless `opencode run` denies the `question` tool outright. That suits an unattended sweep, whose
  standing answers exist precisely so nothing is asked; a command that would have asked stops with an
  error, which afk already counts as a block.
- `doom_loop` and `external_directory` default to `ask` and would stall a sweep. `--auto` is what
  clears them, which is why the launch line carries it.

## Considered options

**Render skills alongside the existing commands.** Rejected: every skill auto-registers as a command,
so the operator would see `/superdev-implement` and `/superdev/implement` for one behaviour, with no
way to suppress either — the skill-to-command registration reads `Skill.all()` unfiltered.

**Render afk as a skill and document a `permission.skill` deny.** Rejected: the deny lives in the
consumer's `opencode.json`, which the adapter does not write (ADR 0054 is the standing case for not
reaching into a consumer's permission configuration). A fresh install would be model-invocable until
the operator acted on prose, which is the wrong default for this particular surface.

**Drive the chain from a shell loop over `opencode run`, one invocation per step.** Rejected as the
mechanism here: it moves afk out of the session and makes its selection state, block counting and
report a shell program rather than the prose that already exists and is shared with Claude Code. It
stays the plausible answer for a harness with neither a model-invocable surface nor subagents, which
OpenCode is not.
