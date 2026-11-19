'use strict';

// section.js: the `section` verb, one markdown section of a reference or repository document printed, its heading line read from stdin. It reads one file and writes nothing.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { maskFencedLines, headingKeyOf, headingLevel, hasSetextHeading, readLines } = require('./md-sections.js');

const PLUGIN_ROOT = path.join(__dirname, '..');
const ROOT_VAR = '${CLAUDE_PLUGIN_ROOT}';

// The file a name points at: a `${CLAUDE_PLUGIN_ROOT}` path or an absolute path as given; a bare `<name>.md` under the
// plugin's `references/`, then `agents/`; any other relative path under the plugin root, then the current directory. A bare
// `AGENTS.md` names the repository's own hierarchy root, so it reads the current directory only.
function resolveFile(cwd, name) {
  if (name.startsWith(ROOT_VAR)) return path.join(PLUGIN_ROOT, name.slice(ROOT_VAR.length));
  if (path.isAbsolute(name)) return name;
  if (name === 'AGENTS.md') return path.resolve(cwd, name);
  const candidates = !name.includes('/') && name.endsWith('.md')
    ? [path.join(PLUGIN_ROOT, 'references', name), path.join(PLUGIN_ROOT, 'agents', name)]
    : [path.join(PLUGIN_ROOT, name)];
  candidates.push(path.resolve(cwd, name));
  return candidates.find((c) => fs.statSync(c, { throwIfNoEntry: false })?.isFile()) || path.resolve(cwd, name);
}

// `section <file>`, the heading line on stdin: prints the heading line through the line before the next heading of the same
// or a higher level, outside fences, or through end of file. A heading is found by its level and whole text. A setext heading (`md-sections.js`'s
// `hasSetextHeading`) inside the span makes the end unknowable, so the verb refuses.
function verbSection(cwd, args, input) {
  if (!args[0]) fail('section needs a <file>');
  const wanted = headingKeyOf((input || '').replace(/\r\n/g, '\n').split('\n').find((l) => l.trim() !== '') || '');
  if (!headingLevel(wanted)) fail(`section: stdin holds no markdown heading line for ${args[0]}`);
  const file = resolveFile(cwd, args[0]);
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) fail(`section: ${args[0]} is not a readable file`);
  const lines = readLines(fs.readFileSync(file, 'utf8'));
  const masked = maskFencedLines(lines, file, 'printed');
  const hits = [];
  let fenced = 0;
  lines.forEach((l, i) => {
    if (headingLevel(l) && headingKeyOf(l) === wanted) {
      if (masked[i] === '') fenced += 1;
      else hits.push(i);
    }
  });
  if (hits.length === 0) {
    fail(fenced
      ? `section: ${args[0]} holds "${wanted}" only inside a fenced code block`
      : `section: ${args[0]} has no heading "${wanted}"`);
  }
  if (hits.length > 1) fail(`section: ${args[0]} holds "${wanted}" ${hits.length} times outside fences`);
  const level = headingLevel(wanted);
  let end = lines.length;
  for (let i = hits[0] + 1; i < lines.length; i += 1) {
    const l = headingLevel(masked[i]);
    if (l > 0 && l <= level) {
      end = i;
      break;
    }
  }
  if (hasSetextHeading(masked, hits[0], end)) {
    fail(`section: ${args[0]} may hold a setext heading inside "${wanted}", so where the section ends is unknown`);
  }
  const body = lines.slice(hits[0], end);
  while (body.length > 1 && body[body.length - 1].trim() === '') body.pop();
  console.log(body.join('\n'));
}

module.exports = { verbSection };
