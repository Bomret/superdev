# Verification

The repo's test command. It arms the merge green-gate, so re-run it after every controller merge:

```sh
bun run test
```

**No focused test command, deliberately.** The suite is already cheap: it finishes in seconds, so a
cheaper command saves nothing worth the second block, and every caller runs the full command
(`references/test-selection.md`, ADR 0025, ADR 0074).

**No timing command, deliberately.** The whole suite finishes in seconds and its files print no per-test
durations, so a cost table ranked on them would order noise. A test audit of this repository runs
`unmeasured` and ranks by judgment (`references/test-selection.md`, ADR 0066).
