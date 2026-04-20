// ============================================================
// 龙虾体检 v4 — 行为检测域
// 只关注 Agent 行为的对错，不算钱。
// 确定性检测项在此实现，LLM 辅助检测项提供 stub 接口。
// ============================================================

import type { ParsedSession, Turn, ContentBlock } from '../parsers/types'
import type { Finding } from '../lib/types'

// --- Helpers ---

function getText(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('\n')
}

function getToolCalls(blocks: ContentBlock[]) {
  return blocks
    .filter(b => b.type === 'toolCall')
    .map(b => b as { type: 'toolCall'; id: string; name: string; args: Record<string, any> })
}

function timeRange(turn: Turn, session: ParsedSession): string {
  const msgs = [turn.userMessage, ...turn.assistantMessages]
  const timestamps = msgs.map(m => m.timestamp).filter(Boolean) as string[]
  if (timestamps.length === 0) return ''
  return `${timestamps[0]} - ${timestamps[timestamps.length - 1]}`
}

let findingSeq = 0
function nextId(category: string): string {
  return `behavior-${category}-${String(++findingSeq).padStart(3, '0')}`
}

// ============================================================
// 4.1.1 工具调用异常
// ============================================================

/** 检测项 1：工具死循环 — Critical */
function detectToolLoop(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    for (const turn of session.turns) {
      // Count consecutive assistant messages with stopReason === 'toolUse'
      let consecutive = 0
      for (const msg of turn.assistantMessages) {
        if (msg.stopReason === 'toolUse') {
          consecutive++
        } else {
          consecutive = 0
        }
      }

      if (consecutive > 20 || turn.toolCallCount > 20) {
        findings.push({
          id: nextId('tool-loop'),
          domain: 'behavior',
          severity: 'critical',
          title: '工具调用死循环',
          location: {
            session: session.meta.id,
            turn: turn.index,
            timeRange: timeRange(turn, session),
          },
          description: `Turn ${turn.index} 中 Agent 连续发起 ${turn.toolCallCount} 次工具调用，无法自行停止。`,
          impact: {
            toolCallCount: turn.toolCallCount,
            userWaitTime: `${turn.toolCallCount} 次工具调用`,
          },
          rootCause: [
            '无工具调用上限/断路器配置',
            '系统提示未要求失败后询问用户',
          ],
          fix: [{
            action: '在 AGENTS.md 添加规则: 连续 5 次工具调用失败后必须停下来问用户',
            effort: '一键',
            expectedEffect: '消除此类问题',
          }],
          evidence: {
            toolCallCount: turn.toolCallCount,
            consecutiveToolUse: consecutive,
            toolNames: turn.toolCalls.map(tc => tc.name).slice(0, 10),
          },
        })
      }
    }
  }

  return findings
}

/** 检测项 2：重复失败不学习 — High */
function detectRepeatedFailures(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    for (const turn of session.turns) {
      // Group tool calls by name+args, check consecutive failures
      const failGroups: Record<string, { count: number; errors: string[] }> = {}

      for (const tc of turn.toolCalls) {
        if (!tc.isError) continue
        const key = `${tc.name}::${JSON.stringify(tc.args)}`
        if (!failGroups[key]) failGroups[key] = { count: 0, errors: [] }
        failGroups[key].count++
        if (tc.result) failGroups[key].errors.push(tc.result.slice(0, 200))
      }

      for (const [key, group] of Object.entries(failGroups)) {
        if (group.count >= 2) {
          const [name] = key.split('::')
          findings.push({
            id: nextId('repeated-fail'),
            domain: 'behavior',
            severity: 'high',
            title: '重复失败不学习',
            location: {
              session: session.meta.id,
              turn: turn.index,
              timeRange: timeRange(turn, session),
            },
            description: `同一命令 "${name}" 连续失败 ${group.count} 次，Agent 未改变策略。`,
            impact: {
              failCount: group.count,
              userWaitTime: `${group.count} 次无效重试`,
            },
            rootCause: [
              '系统提示未要求失败后更换策略',
              '无错误学习机制',
            ],
            fix: [{
              action: '系统提示添加"同一命令失败 2 次后不再尝试，询问用户"',
              effort: '一键',
              expectedEffect: '减少无效重试',
            }],
            evidence: {
              failedCommand: name,
              failCount: group.count,
              errorMessages: group.errors.slice(0, 3),
            },
          })
        }
      }
    }
  }

  return findings
}

/** 检测项 3：工具选择不当 — Medium */
function detectToolMisuse(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []
  const browserTools = ['browser', 'web_fetch', 'mcp__browser', 'puppeteer']

  for (const session of sessions) {
    for (const turn of session.turns) {
      const browserCalls = turn.toolCalls.filter(tc =>
        browserTools.some(bt => tc.name.toLowerCase().includes(bt))
      )

      // Simple heuristic: using browser for things CLI could do
      for (const tc of browserCalls) {
        const url = (tc.args.url as string) || (tc.args.query as string) || ''
        // Heuristic: API endpoints or file operations
        if (url.match(/\/api\/|localhost|127\.0\.0\.1/) ||
            tc.args.command || tc.args.file_path) {
          findings.push({
            id: nextId('tool-misuse'),
            domain: 'behavior',
            severity: 'medium',
            title: '工具选择不当',
            location: {
              session: session.meta.id,
              turn: turn.index,
              timeRange: timeRange(turn, session),
            },
            description: `使用 browser 工具 (${tc.name}) 执行 CLI/API 可完成的操作。`,
            impact: { inefficiency: '浏览器操作比 CLI 慢且不稳定' },
            rootCause: ['Agent 未优先选择高效工具'],
            fix: [{
              action: '系统提示添加工具选择优先级规则',
              effort: '改配置',
              expectedEffect: '提高操作效率和稳定性',
            }],
            evidence: {
              toolName: tc.name,
              args: tc.args,
            },
          })
        }
      }
    }
  }

  return findings
}

/** 检测项 4：工具调用无最终回复 — High */
function detectNoFinalReply(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    // Check turns that end with stop reason 'stop' but have no text
    // Mid-session toolUse turns are normal — agent is just calling tools
    for (const turn of session.turns) {
      // Only flag turns where the agent stopped (end_turn) but produced no text
      if (turn.finalStopReason === 'stop' && turn.assistantMessages.length > 0 && turn.toolCallCount > 0) {
        const hasText = turn.assistantMessages.some(msg =>
          msg.content.some(b => b.type === 'text' && (b as { text: string }).text.trim().length > 0)
        )
        if (!hasText) {
          findings.push({
            id: nextId('no-reply'),
            domain: 'behavior',
            severity: 'high',
            title: '工具调用无最终回复',
            location: {
              session: session.meta.id,
              turn: turn.index,
              timeRange: timeRange(turn, session),
            },
            description: `Turn ${turn.index} 执行了 ${turn.toolCallCount} 次工具调用但未给用户文本回复。`,
            impact: {
              userWaitTime: '用户未收到任何反馈',
              toolCallCount: turn.toolCallCount,
            },
            rootCause: [
              '工具调用完成后未向用户汇报结果',
            ],
            fix: [{
              action: '系统提示添加"工具调用完成后必须向用户汇报结果"',
              effort: '改配置',
              expectedEffect: '确保每个 turn 都有文本回复',
            }],
            evidence: {
              finalStopReason: turn.finalStopReason,
              assistantMsgCount: turn.assistantMessages.length,
              toolCallCount: turn.toolCallCount,
            },
          })
        }
      }
    }
  }

  return findings
}

// ============================================================
// 4.1.2 任务执行质量
// ============================================================

/** 检测项 6：指令漂移 — High */
function detectInstructionDrift(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    // Look for scheduled/heartbeat rules in system prompts or early messages
    const systemText = session.messages
      .filter(m => m.role === 'system' || (m.role === 'user' && m === session.messages[0]))
      .map(m => getText(m.content))
      .join('\n')

    // Extract scheduled rules
    const rules: { pattern: RegExp; description: string }[] = []
    const heartbeatMatch = systemText.match(/每次.*必须.*读\s*(\S+)/g)
    if (heartbeatMatch) {
      for (const match of heartbeatMatch) {
        const fileMatch = match.match(/读\s*(\S+)/)
        if (fileMatch) {
          rules.push({
            pattern: new RegExp(fileMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
            description: match,
          })
        }
      }
    }

    // Check for "heartbeat" related rules
    if (systemText.match(/heartbeat|心跳|定时/i)) {
      // Count heartbeat turns and check compliance
      const heartbeatTurns = session.turns.filter(t =>
        getText(t.userMessage.content).match(/heartbeat|心跳|定时/i)
      )

      for (const rule of rules) {
        const compliantTurns = heartbeatTurns.filter(t =>
          t.toolCalls.some(tc =>
            tc.name.match(/read|cat|open/i) &&
            JSON.stringify(tc.args).match(rule.pattern)
          )
        )

        const complianceRate = heartbeatTurns.length > 0
          ? compliantTurns.length / heartbeatTurns.length
          : 1

        if (complianceRate < 0.5 && heartbeatTurns.length >= 3) {
          findings.push({
            id: nextId('instruction-drift'),
            domain: 'behavior',
            severity: 'high',
            title: '指令漂移',
            location: { session: session.meta.id, turn: 0, timeRange: '' },
            description: `定时任务规则"${rule.description}"的执行率仅 ${Math.round(complianceRate * 100)}%。`,
            impact: {
              complianceRate: `${Math.round(complianceRate * 100)}%`,
              expectedCount: heartbeatTurns.length,
              actualCount: compliantTurns.length,
            },
            rootCause: [
              '长 session 中上下文遗忘导致指令漂移',
              '未在每次心跳前强制读取指令文件',
            ],
            fix: [{
              action: '心跳必须先 read 指定文件，不依赖上下文记忆',
              effort: '一键',
              expectedEffect: '减少指令漂移',
            }],
            evidence: {
              rule: rule.description,
              expectedCount: heartbeatTurns.length,
              actualCount: compliantTurns.length,
              complianceRate,
            },
          })
        }
      }
    }
  }

  return findings
}

/** 检测项 7：任务未完成/中断 — High */
function detectIncompleteTask(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    // Only check the last turn of each session — mid-session toolUse stops are normal
    // (the agent loop naturally ends turns with toolUse when tool results follow)
    const lastTurn = session.turns[session.turns.length - 1]
    if (!lastTurn) continue

    if (lastTurn.toolCallCount > 0 && lastTurn.finalStopReason === 'toolUse') {
      // Session ended while agent was still calling tools — genuine incomplete task
      const hasPartialWork = lastTurn.toolCalls.some(tc => !tc.isError)
      if (hasPartialWork) {
        findings.push({
          id: nextId('incomplete-task'),
          domain: 'behavior',
          severity: 'high',
          title: '任务未完成/中断',
          location: {
            session: session.meta.id,
            turn: lastTurn.index,
            timeRange: timeRange(lastTurn, session),
          },
          description: `Session 最后一个 Turn (${lastTurn.index}) 有 ${lastTurn.toolCallCount} 次工具调用但未正常完成，Agent 在工具调用中途被中断。`,
          impact: {
            toolCallCount: lastTurn.toolCallCount,
            status: '任务中断',
          },
          rootCause: ['工具调用链异常中断', 'token 上限或超时'],
          fix: [{
            action: '检查 session 配置中的 max_tokens 和超时设置',
            effort: '改配置',
            expectedEffect: '减少任务中断',
          }],
          evidence: {
            finalStopReason: lastTurn.finalStopReason,
            toolCallCount: lastTurn.toolCallCount,
            successfulCalls: lastTurn.toolCalls.filter(tc => !tc.isError).length,
          },
        })
      }
    }
  }

  return findings
}

// ============================================================
// 4.1.3 信息准确性
// ============================================================

/** 检测项 11：数据过时不标注 — Medium */
function detectStaleData(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    // Track repeated text fragments across turns
    const textFragments: Map<string, number[]> = new Map()

    for (const turn of session.turns) {
      const text = turn.assistantMessages.map(m => getText(m.content)).join(' ')
      // Extract significant phrases (>20 chars)
      const phrases = text.match(/.{20,80}/g) || []
      for (const phrase of phrases) {
        const normalized = phrase.trim().toLowerCase()
        if (!textFragments.has(normalized)) textFragments.set(normalized, [])
        textFragments.get(normalized)!.push(turn.index)
      }
    }

    // Find phrases repeated across 3+ turns with "latest" / "最新" claims
    for (const [phrase, turnIndices] of textFragments.entries()) {
      const uniqueTurns = [...new Set(turnIndices)]
      if (uniqueTurns.length >= 3 && phrase.match(/最新|latest|current|实时/i)) {
        findings.push({
          id: nextId('stale-data'),
          domain: 'behavior',
          severity: 'medium',
          title: '数据过时不标注',
          location: { session: session.meta.id, turn: uniqueTurns[0], timeRange: '' },
          description: `连续 ${uniqueTurns.length} 个 Turn 引用相同数据并声称为"最新"。`,
          impact: { repetitions: uniqueTurns.length },
          rootCause: ['Agent 未刷新数据', '未标注数据获取时间'],
          fix: [{
            action: '系统提示添加"引用数据时标注获取时间"',
            effort: '改配置',
            expectedEffect: '用户可判断数据时效性',
          }],
          evidence: {
            sampleText: phrase.slice(0, 100),
            turnIndices: uniqueTurns,
          },
        })
        break // One finding per session is enough
      }
    }
  }

  return findings
}

/** 检测项 12：自评偏差 — High */
function detectSelfAssessmentBias(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    for (const turn of session.turns) {
      for (const msg of turn.assistantMessages) {
        const text = getText(msg.content)
        // Match patterns like "85/100", "评分: 92", "score: 88"
        const matches = text.matchAll(/(\d{1,3})\s*[/／]\s*100|评分[：:]\s*(\d{1,3})|score[:\s]*(\d{1,3})/gi)
        for (const match of matches) {
          const score = parseInt(match[1] || match[2] || match[3])
          if (score >= 0 && score <= 100) {
            // We'll flag this; actual comparison with objective score happens at report level
            findings.push({
              id: nextId('self-assess-bias'),
              domain: 'behavior',
              severity: 'high',
              title: '自评偏差',
              location: {
                session: session.meta.id,
                turn: turn.index,
                timeRange: timeRange(turn, session),
              },
              description: `Agent 自评分数 ${score}/100，需与客观检测分数对比验证。`,
              impact: { selfScore: score },
              rootCause: ['Agent 自评存在系统性偏高'],
              fix: [{
                action: '不依赖 Agent 自评，使用客观检测',
                effort: '改配置',
                expectedEffect: '消除自评偏差',
              }],
              evidence: {
                selfScore: score,
                matchedText: match[0],
              },
            })
          }
        }
      }
    }
  }

  return findings
}

// ============================================================
// 4.1.4 输出质量
// ============================================================

/** 检测项 13：重复输出 — Medium */
function detectRepetitiveOutput(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    const turnTexts: { index: number; text: string }[] = []

    for (const turn of session.turns) {
      const text = turn.assistantMessages.map(m => getText(m.content)).join(' ').trim()
      if (text.length > 50) {
        turnTexts.push({ index: turn.index, text })
      }
    }

    // Compare adjacent turns with simple Jaccard similarity on word n-grams
    for (let i = 1; i < turnTexts.length; i++) {
      const similarity = jaccardSimilarity(turnTexts[i - 1].text, turnTexts[i].text)
      if (similarity > 0.85) {
        findings.push({
          id: nextId('repetitive-output'),
          domain: 'behavior',
          severity: 'medium',
          title: '重复输出',
          location: {
            session: session.meta.id,
            turn: turnTexts[i].index,
            timeRange: '',
          },
          description: `Turn ${turnTexts[i - 1].index} 和 Turn ${turnTexts[i].index} 的回复相似度 ${Math.round(similarity * 100)}%。`,
          impact: { similarity: `${Math.round(similarity * 100)}%` },
          rootCause: ['Agent 未跟踪已输出的内容', '上下文遗忘导致重复'],
          fix: [{
            action: '系统提示添加"不要重复已告知的信息"',
            effort: '一键',
            expectedEffect: '减少信息疲劳',
          }],
          evidence: {
            turn1: turnTexts[i - 1].index,
            turn2: turnTexts[i].index,
            similarity,
            sampleText: turnTexts[i].text.slice(0, 100),
          },
        })
      }
    }
  }

  return findings
}

/** Simple word-level Jaccard similarity */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2))
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2))
  if (wordsA.size === 0 && wordsB.size === 0) return 0

  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }

  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0
}

/** 检测项 14：静默时段违规 — Medium */
function detectQuietHoursViolation(sessions: ParsedSession[], configFiles?: string[]): Finding[] {
  const findings: Finding[] = []

  // Extract quiet hours from config (simplified: look for patterns)
  // This would need actual config file content in production
  // For now, detect from session system messages
  for (const session of sessions) {
    const systemText = session.messages
      .filter(m => m.role === 'system')
      .map(m => getText(m.content))
      .join('\n')

    const quietMatch = systemText.match(/(\d{1,2})[点:时]\s*[-~到]\s*(\d{1,2})[点:时]/)
    if (!quietMatch) continue

    const quietStart = parseInt(quietMatch[1])
    const quietEnd = parseInt(quietMatch[2])

    for (const msg of session.messages) {
      if (msg.role === 'assistant' && msg.timestamp) {
        const hour = new Date(msg.timestamp).getHours()
        const inQuiet = quietStart < quietEnd
          ? (hour >= quietStart && hour < quietEnd)
          : (hour >= quietStart || hour < quietEnd)

        if (inQuiet) {
          findings.push({
            id: nextId('quiet-violation'),
            domain: 'behavior',
            severity: 'medium',
            title: '静默时段违规',
            location: { session: session.meta.id, turn: 0, timeRange: msg.timestamp || '' },
            description: `Agent 在静默时段 (${quietStart}:00-${quietEnd}:00) 产生了输出。`,
            impact: { violationTime: msg.timestamp || '' },
            rootCause: ['Agent 未遵守静默时段配置'],
            fix: [{
              action: '检查定时任务和心跳是否绕过了静默规则',
              effort: '改配置',
              expectedEffect: '遵守静默时段',
            }],
            evidence: {
              quietHours: `${quietStart}:00-${quietEnd}:00`,
              messageTime: msg.timestamp,
            },
          })
          break // One finding per session
        }
      }
    }
  }

  return findings
}

/** 检测项 16：编辑引入数据损坏 — High */
function detectEditCorruption(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    for (const turn of session.turns) {
      // Find edit/write tool calls
      const editCalls = turn.toolCalls.filter(tc =>
        tc.name.match(/edit|patch|replace|write|sed/i)
      )

      // Check for multiple edits to the same file in one turn
      const fileEdits: Record<string, number> = {}
      for (const tc of editCalls) {
        const file = (tc.args.file_path || tc.args.path || tc.args.file || '') as string
        if (file) {
          fileEdits[file] = (fileEdits[file] || 0) + 1
        }
      }

      for (const [file, count] of Object.entries(fileEdits)) {
        if (count >= 5) {
          findings.push({
            id: nextId('edit-corruption'),
            domain: 'behavior',
            severity: 'high',
            title: '编辑引入数据损坏风险',
            location: {
              session: session.meta.id,
              turn: turn.index,
              timeRange: timeRange(turn, session),
            },
            description: `同一文件 "${file}" 在 Turn ${turn.index} 中被编辑 ${count} 次，存在覆盖风险。`,
            impact: { editCount: count, file },
            rootCause: ['单 turn 内对同一文件多次编辑', '后续编辑可能覆盖前面的改动'],
            fix: [{
              action: '系统提示添加"对同一文件的修改应合并为一次操作"',
              effort: '改配置',
              expectedEffect: '减少编辑冲突',
            }],
            evidence: {
              fileName: file,
              editCount: count,
            },
          })
        }
      }

      // Check for large content reduction in edits
      for (const tc of editCalls) {
        const oldStr = (tc.args.old_string || tc.args.oldString || '') as string
        const newStr = (tc.args.new_string || tc.args.newString || '') as string
        if (oldStr.length > 200 && newStr.length < oldStr.length * 0.3) {
          findings.push({
            id: nextId('edit-corruption'),
            domain: 'behavior',
            severity: 'high',
            title: '编辑引入数据损坏',
            location: {
              session: session.meta.id,
              turn: turn.index,
              timeRange: timeRange(turn, session),
            },
            description: `编辑操作删除了 ${Math.round((1 - newStr.length / oldStr.length) * 100)}% 的内容。`,
            impact: {
              contentReduction: `${Math.round((1 - newStr.length / oldStr.length) * 100)}%`,
            },
            rootCause: ['编辑操作大幅删减内容', '可能为误操作'],
            fix: [{
              action: '在编辑操作前进行内容备份',
              effort: '改配置',
              expectedEffect: '可回滚误操作',
            }],
            evidence: {
              oldLength: oldStr.length,
              newLength: newStr.length,
              reductionPercent: Math.round((1 - newStr.length / oldStr.length) * 100),
            },
          })
        }
      }
    }
  }

  return findings
}

// ============================================================
// Public API
// ============================================================

/**
 * Run all deterministic behavior detections.
 * LLM-assisted detections (items 5, 8, 9, 10, 15) are handled separately in src/llm/
 */
export function detectBehaviorIssues(sessions: ParsedSession[]): Finding[] {
  findingSeq = 0 // Reset sequence for consistent IDs within a run
  return [
    ...detectToolLoop(sessions),           // 1: 工具死循环
    ...detectRepeatedFailures(sessions),   // 2: 重复失败不学习
    ...detectToolMisuse(sessions),         // 3: 工具选择不当
    ...detectNoFinalReply(sessions),       // 4: 工具调用无最终回复
    // 5: 任务偷换 — LLM assisted (src/llm/task-substitution.ts)
    ...detectInstructionDrift(sessions),   // 6: 指令漂移
    ...detectIncompleteTask(sessions),     // 7: 任务未完成/中断
    // 8: 误解用户意图 — LLM assisted (src/llm/intent-check.ts)
    // 9: 信息捏造 — LLM assisted (src/llm/fabrication.ts)
    // 10: 虚报进度 — deterministic pre-filter + LLM (src/llm/progress-check.ts)
    ...detectStaleData(sessions),          // 11: 数据过时不标注
    ...detectSelfAssessmentBias(sessions), // 12: 自评偏差
    ...detectRepetitiveOutput(sessions),   // 13: 重复输出
    ...detectQuietHoursViolation(sessions), // 14: 静默时段违规
    // 15: 不必要的文件写入 — LLM assisted (src/llm/write-check.ts)
    ...detectEditCorruption(sessions),     // 16: 编辑引入数据损坏
  ]
}
