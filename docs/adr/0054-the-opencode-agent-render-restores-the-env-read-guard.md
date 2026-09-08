# 0054: The OpenCode agent render restores OpenCode's own `.env` read guard

**Status:** Accepted

**Amends:** [ADR 0051](0051-the-opencode-agent-render-uses-a-tools-map-not-permission.md), which decided
the rendered agent frontmatter carries a `tools:` map instead of a `permission:` mapping, and states "No
`permission:` block" as the mechanism.

**Context.** OpenCode resolves a subagent's effective permission list as an ordered array, last-match-wins.
Verified live against opencode 1.18.20 (`opencode debug agent <name>`, in a scratch project carrying a
consumer `opencode.json` with `bash: {"rm *": "deny"}` and OpenCode's own built-in
`read: {"*.env": "ask"}` default): the six rendered agents' `tools:` map is converted into `bash: allow *`
and `read: allow *` rules appended at the very end of that array, after the consumer's rules and after
OpenCode's own `.env` default. That silently switches every rendered agent's `.env` read confirmation off,
regardless of whether the consumer customized anything — the baseline case defeats it too. Found by
`/superdev:review`, triage record #379.

Two distinct effects, not one:

- A consumer's own custom rules (e.g. their `bash: {"rm *": "deny"}`) get overridden. This is OpenCode's
  own designed precedence — an agent's own config wins over the global one — so it is not a bug, only
  undocumented.
- OpenCode's own **built-in** `.env` read-ask default gets overridden the same way, with no consumer
  action involved. Nothing chose this; the render's own `tools:` rendering causes it as a side effect.

**Decision.** `renderAgent()` (`plugin/scripts/adapter.js`) emits a `permission:` block after `tools:`,
narrow and pattern-scoped, re-asserting exactly OpenCode's own default:

```yaml
permission:
  read:
    "*": "allow"
    "*.env": "ask"
    "*.env.*": "ask"
    "*.env.example": "allow"
```

Verified live that an agent-level `permission:` entry resolves after the same agent's `tools:`-derived
entries, so this wins and restores the `.env` guard. ADR 0051's decision stands: `tools:` still does the
coarse allow/deny of which tools an agent can call at all, and a bare `permission:` listing of *those*
would still be inert, per 0051's own finding. This is a different, narrower use of `permission:` —
pattern-level re-assertion within one already-enabled tool (`read`) — not a return to using `permission:`
for tool-level access control, so it does not reopen 0051's decision.

**What stays unfixed, on purpose.** A consumer's own custom permission rules — including one that
deliberately *loosens* the `.env` guard at the global level — still get overridden by the six rendered
agents' own config, the same "agent beats global" precedence named above. No verified remedy for that
exists: restoring it would mean parsing and re-merging the consumer's own `opencode.json` at render time,
which is unverified and out of scope here. The OpenCode section of the docs states this precedence
plainly instead of leaving it silent.

**Consequences.** All six rendered agents carry the `permission:` block above. The render is otherwise
unchanged. `docs/agents/issue-tracker.md`'s adapter narrative and the OpenCode section of the docs name
the precedence rule, so a consumer reads it instead of discovering it by surprise.
