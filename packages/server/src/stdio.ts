#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createCreatorServer } from './create-server.js'
import { defaultProviders, packsFromEnv } from './defaults.js'

export async function serveCreatorStdio(opts: { name?: string; version?: string; packs?: string[] } = {}): Promise<void> {
  const { server } = await createCreatorServer({ name: opts.name ?? 'starlight-creator-mcp', version: opts.version ?? '0.1.0', packs: opts.packs ?? packsFromEnv(), providers: defaultProviders })
  serveStdio(() => server)
}

if (process.argv[1] && /stdio\.(js|ts)$/.test(process.argv[1])) {
  serveCreatorStdio().catch(err => { process.stderr.write(`${(err as Error).stack ?? err}\n`); process.exit(1) })
}
