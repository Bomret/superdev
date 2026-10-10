import { test, expect } from 'claude-code/testing'
import { esc, pipeline, scopeMap, tiles } from './svg'
import { frontmatter, intent, progress } from './parse'

const scope = (name: string, stage: string) => ({
  name, stage, branch: 'b', anchor: 'a', lockMtime: null, dod: { done: 1, total: 4 }, slicetrees: [],
  slices: [{ id: '01', title: 'T <&>', status: 'in-progress' }],
  agents: [{ key: 'k', type: 'superdev:implementer', desc: 'd', slice: '01', isDone: false }],
})

test('escapes markup in every drawn string', () => {
  expect(esc(`<a & "b">`)).toBe('&lt;a &amp; &quot;b&quot;&gt;')
  expect(scopeMap(scope('s', 'implementing')).source).not.toMatch(/T <&>/)
})

test('an agent on a slice the ledger lacks draws in the scope-level lane', () => {
  const s = { ...scope('s', 'implementing'), agents: [{ key: 'k', type: 'superdev:implementer', desc: 'orphan', slice: '09', isDone: false }] }
  expect(scopeMap(s).source).toMatch(/>orphan</)
})

test('pipeline counts closed scopes and pills the active ones', () => {
  const d = pipeline([scope('live-one', 'implementing'), scope('old', 'closed')])
  expect(d.source).toMatch(/✓ 1</)
  expect(d.source).toMatch(/>live-one</)
  expect(d.source).not.toMatch(/>old</)
})

test('tiles show only the areas present', () => {
  const d = tiles({ root: '/r', assignees: null, intents: [], scopes: null, kbPending: null, designs: null, drafts: [] })
  expect(d.source).toMatch(/brainstorm/)
  expect(d.source).not.toMatch(/info\.json|kb-pending/)
})

test('parses dod progress, intents, and staged page frontmatter', () => {
  expect(progress('- [x] a\n- [ ] b\n  - [X] c\n')).toEqual({ done: 2, total: 3 })
  expect(intent('x', '# Intent: Help\n\n**Status: ready to plan.** more')).toEqual({ name: 'x', title: 'Help', status: 'ready to plan', isDraft: false })
  expect(frontmatter('---\ntitle: "Page"\naction: patch\n---\nbody')).toEqual({ title: 'Page', action: 'patch' })
})
