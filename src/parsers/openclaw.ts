import type { NormalizedMessage, NormalizedSession, SessionCandidate, ToolCall } from '../core/types'
import { buildSession, normalizeStopReason, normalizeUsage } from './claude-code'

type OpenClawRecord = {
  type?: string
  id?: string
  timestamp?: string
  message?: {
    role?: string
    model?: string
    content?: unknown
    stopReason?: string
    usage?: Record<string, unknown>
  }
}

export function parseOpenClawSession(candidate: SessionCandidate, lines: string[]): NormalizedSession {
  const messages: NormalizedMessage[] = []
  let sessionId = candidate.id
  let startedAt: string | undefined

  for (const line of lines) {
    const record = parseJson<OpenClawRecord>(line)
    if (!record) continue

    if (record.type === 'session') {
      sessionId = record.id || sessionId
      startedAt = record.timestamp || startedAt
      continue
    }

    if (record.type === 'message' && record.message) {
      messages.push(normalizeOpenClawMessage(record))
      startedAt = startedAt || record.timestamp
    }
  }

  return buildSession(candidate, sessionId, startedAt, messages)
}

function normalizeOpenClawMessage(record: OpenClawRecord): NormalizedMessage {
  const message = record.message || {}
  const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : 'system'
  const parsed = readOpenClawContent(message.content)
  return {
    ...parsed,
    role,
    text: parsed.text,
    timestamp: record.timestamp,
    model: role === 'assistant' ? message.model : undefined,
    stopReason: role === 'assistant' ? normalizeStopReason(message.stopReason, message.content) : undefined,
    usage: role === 'assistant' ? normalizeUsage(message.usage) : undefined,
  }
}

function readOpenClawContent(content: unknown): { text: string; toolCalls: ToolCall[]; toolResults: Map<string, { result: string; isError: boolean }> } {
  if (typeof content === 'string') return { text: content, toolCalls: [], toolResults: new Map() }
  if (!Array.isArray(content)) return { text: '', toolCalls: [], toolResults: new Map() }

  const text: string[] = []
  const toolCalls: ToolCall[] = []
  const toolResults = new Map<string, { result: string; isError: boolean }>()

  for (const block of content as Record<string, unknown>[]) {
    if (block.type === 'text') text.push(String(block.text || ''))
    if (block.type === 'toolCall') {
      toolCalls.push({
        id: String(block.toolUseId || block.id || ''),
        name: String(block.toolName || block.name || ''),
        args: asRecord(block.args),
        isError: false,
      })
    }
    if (block.type === 'toolResult') {
      toolResults.set(String(block.toolUseId || block.toolCallId || ''), {
        result: String(block.result || block.text || ''),
        isError: Boolean(block.isError),
      })
    }
  }

  return { text: text.join('\n'), toolCalls, toolResults }
}

function parseJson<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
