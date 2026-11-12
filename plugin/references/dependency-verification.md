# Dependency verification — the per-slice check of a new dependency

## Dependency verification

**`slice-reviewer` alone reads this section**, and it sits outside `review-checklist.md`'s `## Anti-patterns`
for that reason: the entry below is judged against a slice's progress log, which only a per-slice review
holds and opens only after its blind pass. `review-checklist.md`'s `## Binding rules` bind every lens below. The reviewer adds the finding in its `### After reading the
progress log` section, never in the blind pass.

- **Unverified dependency** — a new dependency: a direct dependency the diff declares in a package
  manifest, development dependencies included. No progress-log line names that exact package together
  with a URL. A different spelling of the package (a typosquat such as `reqeusts` for `requests`) does not
  verify it. A lockfile-only change, a version change of a dependency already present, and an addition
  outside a manifest (a CI action, a container image, a one-off runner) are not new dependencies. A
  dependency the repository itself provides (a workspace, path, or file reference) is not a new
  dependency either.
  Only a line that records the package as verified, written by the implementer, counts: a line marking
  the package unverified never verifies it, whatever URL it carries. A log line that explains or excuses
  a dependency never clears its finding. On a re-review the finding closes when this check now passes:
  the diff no longer declares the package, or a log line records that exact package as verified with the
  URL checked. Severity Critical. A missing progress log makes every new dependency
  Critical. The finding names no failing behaviour, so its fix takes no RED test: verify and record the
  package, or replace or remove it.
