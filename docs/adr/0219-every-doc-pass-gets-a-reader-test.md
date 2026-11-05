# 0219: Every doc pass gets a reader test

**Status:** Accepted

**Amends:** [ADR 0031](0031-the-lite-tier-writes-its-own-documentation.md): an inline doc pass no longer spares the doc-writer.

## Context

`/superdev:document` skipped the reader test when the doc-writer changed nothing, and on a lite-tier run
whose inline doc pass touched no doc file. In both cases the only artifact of the pass was the writer's
claim that the docs agree with the code, and nothing checked it. On a lite-tier run whose inline pass did
change docs, the reader tested only the doc files the scope's commits changed. The docs the inline pass
read and judged current never reached it.

The reader test also kept software knowledge-base pages out of its scope. A page staged for a remote
backend under `.superdev/kb-pending/<scope>/` was read by no gate between staging and
`/superdev:publish-kb`. On the lite tier the controller's inline pass stages pages before
`/superdev:review`, and a review fix cycle can make them false. On `feat/reachability-criterion` two
staged pages stated a rule that three fix cycles had removed, and only an operator instruction caught it.

Triage record #1 also asked whether a mechanism, rather than a prose rule, can make a dispatched agent's
claim checkable in general.

## Decision

The reader test runs on every doc pass.

- A doc-writer that changed nothing names, in its report, each doc it judged current. The reader tests
  those docs.
- A doc-writer that changed some docs also names the docs it judged current, and the reader tests both.
- A doc-writer that judged no doc relevant states its reason. The report relays the reason and says the
  reader had no in-repo doc to test.
- On a live run, `/superdev:document` dispatches the writer whatever the inline-doc-pass record reads.
  On a lite-tier run the writer runs after the inline pass and names the docs it judged current.
- While the inline-doc-pass record stands, the reader's commit range is the scope's own commits
  `<range-base>..<branch>`. That range holds the writer's commits too, so the reader's writing-standard
  pass judges every doc line the inline pass, the slices, and the writer added. Every other pass hands
  the writer's `<first>^..<last>`, or no range when the writer committed nothing.
- Every page staged under the run's staging path whose action is not `delete` is on the reader's file
  list, on every path through `/superdev:document`. The reader grounds it against the scope's code: the
  scope checkout on a live run, the current checkout on an ad-hoc run. A page's frontmatter and its links
  into the backend are no repository claims. The reader's range pass judges added lines in git, so it
  does not judge a staged page's prose. A finding on a staged page goes through
  the existing fix round, whose writer dispatch carries the staging path. A `delete` page states no claim
  about the code, and the reader does not read it.

No hook enforces the reader dispatch. The answer to the general question is that superdev has no general
mechanism that makes a dispatched agent's claim checkable. Each such claim gets its own check, such as
the fail-to-pass run (ADR 0134) or this reader test.

## Considered options

- **The writer cites its evidence, and the skip stays.** Rejected: the report would still be the writer's
  own word, checked by nobody.
- **The lite pass records the docs it judged current in the ledger.** Rejected: the `docs` record holds
  one token, and a file list needs a new record format and reader. Dispatching the writer reuses the
  existing path.
- **Dispatch the writer only when the scope's commits changed no doc file.** Rejected: on a lite-tier run
  whose slices changed a doc, the reader would test only that doc, and the docs the inline pass judged
  current would still go untested.
- **The doc pass re-reads and corrects the pages already staged.** Rejected: a re-read by the writer is
  still the writer's own word, which is the gap the reader test closes.
- **A Stop hook that holds a `/superdev:document` turn with no reader dispatch.** Rejected: the gap was one
  prose rule, and removing that rule removes its cause. A hook adds a guard with its own failure modes.
  The run trace records every dispatch, so a missing reader stays visible after the fact.

## Consequences

A doc pass that changed nothing costs one reader dispatch. A full reconcile that changed nothing has the
reader test every doc the writer judged current. Every lite-tier run costs one writer dispatch after its
inline pass, which gives back part of the saving ADR 0031 made. The ledger's `**Docs:**` record does not
decide whether `/superdev:document` dispatches the writer. It decides the reader's commit range, so the
doc lines the inline pass wrote stay under the writing-standard check.
