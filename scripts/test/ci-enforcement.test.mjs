import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { classifyPaths, comparisonForEvent, classifyGitOutput, collectScope } from '../ci-scope.mjs'
import { BUILD_GROUPS, evaluateAcceptance } from '../ci-acceptance.mjs'

const base = 'a'.repeat(40), head = 'b'.repeat(40), merge = 'c'.repeat(40)
const fixture = docs => ({ scope: { result: 'success', outputs: { full: docs ? 'false' : 'true', reason: docs ? 'documentation-only' : 'runtime-or-package-change', changed_files: '1' } },
  ...Object.fromEntries(BUILD_GROUPS.map(name => [name, { result: docs ? 'skipped' : 'success' }])) })

test('only non-packaged documentation can use the lightweight path', () => {
  assert.equal(classifyPaths(['README.md', 'docs/install/windows.md', 'CONTRIBUTING.md']).full, false)
  for (const path of ['LICENSE', 'packages/core/README.md', 'packs/starter/init/AGENTS.md', 'docs/example.mjs',
    'docs/github-main-protection.json', '.github/workflows/ci.yml', 'pnpm-lock.yaml', 'scripts/ci-scope.mjs']) {
    assert.equal(classifyPaths(['README.md', path]).full, true, path)
  }
})

test('unknown, empty, unsafe and ambiguous path evidence cannot skip builds', () => {
  for (const paths of [undefined, [], ['docs/../package.json'], ['docs//note.md'], ['C:/docs/note.md'],
    ['/docs/note.md'], ['docs\\note.md'], ['docs/line\nbreak.md'], ['docs/./note.md'], [null]]) {
    assert.equal(classifyPaths(paths).full, true)
  }
  assert.equal(classifyPaths(Array(10_001).fill('README.md')).full, true)
})

test('NUL-delimited Git output preserves removed runtime files during a rename', () => {
  assert.equal(classifyGitOutput('README.md\0docs/install.md\0').full, false)
  assert.equal(classifyGitOutput('packages/core/src/index.ts\0docs/example.md\0').full, true)
  for (const value of ['', 'README.md', 'README.md\0\0']) assert.equal(classifyGitOutput(value).full, true)
})

test('PR comparisons use base and head even when checkout SHA is a synthetic merge', () => {
  assert.deepEqual(comparisonForEvent('pull_request', { pull_request: { base: { sha: base }, head: { sha: head } } }, merge),
    { base, head, threeDot: true })
  assert.deepEqual(comparisonForEvent('push', { before: base, after: head }, head), { base, head, threeDot: false })
})

test('missing, initial, deleted, mismatched and hostile revisions fall back to full verification', () => {
  for (const [eventName, event, sha] of [
    ['push', { before: '0'.repeat(40), after: head }, head], ['push', { before: base, after: head, deleted: true }, head],
    ['push', { before: base, after: head }, merge], ['pull_request', { pull_request: { base: { sha: '--help' }, head: { sha: head } } }, merge],
    ['workflow_dispatch', {}, head], ['push', {}, head], ['push', { before: base, after: head }, 'not-a-sha'],
  ]) assert.equal(comparisonForEvent(eventName, event, sha), null)
  assert.equal(collectScope({ eventName: 'unknown', event: {}, sha: head }).full, true)
  assert.equal(collectScope({ eventName: 'push', event: { before: base, after: head }, sha: head, cwd: tmpdir() }).full, true)
})

test('full acceptance needs every build group, including both platform matrices', () => {
  assert.equal(evaluateAcceptance(fixture(false)).accepted, true)
  for (const name of BUILD_GROUPS) for (const result of ['failure', 'skipped', 'cancelled', 'pending', undefined]) {
    const needs = fixture(false); needs[name].result = result
    assert.equal(evaluateAcceptance(needs).accepted, false, `${name}: ${result}`)
  }
})

test('documentation acceptance permits only intentional skips after successful path classification', () => {
  assert.equal(evaluateAcceptance(fixture(true)).accepted, true)
  for (const result of ['failure', 'cancelled', 'success', undefined]) {
    const needs = fixture(true); needs.e2e.result = result
    assert.equal(evaluateAcceptance(needs).accepted, false)
  }
  for (const patch of [{ full: 'False' }, { reason: 'comparison-unavailable' }, { changed_files: '0' }]) {
    const needs = fixture(true); Object.assign(needs.scope.outputs, patch)
    assert.equal(evaluateAcceptance(needs).accepted, false)
  }
})

test('failed or absent scope evidence cannot turn skipped jobs into acceptance', () => {
  assert.equal(evaluateAcceptance({}).accepted, false)
  assert.equal(evaluateAcceptance(null).accepted, false)
  for (const result of ['failure', 'skipped', 'cancelled']) {
    const needs = fixture(true); needs.scope.result = result
    assert.equal(evaluateAcceptance(needs).accepted, false)
  }
})

test('scope CLI emits a bounded full fallback when event evidence is malformed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'creator-ci-scope-'))
  const event = join(dir, 'event.json'), output = join(dir, 'output')
  try {
    writeFileSync(event, '{broken')
    const result = spawnSync(process.execPath, ['scripts/ci-scope.mjs'], { encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: 'push', GITHUB_SHA: head, GITHUB_OUTPUT: output } })
    assert.equal(result.status, 0)
    assert.equal(JSON.parse(result.stdout).full, true)
    assert.equal(readFileSync(output, 'utf8'), 'full=true\nreason=comparison-unavailable\nchanged_files=0\n')
  } finally { rmSync(event, { force: true }); rmSync(output, { force: true }); rmdirSync(dir) }
})

test('acceptance CLI fails closed for missing or malformed results', () => {
  for (const input of ['', '{broken', JSON.stringify(fixture(false)), JSON.stringify(fixture(true))]) {
    const result = spawnSync(process.execPath, ['scripts/ci-acceptance.mjs'], { encoding: 'utf8', env: { ...process.env, CI_NEEDS_JSON: input } })
    assert.equal(result.status, input.startsWith('{"scope"') ? 0 : 1)
    assert.equal(JSON.parse(result.stdout).accepted, result.status === 0)
  }
})
