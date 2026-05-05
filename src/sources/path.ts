import { statSync } from 'node:fs'
import type { SessionCandidate } from '../core/types'
import { jsonlId, listJsonlFiles } from './common'

type Options = {
  path: string
}

export function discoverPathSessions(options: Options): SessionCandidate[] {
  const stat = statSync(options.path)
  const files = stat.isDirectory() ? listJsonlFiles(options.path) : [options.path]

  return files
    .filter((file) => file.endsWith('.jsonl'))
    .map((file) => ({
      source: 'path',
      id: jsonlId(file),
      transcriptPath: file,
    }))
}
