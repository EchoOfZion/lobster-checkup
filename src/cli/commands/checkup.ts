// ============================================================
// 龙虾体检 v4 — 主检查命令
// 发现 → 解析 → 检测 → 评分 → 输出
// ============================================================

import { homedir } from 'os'
import { discoverSessions, discoverRemoteHermesSessions, parseSessionFile } from '../../parsers'
import type { ParsedSession } from '../../parsers/types'
import type { CheckupReport, Finding } from '../../lib/types'
import { detectBehaviorIssues } from '../../detectors/behavior'
import { detectSecurityIssues } from '../../detectors/security'
import { detectTokenIssues, buildTokenAnalysis } from '../../detectors/token'
import { generateEnhancements } from '../../detectors/enhancement'
import { buildSummary } from '../../detectors/summary'
import { calcAllDomainScores } from '../../scoring/domain-score'
import { calcHealthRole } from '../../scoring/health-role'
import { runLLMDetections, generateOneLiner, type LLMConfig, isLLMAvailable } from '../../llm'
import { saveToHistory } from '../../lib/history'

export interface CheckupOptions {
  path?: string              // 指定 Session 文件/目录
  behavior?: boolean         // 仅行为检测
  security?: boolean         // 仅安全检测
  cost?: boolean             // 仅 Token 检测
  enhance?: boolean          // 仅增强建议
  exportJson?: boolean       // 导出 JSON
  noUpload?: boolean         // 不上传
  llmConfig?: LLMConfig      // LLM 配置
  baseUrl?: string           // Web API base URL
}

/**
 * Run a full checkup and return the report.
 */
export async function runCheckup(options: CheckupOptions): Promise<CheckupReport> {
  // Step 1: Discover and parse sessions
  console.log('🦞 龙虾体检 v4 — 开始体检...\n')

  let sessions: ParsedSession[]
  if (options.path) {
    try {
      // Try as single file first
      sessions = [parseSessionFile(options.path)]
    } catch {
      // Try as directory
      const { parseSessionDirectory } = await import('../../parsers')
      sessions = parseSessionDirectory(options.path)
    }
  } else {
    sessions = discoverSessions(homedir())
    // Also try fetching remote Hermes sessions
    try {
      const remoteSessions = discoverRemoteHermesSessions()
      if (remoteSessions.length > 0) {
        sessions.push(...remoteSessions)
      }
    } catch { /* remote not available */ }
  }

  if (sessions.length === 0) {
    console.log('未发现 Session 文件。请使用 --path 指定路径。')
    process.exit(1)
  }

  console.log(`发现 ${sessions.length} 个 Session\n`)

  // Step 2: Determine which detections to run
  const runAll = !options.behavior && !options.security && !options.cost && !options.enhance
  const findings: Finding[] = []

  // Step 3: Run deterministic detections
  if (runAll || options.behavior) {
    console.log('📋 行为检测...')
    findings.push(...detectBehaviorIssues(sessions))
  }

  if (runAll || options.security) {
    console.log('🔒 安全检测...')
    findings.push(...detectSecurityIssues(sessions))
  }

  if (runAll || options.cost) {
    console.log('💰 Token 消耗检测...')
    findings.push(...detectTokenIssues(sessions))
  }

  // Step 4: LLM-assisted detections
  if (runAll || options.behavior) {
    if (options.llmConfig && isLLMAvailable(options.llmConfig)) {
      console.log('🤖 LLM 辅助检测...')
      const llmFindings = await runLLMDetections(sessions, options.llmConfig)
      findings.push(...llmFindings)
    }
  }

  // Step 5: Build token analysis
  const tokenAnalysis = buildTokenAnalysis(sessions)

  // Step 6: Generate enhancements
  const enhancements = (runAll || options.enhance)
    ? generateEnhancements(sessions, findings)
    : []

  // Step 7: Calculate scores
  const domainScores = calcAllDomainScores(findings)
  const healthRole = calcHealthRole(findings)

  // Step 8: Build summary
  const summary = buildSummary(findings)

  // Step 9: LLM one-liner (if available)
  if (options.llmConfig && isLLMAvailable(options.llmConfig)) {
    try {
      const oneLiner = await generateOneLiner({
        healthRole,
        domainScores,
        severityCounts: summary.severityCounts,
        totalFindings: findings.length,
        totalSavingsPerWeek: summary.totalSavingsPerWeek,
        tokenAnalysis,
        topIssues: findings
          .filter(f => f.severity === 'critical' || f.severity === 'high')
          .slice(0, 3)
          .map(f => f.title),
      }, options.llmConfig)
      summary.oneLiner = oneLiner
    } catch {
      // Keep fallback summary
    }
  }

  // Step 10: Calculate period
  const timestamps = sessions
    .flatMap(s => [s.meta.startTime, s.meta.endTime])
    .filter(Boolean)
    .map(t => new Date(t!).getTime())
    .filter(t => !isNaN(t))

  const periodMs = timestamps.length >= 2
    ? Math.max(...timestamps) - Math.min(...timestamps)
    : 86400000
  const periodDays = Math.max(1, Math.round(periodMs / 86400000))

  // Build report
  const report: CheckupReport = {
    version: 4,
    generatedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    periodDays,
    findings,
    tokenAnalysis,
    enhancements,
    domainScores,
    healthRole,
    summary,
  }

  // Step 11: Save to local history
  const historyPath = saveToHistory(report)
  console.log(`\n📁 已保存到: ${historyPath}`)

  // Step 12: Upload to web (unless --no-upload)
  if (!options.noUpload && options.baseUrl) {
    try {
      console.log('📤 上传报告...')
      const response = await fetch(`${options.baseUrl}/api/checkup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 4, report }),
      })
      if (response.ok) {
        const { url } = await response.json() as { url: string }
        console.log(`🌐 报告链接: ${url}`)
      }
    } catch {
      console.log('⚠️  上传失败，报告已保存到本地')
    }
  }

  return report
}

/**
 * Print report summary to terminal.
 */
export function printReport(report: CheckupReport): void {
  const { healthRole, domainScores, summary, findings, tokenAnalysis } = report

  console.log('\n' + '═'.repeat(50))
  console.log(`  ${healthRole.name} (${healthRole.grade}级)`)
  console.log(`  ${healthRole.description}`)
  console.log('═'.repeat(50))

  console.log(`\n${summary.oneLiner}\n`)

  // Domain scores
  console.log(`域健康度:`)
  console.log(`  行为  ${scoreBar(domainScores.behavior)} ${domainScores.behavior}/100`)
  console.log(`  安全  ${scoreBar(domainScores.security)} ${domainScores.security}/100`)
  console.log(`  Token ${scoreBar(domainScores.token)} ${domainScores.token}/100`)

  // Severity counts
  console.log(`\n问题统计:`)
  console.log(`  Critical: ${summary.severityCounts.critical}  High: ${summary.severityCounts.high}  Medium: ${summary.severityCounts.medium}  Low: ${summary.severityCounts.low}`)
  console.log(`  总计: ${findings.length} 个问题`)

  // Token analysis
  console.log(`\n花销全景: $${tokenAnalysis.totalCost.toFixed(2)}`)
  console.log(`  必要: $${tokenAnalysis.necessary.toFixed(2)}  可优化: $${tokenAnalysis.optimizable.toFixed(2)}  浪费: $${tokenAnalysis.wasted.toFixed(2)}`)

  // Top 3 fixes
  if (summary.top3Fixes.length > 0) {
    console.log(`\nTop 3 修复:`)
    for (let i = 0; i < summary.top3Fixes.length; i++) {
      const fix = summary.top3Fixes[i]
      const savings = fix.weeklySavings ? ` (省 $${fix.weeklySavings.toFixed(2)}/周)` : ''
      console.log(`  ${i + 1}. [${fix.effort}] ${fix.action}${savings}`)
    }
  }

  if (summary.totalSavingsPerWeek > 0) {
    console.log(`\n💰 总计每周可省: $${summary.totalSavingsPerWeek.toFixed(2)}`)
  }

  console.log('')
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 5)
  const empty = 20 - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}
