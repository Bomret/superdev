'use strict';

// drift-check bespoke scanners: every check whose assertion is more than "this document still
// matches this pattern". The table-driven ones run through `lib.js`’s scanContract() instead.
// Each scanner is pure over a root dir and returns an array of gaps; `checks.js` orders them and
// owns how each gap is printed. A scanner that reads a named document reports it with `missingDoc()`
// when it is absent. A scanner that walks a directory reads whatever the directory holds, and an absent
// directory holds nothing. This barrel re-exports every scanner; the topic files beside it hold them,
// and `walkers.js` holds the walks they share.

module.exports = {
  ...require('./references'),
  ...require('./adr'),
  ...require('./prose-avoid'),
  ...require('./shell-spawn'),
  ...require('./marketplace-readme'),
  ...require('./base-branch-ship'),
  ...require('./register-join'),
};
