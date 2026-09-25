# 0095: An operator can accept an unmet criterion

**Status:** Accepted

**Context.** ADR 0091 ticks a Definition-of-Done criterion from an implementer's report while the run
works, and every later step re-checks it. A criterion sometimes stands genuinely unmet by design: the
operator reads `not met:`'s own reason and decides, attended, that the run should ship anyway — a
`suite reusable` shortcut kept over the criterion's own wording, an ADR 0025 case where an unattended
denied run still blocks though an attended one does not. `dod.md` had no shape for that decision: the
line stayed `not met:`, which reads as still open, or a controller reworded the criterion itself, which
misreports what the run actually delivered against what `/superdev:plan` wrote.

**Decision.** A fourth verdict, `accepted`, marks a criterion the operator accepts as unmet, in
INV-0014's own line format:

```
- [ ] <criterion> — <tag> — accepted: <reason>
```

- **The box stays unticked.** The criterion is honestly unmet; `accepted` never renders `- [x]`.
- **The stage gate treats the line as settled.** Review does not raise an `accepted:` line as a Critical
  finding and does not hold the stage on it (INV-0016); run handoff's own settling pass, document's
  re-check, and ship's gate all read it the same way.
- **Only an attended operator decision writes it.** The note names the reason and, where the store
  records who wrote it, who accepted it and when (for example `accepted: <reason> (operator,
  2026-09-25)`). `afk`, every subagent, and every unattended run never write `accepted:`; an unattended
  run meeting an unmet criterion behaves exactly as it does today — it stops or blocks, per whatever rule
  already governs that surface.
- **Review still challenges the facts an `accepted:` line carries.** If the branch has since come to meet
  the criterion, `final-reviewer` may report `holds` and the review's controller ticks it `met:` — the
  same re-tick INV-0015 already allows from a `holds` verdict. Review never turns an unmet criterion into
  `accepted:` on its own; only an attended operator decision does that.
- **`scope.js dod-line --verdict accepted`** renders `- [ ]` with an `accepted:` note, the same shape
  `not-met` and `ceiling` already take, and parses one back on a later read exactly like the other three.

**Amended: the decision point is named.** `/superdev:review`'s §4 "Ask once before fixing" is where an
unmet criterion first reaches an attended operator in the chain, so it is the one place that offers to
accept it — the same question that already offers to fix. `--unattended` never reaches that question and
never writes `accepted:`.

**Considered options.**

- *A sanctioned rewording of the criterion itself.* The rewritten text no longer matches what
  `/superdev:plan` wrote, so a later reader cannot tell what the run actually delivered against what was
  asked — harder to audit than a verdict naming the acceptance as a decision.
- *Tick the line `[x]`.* Misreports the criterion as met when it is not; the box is what every other
  surface reads to decide whether verification happened at all.
