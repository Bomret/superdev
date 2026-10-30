'use strict';

// A `node --require` preload for a spawned update-check hook: it replaces `https.get`, so the hook reaches no network.
// STUB_HTTPS_MARKER names a file that gains one line per call, the requested URL, which proves the stub ran.
// STUB_HTTPS_MODE picks the answer: `newer` (version 9.0.0), `500`, `html`, or `hang` (no answer until the request's timeout).
// It starts no shell and no process.

const fs = require('node:fs');
const https = require('node:https');
const { EventEmitter } = require('node:events');

https.get = (url, opts, cb) => {
  fs.appendFileSync(process.env.STUB_HTTPS_MARKER, `${url}\n`);
  const req = new EventEmitter();
  req.destroy = () => {};
  const mode = process.env.STUB_HTTPS_MODE || 'newer';
  if (mode === 'hang') {
    setTimeout(() => req.emit('timeout'), opts.timeout);
    return req;
  }
  const res = new EventEmitter();
  res.statusCode = mode === '500' ? 500 : 200;
  res.resume = () => {};
  setImmediate(() => {
    cb(res);
    res.emit('data', mode === 'html' ? '<html>nope</html>' : JSON.stringify({ version: '9.0.0' }));
    res.emit('end');
  });
  return req;
};
