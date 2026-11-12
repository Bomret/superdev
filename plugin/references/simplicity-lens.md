# Simplicity lens

<!--
  Attribution: the over-engineering-review rubric below is distilled from ponytail,
  by Dietrich Gebert (https://github.com/DietrichGebert). Credit to its author.
-->

The over-engineering lens `simplicity-reviewer` applies to a whole scope's range and `slice-reviewer` applies to a slice's range on its first review. The diff's best outcome is getting shorter.

## Scope of the lens

Applies to every dispatch.

Correctness, security, and performance belong to a separate reviewer. Flag none of them here, and nothing else beyond unnecessary complexity. Obtain the diff with the `git diff <range>` the controller gives you.

## Judge discipline

Applies to every dispatch.

Assess the diff itself and not the implementer's narrative for why the complexity is warranted. Length or an elaborate structure is no justification of its own. Flag machinery that does not earn its keep in the code you can see, however the dispatch explains it.

## Clarity is not bloat

Applies to every dispatch.

Fewer lines is the goal only where the shorter form is also clearer. Recommend no cut that trades readability for terseness: a clever one-liner nobody can debug at 3am, distinct concerns crammed into one function, or an abstraction that genuinely organizes the code.

- A deeply nested ternary is not already short. Tag it `shrink:` toward a `switch` or an if-else chain.

## What stays

Applies to every dispatch.

- A single smoke test or `assert`-based self-check is the minimum and no bloat. Never flag it for deletion.
- A `simplicity:` comment marks a deliberate simplification. It is intent and no debt to remove. So is a legacy `shortcut:` comment, the marker earlier superdev releases wrote.

## Format

Applies to every dispatch.

One line per finding: `L<line>: <tag> <what>. <replacement>.` Use `<file>:L<line>: ...` for a multi-file diff.

- `delete:` dead or unused code. Replacement: nothing.
- `stdlib:` a hand-rolled thing the standard library ships. Name the function.
- `native:` a dependency or code doing what the platform already does. Name the feature.
- `yagni:` speculative flexibility, config, or abstraction: an abstraction with one implementation, config nobody sets, a layer with one caller, a port with a single adapter and no second in sight.
- `shrink:` the same logic in a simpler form. Show the simpler form.

Examples:

- `L12-38: shrink: 27-line validator class. "@" in email is one line; real validation is the confirmation mail.`
- `L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.`
- `repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second exists.`
- `L52-71: delete: formatLegacy has no caller. Nothing replaces it.`

## Scoring

Applies to every dispatch.

End with the metric line. The net counts every finding. Where there is nothing to cut, say `Lean already. Ship.` and stop.

- `net: -<N> lines possible.` where the findings remove at least as many lines as they add. A net of zero reads `net: -0 lines possible.`
- `net: +<N> lines possible.` where a `shrink:` that wins clarity with more lines makes the findings add more lines than they remove.
