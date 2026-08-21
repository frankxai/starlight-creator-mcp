import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { creatorHome } from '../config.js'
import type { SecretVault } from './interface.js'

const KEY_FILE = 'vault.key'
const VAULT_FILE = 'vault.enc'

async function loadOrCreateKey(home: string): Promise<Buffer> {
  const fromEnv = process.env.CREATOR_VAULT_KEY
  if (fromEnv) return Buffer.from(fromEnv, 'base64')
  const keyPath = path.join(home, KEY_FILE)
  try {
    return Buffer.from((await readFile(keyPath, 'utf8')).trim(), 'base64')
  } catch {
    const key = randomBytes(32)
    await mkdir(home, { recursive: true })
    await writeFile(keyPath, key.toString('base64'), { mode: 0o600 })
    try { await chmod(keyPath, 0o600) } catch { /* windows */ }
    return key
  }
}

function encrypt(key: Buffer, plaintext: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc])
}

function decrypt(key: Buffer, blob: Buffer): string {
  const iv = blob.subarray(0, 12)
  const tag = blob.subarray(12, 28)
  const data = blob.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export async function createEncryptedFileVault(home = creatorHome()): Promise<SecretVault> {
  const key = await loadOrCreateKey(home)
  const file = path.join(home, VAULT_FILE)
  const read = async (): Promise<Record<string, string>> => {
    try { return JSON.parse(decrypt(key, await readFile(file))) as Record<string, string> } catch { return {} }
  }
  const write = async (data: Record<string, string>) => {
    await mkdir(home, { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, encrypt(key, JSON.stringify(data)), { mode: 0o600 })
    await rename(tmp, file)
  }
  return {
    backend: 'encrypted-file',
    async get(name) { return (await read())[name] ?? null },
    async set(name, value) { const d = await read(); d[name] = value; await write(d) },
    async delete(name) { const d = await read(); delete d[name]; await write(d) },
    async list() { return Object.keys(await read()).sort() },
  }
}
