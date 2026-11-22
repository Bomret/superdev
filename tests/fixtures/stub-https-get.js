'use strict';

// A `node --require` preload for a spawned update-check hook: it replaces `https.get`, so the hook reaches no network.
// STUB_HTTPS_MARKER names a file that gains one line per call, the requested URL, which proves the stub ran.
// STUB_HTTPS_MODE picks the answer: `newer` (version 9.0.0), `500`, `html`, `hang` (no answer: the request's
// `timeout` event fires on the next tick, so no real timeout is waited out), or `error` (the request emits an `error`, a network
// failure, on the next tick, once the caller has attached its listeners). A `hang` call whose `opts.timeout` is missing
// or not a finite positive number throws before it records the call, so a hook that stopped bounding its request fails.
// STUB_HTTPS_BODY, when set, is the exact response body (mode `newer` only).
// It starts no shell and no process.

const fs = require('node:fs');
const https = require('node:https');
const { EventEmitter } = require('node:events');

https.get = (url, opts, cb) => {
  const mode = process.env.STUB_HTTPS_MODE || 'newer';
  if (mode === 'hang') {
    const t = opts && opts.timeout;
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) throw new Error(`stub-https-get: a hang request carries no bound (timeout ${t})`);
  }
  fs.appendFileSync(process.env.STUB_HTTPS_MARKER, `${url}\n`);
  const req = new EventEmitter();
  req.destroy = () => {};
  if (mode === 'hang') {
    setImmediate(() => req.emit('timeout'));
    return req;
  }
  if (mode === 'error') {
    setImmediate(() => req.emit('error', Object.assign(new Error('getaddrinfo ENOTFOUND raw.githubusercontent.com'), { code: 'ENOTFOUND' })));
    return req;
  }
  const res = new EventEmitter();
  res.statusCode = mode === '500' ? 500 : 200;
  res.resume = () => {};
  setImmediate(() => {
    cb(res);
    res.emit('data', mode === 'html' ? '<html>nope</html>' : process.env.STUB_HTTPS_BODY || JSON.stringify({ version: '9.0.0' }));
    res.emit('end');
  });
  return req;
};
