# 0086: A duration is never the assertion, and a killed process is never a pass

**Status:** Accepted

**Context.** `tests/scope.test.js` asserts that a refetch against a black-holed remote returns inside a
bounded window, by bracketing the call with `Date.now()` and requiring the elapsed value under 8000 ms.
During the `feat/verification-ceiling` run it failed with `took 118965ms`, and the same suite's other
timing-shaped assertions flaked twice more across roughly 25 to 40 full-suite runs.

The bound the test is about is real: `plugin/scripts/scope.js` spawns `git fetch` with
`timeout: FETCH_TIMEOUT_MS` and `killSignal: 'SIGKILL'`. Four reproduction attempts left it intact — the
spawn against TEST-NET-1 returns at ~5006 ms unloaded, at ~5007 ms nested inside `execSync`, and at
~5005 ms with a grandchild deliberately holding the inherited stdout open. The machine runs no proxy.
`git fetch` is the only spawn between the two `Date.now()` calls, so there is nowhere inside the measured
region for 113 s to hide.

What the assertion measures is wall clock, which includes every millisecond the process spent
descheduled. Two of the three observed failures happened during a four-wide parallel slice wave, and the
third happened while other sessions held the machine. A correctly bounded 5 s call under 113 s of
starvation produces exactly the observed number with nothing wrong in the code under test.

That diagnosis is unfalsifiable as stated — "the machine was busy" explains any duration — and
`plugin/references/diagnosis.md` refuses a diagnosis that cannot be wrong. The discriminator already
exists and nobody reads it: `spawnSync` returns `signal` alongside `status`, and
`plugin/scripts/scope.js` tests only `status`. `signal === 'SIGKILL'` means the bound ended the fetch and
the clock is reporting the scheduler. A real `status` with `signal === null` means `git` returned on its
own, late, and the bound never fired. The two are mutually exclusive, and today neither carries evidence.

A second shape of the same mistake is worse. `tests/green-gate.test.js` spawns the hook with
`timeout: 15000` and then asserts `result.status === 2`. A hook killed at that bound returns
`status: null`, and the assertion fails claiming the gate does not block on `--git-dir` — attributing a
timeout to behaviour that was never exercised. Roughly 35 spawn bounds across 11 suites fail that way.

The same confusion is shipped, not only tested. `plugin/hooks/green-gate.js`'s `runTests` treats
`status == null` with a signal as `{ ok: true }`, reasoning that a killed suite returned no verdict and
the gate should fail open. Since ADR 0085 made the focused command required configuration, the gate runs
a full suite after every controller merge. A suite killed at the 600 s hook ceiling therefore reports a
passing merge gate.

**Decision.** Two rules, one principle: a process that did not finish carries no verdict, and a verdict
is never inferred from a clock.

A duration assertion is legitimate only where it compares against a **same-run baseline**, or where the
failure it catches is **qualitative** — unbounded against bounded — and its ceiling is loose enough to
say so. `tests/adapter.test.js` already holds the first form, measuring a serialized pair against a solo
call and declining a pinned ceiling because "a loaded box is slower in absolute terms" — the most
robust form available, not an immune one: it flaked once on a busy machine during this feature's
implementation and cleared on an immediate rerun.
`tests/publish-kb.test.js` holds it at one of its two sites, bounding against the configured timeout
rather than an absolute. Every other duration assertion states the seam instead: what the spawn returned,
and whether its own bound ended it.

A spawn killed at its timeout is reported as killed, by the test harness and by the shipped gate alike.
No assertion about behaviour stands on a process that never produced one, and no gate reads the absence
of a verdict as a pass.

**Consequences.** `plugin/scripts/scope.js` surfaces whether the refetch was ended by its own bound,
which makes a recurrence self-diagnosing: the next failure says which branch it is instead of leaving the
question open. The load experiment that would otherwise be a reproduction slice becomes that slice's
check.

The merge gate becomes stricter. A suite the hook ceiling kills blocks the merge rather than passing it,
which is a behaviour change operators will meet on a genuinely slow suite, and the reason ADR 0085's
required focused command matters to them.

Three duration assertions keep a ceiling because the failure they catch is qualitative: catastrophic
backtracking is effectively unbounded, so a loose ceiling falsifies exactly what a tight one did. Raising
them removes precision no test ever used. The three are not equally demonstrable, though they are equally
warranted. Two of them — `tests/green-gate.test.js`'s and `tests/merge-guard.test.js`'s `LONG_VALUE_OPT`
guards — wrap a synchronous in-process call on a 60-repetition string, costing 0–1 ms; a 5000 ms ceiling
on that operation is nearly all slack, the same signal-to-scheduler-noise ratio the 118965 ms failure
exhibited, so producing a failure on demand needs heavier oversubscription than the spawn-bounded case
below did. That is a statement about how hard the failure is to reproduce, not about which sites belong
here — these two are the purest instances of what this decision is about, not the weakest. The third,
`tests/publish-kb.test.js`'s bound check, measures a spawned process bounded at a configured timeout, and
its ceiling can be shown to miss under deliberate load, the way the refetch's own bound was.

The diagnosis behind #591 is answered rather than assumed, and the negative verdict is silence: the refetch
writes a diagnostic line only when `signal !== null`, because an ordinary refetch failure — no remote
configured, offline, a rejected credential — is not a finding and printing "bound did not fire" on every
one of those would be a false alarm, not a diagnosis. A recurrence whose refetch produced no diagnostic
line and still failed reports `signal === null`: the bound never fired, `git` returned on its own late, and
this decision's premise is wrong. The absence of the line is that report.

**Considered options.**

- *Repair the bound in `plugin/scripts/scope.js`.* Rejected: no reproduction exists after four attempts,
  and every constructed condition leaves the bound intact. A slice written around a defect nobody has
  established would be unfalsifiable, which is what `diagnosis.md` refuses.
- *Build a reproduction slice first.* Rejected as a slice, kept as a check. A slice promising a
  reproduction nobody can deliver blocks; the same experiment run under deliberate load verifies the seam
  slice instead.
- *Relax the flaking assertions and leave everything else.* Rejected: it treats the loudest instance and
  leaves 35 spawn bounds still misattributing timeouts to behaviour, and leaves the shipped gate still
  reading a killed suite as green.
