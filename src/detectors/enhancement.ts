// ============================================================
// 龙虾体检 v4 — 增强建议域
// 不是问题，但可以让 Agent 运行得更好。不打分。
// 含默认推荐产品/工具（自有生态优先）
// ============================================================

import type { ParsedSession } from '../parsers/types'
import type { Finding, Enhancement } from '../lib/types'
import { isExpensiveModel } from '../lib/pricing'

// ============================================================
// 8 条核心增强建议 + 2 条扩展推荐
// ============================================================

export function generateEnhancements(
  sessions: ParsedSession[],
  findings: Finding[],
): Enhancement[] {
  const enhancements: Enhancement[] = []
  let seq = 0

  // --- 1. Session 生命周期 ---
  for (const session of sessions) {
    if (session.meta.durationMinutes && session.meta.durationMinutes > 240) {
      // Check if cost increases over time
      if (session.turns.length >= 4) {
        const half = Math.floor(session.turns.length / 2)
        const earlyAvg = session.turns.slice(0, half).reduce((s, t) => s + t.totalCost, 0) / half
        const lateAvg = session.turns.slice(half).reduce((s, t) => s + t.totalCost, 0) / (session.turns.length - half)

        if (earlyAvg > 0 && lateAvg / earlyAvg > 1.5) {
          enhancements.push({
            id: `enhancement-session-lifecycle-${++seq}`,
            direction: 'Session 生命周期',
            condition: `存在 ${Math.round(session.meta.durationMinutes / 60)} 小时的 session 且后期 cost 上升`,
            suggestion: '建议 ≤4 小时自动拆分 session',
            expectedEffect: '防止上下文膨胀，降低后期 cost',
            recommendation: {
              product: 'Session 自动拆分',
              type: 'builtin',
              action: 'lobster-checkup config set session.maxDuration 4h',
            },
          })
          break
        }
      }
    }
  }

  // --- 2. 断路器机制 ---
  const hasRunaway = findings.some(f => f.id.includes('tool-loop'))
  // Also check system prompts for circuit breaker rules
  const systemTexts = sessions.flatMap(s =>
    s.messages.filter(m => m.role === 'system').map(m =>
      m.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n')
    )
  ).join('\n')

  const hasCircuitBreaker = /失败.*停|stop.*fail|circuit.*break|断路|连续.*次.*失败.*停/i.test(systemTexts)

  if (!hasCircuitBreaker) {
    enhancements.push({
      id: `enhancement-circuit-breaker-${++seq}`,
      direction: '断路器机制',
      condition: '系统提示中无失败后停止的规则',
      suggestion: '系统提示添加"连续 5 次工具调用失败后停下问用户"',
      expectedEffect: '防止 runaway，减少等待时间',
      recommendation: {
        product: '断路器规则模板',
        type: 'builtin',
        action: 'lobster-checkup doctor --fix（自动写入 AGENTS.md）',
      },
    })
  }

  // --- 3. 工具调用预算 ---
  const hasLargeTurns = sessions.some(s =>
    s.turns.some(t => t.toolCallCount > 30)
  )
  if (hasLargeTurns) {
    enhancements.push({
      id: `enhancement-tool-budget-${++seq}`,
      direction: '工具调用预算',
      condition: '存在 >30 次工具调用的 turn',
      suggestion: '设置单 turn 工具调用上限（建议 30 次）',
      expectedEffect: '硬限制 runaway',
      recommendation: {
        product: '工具调用预算',
        type: 'builtin',
        action: 'lobster-checkup config set tool.maxCallsPerTurn 30',
      },
    })
  }

  // --- 4. 记忆策略 ---
  const hasDrift = findings.some(f => f.id.includes('instruction-drift'))
  if (hasDrift) {
    enhancements.push({
      id: `enhancement-memory-strategy-${++seq}`,
      direction: '记忆策略',
      condition: '定时任务存在指令漂移',
      suggestion: '心跳必须先 read 指定文件，不靠上下文记忆',
      expectedEffect: '减少指令漂移',
      recommendation: {
        product: '记忆策略模板',
        type: 'builtin',
        action: 'lobster-checkup doctor --fix（自动写入心跳规则）',
      },
    })
  }

  // --- 5. 子 Agent 路由 ---
  const allTurns = sessions.flatMap(s => s.turns)
  let simpleTurnExpensive = 0
  for (const turn of allTurns) {
    const isSimple = turn.toolCallCount < 3 &&
      turn.assistantMessages.reduce((s, m) => s + (m.usage?.outputTokens || 0), 0) < 200
    if (isSimple && turn.assistantMessages.some(m => m.model && isExpensiveModel(m.model))) {
      simpleTurnExpensive++
    }
  }
  const mismatchRate = allTurns.length > 0 ? simpleTurnExpensive / allTurns.length : 0

  if (mismatchRate > 0.2) {
    enhancements.push({
      id: `enhancement-model-routing-${++seq}`,
      direction: '子 Agent 路由',
      condition: `贵模型做简单事的比例 ${Math.round(mismatchRate * 100)}% (>20%)`,
      suggestion: '简单任务用轻量模型，复杂任务用 Pro',
      expectedEffect: '降低成本不降质量',
      recommendation: {
        product: 'GoPlus Token Router',
        type: 'ecosystem',
        action: '启用智能模型路由',
      },
    })
  }

  // --- 6. 去重输出 ---
  const hasRepetition = findings.filter(f => f.id.includes('repetitive-output')).length > 3
  if (hasRepetition) {
    enhancements.push({
      id: `enhancement-dedup-output-${++seq}`,
      direction: '去重输出',
      condition: `检测到 ${findings.filter(f => f.id.includes('repetitive-output')).length} 次高相似度重复输出`,
      suggestion: '系统提示添加"不要重复已告知的信息"',
      expectedEffect: '减少用户信息疲劳',
      recommendation: {
        product: '去重规则模板',
        type: 'builtin',
        action: 'lobster-checkup doctor --fix',
      },
    })
  }

  // --- 7. 定时任务优化 ---
  const hasHeartbeatIssue = findings.some(f => f.id.includes('heartbeat-cost'))
  if (hasHeartbeatIssue) {
    enhancements.push({
      id: `enhancement-heartbeat-opt-${++seq}`,
      direction: '定时任务优化',
      condition: '心跳 cost 偏高',
      suggestion: '心跳检查简化为"读文件 → 有变化才汇报"',
      expectedEffect: '降低心跳成本',
      recommendation: {
        product: '心跳优化模板',
        type: 'builtin',
        action: 'lobster-checkup doctor --fix',
      },
    })
  }

  // --- 8. 错误学习 ---
  const hasRepeatedFail = findings.some(f => f.id.includes('repeated-fail'))
  if (hasRepeatedFail) {
    enhancements.push({
      id: `enhancement-error-learning-${++seq}`,
      direction: '错误学习',
      condition: '存在重复失败记录',
      suggestion: '系统提示添加"同一命令失败 2 次不再尝试"',
      expectedEffect: '减少浪费',
      recommendation: {
        product: '错误学习规则模板',
        type: 'builtin',
        action: 'lobster-checkup doctor --fix',
      },
    })
  }

  // --- 扩展：Skill 能力缺失 ---
  // Detect repeated failed attempts at a task type
  for (const session of sessions) {
    const failedTaskTypes: Record<string, number> = {}
    for (const turn of session.turns) {
      const failedCalls = turn.toolCalls.filter(tc => tc.isError)
      for (const fc of failedCalls) {
        failedTaskTypes[fc.name] = (failedTaskTypes[fc.name] || 0) + 1
      }
    }
    for (const [tool, count] of Object.entries(failedTaskTypes)) {
      if (count >= 5) {
        enhancements.push({
          id: `enhancement-skill-gap-${++seq}`,
          direction: 'Skill 能力缺失',
          condition: `Agent 在 "${tool}" 上反复失败 ${count} 次`,
          suggestion: `搜索适合此任务的 Skill/Plugin`,
          expectedEffect: '提升特定任务的成功率',
          recommendation: {
            product: 'Skill Finder',
            type: 'ecosystem',
            action: '搜索并安装匹配的 Skill',
          },
        })
        break
      }
    }
  }

  // --- 扩展：安全防护缺失 ---
  const hasInjectionRisk = findings.some(f => f.id.includes('skill-injection'))
  if (hasInjectionRisk) {
    enhancements.push({
      id: `enhancement-security-guard-${++seq}`,
      direction: '安全防护缺失',
      condition: '检测到 Skill/Plugin 注入风险',
      suggestion: '启用安全审计和沙盒隔离',
      expectedEffect: '防止核心配置被篡改',
      recommendation: {
        product: 'AgentGuard',
        type: 'ecosystem',
        action: '安装 AgentGuard 进行安全审计',
      },
    })
  }

  return enhancements
}
