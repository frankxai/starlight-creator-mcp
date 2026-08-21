import type { ManifestPost, PublicationManifest } from './manifest.js'

export interface Channel { id: string; platform: string; name: string; raw?: Record<string, unknown> }

export interface PublishOutcome { channelId: string; status: 'sent' | 'failed' | 'dry_run'; nativeId?: string; nativeUrl?: string; error?: string }

export interface PublishAdapter {
  readonly id: string
  readonly hourlyLimit?: number
  listChannels(): Promise<Channel[]>
  publish(manifest: PublicationManifest, post: ManifestPost, media: Array<{ sha256: string; url: string; mime: string }>, opts: { dryRun: boolean }): Promise<PublishOutcome>
  fetchMetrics?(nativeId: string): Promise<Record<string, number> | null>
  stat(): Promise<{ ok: boolean; detail: string }>
}
