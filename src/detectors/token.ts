// ============================================================
// 龙虾体检 v4 — Token 消耗检测域
// 只关注钱。同一个现象在这里只从花费角度分析。
// ============================================================

import type { ParsedSession, Turn } from '../parsers/types'
import type { Finding, TokenAnalysis } from '../lib/types'
import { isExpensiveModel } from '../lib/pricing'

let findingSeq = 0
function nextId(category: string): string {
  return `token-${category}-${String(++findingSeq).padStart(3, '0')}`
}

// ============================================================
// 花销全景 — TokenAnalysis
// ============================================================

export function buildTokenAnalysis(sessions: ParsedSession[]): TokenAnalysis {
  const totalCost = sessions.reduce((sum, s) => sum + s.totalCost, 0)

  // Calculate period
  const timestamps = sessions
    .flatMap(s => [s.meta.startTime, s.meta.endTime])
    .filter(Boolean)
    .map(t => new Date(t!).getTime())
    .filter(t => !isNaN(t))

  const periodMs = timestamps.length >= 2
    ? Math.max(...timestamps) - Math.min(...timestamps)
    : 86400000 // default 1 day
  const periodDays = Math.max(1, Math.round(periodMs / 86400000))

  // Classify costs
  let wasted = 0
  let optimizable = 0

  const allTurns = sessions.flatMap(s => s.turns)

  // --- Wasted ---

  // Runaway turns (toolCallCount > 20)
  let runawayTurnsCost = 0
  for (const turn of allTurns) {
    if (turn.toolCallCount > 20) {
      runawayTurnsCost += turn.totalCost
    }
  }
  wasted += runawayTurnsCost

  // Repeated failure turns
  let repeatedFailureCost = 0
  for (const turn of allTurns) {
    const failGroups: Record<string, number> = {}
    for (const tc of turn.toolCalls) {
      if (tc.isError) {
        const key = `${tc.name}::${JSON.stringify(tc.args)}`
        failGroups[key] = (failGroups[key] || 0) + 1
      }
    }
    const hasRepeatedFail = Object.values(failGroups).some(c => c >= 2)
    if (hasRepeatedFail) {
      repeatedFailureCost += turn.totalCost
    }
  }
  wasted += repeatedFailureCost

  // Incomplete turns (no stop, no useful output)
  for (const turn of allTurns) {
    if (turn.finalStopReason !== 'stop' && turn.toolCallCount > 0) {
      const hasText = turn.assistantMessages.some(m =>
        m.content.some(b => b.type === 'text' && (b as any).text?.trim().length > 0)
      )
      if (!hasText) {
        wasted += turn.totalCost
      }
    }
  }

  // --- Optimizable ---

  // Model mismatch: expensive model for simple tasks
  let modelMismatchCost = 0
  for (const turn of allTurns) {
    if (turn.toolCallCount < 3) {
      const totalOutput = turn.assistantMessages.reduce(
        (sum, m) => sum + (m.usage?.outputTokens || 0), 0
      )
      if (totalOutput < 200) {
        // Simple task — check if expensive model was used
        for (const msg of turn.assistantMessages) {
          if (msg.model && isExpensiveModel(msg.model) && msg.usage) {
            modelMismatchCost += msg.usage.cost
          }
        }
      }
    }
  }
  optimizable += modelMismatchCost

  // Context bloat: extra cost from context growth
  let contextBloatCost = 0
  for (const session of sessions) {
    if (session.turns.length < 4) continue
    const half = Math.floor(session.turns.length / 2)
    const earlyTurns = session.turns.slice(0, half)
    const lateTurns = session.turns.slice(half)

    const earlyAvg = earlyTurns.reduce((s, t) => s + t.totalCost, 0) / earlyTurns.length
    const lateAvg = lateTurns.reduce((s, t) => s + t.totalCost, 0) / lateTurns.length

    if (earlyAvg > 0 && lateAvg / earlyAvg > 2) {
      const excess = lateTurns.reduce((s, t) => s + Math.max(0, t.totalCost - earlyAvg), 0)
      contextBloatCost += excess
    }
  }
  optimizable += contextBloatCost

  // Heartbeat overhead
  let heartbeatOverhead = 0
  for (const session of sessions) {
    for (const turn of session.turns) {
      const userText = turn.userMessage.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join(' ')
      if (/heartbeat|心跳|定时|cron|scheduled/i.test(userText)) {
        // Ideal heartbeat cost: ~0.001 (read 1 file + short response)
        const idealCost = 0.001
        if (turn.totalCost > idealCost * 10) {
          heartbeatOverhead += turn.totalCost - idealCost
        }
      }
    }
  }
  optimizable += heartbeatOverhead

  // Necessary = total - wasted - optimizable
  const necessary = Math.max(0, totalCost - wasted - optimizable)

  return {
    totalCost,
    periodDays,
    necessary,
    optimizable,
    wasted,
    breakdown: {
      modelMismatch: modelMismatchCost,
      contextBloat: contextBloatCost,
      runawayTurns: runawayTurnsCost,
      heartbeatOverhead,
      repeatedFailures: repeatedFailureCost,
    },
  }
}

// ============================================================
// 具体检测项
// ============================================================

/** 检测项 1：总花费与趋势 */
function detectCostTrend(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []
  const totalCost = sessions.reduce((sum, s) => sum + s.totalCost, 0)

  // Group sessions by week (simplified)
  // For now, just report the total cost as a finding if significant
  if (totalCost > 5) {
    findings.push({
      id: nextId('cost-trend'),
      domain: 'token',
      severity: totalCost > 50 ? 'critical' : totalCost > 20 ? 'high' : 'medium',
      title: '总花费报告',
      description: `统计周期内总花费 $${totalCost.toFixed(2)}。`,
      impact: { totalCost: `$${totalCost.toFixed(2)}` },
      rootCause: [],
      fix: [],
      evidence: {
        totalCost,
        sessionCount: sessions.length,
      },
    })
  }

  return findings
}

/** 检测项 2：单 turn 花费分布 */
function detectExpensiveTurns(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []
  const totalCost = sessions.reduce((sum, s) => sum + s.totalCost, 0)
  if (totalCost === 0) return findings

  for (const session of sessions) {
    for (const turn of session.turns) {
      const ratio = turn.totalCost / totalCost
      if (ratio > 0.15) {
        findings.push({
          id: nextId('expensive-turn'),
          domain: 'token',
          severity: ratio > 0.3 ? 'critical' : 'high',
          title: '单 Turn 花费异常',
          location: {
            session: session.meta.id,
            turn: turn.index,
            timeRange: '',
          },
          description: `Turn ${turn.index} 花费 $${turn.totalCost.toFixed(2)}，占总花费 ${Math.round(ratio * 100)}%。`,
          impact: {
            tokenCost: `$${turn.totalCost.toFixed(2)}`,
            percentOfTotal: `${Math.round(ratio * 100)}%`,
          },
          rootCause: ['单次对话消耗过高', '可能存在工具调用异常或上下文过大'],
          fix: [{
            action: '检查该 turn 的工具调用是否合理',
            effort: '改配置',
            expectedEffect: '降低异常消耗',
          }],
          evidence: {
            turnCost: turn.totalCost,
            totalCost,
            ratio,
            toolCallCount: turn.toolCallCount,
          },
        })
      }
    }
  }

  return findings
}

/** 检测项 3：模型成本对比 */
function detectModelMismatch(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []
  const allTurns = sessions.flatMap(s => s.turns)
  if (allTurns.length === 0) return findings

  let simpleTurnExpensiveCount = 0
  let totalTurns = allTurns.length

  for (const turn of allTurns) {
    const isSimple = turn.toolCallCount < 3 &&
      turn.assistantMessages.reduce((s, m) => s + (m.usage?.outputTokens || 0), 0) < 200

    if (isSimple) {
      const usedExpensive = turn.assistantMessages.some(m =>
        m.model && isExpensiveModel(m.model)
      )
      if (usedExpensive) simpleTurnExpensiveCount++
    }
  }

  const mismatchRate = simpleTurnExpensiveCount / totalTurns
  if (mismatchRate > 0.2) {
    findings.push({
      id: nextId('model-mismatch'),
      domain: 'token',
      severity: mismatchRate > 0.3 ? 'high' : 'medium',
      title: '模型成本错配',
      description: `${Math.round(mismatchRate * 100)}% 的简单任务使用了昂贵模型。`,
      impact: {
        mismatchRate: `${Math.round(mismatchRate * 100)}%`,
      },
      rootCause: ['未启用智能模型路由', '所有任务使用同一模型'],
      fix: [{
        action: '启用智能模型路由，简单任务用轻量模型',
        effort: '改配置',
        expectedEffect: '降低成本不降质量',
        weeklySavings: undefined,
      }],
      evidence: {
        simpleTurnExpensiveCount,
        totalTurns,
        mismatchRate,
      },
    })
  }

  return findings
}

/** 检测项 4：上下文膨胀税 */
function detectContextBloat(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    if (session.turns.length < 4) continue

    const half = Math.floor(session.turns.length / 2)
    const earlyTurns = session.turns.slice(0, half)
    const lateTurns = session.turns.slice(half)

    const earlyAvg = earlyTurns.reduce((s, t) => s + t.totalCost, 0) / earlyTurns.length
    const lateAvg = lateTurns.reduce((s, t) => s + t.totalCost, 0) / lateTurns.length

    if (earlyAvg > 0) {
      const bloatFactor = lateAvg / earlyAvg
      if (bloatFactor > 5) {
        findings.push({
          id: nextId('context-bloat'),
          domain: 'token',
          severity: bloatFactor > 10 ? 'critical' : 'high',
          title: '上下文膨胀税',
          location: { session: session.meta.id, turn: 0, timeRange: '' },
          description: `Session 后期平均 cost 是前期的 ${bloatFactor.toFixed(1)} 倍。`,
          impact: {
            bloatFactor: `${bloatFactor.toFixed(1)}x`,
            earlyAvgCost: `$${earlyAvg.toFixed(4)}`,
            lateAvgCost: `$${lateAvg.toFixed(4)}`,
          },
          rootCause: ['Session 过长导致上下文累积', '未及时拆分 session'],
          fix: [{
            action: '建议 ≤4 小时自动拆分 session',
            effort: '改配置',
            expectedEffect: '防止上下文膨胀',
          }],
          evidence: {
            sessionId: session.meta.id,
            turnCount: session.turns.length,
            earlyAvgCost: earlyAvg,
            lateAvgCost: lateAvg,
            bloatFactor,
          },
        })
      }
    }
  }

  return findings
}

/** 检测项 5：心跳/cron 成本 */
function detectHeartbeatCost(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []
  const idealCost = 0.001

  for (const session of sessions) {
    const heartbeatTurns = session.turns.filter(t => {
      const text = t.userMessage.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join(' ')
      return /heartbeat|心跳|定时|cron|scheduled/i.test(text)
    })

    if (heartbeatTurns.length < 3) continue

    const avgCost = heartbeatTurns.reduce((s, t) => s + t.totalCost, 0) / heartbeatTurns.length
    const ratio = avgCost / idealCost

    if (ratio > 10) {
      findings.push({
        id: nextId('heartbeat-cost'),
        domain: 'token',
        severity: ratio > 20 ? 'critical' : 'high',
        title: '心跳/定时任务成本过高',
        location: { session: session.meta.id, turn: 0, timeRange: '' },
        description: `心跳平均花费 $${avgCost.toFixed(4)}，是理想值的 ${Math.round(ratio)} 倍。`,
        impact: {
          avgHeartbeatCost: `$${avgCost.toFixed(4)}`,
          idealCost: `$${idealCost.toFixed(4)}`,
          ratio: `${Math.round(ratio)}x`,
          totalWaste: `$${((avgCost - idealCost) * heartbeatTurns.length).toFixed(2)}`,
        },
        rootCause: ['心跳任务执行了过多操作', '应简化为"读文件 → 有变化才汇报"'],
        fix: [{
          action: '简化心跳为"读文件 → 有变化才汇报"',
          effort: '一键',
          expectedEffect: '降低心跳成本',
          weeklySavings: (avgCost - idealCost) * heartbeatTurns.length * 7 / (sessions.reduce((s, se) => s + (se.meta.durationMinutes || 0), 0) / 1440 || 7),
        }],
        evidence: {
          heartbeatCount: heartbeatTurns.length,
          avgCost,
          idealCost,
          totalCost: heartbeatTurns.reduce((s, t) => s + t.totalCost, 0),
        },
      })
    }
  }

  return findings
}

/** 检测项 6：runaway turn 消耗 */
function detectRunawayCost(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []
  const totalCost = sessions.reduce((sum, s) => sum + s.totalCost, 0)
  if (totalCost === 0) return findings

  const runawayTurns: { session: string; turn: number; cost: number; toolCalls: number }[] = []

  for (const session of sessions) {
    for (const turn of session.turns) {
      if (turn.toolCallCount > 20) {
        runawayTurns.push({
          session: session.meta.id,
          turn: turn.index,
          cost: turn.totalCost,
          toolCalls: turn.toolCallCount,
        })
      }
    }
  }

  const totalRunaway = runawayTurns.reduce((s, r) => s + r.cost, 0)
  const ratio = totalRunaway / totalCost

  if (ratio > 0.15 && runawayTurns.length > 0) {
    findings.push({
      id: nextId('runaway-cost'),
      domain: 'token',
      severity: ratio > 0.3 ? 'critical' : 'high',
      title: 'Runaway Turn 消耗',
      description: `${runawayTurns.length} 个失控 Turn 共花费 $${totalRunaway.toFixed(2)}，占总花费 ${Math.round(ratio * 100)}%。`,
      impact: {
        tokenCost: `$${totalRunaway.toFixed(2)}`,
        wastePercentage: `${Math.round(ratio * 100)}%`,
      },
      rootCause: ['无工具调用上限/断路器', '失控 turn 消耗大量 token'],
      fix: [{
        action: '添加断路器规则 + 工具调用上限',
        effort: '一键',
        expectedEffect: '消除 runaway 消耗',
        weeklySavings: totalRunaway,
      }],
      evidence: {
        runawayTurns,
        totalRunawayCost: totalRunaway,
        percentOfTotal: ratio,
      },
    })
  }

  return findings
}

/** 检测项 7：每任务成本 */
function detectPerTaskCost(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []
  const allTurns = sessions.flatMap(s => s.turns)
  const totalCost = sessions.reduce((sum, s) => sum + s.totalCost, 0)

  if (allTurns.length === 0) return findings

  const avgCostPerTurn = totalCost / allTurns.length

  if (avgCostPerTurn > 1) {
    findings.push({
      id: nextId('per-task-cost'),
      domain: 'token',
      severity: avgCostPerTurn > 3 ? 'high' : 'medium',
      title: '每任务成本偏高',
      description: `平均每个 Turn 花费 $${avgCostPerTurn.toFixed(2)}。`,
      impact: {
        avgCostPerTurn: `$${avgCostPerTurn.toFixed(2)}`,
        totalTurns: allTurns.length,
      },
      rootCause: ['单次任务复杂度高或模型选择偏贵'],
      fix: [{
        action: '优化模型选择和 prompt 效率',
        effort: '改配置',
        expectedEffect: '降低平均任务成本',
      }],
      evidence: {
        avgCostPerTurn,
        totalTurns: allTurns.length,
        totalCost,
      },
    })
  }

  return findings
}

// ============================================================
// Public API
// ============================================================

export function detectTokenIssues(sessions: ParsedSession[]): Finding[] {
  findingSeq = 0
  return [
    ...detectCostTrend(sessions),       // 1: 总花费与趋势
    ...detectExpensiveTurns(sessions),   // 2: 单 turn 花费分布
    ...detectModelMismatch(sessions),    // 3: 模型成本对比
    ...detectContextBloat(sessions),     // 4: 上下文膨胀税
    ...detectHeartbeatCost(sessions),    // 5: 心跳/cron 成本
    ...detectRunawayCost(sessions),      // 6: runaway turn 消耗
    ...detectPerTaskCost(sessions),      // 7: 每任务成本
  ]
}
