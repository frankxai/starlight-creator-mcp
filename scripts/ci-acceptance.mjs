import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BUILD_GROUPS = ['typecheck-unit', 'storage-runtime', 'e2e', 'release-artifacts', 'published-bytes-windows']

export function evaluateAcceptance(needs) {
  const scope = needs?.scope
  if (scope?.result !== 'success' || !['true', 'false'].includes(scope.outputs?.full)) {
    return { accepted: false, failures: ['Complete successful scope evidence is required'] }
  }
  const docs = scope.outputs.full === 'false'
  if (docs && (scope.outputs.reason !== 'documentation-only' || !/^[1-9]\d*$/.test(scope.outputs.changed_files ?? ''))) {
    return { accepted: false, failures: ['Documentation scope must identify a nonempty reviewed path classification'] }
  }
  const expected = docs ? 'skipped' : 'success'
  const failures = BUILD_GROUPS.filter(name => needs[name]?.result !== expected)
    .map(name => `${name} did not reach the required ${expected} state`)
  return { accepted: failures.length === 0, route: docs ? 'documentation' : 'full', failures }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result
  try {
    const input = process.env.CI_NEEDS_JSON
    if (!input || input.length > 64_000) throw new Error('Incomplete needs')
    result = evaluateAcceptance(JSON.parse(input))
  } catch { result = { accepted: false, failures: ['Complete job-result evidence is required'] } }
  console.log(JSON.stringify(result))
  process.exitCode = result.accepted ? 0 : 1
}
