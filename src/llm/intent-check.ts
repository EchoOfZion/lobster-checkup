// ============================================================
// 龙虾体检 v4 — LLM 辅助检测：误解用户意图
// 行为域检测项 8: 用户纠正行为模式检测
// ============================================================

import type { ParsedSession, Turn } from '../parsers/types'
import type { Finding } from '../lib/types'
import { llmCall, parseLLMJson, type LLMConfig } from './client'

const SYSTEM_PROMPT = `你是一个 AI Agent 交互质量审计员。你的任务是判断 Agent 是否误解了用户的意图。

误解意图的信号：
- 用户紧接着纠正了 Agent 的行为（"不是这个意思"、"我说的是..."、"你理解错了"）
- Agent 执行了用户指令的字面意思但偏离了真正目的
- 用户重复了同一个请求（表明 Agent 之前的理解有误）

不算误解的情况：
- 用户补充了新需求
- 用户改变了主意
- 用户提供了更多细节以细化原始请求

请用 JSON 格式返回判定结果。`

interface IntentCheckResult {
  isMisunderstood: boolean
  confidence: number
  originalIntent: string
  agentUnderstanding: string
  correctionSignal: string
  explanation: string
}

/**
 * Detect user intent misunderstanding by examining consecutive turns
 * where user appears to correct the agent.
 */
export async function detectIntentMisunderstanding(
  sessions: ParsedSession[],
  config: LLMConfig,
): Promise<Finding[]> {
  const findings: Finding[] = []
  let seq = 0

  for (const session of sessions) {
    // Check consecutive turn pairs
    for (let i = 0; i + 1 < session.turns.length; i++) {
      const turn = session.turns[i]
      const nextTurn = session.turns[i + 1]

      // Quick pre-filter: check if next user message looks like a correction
      const nextUserText = nextTurn.userMessage.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('\n')

      const correctionPatterns = /不是|不对|你理解错|我说的是|我的意思|重新|再来|wrong|not what|misunderstand|meant/i
      if (!correctionPatterns.test(nextUserText)) continue

      // Get context for LLM check
      const userText = turn.userMessage.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('\n')
        .slice(0, 500)

      const assistantText = turn.assistantMessages
        .map(m => m.content
          .filter(b => b.type === 'text')
          .map(b => (b as { type: 'text'; text: string }).text)
          .join('')
        )
        .join('\n')
        .slice(0, 1000)

      const toolSummary = turn.toolCalls
        .map(tc => `[${tc.name}] ${JSON.stringify(tc.args).slice(0, 100)}`)
        .slice(0, 5)
        .join('\n')

      const prompt = `## 用户原始指令 (Turn ${turn.index})
${userText}

## Agent 回复和操作 (Turn ${turn.index})
${assistantText.slice(0, 500)}

工具调用:
${toolSummary || '(无)'}

## 用户后续消息 (Turn ${nextTurn.index})
${nextUserText.slice(0, 500)}

请判断 Agent 是否误解了用户意图，导致用户进行了纠正。返回 JSON：
\`\`\`json
{
  "isMisunderstood": boolean,
  "confidence": number (0-1),
  "originalIntent": "用户原始意图",
  "agentUnderstanding": "Agent 的理解",
  "correctionSignal": "用户纠正的内容",
  "explanation": "判定理由"
}
\`\`\``

      try {
        const response = await llmCall(prompt, SYSTEM_PROMPT, config)
        const result = parseLLMJson<IntentCheckResult>(response.text)

        if (!result || !result.isMisunderstood || result.confidence < 0.7) continue

        findings.push({
          id: `behavior-intent-misunderstand-${String(++seq).padStart(3, '0')}`,
          domain: 'behavior',
          severity: 'medium',
          title: '误解用户意图',
          location: {
            session: session.meta.id,
            turn: turn.index,
            timeRange: '',
          },
          description: `用户意图: "${result.originalIntent}"，Agent 理解为: "${result.agentUnderstanding}"`,
          impact: {
            confidence: `${Math.round(result.confidence * 100)}%`,
            type: '用户需要额外纠正',
          },
          rootCause: ['Agent 对模糊指令的理解偏差', '未在不确定时向用户确认'],
          fix: [{
            action: '系统提示添加"对模糊指令先确认理解再执行"',
            effort: '改配置',
            expectedEffect: '减少误解后返工',
          }],
          evidence: {
            originalIntent: result.originalIntent,
            agentUnderstanding: result.agentUnderstanding,
            correctionSignal: result.correctionSignal,
            explanation: result.explanation,
            confidence: result.confidence,
          },
          llmAssisted: true,
        })
      } catch {
        // Skip on LLM error
      }
    }
  }

  return findings
}
