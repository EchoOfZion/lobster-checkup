import type { CheckupPolicy, Finding, NormalizedSession, NormalizedTurn, ToolCall } from '../core/types'
import { findingFingerprint } from '../core/fingerprint'
import { defaultPolicy } from '../policy'

type DetectorContext = {
  session: NormalizedSession
  turn: NormalizedTurn
}

export function runDetectors(sessions: NormalizedSession[], policy: CheckupPolicy = defaultPolicy): Finding[] {
  return dedupeFindings([
    ...detectToolLoops(sessions),
    ...detectRepeatedFailures(sessions),
    ...detectNoFinalReplies(sessions),
    ...detectSensitiveFileReads(sessions, policy),
    ...detectSensitiveOutputs(sessions),
    ...detectTokenWaste(sessions),
  ])
}

function detectToolLoops(sessions: NormalizedSession[]): Finding[] {
  const findings: Finding[] = []
  forEachTurn(sessions, ({ session, turn }) => {
    const toolCount = turn.toolCalls.length
    if (toolCount <= 10) return
    findings.push(finding(session, turn, {
      detector: 'tool-loop',
      severity: toolCount > 20 ? 'critical' : 'high',
      title: '工具调用过多',
      description: `单个 turn 发起了 ${toolCount} 次工具调用，可能存在循环或失控。`,
      evidence: {
        toolCount,
        toolNames: turn.toolCalls.slice(0, 5).map((tool) => tool.name),
        finalStopReason: turn.finalStopReason,
      },
      recommendation: {
        action: '为工具调用设置单 turn 上限，并在连续失败后停下来询问用户。',
        rationale: '工具循环会浪费时间、token，并可能掩盖真实失败原因。',
      },
    }))
  })
  return findings
}

function detectRepeatedFailures(sessions: NormalizedSession[]): Finding[] {
  const findings: Finding[] = []
  forEachTurn(sessions, ({ session, turn }) => {
    const groups = new Map<string, ToolCall[]>()
    for (const tool of turn.toolCalls.filter((item) => item.isError)) {
      const key = `${tool.name}:${stableJson(tool.args)}`
      groups.set(key, [...(groups.get(key) || []), tool])
    }

    for (const tools of groups.values()) {
      if (tools.length < 2) continue
      findings.push(finding(session, turn, {
        detector: 'repeated-failure',
        severity: 'high',
        title: '重复失败未切换策略',
        description: `同一工具和参数失败了 ${tools.length} 次。`,
        evidence: {
          toolName: tools[0].name,
          failureCount: tools.length,
          errorExcerpt: String(tools[0].result || '').slice(0, 160),
        },
        recommendation: {
          action: '同一工具输入失败两次后停止重试，换策略或向用户确认。',
          rationale: '重复相同失败通常不会产生新信息，只会增加等待和成本。',
        },
      }))
    }
  })
  return findings
}

function detectNoFinalReplies(sessions: NormalizedSession[]): Finding[] {
  const findings: Finding[] = []
  forEachTurn(sessions, ({ session, turn }) => {
    if (turn.toolCalls.length === 0) return
    if (turn.finalStopReason !== 'stop') return
    if (turn.assistantText.trim().length > 0) return
    findings.push(finding(session, turn, {
      detector: 'no-final-reply',
      severity: 'high',
      title: '工具调用后没有最终回复',
      description: 'Agent 执行了工具调用，但没有给用户可见结论。',
      evidence: {
        toolCount: turn.toolCalls.length,
        finalStopReason: turn.finalStopReason,
      },
      recommendation: {
        action: '工具调用结束后必须给出结果、失败原因或下一步建议。',
        rationale: '用户需要知道工具链执行后的状态，否则任务看起来像静默失败。',
      },
    }))
  })
  return findings
}

function detectSensitiveFileReads(sessions: NormalizedSession[], policy: CheckupPolicy): Finding[] {
  const findings: Finding[] = []
  const sensitivePath = new RegExp(policy.sensitivePathPatterns.join('|'), 'i')
  forEachTurn(sessions, ({ session, turn }) => {
    for (const tool of turn.toolCalls) {
      const args = JSON.stringify(tool.args)
      if (!sensitivePath.test(args)) continue
      findings.push(finding(session, turn, {
        detector: 'sensitive-file-read',
        severity: 'high',
        title: '敏感文件进入上下文',
        description: 'Agent 读取了可能包含凭证或密钥的文件。',
        evidence: {
          toolName: tool.name,
          path: '[redacted-sensitive-path]',
        },
        recommendation: {
          action: '避免读取敏感文件内容；需要验证配置时只检查文件是否存在或读取脱敏后的键名。',
          rationale: '敏感文件内容进入模型上下文后难以彻底清除。',
        },
      }))
    }
  })
  return findings
}

function detectSensitiveOutputs(sessions: NormalizedSession[]): Finding[] {
  const findings: Finding[] = []
  const patterns = [
    { type: 'OpenAI API Key', pattern: /sk-proj-[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{20,}/ },
    { type: 'Anthropic API Key', pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
    { type: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{20,}/ },
    { type: 'AWS Access Key', pattern: /AKIA[A-Z0-9]{16}/ },
  ]

  forEachTurn(sessions, ({ session, turn }) => {
    for (const item of patterns) {
      if (!item.pattern.test(turn.assistantText)) continue
      findings.push(finding(session, turn, {
        detector: 'sensitive-output',
        severity: 'high',
        title: '回复中包含疑似敏感凭证',
        description: 'Agent 的可见回复中出现了密钥格式的字符串。',
        evidence: {
          secretType: item.type,
          redacted: true,
        },
        recommendation: {
          action: '立即轮换相关凭证，并在 agent 输出链路中增加脱敏规则。',
          rationale: '凭证一旦出现在回复或日志中，就应视为已经暴露。',
        },
      }))
    }
  })
  return findings
}

function detectTokenWaste(sessions: NormalizedSession[]): Finding[] {
  const findings: Finding[] = []
  for (const session of sessions) {
    const total = session.usage.costUsd || session.turns.reduce((sum, turn) => sum + turn.costUsd, 0)
    if (total <= 0) continue
    for (const turn of session.turns) {
      const percent = Math.round((turn.costUsd / total) * 100)
      if (percent <= 25) continue
      findings.push(finding(session, turn, {
        detector: 'token-waste',
        severity: percent > 50 ? 'high' : 'medium',
        title: '单 turn 成本占比异常',
        description: `一个 turn 消耗了已知总成本的 ${percent}%。`,
        evidence: {
          turnCostUsd: roundMoney(turn.costUsd),
          totalCostUsd: roundMoney(total),
          percentOfTotal: percent,
        },
        recommendation: {
          action: '检查该 turn 是否存在工具循环、上下文膨胀或模型选择过重。',
          rationale: '成本集中在单个 turn 通常说明任务拆分或工具控制有问题。',
        },
      }))
    }
  }
  return findings
}

function forEachTurn(sessions: NormalizedSession[], callback: (context: DetectorContext) => void): void {
  for (const session of sessions) {
    for (const turn of session.turns) {
      callback({ session, turn })
    }
  }
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    if (seen.has(finding.fingerprint)) return false
    seen.add(finding.fingerprint)
    return true
  })
}

function finding(
  session: NormalizedSession,
  turn: NormalizedTurn,
  input: Omit<Finding, 'fingerprint' | 'location'>,
): Finding {
  const evidence = input.evidence
  return {
    ...input,
    fingerprint: findingFingerprint({
      source: session.source,
      sessionId: session.id,
      detector: input.detector,
      turnIndex: turn.index,
      title: input.title,
      evidence,
    }),
    location: {
      source: session.source,
      sessionId: session.id,
      transcriptPath: session.transcriptPath,
      turnIndex: turn.index,
    },
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000
}
