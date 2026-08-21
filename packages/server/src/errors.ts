import type { CallToolResult } from '@modelcontextprotocol/server'

export function toolError(message: string, nextStep?: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: nextStep ? `${message}\nNext step: ${nextStep}` : message }] }
}

export function errorResult(err: unknown, nextStep?: string): CallToolResult {
  const message = err instanceof Error ? err.message : String(err)
  return toolError(message, nextStep)
}
