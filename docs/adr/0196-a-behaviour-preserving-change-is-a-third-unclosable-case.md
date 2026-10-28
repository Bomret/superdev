# 0196: A behaviour-preserving change is a third unclosable case

**Status:** Accepted

**Amends:** [ADR 0193](0193-an-unclosable-pass-to-pass-finding-takes-the-escape-at-once.md).

**Context.** ADR 0193 closes the list of unclosable Pass-to-pass cases at two: a behaviour change that lies
wholly in test-path files, and a deliberate pin. Its Consequences leave a third shape on the cap path. A
fix cycle that applies a simplicity cut removes code together with its tests, and a fix cycle that refactors
keeps every test passing on purpose (triage #1042). Their fail-to-pass runs read `pass-to-pass` by design,
so no fix closes the finding. In the 2026-10 reviewer reports across superdev, weaver, weaver.contracts,
and arc, 48 of 539 reports name the cap or its escape path, and refactor and cut cycles are among the
findings that reached it.

**Decision.** The closed list gains case **(c)**: the range's changes outside its test-path files preserve
behaviour. They restructure or remove code, a cut that removes code together with its tests included, and
add none. The reason names, for each such file, what was restructured or removed and why no behaviour
changed. A file that adds behaviour rules the case out. Every rule ADR 0193 states for cases (a) and (b)
holds for (c): the reviewer that raises the finding marks it, re-judges it at every dispatch, and keeps it
Important; an implementer's or the lite controller's claim is input; the finding never enters a fix list. A
Missing fail-to-pass run finding still never carries the mark. A mark names exactly one case, and a range
whose changes outside the test paths only restructure or remove code is case (c), whatever its test's intent.

A pure cut removes code and deletes its tests, and changes no other test file. The fail-to-pass verb runs only
the test files a range adds or modifies, so it refuses such a range and writes no outcome line. A range or a
fix cycle whose test-path changes are all deletions therefore needs no outcome line and draws no Missing
fail-to-pass run finding, as a range that changes only test-path files draws none. The exemption is keyed on
the deletions, so it holds only while the range's changes outside the test paths add no behaviour. A range
that deletes tests and adds behaviour leaves that behaviour with no test: the reviewer raises Missing
fail-to-pass run, and its fix adds a test, after which the verb runs.

**Considered options**

- **Cuts only.** Only code removed together with its tests. It is the narrower, easier check. It loses
  because refactor fix cycles on a `behavior` slice draw the same unclosable finding.
- **Downgrade Pass-to-pass to Minor.** It saves every cycle. It loses because Pass-to-pass finds tests that
  catch a defect only by chance.
- **Mark Missing fail-to-pass run too.** It saves the one verb run when a reviewer expects `pass-to-pass`.
  It loses because that run is cheap and is the only evidence the range carries, as ADR 0193 states.
- **Leave a pure cut on the cap path.** It keeps every mixed range under Missing fail-to-pass run. It
  loses because the verb refuses the range, so no cycle can ever close the finding.

**Consequences.** A cut or refactor cycle takes the escape at once, and a pure cut draws no finding.
Case (c) rests on the reviewer reading every non-test hunk, so a refactor that changes behaviour and has weak
tests is caught only by that reading.
