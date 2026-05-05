import { join } from 'node:path'
import type { SessionCandidate } from '../core/types'
import { isWithinDays, jsonlId, listJsonlFiles } from './common'

type Options = {
  cwd: string
  homeDir: string
  days: number
  now?: Date
}

export function encodeClaudeProjectPath(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function discoverClaudeCodeSessions(options: Options): SessionCandidate[] {
  const projectDir = join(
    process.env.CLAUDE_CONFIG_DIR || join(options.homeDir, '.claude'),
    'projects',
    encodeClaudeProjectPath(options.cwd),
  )

  return listJsonlFiles(projectDir)
    .filter((file) => isWithinDays(file, options.days, options.now))
    .map((file) => ({
      source: 'claude-code',
      id: jsonlId(file),
      transcriptPath: file,
      projectPath: options.cwd,
      updatedAt: new Date().toISOString(),
    }))
}
