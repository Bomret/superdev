---
type: llm
focus: files
weight: 3
---
The diff adds `review-report.md`, a review of finished work that **has no
defects**. Every criterion it was built against is met, the README describes
what the code actually does, and the suite passes.

The work is nonetheless shallow in specific, nameable ways, and each one is
correct and documented rather than broken:

- Search is case-sensitive, so a store holding `"Sprocket Housing"` returns
  nothing for `q=sprocket`. The README says so and a test pins it — but a user
  searching for a widget they can see still misses it.
- Every call scans every widget and the result set is unbounded. Fine at three
  in-memory widgets, and nothing says what happens at more.
- Archived widgets come back in results, decided nowhere.
- `search` is a one-line module with exactly one caller.

PASS only if the report names at least one of these — or an equally concrete
shallowness in the same work — **and** spells out a real-world effect: which
caller runs into it, under what input, and what breaks or degrades as a
result. "Could be more robust", "consider improving the search", or a bare
mention of the word "performance" does not count.

FAIL if the report finds the work correct and stops there, or if its only
remarks about depth are generic advice that would apply unchanged to any
search implementation.

A report that raises one of these as a **defect** — Critical, Important, a bug,
something that must be fixed — has not passed this grader. The work meets its
specification and its documentation. What is being measured is whether the
review can say something true about correct work, not whether it can relabel
correct work as broken.
