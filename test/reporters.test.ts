import test from 'node:test'
import assert from 'node:assert/strict'
import type { CheckupReport } from '../src/core/types'
import { renderHtmlReport } from '../src/reporters/html'
import { summarizeFindings } from '../src/reporters/json'
import { renderTerminalReport } from '../src/reporters/terminal'

const report: CheckupReport = {
  version: 1,
  generatedAt: '2026-05-05T00:00:00.000Z',
  cwd: '/tmp/work',
  windowDays: 7,
  discovery: [{ source: 'claude-code', status: 'ok', message: 'found sessions', candidates: 1 }],
  sessions: [{ source: 'claude-code', id: 's1', transcriptPath: '/tmp/s1.jsonl' }],
  scannedSessions: 1,
  findings: [{
    fingerprint: 'tool-loop:abc',
    detector: 'tool-loop',
    severity: 'critical',
    title: '<Tool loop>',
    description: 'too many tools',
    evidence: { toolCount: 21 },
    recommendation: { action: 'stop earlier', rationale: 'avoid loops' },
  }],
  evaluation: {
    overallStatus: 'needs_attention',
    overallScore: 72,
    dimensions: [
      { id: 'safety', label: 'Safety', score: 100, status: 'healthy', summary: 'Safety ok.', evidenceCount: 0 },
      { id: 'process', label: 'Process', score: 72, status: 'needs_attention', summary: 'Process issue.', evidenceCount: 1 },
      { id: 'outcome', label: 'Outcome', score: 100, status: 'healthy', summary: 'Outcome ok.', evidenceCount: 0 },
    ],
    topIssues: [{
      id: 'tool-loop',
      dimension: 'process',
      severity: 'critical',
      title: '工具调用缺少停止条件',
      description: 'too many tool calls',
      evidenceCount: 1,
      affectedSessions: 1,
      recommendation: 'stop earlier',
      relatedFindings: ['tool-loop:abc'],
    }],
  },
  diagnoses: [{
    sessionId: 's1',
    source: 'claude-code',
    transcriptPath: '/tmp/s1.jsonl',
    priority: 'high',
    riskScore: 40,
    title: 'Review s1',
    goalSummary: 'Fix issue',
    attemptSummary: '1 turn',
    riskSummary: 'Tool loop',
    verificationSummary: 'No verification command detected.',
    finalResultSummary: 'No final assistant conclusion captured.',
    suggestedAction: 'stop earlier',
    findingRefs: ['tool-loop:abc'],
  }],
  policy: { source: 'default' },
  summary: { critical: 1, high: 0, medium: 0, low: 0, total: 1 },
}

test('summarizeFindings counts severities', () => {
  assert.deepEqual(summarizeFindings(report.findings), {
    critical: 1,
    high: 0,
    medium: 0,
    low: 0,
    total: 1,
  })
})

test('renderHtmlReport escapes finding content and includes recommendation', () => {
  const html = renderHtmlReport(report)

  assert.equal(html.includes('<Tool loop>'), false)
  assert.equal(html.includes('&lt;Tool loop&gt;'), true)
  assert.equal(html.includes('Evaluation'), true)
  assert.equal(html.includes('Top Issues'), true)
  assert.equal(html.includes('Sessions Worth Reviewing'), true)
  assert.equal(html.includes('工具调用缺少停止条件'), true)
  assert.equal(html.includes('stop earlier'), true)
})

test('renderHtmlReport limits expanded raw findings', () => {
  const noisyReport: CheckupReport = {
    ...report,
    findings: Array.from({ length: 25 }, (_, index) => ({
      ...report.findings[0],
      fingerprint: `finding-${index}`,
      title: `Finding ${index}`,
    })),
    summary: { critical: 25, high: 0, medium: 0, low: 0, total: 25 },
  }

  const html = renderHtmlReport(noisyReport)

  assert.equal(html.includes('Showing 20 of 25 supporting findings'), true)
  assert.equal(html.includes('Finding 19'), true)
  assert.equal(html.includes('Finding 20'), false)
})

test('renderTerminalReport leads with evaluation and top issues', () => {
  const text = renderTerminalReport(report)

  assert.match(text, /Overall: NEEDS ATTENTION \(72\/100\)/)
  assert.match(text, /Dimensions: Safety 100\/100/)
  assert.match(text, /Top issues:/)
  assert.match(text, /Sessions worth reviewing:/)
  assert.match(text, /工具调用缺少停止条件/)
})

test('renderTerminalReport includes optional self review summary', () => {
  const text = renderTerminalReport({
    ...report,
    review: {
      mode: 'llm',
      provider: 'local-heuristic',
      generatedAt: '2026-05-05T00:00:00.000Z',
      summary: 'Evidence-backed self-review found risks.',
      judgments: [{
        id: 'review-1',
        dimension: 'safety',
        verdict: 'risk',
        title: 'Review risk',
        rationale: 'based on evidence',
        evidenceRefs: ['issue:tool-loop'],
        recommendation: 'fix it',
      }],
    },
  })

  assert.match(text, /Self review: local-heuristic/)
  assert.match(text, /Review risk/)
})
