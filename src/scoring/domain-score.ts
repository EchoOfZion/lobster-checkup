// ============================================================
// 龙虾体检 v4 — 域健康度评分（0-100，扣分制）
// ============================================================

import type { Finding, DomainScores, Domain } from '../lib/types'

const DEDUCTIONS: Record<string, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
}

/**
 * Calculate health score for a single domain.
 * Starts at 100, deducts per finding severity.
 * Minimum 0.
 */
export function calcDomainScore(findings: Finding[], domain: Domain): number {
  const domainFindings = findings.filter(f => f.domain === domain)
  let deduction = 0
  for (const f of domainFindings) {
    deduction += DEDUCTIONS[f.severity] || 0
  }
  return Math.max(0, 100 - deduction)
}

/**
 * Calculate all three domain scores.
 * Enhancement domain is NOT scored.
 */
export function calcAllDomainScores(findings: Finding[]): DomainScores {
  return {
    behavior: calcDomainScore(findings, 'behavior'),
    security: calcDomainScore(findings, 'security'),
    token: calcDomainScore(findings, 'token'),
  }
}
