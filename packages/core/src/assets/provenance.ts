import type { Task } from '../types.js'

export const PROVENANCE_SCHEMA = 'creator-provenance.v1'

export interface Provenance {
  schema: typeof PROVENANCE_SCHEMA
  sha256: string
  mime: string
  bytes: number
  created_at: string
  job_id?: string
  provider?: string
  model?: string
  task?: Task | 'import'
  prompt?: string
  negative_prompt?: string
  params?: Record<string, string | number | boolean>
  seed?: number
  source_assets?: string[]
  cost_usd?: number
  is_byok?: boolean
  pack?: { ids: string[]; digest: string }
  style?: string
  rubric_scores?: Array<{ rubric_id: string; score: number }>
  license?: { pack_license?: string; model_terms_url?: string }
  substrate_version: string
  origin?: { kind: 'generated' | 'imported_url' | 'imported_file'; ref?: string }
}

export function buildProvenance(input: Omit<Provenance, 'schema' | 'created_at'> & { created_at?: string }): Provenance {
  const out: Provenance = { schema: PROVENANCE_SCHEMA, created_at: input.created_at ?? new Date().toISOString(), ...input }
  for (const k of Object.keys(out) as Array<keyof Provenance>) if (out[k] === undefined) delete out[k]
  return out
}
