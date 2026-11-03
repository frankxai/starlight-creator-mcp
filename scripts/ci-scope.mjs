import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shaPattern = /^[a-f0-9]{40}$/
const rootDocs = new Set(['README.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/PULL_REQUEST_TEMPLATE.md'])
const full = reason => ({ full: true, reason, changedFiles: 0 })

export function classifyPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 10_000) return full('incomplete-path-evidence')
  const safe = paths.every(path => typeof path === 'string' && path.length > 0 && path.length <= 4096
    && !/[\\\u0000-\u001f\u007f]/.test(path) && !path.startsWith('/') && !/^[a-z]:/i.test(path)
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..'))
  if (!safe) return full('incomplete-path-evidence')
  const docsOnly = paths.every(path => rootDocs.has(path) || (path.startsWith('docs/') && path.endsWith('.md')))
  return { full: !docsOnly, reason: docsOnly ? 'documentation-only' : 'runtime-or-package-change', changedFiles: paths.length }
}

export function comparisonForEvent(eventName, event, sha) {
  if (!shaPattern.test(sha ?? '')) return null
  if (eventName === 'pull_request') {
    const base = event?.pull_request?.base?.sha, head = event?.pull_request?.head?.sha
    return shaPattern.test(base ?? '') && shaPattern.test(head ?? '') ? { base, head, threeDot: true } : null
  }
  if (eventName === 'push' && event?.deleted !== true && event?.after === sha
    && shaPattern.test(event?.before ?? '') && !/^0+$/.test(event.before)) {
    return { base: event.before, head: sha, threeDot: false }
  }
  return null
}

export function classifyGitOutput(output) {
  if (typeof output !== 'string' || !output.endsWith('\0')) return full('incomplete-path-evidence')
  return classifyPaths(output.slice(0, -1).split('\0'))
}

export function collectScope({ eventName, event, sha, cwd = root }) {
  const comparison = comparisonForEvent(eventName, event, sha)
  if (!comparison) return full('comparison-unavailable')
  const revisions = comparison.threeDot ? [`${comparison.base}...${comparison.head}`] : [comparison.base, comparison.head]
  try {
    // Disabling rename detection keeps both the removed code and added documentation paths.
    const output = execFileSync('git', ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', ...revisions, '--'], {
      cwd, encoding: 'utf8', timeout: 10_000, maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'pipe'],
    })
    return classifyGitOutput(output)
  } catch { return full('comparison-unavailable') }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result
  try {
    const eventPath = process.env.GITHUB_EVENT_PATH
    if (!eventPath || statSync(eventPath).size > 1_000_000) throw new Error('Incomplete event')
    result = collectScope({ eventName: process.env.GITHUB_EVENT_NAME,
      event: JSON.parse(readFileSync(eventPath, 'utf8')), sha: process.env.GITHUB_SHA })
  } catch { result = full('comparison-unavailable') }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `full=${result.full}\nreason=${result.reason}\nchanged_files=${result.changedFiles}\n`)
  console.log(JSON.stringify(result))
}
