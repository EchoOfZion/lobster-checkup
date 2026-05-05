import { createHash } from 'node:crypto'

type FingerprintInput = {
  source: string
  sessionId: string
  detector: string
  turnIndex?: number
  title: string
  evidence: Record<string, unknown>
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize(object[key])
        return result
      }, {})
  }

  return value
}

export function findingFingerprint(input: FingerprintInput): string {
  const payload = JSON.stringify(canonicalize(input))
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16)
  return `${input.detector}:${hash}`
}
