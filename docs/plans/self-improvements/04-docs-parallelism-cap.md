# 04 — Parallelism cap in /implement

depends-on: []
test-applicability: docs
status: todo

## spec

In `commands/implement.md` §3 (DAG loop), bound the number of implementers dispatched **concurrently** to
a configurable max (default ~4; note how to scale up/down). When the runnable set exceeds the cap,
dispatch in waves rather than all at once — framed as cost + merge-queue control ("pilot before a large
run"). Dependency semantics are unchanged; only concurrency is capped.

## acceptance

- implement.md §3 documents a default max-concurrent-implementers and wave dispatch when the runnable
  set exceeds it.
- The cap is stated as configurable / overridable.
- No change to `depends-on` / DAG semantics.
