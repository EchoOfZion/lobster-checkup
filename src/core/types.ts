export type AgentSource = 'claude-code' | 'openclaw' | 'docker-openclaw' | 'hermes' | 'codex' | 'path'

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface SessionCandidate {
  source: AgentSource
  id: string
  transcriptPath: string
  projectPath?: string
  agentId?: string
  startedAt?: string
  updatedAt?: string
}

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  result?: string
  isError: boolean
}

export interface NormalizedMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp?: string
  model?: string
  stopReason?: 'stop' | 'toolUse' | 'maxTokens'
  usage?: {
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
}

export interface NormalizedTurn {
  index: number
  userText: string
  assistantText: string
  toolCalls: ToolCall[]
  finalStopReason: 'stop' | 'toolUse' | 'maxTokens'
  costUsd: number
  inputTokens: number
  outputTokens: number
}

export interface NormalizedSession {
  source: AgentSource
  id: string
  transcriptPath: string
  projectPath?: string
  agentId?: string
  startedAt?: string
  endedAt?: string
  turns: NormalizedTurn[]
  usage: {
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
}

export interface Finding {
  fingerprint: string
  detector: string
  severity: Severity
  title: string
  description: string
  evidence: Record<string, string | number | boolean | string[]>
  location?: {
    source: AgentSource
    sessionId: string
    transcriptPath: string
    turnIndex?: number
  }
  recommendation: {
    action: string
    rationale: string
  }
}

export interface DiscoveryDiagnostic {
  source: AgentSource
  status: 'ok' | 'empty' | 'error'
  message: string
  candidates: number
}

export type EvaluationDimensionId = 'safety' | 'process' | 'outcome'

export type EvaluationStatus = 'healthy' | 'needs_attention' | 'critical'

export interface EvaluationDimension {
  id: EvaluationDimensionId
  label: string
  score: number
  status: EvaluationStatus
  summary: string
  evidenceCount: number
}

export interface EvaluationIssue {
  id: string
  dimension: EvaluationDimensionId
  severity: Severity
  title: string
  description: string
  evidenceCount: number
  affectedSessions: number
  recommendation: string
  relatedFindings: string[]
}

export interface EvaluationSummary {
  overallStatus: EvaluationStatus
  overallScore: number
  dimensions: EvaluationDimension[]
  topIssues: EvaluationIssue[]
}

export type ReviewMode = 'llm'

export type ReviewVerdict = 'ok' | 'risk' | 'unknown'

export interface ReviewJudgment {
  id: string
  dimension: EvaluationDimensionId
  verdict: ReviewVerdict
  title: string
  rationale: string
  evidenceRefs: string[]
  recommendation: string
}

export interface ReviewResult {
  mode: ReviewMode
  provider: string
  generatedAt: string
  summary: string
  judgments: ReviewJudgment[]
  providerError?: string
}

export interface CheckupPolicy {
  sensitivePathPatterns: string[]
  requiredVerificationCommands: string[]
  requiredSkillsByIntent: Record<string, string>
  retainRawFindingsInHtml: boolean
  reviewProvider?: 'local' | 'codex'
}

export interface SessionDiagnosis {
  sessionId: string
  source: AgentSource
  transcriptPath: string
  priority: 'high' | 'medium' | 'low'
  riskScore: number
  title: string
  goalSummary: string
  attemptSummary: string
  riskSummary: string
  verificationSummary: string
  finalResultSummary: string
  suggestedAction: string
  findingRefs: string[]
}

export interface TrendMetric {
  current: number
  previous: number
  delta: number
  direction: 'improved' | 'regressed' | 'unchanged'
}

export interface TrendReport {
  status: 'not_enough_history' | 'ready'
  currentWindowDays: number
  previousWindowDays: number
  metrics: {
    safetyIssues: TrendMetric
    repeatedFailures: TrendMetric
    verificationGaps: TrendMetric
    skillGaps: TrendMetric
    toolControlBreakdowns: TrendMetric
    llmReviewRisks: TrendMetric
  }
}

export interface CheckupReport {
  version: 1
  generatedAt: string
  cwd: string
  windowDays: number
  discovery: DiscoveryDiagnostic[]
  sessions: SessionCandidate[]
  scannedSessions: number
  findings: Finding[]
  evaluation: EvaluationSummary
  diagnoses: SessionDiagnosis[]
  trend?: TrendReport
  policy: {
    source: 'default' | 'file'
    path?: string
  }
  review?: ReviewResult
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    total: number
  }
}
