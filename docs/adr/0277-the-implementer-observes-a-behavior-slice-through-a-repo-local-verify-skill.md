# 0277: The implementer observes a behavior slice through a repo-local verify skill

**Status:** Accepted

**Context.** The implementer proves a slice through tests alone. Green tests do not show that the feature works for
its user, and that surfaces only after the merge, in `/superdev:verify-ship` or by hand. The implementer has no
Skill tool. A subagent's `skills:` frontmatter preloads a skill by a fixed name, a plugin agent resolving a
repository's own skill by that name is undocumented, and a missing skill is skipped with only a debug-log warning
([subagents](https://code.claude.com/docs/en/sub-agents.md), checked 2026-11-23).

**Decision.** A repository keeps the procedure to start, drive, inspect, and stop its running app in its own
`.claude/skills/verify/SKILL.md`, which `/superdev:setup` scaffolds. `docs/agents/verification.md` names that file's
path, or `none`, in one section. `/superdev:implement` hands the path in every `behavior` slice dispatch and slice
fix dispatch, and the controller applies the same rule to a slice it builds inline. The implementer reads the file by that path and follows it against its own change. Its self-check
quotes what it observed per acceptance item it exercised, and the slice reviewer judges those observations as a
claim, like every other self-check line. A named path missing in the checkout is a concern, never `none`.

**Considered options.**

- **The procedure inline in `docs/agents/verification.md`.** Rejected: a skill stays usable outside superdev, as the
  operator's `/verify`, and the configuration file stays a pointer.
- **A separate exerciser agent as a second grader.** Rejected: the implementer and slice reviewer already exist, and
  tuning one reviewer costs less than stacking a second one.
- **A traced `scope.js` verb recording the skill's exit status and an artifact.** Rejected: a skill is a multi-step
  procedure, so one exit status proves little, and the verb costs code the claim check does not need.
- **Preloading through the agent's `skills:` frontmatter.** Rejected: the field names a fixed skill, where the path
  is per-repository configuration, and a missing skill is skipped silently.

**Consequences.** Every repository with no section, or with `none`, sees no change. The skill states how two
slicetrees run it side by side, which untracked inputs a slicetree needs, and what state its own instance may touch,
because the full tier starts several implementers at once. The scaffold carries `disable-model-invocation: true`, so only the operator runs it as `/verify` and no session starts the app unasked. `/superdev:setup` drafts and writes the skill and runs none of its steps.
