'use strict';

// The scanners over the base-branch, ship, and derive wording: no commit to base, no ship that opens a pull request, no past-PR skill left gated, no Definition of Done in derive.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, readDoc, missingDoc, maskFences, maskedSentences, normalizeWhitespace } = require('../lib');
const { walkFiles, NEVER_NEGATION_WINDOW } = require('./walkers');

// INV-0001 (docs/invariants.md): no shipped prose instructs a commit, a push, or a merge to the base
// branch, whether it names the target by the words "base branch" or by the base's own configured name
// (e.g. `main`, read from docs/agents/code-management.md's own `**Base branch:**` bullet). `/superdev:ship`'s
// own merge onto base runs only through the host's merge API (ADR 0096, INV-0092), the one site this
// scanner admits — SHIP_MERGE_ADMIT_FILE plus the SHIP_MERGE_ADMIT_PATTERN wording below, so the
// admission is narrow: a literal git merge or push to base written anywhere else, ship's own file
// included, still fails. The verb and the target have to sit close together, or a legitimate "never
// commit … onto the base branch" caution — `references/prototype.md` carries exactly that shape — would
// itself read as an instruction to do the thing it forbids. A `never` excuses the match only when it
// sits right next to the *verb* ("Never commit … to the base branch") or right next to the *target*
// ("commit … never onto the base branch"), each within NEVER_NEGATION_WINDOW chars — not merely
// somewhere between the verb and the target.
// The window is a small sliding join of consecutive lines rather than the whole normalized document,
// both so a `never` near the target reliably sits inside the same window and so the reported line is
// close to where the instruction actually starts.
// simplicity: the window is 4 lines / 150 chars, a heuristic proximity bound, not a parser — an
// instruction split across 5 or more lines is missed. Widen BASE_BRANCH_COMMIT_WINDOW (and the 150-char
// bound below, in step) if that shape turns up for real.
const BASE_BRANCH_COMMIT_WINDOW = 4;
const BASE_BRANCH_VERB = '\\b(?:commit(?:s|ted|ting)?|push(?:es|ed|ing)?|merge(?:s|d|ing)?)\\b(?!-)';
// The one admitted site: `/superdev:ship`'s own squash-merge onto base, through the host's merge API —
// admitted by file AND by this wording sitting within reach forward of the match's own position, never
// by file alone, so a second, unrelated base-branch instruction ship's own file might one day carry
// still fails.
const SHIP_MERGE_ADMIT_FILE = path.join('skills', 'ship', 'SKILL.md');
const SHIP_MERGE_ADMIT_PATTERN = /host'?s merge API/i;
const CODE_MANAGEMENT_DOC = path.join('docs', 'agents', 'code-management.md');
function verbTargetPattern(targetSource) {
  return new RegExp(`${BASE_BRANCH_VERB}([\\s\\S]{0,150}?)(?:${targetSource})`, 'i');
}
const BASE_BRANCH_PHRASE_PATTERN = verbTargetPattern('\\bbase branch\\b');

// The base's own configured name is a git target only in an unambiguous shape — backtick-quoted (like
// the `**Base branch:**` bullet's own value) or pushed to `origin` — never a bare word, since a base
// branch is commonly named "main" and that word is also ordinary English ("the main checkout", "the
// main working tree").
function baseNamePattern(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return verbTargetPattern(`\`${escaped}\`|\\borigin\\s+${escaped}\\b`);
}

// negated(): true when a `never` sits right next to the instruction — either right before the
// *target* (the text between verb and target ends in "never", the shape `never onto the base
// branch` carries) or right before the *verb* itself (the text before the verb ends in "never", the
// shape `Never commit … to the base branch` carries). Either shape is a caution; a `never` anywhere
// else in the window (an earlier aside, an unrelated clause) is not.
function negated(beforeVerbText, betweenText) {
  return (
    /\bnever\b\s*$/i.test(beforeVerbText.slice(-NEVER_NEGATION_WINDOW)) ||
    /\bnever\b/i.test(betweenText.slice(-NEVER_NEGATION_WINDOW))
  );
}

// scanNoBaseBranchCommit(): walks every file under `skills/` and `references/` (INV-0001's own `Paths:`)
// and reports the line of every commit-or-push-to-base-branch instruction it finds, not only the first —
// one gap per real instance, however many a file carries. Fenced examples are masked first. The window
// joins real newlines so a match's own line is recoverable by counting the newlines ahead of it, which is
// what lets a wrapped sentence still report the line it starts on rather than only the window's.
function scanNoBaseBranchCommit(root) {
  const gaps = [];
  const codeManagement = readDoc(root, CODE_MANAGEMENT_DOC);
  if (codeManagement === null) gaps.push(missingDoc(CODE_MANAGEMENT_DOC));
  const baseNameMatch = codeManagement && codeManagement.match(/\*\*Base branch:?\*\*:?\s*`([^`]+)`/i);
  const patterns = [BASE_BRANCH_PHRASE_PATTERN];
  if (baseNameMatch) patterns.push(baseNamePattern(baseNameMatch[1]));
  for (const dir of ['skills', 'references']) {
    const dirPath = docPath(root, dir);
    let files;
    try {
      files = walkFiles(dirPath).filter((f) => f.endsWith('.md'));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const rel of files) {
      const source = path.join(dir, rel).split(path.sep).join('/');
      const isShipMergeAdmitFile = source === SHIP_MERGE_ADMIT_FILE;
      const text = fs.readFileSync(path.join(dirPath, rel), 'utf8');
      const masked = maskFences(text);
      const lines = masked.split('\n');
      // Each line's absolute character offset in `masked`, so a match found by a window starting
      // partway through the file can still test negation against everything that came before it in
      // the real document — never only the window slice that happened to find it.
      const lineOffsets = [];
      let offset = 0;
      for (const l of lines) {
        lineOffsets.push(offset);
        offset += l.length + 1;
      }
      // Every sliding window re-finds the same physical match for as long as it stays in range, so
      // dedup on the match's absolute offset — never on "the first hit in this file" — is what lets
      // a real violation later in the file still get reported instead of being masked by an earlier
      // one, negated or not.
      const reportedAt = new Set();
      for (let i = 0; i < lines.length; i++) {
        const window = lines.slice(i, i + BASE_BRANCH_COMMIT_WINDOW).join('\n');
        for (const pattern of patterns) {
          const match = pattern.exec(window);
          if (!match) continue;
          const absIndex = lineOffsets[i] + match.index;
          if (reportedAt.has(absIndex)) continue;
          if (negated(masked.slice(0, absIndex), match[1])) continue;
          // Tested against the whole document from the match's own absolute offset forward, never
          // against `window` alone: the admission wording can sit just past the window's edge.
          if (isShipMergeAdmitFile && SHIP_MERGE_ADMIT_PATTERN.test(masked.slice(absIndex, absIndex + 200))) continue;
          reportedAt.add(absIndex);
          const lineOffset = window.slice(0, match.index).split('\n').length - 1;
          gaps.push({ source, line: i + 1 + lineOffset });
        }
      }
    }
  }
  return gaps;
}

// scanShipNoOpensPr(): walks skills/, agents/, and references/ (the plugin's shipped surfaces,
// not docs/adr/'s history) and reports every sentence where the open-a-pull-request phrase attaches to
// `/superdev:ship` — `/superdev:submit-pr` opens it, `/superdev:ship` only merges what is already open
// (ADR 0096). "Attaches" means `/superdev:ship` is immediately followed, within SHIP_OPENS_PR_WINDOW
// chars and with no other `/superdev:<name>` mention in between, by the open-PR phrase — not merely that
// both sit somewhere in the same sentence. Fenced examples are masked first, and wrapped lines are joined
// before splitting into sentences (`maskedSentences()`).
// simplicity: shape-based, and its ceiling is the "open(s) the/a pull request" phrase within 80 characters
// after `/superdev:ship`. A paraphrase ("ship creates the PR") walks past.
const SHIP_OPENS_PR_WINDOW = 80;
const SHIP_ATTACHED_OPEN_PATTERN = new RegExp(
  `\\/superdev:ship\\b([\\s\\S]{0,${SHIP_OPENS_PR_WINDOW}}?)open(?:s|ing)?\\s+(?:the|a)\\s+pull request\\b`,
  'i',
);
const SHIP_STEP_SURFACE_DIRS = ['skills', 'agents', 'references'];
function scanShipNoOpensPr(root) {
  const gaps = [];
  const files = [];
  for (const dir of SHIP_STEP_SURFACE_DIRS) {
    const dirPath = docPath(root, dir);
    let found;
    try {
      found = walkFiles(dirPath).filter((f) => f.endsWith('.md'));
    } catch {
      continue; // no such dir → nothing to scan
    }
    for (const rel of found) files.push(path.join(dir, rel).split(path.sep).join('/'));
  }
  for (const rel of files) {
    const text = readDoc(root, rel);
    for (const sentence of maskedSentences(text)) {
      const match = SHIP_ATTACHED_OPEN_PATTERN.exec(sentence);
      // The captured middle text carrying another `/superdev:<name>` means the open-PR phrase
      // attaches to that other command, not to `/superdev:ship`.
      if (!match || /\/superdev:(?!ship\b)[a-z-]+/i.test(match[1])) continue;
      gaps.push({
        source: rel,
        expectation:
          'never let the open-the-pull-request phrase attach to `/superdev:ship` — ' +
          `\`/superdev:submit-pr\` opens it, \`/superdev:ship\` only merges what is already open: "${normalizeWhitespace(sentence)}"`,
      });
    }
  }
  return gaps;
}

// scanPastPrSkills(): the skills an offer starts past the open pull request (ADR 0157). Three facts and
// forbidden forms, no wording (ADR 0153): each of OFFER_TARGETS carries no `disable-model-invocation: true` in
// its frontmatter, since the Skill tool cannot start such a skill (INV-0066); verify-ship and wrap-up name no
// `--unattended` token, since every unattended run ends at submit-pr (INV-0093) — ship names it only to
// refuse it; and the removed `--from-ship` path stays out of ship, verify-ship, and response-shapes.md.
const OFFER_TARGETS = ['ship', 'verify-ship', 'wrap-up', 'publish-kb'];
const NO_UNATTENDED_SKILLS = ['verify-ship', 'wrap-up'];
const NO_FROM_SHIP_DOCS = [
  path.join('skills', 'ship', 'SKILL.md'),
  path.join('skills', 'verify-ship', 'SKILL.md'),
  path.join('references', 'response-shapes.md'),
];

function scanPastPrSkills(root) {
  const gaps = [];
  const docs = new Map();
  const read = (source) => {
    if (!docs.has(source)) docs.set(source, readDoc(root, source));
    return docs.get(source);
  };
  const missing = new Set();
  const present = (source) => {
    if (read(source) !== null) return true;
    if (!missing.has(source)) gaps.push(missingDoc(source));
    missing.add(source);
    return false;
  };
  for (const name of OFFER_TARGETS) {
    const source = path.join('skills', name, 'SKILL.md');
    if (!present(source)) continue;
    const fm = read(source).match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    if (fm !== null && /^disable-model-invocation:\s*true\s*$/m.test(fm[1])) {
      gaps.push({
        source,
        expectation: 'carry no `disable-model-invocation: true`, because an offer starts it through the Skill tool (INV-0066, ADR 0157)',
      });
    }
  }
  for (const name of NO_UNATTENDED_SKILLS) {
    const source = path.join('skills', name, 'SKILL.md');
    if (present(source) && /--unattended/.test(read(source))) {
      gaps.push({ source, expectation: 'name no `--unattended` mode of its own — it carries none (INV-0093, ADR 0096)' });
    }
  }
  for (const source of NO_FROM_SHIP_DOCS) {
    if (present(source) && /--from-ship/.test(read(source))) {
      gaps.push({ source, expectation: 'name no `--from-ship` path: a started verify-ship runs exactly as a typed one (ADR 0157)' });
    }
  }
  return gaps;
}

// scanDeriveNoDod(): plan's derive dispatch hands `final-reviewer` no Definition of Done, and derive mode
// reads none (INV-0158, ADR 0158). The plan side is bounded to the dispatch bullet and its indented
// continuation lines, because plan names the draft legitimately elsewhere; the agent side to the
// `## Derive mode` section. A missing bullet or section is a gap, so a rename cannot pass vacuously.
// simplicity: shape-based; a paraphrase that hands the draft without these words walks past.
const DERIVE_DISPATCH_START = /^- \*\*Dispatch `superdev:final-reviewer` in derive mode\*\*/;
const DERIVE_DISPATCH_DOD = /dod-draft|dod\.md|drafted Definition of Done|\bDoD path\b/i;
const DERIVE_MODE_DOD = /dod-draft|dod\.md|drafted Definition of Done|\bDoD path\b|\bopens? the (?:DoD|Definition of Done)\b/i;
function scanDeriveNoDod(root) {
  const gaps = [];
  const plan = path.join('skills', 'plan', 'SKILL.md').split(path.sep).join('/');
  const planText = readDoc(root, plan);
  if (planText === null) gaps.push(missingDoc(plan));
  else {
    const lines = planText.split('\n');
    const start = lines.findIndex((l) => DERIVE_DISPATCH_START.test(l));
    if (start === -1) {
      gaps.push({ source: plan, expectation: 'carry the `**Dispatch `superdev:final-reviewer` in derive mode**` bullet (INV-0158)' });
    } else {
      let end = start + 1;
      while (end < lines.length && /^ {2}\S/.test(lines[end])) end++;
      if (DERIVE_DISPATCH_DOD.test(lines.slice(start, end).join(' '))) {
        gaps.push({ source: plan, expectation: 'hand the derive dispatch no Definition of Done, by path or by text (INV-0158, ADR 0158)' });
      }
    }
  }
  const agent = path.join('agents', 'final-reviewer.md').split(path.sep).join('/');
  const agentText = readDoc(root, agent);
  if (agentText === null) gaps.push(missingDoc(agent));
  else {
    const m = /^## Derive mode\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(agentText);
    if (!m) gaps.push({ source: agent, expectation: 'carry the `## Derive mode` section (INV-0158)' });
    else if (DERIVE_MODE_DOD.test(m[1].replace(/\s+/g, ' '))) {
      gaps.push({ source: agent, expectation: 'read no Definition of Done in derive mode, by any route (INV-0158, ADR 0158)' });
    }
  }
  return gaps;
}

module.exports = { scanNoBaseBranchCommit, scanShipNoOpensPr, scanPastPrSkills, scanDeriveNoDod };
