export interface BestOfOptions {
  bestOf: number
  minScore?: number
  maxRerolls?: number
}

export interface Candidate<T> { value: T; score: number | null; attempt: number }

export interface BestOfResult<T> { best: Candidate<T>; candidates: Candidate<T>[]; attempts: number; stoppedBy: 'threshold' | 'exhausted' | 'single' }

export const MAX_BEST_OF = 6

export async function generateBestOf<T>(
  produce: (attempt: number) => Promise<T>,
  score: ((value: T) => Promise<number | null>) | null,
  opts: BestOfOptions,
): Promise<BestOfResult<T>> {
  const wanted = Math.min(Math.max(opts.bestOf, 1), MAX_BEST_OF)
  const cap = Math.min(Math.max(opts.maxRerolls ?? (opts.minScore !== undefined ? Math.max(wanted, 4) : wanted), 1), MAX_BEST_OF)
  const candidates: Candidate<T>[] = []
  if (!score || (wanted === 1 && opts.minScore === undefined)) {
    const value = await produce(1)
    const c = { value, score: score ? await score(value) : null, attempt: 1 }
    return { best: c, candidates: [c], attempts: 1, stoppedBy: 'single' }
  }
  let attempt = 0
  while (attempt < cap) {
    attempt++
    const value = await produce(attempt)
    const s = await score(value)
    candidates.push({ value, score: s, attempt })
    if (opts.minScore !== undefined && s !== null && s >= opts.minScore) return { best: pickBest(candidates), candidates, attempts: attempt, stoppedBy: 'threshold' }
    if (opts.minScore === undefined && attempt >= wanted) break
  }
  return { best: pickBest(candidates), candidates, attempts: attempt, stoppedBy: 'exhausted' }
}

function pickBest<T>(candidates: Candidate<T>[]): Candidate<T> {
  return [...candidates].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.attempt - b.attempt)[0]!
}
