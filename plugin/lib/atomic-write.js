'use strict';

// atomic-write.js: writes a file whole, such as a run-root file or a staged knowledge-base page, through a temporary file in the same directory renamed over the target, and removes the temporary file when the write or the rename fails.

const fs = require('fs');

let counter = 0;

// Writes `content` to `target` whole. A reader never sees a partial file, and a failure leaves the previous content in place and no `<target>.tmp-*` file. The error is rethrown.
function writeFileAtomic(target, content) {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${counter++}`;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to clean */ }
    throw e;
  }
}

module.exports = { writeFileAtomic };
