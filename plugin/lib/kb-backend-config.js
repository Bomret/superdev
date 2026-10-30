'use strict';

// kb-backend-config.js: reads `docs/agents/knowledge-base.md` into a backend classification and its
// command templates, resolving each verb by heading name.

const { fail } = require('./refusal.js');
const { timeoutMs } = require('./kb-backend.js');
const { operatorSection } = require('./operator-config.js');

const VERBS = ['find', 'read', 'create', 'update', 'delete'];

// Extracts one `## <headingText>` section's body: everything up to the next `## ` heading (or
// EOF). Used for `## Commands` itself.
function extractH2Section(text, headingText) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${headingText}`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

// Resolution is BY HEADING NAME, never by position: each verb's fenced block is found inside its
// own named `### <verb>` subsection, so a fenced block inserted or removed elsewhere never shifts
// which template a later verb reads (the exact hazard ADR 0069 names in reading fenced blocks by index).
function parseCommandsTemplates(sectionText) {
  const lines = sectionText.split('\n');
  const templates = {};
  for (const verb of VERBS) {
    const start = lines.findIndex((l) => l.trim().toLowerCase() === `### ${verb}`);
    if (start === -1) continue;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^###\s+/.test(lines[i])) {
        end = i;
        break;
      }
    }
    const sub = lines.slice(start + 1, end).join('\n');
    const fence = sub.match(/```[^\n]*\n([\s\S]*?)```/);
    if (fence) templates[verb] = fence[1].replace(/\n$/, '');
  }
  return templates;
}

// Reads one `- **<label>:**` configuration bullet the same way `classifyBackend` reads
// `- **Backend:**` — first word, case-folded, trailing punctuation stripped — or `fallback` when the
// bullet is absent.
function parseBullet(docText, label, fallback) {
  const m = docText.match(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`, 'm'));
  return m ? m[1].trim().split(/\s+/)[0].toLowerCase().replace(/[.,;:]+$/, '') : fallback;
}

// `- **Body format:**`. Absent means `markdown` (ADR 0027's default: `kb-patch.js` merges markdown
// ATX headings), so only a backend storing something else (Confluence's `storage` XHTML) needs the
// bullet at all.
const parseBodyFormat = (docText) => parseBullet(docText, 'Body format', 'markdown');

// `- **Hierarchy:** links`. `links` means the backend's hierarchy is body links the published page is
// edited into (ADR 0168); absent means `nested`, today's `parentId` nesting on `create`.
const parseHierarchy = (docText) => parseBullet(docText, 'Hierarchy', 'nested');

// Classifies `docs/agents/knowledge-base.md`. `docText === null` means the file is absent, which
// reads the same as a configured `none` backend. `local`/`none` publish nothing (a local backend's
// pages are repository files, ADR 0023) and `unconfigured` is a repo whose knowledge base is a real
// remote backend that has not been migrated to the `## Commands` shape yet.
function classifyBackend(docText) {
  if (docText === null) {
    return { kind: 'none', reason: 'no knowledge-base configuration (docs/agents/knowledge-base.md is absent) — nothing to publish' };
  }
  const m = docText.match(/^- \*\*Backend:\*\*\s*(.+)$/m);
  const firstWord = m ? m[1].trim().split(/\s+/)[0].toLowerCase().replace(/[.,;:]+$/, '') : null;
  if (firstWord === 'local' || firstWord === 'none') {
    return { kind: firstWord, reason: `the knowledge-base backend is ${firstWord} — nothing to publish` };
  }
  const commands = extractH2Section(docText, 'Commands');
  if (commands === null) return { kind: 'unconfigured' };
  // `bodyFormat` rides on the same `templates` object rather than a sibling field: every function
  // between here and `publishPatch` already threads `templates` alone, and a patch is the only
  // caller that reads it.
  return { kind: 'remote', templates: { ...parseCommandsTemplates(commands), bodyFormat: parseBodyFormat(docText), hierarchy: parseHierarchy(docText) } };
}

// A backend command that still names `SUPERDEV_KB_` reads the environment variables superdev no longer passes (ADR 0207).
// Publishing, `--read`, and the parent-link edit (which runs inside a publish) reach this through `liveTemplates` before any backend call, so a stale
// command publishes nothing, leaves every staged page where it is, and tells the operator what to run.
function assertCurrentContract(templates) {
  const stale = VERBS.filter((verb) => templates[verb] && templates[verb].includes('SUPERDEV_KB_'));
  if (stale.length === 0) return;
  fail(
    `the ${stale.join(', ')} command(s) in docs/agents/knowledge-base.md still name SUPERDEV_KB_ ` +
      'variables, which superdev no longer passes — nothing published, every staged page kept; run /superdev:setup to rewrite the commands from the seed',
  );
}

// The templates every backend call runs with: refused when stale, then carrying the time bound and the
// operator configuration's `knowledge-base` section, both read from the checkout `cwd` (ADR 0207).
function liveTemplates(templates, cwd) {
  assertCurrentContract(templates);
  return { ...templates, timeoutMs: timeoutMs(cwd), operator: operatorSection(cwd, 'knowledge-base') };
}

module.exports = { parseCommandsTemplates, classifyBackend, liveTemplates };
