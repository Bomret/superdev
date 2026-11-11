'use strict';

// drive-path.js: a Git Bash drive path (`/c/Users/x`) as the Windows path (`C:/Users/x`) on win32 (ADR 0150).
// MSYS converts such a path for the programs it starts, but scope.js reads the raw argument. Only `/<letter>`
// followed by `/` or the end translates; every other path (`/tmp/x`, `/dev/null`, `/cc/x`) and every other
// platform keeps it.

function drivePath(p) {
  const m = process.platform === 'win32' && /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${m[2] || '/'}` : p;
}

module.exports = { drivePath };
