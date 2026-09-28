# 0051: The OpenCode agent render denies by a `tools:` map, not a `permission:` mapping

**Status:** Superseded

**Superseded by:** [ADR 0102](0102-superdev-is-a-claude-code-only-plugin.md), which makes superdev a Claude Code-only plugin and removes the harness renders.

**Amended by:** [ADR 0054](0054-the-opencode-agent-render-restores-the-env-read-guard.md), which adds a
narrow `permission:` block back for the `.env` read guard, without reopening this ADR's `tools:` decision.

**Amends:** [ADR 0050](0050-carry-the-plugin-as-skills-canonical-prose-with-install-time-adapters.md),
whose Decision names the rendered agents' access control as "a permission mapping".

**Context.** ADR 0050 recorded the OpenCode agent render as carrying "a permission mapping" from each
Claude `tools:` entry. Verified live against opencode 1.18.20 (`opencode debug agent`): OpenCode's
`permission:` config overlays an allow-by-default baseline, so listing only the allowed tools there
restricts nothing — the mechanism ADR 0050 described never denied a tool.

**Decision.** The rendered agent frontmatter carries a `tools:` map instead: a leading `"*": false`
(OpenCode's `tools:` map is last-match-wins, so the wildcard must lead) denies every tool, then `true`
entries name exactly what the Claude allowlist allows, plus `invalid` — OpenCode's tool-call repair
sink, excluded from the model's own tool schema by construction, so denying it buys no security and
only breaks call repair. The decision ADR 0050 made — that OpenCode's rendered subagents carry access
control alongside the resolved model — stands unchanged; only the named mechanism was wrong.

**Why.** ADR 0050's underlying decision still holds: a rendered OpenCode subagent needs the same tool
access control its Claude Code frontmatter carries. Superseding it would mark that decision as replaced,
which is false. Amending leaves the record intact and adds only the mechanism correction.

**Consequences.** ADR 0050's own Decision text is unchanged; its `**Amended by:**` pointer sends a
reader here for the corrected mechanism. No behavior beyond the render's own frontmatter changes: the
six rendered subagents keep the same effective access — a read-only Claude agent stays read-only under
OpenCode. `plugin/scripts/adapter.js`'s `renderAgent()` and `scripts/AGENTS.md`'s `adapter.js` section
now name the actual mechanism, so drift-check's ADR-narrative checks and any future reader find the code
and the record in agreement.
