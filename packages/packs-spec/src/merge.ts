import semver from 'semver'
import type { PackManifest, Rubric, Style, RegistryOverrides } from './schema.js'

export interface LoadedPack { dir: string; manifest: PackManifest; digest: string }

export interface MergedPack {
  packs: Array<{ id: string; version: string; name: string; license: string; publicSafe: boolean; dir: string; digest: string }>
  canonPaths: Array<{ packId: string; dir: string; pattern: string }>
  locked: Array<{ packId: string; dir: string; path: string }>
  entities: Array<{ packId: string; dir: string; path: string }>
  forbiddenPatterns: Array<{ packId: string; pattern: string; message: string }>
  rubrics: Map<string, Rubric & { packId: string; dir: string }>
  defaultRubric: Partial<Record<Rubric['kind'], string>>
  templates: Map<string, { packId: string; dir: string; path: string; kind: string; tags: string[]; description?: string }>
  prompts: Map<string, { packId: string; dir: string; path: string; description?: string }>
  styles: Map<string, Style & { packId: string }>
  registry: RegistryOverrides
  voice: { principles: string[]; avoid: string[]; bannedPhrases: string[]; register?: string; files: Array<{ packId: string; dir: string; path: string }> }
  publishing: { requireRubric?: string; minScore?: number; channels: Record<string, { maxChars?: number }> }
  tools: Array<{ packId: string; dir: string; path: string }>
  init?: { packId: string; dir: string }
  digest: string
}

export class PackResolutionError extends Error {}

export function orderPacks(packs: LoadedPack[]): LoadedPack[] {
  const byId = new Map(packs.map(p => [p.manifest.id, p]))
  const out: LoadedPack[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (p: LoadedPack, chain: string[]) => {
    const s = state.get(p.manifest.id)
    if (s === 'done') return
    if (s === 'visiting') throw new PackResolutionError(`pack extends cycle: ${[...chain, p.manifest.id].join(' -> ')}`)
    state.set(p.manifest.id, 'visiting')
    for (const dep of p.manifest.extends) {
      const d = byId.get(dep)
      if (!d) throw new PackResolutionError(`pack ${p.manifest.id} extends ${dep}, which is not loaded`)
      visit(d, [...chain, p.manifest.id])
    }
    state.set(p.manifest.id, 'done')
    out.push(p)
  }
  for (const p of packs) visit(p, [])
  return out
}

export function checkRequirements(packs: LoadedPack[], substrateVersion: string): void {
  const versions = new Map(packs.map(p => [p.manifest.id, p.manifest.version]))
  for (const p of packs) {
    const req = p.manifest.requires
    if (req.substrate && !semver.satisfies(substrateVersion, req.substrate, { includePrerelease: true })) {
      throw new PackResolutionError(`pack ${p.manifest.id} requires substrate ${req.substrate}, running ${substrateVersion}`)
    }
    for (const [canonId, range] of Object.entries(req.canon)) {
      const v = versions.get(canonId)
      if (!v) throw new PackResolutionError(`pack ${p.manifest.id} requires canon ${canonId}@${range}; pack ${canonId} is not loaded`)
      if (!semver.satisfies(v, range, { includePrerelease: true })) throw new PackResolutionError(`pack ${p.manifest.id} requires canon ${canonId}@${range}; loaded ${canonId}@${v}`)
    }
  }
}

export function mergePacks(input: LoadedPack[], substrateVersion: string): MergedPack {
  const ordered = orderPacks(input)
  checkRequirements(ordered, substrateVersion)
  const m: MergedPack = {
    packs: [], canonPaths: [], locked: [], entities: [], forbiddenPatterns: [],
    rubrics: new Map(), defaultRubric: {}, templates: new Map(), prompts: new Map(), styles: new Map(),
    registry: { preferences: {}, intents: [], pins: {}, deny: [], providers: { prefer: [] } },
    voice: { principles: [], avoid: [], bannedPhrases: [], files: [] },
    publishing: { channels: {} }, tools: [], digest: '',
  }
  const seenBanned = new Set<string>()
  const seenDeny = new Set<string>()
  for (const p of ordered) {
    const { manifest: man, dir } = p
    const id = man.id
    m.packs.push({ id, version: man.version, name: man.name, license: man.license.type, publicSafe: man.publicSafe, dir, digest: p.digest })
    for (const pattern of man.canon.paths) m.canonPaths.push({ packId: id, dir, pattern })
    if (man.canon.locked) m.locked.push({ packId: id, dir, path: man.canon.locked })
    if (man.canon.entities) m.entities.push({ packId: id, dir, path: man.canon.entities })
    for (const fp of man.canon.forbiddenPatterns) m.forbiddenPatterns.push({ packId: id, ...fp })
    for (const r of man.rubrics) {
      m.rubrics.set(r.id, { ...r, packId: id, dir })
      if (r.default) m.defaultRubric[r.kind] = r.id
    }
    for (const t of man.templates) m.templates.set(t.id, { packId: id, dir, path: t.path, kind: t.kind, tags: t.tags, ...(t.description ? { description: t.description } : {}) })
    for (const pr of man.prompts) m.prompts.set(pr.id, { packId: id, dir, path: pr.path, ...(pr.description ? { description: pr.description } : {}) })
    for (const s of man.styles) m.styles.set(s.id, { ...s, packId: id })
    for (const [k, v] of Object.entries(man.registry.preferences)) m.registry.preferences[k] = [...v]
    m.registry.intents = [...man.registry.intents, ...m.registry.intents]
    for (const [task, model] of Object.entries(man.registry.pins)) (m.registry.pins as Record<string, string>)[task] = model
    for (const d of man.registry.deny) if (!seenDeny.has(d)) { seenDeny.add(d); m.registry.deny.push(d) }
    if (man.registry.providers.prefer.length) m.registry.providers.prefer = [...man.registry.providers.prefer]
    m.voice.principles.push(...man.voice.principles)
    m.voice.avoid.push(...man.voice.avoid)
    for (const b of man.voice.bannedPhrases) {
      const key = b.toLowerCase()
      if (!seenBanned.has(key)) { seenBanned.add(key); m.voice.bannedPhrases.push(b) }
    }
    if (man.voice.register) m.voice.register = man.voice.register
    for (const f of man.voice.files) m.voice.files.push({ packId: id, dir, path: f })
    if (man.publishing.requireRubric) m.publishing.requireRubric = man.publishing.requireRubric
    if (man.publishing.minScore !== undefined) m.publishing.minScore = Math.max(m.publishing.minScore ?? 0, man.publishing.minScore)
    Object.assign(m.publishing.channels, man.publishing.channels)
    for (const t of man.tools) m.tools.push({ packId: id, dir, path: t })
    if (man.init) m.init = { packId: id, dir: man.init.dir }
  }
  m.digest = ordered.map(p => `${p.manifest.id}@${p.manifest.version}:${p.digest}`).join('|')
  return m
}
