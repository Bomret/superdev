# 0105: An affected full command, and a whole-repo gate before the pull request

**Status:** Accepted

**Amends:** [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md),
[ADR 0075](0075-the-scope-review-gates-on-a-full-suite-entering-and-leaving.md),
[ADR 0096](0096-opening-the-pull-request-and-merging-it-are-separate-commands.md).

**Context.** In a monorepo, the full command runs every project's suite. The chain runs it at run handoff,
on entry to and exit from the scope review's fix loop (ADR 0075), and as the green-gate's fallback. Each
run costs the whole repository's wall clock and test-machine resources, and a failure in a project the
scope never touched turns the scope red. The repository's own dependency-graph tool (nx, turborepo, pnpm,
or `dotnet-affected` over the MSBuild project graph) already knows which projects a change reaches.

**Decision.** The full command may take an **affected form**: it runs the whole suite of every project
the change against the base branch reaches, dependents included, and exits green when it reaches none.
A repository whose full command takes that form also configures a **whole-repo command**, in an optional
`## Whole-repo command` section of `docs/agents/verification.md`, held in a backtick span because the
fences are read by position.

- `/superdev:submit-pr` runs the whole-repo command once on the scope branch's tip before it opens the
  pull request, unless a green suite record of kind `whole` already covers that tip. A red result opens
  no pull request: submit-pr records it, records an unresolved defect, and names `/superdev:review`.
- `/superdev:ship` reuses only a green record of kind `whole`. A tip that carries none, because base moved
  or because the tip moved after the pull request opened, gets the whole-repo command run on it by ship
  itself, recorded as kind `whole`. A red, denied, or killed result merges nothing. Submit-pr records a killed run the same way, as `none` of kind `whole`, and a denied run as `denied` of kind `whole` with a `**Degraded:**` entry. On a moved base's merged tip the whole-repo run replaces the full-command run. Where the suite record
  reads `none` without the `whole` kind, at any sha, because `/superdev:review` invalidated a tip for a
  standing unresolved defect, ship refuses instead of running: it names the finding, merges nothing, and points at `/superdev:review`.
- A scope review that finds the suite record red of kind `whole` runs the whole-repo command in place of
  the full command, on entry and on its fix loop's exit, so the failure becomes its finding and its exit
  run proves the fix.
- `/superdev:setup check` flags a full command that looks affected in a repository with no `## Whole-repo command` section, reading the command text and running nothing.
- `/superdev:setup` proposes an affected form only for a tool that owns the repository's dependency
  graph, and writes it only after the command has exited green on the base branch's own tip, where the
  change reaches no project, and after the tool's list mode has selected a project on a committed change in
  a throwaway worktree, which catches a form aimed at the wrong base, and after the form itself has run
  once there and executed at least one task or test, which catches a mistyped target.

A repository with no `## Whole-repo command` section keeps every behaviour it has: its full command is
the whole suite, and submit-pr runs nothing.

**Why.** The loop's full-suite runs are the ones a scope pays for repeatedly, and they are exactly the
runs a dependency graph can narrow safely. The run a pull request and a merge rest on is paid once per
scope, and it keeps the whole-repository claim INV-0092 makes.

**Considered options.**

- **Per-project sections in `verification.md`, with superdev mapping changed paths to projects.** Lost
  because superdev would own a guess at the dependency graph from path prefixes, which misses a shared
  library's consumers, and because it breaks the positional two-fence contract `hooks/green-gate.js`
  parses.
- **The running agent judges which suites apply.** Lost because the green-gate hook cannot judge, and a
  gate that rests on judgment is no gate.
- **A `{base}` token superdev substitutes into the full command.** Deferred rather than lost: a
  hardcoded base branch name errs toward selecting more projects when the local ref is stale, which is
  safe. It earns its place when a repository lacks the local ref.
- **The whole-repo run at `/superdev:ship` only.** Lost because a red tip would already be an open pull
  request.
- **A red whole-repo run re-enters the review fix loop from submit-pr.** Lost because it turns the chain
  (ADR 0013) into a loop between two commands.
- **A red whole-repo run opens the pull request anyway, with the result in its body.** Lost because ship
  would refuse the merge, so the stop only moves later.
- **Ship accepts any green record.** Lost because the merge would then rest on an affected run alone
  while the repository configured a stronger check.

**Consequences.** "Full suite" in ADR 0025, ADR 0075, and INV-0017 means the configured full command,
which may be an affected form. The suite record gains a kind. Reusing a record of kind `whole` satisfies
every caller, and a record with no kind satisfies every caller except the two that need a whole-repo run.
Ship runs the whole-repo command itself on a tip that carries no green record of kind `whole`, which
includes a tip that moved after the pull request opened. Refusing there left no command able to produce
that record, because review records no kind outside its red-`whole` entry and submit-pr refuses a `submitted` stage.
