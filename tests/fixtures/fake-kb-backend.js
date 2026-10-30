#!/usr/bin/env node
'use strict';

// A fake knowledge-base backend for the publish-kb suites, through tests/publish-kb-setup.js. Run as `node <this> <verb> "$1"`:
// `$1` is the values file publish-kb.js hands every command. Persists "pages" as a JSON map keyed
// by title in FAKE_KB_STATE_FILE, so `find` after a `create`/`update`/`delete` sees the effect of
// the previous call. Optionally dumps the values file it received (and the body it names, and the file's mode)
// into FAKE_KB_CAPTURE_DIR, one file per call, so a test can assert exactly what crossed the process
// boundary without trusting this script's own behaviour for that.

const fs = require('fs');
const path = require('path');

const verb = process.argv[2];
const valuesFile = process.argv[3];
const values = JSON.parse(fs.readFileSync(valuesFile, 'utf8'));
const title = values.title;
const stateFile = process.env.FAKE_KB_STATE_FILE;
const captureDir = process.env.FAKE_KB_CAPTURE_DIR;

if (captureDir) {
  fs.mkdirSync(captureDir, { recursive: true });
  const body = values.bodyFile && fs.existsSync(values.bodyFile) ? fs.readFileSync(values.bodyFile, 'utf8') : null;
  fs.writeFileSync(
    path.join(captureDir, `${verb}-${process.hrtime.bigint()}.json`),
    JSON.stringify({ verb, values, valuesFile, mode: fs.statSync(valuesFile).mode & 0o777, body }),
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
    const { id, sub_url, type } = state[title];
    const out = sub_url === undefined ? { id } : { id, sub_url };
    if (type !== undefined) out.type = type;
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
  process.exit(3);
} else if (verb === 'read') {
  if (!Object.hasOwn(state, title)) process.exit(1);
  process.stdout.write(state[title].body);
  process.exit(0);
} else if (verb === 'create') {
  const id = `id-${Object.keys(state).length}`;
  state[title] = { id, body: fs.readFileSync(values.bodyFile, 'utf8') };
  // a test names the sub_url `find` then emits for a page this call creates
  if (process.env.FAKE_KB_NEW_SUB_URL) state[title].sub_url = process.env.FAKE_KB_NEW_SUB_URL;
  writeState(state);
  process.exit(0);
} else if (verb === 'update') {
  const id = values.found.id;
  state[title] = { ...state[title], id, body: fs.readFileSync(values.bodyFile, 'utf8') };
  writeState(state);
  process.exit(0);
} else if (verb === 'delete') {
  delete state[title];
  writeState(state);
  process.exit(0);
} else {
  process.exit(1);
}
