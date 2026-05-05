import { readFileSync } from 'node:fs'
import type { NormalizedSession, SessionCandidate } from '../core/types'
import { parseClaudeCodeSession } from './claude-code'
import { parseCodexSession } from './codex'
import { parseHermesSession } from './hermes'
import { parseOpenClawSession } from './openclaw'

export function parseSession(candidate: SessionCandidate): NormalizedSession {
  const lines = readFileSync(candidate.transcriptPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)

  if (candidate.source === 'claude-code') return parseClaudeCodeSession(candidate, lines)
  if (candidate.source === 'codex') return parseCodexSession(candidate, lines)
  if (candidate.source === 'openclaw') return parseOpenClawSession(candidate, lines)
  if (candidate.source === 'docker-openclaw') return parseOpenClawSession(candidate, lines)
  if (candidate.source === 'hermes') return parseHermesSession(candidate, lines)

  return parseByDetection(candidate, lines)
}

function parseByDetection(candidate: SessionCandidate, lines: string[]): NormalizedSession {
  for (const line of lines.slice(0, 10)) {
    try {
      const record = JSON.parse(line) as Record<string, unknown>
      if (record.type === 'summary' || record.type === 'user' || record.type === 'assistant') {
        return parseClaudeCodeSession({ ...candidate, source: 'claude-code' }, lines)
      }
      if (record.type === 'session' || record.type === 'message' || record.type === 'model_change') {
        return parseOpenClawSession({ ...candidate, source: 'openclaw' }, lines)
      }
      if (record.role === 'session_meta' || record.role === 'user' || record.role === 'assistant') {
        return parseHermesSession({ ...candidate, source: 'hermes' }, lines)
      }
      if (record.type === 'session_meta' || record.type === 'response_item' || record.type === 'event_msg') {
        return parseCodexSession({ ...candidate, source: 'codex' }, lines)
      }
    } catch {
      continue
    }
  }

  throw new Error(`Unknown session format: ${candidate.transcriptPath}`)
}

export function parseSessions(candidates: SessionCandidate[]): NormalizedSession[] {
  const sessions: NormalizedSession[] = []
  for (const candidate of candidates) {
    try {
      sessions.push(parseSession(candidate))
    } catch {
      continue
    }
  }
  return sessions
}
