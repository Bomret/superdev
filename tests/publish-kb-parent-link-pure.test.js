'use strict';

// Suite for plugin/scripts/publish-kb.js: the pure `addParentLink` and `removeParentLink` exports under
// `- **Hierarchy:** links` (ADR 0168, INV-0170): where the link lands, what a delete keeps, and the two
// linear-time pins (ADR 0086, ADR 0149) that measure through tests/linear-time.js. No backend is spawned,
// so the file times no spawn.

const assert = require('node:assert');
const { publishKbPath } = require('./publish-kb-setup');

// removing a section's only list item also drops the blank line the add set above it, and the line end it
// appended to an unterminated last heading: add then remove restores the parent byte for byte. A prose line right
// below the heading keeps one blank line above it after the first cycle, and every later cycle returns those bytes.
{
  const { addParentLink, removeParentLink } = require(publishKbPath);
  const lineFor = () => ({ ok: true, line: '- [Child](Child) — desc' });
  const cycle = (body) => removeParentLink(addParentLink(body, 'Guides', lineFor, 'Child').body, 'Guides', 'Child').body;
  for (const [what, body] of [
    ['an empty section', 'Intro.\n\n## Guides\n\n## Other\n\n- [Z](Z)\n'],
    ['a last heading with no line end', 'Intro.\n\n## Guides'],
    ['CRLF line ends', 'Intro.\r\n\r\n## Guides\r\n\r\n## Other\r\n'],
  ]) {
    assert.equal(cycle(body), body, `${what}: add then remove restores the parent`);
  }
  const once = cycle('Intro.\n\n## Guides\nSome text.\n');
  assert.equal(once, 'Intro.\n\n## Guides\n\nSome text.\n', 'a section of prose keeps one blank line below its heading');
  assert.equal(cycle(once), once, 'a second cycle over a section of prose returns the same bytes');
}

// the link joins the named section's own list, ahead of any subsection: a list under a `###` inside the section is
// no anchor, and a section with no list of its own opens one below its heading
{
  const { addParentLink } = require(publishKbPath);
  const lineFor = () => ({ ok: true, line: '- [C](c)' });
  const add = (body) => addParentLink(body, 'Guides', lineFor, 'C').body;
  assert.equal(
    add('## Guides\n\n- [A](a)\n\n### Advanced\n\n- [B](b)\n\n## Other\n'),
    '## Guides\n\n- [A](a)\n- [C](c)\n\n### Advanced\n\n- [B](b)\n\n## Other\n',
    'the link follows the section\'s own last item, not a subsection\'s',
  );
  assert.equal(
    add('## Guides\n\nText.\n\n### Advanced\n\n- [B](b)\n'),
    '## Guides\n\n- [C](c)\n\nText.\n\n### Advanced\n\n- [B](b)\n',
    'a section whose only list sits in a subsection opens its own list below the heading',
  );
}

// the link follows every line the last top-level item carries: a nested item, a continuation line, or a fenced code
// block indented to the item's content column belongs to it across blank lines, and so does a lazy continuation line
// right below its text; a blank-separated line indented less is no part of it
{
  const { addParentLink } = require(publishKbPath);
  const lineFor = () => ({ ok: true, line: '- [C](c)' });
  const add = (body) => addParentLink(body, 'Guides', lineFor, 'C').body;
  assert.equal(
    add('## Guides\n\n- A\n\n    - A1\n\n## Other\n'),
    '## Guides\n\n- A\n\n    - A1\n- [C](c)\n\n## Other\n',
    'a blank-separated nested item stays under the last item, and the link follows it',
  );
  assert.equal(
    add('## Guides\n\n- A\n\nA paragraph.\n'),
    '## Guides\n\n- A\n- [C](c)\n\nA paragraph.\n',
    'a blank-separated paragraph below the list stays outside it, and the link lands above it',
  );
  assert.equal(
    add('## Guides\n\n- A\n\n  ```\n  code\n  ```\n'),
    '## Guides\n\n- A\n\n  ```\n  code\n  ```\n- [C](c)\n',
    'a fenced code block indented under the last item stays under it, and the link follows its closing fence',
  );
  assert.equal(
    add('## Guides\n\n- A\n\n  ```\ncode\n  ```\n'),
    '## Guides\n\n- A\n\n  ```\ncode\n  ```\n- [C](c)\n',
    'a fence the last item opens is carried to its closing fence, so the link never lands inside it',
  );
  assert.equal(
    add('## Guides\n\n- A\n  - A1\n\n  more A text\n'),
    '## Guides\n\n- A\n  - A1\n\n  more A text\n- [C](c)\n',
    'a two-space nested item is no anchor: the link follows the paragraph its top-level item carries',
  );
  assert.equal(
    add('## Guides\n\n- A\n - B\n'),
    '## Guides\n\n- A\n - B\n- [C](c)\n',
    'an item indented less than the item above it is that item\'s sibling, and the link follows it',
  );
  assert.equal(
    add('## Guides\n\n- A\nlazy\n'),
    '## Guides\n\n- A\nlazy\n- [C](c)\n',
    'a lazy continuation line right below the item continues its paragraph, and the link follows it',
  );
  assert.equal(
    add('## Guides\n\n- A\n```\ncode\n```\n'),
    '## Guides\n\n- A\n- [C](c)\n```\ncode\n```\n',
    'a fence opener indented less than the item\'s content column ends the item, and the link lands above the fence',
  );
  assert.equal(
    add('## Guides\n\n-\tA\n\n    more\n'),
    '## Guides\n\n-\tA\n\n    more\n- [C](c)\n',
    'a tab after the marker reaches the next tab stop, column 4, so a paragraph indented four spaces stays under the item',
  );
}

// a parent that links the page under another section already links it: the add writes nothing (ADR 0168)
{
  const { addParentLink } = require(publishKbPath);
  const out = addParentLink('## Other\n\n- [C](c)\n\n## Guides\n\n- [A](a)\n', 'Guides', () => ({ ok: true, line: '- [C](c)' }), 'C');
  assert.equal(out.changed, false, 'a link under another section counts as linked');
}

// a delete keeps the structure around the removed line: an item that carries a nested item, a continuation line,
// a lazy continuation line, or fenced code stays and is reported kept, and an item with another top-level item beside it is no only item
{
  const { removeParentLink, addParentLink } = require(publishKbPath);
  for (const [what, body, line] of [
    ['a nested child item', '## Guides\n\n- [Child](x)\n    - [Grand](y)\n', '- [Child](x)'],
    ['a nested child item after a blank line', '## Guides\n\n- [Child](x)\n\n  - [Grand](y)\n', '- [Child](x)'],
    ['a continuation line', '## Guides\n\n- [A](a)\n- [Child](x)\n  more text\n', '- [Child](x)'],
    ['a fenced code block', '## Guides\n\n- [Child](x)\n\n  ```\n  code\n  ```\n', '- [Child](x)'],
    ['a lazy continuation line', '## Guides\n\n- [Child](x)\nlazy\n', '- [Child](x)'],
    ['a continuation paragraph at the tab stop a tab after the marker reaches', '## Guides\n\n-\t[Child](x)\n\n    more\n', '-\t[Child](x)'],
  ]) {
    const out = removeParentLink(body, 'Guides', 'Child');
    assert.equal(out.changed, false, `${what}: the item stays`);
    assert.deepEqual(out.kept, [line], `${what}: the item is reported kept`);
  }
  assert.equal(
    removeParentLink('## Guides\n\n- [Child](x)\n- [A](a)\n    - [Grand](y)\n', 'Guides', 'Child').body,
    '## Guides\n\n- [A](a)\n    - [Grand](y)\n',
    'a section with another top-level item keeps the blank line below the heading',
  );
  const lineFor = () => ({ ok: true, line: '- [C](c)' });
  const body = '## Guides\n\n### Advanced\n\n- [B](b)\n';
  assert.equal(
    removeParentLink(addParentLink(body, 'Guides', lineFor, 'C').body, 'Guides', 'C').body,
    body,
    'add then remove restores a section whose only list sits in a subsection',
  );
}

// Linear time (ADR 0086, ADR 0149): a parent line of unclosed brackets four times as long takes about four times as long to
// read for links when linear, sixteen times when quadratic; the ceiling sits at nine, between them. The capped scan
// still finds every link shape it found before. Each unit also opens a capped link-text run, a linear cost that hides a
// quadratic one on a short line, so the input starts at 6000 units, where a quadratic run dominates.
{
  const { removeParentLink } = require(publishKbPath);
  const { timePair, cpuNs } = require('./linear-time');
  const scan = (body) => removeParentLink(body, 'How it works', 'Child');
  for (const unit of ['[', '[[', '[a][', '[a](', '[[a|']) {
    const make = (n) => `## How it works\n\n- ${unit.repeat(n)}\n`;
    let n = 6000;
    for (let t0 = cpuNs(); n < 200000; n *= 2, t0 = cpuNs()) {
      scan(make(n));
      if (cpuNs() - t0 >= 25e6) break;
    }
    const [base, big] = timePair(scan, make(n), make(n * 4));
    assert.ok(big < 9 * base, `${unit} run stays about linear: ${base}ns at ${n}, four times the input ${big}ns`);
  }
  const body = '## How it works\n\n- [A](A)\n- [**Child**](x) — d\n- See [Child][c] and [[Child|c]] and [Child](y)\n';
  const out = scan(body);
  assert.equal(out.body, '## How it works\n\n- [A](A)\n- See [Child][c] and [[Child|c]] and [Child](y)\n', 'the single-link line is removed');
  assert.deepEqual(out.kept, ['- See [Child][c] and [[Child|c]] and [Child](y)'], 'the reference, wiki, and inline links are still found');
  assert.deepEqual(scan('## How it works\n\n- See [Child][c]\n- [[Child]]\n').kept, ['- See [Child][c]', '- [[Child]]'], 'each link shape alone');
}

// Linear time (ADR 0086, ADR 0149): a parent heading line four times as long takes about four times as long to read for
// its heading text when linear, sixteen times when quadratic, on the remove path and the add path alike; the ceiling
// sits at nine, between them.
{
  const { removeParentLink, addParentLink } = require(publishKbPath);
  const { timePair, cpuNs } = require('./linear-time');
  const scans = {
    remove: (body) => removeParentLink(body, 'How it works', 'Child'),
    add: (body) => addParentLink(body, 'How it works', () => ({ ok: true, line: '- [Child](Child)' }), 'Child'),
  };
  for (const [path, scan] of Object.entries(scans)) {
    for (const unit of [' ', ' #']) {
      const make = (n) => `## How it works\n\n- [A](A)\n# a${unit.repeat(n)}b\n`;
      let n = 2000;
      for (let t0 = cpuNs(); n < 200000; n *= 2, t0 = cpuNs()) {
        scan(make(n));
        if (cpuNs() - t0 >= 25e6) break;
      }
      const [base, big] = timePair(scan, make(n), make(n * 4));
      assert.ok(big < 9 * base, `${path} over a heading of ${JSON.stringify(unit)} runs stays about linear: ${base}ns at ${n}, four times the input ${big}ns`);
    }
  }
  const add = addParentLink;
  const lineFor = () => ({ ok: true, line: '- [Child](Child)' });
  for (const heading of ['## How it works', '## How it works ##', '  ## How it works  #  ', '##\tHow it works']) {
    assert.equal(add(`${heading}\n\n- [A](A)\n`, 'How it works', lineFor, 'Child').changed, true, `${JSON.stringify(heading)} is read as the section`);
  }
  for (const heading of ['## How it works#', '##How it works', '####### How it works']) {
    assert.equal(add(`${heading}\n\n- [A](A)\n`, 'How it works', lineFor, 'Child').ok, false, `${JSON.stringify(heading)} is no heading "How it works"`);
  }
}

console.log('publish-kb-parent-link-pure.test.js: all assertions passed');
