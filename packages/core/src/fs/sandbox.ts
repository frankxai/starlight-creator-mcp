import { realpath } from 'node:fs/promises'
import path from 'node:path'

export class SandboxError extends Error {}

function normalize(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function isInside(root: string, target: string): boolean {
  const r = normalize(root)
  const t = normalize(target)
  return t === r || t.startsWith(`${r}/`)
}

export function resolveInside(root: string, rel: string): string {
  if (/^\\\\/.test(rel) || /^\/\//.test(rel)) throw new SandboxError('UNC paths are not allowed')
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new SandboxError(`absolute paths are not allowed: ${rel}`)
  if (rel.split(/[\\/]/).includes('..')) throw new SandboxError(`path traversal is not allowed: ${rel}`)
  const full = path.resolve(root, rel)
  if (!isInside(root, full)) throw new SandboxError(`path escapes sandbox: ${rel}`)
  return full
}

export async function assertRealInside(root: string, full: string): Promise<string> {
  let real = full
  try { real = await realpath(full) } catch { /* not created yet */ }
  const realRoot = await realpath(root).catch(() => root)
  if (!isInside(realRoot, real)) throw new SandboxError(`path escapes sandbox via link: ${full}`)
  return real
}
