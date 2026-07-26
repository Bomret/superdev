---
type: llm
focus: files
weight: 1
---
The repo is a dependency-free ESM service: one store module, one handler
function, one test directory. The feature asked for is a single endpoint.

PASS if the diff stays proportionate: the endpoint, its tests, and the doc
update.

FAIL if the diff adds machinery nobody asked for — a new dependency in
`package.json`, a router or middleware abstraction, a config file or options
object for values that never vary, an interface or base class with one
implementation, a service/repository layer wrapping the two-function store, or
error classes for cases that cannot occur.

Splitting the handler into small functions is not over-building; introducing a
framework to do it is.
