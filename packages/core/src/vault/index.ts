import { Redactor } from '../log.js'
import { createEncryptedFileVault } from './encrypted-file.js'
import { ENV_ALIASES, type SecretVault } from './interface.js'
import { createKeyringVault } from './keyring.js'

export * from './interface.js'
export { createEncryptedFileVault } from './encrypted-file.js'
export { createKeyringVault } from './keyring.js'

export interface Vault extends SecretVault {
  readonly redactor: Redactor
  readonly store: SecretVault
  resolve(name: string): Promise<string | null>
  require(name: string, hint?: string): Promise<string>
}

export function envLookup(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  for (const alias of ENV_ALIASES[name] ?? [name]) {
    const v = env[alias]
    if (v && v.trim()) return v.trim()
  }
  return null
}

export async function createVault(opts: { backend?: 'auto' | 'keyring' | 'encrypted-file' | 'memory'; redactor?: Redactor; env?: NodeJS.ProcessEnv } = {}): Promise<Vault> {
  const redactor = opts.redactor ?? new Redactor()
  const env = opts.env ?? process.env
  const backend = opts.backend ?? (process.env.CREATOR_VAULT_BACKEND as 'auto' | 'keyring' | 'encrypted-file' | 'memory' | undefined) ?? 'auto'
  let store: SecretVault | null = null
  if (backend === 'memory') {
    const mem = new Map<string, string>()
    store = { backend: 'memory', get: async n => mem.get(n) ?? null, set: async (n, v) => { mem.set(n, v) }, delete: async n => { mem.delete(n) }, list: async () => [...mem.keys()].sort() }
  } else if (backend === 'auto' || backend === 'keyring') {
    store = await createKeyringVault()
    if (!store && backend === 'keyring') throw new Error('OS keyring unavailable; set CREATOR_VAULT_BACKEND=encrypted-file')
  }
  if (!store) store = await createEncryptedFileVault()
  const resolve = async (name: string): Promise<string | null> => {
    const fromEnv = envLookup(name, env)
    const value = fromEnv ?? (await store!.get(name))
    if (value) redactor.add(value)
    return value
  }
  return {
    backend: store.backend,
    store,
    redactor,
    get: store.get.bind(store),
    set: async (n, v) => { redactor.add(v); await store!.set(n, v) },
    delete: store.delete.bind(store),
    list: store.list.bind(store),
    resolve,
    async require(name, hint) {
      const v = await resolve(name)
      if (!v) throw new Error(`${name} is not configured. ${hint ?? `Run \`creator-mcp setup\` or set the ${name} environment variable.`}`)
      return v
    },
  }
}
