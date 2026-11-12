# Test gaps — the test audit's gap lenses

## Test gaps

**`test-gap-auditor` alone reads this section**, and it sits outside `review-checklist.md`'s
`## Anti-patterns` for the reason `test-cost.md`'s `## Test cost` does: the lenses below are judged over
standing code and the whole list of test files, which only a test audit's gap audit holds. A diff-scoped
reviewer judges new behaviour against its acceptance criteria through **happy-path-only suite** instead.
`review-checklist.md`'s `## Binding rules` bind every lens below.

- **Untested** — a symbol no test reaches. In a file some test reaches, name the file, the line, and the
  symbol. A file no test reaches at all is one finding for the file, listing its exported symbols, so a
  repository with few tests gets a bounded report.
- **Missing case** — a symbol whose tests leave an argument class or scenario untested: null, empty,
  negative, out of range, invalid, or a failure path. Name the symbol and the one case. "More edge cases"
  names no case and is no finding.
- **Reach counts indirectly.** A test reaches a symbol when it calls it, calls a caller of it, spawns the
  process or runs the command verb that runs it, drives the registry or table that dispatches to it, or
  sits inside the source file itself as an inline test. Report `untested` only when no such path exists.
- **Reach is tied to the module.** A test reaches a symbol only through the module that defines it: the
  file it imports, requires, or spawns. A test naming a same-named symbol in another module does not
  reach it.
- **Rank by risk.** A trust boundary first — parsing external input, I/O, authentication, money — then an
  exported symbol, then an internal one. Ties break on the number of untested branches. Give each finding
  a one-line reason for its tier.
- **Static evidence.** No coverage tool runs, so every gap finding is a judgment labelled `static`.
