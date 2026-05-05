import type { NormalizedMessage, NormalizedSession, SessionCandidate, ToolCall } from '../core/types'
import { buildSession } from './claude-code'

type CodexRecord = {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

export function parseCodexSession(candidate: SessionCandidate, lines: string[]): NormalizedSession {
  const messages: NormalizedMessage[] = []
  let sessionId = candidate.id
  let startedAt: string | undefined
  let projectPath = candidate.projectPath

  for (const line of lines) {
    const record = parseJson<CodexRecord>(line)
    if (!record) continue

    if (record.type === 'session_meta') {
      const payload = record.payload || {}
      sessionId = stringValue(payload.id) || sessionId
      startedAt = stringValue(payload.timestamp) || record.timestamp || startedAt
      projectPath = stringValue(payload.cwd) || projectPath
      continue
    }

    const message = codexRecordToMessage(record)
    if (message) messages.push(message)
  }

  return buildSession({ ...candidate, projectPath }, sessionId, startedAt, messages)
}

function codexRecordToMessage(record: CodexRecord): NormalizedMessage | null {
  const payload = record.payload || {}

  if (record.type === 'response_item') {
    if (payload.type === 'message') return codexMessage(record.timestamp, payload)
    if (payload.type === 'function_call') return codexToolCall(record.timestamp, payload)
    if (payload.type === 'function_call_output') return codexToolResult(record.timestamp, payload)
  }

  if (record.type === 'event_msg') {
    if (payload.type === 'agent_message') {
      return { role: 'assistant', text: stringValue(payload.message), timestamp: record.timestamp }
    }
    if (payload.type === 'exec_command_end') {
      return codexToolResult(record.timestamp, {
        call_id: payload.call_id,
        output: stringValue(payload.aggregated_output) || stringValue(payload.stdout),
      })
    }
  }

  return null
}

function codexMessage(timestamp: string | undefined, payload: Record<string, unknown>): NormalizedMessage {
  const role = payload.role === 'assistant' ? 'assistant' : payload.role === 'user' ? 'user' : 'system'
  return {
    role,
    text: contentText(payload.content),
    timestamp,
    toolCalls: [],
    toolResults: new Map(),
  } as NormalizedMessage
}

function codexToolCall(timestamp: string | undefined, payload: Record<string, unknown>): NormalizedMessage {
  const toolCall: ToolCall = {
    id: stringValue(payload.call_id),
    name: stringValue(payload.name),
    args: parseArgs(payload.arguments),
    isError: false,
  }
  return {
    role: 'assistant',
    text: '',
    timestamp,
    stopReason: 'toolUse',
    toolCalls: [toolCall],
    toolResults: new Map(),
  } as NormalizedMessage
}

function codexToolResult(timestamp: string | undefined, payload: Record<string, unknown>): NormalizedMessage {
  const toolResults = new Map<string, { result: string; isError: boolean }>()
  const output = stringValue(payload.output)
  toolResults.set(stringValue(payload.call_id), {
    result: output,
    isError: /exit code [1-9]|error|failed|exception/i.test(output),
  })
  return {
    role: 'user',
    text: '',
    timestamp,
    toolCalls: [],
    toolResults,
  } as NormalizedMessage
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((item) => {
    if (typeof item === 'string') return item
    const record = item as Record<string, unknown>
    return stringValue(record.text)
  }).filter(Boolean).join('\n')
}

function parseArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || value.length === 0) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return { _raw: value }
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseJson<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T
  } catch {
    return null
  }
}
