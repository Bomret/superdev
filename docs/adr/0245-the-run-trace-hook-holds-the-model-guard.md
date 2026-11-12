# 0245: The run-trace hook holds the model guard

**Status:** Accepted

## Context

Every `Agent` dispatch started two Node processes on PreToolUse: `hooks/model-explicit.js`, which denied a dispatch to
one of superdev's own agents that set no explicit `model`, and `hooks/run-trace.js`, which records the dispatch in the
run trace ([ADR 0117](0117-the-run-trace-is-hook-written-evidence.md)). Node's startup alone is about 30 ms, so the
second process doubled the hook CPU cost of a dispatch. Measured on the maintainer's machine, alternating runs with a
realistic Agent payload: `model-explicit.js` took a median of 34.3 ms and `run-trace.js` 39.3 ms. After this change
`run-trace.js` alone takes 39.3 ms.

The two hooks fail differently. `run-trace.js` records nothing and exits 0 when one of its `plugin/lib/` modules fails to
load. `model-explicit.js` required no module, so its deny never depended on a load.

## Decision

1. `hooks/model-explicit.js` is removed. `hooks/run-trace.js` holds its `OURS` pattern and its `decide()` function and
   exports both. `hooks.json` registers `run-trace.js` alone on PreToolUse(Agent).
2. The guard requires no module, so the deny holds when a `plugin/lib/` module fails to load. It runs on PreToolUse
   alone, so the PostToolUse, PostToolUseFailure, and PermissionDenied events on `Agent` never deny.
3. The deny keeps its exit code 2 and its stderr text, `(model-explicit)` suffix included. The hook records the dispatch
   before it denies, as the two parallel hooks did.
4. The guard's tests move to `tests/run-trace-model.test.js`, a topic split of the run-trace suite, which also runs the
   hook as a process to check the deny's exit and stderr.

## Consequences

A dispatch starts one hook process on PreToolUse instead of two. A denied dispatch keeps a dispatch line with no end
in the run trace, as it did before; the session's next Stop, UserPromptSubmit, or SessionEnd ends it with the outcome `unknown`. The name
`model-explicit` survives only in the deny's text and in prose that cites the guard.
