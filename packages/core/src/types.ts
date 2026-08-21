import type { Task, Quality } from '@starlight-intelligence/creator-packs-spec'

export type { Task, Quality }

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ModelRecord {
  id: string
  provider: string
  modelId: string
  name: string
  tasks: Task[]
  endpoint?: string
  aspect_ratios?: string[]
  resolutions?: string[]
  durations?: number[]
  pricing?: { unit: string; usd: number } | undefined
  raw?: Record<string, unknown>
}

export interface GenerationRequest {
  task: Task
  model: ModelRecord
  prompt?: string
  negativePrompt?: string
  params: Record<string, string | number | boolean>
  sources: Array<{ role: 'image' | 'video' | 'audio' | 'reference'; bytes: Uint8Array; mime: string; sha256: string }>
  seed?: number
}

export interface ProviderJob {
  providerJobId: string
  status: JobStatus
  progress?: number
  error?: string
  costUsd?: number
  isByok?: boolean
  result?: ProviderResult
}

export interface ProviderResult {
  outputs: Array<{ url?: string; bytes?: Uint8Array; mime: string; kind: 'image' | 'video' | 'audio' | 'text'; text?: string; seed?: number; width?: number; height?: number; durationS?: number }>
  costUsd?: number
  isByok?: boolean
}

export interface TextRequest {
  model?: string
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string } | { type: 'image'; bytes: Uint8Array; mime: string }> }>
  json?: boolean
  maxTokens?: number
  temperature?: number
}

export interface TextResult { text: string; model: string; costUsd?: number }

export interface AssetSummary {
  sha256: string
  mime: string
  bytes: number
  kind: 'image' | 'video' | 'audio' | 'text'
  width?: number
  height?: number
  durationS?: number
  createdAt: string
  task?: Task
  model?: string
  provider?: string
  prompt?: string
  score?: number
  jobId?: string
  localPath?: string
  locations?: Array<{ connector: string; uri: string }>
}

export interface Score {
  score: number
  dims: Record<string, number>
  strengths: string[]
  weaknesses: string[]
  shipDecision: 'ship' | 'focused-pass' | 'draft' | 'restart'
  rubricId: string
  judge: string
  autoFailed?: string[]
}

export interface JobRecord {
  id: string
  provider: string
  providerJobId: string
  task: Task
  model: string
  status: JobStatus
  request: Record<string, unknown>
  resultSha256?: string
  candidates?: Array<{ sha256: string; score?: number }>
  score?: Score
  costUsd?: number
  error?: string
  createdAt: string
  updatedAt: string
  packDigest?: string
  route?: { model: string; provider: string; reason: string }
}
