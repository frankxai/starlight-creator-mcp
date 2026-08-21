import path from 'node:path'
import { creatorHome } from '../config.js'
import type { Ledger } from './interface.js'
import { JsonlLedger } from './jsonl.js'
import { SqliteLedger, sqliteAvailable } from './sqlite.js'

export * from './interface.js'
export { JsonlLedger } from './jsonl.js'
export { SqliteLedger, sqliteAvailable } from './sqlite.js'

export function openLedger(opts: { home?: string; backend?: 'auto' | 'sqlite' | 'jsonl' | 'memory' } = {}): Ledger {
  const home = opts.home ?? creatorHome()
  const backend = opts.backend ?? (process.env.CREATOR_LEDGER_BACKEND as 'auto' | 'sqlite' | 'jsonl' | 'memory' | undefined) ?? 'auto'
  if (backend === 'memory') return new JsonlLedger(null)
  if (backend === 'jsonl') return new JsonlLedger(path.join(home, 'ledger.jsonl'))
  if (backend === 'sqlite' || sqliteAvailable()) return new SqliteLedger(path.join(home, 'ledger.db'))
  return new JsonlLedger(path.join(home, 'ledger.jsonl'))
}
