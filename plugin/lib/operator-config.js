'use strict';

// operator-config.js: the reader of the operator configuration's time bounds, `.superdev/info.json` of the main working tree (ADR 0207).

const fs = require('fs');
const path = require('path');
const { mainWorkTree } = require('./main-work-tree.js');

const MAX_TIMER_MS = 2147483647;
const noted = new Set();

// The object under `<section>` of the operator configuration, read from the main working tree whichever checkout `cwd` is, or
// `{}` when the file, the section, or valid JSON is missing.
function operatorSection(cwd, section) {
  const root = mainWorkTree(cwd, { timeout: 10000, killSignal: 'SIGKILL' }) || cwd;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, '.superdev', 'info.json'), 'utf8'));
    const value = parsed && parsed[section];
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

// The bound `<section>.<key>` of the operator configuration, as the caller's checkout sees it: the file lives in the main working tree
// whichever checkout `cwd` is. A value that is not a JSON whole number from 1 to 2147483647 (Node's longest timer delay, which a
// longer one would fire after 1 ms) reads as absent and is named once per process on stderr. A missing file, section, or key, or a
// file that is not valid JSON, gives `fallback` and says nothing.
function operatorBoundMs(cwd, section, key, fallback) {
  const value = operatorSection(cwd, section)[key];
  if (value === undefined) return fallback;
  if (Number.isInteger(value) && value >= 1 && value <= MAX_TIMER_MS) return value;
  const name = `${section}.${key}`;
  if (!noted.has(name)) {
    noted.add(name);
    process.stderr.write(`superdev: .superdev/info.json ${name} is not a whole number of milliseconds from 1 to ${MAX_TIMER_MS}; the default ${fallback} ms applies\n`);
  }
  return fallback;
}

module.exports = { operatorBoundMs, operatorSection };
