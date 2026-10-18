#!/usr/bin/env node
'use strict';

// A fake knowledge-base backend for the publish-kb suites, through tests/publish-kb-setup.js. Persists "pages" as a JSON map keyed
// by title in FAKE_KB_STATE_FILE, so `find` after a `create`/`update`/`delete` sees the effect of
// the previous call. Optionally dumps every SUPERDEV_KB_* env var it received into
// FAKE_KB_CAPTURE_DIR, one file per call, so a test can assert exactly what crossed the process
// boundary (title, keys `find` emitted) without trusting this script's own behaviour for that.

const fs = require('fs');
const path = require('path');

const verb = process.argv[2];
const title = process.env.SUPERDEV_KB_TITLE;
const stateFile = process.env.FAKE_KB_STATE_FILE;
const captureDir = process.env.FAKE_KB_CAPTURE_DIR;

if (captureDir) {
  fs.mkdirSync(captureDir, { recursive: true });
  const env = {};
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('SUPERDEV_KB_')) env[k] = process.env[k];
  }
  const bodyFile = process.env.SUPERDEV_KB_BODY_FILE;
  const body = bodyFile && fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf8') : null;
  fs.writeFileSync(
    path.join(captureDir, `${verb}-${process.hrtime.bigint()}.json`),
    JSON.stringify({ verb, env, body }),
  );
}

function readState() {
  if (!stateFile || !fs.existsSync(stateFile)) return {};
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function writeState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state));
}

const state = readState();

if (verb === 'find') {
  if (Object.hasOwn(state, title)) {
    process.stdout.write(JSON.stringify({ id: state[title].id }));
    process.exit(0);
  }
  process.exit(3);
} else if (verb === 'read') {
  if (!Object.hasOwn(state, title)) process.exit(1);
  process.stdout.write(state[title].body);
  process.exit(0);
} else if (verb === 'create') {
  const id = `id-${Object.keys(state).length}`;
  state[title] = { id, body: fs.readFileSync(process.env.SUPERDEV_KB_BODY_FILE, 'utf8') };
  writeState(state);
  process.exit(0);
} else if (verb === 'update') {
  const id = process.env.SUPERDEV_KB_ID;
  state[title] = { id, body: fs.readFileSync(process.env.SUPERDEV_KB_BODY_FILE, 'utf8') };
  writeState(state);
  process.exit(0);
} else if (verb === 'delete') {
  delete state[title];
  writeState(state);
  process.exit(0);
} else {
  process.exit(1);
}
