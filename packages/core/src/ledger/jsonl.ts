import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { JobRecord } from '../types.js'
import type { AssetFilter, AssetRow, Ledger, ManifestRow, MetricObservation, PublicationRow, ScoreRow } from './interface.js'
import { paginate } from './sqlite.js'

type Op = { t: 'asset'; r: AssetRow } | { t: 'loc'; r: { sha256: string; connector: string; uri: string; syncedAt: string } } | { t: 'job'; r: JobRecord } | { t: 'score'; r: ScoreRow } | { t: 'manifest'; r: ManifestRow } | { t: 'pub'; r: PublicationRow } | { t: 'obs'; r: MetricObservation } | { t: 'hit'; r: { adapter: string; at: string } }

export class JsonlLedger implements Ledger {
  readonly backend = 'jsonl'
  private assets = new Map<string, AssetRow>()
  private locs = new Map<string, Map<string, { connector: string; uri: string; syncedAt: string }>>()
  private jobs = new Map<string, JobRecord>()
  private scores = new Map<string, ScoreRow>()
  private manifests = new Map<string, ManifestRow>()
  private pubs = new Map<string, PublicationRow>()
  private obs = new Map<string, MetricObservation>()
  private hits: Array<{ adapter: string; at: string }> = []

  constructor(readonly file: string | null) {
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue
        try { this.apply(JSON.parse(line) as Op, false) } catch { /* skip corrupt line */ }
      }
    }
  }

  private apply(op: Op, persist = true): void {
    switch (op.t) {
      case 'asset': this.assets.set(op.r.sha256, op.r); break
      case 'loc': { const m = this.locs.get(op.r.sha256) ?? new Map(); m.set(op.r.connector, op.r); this.locs.set(op.r.sha256, m); break }
      case 'job': this.jobs.set(op.r.id, op.r); break
      case 'score': this.scores.set(op.r.id, op.r); break
      case 'manifest': this.manifests.set(op.r.id, op.r); break
      case 'pub': this.pubs.set(op.r.id, op.r); break
      case 'obs': this.obs.set(op.r.id, op.r); break
      case 'hit': this.hits.push(op.r); break
    }
    if (persist && this.file) {
      mkdirSync(path.dirname(this.file), { recursive: true })
      appendFileSync(this.file, `${JSON.stringify(op)}\n`)
    }
  }

  upsertAsset(row: AssetRow): void { this.apply({ t: 'asset', r: row }) }
  getAsset(sha256: string): AssetRow | null { return this.assets.get(sha256) ?? null }
  findAsset(ref: string): AssetRow | null {
    if (/^[a-f0-9]{64}$/i.test(ref)) return this.getAsset(ref.toLowerCase())
    if (/^[a-f0-9]{8,63}$/i.test(ref)) { const hits = [...this.assets.keys()].filter(k => k.startsWith(ref.toLowerCase())); return hits.length === 1 ? this.assets.get(hits[0]!)! : null }
    const job = this.jobs.get(ref)
    return job?.resultSha256 ? this.getAsset(job.resultSha256) : null
  }
  listAssets(filter: AssetFilter) {
    const all = [...this.assets.values()].filter(a =>
      (!filter.task || a.task === filter.task) && (!filter.model || a.model === filter.model) && (!filter.kind || a.kind === filter.kind) &&
      (filter.minScore === undefined || (a.score ?? -1) >= filter.minScore) && (!filter.since || a.createdAt >= filter.since) &&
      (!filter.query || `${a.prompt ?? ''} ${a.model ?? ''} ${a.sha256}`.toLowerCase().includes(filter.query.toLowerCase())))
    const { items, nextCursor } = paginate(all as Array<AssetRow & Record<string, unknown>>, 'sha256', filter.limit ?? 20, filter.cursor)
    return nextCursor ? { assets: items, nextCursor } : { assets: items }
  }
  addLocation(sha256: string, connector: string, uri: string): void { this.apply({ t: 'loc', r: { sha256, connector, uri, syncedAt: new Date().toISOString() } }) }
  locations(sha256: string) { return [...(this.locs.get(sha256)?.values() ?? [])] }
  createJob(job: JobRecord): void { this.apply({ t: 'job', r: job }) }
  updateJob(id: string, patch: Partial<JobRecord>): JobRecord | null { const cur = this.jobs.get(id); if (!cur) return null; const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }; this.createJob(next); return next }
  getJob(id: string): JobRecord | null { return this.jobs.get(id) ?? null }
  listJobs(filter: { status?: string; limit?: number }): JobRecord[] { return [...this.jobs.values()].filter(j => !filter.status || j.status === filter.status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filter.limit ?? 50) }
  addScore(row: ScoreRow): void { this.apply({ t: 'score', r: row }) }
  scoresFor(ref: { sha256?: string; textSha?: string }): ScoreRow[] { return [...this.scores.values()].filter(s => (ref.sha256 && s.sha256 === ref.sha256) || (ref.textSha && s.textSha === ref.textSha)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  putManifest(row: ManifestRow): void { this.apply({ t: 'manifest', r: row }) }
  getManifest(id: string): ManifestRow | null { return this.manifests.get(id) ?? null }
  findManifestByHash(payloadHash: string): ManifestRow | null { return [...this.manifests.values()].filter(m => m.payloadHash === payloadHash).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null }
  updateManifest(id: string, patch: Partial<ManifestRow>): ManifestRow | null { const cur = this.manifests.get(id); if (!cur) return null; const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }; this.putManifest(next); return next }
  listManifests(filter: { status?: string; limit?: number }): ManifestRow[] { return [...this.manifests.values()].filter(m => !filter.status || m.status === filter.status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filter.limit ?? 50) }
  addPublication(row: PublicationRow) {
    const existing = [...this.pubs.values()].find(p => p.idempotencyKey === row.idempotencyKey)
    if (existing && existing.status === 'sent') return { inserted: false, existing }
    this.apply({ t: 'pub', r: { ...row, id: existing?.id ?? row.id } })
    return { inserted: true }
  }
  publicationsFor(manifestId: string): PublicationRow[] { return [...this.pubs.values()].filter(p => p.manifestId === manifestId) }
  getPublication(id: string): PublicationRow | null { return this.pubs.get(id) ?? null }
  addObservation(row: MetricObservation): void { this.apply({ t: 'obs', r: row }) }
  observations(filter: { publicationId?: string; since?: string; until?: string }): MetricObservation[] {
    return [...this.obs.values()].filter(o => (!filter.publicationId || o.publicationId === filter.publicationId) && (!filter.since || o.observedAt >= filter.since) && (!filter.until || o.observedAt <= filter.until)).sort((a, b) => b.observedAt.localeCompare(a.observedAt))
  }
  recordHit(adapter: string, at: string): void { this.apply({ t: 'hit', r: { adapter, at } }) }
  hitsSince(adapter: string, since: string): number { return this.hits.filter(h => h.adapter === adapter && h.at >= since).length }
  close(): void { /* nothing to flush */ }
}
