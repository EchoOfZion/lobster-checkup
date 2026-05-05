import type { NormalizedMessage, NormalizedSession, SessionCandidate, ToolCall } from '../core/types'
import { buildSession, normalizeUsage } from './claude-code'

type HermesRecord = {
  role?: string
  content?: string
  timestamp?: string
  model?: string
  finish_reason?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id?: string
    call_id?: string
    function?: {
      name?: string
      arguments?: string
    }
  }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cost?: number
  }
}

export function parseHermesSession(candidate: SessionCandidate, lines: string[]): NormalizedSession {
  const messages: NormalizedMessage[] = []
  let startedAt: string | undefined
  let model = 'unknown'

  for (const line of lines) {
    const record = parseJson<HermesRecord>(line)
    if (!record) continue

    if (record.role === 'session_meta') {
      startedAt = record.timestamp || startedAt
      model = record.model || model
      continue
    }

    if (record.role === 'user' || record.role === 'assistant' || record.role === 'tool') {
      messages.push(normalizeHermesMessage(record, model))
      startedAt = startedAt || record.timestamp
    }
  }

  return buildSession(candidate, candidate.id, startedAt, messages)
}

function normalizeHermesMessage(record: HermesRecord, model: string): NormalizedMessage {
  if (record.role === 'tool') {
    const toolResults = new Map<string, { result: string; isError: boolean }>()
    const content = record.content || ''
    toolResults.set(record.tool_call_id || '', {
      result: content,
      isError: isErrorContent(content),
    })
    return {
      role: 'user',
      text: '',
      timestamp: record.timestamp,
      toolCalls: [],
      toolResults,
    } as NormalizedMessage
  }

  const toolCalls: ToolCall[] = []
  for (const toolCall of record.tool_calls || []) {
    toolCalls.push({
      id: toolCall.id || toolCall.call_id || '',
      name: toolCall.function?.name || '',
      args: parseArgs(toolCall.function?.arguments || ''),
      isError: false,
    })
  }

  return {
    role: record.role === 'assistant' ? 'assistant' : 'user',
    text: record.content || '',
    timestamp: record.timestamp,
    model: record.role === 'assistant' ? model : undefined,
    stopReason: record.role === 'assistant'
      ? toolCalls.length > 0 ? 'toolUse' : record.finish_reason === 'length' ? 'maxTokens' : 'stop'
      : undefined,
    usage: record.role === 'assistant'
      ? normalizeUsage({
        input_tokens: record.usage?.input_tokens,
        output_tokens: record.usage?.output_tokens,
        cost: record.usage?.cost,
      })
      : undefined,
    toolCalls,
    toolResults: new Map(),
  } as NormalizedMessage
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return raw ? { _raw: raw } : {}
  }
}

function isErrorContent(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return Boolean(parsed.error || parsed.success === false)
  } catch {
    return /error|failed|exception/i.test(content)
  }
}

function parseJson<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T
  } catch {
    return null
  }
}
