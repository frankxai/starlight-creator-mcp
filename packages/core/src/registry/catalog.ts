import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Logger } from '../log.js'
import type { ProviderRegistry } from '../provider/registry.js'
import type { ModelRecord, Task } from '../types.js'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

export class ModelCatalog {
  private models: ModelRecord[] = []
  private loadedAt = 0
  private readonly inflight = new Map<string, Promise<ModelRecord[]>>()

  constructor(private readonly providers: ProviderRegistry, private readonly cacheDir: string, private readonly log: Logger) {}

  async refresh(force = false): Promise<void> {
    if (!force && this.models.length && Date.now() - this.loadedAt < CACHE_TTL_MS) return
    const all: ModelRecord[] = []
    for (const p of this.providers.all()) {
      if (!(await p.isConfigured())) continue
      all.push(...(await this.providerModels(p.id, force)))
    }
    this.models = all
    this.loadedAt = Date.now()
  }

  private async providerModels(providerId: string, force: boolean): Promise<ModelRecord[]> {
    const file = path.join(this.cacheDir, `models.${providerId}.json`)
    if (!force) {
      try {
        const cached = JSON.parse(await readFile(file, 'utf8')) as { at: number; models: ModelRecord[] }
        if (Date.now() - cached.at < CACHE_TTL_MS) return cached.models
      } catch { /* no cache */ }
    }
    let job = this.inflight.get(providerId)
    if (!job) {
      job = this.providers.get(providerId).listModels().then(async models => {
        await mkdir(this.cacheDir, { recursive: true })
        await writeFile(file, JSON.stringify({ at: Date.now(), models }))
        return models
      }).catch(async err => {
        this.log.warn('model catalog fetch failed', { provider: providerId, error: (err as Error).message })
        try { return (JSON.parse(await readFile(file, 'utf8')) as { models: ModelRecord[] }).models } catch { return [] }
      }).finally(() => this.inflight.delete(providerId))
      this.inflight.set(providerId, job)
    }
    return job
  }

  list(filter: { task?: Task; provider?: string; query?: string } = {}): ModelRecord[] {
    return this.models.filter(m =>
      (!filter.task || m.tasks.includes(filter.task)) && (!filter.provider || m.provider === filter.provider) &&
      (!filter.query || `${m.id} ${m.name}`.toLowerCase().includes(filter.query.toLowerCase())))
  }

  get(id: string): ModelRecord | null {
    return this.models.find(m => m.id === id) ?? this.models.find(m => m.modelId === id) ?? null
  }

  counts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const m of this.models) for (const t of m.tasks) out[t] = (out[t] ?? 0) + 1
    return out
  }
}
