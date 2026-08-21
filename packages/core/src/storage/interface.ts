export interface StoredObject { uri: string; connector: string }

export interface StorageConnector {
  readonly id: string
  put(sha256: string, bytes: Uint8Array, meta: { mime: string; ext: string }): Promise<StoredObject>
  get(sha256: string, ext: string): Promise<Uint8Array | null>
  exists(sha256: string, ext: string): Promise<boolean>
  publicUrl?(sha256: string, ext: string): Promise<string | null>
  stat(): Promise<{ ok: boolean; detail: string }>
}

export const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
  'text/plain': 'txt', 'application/json': 'json', 'text/markdown': 'md',
}

export function extForMime(mime: string): string {
  return MIME_EXT[mime.split(';')[0]!.trim().toLowerCase()] ?? 'bin'
}

export function mimeForExt(ext: string): string {
  const found = Object.entries(MIME_EXT).find(([, e]) => e === ext.toLowerCase())
  return found?.[0] ?? 'application/octet-stream'
}

export function kindForMime(mime: string): 'image' | 'video' | 'audio' | 'text' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'text'
}

export function sniffMime(bytes: Uint8Array, fallback = 'application/octet-stream'): string {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41) return 'audio/wav'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4'
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm'
  if (b.length >= 3 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0))) return 'audio/mpeg'
  return fallback
}
