import { randomBytes } from 'node:crypto'

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

let lastTime = 0
let lastRandom: number[] = []

function encodeTime(time: number): string {
  let out = ''
  for (let i = 9; i >= 0; i--) {
    out = ENCODING[time % 32] + out
    time = Math.floor(time / 32)
  }
  return out
}

export function ulid(now = Date.now()): string {
  let random: number[]
  if (now === lastTime) {
    random = [...lastRandom]
    for (let i = random.length - 1; i >= 0; i--) {
      if (random[i]! < 31) { random[i]!++; break }
      random[i] = 0
    }
  } else {
    const bytes = randomBytes(16)
    random = Array.from(bytes, b => b % 32)
  }
  lastTime = now
  lastRandom = random
  return encodeTime(now) + random.map(r => ENCODING[r]).join('')
}

export function shortId(prefix: string, length = 10): string {
  return `${prefix}_${randomBytes(Math.ceil(length * 0.75)).toString('base64url').slice(0, length)}`
}
