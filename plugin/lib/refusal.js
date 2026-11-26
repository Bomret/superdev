'use strict';

// refusal.js: the refusal error, an Error that the CLIs (`scope.js`, `publish-kb.js`, `kb-patch.js`) print as one stderr line before they exit nonzero,
// and `readPresent`, the read that keeps an absent file apart from one that is present but unreadable.

const fs = require('fs');

// `fields`, where given, are copied onto the error: a no-verdict refusal (`git-spawn.js`'s `refuseKilled`) carries `noVerdict`.
function fail(msg, fields) {
  const err = new Error(msg);
  err.isRefusal = true;
  Object.assign(err, fields);
  throw err;
}

// The file's contents (a string for an encoding, else a Buffer), or null when it is absent (ENOENT). A file that exists but cannot be read
// (a directory, EACCES) refuses with one line naming the file and the error code.
function readPresent(file, encoding) {
  try {
    return fs.readFileSync(file, encoding);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    return fail(`${file} cannot be read (${e.code || e.message})`);
  }
}

module.exports = { fail, readPresent };
