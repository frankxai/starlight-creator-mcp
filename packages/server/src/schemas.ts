import * as z from 'zod/v4'

export const sha = z.string().regex(/^[a-f0-9]{64}$/i, 'sha256 hex')
export const assetRef = z.string().min(8).describe('asset sha256 (full or unique prefix ≥8) or a job id')
export const waitMs = z.number().int().min(0).max(20_000).default(20_000).describe('max milliseconds to wait for completion; 0 returns the job id immediately')
export const quality = z.enum(['high', 'draft']).default('high')
export const task = z.enum(['t2i', 'i2i', 't2v', 'i2v', 'v2v', 'lipsync', 'tts', 'music', 'sfx', 'stt', 'chat', 'vision'])

export const assetSummary = z.object({
  sha256: z.string(), mime: z.string(), bytes: z.number(), kind: z.enum(['image', 'video', 'audio', 'text']),
  width: z.number().optional(), height: z.number().optional(), duration_s: z.number().optional(),
  created_at: z.string(), task: z.string().optional(), model: z.string().optional(), provider: z.string().optional(), prompt: z.string().optional(),
  score: z.number().optional(), job_id: z.string().optional(), local_path: z.string().optional(), locations: z.array(z.object({ connector: z.string(), uri: z.string() })).optional(),
})

export const scoreOut = z.object({
  score: z.number(), dims: z.record(z.string(), z.number()), strengths: z.array(z.string()), weaknesses: z.array(z.string()),
  ship_decision: z.enum(['ship', 'focused-pass', 'draft', 'restart']), rubric_id: z.string(), judge: z.string(), auto_failed: z.array(z.string()).optional(),
})

export const jobOut = z.object({
  job_id: z.string(), status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  asset: assetSummary.optional(), score: scoreOut.optional(), candidates: z.array(z.object({ sha256: z.string(), score: z.number().optional() })).optional(),
  route: z.object({ model: z.string(), provider: z.string(), reason: z.string() }).optional(), cost_usd: z.number().optional(), error: z.string().optional(), next_step: z.string().optional(),
})

export const generateImageIn = z.object({
  prompt: z.string().min(1).describe('what to render; pack styles are appended, do not add style words twice'),
  model: z.string().optional().describe('registry id "<provider>/<model>" from creator_models; omit to let the pack route'),
  quality,
  style: z.string().optional().describe('pack style id from creator_pack_info section=styles'),
  source_asset: assetRef.optional().describe('existing asset to edit (switches to image-to-image)'),
  reference_assets: z.array(assetRef).max(4).default([]),
  aspect_ratio: z.string().optional(), resolution: z.string().optional(),
  seed: z.number().int().optional(),
  best_of: z.number().int().min(1).max(6).default(1).describe('generate N candidates, score each with the pack rubric, keep the best'),
  min_score: z.number().min(0).max(100).optional().describe('reroll until the rubric score reaches this (max 6 attempts)'),
  rubric: z.string().optional(),
  wait_ms: waitMs,
})

export const generateVideoIn = z.object({
  prompt: z.string().optional(), model: z.string().optional(), quality, style: z.string().optional(),
  source_asset: assetRef.optional().describe('image to animate (image-to-video)'), audio_asset: assetRef.optional().describe('audio to drive lipsync'),
  aspect_ratio: z.string().optional(), duration_s: z.number().positive().optional(), resolution: z.string().optional(), seed: z.number().int().optional(), wait_ms: waitMs,
})

export const generateAudioIn = z.object({
  kind: z.enum(['tts', 'music', 'sfx']), text: z.string().optional(), prompt: z.string().optional(), model: z.string().optional(), voice: z.string().optional(),
  duration_s: z.number().positive().optional(), format: z.enum(['mp3', 'wav']).default('mp3'), wait_ms: waitMs,
})

export const transcribeIn = z.object({ source_asset: assetRef, model: z.string().optional(), language: z.string().optional(), diarize: z.boolean().default(false), wait_ms: waitMs })
