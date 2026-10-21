# 0162: A test audit also finds test gaps

**Status:** Accepted

**Amends:** [ADR 0066](0066-a-measured-test-audit-is-its-own-surface.md). Its cost audit stands unchanged.
A test audit prices the tests that exist and also finds the gaps they leave.

## Context

A repository adopting superdev carries code written before superdev, or outside it. Some of that code has
no test at all. Other code has tests for the success path only, with no test for a null, empty, negative,
out-of-range, or invalid argument, or for a failure path. No superdev surface finds these gaps.
`/superdev:review-tests` prices the tests that exist (ADR 0066). The *happy-path-only suite* lens in
`references/review-checklist.md` reaches a diff only, and judges it against the acceptance criteria of a
Definition of Done. Standing code outside any scope has neither.

## Decision

`/superdev:review-tests` runs two audits on every run: the **cost audit** of ADR 0066, unchanged, and a
**gap audit**. The `[path]` argument narrows the cost audit's test set and the gap audit's source set. The
gap audit still searches the repository's whole test-file list, so a narrowed source path meets every test.

- **Source set.** The gap audit reads every tracked code file outside the repository's test paths: the
  `## Test paths` section of `docs/agents/verification.md`, or its defaults when that section is absent
  (`references/test-selection.md`). It skips docs, configuration (dot-prefixed files among it), lockfiles, and binary assets such as images, fonts, archives, media, and native binaries. It also skips
  vendored directories at any depth, the generated `dist/` and `build/` directories at the repository root,
  and every index entry that is no regular file on disk, such as a submodule or a file deleted from the
  working tree. The test-file list is the tracked files that the test paths class as tests, so no file is in
  both lists. No new configuration section exists for it.
- **Agent.** A new subagent, `test-gap-auditor`, reads a batch of source files together with the list of
  test files, and reports gaps. Its lens is the `## Test gaps` section of `references/review-checklist.md`,
  which only that agent reads, as only `test-auditor` reads `## Test cost`.
- **Fan-out.** A gap is a property of one symbol. Redundancy is a property of a pair. So the gap audit may
  split its source set into directory batches and dispatch them in parallel, and the cost audit stays one
  `test-auditor` pass over the whole test tree.
- **Categories.** `untested` is a symbol no test reaches. A file no test reaches at all yields one
  `untested` finding for the file, listing its exported symbols, so a repository with few tests gets a
  bounded report. `missing case` is a symbol whose tests leave a named argument class or scenario
  untested. Every gap finding names the symbol and the missing case.
- **Evidence.** The gap audit reads statically, with no coverage tool. Every gap finding is a judgment
  labelled `static`.
- **Ranking.** Gap findings rank by risk: a trust boundary first (parsing external input, I/O,
  authentication, money), then exported symbols, then internal ones. Ties break on the number of untested
  branches. Gap findings have a table of their own, apart from the cost table.
- **Agreement round.** The one `AskUserQuestion` call holds two multi-select questions, one for cost
  findings and one for gap findings. Findings past the round's capacity reach the intent labelled
  `unconfirmed`, as before (INV-0071).

## Consequences

The test audit costs more on a large repository, because the gap audit reads the source as well as the
tests and may dispatch several agents. A repository with no test file still gets a gap audit, where the
cost audit has nothing to price. A static read can miss a symbol that an integration test reaches
indirectly, so an `untested` finding is a judgment the operator can reject. A configured coverage command
would turn an untested line into a fact; it is not part of this decision.

## Considered options

- *A sixth lens on `test-auditor`.* Rejected: one context cannot hold a legacy repository's source and
  tests together, and a cost ranking cannot rank a gap, which costs nothing yet.
- *Relaxing the happy-path-only lens to standing code in `/superdev:review`.* Rejected: review resolves one
  path at a time and builds no map from symbols to tests, so a whole-repository gap map is outside its shape.
- *A separate `/superdev:review-gaps` surface.* Rejected: it keeps the test audit's identity narrow, but
  adds another always-loaded skill description, a fifth `/superdev:sweep` leg, and more drift rows.
- *A gap mode on `test-auditor`.* Rejected: the agent's five categories are its whole set, and its
  one-pass contract would hold for one mode only.
- *A `## Source paths` section in `docs/agents/verification.md`.* Rejected: one more section an operator
  writes and setup offers, where the inverse of the test paths already names the source.
- *A configured coverage command.* Deferred: it needs per-format parsing (lcov, Cobertura), and a static
  read already delivers the gap map.
