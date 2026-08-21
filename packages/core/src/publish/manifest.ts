import * as z from 'zod/v4'
import { sha256CanonicalJson } from '@starlight-intelligence/creator-packs-spec'

export const MANIFEST_SCHEMA = 'creator-publication-manifest.v1'
export const MAX_APPROVAL_DAYS = 14

export const claimSchema = z.object({
  text: z.string().min(1),
  type: z.enum(['factual', 'numerical', 'biographical', 'interpretive', 'estimate']).default('interpretive'),
  evidence_asset: z.string().optional(),
  status: z.enum(['verified', 'blocked', 'proposed']).default('proposed'),
})

export const postSchema = z.object({
  channel_id: z.string().min(1),
  platform: z.string().optional(),
  text: z.string().min(1),
  assets: z.array(z.string().regex(/^[a-f0-9]{64}$/)).default([]),
  link: z.string().url().optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
})

export const manifestSchema = z.object({
  schema: z.literal(MANIFEST_SCHEMA),
  id: z.string(),
  manifest_version: z.literal(1),
  campaign_id: z.string().optional(),
  pack: z.object({ ids: z.array(z.string()), digest: z.string() }),
  posts: z.array(postSchema).min(1),
  claims: z.array(claimSchema).default([]),
  rubric: z.object({ id: z.string(), score: z.number(), ship_decision: z.string() }).optional(),
  privacy_tier: z.literal('publishable'),
  payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
  created_at: z.string(),
  expires_at: z.string(),
  approval: z.object({ approved_at: z.string(), signature: z.string(), signer_fingerprint: z.string(), method: z.enum(['elicitation', 'cli']) }).optional(),
  status: z.enum(['prepared', 'approved', 'sent', 'partially_sent', 'failed', 'cancelled', 'expired']),
})

export type PublicationManifest = z.infer<typeof manifestSchema>
export type ManifestPost = z.infer<typeof postSchema>
export type ManifestClaim = z.infer<typeof claimSchema>

export function payloadHash(input: { posts: ManifestPost[]; claims: ManifestClaim[]; packDigest: string }): string {
  return sha256CanonicalJson({ posts: input.posts, claims: input.claims.map(c => ({ text: c.text, type: c.type, evidence_asset: c.evidence_asset ?? null })), pack: input.packDigest })
}

export function numericClaimsWithoutEvidence(claims: ManifestClaim[]): ManifestClaim[] {
  return claims.filter(c => c.type === 'numerical' && !c.evidence_asset)
}

export function detectNumbers(text: string): string[] {
  return [...text.matchAll(/(?<![\w.])(\$?\d[\d,.]*%?(?:\s?(?:k|m|bn|x))?)(?![\w.])/gi)].map(m => m[1]!).filter(n => !/^\d{1,2}$/.test(n))
}

export function isExpired(m: { expires_at: string }, now = new Date()): boolean {
  return new Date(m.expires_at).getTime() <= now.getTime()
}
