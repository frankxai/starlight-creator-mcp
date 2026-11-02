import test from 'node:test'
import assert from 'node:assert/strict'
import { assessReadiness, collectReadiness, REQUIRED_CHECKS, REPOSITORY } from '../check-release-readiness.mjs'
import { targets } from '../release-contract.mjs'

function fixture() {
  const head = 'a'.repeat(40), mainSha = 'b'.repeat(40)
  return {
    head, mainSha, dirty: false,
    repository: { full_name: REPOSITORY, default_branch: 'main', visibility: 'public' },
    pullRequest: { headRefOid: head, baseRefOid: mainSha, baseRefName: 'main', isDraft: false, isCrossRepository: false,
      statusCheckRollup: REQUIRED_CHECKS.map(name => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' })) },
    protection: { state: 'ok', value: { enforce_admins: { enabled: true }, required_status_checks: { strict: true, contexts: REQUIRED_CHECKS } } },
    rules: [], environment: { protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User' }] }], deployment_branch_policy: { custom_branch_policies: true } },
    branchPolicies: [{ name: 'main', type: 'branch' }],
    packages: targets.map(target => ({ name: target.name, version: '0.1.0', repository: { type: 'git', url: 'https://github.com/' + REPOSITORY + '.git', directory: target.directory } })),
  }
}
const state = (value, id) => assessReadiness(value).checks.find(check => check.id === id).state

test('complete metadata still cannot authorize publication or attest independent review', () => {
  const result = assessReadiness(fixture())
  assert.equal(result.status, 'external_gates_pending')
  assert.equal(result.canPublish, false)
  assert.ok(result.manualGates.some(gate => gate.startsWith('Actual npm trusted publisher')))
})

test('draft-skipped, pending, failed and duplicate check results cannot pass acceptance', () => {
  for (const conclusion of ['SKIPPED', 'FAILURE', 'CANCELLED', undefined]) {
    const value = fixture(); value.pullRequest.statusCheckRollup[0].conclusion = conclusion
    assert.equal(state(value, 'required-checks'), 'fail')
  }
  const duplicate = fixture(); duplicate.pullRequest.statusCheckRollup.push({ name: REQUIRED_CHECKS[0], status: 'IN_PROGRESS', conclusion: '' })
  assert.equal(state(duplicate, 'required-checks'), 'fail')
  const draft = fixture(); draft.pullRequest.isDraft = true
  assert.equal(state(draft, 'review-state'), 'fail')
})

test('stale, dirty, forked and moved source or base remain blocked', () => {
  for (const patch of [{ head: 'c'.repeat(40) }, { dirty: true }, { head: 'not-a-sha' }]) {
    assert.equal(state({ ...fixture(), ...patch }, 'candidate-source'), 'fail')
  }
  const fork = fixture(); fork.pullRequest.isCrossRepository = true
  assert.equal(state(fork, 'candidate-source'), 'fail')
  const moved = fixture(); moved.mainSha = 'c'.repeat(40)
  assert.equal(state(moved, 'receiving-main'), 'unknown')
})

test('missing protection and unavailable permission evidence have different failure states', () => {
  assert.equal(state({ ...fixture(), protection: { state: 'missing' } }, 'main-protection'), 'fail')
  assert.equal(state({ ...fixture(), protection: { state: 'unavailable' }, rules: undefined }, 'main-protection'), 'unknown')
  assert.equal(state({ ...fixture(), protection: { state: 'missing' }, rules: [{ type: 'required_status_checks' }] }, 'main-protection'), 'unknown')
  const incomplete = fixture(); incomplete.protection.value.required_status_checks.contexts = []
  assert.equal(state(incomplete, 'main-protection'), 'fail')
})

test('review and branch environment checks require actual observed settings', () => {
  assert.equal(state({ ...fixture(), environment: {} }, 'environment-review'), 'fail')
  assert.equal(state({ ...fixture(), branchPolicies: [{ name: '*', type: 'branch' }] }, 'environment-branch'), 'unknown')
  assert.equal(state({ ...fixture(), branchPolicies: undefined }, 'environment-branch'), 'unknown')
})

test('private sources, package collisions and GitHub registry redirects are rejected', () => {
  const privateRepo = fixture(); privateRepo.repository.visibility = 'private'
  assert.equal(state(privateRepo, 'canonical-repository'), 'fail')
  const redirect = fixture(); redirect.packages[0].publishConfig = { registry: 'https://npm.pkg.github.com' }
  assert.equal(state(redirect, 'package-destinations'), 'fail')
  const duplicate = fixture(); duplicate.packages[0] = duplicate.packages[1]
  assert.equal(state(duplicate, 'package-destinations'), 'fail')
})

test('malformed PR identifiers are denied before invoking GitHub or git', () => {
  for (const value of ['0', '-1', '12; other', '--help', '01']) assert.throws(() => collectReadiness('.', value), /positive PR number/)
})
