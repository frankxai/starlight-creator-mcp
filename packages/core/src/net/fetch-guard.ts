import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

export interface FetchPolicy {
  allowHosts: string[]
  allowPrivateHosts?: boolean
  maxBytes?: number
  timeoutMs?: number
}

export class FetchGuardError extends Error {
  constructor(message: string, public readonly code: 'host_not_allowed' | 'private_host' | 'too_large' | 'timeout' | 'bad_scheme' | 'redirect_blocked' | 'http_error') {
    super(message)
  }
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number]
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

function isPrivateIPv6(ip: string): boolean {
  const low = ip.toLowerCase()
  return low === '::1' || low === '::' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80') || low.startsWith('::ffff:')
}

export function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  const v = isIP(h)
  if (v === 4) return isPrivateIPv4(h)
  if (v === 6) return isPrivateIPv6(h)
  return false
}

export function hostAllowed(host: string, allow: string[]): boolean {
  const h = host.toLowerCase()
  return allow.some(a => {
    const pat = a.toLowerCase()
    if (pat.startsWith('*.')) return h === pat.slice(2) || h.endsWith(pat.slice(1))
    return h === pat
  })
}

async function assertResolvesPublic(host: string): Promise<void> {
  if (isIP(host)) {
    if (isPrivateHost(host)) throw new FetchGuardError(`refusing private address ${host}`, 'private_host')
    return
  }
  const addrs = await lookup(host, { all: true }).catch(() => [])
  for (const a of addrs) if (isPrivateHost(a.address)) throw new FetchGuardError(`${host} resolves to private address ${a.address}`, 'private_host')
}

export async function assertUrlAllowed(url: URL, policy: FetchPolicy): Promise<void> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FetchGuardError(`scheme ${url.protocol} not allowed`, 'bad_scheme')
  const host = url.hostname
  if (!policy.allowPrivateHosts) {
    if (isPrivateHost(host)) throw new FetchGuardError(`refusing private host ${host}`, 'private_host')
    if (!hostAllowed(host, policy.allowHosts)) throw new FetchGuardError(`host ${host} is not in the allowlist (${policy.allowHosts.join(', ') || 'empty'})`, 'host_not_allowed')
    await assertResolvesPublic(host)
  } else if (!isPrivateHost(host) && !hostAllowed(host, policy.allowHosts)) {
    throw new FetchGuardError(`host ${host} is not in the allowlist`, 'host_not_allowed')
  }
}

export async function guardedFetch(input: string | URL, init: RequestInit & { policy: FetchPolicy }): Promise<Response> {
  const { policy, ...rest } = init
  const url = new URL(String(input))
  await assertUrlAllowed(url, policy)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), policy.timeoutMs ?? 60_000)
  const outerSignal = rest.signal
  outerSignal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      const next = new URL(loc, url)
      await assertUrlAllowed(next, policy).catch(err => { throw new FetchGuardError(`redirect to ${next.host} blocked: ${(err as Error).message}`, 'redirect_blocked') })
      return guardedFetch(next, init)
    }
    const len = Number(res.headers.get('content-length') ?? 0)
    if (policy.maxBytes && len > policy.maxBytes) throw new FetchGuardError(`response ${len} bytes exceeds limit ${policy.maxBytes}`, 'too_large')
    return res
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new FetchGuardError(`fetch ${url.host} timed out`, 'timeout')
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export async function readBodyLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) { await reader.cancel(); throw new FetchGuardError(`body exceeds ${maxBytes} bytes`, 'too_large') }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.byteLength }
  return out
}
