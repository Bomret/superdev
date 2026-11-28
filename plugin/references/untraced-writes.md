# Untraced writes — commits the run trace does not show

## Untraced writes

**Its readers.** Applies to `slice-reviewer` and `final-reviewer`. The run trace records an edit only from an Edit,
Write, or NotebookEdit tool call, and a test run only from `scope.js test` and `scope.js fail-to-pass`. Read the
commits, which show every change, against the trace.

- `review-checklist.md`'s `## Binding rules` bind every lens of this section.

**A window.** Applies to every window this section names. A **window** is the stretch of the trace one run of an
`implementer` dispatch covers, for one slice or `scope` (`CONTEXT.md` → *Window*). List a slice's windows with `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" windows --slice <id|scope> --root <run-root>`: one line per run, `<dispatch
id> <slice> <from> <until|open>`.

- Every verb that takes `--window <dispatch id>` reads every run of that dispatch, exactly as the listing shows it. A
  dispatch of another slice running in parallel cuts no window.
- Read a window's own lines with `scope.js trace --window <dispatch id> --root <run-root>`.
- **A `lite` slice** → it has no `implementer` dispatch, and the listing says so. Its window is the slice's whole
  trace, its `edit` lines carry agent `main`, and its range is the one its ledger row records. A `lite` slice with no
  recorded range has none to list: the report names the gap.

**The untraced-write listing.** Applies to `slice-reviewer` for every full-tier slice and every fix cycle with
commits, and to `final-reviewer` (an `unknown` tier reads as `lite`, INV-0056) for the windows `fail-to-pass.md`'s
`## Fail-to-pass run` gives it: the `lite` slices and the scope's fix cycles. Run `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" untraced <base>..<tip> --slice <id|scope> [--window <dispatch id>] --root
<run-root>`.

- `<base>..<tip>` is the range of that window's commits: the slice's range for the build window (the ledger row's
  range for a `lite` slice), and a fix cycle's range for a cycle. Both ends are full commits, and the range runs along
  the first-parent chain, so a merge commit that brings the base in adds none.
- `--slice` is the window's slice field: the slice id, or `scope` for a fix cycle in the scope checkout.
- `--window` is the window's dispatch id, from the `windows` listing. An `edit` line in any run of that dispatch counts
  as traced. Pass none for a `lite` slice.
- Each output line is a path the commits change that no `edit` line of that slice names inside the window:
  `<added|modified|deleted>` and the path, or `renamed`, the new path, and the old path, separated by tabs. The status
  is the range's net change: a path added and then deleted is not listed, and a path modified and then renamed is
  listed once, as the rename. A later window's `edit` line never hides an earlier window's write.
- **No line of `--slice` inside the window** → the call lists every changed path and writes one stderr note naming
  the slice: the report names the gap.
- **A call that refuses** → the report names the window the call could not read, and the review raises no finding
  for it.

**Grading a listed path.** Applies to every path the listing prints. Read its change under the lenses as a hunk of the
diff, and give it the severity the entry it falls under states.

- **A write through a shell** → no defect of its own: a `git mv`, a formatter, and a generator are ordinary.
- `fail-to-pass-check` (`fail-to-pass.md`'s `### The verdict`) reads every path the range's commits change, a listed
  one included.

**Implementer suite run.** Applies to a `run full`, `run whole`, or `run timing` line inside an `implementer` window, read with
`scope.js trace --window <dispatch id> --kind run --root <run-root>`. Report it as a Minor finding naming the line's
time, its slice, and its kind. The implementer owns focused and path runs only (`implementer.md`'s `### Running
tests`).

- A `run focused` line, a `run path` line, and the controller's own lines, which fall outside every implementer
  window, raise none.
