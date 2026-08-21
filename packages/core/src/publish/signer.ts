import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Vault } from '../vault/index.js'
import { SECRET_NAMES } from '../vault/interface.js'

export interface Signable { payload_hash: string; approved_at: string; expires_at: string }

export class ManifestSigner {
  private key: Buffer | null = null
  constructor(private readonly vault: Vault) {}

  private async loadKey(): Promise<Buffer> {
    if (this.key) return this.key
    let raw = await this.vault.resolve(SECRET_NAMES.manifestSigningKey)
    if (!raw) {
      raw = randomBytes(32).toString('base64')
      await this.vault.set(SECRET_NAMES.manifestSigningKey, raw)
    }
    this.key = Buffer.from(raw, 'base64')
    return this.key
  }

  async fingerprint(): Promise<string> {
    const key = await this.loadKey()
    return createHmac('sha256', key).update('creator-mcp-signer-fingerprint').digest('hex').slice(0, 16)
  }

  async sign(m: Signable): Promise<string> {
    const key = await this.loadKey()
    return createHmac('sha256', key).update(`${m.payload_hash}|${m.approved_at}|${m.expires_at}`).digest('hex')
  }

  async verify(m: Signable, signature: string): Promise<boolean> {
    const expected = Buffer.from(await this.sign(m), 'hex')
    const given = Buffer.from(signature, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  async mac(data: string): Promise<string> {
    const key = await this.loadKey()
    return createHmac('sha256', key).update(data).digest('hex')
  }
}
