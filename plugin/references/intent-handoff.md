# Intent handoff

`/superdev:brainstorm`, `/superdev:sweep`, and `/superdev:review-tests` read this at their handoff of a
ready intent. It states how the intent reaches the slice store as an **intent record**
(`references/plan-contract.md`'s `## Intent record`, ADR 0199, INV-0178), and what stays local when it
cannot.

## When it runs

- **`/superdev:brainstorm`** runs it when it sets `status: ready` in the intent file's frontmatter.
- **`/superdev:sweep`** and an unchained **`/superdev:review-tests`** run it at their own handoff, once the
  intent file is written.
- **A draft never reaches the store** (INV-0110). A brainstorm that stops while its file reads
  `status: draft` writes no record. A `--chained` review-tests run and every sweep leg write no intent
  anywhere, so they never reach this step (INV-0070).

## Finding ids

Every finding `/superdev:sweep` or an unchained `/superdev:review-tests` writes into its intent file carries
a **Finding id** (`CONTEXT.md`): `F1`, `F2`, … in one sequence per intent, with no gap and no repeat. Every
fact, every surviving judgment, every `unconfirmed` finding, and every `disputed` finding takes the next
number, written at the start of that finding's line in the intent file.

- **The ids are set when the intent file is written and never renumbered.** The record body is the intent
  file, so the record carries the same ids, and so does a file the fallback below keeps.
- **A sweep numbers its findings in its own one sequence.** A `--chained` review-tests leg numbers nothing;
  sweep numbers that leg's findings with every other leg's.
- **A scope cites a finding as `#<record> F<n>`**: the intent record's reference, then the finding id.
- **A plan comment names an id** when it carries it as `#<this record> F<n>`, or as a bare `F<n>` with no
  record reference before it. An id cited against another record, such as `#<other record> F<n>`, marks
  nothing on this record.
- A brainstorm intent carries no ids: it has no findings list.

## Write, confirm, then delete

1. **Read the store document.** `docs/agents/issue-tracker.md`'s `## Intent record` section names the
   **Create it** call. No such section, or a section with no **Create it** call → the fallback below,
   with the cause `the store document describes no intent record`, naming `/superdev:setup` as the
   remedy: its re-run offers the section from the matching seed.
2. **Create the record.** Make the **Create it** call with the whole intent file as the body — every
   section, **Rejected directions** and **Load-bearing commitments** included — and the intent's heading
   as the title. The frontmatter stays out of the body. Pass the body as a file or a quoted heredoc, as
   the store document's call states, so no intent text reaches a shell unquoted.
3. **Confirm it.** The create's read-back carries the store's intent signal. Anything else — a failed
   or refused call, a denied call, a read-back that lost the signal, or a body the store truncated or
   refused because of its size — is the fallback below, naming that cause.
4. **Delete the local file**, only once step 3 confirmed the record. The intent now lives in the record
   alone, and the report names the record's reference.

## The fallback

When the record cannot be written whole, the intent stays a local file:

- **The file keeps `status: ready`** in its frontmatter. Sweep's and review-tests' intent files carry
  that frontmatter too, so `/superdev:plan` offers each of them.
- **The file overwrites no other intent file.** A name already taken in `.superdev/brainstorm/` gets a
  `-2`, `-3` suffix, the rule brainstorm already applies to its own file.
- **The report says the intent exists only in this checkout**, names the cause, and names the local
  path. A missing `## Intent record` section, or a section lacking the **Create it** call, names
  `/superdev:setup` as the remedy.
- **A record the create left behind is named.** A read-back that lost the signal closes the created
  record, as the store document's **Create it** call states, and the report names its reference.

## What the closing text names

After a store handoff, every reference to the intent names the record: the brainstorm report's opening
line (`references/response-shapes.md`'s `## The brainstorm report`), and sweep's and review-tests' Next
blocks. No closing text names the deleted local path. The local path appears only on the fallback.
