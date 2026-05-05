import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CheckupReport } from '../src/core/types'
import { buildTrendReport } from '../src/trend'

function report(generatedAt: string, overrides: Partial<CheckupReport>): CheckupReport {
  return {
    version: 1,
    generatedAt,
    cwd: '/tmp/work',
    windowDays: 7,
    discovery: [],
    sessions: [],
    scannedSessions: 0,
    findings: [],
    diagnoses: [],
    policy: { source: 'default' },
    evaluation: {
      overallStatus: 'healthy',
      overallScore: 90,
      dimensions: [],
      topIssues: [],
    },
    summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
    ...overrides,
  }
}

test('buildTrendReport compares current report against previous history', () => {
  const root = join(tmpdir(), `lobster-trend-${Date.now()}`)
  try {
    mkdirSync(join(root, 'old'), { recursive: true })
    writeFileSync(join(root, 'old', 'report.json'), JSON.stringify(report('2026-04-30T00:00:00.000Z', {
      findings: [
        { fingerprint: 'a', detector: 'sensitive-file-read', severity: 'high', title: 'a', description: 'a', evidence: {}, recommendation: { action: 'a', rationale: 'a' } },
        { fingerprint: 'b', detector: 'repeated-failure', severity: 'high', title: 'b', description: 'b', evidence: {}, recommendation: { action: 'b', rationale: 'b' } },
      ],
      evaluation: {
        overallStatus: 'needs_attention',
        overallScore: 70,
        dimensions: [],
        topIssues: [{ id: 'skill-not-used', dimension: 'process', severity: 'high', title: 'skill', description: 'skill', evidenceCount: 1, affectedSessions: 1, recommendation: 'skill', relatedFindings: [] }],
      },
    })))

    const current = report('2026-05-05T00:00:00.000Z', {
      findings: [
        { fingerprint: 'c', detector: 'repeated-failure', severity: 'high', title: 'c', description: 'c', evidence: {}, recommendation: { action: 'c', rationale: 'c' } },
      ],
      evaluation: {
        overallStatus: 'healthy',
        overallScore: 90,
        dimensions: [],
        topIssues: [],
      },
    })

    const trend = buildTrendReport(current, root)

    assert.equal(trend.status, 'ready')
    assert.equal(trend.metrics.safetyIssues.direction, 'improved')
    assert.equal(trend.metrics.repeatedFailures.direction, 'unchanged')
    assert.equal(trend.metrics.skillGaps.direction, 'improved')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildTrendReport tolerates legacy reports without evaluation', () => {
  const root = join(tmpdir(), `lobster-trend-legacy-${Date.now()}`)
  try {
    mkdirSync(join(root, 'old'), { recursive: true })
    writeFileSync(join(root, 'old', 'report.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-04-30T00:00:00.000Z',
      findings: [
        { fingerprint: 'a', detector: 'sensitive-file-read', severity: 'high', title: 'a', description: 'a', evidence: {}, recommendation: { action: 'a', rationale: 'a' } },
      ],
    }))

    const trend = buildTrendReport(report('2026-05-05T00:00:00.000Z', {}), root)

    assert.equal(trend.status, 'ready')
    assert.equal(trend.metrics.safetyIssues.previous, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
