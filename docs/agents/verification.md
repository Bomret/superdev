# Verification

The repo's test command. It arms the merge green-gate, so re-run it after every controller merge:

```sh
bun run test
```

**No focused test command, deliberately.** This suite finishes in seconds, so narrowing a run saves
nothing worth the second block, and every caller runs the full command
(`references/test-selection.md`, ADR 0025).
