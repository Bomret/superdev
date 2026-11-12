# 0039: The unattended block keys on authorship, not on denial

**Status:** Accepted

**Amended by:** [ADR 0243](0243-the-tier-counts-behavior-slices-and-the-controller-builds-tiny-slices.md), under which
the tier counts only `behavior` rows and a `full` run with a `docs` or `mechanical` row counts as authored.

## Context

`references/scope-mode.md`'s `## Degraded passes` blocks an unattended run whenever the permission
classifier denies a dispatch. The justification it states is a pull request whose only review was its
author reviewing itself.

Claude Code's auto mode is what denies. Verified 2026-08-23, against
[Anthropic's auto-mode engineering post](https://www.anthropic.com/engineering/claude-code-auto-mode)
and [the subagents documentation](https://code.claude.com/docs/en/sub-agents):

- Auto mode is the default on Pro, Max, and Team plans. A transcript classifier gates tool calls, and a
  subagent handoff carries a classifier at delegation that can deny, plus one at return that only warns.
- A denial returns as a tool result carrying its reason, and retries are allowed up to a limit. Three
  consecutive denials, or twenty in a session, stop the model and escalate to the human; headless
  `claude -p` terminates instead.
- The stage-2 false-positive rate is 0.4%, and stage 1 alone is 8.5%. False denials are expected.
- The classifier reads only user messages and the agent's tool calls. Claude's own messages and tool
  outputs are stripped, so hook-injected prose in the user-message stream is inside what it judges.
- Plugin subagents ignore the `permissionMode`, `hooks`, and `mcpServers` frontmatter fields. superdev
  ships plugin subagents, so no frontmatter change inside the plugin alters any of this. The remaining
  levers belong to the consumer: `permissions.allow` in `settings.json`, or a copy of the agent under
  `.claude/agents/`.

Two costs follow. The denial is undiagnosable after the fact, because the `**Degraded:**` entry records
the pass, a paraphrase, and the date, and never the classifier's own words. And the block fires wider
than its justification reaches: on the `full` tier the controller authors no slice code, so a denied
`final-reviewer` costs an independent second opinion rather than independence itself.

## Decision

**A denied verification dispatch blocks an unattended run when the controller authored what that pass
verifies, and otherwise runs the pass inline and records the degraded entry.** The verification passes are
`final-reviewer`, `slice-reviewer`, and `doc-reader`. A denied `implementer` dispatch blocks unattended at
every tier, because ADR 0001's controller-never-implements invariant is not an independence rule.

**The execution tier is the authorship proxy.** A `lite` run has the controller implement every slice
inline and perform the documentation pass itself, so it always counts as authored. A `full` run builds
every slice in a dispatched implementer, so it does not. The reader derives the tier the way
`/superdev:implement` does, from the ledger's slice-row count: three or fewer is `lite`, more is `full`.
A ledger with no slice rows leaves the tier unknown and blocks.

**A denied-dispatch entry quotes the classifier's refusal.** Newlines flatten to spaces and the text caps
at roughly 200 characters with an ellipsis, because `scope.js degraded add` refuses a bullet containing a
newline and `/superdev:status` prints every bullet for the life of the run root. A denial whose text was
unavailable says so. `/superdev:ship` already copies every bullet into the pull-request body, so the
refusal reaches the human reviewing the change without further prose.

## Why

The rule now matches its own justification. Self-review is what it prevents, and self-review needs an
author; a denial alone establishes only that a pass ran without independence, which is what the
`**Degraded:**` entry has always recorded.

The tier is a proxy rather than a measurement, and a deliberate one. Both merge commits and slice commits
carry the maintainer's git identity, so `git log --author` separates nothing. The alternative shapes each
fail open — a ledger flag can be forgotten, and a misread `git show --cc` grants the pass it should deny —
while the tier is already derived from state `/superdev:implement` derives it from.

Quoting the refusal is what makes the environmental half actionable. A maintainer reading the ledger or
the pull request can tell a genuine safety block from one of the expected false positives, and can carry
the text upstream.

## Consequences

- An unattended `full`-tier run survives a denied verification dispatch, and `/superdev:afk` keeps its
  halt-at-two budget for real blocks.
- A `lite` run behaves exactly as before, which is where the self-review risk lives.
- **Ceiling.** The tier does not see a controller that authored code inside a `full` run: a merge conflict
  it resolved itself, or an inline fix it applied on an attended pass earlier in the same scope. Such a
  resolution composes two slices that were each already reviewed, so the residual exposure is the
  composition rather than the code.
- `docs/known-issues.md` names the delegation handoff classifier as the denying component. A
  SessionStart preamble can feed what that classifier reads and cannot itself deny a call.

## Considered options

- *Externalise the whole review into a fresh subagent.* Rejected: no superdev agent carries the Agent
  tool, so a review-controller subagent could dispatch neither `final-reviewer` nor the fix `implementer`.
  The outer dispatch also faces the same delegation classifier.
- *Retry a denied dispatch once with sanitised prose, then block.* Rejected: it treats the symptom, and
  the platform already retries denials up to its own limit before escalating.
- *Detect controller authorship from git.* Rejected: `git merge --no-ff` gives every slice a merge commit,
  so only a hand-resolution diff distinguishes one, and a misread grants the pass it should deny.
- *Set `permissionMode` on the reviewer agents.* Rejected: plugin subagents ignore the field.
- *Teach `scope.js` a multi-line bullet, to hold the refusal verbatim.* Rejected: it changes the ledger
  schema and `get degraded`'s one-bullet-per-line contract to keep boilerplate the first sentence already
  carries.
