// ============================================================
// 龙虾体检 v4 — Claude Code JSONL 解析器
// ============================================================

import { estimateCost } from '../lib/pricing'
import type {
  SessionParser, ParsedSession, SessionMeta, Message,
  ContentBlock, Turn, ToolCallRecord,
} from './types'

// --- Raw JSONL record types (Claude Code format) ---

interface RawRecord {
  type: string
  timestamp?: string
  message?: {
    role?: string
    model?: string
    content?: unknown
    stop_reason?: string
    stopReason?: string
    usage?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

// --- Content block normalization ---

function normalizeContentBlocks(content: unknown): ContentBlock[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) return []

  return content.map((block: Record<string, unknown>): ContentBlock => {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: (block.text as string) || '' }

      case 'thinking':
        return { type: 'thinking', text: (block.thinking as string) || (block.text as string) || '' }

      case 'tool_use':
        return {
          type: 'toolCall',
          id: (block.id as string) || '',
          name: (block.name as string) || '',
          args: (block.input as Record<string, any>) || {},
        }

      case 'tool_result': {
        let resultText = ''
        const innerContent = block.content
        if (typeof innerContent === 'string') {
          resultText = innerContent
        } else if (Array.isArray(innerContent)) {
          resultText = innerContent
            .filter((c: Record<string, unknown>) => c.type === 'text')
            .map((c: Record<string, unknown>) => c.text)
            .join('\n')
        }
        return {
          type: 'toolResult',
          toolCallId: (block.tool_use_id as string) || '',
          content: resultText,
          isError: !!(block.is_error || block.isError),
        }
      }

      default:
        return { type: 'text', text: (block.text as string) || '' }
    }
  })
}

// --- Stop reason inference ---

function inferStopReason(msg: Record<string, unknown>): 'stop' | 'toolUse' | 'maxTokens' {
  const sr = (msg.stopReason || msg.stop_reason) as string | undefined
  if (sr) {
    if (sr === 'end_turn' || sr === 'stop') return 'stop'
    if (sr === 'tool_use' || sr === 'toolUse') return 'toolUse'
    if (sr === 'max_tokens' || sr === 'maxTokens') return 'maxTokens'
  }

  // Infer from content
  const content = msg.content
  if (Array.isArray(content) && content.length > 0) {
    const last = content[content.length - 1] as Record<string, unknown>
    if (last.type === 'tool_use') return 'toolUse'
    if (last.type === 'text') return 'stop'
  }

  return 'stop'
}

// --- Usage normalization ---

function normalizeUsage(usage: Record<string, unknown> | undefined, model: string | undefined): Message['usage'] | undefined {
  if (!usage) return undefined

  const inputTokens = (usage.input_tokens as number) || (usage.input as number) || 0
  const outputTokens = (usage.output_tokens as number) || (usage.output as number) || 0

  // Check if cost is directly available
  const costObj = usage.cost as Record<string, unknown> | undefined
  const directCost = costObj && typeof costObj.total === 'number' ? costObj.total : undefined

  const cost = directCost ?? estimateCost(model || 'unknown', inputTokens, outputTokens)

  return { inputTokens, outputTokens, cost }
}

// --- Turn building ---

function buildTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = []
  let current: {
    userMsg: Message | null
    assistantMsgs: Message[]
    toolCalls: ToolCallRecord[]
    cost: number
    toolCallCount: number
  } | null = null

  function flushTurn() {
    if (!current) return
    const lastAssistant = current.assistantMsgs[current.assistantMsgs.length - 1]
    turns.push({
      index: turns.length,
      userMessage: current.userMsg || {
        role: 'user', content: [], timestamp: undefined, usage: undefined,
      } as unknown as Message,
      assistantMessages: current.assistantMsgs,
      toolCalls: current.toolCalls,
      totalCost: current.cost,
      toolCallCount: current.toolCallCount,
      finalStopReason: lastAssistant?.stopReason || 'stop',
    })
    current = null
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      // Check if this is actually a tool_result message (Claude Code sends these as role:user)
      const hasToolResult = msg.content.some(b => b.type === 'toolResult')
      if (hasToolResult && current) {
        // Attach tool results to current turn
        for (const block of msg.content) {
          if (block.type === 'toolResult') {
            // Update matching tool call record
            const tc = current.toolCalls.find(t => t.id === block.toolCallId)
            if (tc) {
              tc.result = block.content
              tc.isError = block.isError
            } else {
              current.toolCalls.push({
                id: block.toolCallId,
                name: '',
                args: {},
                result: block.content,
                isError: block.isError,
              })
            }
          }
        }
        continue
      }

      // New user turn
      flushTurn()
      current = { userMsg: msg, assistantMsgs: [], toolCalls: [], cost: 0, toolCallCount: 0 }

    } else if (msg.role === 'assistant') {
      if (!current) {
        current = { userMsg: null, assistantMsgs: [], toolCalls: [], cost: 0, toolCallCount: 0 }
      }
      current.assistantMsgs.push(msg)
      if (msg.usage) current.cost += msg.usage.cost

      // Extract tool calls
      for (const block of msg.content) {
        if (block.type === 'toolCall') {
          current.toolCalls.push({
            id: block.id,
            name: block.name,
            args: block.args,
            result: undefined,
            isError: false,
          })
          current.toolCallCount++
        }
      }
    }
  }

  flushTurn()
  return turns
}

// --- Parser implementation ---

export const claudeCodeParser: SessionParser = {
  platform: 'claude-code',

  detect(lines: string[]): boolean {
    // Claude Code JSONL has top-level type: "user" or "assistant" or "summary"
    for (const line of lines.slice(0, 10)) {
      try {
        const rec = JSON.parse(line)
        if (rec.type === 'user' || rec.type === 'assistant' || rec.type === 'summary') {
          return true
        }
      } catch { /* skip */ }
    }
    return false
  },

  parse(lines: string[], filePath: string): ParsedSession {
    const meta: SessionMeta = {
      id: filePath.split('/').pop()?.replace('.jsonl', '') || 'unknown',
      platform: 'claude-code',
      startTime: '',
    }

    const messages: Message[] = []
    let currentModel = 'unknown'

    for (const line of lines) {
      let rec: RawRecord
      try { rec = JSON.parse(line) } catch { continue }

      if (rec.type === 'summary') {
        // Session metadata
        if (rec.sessionId) meta.id = rec.sessionId as string
        if (rec.timestamp) meta.startTime = rec.timestamp as string
        continue
      }

      if (rec.type === 'user' || rec.type === 'assistant') {
        const msg = rec.message
        if (!msg) continue

        if (rec.type === 'assistant' && msg.model) {
          currentModel = msg.model as string
        }

        const normalized: Message = {
          role: rec.type as 'user' | 'assistant',
          content: normalizeContentBlocks(msg.content),
          model: rec.type === 'assistant' ? (msg.model as string || currentModel) : undefined,
          stopReason: rec.type === 'assistant' ? inferStopReason(msg) : undefined,
          timestamp: rec.timestamp as string || undefined,
          usage: rec.type === 'assistant'
            ? normalizeUsage(msg.usage as Record<string, unknown> | undefined, msg.model as string || currentModel)
            : undefined,
        }

        if (!meta.startTime && normalized.timestamp) {
          meta.startTime = normalized.timestamp
        }

        messages.push(normalized)
      }
    }

    // Set end time
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.timestamp) meta.endTime = lastMsg.timestamp

    // Calculate duration
    if (meta.startTime && meta.endTime) {
      const start = new Date(meta.startTime).getTime()
      const end = new Date(meta.endTime).getTime()
      if (!isNaN(start) && !isNaN(end)) {
        meta.durationMinutes = Math.round((end - start) / 60000)
      }
    }

    // Build turns
    const turns = buildTurns(messages)

    // Aggregate stats
    let totalCost = 0
    let totalToolCalls = 0
    const modelUsage: ParsedSession['modelUsage'] = {}

    for (const msg of messages) {
      if (msg.usage) {
        totalCost += msg.usage.cost
        const m = msg.model || 'unknown'
        if (!modelUsage[m]) modelUsage[m] = { inputTokens: 0, outputTokens: 0, cost: 0 }
        modelUsage[m].inputTokens += msg.usage.inputTokens
        modelUsage[m].outputTokens += msg.usage.outputTokens
        modelUsage[m].cost += msg.usage.cost
      }
      for (const block of msg.content) {
        if (block.type === 'toolCall') totalToolCalls++
      }
    }

    return {
      meta,
      messages,
      turns,
      totalCost,
      totalToolCalls,
      modelUsage,
    }
  },
}
