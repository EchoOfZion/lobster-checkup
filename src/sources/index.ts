import { homedir } from 'node:os'
import type { AgentSource, DiscoveryDiagnostic, SessionCandidate } from '../core/types'
import { discoverClaudeCodeSessions } from './claude-code'
import { discoverCodexSessions } from './codex'
import { discoverDockerOpenClawSessions } from './docker-openclaw'
import { discoverHermesSessions } from './hermes'
import { discoverOpenClawSessions } from './openclaw'
import { discoverPathSessions } from './path'

export type DiscoverOptions = {
  cwd: string
  homeDir?: string
  days: number
  source?: AgentSource
  path?: string
  now?: Date
}

export function discoverSessions(options: DiscoverOptions): { candidates: SessionCandidate[]; diagnostics: DiscoveryDiagnostic[] } {
  if (options.path) {
    const candidates = discoverPathSessions({ path: options.path })
    return {
      candidates,
      diagnostics: [{
        source: 'path',
        status: candidates.length > 0 ? 'ok' : 'empty',
        message: `Explicit path discovery returned ${candidates.length} session(s).`,
        candidates: candidates.length,
      }],
    }
  }

  const homeDir = options.homeDir || homedir()
  const sources: AgentSource[] = options.source ? [options.source] : ['claude-code', 'codex', 'openclaw', 'docker-openclaw', 'hermes']
  const candidates: SessionCandidate[] = []
  const diagnostics: DiscoveryDiagnostic[] = []

  for (const source of sources) {
    if (source === 'path') continue
    try {
      const found = discoverSource(source, { cwd: options.cwd, homeDir, days: options.days, now: options.now })

      candidates.push(...found)
      diagnostics.push({
        source,
        status: found.length > 0 ? 'ok' : 'empty',
        message: `${source} discovery returned ${found.length} session(s).`,
        candidates: found.length,
      })
    } catch (error) {
      diagnostics.push({
        source,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        candidates: 0,
      })
    }
  }

  return { candidates, diagnostics }
}

function discoverSource(
  source: AgentSource,
  options: { cwd: string; homeDir: string; days: number; now?: Date },
): SessionCandidate[] {
  if (source === 'claude-code') return discoverClaudeCodeSessions(options)
  if (source === 'codex') return discoverCodexSessions(options)
  if (source === 'openclaw') return discoverOpenClawSessions(options)
  if (source === 'docker-openclaw') return discoverDockerOpenClawSessions(options)
  if (source === 'hermes') return discoverHermesSessions(options)
  return []
}
