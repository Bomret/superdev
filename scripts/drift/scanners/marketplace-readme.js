'use strict';

// The scanners over the repository's own entry documents: the marketplace manifest and the documentation audit set.

const fs = require('node:fs');
const path = require('node:path');

const { readDoc, missingDoc } = require('../lib');

// scanMarketplaceSource(): each plugin in `.claude-plugin/marketplace.json` must name the shipped tree. A
// relative string `source` must resolve to a directory carrying `.claude-plugin/plugin.json` (ADR 0032). A
// `git-subdir` object source must name such a directory in this repo by its `path`, name this repo's
// canonical clone URL (MARKETPLACE_URL) as its `url`, so a fork or a mistyped URL cannot break or hijack
// every install, and pin `ref` to `v` + that directory's plugin.json version (ADR 0131). An object source
// of any other shape fails the url check. `claude plugin validate .` accepts a source that names no
// directory at all, so a renamed tree or a mistyped path breaks every install while the suite stays green.
// The manifest is a repo-root file, never under `plugin/`, so it is read directly rather than through
// docPath().
const MARKETPLACE_URL = 'https://github.com/Bomret/superdev.git';
const MARKETPLACE_MANIFEST = path.join('.claude-plugin', 'marketplace.json');
function scanMarketplaceSource(root) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(root, MARKETPLACE_MANIFEST), 'utf8');
  } catch {
    return [missingDoc(MARKETPLACE_MANIFEST)];
  }
  const gaps = [];
  const gap = (expectation) => gaps.push({ source: MARKETPLACE_MANIFEST, expectation });
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    gap(`parse as JSON — ${err.message}`);
    return gaps;
  }
  const pluginJson = (dir) => path.join(root, dir, '.claude-plugin', 'plugin.json');
  for (const plugin of manifest.plugins || []) {
    const src = plugin.source ?? {};
    if (typeof src === 'string') {
      if (!fs.existsSync(pluginJson(src))) {
        gap(`point \`${plugin.name}\`'s source at a directory carrying \`.claude-plugin/plugin.json\` — ` +
          `\`${src}\` resolves to no plugin tree, and \`claude plugin validate\` accepts that`);
      }
      continue;
    }
    if (src.source !== 'git-subdir' || src.url !== MARKETPLACE_URL) {
      gap(`point \`${plugin.name}\`'s \`git-subdir\` url at \`${MARKETPLACE_URL}\`, this repo's canonical clone ` +
        `URL — it reads \`${src.url}\``);
    }
    let version;
    try {
      version = JSON.parse(fs.readFileSync(pluginJson(String(src.path)), 'utf8')).version;
    } catch {
      gap(`point \`${plugin.name}\`'s \`git-subdir\` path at a directory carrying \`.claude-plugin/plugin.json\` — ` +
        `\`${src.path}\` resolves to no plugin tree`);
      continue;
    }
    if (src.ref !== `v${version}`) {
      gap(`pin \`${plugin.name}\`'s \`git-subdir\` ref to \`v${version}\`, the release tag of ` +
        `\`${src.path}/.claude-plugin/plugin.json\` — it reads \`${src.ref}\``);
    }
  }
  return gaps;
}

// auditSetMatches(): how many files an audit-set pattern resolves to under `root`. The section's own rule
// makes every entry a repo-relative path, optionally with one `*` in a single segment — the shape
// `/superdev:document audit` expands — so this walks the segments literally and expands the starred one
// by reading that directory, rather than depending on a glob implementation whose availability varies
// by Node version.
function auditSetMatches(root, pattern) {
  const segments = pattern.split('/');
  const starAt = segments.findIndex((s) => s.includes('*'));
  if (starAt === -1) return fs.existsSync(path.join(root, pattern)) ? 1 : 0;
  const re = new RegExp(
    `^${segments[starAt].split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`,
  );
  const walk = (dir, at) => {
    if (at === segments.length) return 1;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0; // the directory itself is gone, which is the same lie as an empty match
    }
    let count = 0;
    for (const entry of entries) {
      const last = at === segments.length - 1;
      const matches = at === starAt ? re.test(entry.name) : entry.name === segments[at];
      if (!matches) continue;
      if (last) count += 1;
      else if (entry.isDirectory()) count += walk(path.join(dir, entry.name), at + 1);
    }
    return count;
  };
  return walk(root, 0);
}

// scanAuditSetGlobs(): every glob listed under `## Audit set` in this repo's own
// `docs/agents/documentation.md` matches at least one file. A glob matching nothing is indistinguishable
// from a clean audit — `/superdev:document audit` silently reads zero files and reports success. Paths
// are repo-relative by the section's own rule, so they are resolved against the root and never through
// docPath()'s plugin/ fallback.
const AUDIT_SET_DOC = path.join('docs', 'agents', 'documentation.md');
function scanAuditSetGlobs(root) {
  const doc = readDoc(root, AUDIT_SET_DOC);
  if (doc === null) return [missingDoc(AUDIT_SET_DOC)];
  const at = doc.search(/^##\s+Audit set\s*$/m);
  if (at === -1) {
    return [{ source: AUDIT_SET_DOC, expectation: 'carry the `## Audit set` section `/superdev:document audit` reads' }];
  }
  const gaps = [];
  const rest = doc.slice(at);
  const next = rest.slice(1).search(/^##\s/m);
  const section = next === -1 ? rest : rest.slice(0, next + 1);
  for (const m of section.matchAll(/^-\s+`([^`]+)`\s*$/gm)) {
    const pattern = m[1];
    if (auditSetMatches(root, pattern) === 0) {
      gaps.push({
        source: AUDIT_SET_DOC,
        expectation:
          `list only audit-set patterns that resolve — \`${pattern}\` matches no file, so ` +
          '`/superdev:document audit` reads nothing for it and still reports a clean pass',
      });
    }
  }
  return gaps;
}

module.exports = { scanMarketplaceSource, scanAuditSetGlobs };
