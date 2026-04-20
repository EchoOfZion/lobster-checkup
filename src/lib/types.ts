// ============================================================
// 龙虾体检 v4 — 核心类型定义
// ============================================================

// --- 病历卡（Finding）---

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Domain = 'behavior' | 'security' | 'token' | 'enhancement'
export type Effort = '一键' | '改配置' | '改代码'

export interface Finding {
  id: string                    // 格式：{domain}-{category}-{seq}
  domain: Domain
  severity: Severity
  title: string
  location?: {
    session: string
    turn: number
    timeRange: string
  }
  description: string
  impact: Record<string, string | number>
  rootCause: string[]
  fix: {
    action: string
    effort: Effort
    expectedEffect: string
    weeklySavings?: number      // USD/week
  }[]
  evidence: Record<string, any>
  llmAssisted?: boolean
}

// --- 增强建议 ---

export interface Enhancement {
  id: string                     // enhancement-{direction}-{seq}
  direction: string
  condition: string
  suggestion: string
  expectedEffect: string
  recommendation?: {
    product: string
    type: 'builtin' | 'ecosystem' | 'thirdparty'
    action: string
  }
}

// --- Token 花销分析 ---

export interface TokenAnalysis {
  totalCost: number
  periodDays: number
  necessary: number
  optimizable: number
  wasted: number
  breakdown: {
    modelMismatch: number
    contextBloat: number
    runawayTurns: number
    heartbeatOverhead: number
    repeatedFailures: number
  }
}

// --- 评分与评级 ---

export interface DomainScores {
  behavior: number              // 0-100
  security: number              // 0-100
  token: number                 // 0-100
}

export type Grade = 'A' | 'B' | 'C' | 'D'

export interface HealthRole {
  grade: Grade
  name: string
  description: string
}

export interface SeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
}

// --- 检测报告 ---

export interface CheckupReport {
  version: 4
  generatedAt: string           // ISO 8601
  sessionCount: number
  periodDays: number
  // 检测结果
  findings: Finding[]
  tokenAnalysis: TokenAnalysis
  enhancements: Enhancement[]
  // 评分
  domainScores: DomainScores
  // 评级
  healthRole: HealthRole
  // 总结
  summary: {
    oneLiner: string
    severityCounts: SeverityCounts
    top3Fixes: Finding['fix'][number][]
    totalSavingsPerWeek: number
  }
}

// --- API ---

export interface CheckupSubmission {
  version: 4
  report: CheckupReport
}

export interface CheckupResponse {
  id: string
  url: string
}
