'use strict';

// The knowledge-base and plan/ledger contract tables: staging and publishing a page, and the run-init
// and /plan §0 rules a second run over a partly merged feature depends on. One section per table.
//
// Run by ./index.js, which owns the shared fixture() helper, realRoot, and the temp-dir cleanup.

const { docPath, scanContract } = require('../lib');
const { scanKbNoBackendCall } = require('../scanners');
const {
  KB_STAGING_CONTRACTS,
  KB_READ_NEVER_WRITE_CONTRACTS,
  AUDIT_SET_CONTRACTS,
  AGGREGATE_PAGE_CONTRACTS,
  READ_PATH_CONTRACTS,
  STATUS_SEED_CONTRACTS,
  PLAN_APPEND_CONTRACTS,
  SHIPPED_APPEND_CONTRACTS,
  ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
  ROTATE_ON_SHIPPED_CONTRACTS,
  PARKED_QUESTIONS_CONTRACTS,
  RUN_KIND_CONTRACTS,
  CONTAINMENT_DELEGATION_CONTRACTS,
  CONTAINMENT_REFETCH_CONTRACTS,
} = require('../contracts');

module.exports = ({ assert, fs, path, fixture, realRoot }) => {
  // --- KB staging (ADR 0023): /superdev:plan and /superdev:document stage knowledge-base pages, and
  // /superdev:publish-kb is the only path to a remote backend. Two halves, checked separately, because
  // each passes on its own while the invariant is gone. ---

  // positive: a plan.md that seeds the page straight into the wiki again
  const kb1 = fixture({
    'skills/plan/SKILL.md': 'Seed the feature specification into the KB outline.\n',
  });
  const kbGaps1 = scanContract(kb1, KB_STAGING_CONTRACTS);
  assert.equal(kbGaps1.length, 1, 'flags a document that stopped naming the staging location');
  assert.equal(kbGaps1[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names plan.md');

  // positive: document.md hands the writer a page with no staging path at all
  const kbStagingDoc = fixture({
    'skills/document/SKILL.md': 'Hand the writer each page it should publish.\n',
  });
  const kbStagingDocGaps = scanContract(kbStagingDoc, KB_STAGING_CONTRACTS);
  assert.equal(kbStagingDocGaps.length, 1, 'flags document.md for dropping the staging path it hands the writer');
  assert.equal(kbStagingDocGaps[0].source, path.join('skills', 'document', 'SKILL.md'), 'names document.md');

  // positive: doc-pass.md instructs writing a remote backend's pages directly, skipping the staging step
  const kbStagingPass = fixture({
    'references/doc-pass.md': "Write each remote backend's page directly to the wiki.\n",
  });
  const kbStagingPassGaps = scanContract(kbStagingPass, KB_STAGING_CONTRACTS);
  assert.equal(kbStagingPassGaps.length, 1, 'flags doc-pass.md for dropping the staging path');
  assert.equal(kbStagingPassGaps[0].source, path.join('references', 'doc-pass.md'), 'names doc-pass.md');

  // positive: the negative half fires on a restored call path even while the staging line is still there
  const kb2 = fixture({
    'agents/doc-writer.md':
      'Write each page under `.superdev/kb-pending/<scope>/`.\n' +
      'Then POST it to `/api/v1/repos/o/r/wiki/new` with `content_base64`.\n',
  });
  assert.equal(scanContract(kb2, KB_STAGING_CONTRACTS).length, 0, 'the staging half still passes');
  const kbGaps2 = scanKbNoBackendCall(kb2);
  assert.ok(kbGaps2.length >= 1, 'a restored wiki call path is caught even beside a staging instruction');
  assert.equal(kbGaps2[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');

  // negative: naming a credential's env var alone, with no verb aimed at an object, is not a call — the
  // hygiene rule that permits illustrative env-var names in docs would otherwise conflict with this check
  const kb3 = fixture({
    'skills/document/SKILL.md':
      'Stage under `.superdev/kb-pending/<scope>/`. The credential env var is `$CONFLUENCE_API_TOKEN`.\n',
  });
  assert.equal(scanKbNoBackendCall(kb3).length, 0, 'naming a credential env var alone is not a call');

  // negative: publish-kb itself carries the endpoints and is deliberately not scanned
  const kb4 = fixture({
    'skills/publish-kb/SKILL.md': 'POST `/wiki/new` with `content_base64`, or PUT `<base>/api/v2/pages`.\n',
  });
  assert.equal(scanKbNoBackendCall(kb4).length, 0, 'publish-kb may reach the backend — that is its job');

  // positive: the pre-ADR-0023 doc-writer.md text — the literal state this feature replaced — reads as
  // a real regression: "publish"/"create" verbs each aimed at a page/wiki object, with no backend-specific
  // literal anywhere. A marker built from literals alone would pass this clean.
  const kb5 = fixture({
    'agents/doc-writer.md':
      'Publishing to a **KB/wiki** host via its API is not integration and is allowed.\n' +
      "Software backend (e.g. Confluence): find the existing page and update it (don't duplicate); " +
      'create pages only for genuinely new outline entries.\n',
  });
  assert.ok(scanKbNoBackendCall(kb5).length >= 1, 'the pre-ADR-0023 doc-writer.md text reads as a regression');

  // positive: a plain "publish the page" instruction, no endpoint or credential in sight
  const kb6 = fixture({
    'skills/document/SKILL.md': 'Publish each page to the backend, following docs/agents/knowledge-base.md.\n',
  });
  assert.ok(scanKbNoBackendCall(kb6).length >= 1, 'a "publish each page" instruction is caught');

  // positive: a generic POST to a pages endpoint, with no backend-specific literal at all
  const kb7 = fixture({
    'agents/doc-writer.md': 'curl -X POST -H "Authorization: token $GITEA_TOKEN" "$KB_BASE/pages"\n',
  });
  assert.ok(scanKbNoBackendCall(kb7).length >= 1, 'a generic POST-to-pages call is caught with no backend literal');

  // negative: pointing the reader at /superdev:publish-kb, or explaining what it does, merely mentions
  // publishing — it is not itself a call
  const kb8 = fixture({
    'skills/document/SKILL.md':
      'A staged page waits until a human runs `/superdev:publish-kb`, once the feature reaches its readers.\n',
  });
  assert.equal(scanKbNoBackendCall(kb8).length, 0, 'pointing the reader at /superdev:publish-kb is not a call');

  // positive: "upsert" is this feature's own vocabulary for a create-or-update backend call — the verb
  // alternation must catch it, not just "create"/"update"
  const kb9 = fixture({
    'skills/document/SKILL.md': 'Upsert each page at the backend.\n',
  });
  assert.ok(scanKbNoBackendCall(kb9).length >= 1, 'an "upsert" instruction aimed at a knowledge-base object is caught');

  // positive: passive and gerund spellings — a regression phrased as "is published to", "when
  // updating", or "creating pages" must not walk past a guard built for imperative verbs only
  for (const [text, label] of [
    ['Each page is published to the wiki as part of the pass.\n', 'the passive "is published to the wiki"'],
    ['When updating the wiki page, keep the outline order.\n', 'the gerund "updating the wiki page"'],
    ['Creating pages for genuinely new outline entries is allowed.\n', 'the gerund "creating pages"'],
    ['Pages are created on the wiki during the pass.\n', 'the passive "are created on the wiki"'],
  ]) {
    const kbMorph = fixture({ 'skills/document/SKILL.md': text });
    assert.ok(scanKbNoBackendCall(kbMorph).length >= 1, `${label} is caught`);
  }

  // absent files are skipped, matching every other scanner here
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), KB_STAGING_CONTRACTS).length,
    0,
    'absent files are skipped (staging half)',
  );
  assert.equal(
    scanKbNoBackendCall(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'absent files are skipped (no-call half)',
  );

  // --- KB_READ_NEVER_WRITE_CONTRACTS: the doc pass may read a remote knowledge-base backend and never
  // writes to it (ADR 0094, INV-0091). Three independent rows — the reference that owns the pass, the
  // agent that performs it, and the dispatch prose that reaches that agent all state the same rule. ---

  const krnwBody = {
    'references/doc-pass.md':
      '## Read the knowledge base, never write to it\n\nYou may **read** one before an `upsert` ' +
      'replaces an existing page.\n',
    'agents/doc-writer.md':
      '- **Read the knowledge base, never write to it.** Reading needs a credential; writing is not ' +
      'yours.\n',
    'skills/document/SKILL.md':
      '**The knowledge-base pass reads a remote backend, and never writes to it** (ADR 0094, ' +
      'INV-0091).\n',
  };

  // negative: all three carried
  assert.equal(
    scanContract(fixture(krnwBody), KB_READ_NEVER_WRITE_CONTRACTS).length,
    0,
    'all three documents carrying the rule yields zero gaps',
  );

  // positive: doc-pass.md reverts to the old write-nothing-at-all framing
  const krnwNoPass = fixture({
    ...krnwBody,
    'references/doc-pass.md': 'Never reach a knowledge-base backend at all — reading included.\n',
  });
  const krnwGapsPass = scanContract(krnwNoPass, KB_READ_NEVER_WRITE_CONTRACTS);
  assert.equal(krnwGapsPass.length, 1, 'flags doc-pass.md alone for dropping the read-permitted rule');
  assert.equal(
    krnwGapsPass[0].source,
    path.join('references', 'doc-pass.md'),
    'names doc-pass.md',
  );

  // positive: doc-writer.md loses its own hygiene-section restatement of the rule
  const krnwNoWriter = fixture({
    ...krnwBody,
    'agents/doc-writer.md': '- **Never reach a knowledge-base backend.** Make no call at all.\n',
  });
  const krnwGapsWriter = scanContract(krnwNoWriter, KB_READ_NEVER_WRITE_CONTRACTS);
  assert.equal(krnwGapsWriter.length, 1, 'flags doc-writer.md alone for dropping the rule');
  assert.equal(
    krnwGapsWriter[0].source,
    path.join('agents', 'doc-writer.md'),
    'names doc-writer.md',
  );

  // positive: the dispatch prose (skills/document/SKILL.md) reverts to "reaches no backend", leaving
  // the reference and the agent body agreeing with each other but not with their own dispatch
  const krnwNoDispatch = fixture({
    ...krnwBody,
    'skills/document/SKILL.md': '**The knowledge-base pass reaches no backend.**\n',
  });
  const krnwGapsDispatch = scanContract(krnwNoDispatch, KB_READ_NEVER_WRITE_CONTRACTS);
  assert.equal(krnwGapsDispatch.length, 1, 'flags skills/document/SKILL.md alone for dropping the rule');
  assert.equal(
    krnwGapsDispatch[0].source,
    path.join('skills', 'document', 'SKILL.md'),
    'names skills/document/SKILL.md',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), KB_READ_NEVER_WRITE_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- AUDIT_SET_CONTRACTS: `/superdev:setup` writes the `## Audit set` section, `/superdev:document`
  // reads it back with a stated fallback, and `references/documentation.md` seeds it — three documents
  // agreeing in prose only. ---

  // positive: setup.md drops the write instruction — decision C's answer would go nowhere
  const auditGaps1 = scanContract(
    fixture({ 'skills/setup/SKILL.md': 'Ask which docs sit outside the default tree the audit reads.\n' }),
    AUDIT_SET_CONTRACTS,
  );
  assert.equal(auditGaps1.length, 1, 'flags a setup.md that stops recording the `## Audit set` section');
  assert.equal(auditGaps1[0].source, path.join('skills', 'setup', 'SKILL.md'), 'names setup.md');

  // positive: document.md keeps the heading but drops its own fallback clause — the shape that reads
  // fine on its own and only breaks in a repo whose documentation.md carries no such section
  const auditGaps2 = scanContract(
    fixture({
      'skills/document/SKILL.md':
        'Build the audit set: the default doc tree plus any globs listed under a `## Audit set` section ' +
        'in `docs/agents/documentation.md`.\n',
    }),
    AUDIT_SET_CONTRACTS,
  );
  assert.equal(auditGaps2.length, 1, "flags a document.md that drops the absent-section fallback clause");
  assert.equal(auditGaps2[0].source, path.join('skills', 'document', 'SKILL.md'), 'names document.md');

  // positive: the documentation seed loses the section entirely
  const auditGaps3 = scanContract(
    fixture({ 'references/documentation.md': '## Writing standard\n\ncontrolled\n' }),
    AUDIT_SET_CONTRACTS,
  );
  assert.equal(auditGaps3.length, 1, 'flags a documentation.md seed that carries no `## Audit set` section');
  assert.equal(auditGaps3[0].source, path.join('references', 'documentation.md'), 'names documentation.md');

  // negative: all three carried, hard-wrapped the way the real prose is
  assert.equal(
    scanContract(
      fixture({
        'skills/setup/SKILL.md':
          'Record it as the `## Audit set` section of `docs/agents/documentation.md`, one repo-relative\n' +
          'glob per bullet.\n',
        'skills/document/SKILL.md':
          'plus any globs listed under a `## Audit set`\nsection in `docs/agents/documentation.md`. That ' +
          "section is optional — if it's absent, use the default\ntree alone and say so in the report.\n",
        'references/documentation.md': '## Audit set\n\nOptional. Reads a default tree plus every glob ' +
          'listed here.\n',
      }),
      AUDIT_SET_CONTRACTS,
    ).length,
    0,
    'all three halves carried, across a line wrap, yields zero gaps',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), AGGREGATE_PAGE_CONTRACTS).length +
      scanContract(fixture({ 'README.md': '# repo\n' }), AUDIT_SET_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- AGGREGATE_PAGE_CONTRACTS: the doc-pass reference stages one section for a marked page, publish-kb merges it
  // through the script, and the KB seed documents the marker that decides which pages get one (ADR
  // 0027). ---

  // positive: the doc-pass reference goes back to staging whole pages only — the state that leaves an aggregate
  // page replaceable by the one section a scope can see
  const aggGaps1 = scanContract(
    fixture({
      'references/doc-pass.md':
        'Write each page as a **staged page**: frontmatter carrying `title` and an `action` of `upsert` ' +
        'or `delete`, the page body below.\n',
    }),
    AGGREGATE_PAGE_CONTRACTS,
  );
  assert.equal(aggGaps1.length, 1, 'flags a doc-pass reference that stages no patch for an aggregate page');
  assert.equal(aggGaps1[0].source, path.join('references', 'doc-pass.md'), 'names doc-pass.md');

  // positive: the same gap, reachable through the other stager — `/superdev:plan` seeds ADR summaries
  // into the outline too (ADR 0027, CONTEXT.md's Staged page entry), so it needs the same branch.
  const aggGapsPlan = scanContract(
    fixture({
      'skills/plan/SKILL.md':
        'Write each page as a **staged page**: frontmatter carrying `title` and an `action` of `upsert`, ' +
        'the page body below.\n',
    }),
    AGGREGATE_PAGE_CONTRACTS,
  );
  assert.equal(aggGapsPlan.length, 1, 'flags a plan.md that stages no patch for an aggregate page');
  assert.equal(aggGapsPlan[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names plan.md');

  // positive: publish-kb.js keeps the action and splices the page itself instead of merging through
  // kb-patch.js. This is the row's whole point — code that names `patch` but rewrites the live page in
  // its own logic puts a model-free process back in charge of a reader-facing page, which is exactly
  // what moving the merge into a script was meant to prevent.
  const aggGaps2 = scanContract(
    fixture({
      'scripts/publish-kb.js':
        "function publishPatch(title, stagedRaw, templates) {\n" +
        "  // splice the staged section into the live body directly, no kb-patch.js involved\n" +
        "  return { ok: true, action: 'updated' };\n" +
        "}\n",
    }),
    AGGREGATE_PAGE_CONTRACTS,
  );
  assert.equal(aggGaps2.length, 1, "flags a publish-kb.js that never merges through kb-patch.js's merge()");
  assert.equal(aggGaps2[0].source, path.join('scripts', 'publish-kb.js'), 'names publish-kb.js');

  // positive: the seed loses the marker. The quietest of the three — every other document still reads
  // correct, and the doc pass simply never marks a page, so it silently stages `upsert` forever.
  const aggGaps3 = scanContract(
    fixture({
      'references/knowledge-base-confluence.md':
        '## Audience, language & outline\n\n- **Outline** — a top-level page per audience.\n',
    }),
    AGGREGATE_PAGE_CONTRACTS,
  );
  assert.equal(aggGaps3.length, 1, 'flags a seed that documents no `(aggregate)` marker');
  assert.equal(
    aggGaps3[0].source,
    path.join('references', 'knowledge-base-confluence.md'),
    'names the Confluence seed',
  );

  // negative: all four carried, hard-wrapped the way the real prose is
  assert.equal(
    scanContract(
      fixture({
        'references/doc-pass.md':
          'An outline entry marked `aggregate` takes `action: patch` instead (ADR 0027). Such a page\n' +
          'collects a section from each of many scopes, so stage **one section**, not the page.\n',
        'skills/plan/SKILL.md':
          'An outline entry marked `aggregate` takes `action: patch` instead (ADR 0027): stage **one\n' +
          'section**, not the page.\n',
        'scripts/publish-kb.js':
          "const { merge } = require('./kb-patch.js');\n\n" +
          'function publishPatch(title, stagedRaw, templates) {\n' +
          '  const merged = merge(liveText, stagedRaw);\n' +
          '  return merged;\n' +
          '}\n',
        'references/knowledge-base-confluence.md':
          '- `Developer Docs` → `ADR summaries` **(aggregate)**\n\n`(aggregate)` marks a page many\n' +
          'scopes contribute to. The doc pass stages one section for it, as `action: patch`.\n',
      }),
      AGGREGATE_PAGE_CONTRACTS,
    ).length,
    0,
    'all three halves carried, across a line wrap, yields zero gaps',
  );

  // --- READ_PATH_CONTRACTS: a config document that marks `(aggregate)` documents the call that returns
  // a `patch`'s live body (ADR 0027). The skill-side read-failure separation this table used to pin on
  // `skills/publish-kb/SKILL.md` retired (ADR 0069): `plugin/scripts/publish-kb.js`'s `publishPatch`
  // runs that branch as code now, proven directly by `tests/publish-kb.test.js`, not prose this table
  // reads. ---

  // positive: a config document marks an outline entry `(aggregate)` but documents no call returning the
  // page body — the doc pass would stage a patch with no read to check it against
  const rpGaps2 = scanContract(
    fixture({
      'docs/agents/knowledge-base.md':
        '## Outline\n\n- **Concepts** — slice store, code host. **(aggregate)** — one section per ' +
        'concept.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps2.length, 1, 'flags a config doc that marks `(aggregate)` but documents no read');
  assert.equal(
    rpGaps2[0].source,
    path.join('docs', 'agents', 'knowledge-base.md'),
    'names knowledge-base.md',
  );

  // positive (RED reproduction): every keyword a keyword-order regex looks for — "read", "page's body",
  // "returns", "content"/"markdown" — present, in order, but the sentence asserts the call is never made.
  // A keyword-order regex with no negation awareness passes this; only a verbatim pin of the real clause
  // catches it.
  const rpGaps2b = scanContract(
    fixture({
      'docs/agents/knowledge-base.md':
        "- **Concepts** **(aggregate)**\n\nNever read a page's body before it returns the merged " +
        'content; that call is never made.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps2b.length, 1, 'flags a knowledge-base.md that asserts the body read is never made');
  assert.equal(
    rpGaps2b[0].source,
    path.join('docs', 'agents', 'knowledge-base.md'),
    'names knowledge-base.md',
  );

  // positive (RED reproduction): the label and clause are both present, in order, but "never" is
  // prefixed onto the bare verb "returns" — the exact defect a pin starting at "returns" let through
  // verbatim, since a negator prefixed before a pin's own first word leaves the rest of the pin, and so
  // the whole substring, intact. Pinning from the list item's bold label through the endpoint traps the
  // insertion point inside the span instead.
  const rpGaps7 = scanContract(
    fixture({
      'docs/agents/knowledge-base.md':
        '- **Concepts** **(aggregate)**\n\n' +
        "- **Read a page's body:** `GET /api/v1/repos/bomret/superdev/wiki/page/<sub_url>` never returns\n" +
        '  `content_base64`, which decodes to the page markdown.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps7.length, 1, 'flags a knowledge-base.md that negates the read call with a "never" prefix');
  assert.equal(
    rpGaps7[0].source,
    path.join('docs', 'agents', 'knowledge-base.md'),
    'names knowledge-base.md',
  );

  // negative: a config document with no `(aggregate)` marker at all owes no read — the requirement is
  // conditional on the marker, or every consumer repo that never enabled the feature would fail
  assert.equal(
    scanContract(
      fixture({
        'docs/agents/knowledge-base.md': '## Outline\n\n- **Overview** — what the plugin is.\n',
      }),
      READ_PATH_CONTRACTS,
    ).length,
    0,
    'a config document with no `(aggregate)` marker documents no read and yields zero gaps',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), READ_PATH_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // negative: the row's clause carried
  assert.equal(
    scanContract(
      fixture({
        'docs/agents/knowledge-base.md':
          "- **Concepts** **(aggregate)**\n\n- **Read a page's body:** " +
          '`GET /api/v1/repos/bomret/superdev/wiki/page/<sub_url>` returns `content_base64`, which ' +
          'decodes to the page markdown.\n',
      }),
      READ_PATH_CONTRACTS,
    ).length,
    0,
    'the clause carried yields zero gaps',
  );

  // --- STATUS_SEED_CONTRACTS: run init seeds each loaded slice's real status into `scope.js init`, so a
  // second run over a partly merged feature (ADR 0004) never re-dispatches an already-merged slice. ---

  // positive: implement.md's init call drops the `status` field — every loaded slice would seed the
  // bare `todo` default again, exactly the re-dispatch bug this contract exists to catch. The
  // never-dispatched sentence stays in this fixture, so the gap is the field row alone.
  const statusGaps1 = scanContract(
    fixture({
      'references/run-init.md':
        'A slice the store reports as **merged seeds `merged`, and is never dispatched**.\n\n' +
        'echo \'{"anchor": "…", "slices": [{"id": "01", "issue": "…", "title": "…", "type": "…", ' +
        '"depends-on": "…"}]}\' | node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init <type>/<scope>\n',
    }),
    STATUS_SEED_CONTRACTS,
  );
  assert.equal(statusGaps1.length, 1, 'flags an init call that stops passing `status`');
  assert.equal(statusGaps1[0].source, path.join('references', 'run-init.md'), 'names run-init.md');

  // negative: both clauses carried
  assert.equal(
    scanContract(
      fixture({
        'references/run-init.md':
          'A slice the store reports as **merged seeds `merged`, and is never dispatched**.\n\n' +
          'echo \'{"anchor": "…", "slices": [{"id": "01", "issue": "…", "title": "…", "type": "…", ' +
          '"depends-on": "…", "status": "…"}]}\' | node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init ' +
          '<type>/<scope>\n',
      }),
      STATUS_SEED_CONTRACTS,
    ).length,
    0,
    'an init call carrying `status` and the never-dispatched sentence yields zero gaps',
  );

  // positive: the sentence stating a merged slice is never dispatched is gone, but the `status` field
  // itself is still carried — the field alone says nothing about skipping a merged slice, so this row
  // must fire alone, with the field row silent.
  const statusGapsNoNeverDispatched = scanContract(
    fixture({
      'references/run-init.md':
        'echo \'{"anchor": "…", "slices": [{"id": "01", "issue": "…", "title": "…", "type": "…", ' +
        '"depends-on": "…", "status": "…"}]}\' | node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init ' +
        '<type>/<scope>\n',
    }),
    STATUS_SEED_CONTRACTS,
  );
  assert.equal(
    statusGapsNoNeverDispatched.length,
    1,
    'flags exactly the missing never-dispatched clause, field row silent',
  );
  assert.match(
    statusGapsNoNeverDispatched[0].expectation,
    /never dispatched/,
    'names the never-dispatched clause',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), STATUS_SEED_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // --- ROTATE_ON_SHIPPED_CONTRACTS: a `shipped` ledger belongs to a finished run (ADR 0007's seven-day
  // trail keeps `ledger.md` on disk past merge), so run init must rotate it aside and run `init` again
  // rather than resume it — the exact landing a new feature reusing a retired label (ADR 0083) needs. ---

  // positive: implement.md loses the rotate-on-shipped rule and falls back to the old always-resume text
  const rotateGaps1 = scanContract(
    fixture({
      'references/run-init.md':
        '**Resuming a run init that already ran** — `<run-root>/ledger.md` already present — skip `init` ' +
        'and go on to your playbook.\n',
    }),
    ROTATE_ON_SHIPPED_CONTRACTS,
  );
  assert.equal(rotateGaps1.length, 4, 'flags all four missing clauses');
  assert.ok(
    rotateGaps1.every((g) => g.source === path.join('references', 'run-init.md')),
    'names run-init.md',
  );

  // negative: the full rotate-on-shipped paragraph, wrapped the way the real document wraps it
  assert.equal(
    scanContract(
      fixture({
        'references/run-init.md':
          '**`<run-root>/ledger.md` already present** — read its stage first. Stage **`shipped`** — ' +
          'that ledger belongs to a finished run: run `init` directly. `init` itself rotates the existing ' +
          'ledger aside to `ledger-shipped-<date>.md` before writing the fresh one: the rotation never ' +
          'overwrites an existing `ledger-shipped-<date>.md`, nothing is deleted, so ADR\n' +
          "0007's seven-day trail and `scope-prune`'s contained-or-gone reap rule (ADR 0053) both stand " +
          'unchanged. Any other stage — `implementing`, `merged`, `reviewed`, `documented`,\n' +
          '`documented-unreviewed`, or `submitted` — is a run init that already ran: skip `init`.\n',
      }),
      ROTATE_ON_SHIPPED_CONTRACTS,
    ).length,
    0,
    'the wrapped paragraph satisfies all four clauses',
  );

  // positive: the three existing clauses hold, but the rotation carries no no-clobber guarantee — the
  // fourth row must fire alone, leaving the other three silent
  const rotateNoClobberGap = scanContract(
    fixture({
      'references/run-init.md':
        '**`<run-root>/ledger.md` already present** — read its stage first. Stage **`shipped`** — ' +
        'that ledger belongs to a finished run: run `init` directly. `init` itself rotates the existing ' +
        'ledger aside to `ledger-shipped-<date>.md` before writing the fresh one: nothing is deleted, so ADR\n' +
        "0007's seven-day trail and `scope-prune`'s contained-or-gone reap rule (ADR 0053) both stand " +
        'unchanged. Any other stage — `implementing`, `merged`, `reviewed`, `documented`,\n' +
        '`documented-unreviewed`, or `submitted` — is a run init that already ran: skip `init`.\n',
    }),
    ROTATE_ON_SHIPPED_CONTRACTS,
  );
  assert.equal(rotateNoClobberGap.length, 1, 'only the no-clobber row fires');
  assert.ok(
    /never overwrites an existing/.test(rotateNoClobberGap[0].expectation),
    'the lone gap names the no-clobber expectation',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), ROTATE_ON_SHIPPED_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // --- PLAN_APPEND_CONTRACTS: /plan's §0 asks new-vs-extend, refuses to extend on any of its signals
  // while writing nothing, and promotes a single-slice feature to an epic in §6, with the other writes
  // (ADR 0004). Six independent rows — five against `skills/plan/SKILL.md`, one against
  // `references/plan-contract.md` — so losing any one clause fails on its own, not just in aggregate.
  // The refusal rows are pinned on the condition sentence's own wording, not on the rationale that
  // explains it afterward, so gutting the condition while leaving the rationale intact still fails. The
  // shipped half of the refusal is SHIPPED_APPEND_CONTRACTS' own (ADR 0083), below. ---

  const planAppendBody =
    '## 0. Config\n\n' +
    'Ask new vs. extend, before the interview begins. Answering **new** makes no store call at all.\n\n' +
    'Refuse to extend, and write nothing, on any signal below:\n\n' +
    '- The store holds a slice `in-progress`, `in-review`, or `blocked` — a run active elsewhere.\n' +
    "- The scope's run root exists with a ledger stage other than `planned`.\n\n" +
    "Create the epic, copy the lone slice's `acceptance` into it as the global DoD, and leave the lone " +
    'slice byte-identical, except for one moving part: an anchor-dependency line, if the slice carries ' +
    'one, migrates to the new epic.\n';

  const planPromotionSentence =
    "Create the epic, copy the lone slice's `acceptance` into it as the global DoD, and leave the lone " +
    'slice byte-identical, except for one moving part: an anchor-dependency line, if the slice carries ' +
    'one, migrates to the new epic.\n';

  // negative: losing the §0 new-vs-extend question fails on its own
  const paNoQuestion = fixture({
    'skills/plan/SKILL.md': planAppendBody.replace(
      'Ask new vs. extend, before the interview begins. Answering **new** makes no store call at all.\n\n',
      '',
    ),
  });
  const paGapsNoQuestion = scanContract(paNoQuestion, PLAN_APPEND_CONTRACTS);
  assert.equal(paGapsNoQuestion.length, 1, 'flags exactly the missing §0 question');
  assert.match(paGapsNoQuestion[0].expectation, /new-vs-extend/, 'names the §0 clause');

  // negative: losing the store refusal signal fails on its own
  const paNoStoreSignal = fixture({
    'skills/plan/SKILL.md': planAppendBody.replace(
      '- The store holds a slice `in-progress`, `in-review`, or `blocked` — a run active elsewhere.\n',
      '',
    ),
  });
  const paGapsNoStoreSignal = scanContract(paNoStoreSignal, PLAN_APPEND_CONTRACTS);
  assert.equal(paGapsNoStoreSignal.length, 1, 'flags exactly the missing store refusal signal');
  assert.match(paGapsNoStoreSignal[0].expectation, /store refusal signal/, 'names the store signal');

  // negative: losing the ledger refusal signal fails on its own
  const paNoLedgerSignal = fixture({
    'skills/plan/SKILL.md': planAppendBody.replace(
      "- The scope's run root exists with a ledger stage other than `planned`.\n",
      '',
    ),
  });
  const paGapsNoLedgerSignal = scanContract(paNoLedgerSignal, PLAN_APPEND_CONTRACTS);
  assert.equal(paGapsNoLedgerSignal.length, 1, 'flags exactly the missing ledger refusal signal');
  assert.match(paGapsNoLedgerSignal[0].expectation, /ledger refusal signal/, 'names the ledger signal');

  // acceptance mutation: gutting the real plan.md's refusal condition while leaving the rationale
  // sentences that follow it intact must still fail — this is the exact drift a rationale-anchored
  // pattern misses.
  const realPlanBody = fs.readFileSync(docPath(realRoot, 'skills', 'plan', 'SKILL.md'), 'utf8');
  const guttedCondition = realPlanBody.replace(
    /exists with a ledger stage other than `planned`/,
    'exists at all',
  );
  assert.notEqual(guttedCondition, realPlanBody, 'the mutation actually changed the condition sentence');
  const guttedGaps = scanContract(fixture({ 'skills/plan/SKILL.md': guttedCondition }), PLAN_APPEND_CONTRACTS);
  assert.equal(guttedGaps.length, 1, 'gutting the condition while keeping the rationale still fails');
  assert.match(guttedGaps[0].expectation, /ledger refusal signal/, 'names the ledger signal');

  // negative: losing the epic-promotion clause fails on its own
  const paNoPromotion = fixture({
    'skills/plan/SKILL.md': planAppendBody.replace(planPromotionSentence, ''),
  });
  const paGapsNoPromotion = scanContract(paNoPromotion, PLAN_APPEND_CONTRACTS);
  assert.equal(paGapsNoPromotion.length, 2, 'flags the epic-promotion and migration clauses together');
  assert.match(paGapsNoPromotion[0].expectation, /epic-promotion/, 'names the epic-promotion clause');

  // negative: keeping the promotion clause but dropping ADR 0043's exception to it fails on its own —
  // `skills/plan/SKILL.md` is not a store document, so `scanAppendContract` never reaches it
  const paNoMigration = fixture({
    'skills/plan/SKILL.md': planAppendBody.replace(
      ', except for one moving part: an anchor-dependency line, if the slice carries one, migrates to ' +
        'the new epic',
      '',
    ),
  });
  const paGapsNoMigration = scanContract(paNoMigration, PLAN_APPEND_CONTRACTS);
  assert.equal(paGapsNoMigration.length, 1, "flags exactly plan.md's missing migration clause");
  assert.match(paGapsNoMigration[0].expectation, /migrates to the new epic/, 'names the migration');

  // `references/plan-contract.md` carries its own row, and states the migration in bold — the same
  // anchoring the store documents use, so running prose alone satisfies nothing
  const planContractBody =
    '## Append mode\n\n' +
    'Merged slices are immutable — except the anchor-dependency line, which **migrates to the new epic** ' +
    'when append promotes a single-slice feature.\n';
  assert.equal(
    scanContract(fixture({ 'references/plan-contract.md': planContractBody }), PLAN_APPEND_CONTRACTS).length,
    0,
    'a plan-contract.md stating the migration in bold yields zero gaps',
  );
  const pcGapsProse = scanContract(
    fixture({
      'references/plan-contract.md': planContractBody.replace(
        '**migrates to the new epic**',
        'migrates to the new epic',
      ),
    }),
    PLAN_APPEND_CONTRACTS,
  );
  assert.equal(pcGapsProse.length, 1, 'running prose alone flags plan-contract.md');
  assert.equal(
    pcGapsProse[0].source,
    path.join('references', 'plan-contract.md'),
    'names plan-contract.md, not one of the plan.md rows',
  );

  // negative: a plan.md carrying every clause is clean
  assert.equal(
    scanContract(fixture({ 'skills/plan/SKILL.md': planAppendBody }), PLAN_APPEND_CONTRACTS).length,
    0,
    'a plan.md carrying all five of its clauses yields zero gaps',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), PLAN_APPEND_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // --- SHIPPED_APPEND_CONTRACTS: a feature whose anchor has shipped takes no append, on either signal
  // alone, and the refusal names the new-feature remedy (ADR 0083, INV-0004). Four independent rows —
  // three against `skills/plan/SKILL.md`, one against `references/plan-contract.md`. ---

  const shippedAppendBody =
    '## 0. Config\n\n' +
    '**A feature whose anchor has shipped takes no append** (ADR 0083, INV-0004). The two shipped ' +
    'signals above are read together and **either one alone refuses** — a run root whose ledger stage ' +
    "reads `shipped`, and a scope anchor at the store's done status. So the refusal names the remedy " +
    'instead — plan the follow-up as a **new feature** carrying `**Blocked by feature:** #<anchor>`.\n';

  // negative: losing the refusal itself fails on its own
  const saNoRefusal = fixture({
    'skills/plan/SKILL.md': shippedAppendBody.replace('takes no append', 'is appendable'),
  });
  const saGapsNoRefusal = scanContract(saNoRefusal, SHIPPED_APPEND_CONTRACTS);
  assert.equal(saGapsNoRefusal.length, 1, 'flags exactly the missing refusal');
  assert.match(saGapsNoRefusal[0].expectation, /takes no append/, 'names the refusal');

  // negative: naming one signal without the other fails the signals row — neither answers alone
  const saOneSignal = fixture({
    'skills/plan/SKILL.md': shippedAppendBody.replace(
      ", and a scope anchor at the store's done status",
      '',
    ),
  });
  const saGapsOneSignal = scanContract(saOneSignal, SHIPPED_APPEND_CONTRACTS);
  assert.equal(saGapsOneSignal.length, 1, 'flags exactly the signals row');
  assert.match(saGapsOneSignal[0].expectation, /either one alone refuses/, 'names both signals');

  // negative: a refusal with no remedy is a dead end, and fails on its own
  const saNoRemedy = fixture({
    'skills/plan/SKILL.md': shippedAppendBody.replace(
      'plan the follow-up as a **new feature** carrying `**Blocked by feature:** #<anchor>`',
      'plan the follow-up somewhere else',
    ),
  });
  const saGapsNoRemedy = scanContract(saNoRemedy, SHIPPED_APPEND_CONTRACTS);
  assert.equal(saGapsNoRemedy.length, 1, 'flags exactly the missing remedy');
  assert.match(saGapsNoRemedy[0].expectation, /Blocked by feature/, 'names the remedy');

  // positive: a plan.md carrying all three of its clauses yields zero gaps
  assert.equal(
    scanContract(fixture({ 'skills/plan/SKILL.md': shippedAppendBody }), SHIPPED_APPEND_CONTRACTS).length,
    0,
    'a plan.md carrying every shipped-append clause yields zero gaps',
  );

  // `references/plan-contract.md` carries the fourth row, so the boundary cannot live in the command alone
  const shippedContractBody =
    '## Append mode\n\n- **A shipped feature takes no append.** Amending it in place pools verified ' +
    'criteria with unverified ones.\n';
  assert.equal(
    scanContract(fixture({ 'references/plan-contract.md': shippedContractBody }), SHIPPED_APPEND_CONTRACTS)
      .length,
    0,
    'a plan-contract.md stating the boundary yields zero gaps',
  );
  const scGaps = scanContract(
    fixture({
      'references/plan-contract.md': shippedContractBody.replace(
        'A shipped feature takes no append.',
        'A shipped feature is extended like any other.',
      ),
    }),
    SHIPPED_APPEND_CONTRACTS,
  );
  assert.equal(scGaps.length, 1, 'a plan-contract.md dropping the boundary flags its own row');
  assert.equal(
    scGaps[0].source,
    path.join('references', 'plan-contract.md'),
    'names plan-contract.md, not one of the plan.md rows',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), SHIPPED_APPEND_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // --- ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS: the per-feature-label candidate listing queries every
  // state, not just `state=open`, so a shipped feature's closed epic still resolves through *Recognise
  // one* (ADR 0083). The rationale sentence alone is not the contract — the query string itself must
  // carry `state=all`, or a revert that leaves the rationale in place would pass unnoticed. A `state=all`
  // listing can also return a retired label's closed root beside a reused label's open one, so the open
  // candidate must win *Recognise one* and *Ambiguous* must fire only among open candidates. Every row
  // below targets the same handful of documents, so each fixture carries every clause that document's
  // own rows pin — a fixture missing one clause fails that row alone, in isolation. ---

  // Forgejo-shaped: the query-form row, plus the open-preference Recognise-one and Ambiguous rows.
  const forgejoShapedBody =
    '- **List the candidates.** The feature labels themselves: `GET /api/v1/repos/<owner>/<repo>/labels` ' +
    "(paginated), keeping the names whose first segment is a change type. Per feature label: " +
    '`GET /api/v1/repos/<owner>/<repo>/issues?labels=<type>%2F<feature>&state=all` (URL-encode the ' +
    "label's `/`), then apply the rule above to the result. `state=all`, not `state=open`: a shipped " +
    "feature's epic is closed, and a `state=open` listing would drop it from the candidates a picked " +
    "feature resolves against, so `/superdev:plan`'s shipped-anchor refusal (ADR 0083) never sees it.\n" +
    '- **Recognise one.** Apply the rule to the **open** issues carrying a feature label first: the ' +
    'anchor is the one labelled `epic`.\n' +
    '- **Ambiguous.** No `epic`-labelled open issue and two or more open issues carrying the same ' +
    'feature label.\n';

  for (const doc of ['docs/agents/issue-tracker.md', 'references/issue-tracker-forgejo.md']) {
    // positive: every clause present yields zero gaps
    assert.equal(
      scanContract(fixture({ [doc]: forgejoShapedBody }), ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS).length,
      0,
      `${doc} carrying every clause yields zero gaps`,
    );

    // negative: dropping every clause fails all three of that document's rows
    const gapsNoBullets = scanContract(
      fixture({ [doc]: 'Some other section entirely.\n' }),
      ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
    );
    assert.equal(gapsNoBullets.length, 3, `${doc}: dropping every clause flags all three of its rows`);
    const expectedSource = path.join(...doc.split('/'));
    assert.ok(
      gapsNoBullets.every((gap) => gap.source === expectedSource),
      `${doc}: every gap names it`,
    );

    // negative: the query-only revert — `state=all` reverted to `state=open` in the query string alone,
    // rationale untouched. The rationale-only pattern missed this shape; pinning the query catches it.
    const gapsQueryOnlyRevert = scanContract(
      fixture({
        [doc]: forgejoShapedBody.replace(
          'labels=<type>%2F<feature>&state=all` (URL-encode',
          'labels=<type>%2F<feature>&state=open` (URL-encode',
        ),
      }),
      ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
    );
    assert.equal(gapsQueryOnlyRevert.length, 1, `${doc}: a query reverted to \`state=open\` is flagged alone`);

    // negative: dropping the open preference in Recognise one, alone
    const recogniseGaps = scanContract(
      fixture({
        [doc]: forgejoShapedBody.replace(
          'Recognise one.** Apply the rule to the **open** issues',
          'Recognise one.** Apply the rule to the issues',
        ),
      }),
      ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
    );
    assert.equal(recogniseGaps.length, 1, `${doc}: dropping the open preference in Recognise one is flagged alone`);

    // negative: dropping the open-only Ambiguous shape, alone
    const ambiguousGaps = scanContract(
      fixture({
        [doc]: forgejoShapedBody.replace(
          'No `epic`-labelled open issue and two or more open issues',
          'No `epic`-labelled issue and two or more issues',
        ),
      }),
      ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
    );
    assert.equal(ambiguousGaps.length, 1, `${doc}: dropping the open-only Ambiguous shape is flagged alone`);
  }

  // GitHub-shaped: the query-form row, plus the open-root and open-only-Ambiguous rows.
  const githubShapedBody =
    '- **List the candidates.** `GET /repos/<owner>/<repo>/issues?labels=<type>%2F<feature>&state=all` ' +
    '(URL-encode the label\'s `/`). Where the roots span both states, the open\n  root is the anchor.\n' +
    '- **Ambiguous.** Two or more **open** roots under one feature label.\n';

  assert.equal(
    scanContract(
      fixture({ 'references/issue-tracker-github.md': githubShapedBody }),
      ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
    ).length,
    0,
    'issue-tracker-github.md carrying every clause yields zero gaps',
  );
  const ghGapsQueryOnlyRevert = scanContract(
    fixture({
      'references/issue-tracker-github.md': githubShapedBody.replace(
        'labels=<type>%2F<feature>&state=all` (URL-encode',
        'labels=<type>%2F<feature>&state=open` (URL-encode',
      ),
    }),
    ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
  );
  assert.equal(ghGapsQueryOnlyRevert.length, 1, "issue-tracker-github.md: a query reverted to `state=open` is flagged alone");
  const ghOpenRootGaps = scanContract(
    fixture({
      'references/issue-tracker-github.md': githubShapedBody.replace(
        'the open\n  root is the anchor',
        'any root is the anchor',
      ),
    }),
    ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
  );
  assert.equal(ghOpenRootGaps.length, 1, 'issue-tracker-github.md: dropping the open-root preference is flagged alone');
  const ghAmbiguousGaps = scanContract(
    fixture({
      'references/issue-tracker-github.md': githubShapedBody.replace(
        'Two or more **open** roots',
        'Two or more roots',
      ),
    }),
    ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
  );
  assert.equal(ghAmbiguousGaps.length, 1, 'issue-tracker-github.md: dropping the open-only Ambiguous shape is flagged alone');

  // Jira-shaped: no query-form row (Jira's per-label listing runs no status filter at all), just the
  // not-`<Done>`-preference Recognise-one and Ambiguous rows, phrased against `fields.status.name`
  // rather than "open" since Jira has no open/closed issue state.
  const jiraShapedBody =
    '- **Recognise one.** A root has no parent. prefer the root whose `fields.status.name` is not ' +
    '`<Done>`.\n' +
    '- **Ambiguous.** Two or more parentless issues under one feature label whose `fields.status.name` ' +
    'is not `<Done>`.\n';

  assert.equal(
    scanContract(
      fixture({ 'references/issue-tracker-jira.md': jiraShapedBody }),
      ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
    ).length,
    0,
    'issue-tracker-jira.md carrying every clause yields zero gaps',
  );
  const jiraRecogniseGaps = scanContract(
    fixture({
      'references/issue-tracker-jira.md': jiraShapedBody.replace(
        'prefer the root whose `fields.status.name` is not `<Done>`',
        'prefer whichever root is returned first',
      ),
    }),
    ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
  );
  assert.equal(
    jiraRecogniseGaps.length,
    1,
    'issue-tracker-jira.md: dropping the not-`<Done>` preference in Recognise one is flagged alone',
  );
  const jiraAmbiguousGaps = scanContract(
    fixture({
      'references/issue-tracker-jira.md': jiraShapedBody.replace(
        'Two or more parentless issues under one feature label whose `fields.status.name` is not `<Done>`',
        'Two or more parentless issues under one feature label',
      ),
    }),
    ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
  );
  assert.equal(
    jiraAmbiguousGaps.length,
    1,
    'issue-tracker-jira.md: dropping the not-`<Done>`-only Ambiguous shape is flagged alone',
  );

  // plan-contract.md: the single generic row stating both the open-candidate and open-only-Ambiguous rules
  const openPreferenceContractBody =
    '## Scope anchor\n\n' +
    'A backend whose candidate listing spans every state can also return a retired label\'s closed root ' +
    'beside a reused label\'s open one. **The open candidate is the anchor there. `Ambiguous` is two or ' +
    'more *open* candidates** — never a closed one sitting beside a single open one.\n';
  assert.equal(
    scanContract(
      fixture({ 'references/plan-contract.md': openPreferenceContractBody }),
      ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
    ).length,
    0,
    'a plan-contract.md carrying the open-preference clause yields zero gaps',
  );
  const pcGapsNoOpenPreference = scanContract(
    fixture({
      'references/plan-contract.md': openPreferenceContractBody.replace(
        'The open candidate is the anchor there. `Ambiguous` is two or more *open* candidates',
        'The anchor is whichever candidate is returned first',
      ),
    }),
    ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
  );
  assert.equal(pcGapsNoOpenPreference.length, 1, 'flags plan-contract.md for dropping the open-preference clause');
  assert.equal(
    pcGapsNoOpenPreference[0].source,
    path.join('references', 'plan-contract.md'),
    'names plan-contract.md',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // --- PARKED_QUESTIONS_CONTRACTS: /plan's §0 surfaces the epic's parked questions once it loads,
  // before the interview diverges into new ground, and deletes a resolved one's line, leaving the new
  // slice's `spec`/`acceptance` as the durable record (ADR 0004, ADR 0005). Two independent rows: losing
  // either clause fails on its own, not just in aggregate. ---

  const parkedQuestionsBody =
    '## 0. Config\n\n' +
    "**Surface the epic's parked questions once it loads, before the interview diverges into new " +
    "ground.** Present every entry in the epic's `## Parked questions` section to the user; an absent " +
    'or empty section surfaces nothing.\n\n' +
    "A question this interview resolves has its line deleted from that section — the new slice's " +
    '`spec` and `acceptance` become the durable record instead. One left unresolved carries forward ' +
    'untouched.\n';

  // negative: losing the surface-step clause fails on its own
  const pqNoSurface = fixture({
    'skills/plan/SKILL.md': parkedQuestionsBody.replace(
      "**Surface the epic's parked questions once it loads, before the interview diverges into new " +
        'ground.** ',
      '',
    ),
  });
  const pqGapsNoSurface = scanContract(pqNoSurface, PARKED_QUESTIONS_CONTRACTS);
  assert.equal(pqGapsNoSurface.length, 1, 'flags exactly the missing surface step');
  assert.match(
    pqGapsNoSurface[0].expectation,
    /surface the epic's `## Parked questions`/,
    'names the surface-step clause',
  );

  // negative: losing the delete-on-resolve clause fails on its own
  const pqNoDelete = fixture({
    'skills/plan/SKILL.md': parkedQuestionsBody.replace(
      "A question this interview resolves has its line deleted from that section — the new slice's " +
        '`spec` and `acceptance` become the durable record instead. ',
      '',
    ),
  });
  const pqGapsNoDelete = scanContract(pqNoDelete, PARKED_QUESTIONS_CONTRACTS);
  assert.equal(pqGapsNoDelete.length, 1, 'flags exactly the missing delete-on-resolve rule');
  assert.match(pqGapsNoDelete[0].expectation, /has its line deleted/, 'names the delete-on-resolve clause');

  // negative: a plan.md carrying both clauses is clean
  assert.equal(
    scanContract(fixture({ 'skills/plan/SKILL.md': parkedQuestionsBody }), PARKED_QUESTIONS_CONTRACTS).length,
    0,
    'a plan.md carrying both clauses yields zero gaps',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), PARKED_QUESTIONS_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // --- RUN_KIND_CONTRACTS: scope-mode.md specifies the branch step for both run kinds — `fresh` cuts
  // from base and, where a squash-merging host or a scope-prune reap left a same-named branch standing,
  // reuses it only when base already contains its content; `resumed` switches to it and cuts nothing
  // (ADR 0028, ADR 0045, ADR 0083). ADR 0053 added rows: the **Present** branch delegating to
  // `## Containment`, that section's own canonical statement of the test, and the **No forcing flag**
  // exception stated as conditional on the containment proof. A fix cycle added another: the
  // scopetree must be clean before a contained branch is re-pointed with `git reset --hard <base>`,
  // because the containment proof covers the branch's committed history and says nothing about the
  // index or working tree (Important 2). Independent rows: losing one clause's specification
  // fails on its own, not just in aggregate. ---

  const runKindBody =
    '## Containment\n\n' +
    'A scope branch has reached base when merging it into base would change nothing.\n\n' +
    '```sh\ntree=$(git merge-tree --write-tree <base> <branch>) && ' +
    '[ "$tree" = "$(git rev-parse <base>^{tree})" ]\n```\n\n' +
    'Equal tree is contained; a differing tree and a conflict exit are not. `--write-tree` needs git ' +
    '2.38, and an older git falls back to `git merge-base --is-ancestor` and says so.\n\n' +
    '## Cutting the scope branch\n\n' +
    '- **`fresh`** — no ledger existed, so the run itself has never cut this branch before. Cut it ' +
    'from `<base>`. **The name already exists** — a scope-prune reap left it standing. The branch is ' +
    'then decided rather than stopped on unconditionally — contained in `<base>` and ' +
    'reused, or not contained and stopped, per `## Containment` above. ' +
    'Decide on the same test that decides a ' +
    'scope is finished with (ADR 0007): contained in `<base>`, or gone entirely. Gone → the cut above ' +
    'is the whole step. ' +
    '**Present** — decide with `## Containment` above, which owns the test. **Contained** — ' +
    'work in the scopetree, then check the scopetree is clean: `git -C .superdev/scopes/<scope>/' +
    'scopetree status --porcelain` returns nothing. The containment proof above covers the branch\'s ' +
    'committed history, never the index or the working tree. **Dirty** — name what `status ' +
    '--porcelain` reported and stop, cutting nothing. **`--unattended` →\nblock**. **Clean** — ' +
    're-point it.\n' +
    '- **`resumed`** — the branch holds unmerged slice work by design, so no containment test runs and ' +
    'nothing is cut.\n\n' +
    '**No forcing flag, at any run kind.** `git switch -C` and `git worktree add -B` strand merged ' +
    'slices. Two re-pointings are permitted: fast-forwarding to `<base>`, and `git reset --hard <base>` ' +
    'on a branch `## Containment` has just proved contained.\n';

  // negative: losing the `fresh` cut-from-base clause fails on its own
  const rkNoFresh = fixture({
    'references/scope-mode.md': runKindBody.replace(
      'no ledger existed, so the run itself has never cut this branch before. Cut it from `<base>`. ',
      '',
    ),
  });
  const rkGapsNoFresh = scanContract(rkNoFresh, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoFresh.length, 1, 'flags exactly the missing `fresh` cut-from-base clause');
  assert.match(rkGapsNoFresh[0].expectation, /`fresh` run kind/, 'names the `fresh` run kind');

  // negative: losing the `fresh` existing-name stop clause fails on its own
  const rkNoFreshStop = fixture({
    'references/scope-mode.md': runKindBody.replace(
      ' **The name already exists** — a scope-prune reap left it standing. The branch is then ' +
        'decided rather than stopped on unconditionally — contained in `<base>` and ' +
        'reused, or not contained and stopped, per `## Containment` above.',
      '',
    ),
  });
  const rkGapsNoFreshStop = scanContract(rkNoFreshStop, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoFreshStop.length, 1, 'flags exactly the missing `fresh` existing-name stop clause');
  assert.match(rkGapsNoFreshStop[0].expectation, /`fresh` run kind/, 'names the `fresh` run kind');

  // negative: losing the reused-branch contained-or-gone clause fails on its own
  const rkNoReuse = fixture({
    'references/scope-mode.md': runKindBody.replace(
      'Decide on the same test that decides a scope is finished with (ADR 0007): contained in ' +
        '`<base>`, or gone entirely. Gone → the cut above is the whole step. ',
      '',
    ),
  });
  const rkGapsNoReuse = scanContract(rkNoReuse, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoReuse.length, 1, 'flags exactly the missing contained-or-gone clause');
  assert.match(rkGapsNoReuse[0].expectation, /`fresh` run kind/, 'names the `fresh` run kind');

  // negative: the **Present** branch naming a git command of its own, instead of delegating to
  // `## Containment`, fails on its own — the one-sided-delegation shape ADR 0053 closed
  const rkNoDelegation = fixture({
    'references/scope-mode.md': runKindBody.replace(
      '**Present** — decide with `## Containment` above, which owns the test.',
      '**Present** — test containment with `git merge-base --is-ancestor <branch> <base>`.',
    ),
  });
  const rkGapsNoDelegation = scanContract(rkNoDelegation, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoDelegation.length, 1, 'flags exactly the missing `## Containment` delegation');
  assert.match(
    rkGapsNoDelegation[0].expectation,
    /\*\*Present\*\* branch names/,
    'names the delegation the **Present** branch owes',
  );

  // negative: deleting the `## Containment` section the two delegations point at fails on its own —
  // a delegation to a section that no longer exists pins nothing
  const rkNoContainment = fixture({
    'references/scope-mode.md': runKindBody.slice(runKindBody.indexOf('## Cutting the scope branch')),
  });
  const rkGapsNoContainment = scanContract(rkNoContainment, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoContainment.length, 1, 'flags exactly the missing `## Containment` section');
  assert.match(
    rkGapsNoContainment[0].expectation,
    /canonical `## Containment` section/,
    'names the canonical section that went missing',
  );

  // negative: the **No forcing flag** rule stating the re-point as a general permission, rather than as
  // conditional on the containment proof, fails on its own
  const rkUnconditionalReset = fixture({
    'references/scope-mode.md': runKindBody.replace(
      '`git reset --hard <base>` on a branch `## Containment` has just proved contained',
      '`git reset --hard <base>` at any run kind',
    ),
  });
  const rkGapsUnconditionalReset = scanContract(rkUnconditionalReset, RUN_KIND_CONTRACTS);
  assert.equal(
    rkGapsUnconditionalReset.length,
    1,
    'flags exactly the unconditional re-point permission',
  );
  assert.match(
    rkGapsUnconditionalReset[0].expectation,
    /conditional on the containment proof/,
    'names the precondition the exception owes',
  );

  // negative: dropping the clean-scopetree guard ahead of the contained re-point fails on its
  // own — the reset would then discard an uncommitted change the containment proof never vouched for
  // (Important 2)
  const rkNoCleanGuard = fixture({
    'references/scope-mode.md': runKindBody.replace(
      'work in the scopetree, then check the scopetree is clean: `git -C .superdev/scopes/<scope>/' +
        'scopetree status --porcelain` returns nothing. The containment proof above covers the branch\'s ' +
        'committed history, never the index or the working tree. **Dirty** — name what `status ' +
        '--porcelain` reported and stop, cutting nothing. **`--unattended` →\nblock**. **Clean** — ' +
        're-point it.',
      'work in the scopetree, then re-point it.',
    ),
  });
  const rkGapsNoCleanGuard = scanContract(rkNoCleanGuard, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoCleanGuard.length, 1, 'flags exactly the missing clean-scopetree guard');
  assert.match(
    rkGapsNoCleanGuard[0].expectation,
    /require the scopetree clean/,
    'names the clean-scopetree guard the re-point owes',
  );

  // negative: losing the `resumed` specification fails on its own
  const rkNoResumed = fixture({
    'references/scope-mode.md': runKindBody.replace(
      '- **`resumed`** — the branch holds unmerged slice work by design, so no containment test runs ' +
        'and nothing is cut.\n',
      '',
    ),
  });
  const rkGapsNoResumed = scanContract(rkNoResumed, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoResumed.length, 1, 'flags exactly the missing `resumed` specification');
  assert.match(rkGapsNoResumed[0].expectation, /`resumed` run kind/, 'names the `resumed` run kind');

  // negative: a scope-mode.md carrying all three run kinds, the containment section, and the
  // conditional forcing-flag exception is clean
  assert.equal(
    scanContract(fixture({ 'references/scope-mode.md': runKindBody }), RUN_KIND_CONTRACTS).length,
    0,
    'a scope-mode.md specifying all three run kinds yields zero gaps',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), RUN_KIND_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // --- CONTAINMENT_DELEGATION_CONTRACTS: publish-kb.js's merge check delegates the containment test to
  // scope.js's exported `testContainment` — `require`d from `./scope.js` and called directly — rather
  // than reimplementing the ancestry check itself (ADR 0053, retargeted from `skills/publish-kb/SKILL.md`'s
  // prose onto the script by ADR 0069). The pattern is a presence check that fires when the script drops
  // the call; it does not assert the case where the script keeps the call *and* grows a redundant
  // ancestry test of its own beside it, because the pattern cannot see both forms at once. ---

  // negative: publish-kb.js reimplements the ancestry check itself instead of delegating
  const cdOwnTest = fixture({
    'scripts/publish-kb.js':
      "function checkContainment(mainCheckout, scope) {\n" +
      "  const res = spawnSync('git', ['merge-base', '--is-ancestor', branch, base], { cwd: mainCheckout });\n" +
      "  return { performed: true, ok: res.status === 0 };\n" +
      "}\n",
  });
  const cdGapsOwnTest = scanContract(cdOwnTest, CONTAINMENT_DELEGATION_CONTRACTS);
  assert.equal(cdGapsOwnTest.length, 1, 'flags a publish-kb.js that reimplements the ancestry check itself');
  assert.equal(cdGapsOwnTest[0].source, path.join('scripts', 'publish-kb.js'), 'names publish-kb.js');

  // negative: testContainment imported but never called is not a delegation either
  const cdImportOnly = fixture({
    'scripts/publish-kb.js':
      "const { testContainment } = require('./scope.js');\n" +
      '// containment is checked some other way below\n',
  });
  assert.equal(
    scanContract(cdImportOnly, CONTAINMENT_DELEGATION_CONTRACTS).length,
    1,
    'an imported but never-called testContainment is not a delegation',
  );

  // positive: publish-kb.js imports and calls testContainment directly, yields zero gaps
  assert.equal(
    scanContract(
      fixture({
        'scripts/publish-kb.js':
          "const { testContainment } = require('./scope.js');\n\n" +
          'function checkContainment(mainCheckout, scope) {\n' +
          "  const verdict = testContainment(mainCheckout, base, branch);\n" +
          "  return { performed: true, ok: verdict === 'contained' };\n" +
          '}\n',
      }),
      CONTAINMENT_DELEGATION_CONTRACTS,
    ).length,
    0,
    'delegating to testContainment yields zero gaps',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), CONTAINMENT_DELEGATION_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // --- CONTAINMENT_REFETCH_CONTRACTS: the `## Containment` section refetches the base before it answers
  // not contained (ADR 0065). The rows are pinned apart because each fails on its own: a second pass
  // retesting the local `<base>` re-asks the stale ref, the `--is-ancestor` route is the weaker signal
  // left without a fresh base, a section that stops excluding `hooks/scope-prune.js` invites a network
  // call onto a `Stop` hook, and a section that stops stating the failure posture turns an unreachable
  // host into an unexplained verdict. ---

  const containmentSection =
    '## Containment\n\n' +
    'A scope branch has reached base when merging it into base would change nothing:\n\n' +
    '```sh\ntree=$(git merge-tree --write-tree <base> <branch>)\n```\n\n' +
    '**A not-contained verdict against a local base is provisional, and the second pass settles it.** ' +
    'Fetch the base branch once from the remote `docs/agents/code-management.md` names — ' +
    '`git fetch <remote> <base>` — and run the same test again against `FETCH_HEAD`, which holds exactly ' +
    'what that fetch wrote. **The second verdict is the answer.** A contained first verdict ends the test ' +
    'where it stands. The `--is-ancestor` fallback below takes the same second pass.\n\n' +
    '**`hooks/scope-prune.js` runs the local test alone and never fetches.** It fires on every finished ' +
    'turn.\n\n' +
    '**No remote configured, or a fetch that fails** — an unreachable host, a rejected credential — ' +
    '**leaves the first verdict standing, and the caller says the second pass did not run.**\n';

  // positive: the whole second pass stated yields zero gaps
  assert.equal(
    scanContract(
      fixture({ 'references/scope-mode.md': containmentSection }),
      CONTAINMENT_REFETCH_CONTRACTS,
    ).length,
    0,
    'a section stating the second pass yields zero gaps',
  );

  // negative: a second pass that refetches and then retests the local `<base>` — the ref `git fetch`
  // never moves — so the retest re-asks the stale ref and can only agree with the first verdict
  const crStaleRetest = fixture({
    'references/scope-mode.md': containmentSection.replace(
      'run the same test again against `FETCH_HEAD`, which holds exactly what that fetch wrote',
      'run the same test again against `<base>`',
    ),
  });
  const crStaleGaps = scanContract(crStaleRetest, CONTAINMENT_REFETCH_CONTRACTS);
  assert.equal(crStaleGaps.length, 1, 'flags a second pass that retests the ref the fetch never moves');
  assert.match(
    crStaleGaps[0].expectation,
    /retest against `FETCH_HEAD`/,
    'names the ref the retest owes its answer to',
  );

  // negative: the `--is-ancestor` fallback left on the single-pass route, where a squash-merged branch
  // it already reads as not contained never gets the fresh base that would settle it
  assert.equal(
    scanContract(
      fixture({
        'references/scope-mode.md': containmentSection.replace(
          'The `--is-ancestor` fallback below takes the same second pass.',
          'The `--is-ancestor` fallback below is unaffected.',
        ),
      }),
      CONTAINMENT_REFETCH_CONTRACTS,
    ).length,
    1,
    'flags a fallback route left without the second pass',
  );

  // negative: the hook's exclusion dropped, which invites the JavaScript mirror to fetch on every turn
  assert.equal(
    scanContract(
      fixture({
        'references/scope-mode.md': containmentSection.replace(
          '**`hooks/scope-prune.js` runs the local test alone and never fetches.**',
          '**`hooks/scope-prune.js` mirrors this test in JavaScript.**',
        ),
      }),
      CONTAINMENT_REFETCH_CONTRACTS,
    ).length,
    1,
    'flags a section that stops excluding the hook from the fetch',
  );

  // negative: the failure posture dropped, leaving an unreachable host with no stated verdict
  assert.equal(
    scanContract(
      fixture({
        'references/scope-mode.md': containmentSection.replace(
          /\*\*No remote configured[\s\S]*$/,
          '',
        ),
      }),
      CONTAINMENT_REFETCH_CONTRACTS,
    ).length,
    1,
    'flags a section that states no failure posture for the fetch',
  );

  // a section with none of it — the state ADR 0065 found — reports every row
  assert.equal(
    scanContract(
      fixture({
        'references/scope-mode.md':
          '## Containment\n\nA scope branch has reached base when merging it into base would change ' +
          'nothing:\n\n```sh\ntree=$(git merge-tree --write-tree <base> <branch>)\n```\n',
      }),
      CONTAINMENT_REFETCH_CONTRACTS,
    ).length,
    CONTAINMENT_REFETCH_CONTRACTS.length,
    'a single-pass section reports every row',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), CONTAINMENT_REFETCH_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // the shipped reference satisfies every row
  assert.equal(
    scanContract(realRoot, CONTAINMENT_REFETCH_CONTRACTS).length,
    0,
    'the shipped `## Containment` section states the second pass',
  );
};
