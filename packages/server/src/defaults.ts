import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Provider, Vault } from '@starlight-intelligence/creator-core'
import { createGoogleProvider } from '@starlight-intelligence/creator-provider-google'
import { createMuapiProvider } from '@starlight-intelligence/creator-provider-muapi'
import { createOpenRouterProvider } from '@starlight-intelligence/creator-provider-openrouter'

const here = path.dirname(fileURLToPath(import.meta.url))
const STARTER_CANDIDATES = [path.resolve(here, '..', 'packs', 'starter'), path.resolve(here, '..', '..', '..', 'packs', 'starter')]
export const STARTER_PACK = STARTER_CANDIDATES.find(p => existsSync(path.join(p, 'pack.json'))) ?? STARTER_CANDIDATES[0]!

export function defaultProviders(vault: Vault): Provider[] {
  const allowPrivate = process.env.CREATOR_ALLOW_PRIVATE_HOSTS === '1'
  const fetchPolicy = { allowHosts: [], allowPrivateHosts: allowPrivate }
  return [createOpenRouterProvider({ vault, fetchPolicy }), createMuapiProvider({ vault, fetchPolicy }), createGoogleProvider({ vault, fetchPolicy })]
}

export function packsFromEnv(): string[] {
  const env = process.env.CREATOR_PACKS
  const list = env ? env.split(path.delimiter).map(s => s.trim()).filter(Boolean) : []
  return list.length ? list : [STARTER_PACK]
}
