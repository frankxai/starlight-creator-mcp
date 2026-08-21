import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { assetRelPath } from './local.js'
import type { StorageConnector, StoredObject } from './interface.js'

const run = promisify(execFile)

export class RcloneStorage implements StorageConnector {
  readonly id = 'rclone'
  constructor(private readonly remote: string, private readonly prefix = '') {
    if (!/^[A-Za-z0-9_-]+$/.test(remote)) throw new Error(`invalid rclone remote name: ${remote}`)
  }

  private key(sha256: string, ext: string): string {
    return [this.prefix.replace(/^\/+|\/+$/g, ''), assetRelPath(sha256, ext).replace(/\\/g, '/')].filter(Boolean).join('/')
  }

  private target(sha256: string, ext: string): string { return `${this.remote}:${this.key(sha256, ext)}` }

  async put(sha256: string, bytes: Uint8Array, meta: { mime: string; ext: string }): Promise<StoredObject> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'creator-rclone-'))
    const tmp = path.join(dir, `${sha256}.${meta.ext}`)
    try {
      await writeFile(tmp, bytes)
      await run('rclone', ['copyto', tmp, this.target(sha256, meta.ext), '--no-traverse'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
    return { uri: this.target(sha256, meta.ext), connector: this.id }
  }

  async get(sha256: string, ext: string): Promise<Uint8Array | null> {
    try {
      const { stdout } = await run('rclone', ['cat', this.target(sha256, ext)], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 })
      return new Uint8Array(stdout as unknown as Buffer)
    } catch { return null }
  }

  async exists(sha256: string, ext: string): Promise<boolean> {
    try { await run('rclone', ['lsjson', this.target(sha256, ext)]); return true } catch { return false }
  }

  async publicUrl(sha256: string, ext: string): Promise<string | null> {
    try { const { stdout } = await run('rclone', ['link', this.target(sha256, ext)]); return String(stdout).trim() || null } catch { return null }
  }

  async stat(): Promise<{ ok: boolean; detail: string }> {
    try { const { stdout } = await run('rclone', ['version']); return { ok: true, detail: String(stdout).split('\n')[0] ?? 'rclone' } } catch { return { ok: false, detail: 'rclone binary not found on PATH' } }
  }
}
