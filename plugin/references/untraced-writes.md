# Untraced writes — commits the run trace does not show

## Untraced writes

**`slice-reviewer` and `final-reviewer` read this section**. The run trace records an edit only from an Edit, Write, or
NotebookEdit tool call and a test run only from `scope.js test` and `scope.js fail-to-pass`, so a change made through a shell
command leaves no `edit` line. The commits show every change, and this section reads the two against each other.
`review-checklist.md`'s `## Binding rules` bind every lens below.

**A window** is the stretch of the trace one run of an `implementer` dispatch covers, bounded as `fail-to-pass.md`'s `### Fix cycles`
defines a fix cycle's window. A slice's boundary lines are those whose second field is the slice id, so a
dispatch of another slice running in parallel cuts no window. A line belongs to a window when its time lies inside it and its slice
field is the window's slice. A `lite` slice has no `implementer` dispatch, because the controller builds it inline: its window is
the slice's whole trace, its `edit` lines carry agent `main`, and its range is the one its ledger row records. A `behavior`
slice must record one and any other slice may (`implement-lite.md`), so a `lite` slice with no recorded range has none to list: the report names the gap.

**The untraced-write listing.** `slice-reviewer` runs it for every full-tier slice and every fix cycle with commits, and
`final-reviewer` for the windows `fail-to-pass.md`'s `## Fail-to-pass run` gives it: the `lite` slices and the scope's fix cycles. Run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" untraced <base>..<tip> --slice <id|scope> [--from <ts>] [--until <ts>] --root <run-root>`.

- `<base>..<tip>` is the range of that window's commits: the slice's range for the build window (the ledger row's range for a `lite`
  slice), and a fix cycle's range for a cycle. Both ends are full commits, and the range runs along the first-parent chain, so a
  merge commit that brings the base in adds none.
- `--slice` is the window's slice field: the slice id, or `scope` for a fix cycle in the scope checkout.
- `--from` is the time of the window's first line and `--until` the time of the boundary line that ends it, copied from the trace.
  Omit `--until` where the window runs to the end of the trace, and omit both for a `lite` slice.
- Each output line is a path the commits change that no `edit` line of that slice names inside the window: `<added|modified|deleted>`
  and the path, or `renamed`, the new path, and the old path, separated by tabs. The status is the range's net change: a path added
  and then deleted is not listed, and a path modified and then renamed is listed once, as the rename. A later window's `edit` line never hides an earlier
  window's write, because each call passes its own window.
- Grade each listed path as a hunk of the diff: read its change under the lenses, and give it the severity the entry it falls under
  states. A write through a shell is no defect of its own: a `git mv`, a formatter, and a generator are ordinary.
- A listed path counts as an `edit test` event where it is a test path and as an `edit impl` event otherwise, for **Missing
  fail-to-pass run**. A slice or a fix cycle with untraced writes and no `edit` line is held to that rule like any other.
- A call that refuses names the reason: the report names the window the call could not read, and the review raises no finding for it.

**Implementer suite run** — a `run full` or `run whole` line inside an `implementer` window, by time and slice. Severity Minor. The implementer owns focused and path runs only (`implementer.md`'s `### Running tests`), and the controller's full and
whole-repo runs fall outside every implementer window. A `run focused` line, a `run path` line, and the controller's lines raise none.
The finding names the line's time, its slice, and its kind.
