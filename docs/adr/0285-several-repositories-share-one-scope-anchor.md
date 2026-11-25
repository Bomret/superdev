# 0285: Several repositories share one scope anchor

**Status:** Accepted

**Context.** A slice store several repositories share marks each issue with its repository's Repository component,
and every query a repository's run makes filters by it. Adopters plan one epic with slices for three or four
repositories, and each repository runs its own scope against that epic (#520, triage #19). superdev assumed one
repository per anchor. `/superdev:wrap-up` listed the anchor's slices through the component filter, found its own
closed, and closed the epic while sibling repositories still had open slices. Each run copied the whole Definition
of Done into its `dod.md`, so a run settled sibling lines as `accepted` and rewrote a sibling's line on the anchor.
A sibling repository joining later could not find the epic at all, because its own listings filter by its own
component.

**Decision.** superdev supports a **shared anchor**: a scope anchor with slices from more than one repository. Only
a repository with a Repository component can see one. An anchor is shared when it holds a slice outside this
repository's own listing, read through the store's call that lists an anchor's slices in every repository.

- **A run owns a subset of the Definition of Done.** A line tagged with slices is owned by the repository whose
  slices it names. On a shared anchor a `scope` or `docs` line names its owner's component, `scope (<component>)` or
  `docs (<component>)`. Run init writes only the owned lines to `dod.md`. A line whose owner it cannot tell (an
  unqualified `scope` or `docs` line, an untagged line, or a line naming slices of two repositories) stops run init,
  which names the line to fix on the anchor. Pairing, the anchor sync, and ticks iterate `dod.md`, so they never
  touch a sibling's line. No verdict marks a line as owned elsewhere.
- **Run state stays as it is.** Only a store with a Repository component can hold a shared anchor, and the store that
  has one today, Jira, is snapshot-less, so no two repositories publish a snapshot to one anchor.
- **The anchor closes last.** `/superdev:wrap-up` on a shared anchor closes its own repository's slices. It closes
  the anchor only when every slice in every repository is closed and every line on the anchor is settled.
  Otherwise it leaves the anchor open and names what remains.
- **Planning reaches siblings on this machine.** `/superdev:plan` plans every repository whose checkout the operator
  names, reading each sibling's own store document for its component, and creates each slice under its repository's
  component. A repository not on this machine joins later through plan's extend, run in that repository. It finds the
  anchor through a lookup unfiltered by component, adds its component to the anchor, appends its slices and lines, and
  qualifies the first repository's `scope` and `docs` lines with that repository's component. It tags each untagged
  line of the first repository, so the shared anchor holds no line whose owner run init cannot tell. Its active-run
  check still reads only its own slices, so a sibling's live run never blocks the join.
- **A deferred finding goes to the repository that fixes it.** Its triage record is created under that sibling's
  component.

**Considered options.**

- *Refuse a shared anchor.* One anchor per repository, linked by the anchor dependency, with run init refusing an
  anchor that holds another repository's slice. It needs no ownership model. It lost because adopters plan one epic
  per feature across repositories, and Jira offers no nested epic to group per-repository epics under.
- *An explicit repository marker on every line.* One uniform rule. It lost because a slice-tagged line already names
  its owner through its slices, so the marker is needed only where no slice is named.
- *An "owned elsewhere" verdict on sibling lines in `dod.md`.* It lost because a trimmed `dod.md` never holds a
  sibling's line, so no command meets one.
- *A run-state snapshot per repository, between markers naming the component.* It lost because no store that
  can hold a shared anchor publishes a snapshot. A store that gains both a Repository component and a snapshot needs
  it.

**Consequences.** A shared anchor's `scope` and `docs` lines carry a qualifier, and `dod-line`, `dod-tags`, and
`dod-check` read it. A store document without the every-repository listing cannot tell a shared anchor: run init
treats the anchor as its own, and wrap-up leaves the anchor open and names `/superdev:setup`, whose re-run offers the
call. A scopetree resolves no relative path to a sibling checkout, so work names a sibling by its absolute path. The
claim stays on the anchor, so a second operator on a shared anchor meets the existing takeover ask.

Two repositories that write the anchor body at once can revert a sibling's note, because Jira's issue update has no
compare-and-swap. Each edit re-reads the body just before it writes, which narrows the window and does not close it.
This is an accepted risk. A lost tick leaves its line unsettled, so the anchor stays open, which is the safe failure.
The owning repository ticks the line again to recover.
