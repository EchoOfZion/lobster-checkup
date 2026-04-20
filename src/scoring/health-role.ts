// ============================================================
// 龙虾体检 v4 — 综合评级（龙虾角色）
// ============================================================

import type { Finding, HealthRole, SeverityCounts } from '../lib/types'

export function calcSeverityCounts(findings: Finding[]): SeverityCounts {
  return {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  }
}

/**
 * Determine the health role based on severity counts.
 * Priority order (highest to lowest):
 */
export function calcHealthRole(findings: Finding[]): HealthRole {
  const counts = calcSeverityCounts(findings)

  if (counts.critical >= 10 && counts.high >= 10) {
    return {
      grade: 'D',
      name: '标本龙虾',
      description: 'Critical 和 High 大面积爆发，Agent 几乎无法正常完成任务，需全面重新配置。',
    }
  }

  if (counts.critical >= 5) {
    return {
      grade: 'C',
      name: 'ICU 龙虾',
      description: '多个 Critical 同时存在，Agent 运行严重异常，建议立即排查修复。',
    }
  }

  if (counts.critical >= 1 || counts.high >= 5) {
    return {
      grade: 'C',
      name: '带病上岗龙虾',
      description: '存在 Critical 或多个 High，Agent 有明显缺陷，正在造成效率或成本损失。',
    }
  }

  if (counts.high >= 1) {
    return {
      grade: 'B',
      name: '亚健康龙虾',
      description: '存在 High 级别问题，Agent 可正常工作但部分场景表现不佳，建议尽快处理。',
    }
  }

  if (counts.medium >= 1 || counts.low >= 1) {
    return {
      grade: 'A',
      name: '微胖龙虾',
      description: '整体健康，少量 Medium/Low 问题，不影响正常使用，建议择机优化。',
    }
  }

  return {
    grade: 'A',
    name: '满血龙虾',
    description: '所有检测域均无问题，Agent 运行状态良好。',
  }
}
