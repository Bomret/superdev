'use strict';

// refusal.js: the refusal error, an Error that the CLIs (`scope.js`, `publish-kb.js`, `kb-patch.js`) print as one stderr line before they exit nonzero.

function fail(msg) {
  const err = new Error(msg);
  err.isRefusal = true;
  throw err;
}

module.exports = { fail };
