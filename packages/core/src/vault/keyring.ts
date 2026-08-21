import type { SecretVault } from './interface.js'

const SERVICE = 'creator-mcp'
const INDEX_ACCOUNT = '__index__'

interface KeyringModule {
  AsyncEntry: new (service: string, username: string) => {
    getPassword(): Promise<string | undefined>
    setPassword(password: string): Promise<void>
    deleteCredential(): Promise<boolean>
  }
}

async function loadKeyring(): Promise<KeyringModule | null> {
  try {
    const mod = (await import('@napi-rs/keyring')) as unknown as KeyringModule
    return mod.AsyncEntry ? mod : null
  } catch {
    return null
  }
}

export async function createKeyringVault(): Promise<SecretVault | null> {
  const mod = await loadKeyring()
  if (!mod) return null
  const probe = new mod.AsyncEntry(SERVICE, '__probe__')
  try {
    await probe.getPassword()
  } catch {
    return null
  }
  const entry = (name: string) => new mod.AsyncEntry(SERVICE, name)
  const readIndex = async (): Promise<string[]> => {
    try {
      const raw = await entry(INDEX_ACCOUNT).getPassword()
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch { return [] }
  }
  const writeIndex = async (names: string[]) => entry(INDEX_ACCOUNT).setPassword(JSON.stringify([...new Set(names)].sort()))
  return {
    backend: 'keyring',
    async get(name) {
      try { return (await entry(name).getPassword()) ?? null } catch { return null }
    },
    async set(name, value) {
      await entry(name).setPassword(value)
      await writeIndex([...(await readIndex()), name])
    },
    async delete(name) {
      try { await entry(name).deleteCredential() } catch { /* absent */ }
      await writeIndex((await readIndex()).filter(n => n !== name))
    },
    list: readIndex,
  }
}
