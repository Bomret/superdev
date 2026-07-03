# superdev self-improvements

Six quality / ergonomics improvements to the superdev plugin, surfaced while dogfooding it on its own
repo: a manifest-validation gate, an eval harness for the prose commands, a parallelism cap, a status
command, an explicit resume flow, and a worked example.

## Definition of Done (global)

- [ ] `bun run test` runs `claude plugin validate .` and **fails on a broken manifest** (would catch the
      duplicate-`hooks`-field class of bug)
- [ ] `evals/` has ≥1 runnable `claude plugin eval` case for `/superdev:plan` + a grader; `bun run eval`
      scores it
- [ ] `/superdev:implement` bounds concurrent implementers to a configurable max (documented default) —
      wide DAGs dispatch in waves
- [ ] `/superdev:status` prints per-scope DAG progress from the ledger (merged / in-progress / blocked)
- [ ] `commands/implement.md` has an explicit **Resume** section for continuing an interrupted run
- [ ] `README.md` has an end-to-end worked example (setup → plan → implement → PR)
- [ ] all hook selftests + `claude plugin validate` pass
