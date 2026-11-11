'use strict';

// Suite for plugin/lib/drive-path.js: a Git Bash drive path becomes a Windows one on win32 only (ADR 0150).

const assert = require('node:assert');
const path = require('node:path');
const { drivePath } = require(path.join(__dirname, '..', 'plugin', 'lib', 'drive-path.js'));

const platformDesc = Object.getOwnPropertyDescriptor(process, 'platform');
const translate = (platform, from) => {
  Object.defineProperty(process, 'platform', { ...platformDesc, value: platform });
  try {
    assert.equal(process.platform, platform, 'the platform override took effect');
    return drivePath(from);
  } finally { Object.defineProperty(process, 'platform', platformDesc); }
};

for (const [from, to] of [['/c/Users/x', 'C:/Users/x'], ['/C/x', 'C:/x'], ['/c', 'C:/'], ['/tmp/x', '/tmp/x'], ['/dev/null', '/dev/null'], ['/cc/x', '/cc/x'], ['c/x', 'c/x'], ['C:/x', 'C:/x']]) {
  assert.equal(translate('win32', from), to, `win32: ${from}`);
  for (const platform of ['darwin', 'linux']) assert.equal(translate(platform, from), from, `${platform}: ${from}`);
}

console.log('drive-path: all checks passed');
