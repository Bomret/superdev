import { test, expect } from 'claude-code/testing'
import { FIXTURES } from './attribution-fixtures'
import { attribute, ctxOf, mask, target } from './live'

const ROOTS: Record<string, string> = { A: '/r/.superdev/scopes/a', B: '/r/.superdev/scopes/b', NOLEDGER: '/r/.superdev/scopes/nope' }
const hasLedger = (root: string) => root !== ROOTS.NOLEDGER

test('attributes every shared fixture as the run trace does (INV-0136)', () => {
  for (const f of FIXTURES) {
    const prompt = f.prompt.replace(/\{(A|B|NOLEDGER)\}/g, (_, k: string) => ROOTS[k] ?? '')
    const got = attribute(prompt, hasLedger)
    expect(got ? { root: got.root, slice: got.slice } : null).toEqual(f.root ? { root: ROOTS[f.root], slice: f.slice } : null)
  }
})

test('names the scope by its run-root slug', () => {
  expect(attribute(`${ROOTS.A}/slicetrees/02`, hasLedger)?.scope).toBe('a')
})

test('a tool call shows its tool and a short target, never written contents', () => {
  expect(target('Read', { file_path: '/x/a.ts' })).toBe('Read /x/a.ts')
  expect(target('Write', { file_path: '/x/b.ts', content: 'SECRET body' })).toBe('Write /x/b.ts')
  expect(target('Edit', { file_path: '/x/c.ts', old_string: 'a', new_string: 'b' })).toBe('Edit /x/c.ts')
  expect(target('Grep', { pattern: 'foo.*' })).toBe('Grep foo.*')
  expect(target('Glob', { pattern: '**/*.md' })).toBe('Glob **/*.md')
  expect(target('Bash', { command: 'x'.repeat(80) })).toBe(`Bash ${'x'.repeat(60)}`)
  expect(target('WebSearch', { query: 'q' })).toBe('WebSearch')
  expect(target('Read', undefined)).toBe('Read')
})

test('masks secrets in a shown command', () => {
  expect(mask('GITEA_TOKEN=abc curl -H "Authorization: Bearer xyz" https://h')).toBe('GITEA_TOKEN=*** curl -H "Authorization: Bearer ***" https://h')
  expect(mask('export api_key=k1 db_password="p w" my_Secret=s')).toBe('export api_key=*** db_password=*** my_Secret=***')
  expect(mask('curl -H "authorization: token t0k"')).toBe('curl -H "authorization: token ***"')
  expect(mask('echo bearer abc')).toBe('echo bearer ***')
  expect(mask('TOKEN=t KEY=k ls')).toBe('TOKEN=*** KEY=*** ls')
  expect(mask('PATH=/bin ls')).toBe('PATH=/bin ls')
})

test('ctx sums uncached input, cache read, and cache creation', () => {
  const usage = { input_tokens: 10, output_tokens: 99, cache_read_input_tokens: 200, cache_creation_input_tokens: 3 }
  expect(ctxOf(usage)).toBe(213)
  expect(ctxOf(null)).toBe(null)
  expect(ctxOf(undefined)).toBe(null)
})
