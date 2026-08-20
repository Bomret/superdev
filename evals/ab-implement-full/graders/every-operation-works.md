---
type: llm
focus: files
weight: 3
---
The feature named five operations over the widget store: create, read by id,
list page by page, update, and delete. The repo started with read by id
already working.

PASS only if the diff implements all five, reachable through the request
entry point the repo already had, and each one behaves as a caller would
expect: a create that stores a new widget and reports it, a paged list that
honours whatever page parameters it accepts, an update that changes a stored
widget, and a delete that removes one. Reading a widget that does not exist,
updating one that does not exist, and deleting one that does not exist each
produce an observable failure response rather than a crash or a silent
success.

FAIL if any operation is missing, stubbed, left as a `TODO`, or implemented
only in a test. FAIL if paging is accepted as a parameter and then ignored.

Judge the behaviour wherever it lands and in whatever shape. Any file layout,
any routing style, and any parameter names are acceptable.
