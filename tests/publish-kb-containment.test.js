'use strict';

// Suite for the parsers of `docs/agents/code-management.md` that plugin/scripts/publish-kb.js exports: the base branch and
// remote bullets.

const assert = require('node:assert');
const { publishKbPath } = require('./publish-kb-setup');
const { parseBaseBranch, parseRemote } = require(publishKbPath);

// --- parseBaseBranch also decodes the colon-outside-bold spelling both seed templates ship --------
{
  const base = parseBaseBranch('# Code host\n\n- **Base branch**: `develop`.\n');
  assert.equal(base, 'develop');
}

// --- parseRemote takes the first token of the `- **Remote:**` bullet, unlike parseBaseBranch's ------
// whitespace rejection: every shipped Remote bullet carries a trailing sentence.
{
  assert.equal(parseRemote('# Code host\n\n- **Remote:** `upstream`.\n'), 'upstream');
  assert.equal(parseRemote('# Code host\n\n- **Remote**: `upstream`.\n'), 'upstream', 'the colon-outside-bold spelling too');
  assert.equal(parseRemote('# Code host\n\nno remote bullet here.\n'), null, 'absent bullet -> null, not a refusal');
  assert.equal(
    parseRemote('# Code host\n\n- **Remote:** `origin`. Confirm with `git remote -v`.\n'),
    'origin',
    'the real shipped bullet shape (docs/agents/code-management.md and both seeds) carries a trailing sentence',
  );
  assert.equal(parseRemote(null), null);
}

console.log('publish-kb-containment.test.js: all assertions passed');
