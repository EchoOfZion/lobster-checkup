// ============================================================
// 龙虾体检 v4 — Hermes JSONL 解析器
// OpenAI-style chat format with top-level role
// ============================================================

import { estimateCost } from '../lib/pricing'
import type {
  SessionParser, ParsedSession, SessionMeta, Message,
  ContentBlock, Turn, ToolCallRecord,
} from './types'

// --- Raw JSONL record types (Hermes format) ---

interface HermesToolCall {
  id: string
  call_id?: string
  type: 'function'
  function: {
    name: string
    arguments: string  // JSON-encoded
  }
}

interface HermesRecord {
  role: 'session_meta' | 'user' | 'assistant' | 'tool' | 'system'
  content?: string
  reasoning?: string | null
  finish_reason?: string
  tool_calls?: HermesToolCall[]
  tool_call_id?: string
  timestamp?: string
  // session_meta fields
  tools?: unknown[]
  model?: string
  platform?: string
  // usage (if present)
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    cost?: number
  }
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
      // Tool results mapped to system role
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

export const hermesParser: SessionParser = {
  platform: 'hermes',

  detect(lines: string[]): boolean {
    // Hermes JSONL has top-level role: "session_meta" in first line
    // or role: "user"/"assistant"/"tool" without a wrapping "type" field
    for (const line of lines.slice(0, 10)) {
      try {
        const rec = JSON.parse(line)
        if (rec.role === 'session_meta') return true
        // Distinguish from other formats: has top-level "role" but no "type" field
        if (rec.role && !rec.type && (rec.role === 'user' || rec.role === 'assistant' || rec.role === 'tool')) {
          return true
        }
      } catch { /* skip */ }
    }
    return false
  },

  parse(lines: string[], filePath: string): ParsedSession {
    const meta: SessionMeta = {
      id: filePath.split('/').pop()?.replace('.jsonl', '') || 'unknown',
      platform: 'hermes',
      startTime: '',
    }

    const messages: Message[] = []
    let sessionModel = 'unknown'

    for (const line of lines) {
      let rec: HermesRecord
      try { rec = JSON.parse(line) } catch { continue }

      // --- session_meta line ---
      if (rec.role === 'session_meta') {
        if (rec.model) sessionModel = rec.model
        if (rec.timestamp) meta.startTime = rec.timestamp
        if (rec.platform) meta.model = `${sessionModel} (${rec.platform})`
        else meta.model = sessionModel
        continue
      }

      // --- user message ---
      if (rec.role === 'user') {
        const content: ContentBlock[] = []
        if (rec.content) {
          content.push({ type: 'text', text: rec.content })
        }

        const msg: Message = {
          role: 'user',
          content,
          timestamp: rec.timestamp || undefined,
        }

        if (!meta.startTime && rec.timestamp) {
          meta.startTime = rec.timestamp
        }

        messages.push(msg)
        continue
      }

      // --- assistant message ---
      if (rec.role === 'assistant') {
        const content: ContentBlock[] = []

        // Reasoning/thinking
        if (rec.reasoning) {
          content.push({ type: 'thinking', text: rec.reasoning })
        }

        // Text content
        if (rec.content) {
          content.push({ type: 'text', text: rec.content })
        }

        // Tool calls
        if (rec.tool_calls && rec.tool_calls.length > 0) {
          for (const tc of rec.tool_calls) {
            let args: Record<string, any> = {}
            try {
              args = JSON.parse(tc.function.arguments)
            } catch {
              args = { _raw: tc.function.arguments }
            }
            content.push({
              type: 'toolCall',
              id: tc.id || tc.call_id || '',
              name: tc.function.name,
              args,
            })
          }
        }

        // Determine stop reason
        let stopReason: Message['stopReason'] = 'stop'
        if (rec.tool_calls && rec.tool_calls.length > 0) {
          stopReason = 'toolUse'
        } else if (rec.finish_reason === 'length') {
          stopReason = 'maxTokens'
        }

        // Usage/cost estimation
        let usage: Message['usage'] | undefined
        if (rec.usage) {
          const inputTokens = rec.usage.input_tokens || 0
          const outputTokens = rec.usage.output_tokens || 0
          const cost = rec.usage.cost ?? estimateCost(sessionModel, inputTokens, outputTokens)
          usage = { inputTokens, outputTokens, cost }
        } else {
          // Hermes doesn't always include usage; estimate from content length
          const textLen = (rec.content || '').length + (rec.reasoning || '').length
          if (textLen > 0) {
            // Rough estimate: ~4 chars per token for output
            const estimatedOutput = Math.ceil(textLen / 4)
            const estimatedInput = estimatedOutput * 3 // rough context ratio
            usage = {
              inputTokens: estimatedInput,
              outputTokens: estimatedOutput,
              cost: estimateCost(sessionModel, estimatedInput, estimatedOutput),
            }
          }
        }

        const msg: Message = {
          role: 'assistant',
          content,
          model: sessionModel,
          stopReason,
          timestamp: rec.timestamp || undefined,
          usage,
        }

        messages.push(msg)
        continue
      }

      // --- tool result ---
      if (rec.role === 'tool') {
        const content: ContentBlock[] = [{
          type: 'toolResult',
          toolCallId: rec.tool_call_id || '',
          content: rec.content || '',
          isError: false, // Hermes doesn't have explicit isError; detect from content
        }]

        // Try to detect error from content
        if (rec.content) {
          try {
            const parsed = JSON.parse(rec.content)
            if (parsed.error || parsed.success === false) {
              content[0] = {
                ...content[0],
                type: 'toolResult',
                toolCallId: rec.tool_call_id || '',
                content: rec.content,
                isError: true,
              }
            }
          } catch { /* not JSON, leave as is */ }
        }

        const msg: Message = {
          role: 'system', // Map tool results to system for internal processing
          content,
          timestamp: rec.timestamp || undefined,
        }

        messages.push(msg)
        continue
      }

      // --- system message (rare in Hermes) ---
      if (rec.role === 'system') {
        const content: ContentBlock[] = []
        if (rec.content) {
          content.push({ type: 'text', text: rec.content })
        }
        messages.push({
          role: 'system',
          content,
          timestamp: rec.timestamp || undefined,
        })
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
