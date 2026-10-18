'use strict';

// Shared setup for the publish-kb suites (tests/publish-kb*.test.js). Not a suite: it builds fixture
// repositories, stages pages, calls `run()` and captures its output, and measures the healthy spawn
// a hang bound derives from. Requiring it spawns nothing; a suite that asserts a hang calls
// `hangBound()` itself, so every suite times its own spawn in its own run (AGENTS.md, ADR 0086).
//
// The backend is a real fake command (tests/fixtures/fake-kb-backend.js), never a mocked exec
// function: the contract under test is what publish-kb.js does to a real `sh -c` child
// process, so the module under test needs no seam of its own to make that observable.

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');

const publishKbPath = require.resolve('../plugin/scripts/publish-kb.js');
const { run } = require(publishKbPath);

const FAKE_BACKEND = require.resolve('./fixtures/fake-kb-backend.js');

// The bound every hanging-verb block runs under, taken from this run rather than fixed (AGENTS.md,
// ADR 0086). `hangingVerbDoc` hangs one verb and leaves every other verb a real `node` spawn of the fake
// backend, which the same bound would kill if it ran slower than the bound — and a loaded machine starts
// `node` slowly. So `hangBound()` times that spawn, in the shape `publish-kb.js` runs it (`sh -c`), three
// times, and bounds every backend command at ten times the slowest, never
// below 1000ms. A healthy verb then clears the bound however busy the machine is, and only the hung verb
// reaches it. A sample that fails to start, hits its own 60s bound, or answers other than not-found timed
// nothing healthy, so it stops the suite with its reason (INV-0009).
const HEALTHY_SAMPLES = 3;
function slowestHealthySpawn() {
  let slowest = 0;
  for (let i = 0; i < HEALTHY_SAMPLES; i++) {
    const started = Date.now();
    const sample = spawnSync('sh', ['-c', `node ${JSON.stringify(FAKE_BACKEND)} find`], { encoding: 'utf8', timeout: 60000 });
    assertSpawnDecided(sample, `healthy-spawn sample ${i + 1}`);
    // With no state file, `find` answers 3 (not found): any other status means the sample timed something else.
    if (sample.status !== 3) throw new Error(`healthy-spawn sample ${i + 1} exited ${sample.status}, not 3: ${sample.stderr}`);
    slowest = Math.max(slowest, Date.now() - started);
  }
  return slowest;
}

// The elapsed ceiling of a hanging-verb block. Everything else the block does — git, the containment check,
// the healthy verbs — slows with the machine too, so a ceiling counted in bounds still trips under load. The
// ceiling therefore answers only the qualitative question, whether the bound ended the hang at all (AGENTS.md,
// ADR 0086): it sits well below the time the hung verb sleeps, so a bound that failed still fails the block.
// The reported "<verb> timed out after <bound>ms" line is what proves the bound fired, and the batch's
// one-bound-not-one-per-page property is asserted by the untried count and the absent backend state.
const HUNG_CEILING_MS = 600000;
// The hung verb. `exec` makes the bound's SIGKILL land on the sleep itself rather than on its shell, so no sleeper
// outlives its case holding the output pipe open. A run whose measured bound leaves a batch of a few bounds no
// room under the ceiling proves nothing, so it stops here instead.
const HUNG_CMD = 'exec sleep 900';

function hangBound() {
  const hangMs = Math.max(1000, 10 * slowestHealthySpawn());
  if (hangMs * 8 >= HUNG_CEILING_MS) {
    throw new Error(
      `measured bound ${hangMs}ms leaves no room for a batch under the ${HUNG_CEILING_MS}ms ceiling: ` +
        'the machine is too loaded for the timeout cases to prove anything',
    );
  }
  return hangMs;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-repo-')));
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'test'], dir);
  fs.writeFileSync(path.join(dir, 'base.txt'), 'x\n');
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'base'], dir);
  fs.mkdirSync(path.join(dir, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'agents', 'code-management.md'),
    '# Code host\n\n- **Base branch:** `main`.\n',
  );
  return dir;
}

// Every staged scope other than `_adhoc` gets a `feat/<scope>` branch at the current tip, so it
// reads `contained` against `main` (same commit, same tree) unless a test deliberately diverges it.
// This is what keeps every pre-existing test — none of which is about the merge check — green once
// publish-kb.js starts refusing an unmerged or unresolvable scope branch by default.
function ensureContainedBranch(repo, scope) {
  if (scope === '_adhoc') return;
  const branch = `feat/${scope}`;
  if (spawnSync('git', ['rev-parse', '--verify', '--quiet', branch], { cwd: repo }).status === 0) return;
  git(['branch', branch], repo);
}

function commandsDoc(backendLine, verbs = ['find', 'create', 'update', 'delete']) {
  const sections = verbs
    .map((v) => `### ${v}\n\n\`\`\`sh\n${v === 'create' ? ': "$SUPERDEV_KB_PARENT_ID"\n' : ''}node ${JSON.stringify(FAKE_BACKEND)} ${v}\n\`\`\``)
    .join('\n\n');
  return `# Knowledge base\n\n## Configuration\n\n${backendLine}\n\n## Commands\n\n${sections}\n`;
}

function writeKbDoc(repo, text) {
  fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'knowledge-base.md'), text);
}

function stagePage(repo, scope, filename, frontmatter, body = 'body text.\n') {
  ensureContainedBranch(repo, scope);
  const dir = path.join(repo, '.superdev', 'kb-pending', scope);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), `---\n${frontmatter}\n---\n${body}`);
}

function call(argv, cwd) {
  const logged = [];
  const orig = console.log;
  console.log = (s) => logged.push(String(s));
  try {
    run(argv, cwd);
    return { ok: true, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
    throw e;
  } finally {
    console.log = orig;
  }
}

// Isolate the fake backend's persistent state (and, where used, its env-capture directory) per
// scenario, restoring the ambient env afterwards.
function withState(fn) {
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-state-')), 'state.json');
  const prevState = process.env.FAKE_KB_STATE_FILE;
  const prevCapture = process.env.FAKE_KB_CAPTURE_DIR;
  const prevTimeout = process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS;
  process.env.FAKE_KB_STATE_FILE = stateFile;
  delete process.env.FAKE_KB_CAPTURE_DIR;
  // A case that expects every command to succeed runs under a bound no healthy command reaches, however
  // loaded the machine; a timeout case sets its own bound inside `fn`.
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HUNG_CEILING_MS);
  try {
    fn(stateFile);
  } finally {
    if (prevState === undefined) delete process.env.FAKE_KB_STATE_FILE;
    else process.env.FAKE_KB_STATE_FILE = prevState;
    if (prevCapture === undefined) delete process.env.FAKE_KB_CAPTURE_DIR;
    else process.env.FAKE_KB_CAPTURE_DIR = prevCapture;
    if (prevTimeout === undefined) delete process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS;
    else process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = prevTimeout;
  }
}

// A `## Commands` doc where exactly one verb hangs past the bound and every other verb is the real
// fake backend. `sleep` is the cheapest fixture that reproduces a host which accepts the call and
// never answers — no socket, no listener, and nothing for the harness to tear down.
function hangingVerbDoc(backendLine, hangingVerb, verbs = ['find', 'read', 'create', 'update', 'delete']) {
  const sections = verbs
    .map((v) => {
      const cmd = v === hangingVerb ? HUNG_CMD : `node ${JSON.stringify(FAKE_BACKEND)} ${v}`;
      return `### ${v}\n\n\`\`\`sh\n${cmd}\n\`\`\``;
    })
    .join('\n\n');
  return `# Knowledge base\n\n## Configuration\n\n${backendLine}\n\n## Commands\n\n${sections}\n`;
}

// The same doc with `failingVerb` exiting non-zero at once instead of hanging: for a behavior that
// needs the call to fail after publish-kb wrote its retry marker, not the time bound.
function failingVerbDoc(backendLine, failingVerb, verbs) {
  return hangingVerbDoc(backendLine, failingVerb, verbs).replace(HUNG_CMD, 'exit 1');
}

module.exports = {
  publishKbPath,
  FAKE_BACKEND,
  HUNG_CEILING_MS,
  hangBound,
  git,
  makeRepo,
  ensureContainedBranch,
  commandsDoc,
  writeKbDoc,
  stagePage,
  call,
  withState,
  hangingVerbDoc,
  failingVerbDoc,
};
