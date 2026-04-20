// ============================================================
// 龙虾体检 v4 — OpenClaw JSONL 解析器
// ============================================================

import { estimateCost } from '../lib/pricing'
import type {
  SessionParser, ParsedSession, SessionMeta, Message,
  ContentBlock, Turn, ToolCallRecord,
} from './types'

// --- Raw JSONL record types (OpenClaw format) ---

interface RawRecord {
  type: string
  timestamp?: string
  message?: {
    role?: string
    content?: unknown
    stopReason?: string
    model?: string
    usage?: Record<string, unknown>
    [key: string]: unknown
  }
  id?: string
  modelId?: string
  provider?: string
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

      case 'toolCall':
        return {
          type: 'toolCall',
          id: (block.toolUseId as string) || (block.id as string) || '',
          name: (block.toolName as string) || '',
          args: (block.args as Record<string, any>) || {},
        }

      case 'toolResult':
        return {
          type: 'toolResult',
          toolCallId: (block.toolUseId as string) || '',
          content: typeof block.result === 'string' ? block.result : (block.text as string) || '',
          isError: !!(block.isError),
        }

      default:
        return { type: 'text', text: (block.text as string) || '' }
    }
  })
}

// --- Usage normalization ---

function normalizeUsage(usage: Record<string, unknown> | undefined, model: string | undefined): Message['usage'] | undefined {
  if (!usage) return undefined

  const inputTokens = (usage.input as number) || 0
  const outputTokens = (usage.output as number) || 0

  // OpenClaw format: usage.cost.total
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
      userMessage: current.userMsg || { role: 'user', content: [] } as unknown as Message,
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
      flushTurn()
      current = { userMsg: msg, assistantMsgs: [], toolCalls: [], cost: 0, toolCallCount: 0 }

    } else if (msg.role === 'assistant') {
      if (!current) {
        current = { userMsg: null, assistantMsgs: [], toolCalls: [], cost: 0, toolCallCount: 0 }
      }
      current.assistantMsgs.push(msg)
      if (msg.usage) current.cost += msg.usage.cost

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

    } else if (msg.role === 'system') {
      // OpenClaw toolResult messages come as separate role: "toolResult"
      // which we map to system for processing; attach to current turn
      if (current) {
        for (const block of msg.content) {
          if (block.type === 'toolResult') {
            const tc = current.toolCalls.find(t => t.id === block.toolCallId)
            if (tc) {
              tc.result = block.content
              tc.isError = block.isError
            }
          }
        }
      }
    }
  }

  flushTurn()
  return turns
}

// --- Parser implementation ---

export const openClawParser: SessionParser = {
  platform: 'openclaw',

  detect(lines: string[]): boolean {
    // OpenClaw JSONL has type: "session" or type: "message" with message.role
    for (const line of lines.slice(0, 10)) {
      try {
        const rec = JSON.parse(line)
        if (rec.type === 'session') return true
        if (rec.type === 'message' && rec.message?.role) return true
        if (rec.type === 'model_change' && rec.modelId) return true
      } catch { /* skip */ }
    }
    return false
  },

  parse(lines: string[], filePath: string): ParsedSession {
    const meta: SessionMeta = {
      id: filePath.split('/').pop()?.replace('.jsonl', '') || 'unknown',
      platform: 'openclaw',
      startTime: '',
    }

    const messages: Message[] = []
    let currentModel = 'unknown'

    for (const line of lines) {
      let rec: RawRecord
      try { rec = JSON.parse(line) } catch { continue }

      if (rec.type === 'session') {
        if (rec.id) meta.id = rec.id as string
        if (rec.timestamp) meta.startTime = rec.timestamp as string
        continue
      }

      if (rec.type === 'model_change') {
        if (rec.modelId) currentModel = rec.modelId as string
        continue
      }

      if (rec.type === 'message' && rec.message) {
        const rawMsg = rec.message
        const role = rawMsg.role as string

        // Map OpenClaw's "toolResult" role to system for internal processing
        let mappedRole: 'user' | 'assistant' | 'system'
        if (role === 'user') mappedRole = 'user'
        else if (role === 'assistant') mappedRole = 'assistant'
        else mappedRole = 'system' // toolResult and others

        const normalized: Message = {
          role: mappedRole,
          content: normalizeContentBlocks(rawMsg.content),
          model: role === 'assistant' ? (rawMsg.model as string || currentModel) : undefined,
          stopReason: role === 'assistant'
            ? (rawMsg.stopReason === 'toolUse' ? 'toolUse'
              : rawMsg.stopReason === 'maxTokens' ? 'maxTokens'
              : rawMsg.stopReason === 'stop' || rawMsg.stopReason === 'end_turn' ? 'stop'
              : undefined)
            : undefined,
          timestamp: rec.timestamp || undefined,
          usage: role === 'assistant'
            ? normalizeUsage(rawMsg.usage, rawMsg.model as string || currentModel)
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

    if (meta.startTime && meta.endTime) {
      const start = new Date(meta.startTime).getTime()
      const end = new Date(meta.endTime).getTime()
      if (!isNaN(start) && !isNaN(end)) {
        meta.durationMinutes = Math.round((end - start) / 60000)
      }
    }

    const turns = buildTurns(messages)

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

    return { meta, messages, turns, totalCost, totalToolCalls, modelUsage }
  },
}
