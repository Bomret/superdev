'use strict';

// ledger-records.js: the verbs that record one fact on a ledger header or bullet line, `degraded`, `unresolved`, `deferred`, `minors`, `docs`, `pr`, and `deploy`.

const { fail } = require('./refusal.js');
const { checkSliceId, ledgerPath, readLines, writeLines, headerRe, getHeader, insertHeader, readBullets, tableRowIndexes, splitRow } = require('./ledger.js');

// The write half of `readBullets`: append one bullet under `**<name>:**`, creating that line beside
// `**Stage:**` when the ledger has none yet (scope-findings `## Degraded passes`, `## Unresolved defects`).
// A newline in the text would break the one bullet = one line assumption the reader depends on. `verb`
// names the invoked subcommand verbatim (`degraded add`, `degraded reset-denials`, …), so a refusal
// names what the caller actually typed rather than a sibling subcommand's shape; `noun` names what the
// missing text is called there — `reset-denials` takes a reason, everything else a bullet.
// `unresolved add -`, `deferred add -`, `degraded add -`, `degraded add-denial -`, and `degraded
// reset-denials -` read their bullet text from stdin instead of a shell-interpolated argument
// (triage #680): the sentinel `-` as the sole word past the subcommand means "read stdin," one
// trailing newline stripped, exactly as `dod-line`'s own stdin path already strips it. `add-denial`
// quotes a classifier's own refusal text, and `reset-denials` an operator's own reason, either of
// which can carry a quote, a backtick, or a `$(` just as easily as any other bullet text. Any other
// subcommand, or any other shape of these subcommands' own arguments, keeps joining its positional
// words with spaces as it always has.
const BULLET_STDIN_SUBS = ['add', 'add-denial', 'reset-denials', 'resolve'];
function resolveBulletText(sub, rest, stdinJson) {
  if (BULLET_STDIN_SUBS.includes(sub) && rest.length === 1 && rest[0] === '-') return stdinJson.replace(/\r?\n$/, '');
  return rest.join(' ');
}

function addBullet(root, name, verb, text, noun = 'bullet text') {
  if (!text) fail(`${verb} needs the ${noun}`);
  if (text.includes('\n')) fail(`${verb} text must not contain a newline`);
  const lines = readLines(root);
  let at = lines.findIndex((l) => headerRe(name).test(l));
  if (at < 0) {
    const stageAt = lines.findIndex((l) => headerRe('Stage').test(l));
    at = stageAt >= 0 ? stageAt + 1 : 0;
    lines.splice(at, 0, `**${name}:**`);
  }
  // Append after the last existing bullet under the line.
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith('- ')) end++;
  lines.splice(end, 0, `- ${text}`);
  writeLines(root, lines);
}

// A denied verification dispatch and a pass that could not reach what it needed share the `**Degraded:**`
// line and answer different questions, so the denial carries a prefix (scope-findings `## Degraded passes`,
// ADR 0041). `get denials` counts by that prefix, which is why it is structural rather than a convention
// each of the three recording callers would have to word identically. A reset marker carries a prefix of
// its own: the count runs from the last one, which returns the budget while every recorded denial stays
// on the line (ADR 0044).
const DENIAL_PREFIX = 'denied: ';
const RESET_PREFIX = 'denials reset: ';

function verbDegraded(root, sub, text) {
  if (sub === 'add-denial') {
    // The refusals are `addBullet`'s, named as `add-denial`'s: one bullet record, one set of rules.
    addBullet(root, 'Degraded', 'degraded add-denial', text && `${DENIAL_PREFIX}${text}`);
    return;
  }
  if (sub === 'reset-denials') {
    addBullet(root, 'Degraded', 'degraded reset-denials', text && `${RESET_PREFIX}${text}`, 'reason');
    return;
  }
  if (sub !== 'add') fail(`unknown degraded subcommand "${sub}" — use add|add-denial|reset-denials`);
  // `get denials` reads meaning from both prefixes, so a plain bullet able to carry one is a bullet able
  // to move the count. `add-denial` is only for the denied *verification* dispatches the cap counts
  // (scope-findings `## Degraded passes`); a denied Bash command or a denied *authoring* dispatch still
  // takes plain `add` (`skills/implement/SKILL.md`, `references/implement-full-denied.md`) — so a text that quotes
  // such a denial verbatim, rather than getting routed to `add-denial`, reworks its wording instead.
  if (text.startsWith(DENIAL_PREFIX)) {
    fail(
      `degraded add text must not begin "${DENIAL_PREFIX}" — add-denial is for a denied verification ` +
        `dispatch; any other denial (a denied Bash command, a denied authoring dispatch) reworks its ` +
        `text instead of quoting "${DENIAL_PREFIX}" verbatim`
    );
  }
  if (text.startsWith(RESET_PREFIX)) fail(`degraded add text must not begin "${RESET_PREFIX}" — use degraded reset-denials`);
  addBullet(root, 'Degraded', 'degraded add', text);
}

// Removes the `**<name>:**` line and its bullets. Returns whether the ledger changed: an absent line succeeds and
// changes nothing.
function clearBullets(root, name) {
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe(name).test(l));
  if (at < 0) return false;
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith('- ')) end++;
  lines.splice(at, end - at);
  writeLines(root, lines);
  return true;
}

function verbUnresolved(root, sub, text) {
  if (sub === 'clear') return clearBullets(root, 'Unresolved');
  if (sub !== 'add') fail(`unknown unresolved subcommand "${sub}" — use add|clear`);
  addBullet(root, 'Unresolved', 'unresolved add', text);
  return true;
}

// `**Deferred:**` carries a finding a fix loop (the scope review's, or the full tier's per-slice loop) handed
// to `/superdev:plan` rather than fixed: its
// remedy would add a capability the Definition of Done never named (ADR 0035, ADR 0097). It has no `clear`, unlike
// the unresolved record it otherwise mirrors — a defect stops being true once a run re-verifies clean,
// while unplanned work stays unplanned until somebody plans it. `resolve` removes one finding instead: the
// one a later cycle of the same run fixed with a guard-rail remedy after all (ADR 0121). It matches the
// exact text `get deferred` printed, removes every identical bullet, and drops the line once none remain.
function verbDeferred(root, sub, text) {
  if (sub === 'resolve') {
    if (!text) fail('deferred resolve needs the bullet text');
    if (text.includes('\n')) fail('deferred resolve text must not contain a newline');
    const lines = readLines(root);
    const at = lines.findIndex((l) => headerRe('Deferred').test(l));
    let end = at + 1;
    while (at >= 0 && end < lines.length && lines[end].startsWith('- ')) end++;
    const kept = at < 0 ? [] : lines.slice(at + 1, end).filter((l) => l !== `- ${text}`);
    if (at < 0 || kept.length === end - at - 1) fail(`no deferred bullet reads exactly "${text}" in ${ledgerPath(root)}`);
    lines.splice(at, end - at, ...(kept.length ? [lines[at], ...kept] : []));
    writeLines(root, lines);
    return;
  }
  if (sub !== 'add') fail(`unknown deferred subcommand "${sub}" — use add|resolve`);
  addBullet(root, 'Deferred', 'deferred add', text);
}

// `**Minors:**` is the Minor queue (ADR 0174, INV-0171): one bullet per full-tier slice that merged with open Minor
// findings, naming the slice by id alone. The slice's progress log is derived from the id (`reports/<id>/progress.md`),
// so no path is written. `add` refuses an id the slice table lacks and leaves one bullet for an id queued twice;
// `clear` removes the line once the Minor sweep settles, and succeeds with no change when it is absent. Returns
// whether the ledger changed, so the caller traces only a write.
function verbMinors(root, sub, id, argc) {
  if (sub === 'clear' && argc > 1) fail('minors clear takes no argument');
  if (sub === 'add' && argc > 2) fail('minors add takes one slice id');
  if (sub === 'clear') return clearBullets(root, 'Minors');
  if (sub !== 'add') fail(`unknown minors subcommand "${sub}" — use add|clear`);
  if (!id) fail('minors add needs the slice id');
  checkSliceId(id);
  const lines = readLines(root);
  if (!tableRowIndexes(lines).some((i) => splitRow(lines[i])[0] === id)) {
    fail(`minors add: no slice "${id}" in the slice table of ${ledgerPath(root)}`);
  }
  if (readBullets(lines, 'Minors').includes(id)) return false;
  addBullet(root, 'Minors', 'minors add', id);
  return true;
}

// `**Docs:**` records that a run performed its documentation pass in the controller's own context
// rather than through a dispatched doc-writer (ADR 0031). `/superdev:document` reads it to skip that
// dispatch; `/superdev:review`'s fix loop clears it when its fix cycles land commits,
// because those commits made the pass stale. The value names the pass rather than merely marking presence,
// so another arrangement can record its own kind without a second header.
function verbDocs(root, sub, value) {
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe('Docs').test(l));
  if (sub === 'clear') {
    if (at < 0) return false; // no such line — succeeds, changes nothing
    lines.splice(at, 1);
    writeLines(root, lines);
    return true;
  }
  if (sub !== 'set') fail(`unknown docs subcommand "${sub}" — use set|clear`);
  if (!value) fail('docs set needs a value');
  // `Docs` is a TOKEN_HEADERS entry: `get docs` reads back only the first whitespace-delimited
  // token, so a value with internal whitespace would write something `get docs` can never round-trip.
  if (/\s/.test(value)) fail('docs set value must not contain whitespace — "get docs" only reads back the first token');
  if (at >= 0) {
    lines[at] = `**Docs:** ${value}`;
    writeLines(root, lines);
    return true;
  }
  writeLines(root, insertHeader(lines, 'Docs', value));
  return true;
}

// pr set: `**PR:**` records the pull request number `/superdev:submit-pr` opened, the moment it opens
// it, so `/superdev:ship` reads it back instead of a code-host lookup by head branch — a reused branch
// name (scope-branch.md's `## Cutting the scope branch` treats reuse as ordinary) leaves old, merged pull
// requests on the host under the same head, and a lookup by branch alone could adopt one of those
// instead (INV-0092). A ledger from before this header existed carries no line, and parses unchanged —
// `get pr` reports `absent`, the same as any other missing optional header (run-state.md's `## The ledger`).
function verbPr(root, sub, value) {
  const lines = readLines(root);
  const at = lines.findIndex((l) => headerRe('PR').test(l));
  if (sub === 'clear') {
    if (at < 0) return false; // no such line — succeeds, changes nothing
    lines.splice(at, 1);
    writeLines(root, lines);
    return true;
  }
  if (sub !== 'set') fail(`unknown pr subcommand "${sub}" — use set|clear`);
  if (!value) fail('pr set needs a value');
  const digits = value.replace(/^#/, '');
  if (!/^\d+$/.test(digits)) fail(`pr set value must be a number, optionally led by "#" — got "${value}"`);
  const rendered = `#${digits}`;
  if (at >= 0) {
    lines[at] = `**PR:** ${rendered}`;
    writeLines(root, lines);
    return true;
  }
  writeLines(root, insertHeader(lines, 'PR', rendered));
  return true;
}

// deploy set/get: `**Deploy:**` records each deploy target's state for the run, so `/superdev:ship`
// can tell a finished deploy from a failed one and resume where it stopped (INV-0099) — the ledger is
// the record it reads rather than re-running or re-deriving a target's state from scratch. A target
// name is one word, the same as `docs/agents/deployment.md`'s targets table names it. The value is a
// comma-joined list of `<target> <state>[ exit <n>]` entries, in the order each target was first
// recorded — the same first-recorded ordering run-state.md's `## The ledger` gives the slice table.
const DEPLOY_STATES = ['pending', 'deployed', 'failed'];
const DEPLOY_ENTRY_RE = new RegExp(`^(\\S+) (${DEPLOY_STATES.join('|')})(?: exit (\\d+))?$`);

function parseDeployRecord(raw) {
  if (!raw) return [];
  return raw.split(', ').map((entry) => {
    const m = entry.match(DEPLOY_ENTRY_RE);
    if (!m) fail(`unreadable deploy record entry: "${entry}"`);
    const rec = { target: m[1], state: m[2] };
    if (m[3] !== undefined) rec.exit = m[3];
    return rec;
  });
}

function renderDeployRecord(records) {
  return records.map((r) => `${r.target} ${r.state}${r.exit !== undefined ? ` exit ${r.exit}` : ''}`).join(', ');
}

function verbDeploySet(root, target, state, exitCode) {
  if (!target) fail('deploy set needs a <target>');
  if (!/^[^\s,]+$/.test(target)) fail(`target "${target}" must be one word`);
  if (!DEPLOY_STATES.includes(state)) fail(`unknown deploy state "${state}" — use ${DEPLOY_STATES.join('|')}`);
  if (exitCode !== undefined && state !== 'failed') fail('--exit belongs only with failed');
  if (exitCode !== undefined && !/^\d+$/.test(exitCode)) fail(`--exit value must be a number — got "${exitCode}"`);
  const lines = readLines(root);
  const records = parseDeployRecord(getHeader(lines, 'Deploy'));
  const idx = records.findIndex((r) => r.target === target);
  const rec = { target, state };
  if (state === 'failed' && exitCode !== undefined) rec.exit = exitCode;
  if (idx >= 0) records[idx] = rec;
  else records.push(rec);
  const value = renderDeployRecord(records);
  const at = lines.findIndex((l) => headerRe('Deploy').test(l));
  if (at >= 0) {
    lines[at] = `**Deploy:** ${value}`;
    writeLines(root, lines);
    return;
  }
  writeLines(root, insertHeader(lines, 'Deploy', value));
}

function verbDeployGet(root) {
  const raw = getHeader(readLines(root), 'Deploy');
  if (raw === null) {
    console.log('absent');
    return;
  }
  for (const r of parseDeployRecord(raw)) {
    console.log(`${r.target} ${r.state}${r.exit !== undefined ? ` exit ${r.exit}` : ''}`);
  }
}

module.exports = {
  BULLET_STDIN_SUBS, DENIAL_PREFIX, RESET_PREFIX,
  resolveBulletText, verbDegraded, verbUnresolved, verbDeferred, verbMinors, verbDocs, verbPr, verbDeploySet, verbDeployGet,
};
