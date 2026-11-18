# 0252: A scope that changes only test paths gets no doc pass

**Status:** Accepted

**Amends:** [ADR 0219](0219-every-doc-pass-gets-a-reader-test.md), which holds for every scope this
decision does not skip.

## Context

`/superdev:document` dispatches a doc-writer and, under ADR 0219, a doc-reader for every doc pass whose
file list holds a doc. Between 2026-11-10 and 2026-11-17, 12 of 37 document sessions changed nothing and
still dispatched both agents. Several of the scopes behind them changed only tests.

A scope whose every changed path is a test-path file changes no behaviour a doc describes. The test paths
are `docs/agents/verification.md`'s `## Test paths`, or the defaults where it has none.

## Decision

`/superdev:document` skips the doc pass when every path the scope changes is a test-path file. It
dispatches no writer and no reader, stages no knowledge-base page, says in one line why it skipped, and
records the docs step as done. Every other scope runs the doc pass as ADR 0219 states.

## Considered options

- *Skip the reader when the writer changed nothing.* Rejected: ADR 0219 added the reader for that case,
  because the writer's claim that the docs are current was otherwise unchecked.
- *Skip the pass when no changed path is named in any doc.* Rejected: a doc describes behaviour without
  naming the path that implements it, so the skip would hide drift.

## Consequences

A test-only scope reaches `/superdev:submit-pr` with no doc agents. A doc that describes the test suite
itself, such as a testing guide, is not reconciled by a test-only scope's pass. It is reconciled by the next
scope that changes a non-test path, or by `/superdev:document audit`.
