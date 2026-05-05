import type { NormalizedMessage, NormalizedSession, NormalizedTurn, SessionCandidate, ToolCall } from '../core/types'

type ClaudeRecord = {
  type?: string
  timestamp?: string
  sessionId?: string
  message?: {
    role?: string
    model?: string
    content?: unknown
    stop_reason?: string
    stopReason?: string
    usage?: Record<string, unknown>
  }
}

export function parseClaudeCodeSession(candidate: SessionCandidate, lines: string[]): NormalizedSession {
  const messages: NormalizedMessage[] = []
  let sessionId = candidate.id
  let startedAt: string | undefined

  for (const line of lines) {
    const record = parseJson<ClaudeRecord>(line)
    if (!record) continue

    if (record.type === 'summary') {
      sessionId = record.sessionId || sessionId
      startedAt = record.timestamp || startedAt
      continue
    }

    if ((record.type === 'user' || record.type === 'assistant') && record.message) {
      messages.push(normalizeClaudeMessage(record))
      startedAt = startedAt || record.timestamp
    }
  }

  return buildSession(candidate, sessionId, startedAt, messages)
}

function normalizeClaudeMessage(record: ClaudeRecord): NormalizedMessage {
  const message = record.message || {}
  const role = record.type === 'assistant' ? 'assistant' : 'user'
  const parsed = readContent(message.content)
  return {
    ...parsed,
    role,
    text: parsed.text,
    timestamp: record.timestamp,
    model: role === 'assistant' ? message.model : undefined,
    stopReason: role === 'assistant' ? normalizeStopReason(message.stop_reason || message.stopReason, message.content) : undefined,
    usage: role === 'assistant' ? normalizeUsage(message.usage) : undefined,
  }
}

export function readContent(content: unknown): { text: string; toolCalls: ToolCall[]; toolResults: Map<string, { result: string; isError: boolean }> } {
  if (typeof content === 'string') return { text: content, toolCalls: [], toolResults: new Map() }
  if (!Array.isArray(content)) return { text: '', toolCalls: [], toolResults: new Map() }

  const text: string[] = []
  const toolCalls: ToolCall[] = []
  const toolResults = new Map<string, { result: string; isError: boolean }>()

  for (const block of content as Record<string, unknown>[]) {
    if (block.type === 'text') text.push(String(block.text || ''))
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: String(block.id || ''),
        name: String(block.name || ''),
        args: asRecord(block.input),
        isError: false,
      })
    }
    if (block.type === 'tool_result') {
      toolResults.set(String(block.tool_use_id || ''), {
        result: contentToText(block.content),
        isError: Boolean(block.is_error || block.isError),
      })
    }
  }

  return { text: text.join('\n'), toolCalls, toolResults }
}

export function buildSession(
  candidate: SessionCandidate,
  sessionId: string,
  startedAt: string | undefined,
  messages: NormalizedMessage[],
): NormalizedSession {
  const turns: NormalizedTurn[] = []
  let current: {
    userText: string
    assistantText: string[]
    toolCalls: ToolCall[]
    finalStopReason: 'stop' | 'toolUse' | 'maxTokens'
    costUsd: number
    inputTokens: number
    outputTokens: number
  } | null = null

  const flush = () => {
    if (!current) return
    turns.push({
      index: turns.length,
      userText: current.userText,
      assistantText: current.assistantText.filter(Boolean).join('\n'),
      toolCalls: current.toolCalls,
      finalStopReason: current.finalStopReason,
      costUsd: current.costUsd,
      inputTokens: current.inputTokens,
      outputTokens: current.outputTokens,
    })
    current = null
  }

  for (const message of messages) {
    const parsed = readContentFromMessage(message)
    if (parsed.toolResults.size > 0 && current) {
      attachResults(current.toolCalls, parsed.toolResults)
      continue
    }

    if (message.role === 'user') {
      flush()
      current = {
        userText: message.text,
        assistantText: [],
        toolCalls: [],
        finalStopReason: 'stop',
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      }
      continue
    }

    if (message.role === 'assistant') {
      if (!current) {
        current = {
          userText: '',
          assistantText: [],
          toolCalls: [],
          finalStopReason: 'stop',
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        }
      }
      current.assistantText.push(message.text)
      current.toolCalls.push(...parsed.toolCalls)
      current.finalStopReason = message.stopReason || 'stop'
      current.costUsd += message.usage?.costUsd || 0
      current.inputTokens += message.usage?.inputTokens || 0
      current.outputTokens += message.usage?.outputTokens || 0
    }
  }
  flush()

  const usage = turns.reduce(
    (sum, turn) => ({
      inputTokens: sum.inputTokens + turn.inputTokens,
      outputTokens: sum.outputTokens + turn.outputTokens,
      costUsd: sum.costUsd + turn.costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  )

  return {
    source: candidate.source,
    id: sessionId,
    transcriptPath: candidate.transcriptPath,
    projectPath: candidate.projectPath,
    agentId: candidate.agentId,
    startedAt,
    endedAt: messages[messages.length - 1]?.timestamp,
    turns,
    usage,
  }
}

function readContentFromMessage(message: NormalizedMessage): ReturnType<typeof readContent> {
  const parsed = message as NormalizedMessage & Partial<ReturnType<typeof readContent>>
  return {
    text: parsed.text,
    toolCalls: parsed.toolCalls || [],
    toolResults: parsed.toolResults || new Map(),
  }
}

export function normalizeStopReason(raw: unknown, content: unknown): 'stop' | 'toolUse' | 'maxTokens' {
  if (raw === 'tool_use' || raw === 'toolUse') return 'toolUse'
  if (raw === 'max_tokens' || raw === 'maxTokens') return 'maxTokens'
  if (raw === 'end_turn' || raw === 'stop') return 'stop'
  if (Array.isArray(content) && content.some((block) => (block as Record<string, unknown>).type === 'tool_use')) return 'toolUse'
  return 'stop'
}

export function normalizeUsage(usage: Record<string, unknown> | undefined) {
  if (!usage) return undefined
  const cost = usage.cost as Record<string, unknown> | number | undefined
  return {
    inputTokens: numberValue(usage.input_tokens) || numberValue(usage.input),
    outputTokens: numberValue(usage.output_tokens) || numberValue(usage.output),
    costUsd: typeof cost === 'number' ? cost : numberValue(cost?.total),
  }
}

function attachResults(toolCalls: ToolCall[], results: Map<string, { result: string; isError: boolean }>): void {
  for (const toolCall of toolCalls) {
    const result = results.get(toolCall.id)
    if (!result) continue
    toolCall.result = result.result
    toolCall.isError = result.isError
  }
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

function contentToText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string' ? item : String((item as Record<string, unknown>).text || '')).join('\n')
  }
  return value == null ? '' : String(value)
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
