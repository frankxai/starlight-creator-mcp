import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { targets } from './release-contract.mjs'

export const REPOSITORY = 'frankxai/starlight-creator-mcp'
export const ACCEPTANCE_CHECK = 'acceptance'
// Observed on this repository's GitHub Actions check runs, 2 November 2026.
export const ACTIONS_APP_ID = 15368
export const REQUIRED_CHECKS = [
  'typecheck-unit', 'storage-runtime (22)', 'storage-runtime (24)',
  'release-artifacts (ubuntu-latest)', 'release-artifacts (windows-latest)',
  'published-bytes-windows', 'e2e (ubuntu-latest)', 'e2e (windows-latest)',
  ACCEPTANCE_CHECK,
]

// Diagnostic only. Public API metadata cannot attest npm trust or an independent review.
export function assessReadiness(evidence) {
  const checks = []
  const add = (id, state, detail) => checks.push({ id, state, detail })
  const remote = evidence.repository
  add('canonical-repository', remote?.full_name === REPOSITORY && remote.default_branch === 'main'
    && remote.visibility === 'public' ? 'pass' : 'fail', 'Canonical public source is required for this npm provenance path')

  const pr = evidence.pullRequest
  const sameSource = /^[a-f0-9]{40}$/.test(evidence.head ?? '') && pr?.headRefOid === evidence.head
    && pr.baseRefName === 'main' && pr.isCrossRepository === false && evidence.dirty === false
  add('candidate-source', sameSource ? 'pass' : 'fail', 'Clean local head must match the canonical PR head')
  add('receiving-main', evidence.mainSha && pr?.baseRefOid === evidence.mainSha ? 'pass' : 'unknown',
    'PR base must match freshly observed main; receiving-main checks still apply after merge')
  add('review-state', pr?.isDraft === false ? 'pass' : 'fail', 'Draft-skipped acceptance is not a completed e2e run')

  const workflow = evidence.workflowRun
  const currentWorkflow = workflow?.head_sha === evidence.head && workflow.event === 'pull_request'
    && workflow.path === '.github/workflows/ci.yml' && workflow.head_repository?.full_name === REPOSITORY
    && workflow.status === 'completed' && workflow.conclusion === 'success' && evidence.jobsComplete === true
  add('ci-source', currentWorkflow ? 'pass' : 'fail',
    'The latest canonical CI run for this head must complete successfully with a complete job listing')
  const runs = evidence.jobs ?? []
  const missing = REQUIRED_CHECKS.filter(name => {
    const matches = runs.filter(run => run.name === name)
    return matches.length === 0 || matches.some(run => run.status !== 'completed' || run.conclusion !== 'success')
  })
  const failed = runs.some(run => run.conclusion === 'failure')
  add('required-checks', missing.length || failed ? 'fail' : 'pass',
    missing.length ? `Missing successful checks: ${missing.join(', ')}` : failed ? 'Another head check failed' : `All ${REQUIRED_CHECKS.length} required head checks succeeded`)

  const protection = evidence.protection
  if (protection?.state === 'ok') {
    const value = protection.value
    const boundAcceptance = value.required_status_checks?.checks?.some(check =>
      check.context === ACCEPTANCE_CHECK && check.app_id === ACTIONS_APP_ID)
    const complete = value.enforce_admins?.enabled === true && value.required_status_checks?.strict === true
      && boundAcceptance && value.required_pull_request_reviews?.dismiss_stale_reviews === true
      && value.required_conversation_resolution?.enabled === true
      && value.allow_force_pushes?.enabled === false && value.allow_deletions?.enabled === false
    add('main-protection', complete ? 'pass' : 'fail',
      'Strict app-bound acceptance, enforced PR policy, resolved conversations and safe branch settings must protect main')
  } else if (Array.isArray(evidence.rules) && evidence.rules.length > 0) {
    add('main-protection', 'unknown', 'Effective rulesets exist; their equivalent enforcement needs review')
  } else {
    add('main-protection', protection?.state === 'missing' && Array.isArray(evidence.rules) ? 'fail' : 'unknown',
      'Neither an unprotected branch nor an inaccessible settings response establishes enforcement')
  }

  const environment = evidence.environment
  const reviewers = environment?.protection_rules?.find(rule => rule.type === 'required_reviewers')?.reviewers ?? []
  add('environment-review', reviewers.length ? 'pass' : 'fail', 'npm-production must require a named human reviewer')
  const policies = evidence.branchPolicies
  const mainOnly = environment?.deployment_branch_policy?.custom_branch_policies === true
    && Array.isArray(policies) && policies.length === 1 && policies[0].name === 'main' && policies[0].type === 'branch'
  add('environment-branch', mainOnly ? 'pass' : 'unknown', 'The release environment must admit only the main branch')

  const packages = evidence.packages ?? []
  const names = new Set(packages.map(pkg => pkg.name))
  const validPackages = packages.length === targets.length && names.size === targets.length && targets.every(target => {
    const pkg = packages.find(item => item.name === target.name)
    return pkg && pkg.private !== true && /^\d+\.\d+\.\d+$/.test(pkg.version ?? '')
      && pkg.repository?.type === 'git' && pkg.repository.directory === target.directory
      && ['https://github.com/' + REPOSITORY + '.git', 'git+https://github.com/' + REPOSITORY + '.git'].includes(pkg.repository.url)
      && (!pkg.publishConfig?.registry || pkg.publishConfig.registry === 'https://registry.npmjs.org')
  })
  add('package-destinations', validPackages ? 'pass' : 'fail', 'All ten package identities must retain their canonical source and public npm destination')

  return {
    schemaVersion: 1, repository: REPOSITORY, sourceSha: evidence.head, canPublish: false,
    status: checks.every(check => check.state === 'pass') ? 'external_gates_pending' : 'blocked', checks,
    manualGates: [
      'Independent provider review at this exact head and the receiving-main revision',
      'Actual npm trusted publisher owner, repository, workflow, environment and allowed actions for every package',
      'Fresh source-bound archives, consumer receipts and immutable registry integrity reconciliation in the release workflow',
      'Explicit human release approval; this command never publishes or changes account settings',
    ],
  }
}

const run = (command, args, root) => execFileSync(command, args, {
  cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

function github(path, root) {
  try { return { state: 'ok', value: JSON.parse(run('gh', ['api', path], root)) } }
  catch (error) {
    let status
    try { status = JSON.parse(error.stdout?.toString() ?? '{}').status } catch { /* fixed diagnostic below */ }
    return { state: String(status) === '404' ? 'missing' : 'unavailable' }
  }
}

export function collectReadiness(root, prNumber) {
  if (!/^[1-9]\d*$/.test(String(prNumber))) throw new Error('A positive PR number is required')
  const api = 'repos/' + REPOSITORY
  const pullRequest = JSON.parse(run('gh', ['pr', 'view', String(prNumber), '--repo', REPOSITORY,
    '--json', 'headRefOid,baseRefOid,baseRefName,isDraft,isCrossRepository'], root))
  const head = run('git', ['rev-parse', 'HEAD'], root)
  const workflowRuns = github(api + '/actions/workflows/ci.yml/runs?head_sha=' + head + '&event=pull_request&per_page=100', root)
  const workflowRun = workflowRuns.value?.workflow_runs
    ?.filter(item => item.head_sha === head && item.event === 'pull_request')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0]
  const jobListing = Number.isSafeInteger(workflowRun?.id)
    ? github(api + '/actions/runs/' + workflowRun.id + '/jobs?filter=latest&per_page=100', root) : undefined
  const branchRules = github(api + '/rules/branches/main?per_page=100', root)
  const policies = github(api + '/environments/npm-production/deployment-branch-policies?per_page=100', root)
  const evidence = {
    head, dirty: run('git', ['status', '--porcelain'], root).length > 0,
    workflowRun, jobs: jobListing?.value?.jobs,
    jobsComplete: Array.isArray(jobListing?.value?.jobs) && jobListing.value.total_count === jobListing.value.jobs.length,
    repository: github(api, root).value, pullRequest, mainSha: github(api + '/commits/main', root).value?.sha,
    protection: github(api + '/branches/main/protection', root), rules: branchRules.value,
    environment: github(api + '/environments/npm-production', root).value, branchPolicies: policies.value?.branch_policies,
    packages: targets.map(target => JSON.parse(readFileSync(join(root, target.directory, 'package.json'), 'utf8'))),
  }
  return { observedAt: new Date().toISOString(), ciRun: workflowRun?.html_url, ...assessReadiness(evidence) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--pr' || !/^[1-9]\d*$/.test(process.argv[3])) {
    console.error('Usage: node scripts/check-release-readiness.mjs --pr <number> (read-only; exits 1 for blockers, 2 for external gates)')
    process.exitCode = 1
  } else {
    try {
      const result = collectReadiness(resolve(dirname(fileURLToPath(import.meta.url)), '..'), process.argv[3])
      console.log(JSON.stringify(result, null, 2))
      process.exitCode = result.status === 'blocked' ? 1 : 2
    } catch {
      console.log(JSON.stringify({ schemaVersion: 1, status: 'blocked', canPublish: false, error: 'Complete release evidence could not be collected' }))
      process.exitCode = 1
    }
  }
}
