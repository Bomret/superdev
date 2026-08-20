---
type: llm
focus: files
weight: 2
---
The repo tests with node's built-in runner and `node:assert/strict`.

PASS only if every one of the five operations — create, read by id, paged
list, update, delete — has at least one test that asserts on its observable
result, and the failure cases the operations can reach are tested too: at
minimum a read, an update, and a delete against an id that does not exist.

FAIL if an operation ships with no test, if a test asserts nothing (calls the
code and checks no value), or if a test only asserts that no exception was
thrown. FAIL if the tests reach behind the request entry point to assert on
store internals in place of the response a caller observes.

Test file count, test naming, and how the tests are grouped do not matter.
