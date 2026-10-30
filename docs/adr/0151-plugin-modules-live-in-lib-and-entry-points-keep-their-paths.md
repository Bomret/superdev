# 0151: Plugin modules live in `plugin/lib/`, and entry points keep their paths

**Status:** Accepted

**Amended by:** [ADR 0154](0154-shipped-code-carries-no-test-seams.md), which has an entry point keep only
the exports a requirer uses.

**Context.** The plugin's JavaScript is hard for a human to read and costly for an agent to edit.
`plugin/scripts/scope.js` has 2895 lines. It holds the ledger CLI, the run trace, git probes, the
containment test, and the fail-to-pass run, and five hooks `require` it as a library. The maintainer-only
`scripts/drift/scanners.js` has 1071 lines, and two test suites have more than 2000 lines. Some
helpers exist in more than one file. `gitTry` in `scope-prune.js` is byte-identical to `scope.js`'s
`gitSpawn`. The `git` helpers of `scope-prune.js` and `slicetree-sweep.js` are identical, and so are the
`git branch` list parses of the two Stop hooks. Other copies only look alike: the `git` helpers in
`run-trace.js` and `tree-guard.js` differ in shell use, time bound, stderr handling, and
failure result. `plugin/hooks/` and `plugin/scripts/` mix entry points with modules: `shell-words.js` and
`md-to-storage.js` are modules that no hook entry or prose step runs.

**Decision.**

- **Every module lives in `plugin/lib/`.** `plugin/hooks/` and `plugin/scripts/` hold only entry points:
  a file that `hooks/hooks.json` names, or a script that the prose tells an operator or an agent to run.
  `shell-words.js` and `md-to-storage.js` move to `plugin/lib/`.
- **An entry point keeps its path and its exports.** Prose, `hooks.json`, drift rows, and other modules
  name the entry points. Each one stays where it is, exports what it exported before, and delegates to the
  modules. A module never requires an entry point, and an entry point requires only modules. A module
  that required `scope.js` while `scope.js` is loading would receive an incomplete `module.exports`. So
  the code that `scope.js` takes from `kb-patch.js` and from the `run-trace.js` hook moves to modules that each entry point requires. A hook
  then loads only the modules it uses, not the whole run-state CLI.
- **Large files split along the seams they already have.** `scope.js` splits along its banner sections.
  `run-trace.js`'s Bash readers share one command-reading module, which holds the word layer and the
  directory tracker (ADR 0160). The drift `scanners.js` splits by topic behind a
  `scripts/drift/scanners/index.js` barrel that re-exports every scanner.
- **Only copies with identical behavior merge.** A copy whose behavior differs from another copy stays,
  because merging it would change what one of its callers does.
- **Each hook keeps its own stdin reading and decision output.** A hook reaches a module only through a
  guarded `require` that keeps the hook's failure posture (INV-0159).
- **Test suites split flat, by topic.** A large suite becomes several `tests/<entry>-<topic>.test.js`
  files. They test through the same entry point as before, and a shared setup file per entry point holds
  the setup they share. `scripts/run-tests.js --related` follows `require` edges transitively, so a change
  to a module selects every suite whose entry point reaches it.
- **500 lines for code and 1000 lines for tests are a target, not a rule.** No check enforces the
  numbers after this refactor. One file stays over the target, for a stated reason. The tokenizer core of
  `shell-words.js` is one state machine of about 30 closures that share mutable state.

**Consequences.** A reader finds a responsibility by its module name in `plugin/lib/`, and an agent edits
a module of a few hundred lines rather than a file of a few thousand. Each entry point still exists, so
no skill, reference, hook registration, or adopter instruction changes. A future module has one home.
Copies whose behavior differs stay where they are. Triage #1138, #1139, and #1140 record the
divergences that look like defects, for a separate `fix` feature. Without a check, a file can grow past
the target again.

**Considered options.**

- **Put modules beside their users.** It saves a new directory and the move of two files, but a helper
  shared by a hook and a script has no obvious home, and the mix of entry points and modules stays.
- **A size cap enforced by a check, with files split when a slice touches them.** The worst files would
  shrink only when some slice happened to edit them.
- **Classes and interfaces.** They add interfaces with one implementation each. Modules of plain
  functions give each file one responsibility without them.
- **TypeScript or a bundle.** Both need a build step, and the plugin ships without one.
- **One git primitive with an options bag.** Every caller would pass options that reproduce its current
  behavior. The option surface grows with every difference between the copies, and a wrong default
  changes a hook's behavior silently.
- **A shared `main` for every hook.** A copied-away hook whose shared `main` cannot load exits 1. Claude
  Code treats exit 1 as a non-blocking error, so a guardrail that must fail closed would fail open.
- **Rewrite the tokenizer core of `shell-words.js` as sub-scanners per frame.** It meets the size target,
  but it rewrites the guardrails' security parser, which the linear-time pins and the bash agreement fuzz
  constrain.
- **A suite per module.** Its assertions would move from entry-point calls to direct calls into modules,
  which changes what each assertion tests.
- **Split run-trace's Bash readers without a shared module.** The write, test-run, and restore readers
  all read words through one layer. Each reader module would either copy that layer or require another
  reader for it.
