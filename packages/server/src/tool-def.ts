import type { CallToolResult, InputRequiredResult, ServerContext, ToolAnnotations } from '@modelcontextprotocol/server'
import type { CreatorContext } from '@starlight-intelligence/creator-core'
import type * as z from 'zod/v4'

export interface ToolDef<I extends z.ZodObject, O extends z.ZodObject> {
  name: string
  title: string
  description: string
  inputSchema: I
  outputSchema: O
  annotations: ToolAnnotations
  handler: (args: z.infer<I>, ctx: CreatorContext, mcp: ServerContext) => Promise<CallToolResult | InputRequiredResult>
}

export type AnyToolDef = ToolDef<z.ZodObject, z.ZodObject>

export function defineTool<I extends z.ZodObject, O extends z.ZodObject>(def: ToolDef<I, O>): AnyToolDef {
  return def as unknown as AnyToolDef
}

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
export const READ_ONLY_NET: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
export const GENERATES: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
export const WRITES_LOCAL: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
