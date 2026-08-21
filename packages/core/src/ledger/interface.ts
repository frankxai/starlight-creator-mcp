import type { AssetSummary, JobRecord, Score, Task } from '../types.js'

export interface AssetRow extends AssetSummary { provenance: Record<string, unknown>; packDigest?: string }

export interface ScoreRow { id: string; sha256?: string; textSha?: string; rubricId: string; packDigest?: string; score: number; dims: Record<string, number>; judge: string; createdAt: string; detail: Score }

export interface ManifestRow { id: string; campaignId?: string; payloadHash: string; manifest: Record<string, unknown>; status: string; signature?: string; approvedAt?: string; expiresAt?: string; createdAt: string; updatedAt: string }

export interface PublicationRow { id: string; manifestId: string; channelId: string; adapter: string; idempotencyKey: string; nativeId?: string; nativeUrl?: string; publishedAt?: string; status: 'sent' | 'failed' | 'dry_run'; error?: string }

export interface MetricObservation { id: string; publicationId: string; source: string; observedAt: string; windowHours?: number; impressions?: number; reach?: number; views?: number; watchTimeS?: number; likes?: number; comments?: number; replies?: number; shares?: number; saves?: number; linkActions?: number; followerDelta?: number; raw?: Record<string, unknown> }

export interface AssetFilter { query?: string; task?: Task; model?: string; minScore?: number; packId?: string; since?: string; kind?: string; limit?: number; cursor?: string }

export interface Ledger {
  readonly backend: string
  upsertAsset(row: AssetRow): void
  getAsset(sha256: string): AssetRow | null
  findAsset(ref: string): AssetRow | null
  listAssets(filter: AssetFilter): { assets: AssetRow[]; nextCursor?: string }
  addLocation(sha256: string, connector: string, uri: string): void
  locations(sha256: string): Array<{ connector: string; uri: string; syncedAt: string }>
  createJob(job: JobRecord): void
  updateJob(id: string, patch: Partial<JobRecord>): JobRecord | null
  getJob(id: string): JobRecord | null
  listJobs(filter: { status?: string; limit?: number }): JobRecord[]
  addScore(row: ScoreRow): void
  scoresFor(ref: { sha256?: string; textSha?: string }): ScoreRow[]
  putManifest(row: ManifestRow): void
  getManifest(id: string): ManifestRow | null
  findManifestByHash(payloadHash: string): ManifestRow | null
  updateManifest(id: string, patch: Partial<ManifestRow>): ManifestRow | null
  listManifests(filter: { status?: string; limit?: number }): ManifestRow[]
  addPublication(row: PublicationRow): { inserted: boolean; existing?: PublicationRow }
  publicationsFor(manifestId: string): PublicationRow[]
  getPublication(id: string): PublicationRow | null
  addObservation(row: MetricObservation): void
  observations(filter: { publicationId?: string; since?: string; until?: string }): MetricObservation[]
  recordHit(adapter: string, at: string): void
  hitsSince(adapter: string, since: string): number
  close(): void
}
