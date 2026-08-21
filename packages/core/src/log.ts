export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const SECRET_SHAPES = [
  /\b(?:sk|key|polar|xi|fal|mu|or|pk|rk)[-_][A-Za-z0-9_-]{12,}\b/g,
  /\b[A-Za-z0-9_-]{32,}\b/g,
  /(Bearer\s+)[A-Za-z0-9._-]{8,}/gi,
]

export class Redactor {
  private readonly known = new Set<string>()
  add(secret: string | null | undefined): void { if (secret && secret.length >= 6) this.known.add(secret) }
  redact(input: string): string {
    let out = input
    for (const s of this.known) out = out.split(s).join('[redacted]')
    for (const re of SECRET_SHAPES) out = out.replace(re, (...args: unknown[]) => (typeof args[1] === 'string' ? `${args[1]}[redacted]` : '[redacted]'))
    return out
  }
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void
  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, data?: Record<string, unknown>): void
  child(scope: string): Logger
}

export function createLogger(opts: { level?: LogLevel; redactor: Redactor; scope?: string; sink?: (line: string) => void } ): Logger {
  const level = opts.level ?? ((process.env.CREATOR_LOG_LEVEL as LogLevel | undefined) ?? 'info')
  const sink = opts.sink ?? ((line: string) => process.stderr.write(`${line}\n`))
  const emit = (lvl: LogLevel, msg: string, data?: Record<string, unknown>) => {
    if (LEVELS[lvl] < LEVELS[level]) return
    const payload = { t: new Date().toISOString(), level: lvl, scope: opts.scope ?? 'creator', msg, ...(data ?? {}) }
    sink(opts.redactor.redact(JSON.stringify(payload)))
  }
  return {
    debug: (m, d) => emit('debug', m, d),
    info: (m, d) => emit('info', m, d),
    warn: (m, d) => emit('warn', m, d),
    error: (m, d) => emit('error', m, d),
    child: scope => createLogger({ ...opts, level, scope: opts.scope ? `${opts.scope}.${scope}` : scope }),
  }
}
