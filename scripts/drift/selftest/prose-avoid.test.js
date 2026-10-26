'use strict';

// Selftest suite: the scanners that forbid a form in shipped prose (`scanners/prose-avoid.js`) — a toolchain
// command, a force merge, a deploy-run claim, a backend call. Run by ./index.js.

const {
  scanKbNoBackendCall,
  scanAgentToolAgnostic,
  scanUnmappedPathsForms,
  scanNoForceMerge,
  scanConflictConclusionNoCommit,
  scanTeaOnly,
  scanDeployRunnerExclusivity,
  scanDocSetupNoTestRun,
  scanImplementNoFullRun,
  scanObservationNoSuiteRun,
} = require('../scanners');

module.exports = ({ assert, path, fixture, found }) => {
  // --- agent-tool-agnostic: shipped agent prose names no concrete toolchain command ---

  assert.equal(
    scanAgentToolAgnostic(
      fixture({
        'agents/implementer.md':
          'Pipe noisy commands (`<test command> 2>&1 | tail -20`). Read `references/test-selection.md` ' +
          'and run the command it selects.\n',
      }),
    ).length,
    0,
    'the neutral placeholder yields no gap',
  );
  assert.equal(
    scanAgentToolAgnostic(fixture({ 'skills/setup/SKILL.md': 'e.g. `npm test`, `pytest -q`, `cargo test`\n' })).length,
    0,
    'skills/ examples stay out of scope',
  );
  const taGaps = scanAgentToolAgnostic(fixture({ 'agents/implementer.md': 'Pipe noisy commands (`bun run test 2>&1 | tail -20`).\n' }));
  assert.equal(taGaps.length, 1, 'flags a maintainer toolchain command in agent prose');
  assert.equal(taGaps[0].source, path.join('agents', 'implementer.md'), 'names the agent file');
  assert.match(taGaps[0].expectation, /bun run test/, 'the gap quotes the command it found');
  assert.equal(
    scanAgentToolAgnostic(fixture({ 'agents/new-agent.md': 'Re-run with `pytest -q`.\n' })).length,
    1,
    'a new agent file and a bare runner name are both caught',
  );

  // --- code-management-no-force (#683, INV-0092) ---

  const noForce = (files) => found(scanNoForceMerge(fixture(files)));
  const forceMergeGaps = noForce({ 'references/code-management-forgejo.md': 'POST .../merge with `{ "force_merge": true }`\n' });
  assert.equal(forceMergeGaps.length, 1, 'catches an actual `force_merge: true` invocation');
  assert.match(forceMergeGaps[0].expectation, /force_merge: true/, 'names the option');
  assert.equal(noForce({ 'references/code-management-forgejo.md': '{ "force_merge": true }\n' }).length, 1, 'catches `"force_merge": true` in JSON');
  assert.equal(noForce({ 'references/code-management-github.md': '`gh pr merge --squash --admin 42`\n' }).length, 1, 'catches an actual `--admin` invocation');
  assert.equal(
    noForce({ 'references/code-management-forgejo.md': 'Never send `force_merge` — this seed never sets it.\n' }).length,
    0,
    'a caution naming the forbidden option is not an invocation',
  );
  assert.equal(
    noForce({ 'references/code-management-github.md': 'Never pass `--admin` — this seed never sends it.\n' }).length,
    0,
    'the same caution shape passes for the GitHub option',
  );

  // --- conflict-conclusion-no-commit (ADR 0123) ---

  const conclusionLine = 'conclude a resolved conflict with `git -C <run-root>/scopetree merge --continue`';
  for (const [rel, body] of [
    ['references/implement-full.md', `${conclusionLine}, or \`git -C <run-root>/scopetree commit --no-edit\`.\n`],
    ['references/merge-conflicts.md', 'Stage the files, then run `git commit --no-edit`.\n'],
    ['skills/implement/SKILL.md', 'Once resolved, conclude it with\n`git -C <run-root>/scopetree commit`.\n'],
    ['agents/implementer.md', 'To conclude the merge, run `git commit` in the scopetree.\n'],
    ['references/implement-full.md', `${conclusionLine}. Or commit the merge with \`git -C <run-root>/scopetree commit\`.\n`],
    ['skills/implement/SKILL.md', 'Then commit the merge with `git commit`.\n'],
  ]) {
    const gaps = scanConflictConclusionNoCommit(fixture({ [rel]: body }));
    assert.equal(gaps.length, 1, `catches a commit conclusion in ${rel}`);
    assert.equal(gaps[0].source, path.join(...rel.split('/')), 'names the document');
    assert.match(gaps[0].expectation, /conclude a resolved conflict with `merge --continue`/, 'names the rule');
  }
  assert.equal(
    scanConflictConclusionNoCommit(
      fixture({
        'references/merge-conflicts.md': `${conclusionLine}.\n`,
        'references/scope-mode.md': "Plan's design-docs commit lands first; a `git commit` there is fine.\n",
      }),
    ).length,
    0,
    '`merge --continue`, and a `git commit` that concludes nothing, pass',
  );

  // --- forgejo-tea-only (ADR 0111, #794) ---

  const teaOnly = (files) => found(scanTeaOnly(fixture(files)));
  for (const [name, body] of [
    ['a token env var', 'Send it with `Authorization`-free calls, token from $GITEA_TOKEN.\n'],
    ['a FORGEJO token env var', 'export FORGEJO_TOKEN=abc\n'],
    ['an Authorization header', 'curl-free but: -H "Authorization: token x"\n'],
    ['a fenced curl at command position', '```bash\ncurl -s "$URL"\n```\n'],
    ['a piped curl', 'run `x | curl https://codeberg.org/api/v1/repos`\n'],
    ['curl with a flag mid-prose', 'call it with curl -X POST on the endpoint\n'],
  ]) {
    assert.equal(teaOnly({ 'docs/agents/issue-tracker.md': body }).length, 1, `catches ${name}`);
  }
  assert.equal(teaOnly({ 'references/code-management-forgejo.md': '  curl -X PUT "$U"\n' }).length, 1, 'catches a seed document too');
  assert.equal(
    teaOnly({
      'docs/agents/code-management.md':
        'Do not fall back to a token or a raw HTTP call (curl). Never fall back to a token, a raw HTTP call (curl), or another login.\n' +
        'No token env var, header, or raw HTTP call (curl) appears in this document.\n',
    }).length,
    0,
    'prohibition prose naming curl and a token is not an invocation',
  );

  // --- deploy-runner-exclusivity (ADR 0101, INV-0098) ---

  const deployRunnerGaps = scanDeployRunnerExclusivity(fixture({ 'skills/document/SKILL.md': 'This command runs each target\'s deploy command itself.\n' }));
  assert.equal(deployRunnerGaps.length, 1, 'flags a non-ship document claiming to run a target\'s command');
  assert.equal(deployRunnerGaps[0].source, 'skills/document/SKILL.md', 'names the offending document');
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/verify-ship/SKILL.md': "It runs no deploy target's command, and never runs a target's command.\n" })).length,
    0,
    'a denied run is not flagged',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/document/SKILL.md': "This command runs no deploy target's command.\n" })).length,
    0,
    'a denial in a document other than verify-ship is not flagged',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/verify-ship/SKILL.md': "It runs each target's deploy command itself.\n" })).length,
    1,
    'a non-denial in verify-ship is flagged',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/setup/SKILL.md': 'Only `/superdev:ship` runs each target\'s command, and only under `auto`.\n' })).length,
    0,
    'a mention attributed to ship is not a claim to run one itself',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/document/SKILL.md': '```\nThis command runs each target\'s deploy command itself.\n```\n' })).length,
    0,
    'a fenced example is not flagged',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/document/SKILL.md': 'This command runs the test suite itself.\n' })).length,
    0,
    'a sentence about an unrelated command is not flagged',
  );

  // --- kb-no-backend-call (ADR 0023): no document but publish-kb reaches a knowledge-base backend ---

  const kbCall = (files) => found(scanKbNoBackendCall(fixture(files)));
  const kbGaps2 = kbCall({
    'agents/doc-writer.md':
      'Write each page under the staging path, the one `scope.js staging <scope>` printed.\n' +
      'Then POST it to `/api/v1/repos/o/r/wiki/new` with `content_base64`.\n',
  });
  assert.ok(kbGaps2.length >= 1, 'a wiki call path is caught even beside a staging instruction');
  assert.equal(kbGaps2[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');
  assert.equal(
    kbCall({ 'skills/document/SKILL.md': 'Stage under `.superdev/kb-pending/<scope>/`. The credential env var is `$CONFLUENCE_API_TOKEN`.\n' }).length,
    0,
    'naming a credential env var alone is not a call',
  );
  assert.equal(
    kbCall({ 'skills/publish-kb/SKILL.md': 'POST `/wiki/new` with `content_base64`, or PUT `<base>/api/v2/pages`.\n' }).length,
    0,
    'publish-kb may reach the backend — that is its job',
  );
  assert.ok(
    kbCall({
      'agents/doc-writer.md':
        'Publishing to a **KB/wiki** host via its API is not integration and is allowed.\n' +
        "Software backend (e.g. Confluence): find the existing page and update it (don't duplicate); " +
        'create pages only for genuinely new outline entries.\n',
    }).length >= 1,
    'the pre-ADR-0023 doc-writer.md text reads as a regression',
  );
  assert.ok(
    kbCall({ 'skills/document/SKILL.md': 'Publish each page to the backend, following docs/agents/knowledge-base.md.\n' }).length >= 1,
    'a "publish each page" instruction is caught',
  );
  assert.ok(
    kbCall({ 'agents/doc-writer.md': 'curl -X POST -H "Authorization: token $GITEA_TOKEN" "$KB_BASE/pages"\n' }).length >= 1,
    'a generic POST-to-pages call is caught with no backend literal',
  );
  assert.equal(
    kbCall({ 'skills/document/SKILL.md': 'A staged page waits until a human runs `/superdev:publish-kb`, once the feature reaches its readers.\n' }).length,
    0,
    'pointing the reader at /superdev:publish-kb is not a call',
  );
  assert.ok(kbCall({ 'skills/document/SKILL.md': 'Upsert each page at the backend.\n' }).length >= 1, 'an "upsert" instruction is caught');
  for (const [text, label] of [
    ['Each page is published to the wiki as part of the pass.\n', 'the passive "is published to the wiki"'],
    ['When updating the wiki page, keep the outline order.\n', 'the gerund "updating the wiki page"'],
    ['Creating pages for genuinely new outline entries is allowed.\n', 'the gerund "creating pages"'],
    ['Pages are created on the wiki during the pass.\n', 'the passive "are created on the wiki"'],
  ]) {
    assert.ok(kbCall({ 'skills/document/SKILL.md': text }).length >= 1, `${label} is caught`);
  }

  // --- unmapped-paths-form (ADR 0074): a `{paths}` form belongs to a runner that maps a source file to
  // the tests covering it ---

  const unmapped = (files) => found(scanUnmappedPathsForms(fixture(files)));
  const upGaps1 = unmapped({ 'skills/setup/SKILL.md': 'Derive the focused command, for example `pytest -- {paths}`.\n' });
  assert.equal(upGaps1.length, 1, 'flags a `pytest -- {paths}` proposal');
  assert.equal(upGaps1[0].source, path.join('skills', 'setup', 'SKILL.md'), 'names the proposing document');
  assert.match(upGaps1[0].expectation, /maps a source file/, 'the gap names the mapping requirement');
  for (const [form, label] of [
    ['`pytest {paths}`', 'a bare `pytest {paths}`'],
    ['`go test ./... {paths}`', 'a `{paths}` form carrying a path argument'],
    ['`pytest --rootdir=. {paths}`', 'a `{paths}` form whose flag carries a `=value`'],
    ['`PYTEST {paths}`', 'a `{paths}` form naming the runner in a different case'],
  ]) {
    assert.equal(unmapped({ 'references/test-selection.md': `For example ${form}.\n` }).length, 1, `flags ${label}`);
  }
  assert.equal(
    unmapped({ 'skills/setup/SKILL.md': 'Derive `npx vitest related --passWithNoTests {paths}`.\n' }).length,
    0,
    "a mapping runner's `{paths}` form stays silent",
  );
  assert.equal(
    unmapped({ 'skills/setup/SKILL.md': 'pytest maps no source file to its tests, so it takes no `{paths}` form at all.\n' }).length,
    0,
    'prose naming a non-mapping runner and `{paths}` in one sentence stays silent',
  );

  // --- doc-setup-no-test-run (ADR 0189, INV-0175): neither skill, nor document's doc agents and doc-pass reference, instructs a test run ---

  const noRun = (files) => found(scanDocSetupNoTestRun(fixture(files)));
  const noRunDocs = [
    'skills/document/SKILL.md',
    'skills/setup/SKILL.md',
    'agents/doc-writer.md',
    'agents/doc-reader.md',
    'references/doc-pass.md',
  ];
  for (const rel of noRunDocs) {
    for (const [text, label] of [
      ['Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test focused <paths>`.\n', 'a `scope.js test` call'],
      ['Record it with `scope.js fail-to-pass base..HEAD -- node t.js`.\n', 'a `scope.js fail-to-pass` call'],
      ['Run the full command over the changed paths.\n', 'run the full command'],
      ['Then it runs the focused test command once.\n', 'runs the focused test command'],
      ['Run the whole-repo command before writing.\n', 'run the whole-repo command'],
      ['Start by running the affected form.\n', 'running the affected form'],
      ['Then run the test command.\n', 'run the test command'],
      ['It runs the configured test suite.\n', 'runs the configured test suite'],
    ]) {
      const gaps = noRun({ [rel]: text });
      assert.equal(gaps.length, 1, `${rel}: flags ${label}`);
      assert.equal(gaps[0].source, rel, `${rel}: names the skill`);
    }
    assert.equal(noRun({ [rel]: 'This command runs no test command (ADR 0189).\n' }).length, 0, `${rel}: a statement that no test runs passes`);
    assert.equal(noRun({ [rel]: 'It never runs the full command and does not run the affected form.\n' }).length, 0, `${rel}: a negated run passes`);
    assert.equal(noRun({ [rel]: 'If no focused command exists, run the full command.\n' }).length, 1, `${rel}: a distant no does not excuse a run`);
    assert.equal(noRun({ [rel]: 'Without asking, run the affected form.\n' }).length, 1, `${rel}: a distant without does not excuse a run`);
    assert.equal(noRun({ [rel]: 'Setup never calls `scope.js test`.\n' }).length, 0, `${rel}: a negated backticked scope.js call passes`);
    assert.equal(noRun({ [rel]: 'This skill does not run `scope.js fail-to-pass`.\n' }).length, 0, `${rel}: a negated backticked fail-to-pass call passes`);
    assert.equal(noRun({ [rel]: 'Setup never runs the full command.\n' }).length, 0, `${rel}: a negated run of the full command passes`);
    assert.equal(noRun({ [rel]: 'Setup never runs the test command.\n' }).length, 0, `${rel}: a negated run of the test command passes`);
    assert.equal(noRun({ [rel]: 'Do not forget to run the full command.\n' }).length, 1, `${rel}: a negated other verb does not excuse a run`);
    assert.equal(noRun({ [rel]: '```\nscope.js test full\n```\n' }).length, 0, `${rel}: a fenced example is masked`);
  }
  assert.equal(
    noRun({ 'skills/plan/SKILL.md': 'Run the full command.\n', 'agents/implementer.md': 'Run the full command.\n' }).length,
    0,
    'other documents are not read',
  );
  assert.equal(
    noRun({ 'agents/doc-writer.md': 'Then run the focused command over the changed paths.\n' }).length,
    1,
    'the doc-writer agent body is read',
  );
  assert.deepEqual(
    scanDocSetupNoTestRun(
      fixture(Object.fromEntries(noRunDocs.filter((rel) => rel !== 'skills/document/SKILL.md').map((rel) => [rel, 'Runs no test.\n']))),
    ),
    [{ source: path.join('skills', 'document', 'SKILL.md'), missing: true }],
    'a missing skill is a missing-document gap',
  );

  // --- implement-no-full-run (ADR 0192, INV-0128): implement's base step, run handoff, and both playbooks instruct no full or whole-repo run ---

  const noFull = (files) => found(scanImplementNoFullRun(fixture(files)));
  const baseStep = (body) => '# Scope mode\n\n## Bringing the scope branch to base\n\n' + body + '\n## The scope\'s range base\n\nDone.\n';
  const fullDocs = ['references/run-handoff.md', 'references/implement-full.md', 'references/implement-lite.md'];
  const hits = [
    ['Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full` in the scopetree.\n', 'a `scope.js test full` call'],
    ['Then run `scope.js test whole` once.\n', 'a `scope.js test whole` call'],
    ['Then run `scope.js test focused` once.\n', 'a pathless `scope.js test focused` call'],
    ['Gate the branch: run the full command from `docs/agents/verification.md`.\n', 'run the full command'],
    ['It runs the configured whole-repo command once.\n', 'runs the whole-repo command'],
    ['Then run the full suite in the scope checkout.\n', 'run the full suite'],
    ['Then execute the full suite in the scope checkout.\n', 'execute the full suite'],
    ['It invokes the whole-repo command once.\n', 'invokes the whole-repo command'],
    ['Then rerun the full suite in the scope checkout.\n', 'rerun the full suite'],
    ['It re-runs the whole-repo command once.\n', 're-runs the whole-repo command'],
    ['Gate on the full suite before review.\n', 'gate on the full suite'],
    ['The step gates on the whole-repo command.\n', 'gates on the whole-repo command'],
    ['Then the full suite run-handoff runs once.\n', 'a subject-first full suite run'],
    ['The whole-repo command runs here.\n', 'a subject-first whole-repo run'],
    ['With no delay, run the full suite.\n', 'a run after a comma-separated no'],
    ['With no delay run the full suite.\n', 'a run a word past a no'],
  ];
  for (const rel of fullDocs) {
    for (const [text, label] of hits) {
      const gaps = noFull({ [rel]: text });
      assert.equal(gaps.length, 1, `${rel}: flags ${label}`);
      assert.equal(gaps[0].source, rel, `${rel}: names the document`);
    }
    assert.equal(noFull({ [rel]: 'Run `scope.js test focused <changed paths>` with at least one path.\n' }).length, 0, `${rel}: a focused run with a path passes`);
    assert.equal(noFull({ [rel]: 'Run no test suite here (ADR 0192).\n' }).length, 0, `${rel}: a statement that no suite runs passes`);
    assert.equal(noFull({ [rel]: 'It never runs the full command.\n' }).length, 0, `${rel}: a negated run passes`);
    assert.equal(noFull({ [rel]: 'The step runs no full suite.\n' }).length, 0, `${rel}: a run of no full suite passes`);
    assert.equal(noFull({ [rel]: 'Here no full suite runs.\n' }).length, 0, `${rel}: a negated subject-first run passes`);
    assert.equal(noFull({ [rel]: 'The loop never calls `scope.js test full`.\n' }).length, 0, `${rel}: a negated scope.js call passes`);
    assert.equal(
      noFull({ [rel]: 'Tell it to run only its own tests, and never `test full`, `test whole`, or a `test focused` with no path.\n' }).length,
      0,
      `${rel}: a list-form negation passes`,
    );
    assert.equal(
      noFull({ [rel]: 'It runs never `scope.js test full`, nor `scope.js test whole`, nor a `scope.js test focused` with no path.\n' }).length,
      0,
      `${rel}: a nor-list negation passes`,
    );
    assert.equal(noFull({ [rel]: 'If no record is green, run the full command.\n' }).length, 1, `${rel}: a distant no does not excuse a run`);
    assert.equal(noFull({ [rel]: 'Never mind the record: run `test full` now.\n' }).length, 1, `${rel}: a negation before a colon break does not excuse a run`);
    assert.equal(noFull({ [rel]: '```\nscope.js test full\n```\n' }).length, 0, `${rel}: a fenced example is masked`);
  }
  for (const [text, label] of hits) {
    assert.equal(noFull({ 'references/scope-mode.md': baseStep(text) }).length, 1, `scope-mode base step: flags ${label}`);
  }
  assert.equal(
    noFull({ 'references/scope-mode.md': baseStep('The step runs no test suite.\n') + '## Review\n\nThe review runs `scope.js test full` at its exit.\n' }).length,
    0,
    'scope-mode text outside the base-step section stays unscanned',
  );
  assert.equal(
    noFull({ 'references/review-scope-mode.md': 'Run `scope.js test full`.\n', 'skills/ship/SKILL.md': 'Run the full command.\n' }).length,
    0,
    'other documents are not read',
  );
  assert.deepEqual(
    scanImplementNoFullRun(fixture({ 'references/scope-mode.md': '# Scope mode\n\n## Other\n\nText.\n' })).filter((g) => g.source === path.join('references', 'scope-mode.md')),
    [{ source: path.join('references', 'scope-mode.md'), expectation: 'carry a `## Bringing the scope branch to base` section for implement-no-full-run to scan' }],
    'a scope-mode.md without the base-step section is a gap',
  );
  assert.deepEqual(
    scanImplementNoFullRun(fixture({ 'references/scope-mode.md': baseStep('No run.\n'), 'references/implement-full.md': 'x\n', 'references/implement-lite.md': 'x\n' })),
    [{ source: path.join('references', 'run-handoff.md'), missing: true }],
    'a missing document is a missing-document gap',
  );

  // --- observation-no-suite-run (INV-0157): the scope review's observation concept names no suite run as a source ---

  const reviewScope = path.join('references', 'review-scope-mode.md');
  const observations = (body) =>
    '# Review in scope mode\n\n### 4.2 The suite gate\n\nA failing run is a Critical finding.\n\n' +
    '### 4.3 Observations\n\n' + body + '\n### 4.4 The fix boundary\n\nA failing test is a finding.\n';
  const noSuiteRun = (body) => scanObservationNoSuiteRun(fixture({ 'references/review-scope-mode.md': observations(body) }));
  for (const [text, label] of [
    ['Applies to a defect a suite run of §4.2 surfaces. It never joins the fix list.\n', 'a suite run'],
    ['Applies to a defect the exit run surfaces.\n', 'the exit run'],
    ['Applies to a defect the entry run or a focused run surfaces.\n', 'the entry run'],
    ['Applies to a defect §4.2 surfaces.\n', 'a §4.2 citation'],
    ['Applies to a failing test the scope did not cause.\n', 'a failing test'],
  ]) {
    const gaps = noSuiteRun(text);
    assert.ok(gaps.length >= 1, `observation-no-suite-run: flags ${label}`);
    assert.equal(gaps[0].source, reviewScope, `observation-no-suite-run: names the document for ${label}`);
  }
  assert.deepEqual(
    noSuiteRun("Applies to a defect `final-reviewer`'s report surfaces, or a fix cycle meets. It never joins the fix list.\n"),
    [],
    'observation-no-suite-run: a concept naming only the report and a fix cycle passes, and the sections around it stay unscanned',
  );
  assert.deepEqual(
    scanObservationNoSuiteRun(fixture({ 'references/review-scope-mode.md': '# Review in scope mode\n\n### 4.2 The suite gate\n\nText.\n' })),
    [{ source: reviewScope, expectation: 'carry a `### 4.3 Observations` section for observation-no-suite-run to scan' }],
    'observation-no-suite-run: a missing section is a gap',
  );
  assert.deepEqual(
    scanObservationNoSuiteRun(fixture({ '.keep': '' })),
    [{ source: reviewScope, missing: true }],
    'observation-no-suite-run: a missing document is a missing-document gap',
  );
};
