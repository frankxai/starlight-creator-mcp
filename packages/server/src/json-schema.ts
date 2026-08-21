import * as z from 'zod/v4'
import { compositeToolSchema as specSchema, type CompositeTool } from '@starlight-intelligence/creator-packs-spec'

export const compositeToolSchema = specSchema
export type { CompositeTool }

type JsonSchema = { type?: string; description?: string; enum?: string[]; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; default?: unknown; minimum?: number; maximum?: number }

export function fromJsonSchemaToZod(schema: Record<string, unknown>): z.ZodObject {
  const s = schema as JsonSchema
  const shape: Record<string, z.ZodType> = {}
  const required = new Set(s.required ?? [])
  for (const [key, prop] of Object.entries(s.properties ?? {})) {
    let t: z.ZodType
    if (prop.enum) t = z.enum(prop.enum as [string, ...string[]])
    else if (prop.type === 'number' || prop.type === 'integer') { let n = z.number(); if (prop.minimum !== undefined) n = n.min(prop.minimum); if (prop.maximum !== undefined) n = n.max(prop.maximum); t = n }
    else if (prop.type === 'boolean') t = z.boolean()
    else if (prop.type === 'array') t = z.array(prop.items?.type === 'number' ? z.number() : z.string())
    else t = z.string()
    if (prop.description) t = t.describe(prop.description)
    shape[key] = required.has(key) ? t : t.optional()
  }
  return z.object(shape)
}
