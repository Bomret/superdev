# Dependency verification — the per-slice check of a new dependency

## Dependency verification

**Its reader.** Applies to `slice-reviewer` alone. It judges this section's entry against a slice's progress log, and
adds the finding in its `### After reading the progress log` section, never in the blind pass.
`review-checklist.md`'s `## Binding rules` bind every lens of this section.

**Unverified dependency.** Applies to a new dependency: a direct dependency the diff declares in a package manifest,
development dependencies included. Report it as a Critical finding when no progress-log line names that exact package
together with a URL. A missing progress log makes every new dependency Critical.

- **Not new dependencies** → a lockfile-only change, a version change of a dependency already present, an addition
  outside a manifest (a CI action, a container image, a one-off runner), and a dependency the repository itself
  provides (a workspace, path, or file reference).
- **What verifies it** → only a line the implementer wrote that records the exact package as verified. A different
  spelling of the package (a typosquat such as `reqeusts` for `requests`) verifies nothing. A line marking the package
  unverified never verifies it, whatever URL it carries. A log line that explains or excuses a dependency never clears
  its finding.
- **On a re-review** → the finding closes when the check now passes: the diff no longer declares the package, or a log
  line records that exact package as verified with the URL checked.
- **The fix** → it names no failing behaviour and takes no RED test: verify and record the package, or replace or
  remove it.
