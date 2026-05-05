import type { Finding, NormalizedSession, NormalizedTurn, SessionDiagnosis } from '../core/types'

export function buildSessionDiagnoses(sessions: NormalizedSession[], findings: Finding[], limit = 3): SessionDiagnosis[] {
  const findingsBySession = new Map<string, Finding[]>()
  for (const finding of findings) {
    const sessionId = finding.location?.sessionId
    if (!sessionId) continue
    findingsBySession.set(sessionId, [...(findingsBySession.get(sessionId) || []), finding])
  }

  return sessions.map((session) => diagnoseSession(session, findingsBySession.get(session.id) || []))
    .filter((diagnosis) => diagnosis.findingRefs.length > 0 || diagnosis.riskScore > 0)
    .sort((left, right) => right.riskScore - left.riskScore)
    .slice(0, limit)
}

function diagnoseSession(session: NormalizedSession, findings: Finding[]): SessionDiagnosis {
  const riskScore = findings.reduce((sum, finding) => sum + severityScore(finding.severity), 0)
  const firstTurn = session.turns.find((turn) => turn.userText.trim().length > 0)
  const lastTurn = [...session.turns].reverse().find((turn) => turn.assistantText.trim().length > 0)
  const topFinding = findings.sort((left, right) => severityScore(right.severity) - severityScore(left.severity))[0]

  return {
    sessionId: session.id,
    source: session.source,
    transcriptPath: session.transcriptPath,
    priority: priorityForScore(riskScore),
    riskScore,
    title: topFinding ? `${topFinding.title} in ${shortId(session.id)}` : `Review ${shortId(session.id)}`,
    goalSummary: summarize(firstTurn?.userText || 'No user goal captured.'),
    attemptSummary: summarizeAttempt(session.turns),
    riskSummary: findings.length > 0
      ? summarize(findings.map((finding) => finding.title).join('; '))
      : 'No major deterministic risks found.',
    verificationSummary: summarizeVerification(session.turns),
    finalResultSummary: lastTurn?.assistantText ? summarize(lastTurn.assistantText) : 'No final assistant conclusion captured.',
    suggestedAction: topFinding?.recommendation.action || 'Review this session manually if it was important.',
    findingRefs: findings.map((finding) => finding.fingerprint),
  }
}

function summarizeAttempt(turns: NormalizedTurn[]): string {
  const toolCount = turns.reduce((sum, turn) => sum + turn.toolCalls.length, 0)
  const failedCount = turns.reduce((sum, turn) => sum + turn.toolCalls.filter((tool) => tool.isError).length, 0)
  return `${turns.length} turn(s), ${toolCount} tool call(s), ${failedCount} failed tool call(s).`
}

function summarizeVerification(turns: NormalizedTurn[]): string {
  const verificationTools = turns.flatMap((turn) => turn.toolCalls)
    .filter((tool) => JSON.stringify(tool.args).match(/npm test|npm run lint|npm run build|pytest|cargo test|go test|checkup/i))
  if (verificationTools.length === 0) return 'No verification command detected.'
  if (verificationTools.some((tool) => tool.isError)) return 'Verification was attempted but failed.'
  return 'Verification evidence detected.'
}

function summarize(text: string, max = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function severityScore(severity: Finding['severity']): number {
  return { critical: 40, high: 20, medium: 8, low: 2 }[severity]
}

function priorityForScore(score: number): SessionDiagnosis['priority'] {
  if (score >= 30) return 'high'
  if (score >= 8) return 'medium'
  return 'low'
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id
}
