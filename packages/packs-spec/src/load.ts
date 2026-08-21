import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { sha256CanonicalJson, sha256Hex } from './hash.js'
import type { LoadedPack } from './merge.js'
import { validatePackDir } from './validate.js'
import type { PackManifest } from './schema.js'

export class PackLoadError extends Error {
  constructor(message: string, public readonly issues: Array<{ level: string; path: string; message: string }> = []) { super(message) }
}

export async function listFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string) => {
    let entries: import('node:fs').Dirent[]
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.isFile()) out.push(full)
    }
  }
  await walk(root)
  return out.sort()
}

export function globToRegExp(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i++
        if (pattern[i + 1] === '/') { i++; re += '(?:.*/)?' } else re += '.*'
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else if ('.+^$(){}|[]\\'.includes(c)) re += `\\${c}`
    else re += c
  }
  return new RegExp(`^${re}$`)
}

export async function resolveCanonFiles(dir: string, patterns: string[]): Promise<string[]> {
  const all = await listFilesRecursive(dir)
  const rel = all.map(f => path.relative(dir, f).split(path.sep).join('/'))
  const matched = new Set<string>()
  for (const p of patterns) {
    const re = globToRegExp(p.replace(/\\/g, '/'))
    for (const r of rel) if (re.test(r)) matched.add(r)
  }
  return [...matched].sort().map(r => path.join(dir, r))
}

export function referencedFiles(m: PackManifest): string[] {
  const files = new Set<string>()
  if (m.canon.locked) files.add(m.canon.locked)
  if (m.canon.entities) files.add(m.canon.entities)
  for (const r of m.rubrics) if (r.promptFile) files.add(r.promptFile)
  for (const t of m.templates) files.add(t.path)
  for (const p of m.prompts) files.add(p.path)
  for (const f of m.voice.files) files.add(f)
  for (const t of m.tools) files.add(t)
  return [...files].sort()
}

export async function computePackDigest(dir: string, m: PackManifest): Promise<string> {
  const fileHashes: Record<string, string> = {}
  const canonFiles = await resolveCanonFiles(dir, m.canon.paths)
  const refs = referencedFiles(m).map(r => path.join(dir, r))
  for (const full of [...new Set([...refs, ...canonFiles])].sort()) {
    try {
      const s = await stat(full)
      if (!s.isFile()) continue
      fileHashes[path.relative(dir, full).split(path.sep).join('/')] = sha256Hex(await readFile(full))
    } catch { /* missing files are reported by validate, not here */ }
  }
  return sha256CanonicalJson({ manifest: m, files: fileHashes })
}

export async function loadPack(dir: string): Promise<LoadedPack> {
  const v = await validatePackDir(dir)
  if (!v.ok || !v.manifest) throw new PackLoadError(`pack at ${dir} is invalid: ${v.issues.filter(i => i.level === 'error').map(i => `${i.path}: ${i.message}`).join('; ')}`, v.issues)
  return { dir: path.resolve(dir), manifest: v.manifest, digest: await computePackDigest(dir, v.manifest) }
}
