'use strict';

// dod-line.js: the `dod-line` verb, the one-line edit of a Definition-of-Done checklist (references/dod-ticks.md, INV-0014).

const fs = require('fs');
const { fail } = require('./refusal.js');
const { splitLines } = require('./ledger.js');
const { maskFencedLines } = require('./md-sections.js');

// The one line edit every store's own `## Definition of Done ticks` section names (`plan-contract.md`
// → *Definition of Done ticks*). `dod-line` touches no ledger and makes no store call: a store seed
// takes the body out of its fetched response into a file, runs it through `dod-line`, and writes the
// result back only through the gated **Edit an issue's body** chain (`&&` on every exit status, `[ -s ]`
// on the output file). Two modes share
// one core (`transformDodLines` below) — the default, a whole markdown body on stdin/stdout, and
// `--line`, one checklist line in and one out, for the Jira seed's ADF text node, which is JSON, not
// markdown lines.
//
// A checklist line is `- [ ] <criterion>[ — <tag>][ — <verdict>: <note>]` (`plan-contract.md`'s line
// format). The tag is slice ids (`01`, `01, 02`), store refs (`#667`, `#672, #673`), a Jira issue key
// (`PROJ-12`, `PROJ-12, PROJ-13` — `references/issue-tracker-jira.md`'s own rewritten notation), or the
// literal `scope` or `docs` (a criterion the doc pass settles, ADR 0161), each standing alone — never
// free text. It is absent on a single-slice feature's own DoD (`plan-contract.md`'s
// `### Criterion tags`: "a single-slice feature carries no tags"), on a run from before tagging existed,
// or on one untagged line inside an otherwise tagged DoD (`references/dod-ticks.md`'s own "No tags at
// all"). A line with no note takes its tag from the *rightmost* ` — <tag>` at the end of the line,
// greedily handing everything else to the criterion: that is what keeps a criterion carrying its own
// " — " (`plan-contract.md`'s own worked example, "Reachable: none — entrance unchanged; … — scope")
// intact. A line with a note instead splits at the *leftmost* ` — <tag> — <verdict>: ` boundary, because
// the note itself is free text and may contain that same shape (a re-write's own earlier note, say) —
// everything past the leftmost boundary is the note, however many look-alike dashes it carries. Where
// no valid tag suffix exists in either shape, the whole rest of the line is the criterion and the tag is
// empty — rendered with no ` — <tag>` segment at all.
//
// `accepted` is the fourth verdict (ADR 0095): an operator's own decision that an unmet criterion stands
// accepted as unmet. It renders unticked, exactly like `not-met` and `ceiling` — the box never lies about
// what got verified — with its own `accepted:` label on the note.
const DOD_TAG_TOKEN = '(?:#?\\d+|[A-Z][A-Z0-9_]*-\\d+)';
const DOD_TAG_PATTERN = `(?:scope|docs|${DOD_TAG_TOKEN}(?:,\\s*${DOD_TAG_TOKEN})*)`;
const DOD_VERDICTS = {
  met: { marker: 'x', label: 'met' },
  'not-met': { marker: ' ', label: 'not met' },
  ceiling: { marker: ' ', label: 'ceiling' },
  accepted: { marker: ' ', label: 'accepted' },
};
const DOD_NOTE_VERDICT_RE = '(?:met|not met|ceiling|accepted)';
// A checklist line's marker and its text past `] `. The leading `- ` is optional: a markdown body
// carries it, but the Jira ADF text node this feeds in `--line` mode carries only the bracket
// (`references/issue-tracker-jira.md`'s own text-node shape, "a `paragraph` or `listItem` node whose
// text begins `[ ] <criterion>`").
// Trailing whitespace is tolerated on either shape (an editor's or a store's own habit) and dropped
// only where a matched line is actually rewritten — an untouched line keeps its own trailing bytes.
const DOD_LINE_RE = /^(\s*(?:-\s*)?)\[[ xX]\]\s*(.*)$/;
const DOD_WITH_NOTE_TAG_RE = new RegExp(`^(.+?) — (${DOD_TAG_PATTERN}) — ${DOD_NOTE_VERDICT_RE}: (.*?)\\s*$`);
const DOD_WITH_NOTE_NO_TAG_RE = new RegExp(`^(.+?) — ${DOD_NOTE_VERDICT_RE}: (.*?)\\s*$`);
const DOD_NO_NOTE_TAG_RE = new RegExp(`^(.+) — (${DOD_TAG_PATTERN})\\s*$`);
// The `## Definition of Done` heading — any level, up to 3 leading spaces (CommonMark's own ATX limit)
// — that scopes body-mode matching to the checklist section alone (triage #679's C.3): a checkbox that
// happens to repeat a DoD criterion's text elsewhere in the same document is never a match candidate.
const DOD_SECTION_HEADING_RE = /^\s{0,3}(#{1,6})\s+Definition of Done\b/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+/;

// Whitespace-insensitive equality (`--match-file`'s own contract), collapsed within one physical line only:
// a criterion text itself carrying an embedded newline, or a run of spaces a web UI's autoformat
// left behind, still matches the same single-line criterion. A checklist line an editor reflowed onto
// two physical lines is a different, unmatched line — matching never joins lines.
function collapseWhitespace(s) {
  return s.trim().replace(/\s+/g, ' ');
}

// The checklist line's leading marker prefix (the `- ` a markdown body carries, absent from the bare
// `[ ]`/`[x]` a Jira ADF text node carries — `references/issue-tracker-jira.md`'s own text-node
// shape), its criterion, and its tag (empty when the line carries none — the untagged shapes above).
// Returns every plausible reading, not just one: an untagged criterion that merely ends in something
// shaped like a tag (`- [ ] Retries capped — 3`) reads as tagged `3` under the rightmost-tag rule above,
// so the whole-line-untagged reading is offered alongside it (triage #679's C.1) — a line matches when
// either reading's criterion equals the criterion text, and rendering keeps whichever one matched. The same offer
// reaches the tag-with-note shape too: `<criterion> — <tag> — <verdict>: <note>` could also be
// `<criterion — tag> — <verdict>: <note>` with an empty tag, once the line already carries a note (Minor
// review find #4) — a tagged criterion that already carries a note is otherwise unreadable by its
// untagged spelling on a re-judge. A line offering two readings still counts once toward the match limit
// below. An empty array only when the line carries no task-list marker at all.
function parseDodLineReadings(line) {
  const m = line.match(DOD_LINE_RE);
  if (!m) return [];
  const [, prefix, rest] = m;
  const withTagNote = rest.match(DOD_WITH_NOTE_TAG_RE);
  if (withTagNote) {
    // The same C.1 offer as the no-note case below: `<criterion> — <tag> — <verdict>: <note>` could
    // also be `<criterion — tag> — <verdict>: <note>` with an empty tag, so a criterion that merely
    // ends in something tag-shaped is still readable once it already carries a note (Minor review find
    // #4) — matching runs after both readings, and a line offering two still counts once.
    const asUntagged = rest.match(DOD_WITH_NOTE_NO_TAG_RE);
    return asUntagged
      ? [
          { prefix, criterion: withTagNote[1], tag: withTagNote[2] },
          { prefix, criterion: asUntagged[1], tag: '' },
        ]
      : [{ prefix, criterion: withTagNote[1], tag: withTagNote[2] }];
  }
  const withNoteNoTag = rest.match(DOD_WITH_NOTE_NO_TAG_RE);
  if (withNoteNoTag) return [{ prefix, criterion: withNoteNoTag[1], tag: '' }];
  const tagNoNote = rest.match(DOD_NO_NOTE_TAG_RE);
  if (tagNoNote) {
    return [
      { prefix, criterion: tagNoNote[1], tag: tagNoNote[2] },
      { prefix, criterion: rest.trimEnd(), tag: '' },
    ];
  }
  return [{ prefix, criterion: rest.trimEnd(), tag: '' }];
}

function renderDodLine(prefix, criterion, tag, verdict) {
  const v = DOD_VERDICTS[verdict];
  const tagSuffix = tag ? ` — ${tag}` : '';
  return `${prefix}[${v.marker}] ${criterion}${tagSuffix}`;
}

// The `## Definition of Done` section's line range in a fence-masked body: from the heading whose text
// starts "Definition of Done" (any level, up to 3 leading spaces) up to the next heading of the same or
// a higher level, or to the end of the body. `null` when the body carries no such heading — a
// single-slice feature's own acceptance-only checklist, say — which is what sends body-mode matching
// back to scanning the whole body, as it always has (triage #679's C.3).
function dodSectionRange(masked) {
  let start = -1;
  let level = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const m = masked[i].match(DOD_SECTION_HEADING_RE);
    if (m) {
      start = i;
      level = m[1].length;
      break;
    }
  }
  if (start < 0) return null;
  let end = masked.length;
  for (let i = start + 1; i < masked.length; i += 1) {
    const m = masked[i].match(HEADING_RE);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return { start, end };
}

// The core: find the one non-fenced checklist line whose criterion equals `match` once both sides
// collapse whitespace, and replace it with the judged line. Matching runs on `maskFencedLines()`'s
// output (md-sections.js's own fence rule), so a line inside a fenced illustrative example is never a
// candidate — the same posture `scope.js`'s own `adopt` marker scan already takes. Candidates are
// further scoped to the `## Definition of Done` section when the body carries one (`dodSectionRange`
// above) — `--line` mode's one-line input carries no heading, so it is unaffected. Refuses, changing
// nothing, on zero or on two-or-more matching lines; a line offering two matching readings (C.1 above)
// still counts once toward that limit.
function transformDodLines(lines, match, verdict, note) {
  const masked = maskFencedLines(lines, 'dod-line input', 'edited');
  const wanted = collapseWhitespace(match);
  const range = dodSectionRange(masked);
  const lo = range ? range.start : 0;
  const hi = range ? range.end : lines.length;
  const hits = [];
  for (let i = lo; i < hi; i += 1) {
    const readings = parseDodLineReadings(masked[i]);
    const reading = readings.find((r) => collapseWhitespace(r.criterion) === wanted);
    if (reading) hits.push({ index: i, reading });
  }
  if (hits.length === 0) fail(`no checklist line matches criterion "${match}"`);
  if (hits.length > 1) {
    fail(`${hits.length} checklist lines match criterion "${match}" — which one to edit cannot be resolved`);
  }
  const { index: i, reading } = hits[0];
  const { prefix, criterion, tag } = reading;
  const out = lines.slice();
  out[i] = `${renderDodLine(prefix, criterion, tag, verdict)} — ${DOD_VERDICTS[verdict].label}: ${note}`;
  return out;
}

function takeOption(args, flag) {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

// A caller-supplied file's text, one trailing newline stripped, exactly as `--line` mode already
// strips it off stdin. Report-derived text (a `"`, a backtick, a `$(`, an embedded newline) reaches
// `dod-line` this way rather than as a shell-interpolated argument (triage #680).
function readOptionFile(flag, filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    fail(`${flag} could not read "${filePath}": ${e.message}`);
  }
  return raw.replace(/\r?\n$/, '');
}

function verbDodLine(args, stdinRaw) {
  const matchFile = takeOption(args, '--match-file');
  const verdict = takeOption(args, '--verdict');
  const noteFile = takeOption(args, '--note-file');
  const lineIdx = args.indexOf('--line');
  const lineMode = lineIdx >= 0;
  if (lineMode) args.splice(lineIdx, 1);

  if (args.includes('--match')) fail('dod-line reads the criterion text from a file: give --match-file <path>');
  if (args.includes('--note')) fail('dod-line reads the note from a file: give --note-file <path>');

  if (matchFile === undefined) fail('dod-line needs --match-file <path>');
  const resolvedMatch = readOptionFile('--match-file', matchFile);
  if (!resolvedMatch) fail('dod-line needs --match-file <path> to hold the criterion text');
  if (!DOD_VERDICTS[verdict]) {
    fail(`dod-line needs --verdict one of ${Object.keys(DOD_VERDICTS).join('|')} — got "${verdict || ''}"`);
  }
  if (noteFile === undefined) fail('dod-line needs --note-file <path>');
  const resolvedNote = readOptionFile('--note-file', noteFile);
  if (/[\n\r]/.test(resolvedNote)) fail('dod-line --note-file must not hold a newline — it would inject a free-text line into the body');
  // The verb writes the verdict's own label itself, so a note already opening with it would carry it twice.
  const ownLabel = `${DOD_VERDICTS[verdict].label}:`;
  const noteText = resolvedNote.toLowerCase().startsWith(ownLabel)
    ? resolvedNote.slice(ownLabel.length).trimStart()
    : resolvedNote;

  if (lineMode) {
    const line = stdinRaw.replace(/\r?\n$/, '');
    const [out] = transformDodLines([line], resolvedMatch, verdict, noteText);
    console.log(out);
    return;
  }
  const out = transformDodLines(splitLines(stdinRaw), resolvedMatch, verdict, noteText);
  // process.stdout.write, not console.log: console.log always appends its own trailing newline, which
  // would double up on the one splitLines/join already reproduce when stdinRaw itself ended in one.
  process.stdout.write(out.join('\n'));
}

// True when a checklist line carries a verdict note (`met:`, `not met:`, `ceiling:`, `accepted:`).
function dodLineHasNote(line) {
  const m = line.match(DOD_LINE_RE);
  return !!m && (DOD_WITH_NOTE_TAG_RE.test(m[2]) || DOD_WITH_NOTE_NO_TAG_RE.test(m[2]));
}

module.exports = {
  verbDodLine, parseDodLineReadings, dodLineHasNote, collapseWhitespace, dodSectionRange, takeOption, readOptionFile,
  DOD_LINE_RE, DOD_NO_NOTE_TAG_RE,
};
