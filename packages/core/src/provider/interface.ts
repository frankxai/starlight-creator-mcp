import type { GenerationRequest, ModelRecord, ProviderJob, Task, TextRequest, TextResult } from '../types.js'

export interface Provider {
  readonly id: string
  readonly allowHosts: string[]
  capabilities(): Task[]
  isConfigured(): Promise<boolean>
  listModels(): Promise<ModelRecord[]>
  submit(req: GenerationRequest): Promise<ProviderJob>
  poll(providerJobId: string, task: Task): Promise<ProviderJob>
  cancel?(providerJobId: string): Promise<void>
  text?(req: TextRequest): Promise<TextResult>
}

export class ProviderError extends Error {
  constructor(message: string, public readonly provider: string, public readonly retryable = false, public readonly status?: number) {
    super(message)
  }
}
