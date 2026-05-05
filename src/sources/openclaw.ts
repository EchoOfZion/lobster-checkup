import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionCandidate } from '../core/types'
import { isWithinDays, readJsonFile } from './common'

type Options = {
  homeDir: string
  days: number
  now?: Date
}

type OpenClawSessionEntry = {
  id?: string
  sessionId?: string
  updatedAt?: string
  createdAt?: string
}

type OpenClawSessionIndex =
  | OpenClawSessionEntry[]
  | { sessions?: OpenClawSessionEntry[]; items?: OpenClawSessionEntry[]; data?: OpenClawSessionEntry[] }

export function discoverOpenClawSessions(options: Options): SessionCandidate[] {
  const agentsDir = join(options.homeDir, '.openclaw', 'agents')
  if (!existsSync(agentsDir)) return []

  const candidates: SessionCandidate[] = []
  for (const agentId of readdirSync(agentsDir)) {
    const sessionsDir = join(agentsDir, agentId, 'sessions')
    const indexPath = join(sessionsDir, 'sessions.json')
    const index = normalizeIndex(readJsonFile<OpenClawSessionIndex>(indexPath))
    if (index.length === 0) continue

    for (const item of index) {
      const id = item.sessionId || item.id
      if (!id) continue
      const transcriptPath = join(sessionsDir, `${id}.jsonl`)
      if (!existsSync(transcriptPath)) continue
      if (!isWithinDays(transcriptPath, options.days, options.now)) continue

      candidates.push({
        source: 'openclaw',
        id,
        transcriptPath,
        agentId,
        startedAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
    }
  }

  return candidates
}

function normalizeIndex(index: OpenClawSessionIndex | null): OpenClawSessionEntry[] {
  if (!index) return []
  if (Array.isArray(index)) return index
  if (Array.isArray(index.sessions)) return index.sessions
  if (Array.isArray(index.items)) return index.items
  if (Array.isArray(index.data)) return index.data
  return []
}
