import test from 'node:test'
import assert from 'node:assert/strict'
import type { CheckupReport } from '../src/core/types'
import { buildReviewPrompt, buildReviewPacket, extractJsonObject, gateReviewResult, runSelfReview } from '../src/review'

const report: CheckupReport = {
  version: 1,
  generatedAt: '2026-05-05T00:00:00.000Z',
  cwd: '/tmp/work',
  windowDays: 7,
  discovery: [{ source: 'codex', status: 'ok', message: 'found sessions', candidates: 1 }],
  sessions: [{ source: 'codex', id: 's1', transcriptPath: '/tmp/s1.jsonl' }],
  scannedSessions: 1,
  findings: [{
    fingerprint: 'sensitive-file-read:abc',
    detector: 'sensitive-file-read',
    severity: 'high',
    title: 'Sensitive read',
    description: 'read secret',
    evidence: { path: '/Users/me/.env', token: 'sk-proj-123456789012345678901234567890' },
    recommendation: { action: 'redact', rationale: 'avoid leaks' },
    location: { source: 'codex', sessionId: 's1', transcriptPath: '/tmp/s1.jsonl', turnIndex: 0 },
  }],
  evaluation: {
    overallStatus: 'needs_attention',
    overallScore: 64,
    dimensions: [
      { id: 'safety', label: 'Safety', score: 60, status: 'needs_attention', summary: 'Safety issue.', evidenceCount: 1 },
      { id: 'process', label: 'Process', score: 90, status: 'healthy', summary: 'Process ok.', evidenceCount: 0 },
      { id: 'outcome', label: 'Outcome', score: 80, status: 'healthy', summary: 'Outcome ok.', evidenceCount: 0 },
    ],
    topIssues: [{
      id: 'sensitive-info',
      dimension: 'safety',
      severity: 'high',
      title: '敏感信息进入 agent 链路',
      description: 'secret evidence',
      evidenceCount: 1,
      affectedSessions: 1,
      recommendation: 'redact secrets',
      relatedFindings: ['sensitive-file-read:abc'],
    }],
  },
  summary: { critical: 0, high: 1, medium: 0, low: 0, total: 1 },
}

test('buildReviewPacket redacts sensitive evidence before LLM review', () => {
  const packet = buildReviewPacket(report)
  const json = JSON.stringify(packet)

  assert.equal(json.includes('/Users/me/.env'), false)
  assert.equal(json.includes('sk-proj-123456789012345678901234567890'), false)
  assert.equal(json.includes('[redacted-sensitive-path]'), true)
  assert.equal(json.includes('[redacted-secret]'), true)
})

test('gateReviewResult drops judgments without known evidence references', () => {
  const packet = buildReviewPacket(report)
  const gated = gateReviewResult(packet, {
    mode: 'llm',
    provider: 'test-provider',
    generatedAt: '2026-05-05T00:00:00.000Z',
    summary: 'reviewed',
    judgments: [
      {
        id: 'kept',
        dimension: 'safety',
        verdict: 'risk',
        title: 'backed',
        rationale: 'uses known evidence',
        evidenceRefs: ['finding:sensitive-file-read:abc'],
        recommendation: 'fix',
      },
      {
        id: 'dropped',
        dimension: 'outcome',
        verdict: 'risk',
        title: 'unsupported',
        rationale: 'no evidence',
        evidenceRefs: ['finding:missing'],
        recommendation: 'ignore',
      },
    ],
  })

  assert.deepEqual(gated.judgments.map((judgment) => judgment.id), ['kept'])
})

test('runSelfReview returns evidence-backed structured judgments', async () => {
  const review = await runSelfReview(report, { mode: 'llm' })

  assert.equal(review.mode, 'llm')
  assert.equal(review.provider, 'local-heuristic')
  assert.equal(review.judgments.length > 0, true)
  assert.equal(review.judgments.every((judgment) => judgment.evidenceRefs.length > 0), true)
})

test('buildReviewPrompt requires JSON-only evidence-backed output', () => {
  const prompt = buildReviewPrompt(buildReviewPacket(report))

  assert.match(prompt, /Return only JSON/)
  assert.match(prompt, /evidenceRefs/)
  assert.match(prompt, /Do not invent evidence/)
})

test('extractJsonObject parses JSON embedded in provider output', () => {
  const parsed = extractJsonObject('log line\n{"summary":"ok","judgments":[]}\nmore logs') as { summary: string }

  assert.equal(parsed.summary, 'ok')
})

test('runSelfReview can use an injected codex-compatible provider', async () => {
  const review = await runSelfReview(report, {
    mode: 'llm',
    provider: 'codex',
    runProvider: async () => JSON.stringify({
      summary: 'codex reviewed',
      judgments: [{
        id: 'codex-risk',
        dimension: 'safety',
        verdict: 'risk',
        title: 'Codex-backed risk',
        rationale: 'based on evidence',
        evidenceRefs: ['issue:sensitive-info'],
        recommendation: 'fix',
      }],
    }),
  })

  assert.equal(review.provider, 'codex')
  assert.equal(review.summary, 'codex reviewed')
  assert.equal(review.judgments[0].title, 'Codex-backed risk')
})
