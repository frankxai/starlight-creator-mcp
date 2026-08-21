import { createHash } from 'node:crypto'

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value as Json))
}

function sortValue(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const out: { [k: string]: Json } = {}
    for (const key of Object.keys(value).sort()) {
      const v = (value as { [k: string]: Json })[key]
      if (v !== undefined) out[key] = sortValue(v)
    }
    return out
  }
  return value
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex')
}

export function sha256CanonicalJson(value: unknown): string {
  return sha256Hex(canonicalize(value))
}
