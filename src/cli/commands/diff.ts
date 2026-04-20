// ============================================================
// 龙虾体检 v4 — --diff 趋势对比
// 对比最近两次体检的变化
// ============================================================

import type { CheckupReport, SeverityCounts } from '../../lib/types'
import { loadHistory } from '../../lib/history'

/**
 * Run diff comparison between the two most recent reports.
 */
export function runDiff(): void {
  console.log('📊 龙虾体检 — 趋势对比\n')

  const history = loadHistory()
  if (history.length < 2) {
    console.log('需要至少 2 次体检记录才能对比。当前记录数: ' + history.length)
    return
  }

  const current = history[0].report
  const previous = history[1].report

  console.log(`当前: ${current.generatedAt}`)
  console.log(`上次: ${previous.generatedAt}\n`)

  // Health role
  console.log('评级变化:')
  console.log(`  ${previous.healthRole.name} (${previous.healthRole.grade}) → ${current.healthRole.name} (${current.healthRole.grade})`)
  console.log('')

  // Domain scores
  console.log('域健康度变化:')
  printScoreDiff('行为', previous.domainScores.behavior, current.domainScores.behavior)
  printScoreDiff('安全', previous.domainScores.security, current.domainScores.security)
  printScoreDiff('Token', previous.domainScores.token, current.domainScores.token)
  console.log('')

  // Severity counts
  console.log('问题统计变化:')
  printCountDiff('Critical', previous.summary.severityCounts.critical, current.summary.severityCounts.critical)
  printCountDiff('High', previous.summary.severityCounts.high, current.summary.severityCounts.high)
  printCountDiff('Medium', previous.summary.severityCounts.medium, current.summary.severityCounts.medium)
  printCountDiff('Low', previous.summary.severityCounts.low, current.summary.severityCounts.low)
  printCountDiff('总计', previous.findings.length, current.findings.length)
  console.log('')

  // Cost
  console.log('花费变化:')
  printCostDiff('总花费', previous.tokenAnalysis.totalCost, current.tokenAnalysis.totalCost)
  printCostDiff('浪费', previous.tokenAnalysis.wasted, current.tokenAnalysis.wasted)
  printCostDiff('可优化', previous.tokenAnalysis.optimizable, current.tokenAnalysis.optimizable)
  console.log('')

  // New findings
  const newFindings = current.findings.filter(cf =>
    !previous.findings.some(pf => pf.id === cf.id)
  )
  const resolvedFindings = previous.findings.filter(pf =>
    !current.findings.some(cf => cf.id === pf.id)
  )

  if (newFindings.length > 0) {
    console.log(`新增问题 (${newFindings.length}):`)
    for (const f of newFindings.slice(0, 5)) {
      console.log(`  + [${f.severity.toUpperCase()}] ${f.title}`)
    }
    if (newFindings.length > 5) console.log(`  ... 还有 ${newFindings.length - 5} 个`)
    console.log('')
  }

  if (resolvedFindings.length > 0) {
    console.log(`已修复 (${resolvedFindings.length}):`)
    for (const f of resolvedFindings.slice(0, 5)) {
      console.log(`  - [${f.severity.toUpperCase()}] ${f.title}`)
    }
    if (resolvedFindings.length > 5) console.log(`  ... 还有 ${resolvedFindings.length - 5} 个`)
    console.log('')
  }
}

function printScoreDiff(label: string, prev: number, curr: number): void {
  const diff = curr - prev
  const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→'
  const sign = diff > 0 ? '+' : ''
  console.log(`  ${label.padEnd(6)} ${prev} → ${curr} ${arrow} ${sign}${diff}`)
}

function printCountDiff(label: string, prev: number, curr: number): void {
  const diff = curr - prev
  const sign = diff > 0 ? '+' : ''
  const emoji = diff > 0 ? '⬆' : diff < 0 ? '⬇' : '─'
  console.log(`  ${label.padEnd(8)} ${prev} → ${curr} (${sign}${diff}) ${emoji}`)
}

function printCostDiff(label: string, prev: number, curr: number): void {
  const diff = curr - prev
  const sign = diff > 0 ? '+' : ''
  const emoji = diff > 0 ? '⬆' : diff < 0 ? '⬇' : '─'
  console.log(`  ${label.padEnd(6)} $${prev.toFixed(2)} → $${curr.toFixed(2)} (${sign}$${diff.toFixed(2)}) ${emoji}`)
}
