import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveInside } from '../fs/sandbox.js'
import type { StorageConnector, StoredObject } from './interface.js'

export function assetRelPath(sha256: string, ext: string): string {
  return path.join(sha256.slice(0, 2), `${sha256}.${ext}`)
}

export function provenanceRelPath(sha256: string): string {
  return path.join(sha256.slice(0, 2), `${sha256}.provenance.json`)
}

export class LocalStorage implements StorageConnector {
  readonly id = 'local'
  constructor(readonly root: string) {}

  pathFor(sha256: string, ext: string): string { return resolveInside(this.root, assetRelPath(sha256, ext)) }
  provenancePathFor(sha256: string): string { return resolveInside(this.root, provenanceRelPath(sha256)) }

  async put(sha256: string, bytes: Uint8Array, meta: { mime: string; ext: string }): Promise<StoredObject> {
    const full = this.pathFor(sha256, meta.ext)
    await mkdir(path.dirname(full), { recursive: true })
    const tmp = `${full}.${process.pid}.tmp`
    await writeFile(tmp, bytes)
    await rename(tmp, full)
    return { uri: `file://${full.replace(/\\/g, '/')}`, connector: this.id }
  }

  async writeSidecar(sha256: string, data: unknown): Promise<string> {
    const full = this.provenancePathFor(sha256)
    await mkdir(path.dirname(full), { recursive: true })
    const tmp = `${full}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`)
    await rename(tmp, full)
    return full
  }

  async readSidecar(sha256: string): Promise<Record<string, unknown> | null> {
    try { return JSON.parse(await readFile(this.provenancePathFor(sha256), 'utf8')) as Record<string, unknown> } catch { return null }
  }

  async get(sha256: string, ext: string): Promise<Uint8Array | null> {
    try { return new Uint8Array(await readFile(this.pathFor(sha256, ext))) } catch { return null }
  }

  async exists(sha256: string, ext: string): Promise<boolean> {
    try { await access(this.pathFor(sha256, ext)); return true } catch { return false }
  }

  async stat(): Promise<{ ok: boolean; detail: string }> {
    try { await mkdir(this.root, { recursive: true }); return { ok: true, detail: this.root } } catch (err) { return { ok: false, detail: (err as Error).message } }
  }
}
