import { sha256Hex, type MergedPack } from '@starlight-intelligence/creator-packs-spec'
import type { AssetStore } from '../assets/store.js'
import { ulid } from '../ids.js'
import type { Ledger, ManifestRow } from '../ledger/interface.js'
import type { PublishAdapter, PublishOutcome } from './adapter.js'
import { MANIFEST_SCHEMA, MAX_APPROVAL_DAYS, isExpired, manifestSchema, numericClaimsWithoutEvidence, detectNumbers, payloadHash, type ManifestClaim, type ManifestPost, type PublicationManifest } from './manifest.js'
import type { ManifestSigner } from './signer.js'

export interface PrepareInput {
  campaignId?: string
  posts: ManifestPost[]
  claims: ManifestClaim[]
  expiresInDays?: number
  rubric?: { id: string; score: number; shipDecision: string }
}

export interface PrepareResult { manifest: PublicationManifest; warnings: string[]; reused: boolean }

export class PublishService {
  constructor(private readonly o: { ledger: Ledger; assets: AssetStore; signer: ManifestSigner; adapters: Map<string, PublishAdapter> }) {}

  async prepare(input: PrepareInput, merged: MergedPack): Promise<PrepareResult> {
    const warnings: string[] = []
    const claims = input.claims.map(c => ({ ...c, status: c.type === 'numerical' && !c.evidence_asset ? 'blocked' as const : c.evidence_asset ? 'verified' as const : c.status }))
    for (const c of numericClaimsWithoutEvidence(claims)) warnings.push(`numerical claim blocked (no evidence asset): "${c.text}"`)
    for (const p of input.posts) {
      const numbers = detectNumbers(p.text)
      const covered = claims.some(c => c.type === 'numerical')
      if (numbers.length && !covered) warnings.push(`post to ${p.channel_id} contains numbers (${numbers.join(', ')}) with no numerical claim declared`)
      for (const sha of p.assets) if (!this.o.ledger.getAsset(sha)) warnings.push(`asset ${sha.slice(0, 12)} is not in the ledger`)
      const limit = merged.publishing.channels[p.platform ?? p.channel_id]?.maxChars
      if (limit && p.text.length > limit) warnings.push(`post to ${p.channel_id} is ${p.text.length} chars, limit ${limit}`)
      for (const banned of merged.voice.bannedPhrases) if (new RegExp(`\\b${banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(p.text)) warnings.push(`post to ${p.channel_id} uses banned phrase "${banned}"`)
    }
    if (merged.publishing.requireRubric) {
      if (!input.rubric) warnings.push(`pack requires rubric ${merged.publishing.requireRubric}; score the text with creator_score first`)
      else if (merged.publishing.minScore !== undefined && input.rubric.score < merged.publishing.minScore) warnings.push(`rubric score ${input.rubric.score} is below the pack minimum ${merged.publishing.minScore}`)
    }
    const hash = payloadHash({ posts: input.posts, claims, packDigest: merged.digest })
    const existing = this.o.ledger.findManifestByHash(hash)
    if (existing && ['prepared', 'approved'].includes(existing.status) && !isExpired(existing.manifest as { expires_at: string })) {
      return { manifest: manifestSchema.parse(existing.manifest), warnings, reused: true }
    }
    const now = new Date()
    const days = Math.min(Math.max(input.expiresInDays ?? MAX_APPROVAL_DAYS, 1), MAX_APPROVAL_DAYS)
    const manifest: PublicationManifest = {
      schema: MANIFEST_SCHEMA, id: `man_${ulid()}`, manifest_version: 1, ...(input.campaignId ? { campaign_id: input.campaignId } : {}),
      pack: { ids: merged.packs.map(p => p.id), digest: merged.digest }, posts: input.posts, claims,
      ...(input.rubric ? { rubric: { id: input.rubric.id, score: input.rubric.score, ship_decision: input.rubric.shipDecision } } : {}),
      privacy_tier: 'publishable', payload_hash: hash, created_at: now.toISOString(), expires_at: new Date(now.getTime() + days * 86_400_000).toISOString(), status: 'prepared',
    }
    this.store(manifest)
    return { manifest, warnings, reused: false }
  }

  private store(m: PublicationManifest): void {
    const existing = this.o.ledger.getManifest(m.id)
    const row: ManifestRow = {
      id: m.id, ...(m.campaign_id ? { campaignId: m.campaign_id } : {}), payloadHash: m.payload_hash, manifest: m, status: m.status,
      ...(m.approval ? { signature: m.approval.signature, approvedAt: m.approval.approved_at } : {}), expiresAt: m.expires_at,
      createdAt: existing?.createdAt ?? m.created_at, updatedAt: new Date().toISOString(),
    }
    this.o.ledger.putManifest(row)
  }

  get(id: string): PublicationManifest | null {
    const row = this.o.ledger.getManifest(id)
    return row ? manifestSchema.parse(row.manifest) : null
  }

  summary(m: PublicationManifest): string {
    const lines = [
      `Manifest ${m.id}`, `Payload hash: ${m.payload_hash}`, `Expires: ${m.expires_at}`,
      ...m.posts.map((p, i) => `Post ${i + 1} -> ${p.channel_id}${p.scheduled_at ? ` at ${p.scheduled_at}` : ' now'} | ${p.assets.length} asset(s) | ${p.text.slice(0, 140).replace(/\s+/g, ' ')}${p.text.length > 140 ? '…' : ''}`),
      ...(m.claims.length ? [`Claims: ${m.claims.map(c => `${c.status}:${c.text.slice(0, 40)}`).join('; ')}`] : []),
    ]
    return lines.join('\n')
  }

  async approve(id: string, confirm: string, method: 'elicitation' | 'cli'): Promise<{ ok: boolean; manifest?: PublicationManifest; reason?: string }> {
    const m = this.get(id)
    if (!m) return { ok: false, reason: `manifest ${id} not found` }
    if (m.status === 'approved' && m.approval) return { ok: true, manifest: m }
    if (m.status !== 'prepared') return { ok: false, reason: `manifest is ${m.status}, only prepared manifests can be approved` }
    if (isExpired(m)) { this.store({ ...m, status: 'expired' }); return { ok: false, reason: 'manifest expired; prepare it again' } }
    if (confirm.trim().toLowerCase() !== m.payload_hash.slice(0, 8)) return { ok: false, reason: 'confirmation did not match the first 8 characters of the payload hash' }
    if (!(await this.assetsUnchanged(m))) return { ok: false, reason: 'an asset referenced by the manifest is missing or changed; prepare again' }
    const approved_at = new Date().toISOString()
    const signature = await this.o.signer.sign({ payload_hash: m.payload_hash, approved_at, expires_at: m.expires_at })
    const next: PublicationManifest = { ...m, status: 'approved', approval: { approved_at, signature, signer_fingerprint: await this.o.signer.fingerprint(), method } }
    this.store(next)
    return { ok: true, manifest: next }
  }

  private async assetsUnchanged(m: PublicationManifest): Promise<boolean> {
    for (const p of m.posts) for (const sha of p.assets) {
      const data = await this.o.assets.bytes(sha)
      if (!data || sha256Hex(data.bytes) !== sha) return false
    }
    return true
  }

  async publish(id: string, opts: { adapterId?: string; dryRun: boolean }): Promise<{ manifest: PublicationManifest; outcomes: PublishOutcome[]; rateLimit: { adapter: string; remainingHour: number } }> {
    const m = this.get(id)
    if (!m) throw new Error(`manifest ${id} not found`)
    if (!['approved', 'partially_sent', 'failed', 'sent'].includes(m.status)) throw new Error(`manifest is ${m.status}; approve it first`)
    if (!m.approval) throw new Error('manifest has no approval signature')
    if (isExpired(m)) { this.store({ ...m, status: 'expired' }); throw new Error('approval expired (14 day maximum); prepare and approve again') }
    if (!(await this.o.signer.verify({ payload_hash: m.payload_hash, approved_at: m.approval.approved_at, expires_at: m.expires_at }, m.approval.signature))) throw new Error('manifest signature is invalid; it was modified after approval')
    const recomputed = payloadHash({ posts: m.posts, claims: m.claims, packDigest: m.pack.digest })
    if (recomputed !== m.payload_hash) throw new Error('payload hash mismatch; manifest content changed after approval')
    if (!(await this.assetsUnchanged(m))) throw new Error('an asset referenced by the manifest changed since approval')
    const adapterId = opts.adapterId ?? (this.o.adapters.has('postiz') ? 'postiz' : 'local')
    const adapter = this.o.adapters.get(adapterId)
    if (!adapter) throw new Error(`publish adapter ${adapterId} is not configured; available: ${[...this.o.adapters.keys()].join(', ')}`)
    const outcomes: PublishOutcome[] = []
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
    for (const post of m.posts) {
      const key = sha256Hex(`${m.payload_hash}|${post.channel_id}|${adapter.id}`)
      const pubId = `pub_${ulid()}`
      const pre = this.o.ledger.addPublication({ id: pubId, manifestId: m.id, channelId: post.channel_id, adapter: adapter.id, idempotencyKey: key, status: 'dry_run' })
      if (!pre.inserted && pre.existing) { outcomes.push({ channelId: post.channel_id, status: 'sent', ...(pre.existing.nativeId ? { nativeId: pre.existing.nativeId } : {}), ...(pre.existing.nativeUrl ? { nativeUrl: pre.existing.nativeUrl } : {}) }); continue }
      if (adapter.hourlyLimit && !opts.dryRun && this.o.ledger.hitsSince(adapter.id, hourAgo) >= adapter.hourlyLimit) {
        outcomes.push({ channelId: post.channel_id, status: 'failed', error: `rate limit: ${adapter.hourlyLimit}/hour reached for ${adapter.id}` })
        continue
      }
      const media: Array<{ sha256: string; url: string; mime: string }> = []
      let mediaError: string | null = null
      for (const sha of post.assets) {
        const url = await this.o.assets.publicUrl(sha)
        const row = this.o.ledger.getAsset(sha)
        if (!url || !row) { mediaError = `asset ${sha.slice(0, 12)} has no public URL; sync it to a connector with creator_asset_sync first`; break }
        media.push({ sha256: sha, url, mime: row.mime })
      }
      if (mediaError && adapter.id !== 'local') { outcomes.push({ channelId: post.channel_id, status: 'failed', error: mediaError }); continue }
      let outcome: PublishOutcome
      try {
        if (!opts.dryRun) this.o.ledger.recordHit(adapter.id, new Date().toISOString())
        outcome = await adapter.publish(m, post, media, { dryRun: opts.dryRun })
      } catch (err) {
        outcome = { channelId: post.channel_id, status: 'failed', error: (err as Error).message }
      }
      const existing = this.o.ledger.publicationsFor(m.id).find(p => p.idempotencyKey === key)
      this.o.ledger.addPublication({ id: existing?.id ?? pubId, manifestId: m.id, channelId: post.channel_id, adapter: adapter.id, idempotencyKey: key, status: outcome.status, ...(outcome.nativeId ? { nativeId: outcome.nativeId } : {}), ...(outcome.nativeUrl ? { nativeUrl: outcome.nativeUrl } : {}), ...(outcome.error ? { error: outcome.error } : {}), ...(outcome.status === 'sent' ? { publishedAt: new Date().toISOString() } : {}) })
      outcomes.push(outcome)
    }
    if (!opts.dryRun) {
      const sent = outcomes.filter(o => o.status === 'sent').length
      const status: PublicationManifest['status'] = sent === outcomes.length ? 'sent' : sent > 0 ? 'partially_sent' : 'failed'
      this.store({ ...m, status })
    }
    return { manifest: this.get(id)!, outcomes, rateLimit: { adapter: adapter.id, remainingHour: adapter.hourlyLimit ? Math.max(0, adapter.hourlyLimit - this.o.ledger.hitsSince(adapter.id, hourAgo)) : Number.POSITIVE_INFINITY } }
  }
}
