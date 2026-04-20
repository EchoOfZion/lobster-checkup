// ============================================================
// 龙虾体检 v4 — Session 内部数据模型
// ============================================================

// --- 内容块 ---

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'toolCall'; id: string; name: string; args: Record<string, any> }
  | { type: 'toolResult'; toolCallId: string; content: string; isError: boolean }

// --- 消息 ---

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: ContentBlock[]
  model?: string
  stopReason?: 'stop' | 'toolUse' | 'maxTokens'
  timestamp?: string            // ISO 8601
  usage?: {
    inputTokens: number
    outputTokens: number
    cost: number                // USD
  }
}

// --- Turn ---

export interface ToolCallRecord {
  id: string
  name: string
  args: Record<string, any>
  result?: string
  isError: boolean
}

export interface Turn {
  index: number
  userMessage: Message
  assistantMessages: Message[]
  toolCalls: ToolCallRecord[]
  totalCost: number
  toolCallCount: number
  finalStopReason: 'stop' | 'toolUse' | 'maxTokens'
}

// --- Session 元信息 ---

export interface SessionMeta {
  id: string
  platform: 'claude-code' | 'openclaw' | 'hermes' | string
  startTime: string             // ISO 8601
  endTime?: string
  durationMinutes?: number
  model?: string
}

// --- 解析后的完整 Session ---

export interface ParsedSession {
  meta: SessionMeta
  messages: Message[]
  turns: Turn[]
  totalCost: number
  totalToolCalls: number
  modelUsage: Record<string, {
    inputTokens: number
    outputTokens: number
    cost: number
  }>
}

// --- 解析器接口 ---

export interface SessionParser {
  platform: string
  detect(lines: string[]): boolean
  parse(lines: string[], filePath: string): ParsedSession
}
