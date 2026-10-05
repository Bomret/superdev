---
name: prose-check
description: Check one piece of prose against the controlled-prose writing standard — a file, a commit range, or pasted text. Reports violations by section, and rewrites on request.
argument-hint: "<path> | <BASE..HEAD|branch> | \"<inline text>\" [-- fix]"
allowed-tools: Read, Grep, Bash, Edit
model: sonnet
---

# superdev prose-check

Apply `${CLAUDE_PLUGIN_ROOT}/references/controlled-prose.md` to **one** piece of prose, on demand, in any
repo. `/superdev:document` applies that standard to the docs a run touched, gated on the repo's own
configuration. This command applies it to whatever the user hands it, gated on nothing (ADR 0057).

**Read-only by default.** A report changes no file. The user asks for a rewrite explicitly, per §5.

**One item per invocation.** A directory or a glob is outside this command: name the single file, range,
or text you want checked. Say that in one line and stop when the input names more.

## 1. Resolve the input

Take the **fix instruction** out of `$ARGUMENTS` first, when the text after the last ` -- ` separator
is exactly `fix`. Any other tail stays part of the target: a pasted ` -- ` is prose, not an instruction,
and so is inline prose whose own last clause happens to end in an imperative. What remains after that
split (the whole of `$ARGUMENTS`, when no tail qualifies) is the target, and it is exactly one of four
shapes:

- **Empty** → state the three target shapes (a path, a range or branch name, or pasted text, each with
  an optional trailing ` -- fix`) and stop. Guessing a target checks prose the user never named.
- **A path to a file that exists on disk** → the file's whole prose. A directory is outside this
  command, per the header above: say so and stop rather than reading it.
- **A range or a branch name** → the lines that range added or changed, when the target passes the
  **ref shape test**: it matches `[A-Za-z0-9._/-]+`, optionally split once by `..` or `...` into two
  halves of that same set. Anything else — a space, a `$`, a backtick, a parenthesis, a quote — fails
  the test, so it is never a candidate ref and no git invocation is attempted on it at all. A candidate
  that passes is resolved with `git rev-parse --verify --quiet '<name>'`, single-quoted so nothing in it
  reaches the shell; a range shape resolves each half through that same quoted call. A branch resolves
  to `merge-base(<base>, <branch>)..<branch>`, with `<base>` from `docs/agents/code-management.md` when
  that file is there, and `main` when it is not. A branch a live run root names takes its range base
  instead, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`, computed with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" base resolve --branch <branch> --base <base> --root <run-root>`:
  `<range-base>..<branch>`.
- **Anything else** → inline text, checked as it stands with no file involved. A single token that
  fails the ref shape test above — in practice, one with a space in it — is inline text on sight.

**A named target that does not resolve is an error, not a fallback to inline text.** A path that carries
a directory separator, a `.md` suffix, or any other mark of a filename, and does not exist on disk → say
which path failed and stop. A single token that passes the ref shape test above but that
`git rev-parse` cannot resolve, or a range whose halves pass that test but that git cannot resolve → say
which ref failed, quote git's own message, and stop. Checking the literal string `docs/setup.md` as
prose reports nothing a user wanted.

**Scope a range to what it changed.** `git diff <range>` gives the added lines, the same scoping
`agents/doc-reader.md`'s Pass 3 applies: judge those lines, and leave every untouched line in the same
file alone.

## 2. Load the rules

- **`${CLAUDE_PLUGIN_ROOT}/references/controlled-prose.md`, always.** Read it every run, whatever
  `docs/agents/documentation.md` says, and whether or not that file exists. Its `## Writing standard`
  pointer selects a standard for a repo's **own** docs, and this command is a tool the user reached for
  (ADR 0057).
- **`docs/agents/documentation.md`'s `Declare per language` answers, when they are there.** They settle
  the rules `controlled-prose.md` leaves to each repo: spelling convention, compound formation, case
  and possessive forms, number and date format, quotation marks, and terms left in another language.
  Apply each answer the file gives. **Missing file, missing section, or an unanswered rule** → skip that
  sub-rule alone, keep every other rule, and name what you skipped in the report's opening line.

## 3. Infer the mode

`controlled-prose.md`'s `## Modes` section names two, and the input's own shape picks one:

- **Strict** (imperative instructions) — steps, runbooks, setup procedures, warnings, and error text.
- **Relaxed** (descriptive prose) — `AGENTS.md` prose, `README.md`, ADR narrative, glossary entries, and
  knowledge-base pages.

Mixed input takes the mode of the passage each finding sits in. **State the mode you inferred as the
report's one-line verdict**, so a user who wanted the other one can say so and re-run.

## 4. Report

Group findings under `controlled-prose.md`'s **own section headings** — `Words`, `Verbs`, `Sentences`,
`Definitions`, `Procedures (strict mode)`, `Punctuation`, `Headings, lists, tables, and references`, and
the rest — printing only the sections that have findings. That file's `## Self-check` contract asks for
the section a violation belongs to, and this is how the report answers it.

One finding per line: the location (`<file>:L<line>`, or the sentence's position in inline text), the
**offending text quoted**, the rule it breaks, and the corrected text.

**`controlled-prose.md`'s `## Scope` section governs what is checkable at all.** Text inside fenced code
blocks, inline code spans, quoted output, and quoted error strings is exempt, as are identifiers, command
syntax, file paths, and configuration keys. Voiced prose — a hero paragraph, a pitch, an essay — is
exempt too: say so once when you meet it, rather than converting a voice the writer chose.

**Prose that breaks no rule reports zero violations and changes nothing.** Say the mode, say it is
clean, and stop. A clean verdict is a result, and an invented finding costs the user their trust in
every other one.

## 5. Rewrite, when the user asks for one

A trailing ` -- fix` (the last ` -- ` in `$ARGUMENTS`, with exactly `fix` after it) switches this
command from reporting to rewriting. It rewrites **only** what §4 would have reported:

- **A path target** → `Edit` the file in place, then say which findings you applied.
- **A range target** → compare `git rev-parse HEAD` against the range's right-hand side (the branch
  name, or the part after `..`). Mismatch → say the checkout does not hold that side and stop, rather
  than editing files the report did not check. Match → check `git status --porcelain -- <files the
  report named>`; any output means an uncommitted edit sits on top of what the report read, so say that
  and stop instead of editing content the report never saw. Clean → `Edit` every file the report named,
  then say which findings you applied.
- **Inline text** → print the rewritten text. There is no file to edit.

Carry every fix the report names, and leave every exempt span — code, quoted output, voiced prose —
byte-for-byte as it was.

## Red flags

- **Gating the run on `docs/agents/documentation.md`.** That file supplies the per-language answers and
  nothing else here. A repo that never ran `/superdev:setup` gets the same check (ADR 0057).
- **Rewriting without being asked.** The default is a report.
- **Flagging prose the target never touched.** A range check judges the lines the range added.
- **Checking a mistyped path as if it were prose.** An unresolvable target stops the command.
