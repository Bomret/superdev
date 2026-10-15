# 0102: superdev is a Claude Code-only plugin

**Status:** Accepted

**Supersedes:** [ADR 0050](0050-carry-the-plugin-as-skills-canonical-prose-with-install-time-adapters.md),
[ADR 0051](0051-the-opencode-agent-render-uses-a-tools-map-not-permission.md),
[ADR 0052](0052-opencode-gets-a-synthesized-native-upgrade-command.md),
[ADR 0054](0054-the-opencode-agent-render-restores-the-env-read-guard.md),
[ADR 0055](0055-the-opencode-render-carries-prompts-as-skills-and-afk-as-a-command.md),
[ADR 0056](0056-the-codex-render-withholds-afk-and-accepts-merge-guards-authorship-gap.md),
[ADR 0060](0060-the-render-fixture-stores-an-overlay-not-a-body.md),
[ADR 0100](0100-the-bridge-retries-a-transient-spawn-failure-once.md).

**Amends:** [ADR 0087](0087-a-spawn-that-never-started-is-not-a-spawn-that-was-killed.md).

**Amended by:** [ADR 0155](0155-a-slice-merge-runs-no-test-suite.md), which deletes `plugin/hooks/green-gate.js`,
so the rule of ADR 0087 holds on `plugin/scripts/scope.js` alone.

**Context.** ADR 0050 made the prompt prose skills-canonical and added `plugin/scripts/adapter.js`,
which renders the shipped skills, agents, and hooks for other harnesses. ADRs 0051–0056 and 0060
extended the render for OpenCode and Codex, and ADR 0100 hardened the OpenCode hook bridge. Full
parity was never reachable. Codex cannot fire `merge-guard`, afk is withheld from Codex, and
OpenCode needs a model map (ADR 0056). The render carries a standing cost: each skill or agent edit
regenerates golden fixtures, three drift checks compare them, and the bridge has had its own defect
fixes (#630, #708). No operator runs superdev on another harness.

**Decision.** Claude Code is superdev's only harness.

- `plugin/scripts/adapter.js`, its tests, the OpenCode and Codex golden fixtures, the scripts that
  render them, and the drift checks that compare them are removed. So is the Codex `apply_patch`
  branch in `plugin/hooks/ledger-guard.js`.
- The prompt prose stays in `plugin/skills/<name>/SKILL.md`. Claude Code reads plugin skills
  natively, so the half of ADR 0050 that moved commands to skills stands, restated here.
- Skills, agents, and references name Claude Code features, tools, and frontmatter directly. Prose
  is not written harness-neutral for portability. "Backends are pluggable" covers the slice store,
  the code host, and the knowledge base, and nothing else.
- `/superdev:afk` and `/superdev:ship` carry `disable-model-invocation: true`, and each step afk
  drives stays model-invocable. A drift check pins both halves (INV-0066).
- `v0.54.1` is the last release that carries the harness renders.

This ADR supersedes ADRs 0050, 0051, 0052, 0054, 0055, 0056, 0060, and 0100. It amends ADR 0087: a spawn that never started still carries no verdict on
`plugin/hooks/green-gate.js` and `plugin/scripts/scope.js`, and the bridge half of that decision is
gone with the bridge.

**Consequences.**

- A skill or agent edit no longer regenerates fixtures, and `bun run test` no longer runs the
  adapter suite.
- A consumer on OpenCode or Codex stays on `v0.54.1` or renders from it.
- Returning to another harness starts from `v0.54.1` and a new ADR, not from a revert of this one.

## Considered options

- **Soft freeze.** Keep the adapter, drop its fixtures and drift checks, and label it best-effort.
  Rejected: the adapter decays with no check to show it, and the README keeps a parity claim the
  code does not meet.
- **Extract the adapter to a separate repository.** Rejected: the maintenance moves to another
  repository instead of ending, the parity promise stays, and no operator uses it.
- **Remove the adapter and rewrite all prose for Claude Code in the same change.** Deferred: the
  scope has no clear edge. The prose rule above lets each file change when later work touches it.
