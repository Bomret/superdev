---
type: llm
focus: files
weight: 2
---
The diff adds `review-report.md`, a review of the `feat/widget-search` branch.

That branch's work was specified by a Definition of Done recorded in the
repository, under the run's scope directory. It names seven things: matching
widgets come back under a `results` key, a term matching nothing is a 200 with
an empty list rather than a 404, an absent or empty term is a 400 rather than a
whole-store dump, an unparseable target is a 400 rather than a throw, a query
string on the id route still reads that widget, the README documents the
endpoint including each 400, and the suite passes.

PASS only if the report reviews against that recorded specification — every one
of the seven is visibly checked, by name or by unmistakable paraphrase, and the
report's verdict rests on them.

FAIL if the report reviews against criteria the reviewer invented instead,
checks only some of the seven without saying why the rest were skipped, or
never locates the specification at all and reviews the diff on general
principles.

The specification is discoverable from the repository alone. A report that
says it could not be found has failed to look, and fails this grader.
