# Untraced writes — commits the run trace does not show

## Untraced writes

**`slice-reviewer` and `final-reviewer` read this section**. The run trace records an edit only from an Edit, Write, or
NotebookEdit tool call and a test run only from `scope.js test` and `scope.js fail-to-pass`, so a change made through a shell
command leaves no `edit` line. The commits show every change, and this section reads the two against each other.
`review-checklist.md`'s `## Binding rules` bind every lens below.

**A window** is the stretch of the trace one run of an `implementer` dispatch covers, for one slice or `scope` (`CONTEXT.md` → *Window*).
List a slice's windows with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" windows --slice <id|scope> --root <run-root>`: one line per run,
`<dispatch id> <slice> <from> <until|open>`. Every verb that takes `--window <dispatch id>` reads every run of that dispatch, exactly as
the listing shows it, and a dispatch of another slice running in parallel cuts no window. Read a window's own lines with
`scope.js trace --window <dispatch id> --root <run-root>`. A `lite` slice has no `implementer` dispatch, because the controller builds it
inline, and the listing says it has none: its window is the slice's whole trace, its `edit` lines carry agent `main`, and its range is the
one its ledger row records. A `behavior` slice must record one and any other slice may (`implement-lite.md`), so a `lite` slice with no
recorded range has none to list: the report names the gap.

**The untraced-write listing.** `slice-reviewer` runs it for every full-tier slice and every fix cycle with commits, and
`final-reviewer` (an `unknown` tier reads as `lite`, INV-0056) for the windows `fail-to-pass.md`'s `## Fail-to-pass run` gives it: the `lite` slices and the scope's fix cycles. Run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" untraced <base>..<tip> --slice <id|scope> [--window <dispatch id>] --root <run-root>`.

- `<base>..<tip>` is the range of that window's commits: the slice's range for the build window (the ledger row's range for a `lite`
  slice), and a fix cycle's range for a cycle. Both ends are full commits, and the range runs along the first-parent chain, so a
  merge commit that brings the base in adds none.
- `--slice` is the window's slice field: the slice id, or `scope` for a fix cycle in the scope checkout.
- `--window` is the window's dispatch id, from the `windows` listing. An `edit` line in any run of that dispatch counts as traced. Pass
  none for a `lite` slice.
- Each output line is a path the commits change that no `edit` line of that slice names inside the window: `<added|modified|deleted>`
  and the path, or `renamed`, the new path, and the old path, separated by tabs. The status is the range's net change: a path added
  and then deleted is not listed, and a path modified and then renamed is listed once, as the rename. A later window's `edit` line never hides an earlier
  window's write, because each call passes its own window.
- Where the trace holds no line of `--slice` inside the window, the call lists every changed path and writes one stderr note naming
  the slice: the report names the gap.
- Grade each listed path as a hunk of the diff: read its change under the lenses, and give it the severity the entry it falls under
  states. A write through a shell is no defect of its own: a `git mv`, a formatter, and a generator are ordinary.
- `fail-to-pass-check` (`fail-to-pass.md`'s `### The verdict`) reads every path the range's commits change, a listed one included,
  so a write through a shell reaches the fail-to-pass verdict like any other.
- A call that refuses names the reason: the report names the window the call could not read, and the review raises no finding for it.

**Implementer suite run** — a `run full` or `run whole` line inside an `implementer` window, read with
`scope.js trace --window <dispatch id> --kind run --root <run-root>`. Severity Minor. The implementer owns focused and path runs only (`implementer.md`'s `### Running tests`), and the controller's full and
whole-repo runs fall outside every implementer window. A `run focused` line, a `run path` line, and the controller's lines raise none.
The finding names the line's time, its slice, and its kind.
