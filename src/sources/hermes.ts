import { join } from 'node:path'
import type { SessionCandidate } from '../core/types'
import { isWithinDays, jsonlId, listJsonlFiles } from './common'

type Options = {
  homeDir: string
  days: number
  now?: Date
}

export function discoverHermesSessions(options: Options): SessionCandidate[] {
  const sessionsDir = join(options.homeDir, '.hermes', 'sessions')
  return listJsonlFiles(sessionsDir)
    .filter((file) => isWithinDays(file, options.days, options.now))
    .map((file) => ({
      source: 'hermes',
      id: jsonlId(file),
      transcriptPath: file,
    }))
}
