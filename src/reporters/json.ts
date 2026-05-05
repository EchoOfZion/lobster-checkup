import type { CheckupReport, Finding } from '../core/types'

export function summarizeFindings(findings: Finding[]): CheckupReport['summary'] {
  return {
    critical: findings.filter((finding) => finding.severity === 'critical').length,
    high: findings.filter((finding) => finding.severity === 'high').length,
    medium: findings.filter((finding) => finding.severity === 'medium').length,
    low: findings.filter((finding) => finding.severity === 'low').length,
    total: findings.length,
  }
}

export function formatJsonReport(report: CheckupReport): string {
  return `${JSON.stringify(report, null, 2)}\n`
}
