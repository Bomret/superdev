# Merge-conflict resolution

How a controller resolves a conflicted merge in the DAG loop. The rule is intent, not text: a hunk is
resolved by what each side **meant**, and each side's intent has a primary source — its slice's `spec`,
its progress log, its commit messages.

- **Trace both sides to their sources first.** Read what each slice was building before touching the
  hunk; a resolution from the conflict markers alone is a guess.
- **Additive conflicts take the union.** Independent slices usually conflict because each *added*
  something to the same place — list/enum/`switch` entries, attributes, test methods, doc bullets. The
  correct result keeps every addition from both sides, dropping nothing: never delete a sibling's test
  to make the merge compile.
- **Compatible intents compose.** Two sides that changed the same lines for different, non-competing
  reasons (one renamed a parameter, the other added a guard) both survive: write the version that
  honours both specs, and say so in one line.
- **Never invent new behaviour in a resolution.** The merged result does only what the two sides'
  sources already claim; a "better" third version is a drive-by change wearing a conflict as cover.
- **A genuine winner-picking overlap escalates.** The same decision decided two incompatible ways —
  where honouring one spec means violating the other — is not the controller's to guess:
  `git -C .superdev/scopes/<scope>/scopetree merge --abort` and escalate to the human, and
  **`--unattended` → block** (`scope-mode.md`'s **Unattended** section). This is narrower than "the same
  lines conflict": compatible intents on the same lines compose above; only competing intents escalate.
