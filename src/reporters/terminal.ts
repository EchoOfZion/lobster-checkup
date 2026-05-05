import type { CheckupReport } from '../core/types'

export function renderTerminalReport(report: CheckupReport): string {
  const lines = [
    `Lobster Checkup scanned ${report.scannedSessions} session(s).`,
    `Overall: ${formatStatus(report.evaluation.overallStatus)} (${report.evaluation.overallScore}/100)`,
    `Dimensions: ${report.evaluation.dimensions.map((dimension) => `${dimension.label} ${dimension.score}/100`).join(' · ')}`,
    `Findings: ${report.summary.total} total, ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low.`,
  ]

  if (report.evaluation.topIssues.length > 0) {
    lines.push('Top issues:')
    for (const issue of report.evaluation.topIssues) {
      lines.push(`- [${issue.severity.toUpperCase()}] ${issue.title}: ${issue.recommendation}`)
    }
  } else {
    lines.push('Top issues: none')
  }

  if (report.diagnoses.length > 0) {
    lines.push('Sessions worth reviewing:')
    for (const diagnosis of report.diagnoses.slice(0, 3)) {
      lines.push(`- [${diagnosis.priority.toUpperCase()}] ${diagnosis.title}: ${diagnosis.suggestedAction}`)
    }
  }

  if (report.trend) {
    lines.push(`Trend: ${report.trend.status}`)
    lines.push(`- Safety issues: ${formatTrend(report.trend.metrics.safetyIssues)}`)
    lines.push(`- Repeated failures: ${formatTrend(report.trend.metrics.repeatedFailures)}`)
    lines.push(`- Verification gaps: ${formatTrend(report.trend.metrics.verificationGaps)}`)
    lines.push(`- Skill gaps: ${formatTrend(report.trend.metrics.skillGaps)}`)
  }

  if (report.review) {
    lines.push(`Self review: ${report.review.provider}`)
    lines.push(report.review.summary)
    for (const judgment of report.review.judgments.slice(0, 3)) {
      lines.push(`- [${judgment.verdict.toUpperCase()}] ${judgment.title}: ${judgment.recommendation}`)
    }
  }

  return `${lines.join('\n')}\n`
}

function formatStatus(status: string): string {
  return status.replaceAll('_', ' ').toUpperCase()
}

function formatTrend(metric: { current: number; previous: number; direction: string }): string {
  return `${metric.current} now vs ${metric.previous} previous (${metric.direction})`
}
