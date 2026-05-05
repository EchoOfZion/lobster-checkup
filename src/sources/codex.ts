import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionCandidate } from '../core/types'
import { isWithinDays, jsonlId } from './common'

type Options = {
  homeDir: string
  days: number
  now?: Date
}

export function discoverCodexSessions(options: Options): SessionCandidate[] {
  const sessionsDir = join(options.homeDir, '.codex', 'sessions')
  const files = listJsonlRecursive(sessionsDir)
    .filter((file) => isWithinDays(file, options.days, options.now))

  return files.map((file) => ({
    source: 'codex',
    id: jsonlId(file),
    transcriptPath: file,
  }))
}

function listJsonlRecursive(dir: string): string[] {
  if (!existsSync(dir)) return []
  const result: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...listJsonlRecursive(path))
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      try {
        if (statSync(path).isFile()) result.push(path)
      } catch {
        continue
      }
    }
  }
  return result
}
