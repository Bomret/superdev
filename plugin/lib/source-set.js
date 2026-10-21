'use strict';

// source-set.js: the gap audit's source set, every tracked code file of a tree outside its test paths (ADR 0162).

const fs = require('fs');
const path = require('path');
const { testPathPatterns } = require('./verification.js');
const { gitSpawn } = require('./git-spawn.js');
const { fail } = require('./refusal.js');

// Docs, configuration, lockfiles, and binary assets (images, fonts, archives, media, native binaries, bytecode), by extension
// or by name (extensionless docs among them), dot-prefixed configuration files, the vendored directories at any depth, and the
// generated `dist/` and `build/` at the repository root only.
const NON_CODE_RE =
  /\.(md|mdx|markdown|rst|adoc|txt|json|jsonc|json5|ya?ml|toml|ini|cfg|conf|lock|lockb|png|jpe?g|gif|svg|ico|webp|bmp|pdf|woff2?|ttf|otf|eot|zip|jar|gz|tgz|tar|7z|mp4|mov|webm|mp3|wav|ogg|so|dylib|dll|exe|wasm|class|pyc|o|a)$/i;
// Extensionless doc names in any case (`README`, `readme`, `license`); the same name with an extension (`readme.js`) is code.
const DOC_NAME_RE = /^(?:readme|history|changes|notice|changelog|authors|codeowners|contributors|licen[cs]e|copying)$/i;
// A LICENSE, LICENCE, or COPYING stem: an uppercase stem with a `-` or `.` suffix (`LICENSE-MIT`, `COPYING.LESSER`), or a
// stem in any case with a `-` suffix and no extension (`license-apache`, `License-MIT`). A lowercase or mixed-case stem
// with an extension is code (`license.js`, `License.java`, `license-check.js`). Two regexes, because only the
// extensionless `-` arm ignores case.
const LICENSE_VARIANT_RE = /^(?:LICEN[CS]E|COPYING)[-.]/;
const LICENSE_DASH_RE = /^(?:licen[cs]e|copying)-[^.]*$/i;
const VENDORED_RE = /(?:^|\/)(?:vendor|node_modules)\/|^(?:dist|build)\//;

function isSource(rel) {
  const base = path.posix.basename(rel);
  return !NON_CODE_RE.test(rel) && !base.startsWith('.') && base !== 'go.sum' && !DOC_NAME_RE.test(base) && !LICENSE_VARIANT_RE.test(base) && !LICENSE_DASH_RE.test(base) && !VENDORED_RE.test(rel);
}

// Prints one repository-relative path per line. `git ls-files` lists tracked files only, so an untracked file is outside;
// of those, only a regular file on disk prints.
function verbSourceSet(cwd, args) {
  const scope = args[0];
  if (scope !== undefined && !fs.existsSync(path.resolve(cwd, scope))) fail(`source-set: no such path "${scope}"`);
  const top = gitSpawn(['rev-parse', '--show-toplevel'], cwd);
  if (top.status !== 0) fail('source-set: not inside a git repository');
  const root = top.stdout.trim();
  const listed = gitSpawn(['ls-files', '-z', '--full-name', '--', ...(scope !== undefined ? [scope] : [])], cwd, {
    maxBuffer: 1 << 30,
  });
  if (listed.status !== 0) fail('source-set: git ls-files failed');
  // Read once for the whole listing; no file reads as no `## Test paths` section, so the defaults apply.
  let verification = '';
  try { verification = fs.readFileSync(path.join(root, 'docs', 'agents', 'verification.md'), 'utf8'); } catch {}
  const tests = testPathPatterns(verification);
  // A regular file on disk only: a submodule gitlink is a directory or absent, and an index entry deleted from the
  // working tree is absent; neither is readable for the auditor.
  const onDisk = (rel) => fs.statSync(path.join(root, rel), { throwIfNoEntry: false })?.isFile();
  const files = listed.stdout
    .split('\0')
    .filter((rel) => rel && isSource(rel) && !tests.some((re) => re.test(rel)) && onDisk(rel));
  if (files.length) console.log(files.join('\n'));
}

module.exports = { verbSourceSet };
