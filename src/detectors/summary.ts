// ============================================================
// 龙虾体检 v4 — 总结域
// 汇总 findings → severity 统计 + Top 3 修复 + 省钱金额
// 一句话总结由 LLM 生成（见 src/llm/summary-gen.ts）
// ============================================================

import type { Finding, SeverityCounts, CheckupReport } from '../lib/types'
import { calcSeverityCounts, calcHealthRole } from '../scoring/health-role'
import { calcAllDomainScores } from '../scoring/domain-score'

/**
 * Build the summary section of a CheckupReport.
 * `oneLiner` is a placeholder here — it will be replaced by LLM-generated text.
 */
export function buildSummary(findings: Finding[]): CheckupReport['summary'] {
  const severityCounts = calcSeverityCounts(findings)
  const top3Fixes = selectTop3Fixes(findings)
  const totalSavingsPerWeek = calcTotalSavings(findings)

  const oneLiner = generateFallbackOneLiner(severityCounts, findings.length)

  return {
    oneLiner,
    severityCounts,
    top3Fixes,
    totalSavingsPerWeek,
  }
}

/**
 * Select top 3 fixes ranked by ROI:
 * 1. Higher severity first
 * 2. Lower effort first (一键 > 改配置 > 改代码)
 * 3. Higher weeklySavings first
 */
function selectTop3Fixes(findings: Finding[]): CheckupReport['summary']['top3Fixes'] {
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  const effortOrder: Record<string, number> = {
    '一键': 0,
    '改配置': 1,
    '改代码': 2,
  }

  // Flatten all fixes and attach severity info
  const allFixes: {
    fix: Finding['fix'][number]
    severity: string
    findingTitle: string
  }[] = []

  for (const finding of findings) {
    for (const fix of finding.fix) {
      allFixes.push({
        fix,
        severity: finding.severity,
        findingTitle: finding.title,
      })
    }
  }

  // Sort by ROI (severity asc → effort asc → savings desc)
  allFixes.sort((a, b) => {
    const sevA = severityOrder[a.severity] ?? 99
    const sevB = severityOrder[b.severity] ?? 99
    if (sevA !== sevB) return sevA - sevB

    const effA = effortOrder[a.fix.effort] ?? 99
    const effB = effortOrder[b.fix.effort] ?? 99
    if (effA !== effB) return effA - effB

    return (b.fix.weeklySavings || 0) - (a.fix.weeklySavings || 0)
  })

  // Deduplicate by action text
  const seen = new Set<string>()
  const result: CheckupReport['summary']['top3Fixes'] = []

  for (const item of allFixes) {
    if (seen.has(item.fix.action)) continue
    seen.add(item.fix.action)
    result.push(item.fix)
    if (result.length >= 3) break
  }

  return result
}

/**
 * Sum up all weeklySavings from fixes across all findings.
 */
function calcTotalSavings(findings: Finding[]): number {
  let total = 0
  for (const finding of findings) {
    for (const fix of finding.fix) {
      if (fix.weeklySavings && fix.weeklySavings > 0) {
        total += fix.weeklySavings
      }
    }
  }
  return Math.round(total * 100) / 100
}

/**
 * Fallback one-liner when LLM is unavailable.
 * Will be replaced by LLM-generated summary in the pipeline.
 */
function generateFallbackOneLiner(counts: SeverityCounts, totalFindings: number): string {
  if (totalFindings === 0) {
    return '所有检测域均无问题，Agent 运行状态良好。'
  }

  const parts: string[] = []
  if (counts.critical > 0) parts.push(`${counts.critical} 个严重问题`)
  if (counts.high > 0) parts.push(`${counts.high} 个高风险问题`)
  if (counts.medium > 0) parts.push(`${counts.medium} 个中风险问题`)
  if (counts.low > 0) parts.push(`${counts.low} 个低风险问题`)

  return `共发现 ${totalFindings} 个问题（${parts.join('、')}），建议优先处理严重和高风险项。`
}
