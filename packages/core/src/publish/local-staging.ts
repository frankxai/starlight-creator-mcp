import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ulid } from '../ids.js'
import type { Channel, PublishAdapter, PublishOutcome } from './adapter.js'
import type { ManifestPost, PublicationManifest } from './manifest.js'

export class LocalStagingAdapter implements PublishAdapter {
  readonly id = 'local'
  constructor(private readonly outbox: string) {}

  async listChannels(): Promise<Channel[]> {
    return [{ id: 'outbox', platform: 'local', name: 'Local outbox (writes JSON to disk, publishes nothing)' }]
  }

  async publish(manifest: PublicationManifest, post: ManifestPost, media: Array<{ sha256: string; url: string; mime: string }>, opts: { dryRun: boolean }): Promise<PublishOutcome> {
    const id = ulid()
    if (opts.dryRun) return { channelId: post.channel_id, status: 'dry_run' }
    await mkdir(this.outbox, { recursive: true })
    const file = path.join(this.outbox, `${id}.json`)
    await writeFile(file, `${JSON.stringify({ manifest_id: manifest.id, payload_hash: manifest.payload_hash, post, media, staged_at: new Date().toISOString() }, null, 2)}\n`)
    return { channelId: post.channel_id, status: 'sent', nativeId: id, nativeUrl: `file://${file.replace(/\\/g, '/')}` }
  }

  async stat(): Promise<{ ok: boolean; detail: string }> { return { ok: true, detail: this.outbox } }
}
