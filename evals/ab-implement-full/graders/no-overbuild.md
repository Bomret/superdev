---
type: llm
focus: files
weight: 1
---
The repo is a dependency-free ESM service: one store module, one handler
function, one test directory. The feature asked for is five operations over
that store, plus one header check.

PASS if the diff stays proportionate: the operations, the key check, their
tests, and the doc update.

FAIL if the diff adds machinery nobody asked for — a new dependency in
`package.json`, a routing or middleware framework, a config file or options
object for values that never vary, an interface or base class with one
implementation, a service or repository layer wrapping the store's handful of
functions, a validation library, an event or plugin system, or error classes
for cases that cannot occur.

Five operations legitimately need more code than one. Splitting the handler
into per-operation functions, adding a small route table, or extending the
store with the operations it lacks is not over-building; introducing a
framework to do any of it is.
