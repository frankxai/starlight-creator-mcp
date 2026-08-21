#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { lintText, loadEntities } from './canon-lint.js'
import { computePackDigest, loadPack } from './load.js'
import { mergePacks } from './merge.js'
import { PACK_SCHEMA_VERSION, packJsonSchema } from './schema.js'
import { validatePackDir } from './validate.js'

const USAGE = `creator-pack <command> [args]

  validate <dir>            validate pack.json and referenced files
  digest <dir>              print the pack digest (sha256 of manifest + files)
  lint-canon <dir> <file>   check a text file against the pack's canon rules
  init <dir> [id]           scaffold a minimal pack
  schema                    print pack.schema.json
`

function printIssues(issues: Array<{ level: string; path: string; message: string }>): void {
  for (const i of issues) process.stderr.write(`${i.level.toUpperCase().padEnd(7)} ${i.path}: ${i.message}\n`)
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv
  switch (cmd) {
    case 'validate': {
      const dir = rest[0] ?? '.'
      const v = await validatePackDir(dir)
      printIssues(v.issues)
      process.stdout.write(v.ok ? `OK ${v.manifest?.id}@${v.manifest?.version}\n` : 'INVALID\n')
      return v.ok ? 0 : 1
    }
    case 'digest': {
      const dir = rest[0] ?? '.'
      const v = await validatePackDir(dir)
      if (!v.ok || !v.manifest) { printIssues(v.issues); return 1 }
      process.stdout.write(`${await computePackDigest(dir, v.manifest)}\n`)
      return 0
    }
    case 'lint-canon': {
      const [dir, file] = rest
      if (!dir || !file) { process.stderr.write(USAGE); return 2 }
      const pack = await loadPack(dir)
      const merged = mergePacks([pack], '0.0.0')
      const entities = await loadEntities(merged)
      const result = lintText(await readFile(file, 'utf8'), merged, entities)
      for (const f of result.findings) process.stdout.write(`VIOLATION ${f.message} :: …${f.excerpt}…\n`)
      for (const u of result.unknownEntities) process.stdout.write(`UNKNOWN entity ${u}\n`)
      process.stdout.write(result.ok ? 'OK canon\n' : 'FAIL canon\n')
      return result.ok ? 0 : 1
    }
    case 'init': {
      const dir = rest[0]
      if (!dir) { process.stderr.write(USAGE); return 2 }
      const id = rest[1] ?? path.basename(path.resolve(dir)).toLowerCase().replace(/[^a-z0-9-]+/g, '-')
      await mkdir(path.join(dir, 'rubrics'), { recursive: true })
      await mkdir(path.join(dir, 'prompts'), { recursive: true })
      const manifest = {
        schemaVersion: PACK_SCHEMA_VERSION, id, name: id, version: '0.1.0',
        license: { type: 'Proprietary' }, publicSafe: true,
        rubrics: [{ id: 'visual-taste', kind: 'image', default: true, dimensions: [{ id: 'composition', weight: 40 }, { id: 'lighting', weight: 30 }, { id: 'artifacts', weight: 30, invert: true }], thresholds: { ship: 80, focused_pass: 60, draft: 40 }, promptFile: 'rubrics/visual-taste.md' }],
        prompts: [], styles: [], registry: { preferences: {} },
      }
      await writeFile(path.join(dir, 'pack.json'), `${JSON.stringify(manifest, null, 2)}\n`)
      await writeFile(path.join(dir, 'rubrics', 'visual-taste.md'), '# Visual taste\n\nYou are an exacting art director. Score the image on composition, lighting, and absence of generation artifacts.\n')
      process.stdout.write(`created pack ${id} at ${dir}\n`)
      return 0
    }
    case 'schema':
      process.stdout.write(`${JSON.stringify(packJsonSchema(), null, 2)}\n`)
      return 0
    default:
      process.stderr.write(USAGE)
      return cmd ? 2 : 0
  }
}

if (process.argv[1] && /cli\.(js|ts)$/.test(process.argv[1])) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code }, err => { process.stderr.write(`${(err as Error).message}\n`); process.exitCode = 1 })
}
