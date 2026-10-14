# 0052: OpenCode gets a synthesized, native `upgrade` command instead of exclusion

**Status:** Superseded

**Amended by:** [ADR 0055](0055-the-opencode-render-carries-prompts-as-skills-and-afk-as-a-command.md).

**Superseded by:** [ADR 0102](0102-superdev-is-a-claude-code-only-plugin.md), which makes superdev a Claude Code-only plugin and removes the harness renders.

**Amends:** [ADR 0050](0050-carry-the-plugin-as-skills-canonical-prose-with-install-time-adapters.md),
whose Consequences state "Upgrade is excluded outright, since its body drives Claude Code's own `claude
plugin update`, which has no OpenCode equivalent."

**Context.** ADR 0050 excluded `upgrade` from the OpenCode render because `plugin/skills/upgrade/SKILL.md`
drives `claude plugin update`/`claude plugin marketplace update`, commands with no OpenCode equivalent.
Issue #378 confirmed the exclusion was the right call at the time (an earlier render had shipped the
Claude-only body verbatim, which was worse than nothing). But an OpenCode install already has a real
upgrade path — documented in `README.md`'s **Updating** section as a manual `git pull` in the plugin's
source clone followed by a re-render — that nobody had synthesized into a command.

**Decision.** `plugin/scripts/adapter.js` renders a real `.opencode/commands/superdev/upgrade.md` for
OpenCode. Its content is **wholly synthesized in `adapter.js`**, not derived from
`plugin/skills/upgrade/SKILL.md`'s Claude-Code-only body — the same treatment `renderBridge()` already
gives the hook-bridge plugin, because both are pure harness-mechanics with no prose in common with their
Claude Code counterpart. The synthesized body: `git pull` in the plugin's source clone (the absolute path
baked in, the same mechanism `renderBridge()` already uses for `PLUGIN_ROOT`), then a re-run of the
adapter's own render command against the current directory, then an instruction to start a new OpenCode
session — verified against OpenCode's own plugin docs, which state plugin/command/agent files are "loaded
at startup," with no documented hot-reload, so a fresh session is the correct load point rather than a
guess. `afk` stays excluded; its gap is a different, larger problem (the Skill-tool-chain equivalence ADR
0050 already deferred), not one this decision touches.

**Why.** The hook bridge already established that a rendered surface may be synthesized outright when its
actual content is harness mechanics rather than shared domain prose. `upgrade`'s OpenCode body is exactly
that shape: entirely different commands, no sentence in common with the Claude Code version. Excluding it
was correct only until a synthesized alternative existed; leaving the file out forever would leave every
OpenCode consumer to rediscover the manual two-step process an ordinary user should not have to know.

**Consequences.** OpenCode installs get a real `/superdev/upgrade` command instead of a documented manual
procedure. `renderBridge()` gains a sibling — a second adapter.js-authored template — establishing that a
future harness-mechanics-only surface takes the same synthesized treatment rather than either forcing
single-source prose to cover it or excluding it outright. `README.md`'s **Updating** section and OpenCode
gap paragraph are reconciled by `/superdev:document` to describe the command instead of the manual steps.
