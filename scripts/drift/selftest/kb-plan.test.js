'use strict';

// The knowledge-base and plan/ledger contract tables: staging and publishing a page, and the run-init
// and /plan §0 rules a second run over an appended feature depends on. One section per table.
//
// Run by ./index.js, which owns the shared fixture() helper, realRoot, and the temp-dir cleanup.

const { docPath, scanContract } = require('../lib');
const { scanKbNoBackendCall } = require('../scanners');
const {
  KB_STAGING_CONTRACTS,
  AUDIT_SET_CONTRACTS,
  AGGREGATE_PAGE_CONTRACTS,
  READ_PATH_CONTRACTS,
  STATUS_SEED_CONTRACTS,
  PLAN_APPEND_CONTRACTS,
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

  // positive: publish-kb keeps the action and merges the page itself. This is the row's whole point —
  // a document that names `patch` in passing but rewrites the live page by hand puts a model back in
  // charge of a reader-facing page, which is what moving the merge into a script prevented.
  const aggGaps2 = scanContract(
    fixture({
      'skills/publish-kb/SKILL.md':
        '- **`patch`** → fetch the live page under `title`, splice the staged section into it, and send ' +
        'the result back under the same title.\n',
    }),
    AGGREGATE_PAGE_CONTRACTS,
  );
  assert.equal(aggGaps2.length, 1, 'flags a publish-kb that names `patch` but merges the page itself');
  assert.equal(aggGaps2[0].source, path.join('skills', 'publish-kb', 'SKILL.md'), 'names publish-kb.md');

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
        'skills/publish-kb/SKILL.md':
          '- **`patch`** → the staged body is one section. Fetch the live page, then merge with\n' +
          '`node "${CLAUDE_PLUGIN_ROOT}/scripts/kb-patch.js" <live-page> <staged-file>`.\n',
        'references/knowledge-base-confluence.md':
          '- `Developer Docs` → `ADR summaries` **(aggregate)**\n\n`(aggregate)` marks a page many\n' +
          'scopes contribute to. The doc pass stages one section for it, as `action: patch`.\n',
      }),
      AGGREGATE_PAGE_CONTRACTS,
    ).length,
    0,
    'all four halves carried, across a line wrap, yields zero gaps',
  );

  // --- READ_PATH_CONTRACTS: publish-kb.md separates a read failure from a genuinely absent page, and a
  // config document that marks `(aggregate)` documents the call that returns the body (ADR 0027). ---

  // positive (RED reproduction): publish-kb mentions reading the live page, but creates it on *any*
  // missing body instead of separating a read failure from a genuinely absent page — the exact shape a
  // keyword search for "read" would wrongly pass
  const rpGaps1 = scanContract(
    fixture({
      'skills/publish-kb/SKILL.md':
        "- **`patch`** → Read the live page's body through the call the config document documents. If " +
        'the body is missing, treat the page as absent and create it from the staged section.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps1.length, 1, 'flags a publish-kb that creates the page on any missing body');
  assert.equal(rpGaps1[0].source, path.join('skills', 'publish-kb', 'SKILL.md'), 'names publish-kb.md');

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
  // catches it, the same class row 1 closed for `skills/publish-kb/SKILL.md`.
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

  // positive (RED reproduction): every required phrase present, in order, but the terminal instruction
  // itself is negated — "never leave the file staged ... anyway" — the half a bare keyword search for
  // "read failure" and "leave the file staged" would wrongly pass, since both substrings are still there
  const rpGaps3 = scanContract(
    fixture({
      'skills/publish-kb/SKILL.md':
        "**Positive absence only** — the config document's find call does not list the title — means " +
        'the page does not exist yet: the staged section becomes the new page, as an `upsert` of the ' +
        'section alone. **Any other outcome** — the config document names no read for this backend, the ' +
        'read call fails for any other reason, or it returns an empty body for a title the find call ' +
        'does list — is a **read failure, not absence**: never leave the file staged, and create the ' +
        'page from the section anyway.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps3.length, 1, 'flags a publish-kb that negates the terminal "leave the file staged"');
  assert.equal(rpGaps3[0].source, path.join('skills', 'publish-kb', 'SKILL.md'), 'names publish-kb.md');

  // positive (RED reproduction): an unlisted negator ("rather than") sits inside the character window the
  // old five-token banned list scanned — proof widening that list is a losing game, not a fix for it
  const rpGaps4 = scanContract(
    fixture({
      'skills/publish-kb/SKILL.md':
        'Any other outcome is a **read failure, not absence**: create the page from the section rather ' +
        'than leave the file staged.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps4.length, 1, 'flags an unlisted negator ("rather than") inside the old window');
  assert.equal(rpGaps4[0].source, path.join('skills', 'publish-kb', 'SKILL.md'), 'names publish-kb.md');

  // positive (RED reproduction): a second unlisted negator ("instead of") — same shape as rpGaps4
  const rpGaps5 = scanContract(
    fixture({
      'skills/publish-kb/SKILL.md':
        'Any other outcome is a **read failure, not absence**: create the page from the section instead ' +
        'of leave the file staged.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps5.length, 1, 'flags an unlisted negator ("instead of") inside the old window');
  assert.equal(rpGaps5[0].source, path.join('skills', 'publish-kb', 'SKILL.md'), 'names publish-kb.md');

  // positive (RED reproduction): the clause is cut short before "report the reason in §5, and create
  // nothing" — a truncated clause is not the pinned clause, whatever follows it. This is not a proof that
  // the row catches the trailing "Just kidding" contradiction: the clause here is already incomplete
  // before that sentence starts, so the gap traces to the truncation, not to what follows it (a trailing
  // contradiction after the *complete* clause is out of reach of this check — see the comment above
  // READ_PATH_CONTRACTS).
  const rpGaps6 = scanContract(
    fixture({
      'skills/publish-kb/SKILL.md':
        'Any other outcome is a **read failure, not absence**: leave the file staged. Just kidding, ' +
        'never do that — create the page anyway.\n',
    }),
    READ_PATH_CONTRACTS,
  );
  assert.equal(rpGaps6.length, 1, 'flags a publish-kb whose clause is truncated before "report the reason in §5"');
  assert.equal(rpGaps6[0].source, path.join('skills', 'publish-kb', 'SKILL.md'), 'names publish-kb.md');

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

  // negative: both halves carried
  assert.equal(
    scanContract(
      fixture({
        'skills/publish-kb/SKILL.md':
          "**Positive absence only** — the config document's find call does not list the title — means " +
          'the page does not exist yet: the staged section becomes the new page, as an `upsert` of the ' +
          'section alone. **Any other outcome** — the config document names no read for this backend, the ' +
          'read call fails for any other reason, or it returns an empty body for a title the find call ' +
          'does list — is a **read failure, not absence**: leave the file staged, report the reason in ' +
          '§5, and create nothing.\n',
        'docs/agents/knowledge-base.md':
          "- **Concepts** **(aggregate)**\n\n- **Read a page's body:** " +
          '`GET /api/v1/repos/bomret/superdev/wiki/page/<sub_url>` returns `content_base64`, which ' +
          'decodes to the page markdown.\n',
      }),
      READ_PATH_CONTRACTS,
    ).length,
    0,
    'both halves carried yields zero gaps',
  );

  // --- STATUS_SEED_CONTRACTS: run init seeds each loaded slice's real status into `scope.js init`, so a
  // second run over an appended feature (ADR 0004) never re-dispatches an already-merged slice. ---

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
  // rather than resume it — the exact landing a second run over an appended feature (ADR 0004) needs. ---

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
          'that ledger belongs to a finished run — rename it to `ledger-shipped-<date>.md` and run ' +
          '`init` above, which writes a fresh ledger beside it: the rotation never overwrites an ' +
          'existing `ledger-shipped-<date>.md`, nothing is deleted, so ADR\n' +
          "0007's seven-day trail and `scope-prune`'s contained-or-gone reap rule (ADR 0053) both stand " +
          'unchanged. Any other stage — `implementing`, `merged`, `reviewed`, `documented`, or\n' +
          '`documented-unreviewed` — is a run init that already ran: skip `init`.\n',
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
        'that ledger belongs to a finished run — rename it to `ledger-shipped-<date>.md` and run ' +
        '`init` above, which writes a fresh ledger beside it: nothing is deleted, so ADR\n' +
        "0007's seven-day trail and `scope-prune`'s contained-or-gone reap rule (ADR 0053) both stand " +
        'unchanged. Any other stage — `implementing`, `merged`, `reviewed`, `documented`, or\n' +
        '`documented-unreviewed` — is a run init that already ran: skip `init`.\n',
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

  // --- PLAN_APPEND_CONTRACTS: /plan's §0 asks new-vs-extend, refuses to extend on either signal while
  // writing nothing, and promotes a single-slice feature to an epic in §6, with the other writes
  // (ADR 0004). Seven independent rows — six against `skills/plan/SKILL.md`, one against
  // `references/plan-contract.md` — so losing any one clause fails on its own, not just in aggregate.
  // The ledger refusal signal's two clauses are pinned on the condition sentence's own wording, not on
  // the rationale that explains the branch test afterward, so gutting the condition while leaving the
  // rationale intact still fails. ---

  const planAppendBody =
    '## 0. Config\n\n' +
    'Ask new vs. extend, before the interview begins. Answering **new** makes no store call at all.\n\n' +
    'Refuse to extend, and write nothing, on either signal below:\n\n' +
    '- The store holds a slice `in-progress`, `in-review`, or `blocked` — a run active elsewhere.\n' +
    "- The scope's run root exists with a ledger stage other than `shipped`, or with a `shipped` stage " +
    'whose scope branch (`<type>/<scope>`) is neither contained in the base nor gone.\n\n' +
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

  // negative: losing the whole ledger refusal signal fails both of its rows
  const paNoLedgerSignal = fixture({
    'skills/plan/SKILL.md': planAppendBody.replace(
      "- The scope's run root exists with a ledger stage other than `shipped`, or with a `shipped` stage " +
        'whose scope branch (`<type>/<scope>`) is neither contained in the base nor gone.\n',
      '',
    ),
  });
  const paGapsNoLedgerSignal = scanContract(paNoLedgerSignal, PLAN_APPEND_CONTRACTS);
  assert.equal(paGapsNoLedgerSignal.length, 2, 'flags both ledger refusal signal rows');
  assert.ok(
    paGapsNoLedgerSignal.every((g) => /ledger refusal signal/.test(g.expectation)),
    'both gaps name the ledger signal',
  );

  // negative: losing only the first ledger clause (stage other than `shipped`) fails that row alone
  const paNoLedgerStage = fixture({
    'skills/plan/SKILL.md': planAppendBody.replace('a ledger stage other than `shipped`', 'a bad stage'),
  });
  const paGapsNoLedgerStage = scanContract(paNoLedgerStage, PLAN_APPEND_CONTRACTS);
  assert.equal(paGapsNoLedgerStage.length, 1, 'flags exactly the missing first ledger clause');
  assert.match(paGapsNoLedgerStage[0].expectation, /first clause/, 'names the first ledger clause');

  // negative: losing only the second ledger clause (branch neither merged nor gone) fails that row alone,
  // with the first clause's row silent
  const paNoLedgerBranch = fixture({
    'skills/plan/SKILL.md': planAppendBody.replace(
      'whose scope branch (`<type>/<scope>`) is neither contained in the base nor gone',
      'whose scope branch is anything',
    ),
  });
  const paGapsNoLedgerBranch = scanContract(paNoLedgerBranch, PLAN_APPEND_CONTRACTS);
  assert.equal(paGapsNoLedgerBranch.length, 1, 'flags exactly the missing second ledger clause');
  assert.match(paGapsNoLedgerBranch[0].expectation, /second clause/, 'names the second ledger clause');

  // acceptance mutation: gutting the real plan.md's refusal condition while leaving its rationale
  // sentence intact (the branch test explanation a few lines below still names "merged into the base, or
  // gone entirely") must still fail — this is the exact drift a rationale-anchored pattern misses.
  const realPlanBody = fs.readFileSync(docPath(realRoot, 'skills', 'plan', 'SKILL.md'), 'utf8');
  const guttedCondition = realPlanBody.replace(
    /whose scope branch \(`<type>\/<scope>`\) is neither contained in the base nor gone/,
    'whose scope branch is not shipped',
  );
  assert.notEqual(guttedCondition, realPlanBody, 'the mutation actually changed the condition sentence');
  const guttedGaps = scanContract(fixture({ 'skills/plan/SKILL.md': guttedCondition }), PLAN_APPEND_CONTRACTS);
  assert.equal(guttedGaps.length, 1, 'gutting the condition while keeping the rationale still fails');
  assert.match(guttedGaps[0].expectation, /second clause/, 'names the second ledger clause');

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
    'a plan.md carrying all six of its clauses yields zero gaps',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), PLAN_APPEND_CONTRACTS).length,
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

  // --- RUN_KIND_CONTRACTS: scope-mode.md specifies the branch step for each of the three run kinds —
  // `fresh` cuts from base (and stops, cutting nothing, when a scope-prune reap left a same-named branch
  // standing), `appended` reuses the branch only when base already contains its content, `resumed`
  // switches to it and cuts nothing (ADR 0028, ADR 0045). ADR 0053 added three rows: `appended`'s
  // **Present** branch delegating to `## Containment`, that section's own canonical statement of the
  // test, and the **No forcing flag** exception stated as conditional on the containment proof. A fix
  // cycle added an eighth: the scope worktree must be clean before `appended` re-points a contained
  // branch with `git reset --hard <base>`, because the containment proof covers the branch's committed
  // history and says nothing about the index or working tree (Important 2). Eight independent rows:
  // losing one clause's specification fails on its own, not just in aggregate. ---

  const runKindBody =
    '## Containment\n\n' +
    'A scope branch has reached base when merging it into base would change nothing.\n\n' +
    '```sh\ntree=$(git merge-tree --write-tree <base> <branch>) && ' +
    '[ "$tree" = "$(git rev-parse <base>^{tree})" ]\n```\n\n' +
    'Equal tree is contained; a differing tree and a conflict exit are not. `--write-tree` needs git ' +
    '2.38, and an older git falls back to `git merge-base --is-ancestor` and says so.\n\n' +
    '## Cutting the scope branch\n\n' +
    '- **`fresh`** — no ledger existed, so the scope branch does not exist either. Cut it from ' +
    '`<base>`. **The name already exists** — a scope-prune reap left it standing. Stop, name the ' +
    'branch found, and cut nothing.\n' +
    '- **`appended`** — a `shipped` ledger was rotated aside. Decide on the same test that decides a ' +
    'scope is finished with (ADR 0007): contained in `<base>`, or gone entirely. Gone → cut fresh. ' +
    '**Present** — decide with `## Containment` above, which owns the test. **Contained** — ' +
    'work in the scope worktree, then check the worktree is clean: `git -C .superdev/scopes/<scope>/' +
    'worktree status --porcelain` returns nothing. The containment proof above covers the branch\'s ' +
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
      'no ledger existed, so the scope branch does not exist either. Cut it from `<base>`. ',
      '',
    ),
  });
  const rkGapsNoFresh = scanContract(rkNoFresh, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoFresh.length, 1, 'flags exactly the missing `fresh` cut-from-base clause');
  assert.match(rkGapsNoFresh[0].expectation, /`fresh` run kind/, 'names the `fresh` run kind');

  // negative: losing the `fresh` existing-name stop clause fails on its own
  const rkNoFreshStop = fixture({
    'references/scope-mode.md': runKindBody.replace(
      ' **The name already exists** — a scope-prune reap left it standing. Stop, name the branch ' +
        'found, and cut nothing.',
      '',
    ),
  });
  const rkGapsNoFreshStop = scanContract(rkNoFreshStop, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoFreshStop.length, 1, 'flags exactly the missing `fresh` existing-name stop clause');
  assert.match(rkGapsNoFreshStop[0].expectation, /`fresh` run kind/, 'names the `fresh` run kind');

  // negative: losing the `appended` contained-or-gone clause fails on its own
  const rkNoAppended = fixture({
    'references/scope-mode.md': runKindBody.replace(
      'Decide on the same test that decides a scope is finished with (ADR 0007): contained in ' +
        '`<base>`, or gone entirely. Gone → cut fresh. ',
      '',
    ),
  });
  const rkGapsNoAppended = scanContract(rkNoAppended, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoAppended.length, 1, 'flags exactly the missing `appended` contained-or-gone clause');
  assert.match(rkGapsNoAppended[0].expectation, /`appended` run kind/, 'names the `appended` run kind');

  // negative: `appended`'s **Present** branch naming a git command of its own, instead of delegating to
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

  // negative: dropping the clean-worktree guard ahead of the contained `appended` re-point fails on its
  // own — the reset would then discard an uncommitted change the containment proof never vouched for
  // (Important 2)
  const rkNoCleanGuard = fixture({
    'references/scope-mode.md': runKindBody.replace(
      'work in the scope worktree, then check the worktree is clean: `git -C .superdev/scopes/<scope>/' +
        'worktree status --porcelain` returns nothing. The containment proof above covers the branch\'s ' +
        'committed history, never the index or the working tree. **Dirty** — name what `status ' +
        '--porcelain` reported and stop, cutting nothing. **`--unattended` →\nblock**. **Clean** — ' +
        're-point it.',
      'work in the scope worktree, then re-point it.',
    ),
  });
  const rkGapsNoCleanGuard = scanContract(rkNoCleanGuard, RUN_KIND_CONTRACTS);
  assert.equal(rkGapsNoCleanGuard.length, 1, 'flags exactly the missing clean-worktree guard');
  assert.match(
    rkGapsNoCleanGuard[0].expectation,
    /require the scope worktree clean/,
    'names the clean-worktree guard the re-point owes',
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

  // --- CONTAINMENT_DELEGATION_CONTRACTS: publish-kb §3 names the test it runs by delegating to
  // scope-mode.md's `## Containment` section, and restates no git command of its own (ADR 0053). The
  // pattern is a presence check that fires when §3 drops the delegating pointer; it does not assert
  // the case where §3 keeps the pointer while restating the git command, because the pattern cannot
  // see both forms at once. ---

  const mergeCheckBody =
    '## 3. Merge check — warn once, never block\n\n' +
    'Find the scope branch per that file\'s `## The scope branch` section.\n\n' +
    'Then decide whether the base branch already holds it, per ' +
    '`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`\'s `## Containment` section, which owns the ' +
    'test.\n\n' +
    '**Not contained**, or **no branch resolves at all** → ask once whether to publish anyway.\n';

  // negative: §3 dropping the delegation and reaching for an ancestry test of its own
  const cdNoPointer = fixture({
    'skills/publish-kb/SKILL.md': mergeCheckBody.replace(
      "Then decide whether the base branch already holds it, per " +
        "`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Containment` section, which owns the " +
        'test.',
      'Check whichever branch resolved against the base branch with ' +
        '`git merge-base --is-ancestor <branch> <base>`.',
    ),
  });
  const cdGapsNoPointer = scanContract(cdNoPointer, CONTAINMENT_DELEGATION_CONTRACTS);
  assert.equal(cdGapsNoPointer.length, 1, 'flags a §3 that names its own test instead of delegating');
  assert.match(
    cdGapsNoPointer[0].expectation,
    /delegating to `references\/scope-mode\.md`'s `## Containment` section/,
    'names the section §3 owes its delegation to',
  );

  // negative: §3 mentioning the section in passing, without naming it as where the test lives, is not a
  // delegation — this is the shape a restatement drifts into
  const cdBareMention = fixture({
    'skills/publish-kb/SKILL.md': mergeCheckBody.replace(
      "Then decide whether the base branch already holds it, per " +
        "`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Containment` section, which owns the " +
        'test.',
      'Containment is described in the `## Containment` section. Run ' +
        '`git merge-tree --write-tree <base> <branch>` and compare the tree.',
    ),
  });
  assert.equal(
    scanContract(cdBareMention, CONTAINMENT_DELEGATION_CONTRACTS).length,
    1,
    'a bare mention beside a restated command is not a delegation',
  );

  // negative: §3 naming a different, closer file (`docs/agents/code-management.md`) right before the
  // containment delegation, then pointing at "that same file's `## Containment` section" — the closer
  // antecedent is the wrong file, so the delegation resolves to a document with no such section, exactly
  // the ambiguity `plugin/skills/publish-kb/SKILL.md` §3 carried (Important 1). A pattern that only
  // required the section name and "owns the test", with no `scope-mode.md` anchor, could not see this.
  const cdWrongAntecedent = fixture({
    'skills/publish-kb/SKILL.md': mergeCheckBody.replace(
      "Then decide whether the base branch already holds it, per " +
        "`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Containment` section, which owns the " +
        'test.',
      "Then decide whether the base branch named in `docs/agents/code-management.md` already holds " +
        "that branch's work, per that same file's `## Containment` section, which owns the test.",
    ),
  });
  assert.equal(
    scanContract(cdWrongAntecedent, CONTAINMENT_DELEGATION_CONTRACTS).length,
    1,
    'a delegation reading "that same file" past a closer, wrong file reference is not a delegation to scope-mode.md',
  );

  // positive: a §3 that delegates yields zero gaps
  assert.equal(
    scanContract(
      fixture({ 'skills/publish-kb/SKILL.md': mergeCheckBody }),
      CONTAINMENT_DELEGATION_CONTRACTS,
    ).length,
    0,
    'a §3 delegating to `## Containment` yields zero gaps',
  );

  // absent file is skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), CONTAINMENT_DELEGATION_CONTRACTS).length,
    0,
    'absent file is skipped',
  );

  // --- CONTAINMENT_REFETCH_CONTRACTS: the `## Containment` section refetches the base before it answers
  // not contained (ADR 0065). The four rows are pinned apart because each fails on its own: a second pass
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
