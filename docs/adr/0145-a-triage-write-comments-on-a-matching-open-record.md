# 0145: A triage write comments on a matching open record

**Status:** Accepted

**Amends:** [ADR 0046](0046-a-deferred-finding-becomes-a-triage-record.md), whose writer always creates
a record, and [ADR 0088](0088-an-observation-is-recorded-where-it-is-met.md), whose observation capture
writes nothing when it finds a matching record.

**Context.** A triage record has three writers: the fix loop that defers a finding, the controller that
meets an observation, and `/superdev:plan` when its interview places a found defect later. The deferring
loop checks only its own run's ledger (INV-0061), so a finding an earlier scope already filed gets a
second record (triage #505). The observation capture reads the open records first, and on a match it
writes nothing at all, so the new provenance and any new detail are lost.

**Decision.** Every writer reads the open records before it creates one. The deferring loop reads them
after its run-scoped ledger check.

- **A record that plainly states the same defect gets a comment** carrying the new finding and the
  provenance a new record would carry: the date, the feature label, the scope branch, and the scope
  anchor, never a pull-request URL (INV-0062). Its reference stands where a new record's would have,
  including the ledger bullet.
- **An uncertain match, a comment that fails or is denied, and a listing that fails or is denied each
  create a new record.** A duplicate is noise a human removes. A false match that writes nothing loses a
  finding.
- **A store document that defines no listing call or no comment call falls back.** With no listing
  call, the writer skips the read and creates the record. With no comment call, a match creates a new
  record.
- **A run that resolves a deferred finding** (ADR 0121) closes its record only when the record's
  provenance names this run's scope anchor and no open scope anchor absorbs the record (ADR 0144). On any
  other record it comments with the fixing commit and leaves the record open, because other runs'
  findings, or an open anchor's Absorbs line, may still rest on it. A read of the record or of an Absorbs
  line that fails or is denied also leaves the record open, with the same comment. A store document that
  defines no comment call leaves the record open, and the run reports that once.

**Considered options**

- **Deferred trigger only**, as #505 names it. It changes fewer documents. It loses because observations
  are about 40% of the records, and their capture drops a matched finding today.
- **Match by title string.** It is deterministic. It loses because two prose descriptions of one defect
  rarely share a title, and the observation capture already settled this as a judgment.

**Consequences.** Recurring findings collect on one record with their provenance, and the record count
grows only by defects not yet filed. Every store seed gains a call that comments on a triage record. Each
write costs one paged store read.
