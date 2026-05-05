import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

test('CLI --path --format json prints parseable report JSON and writes local reports', () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'lobster-checkup-test-'))
  try {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'src/cli/index.ts',
      '--path',
      resolve('test/fixtures/cli'),
      '--format',
      'json',
      '--output',
      outputRoot,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as {
      findings: unknown[]
      scannedSessions: number
      evaluation?: { overallStatus: string; dimensions: unknown[]; topIssues: unknown[] }
      diagnoses?: unknown[]
      policy?: { source: string }
      review?: unknown
      output?: { jsonPath: string; htmlPath: string }
    }
    assert.equal(report.scannedSessions, 1)
    assert.equal(report.findings.length > 0, true)
    assert.equal(typeof report.evaluation?.overallStatus, 'string')
    assert.equal(report.evaluation?.dimensions.length, 3)
    assert.equal(Array.isArray(report.evaluation?.topIssues), true)
    assert.equal(Array.isArray(report.diagnoses), true)
    assert.equal(report.policy?.source, 'default')
    assert.equal(report.review, undefined)
    assert.match(report.output?.jsonPath || '', /report\.json$/)
    assert.match(report.output?.htmlPath || '', /report\.html$/)
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test('CLI --trend includes trend report in JSON output', () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'lobster-checkup-trend-test-'))
  try {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'src/cli/index.ts',
      '--path',
      resolve('test/fixtures/cli'),
      '--format',
      'json',
      '--trend',
      '--output',
      outputRoot,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as { trend?: { status: string; metrics: Record<string, unknown> } }
    assert.equal(report.trend?.status, 'not_enough_history')
    assert.equal(typeof report.trend?.metrics.safetyIssues, 'object')
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test('CLI --config applies personal policy file', () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'lobster-checkup-config-test-'))
  const configPath = join(outputRoot, 'policy.json')
  try {
    writeFileSync(configPath, JSON.stringify({
      sensitivePathPatterns: ['definitely-custom-secret-path'],
      retainRawFindingsInHtml: false,
    }))
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'src/cli/index.ts',
      '--path',
      resolve('test/fixtures/cli'),
      '--format',
      'json',
      '--config',
      configPath,
      '--output',
      outputRoot,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as { policy?: { source: string; path: string } }
    assert.equal(report.policy?.source, 'file')
    assert.equal(report.policy?.path, configPath)
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test('CLI --review llm includes evidence-backed review in JSON report', () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'lobster-checkup-review-test-'))
  try {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'src/cli/index.ts',
      '--path',
      resolve('test/fixtures/cli'),
      '--format',
      'json',
      '--review',
      'llm',
      '--output',
      outputRoot,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as {
      review?: { mode: string; provider: string; judgments: Array<{ evidenceRefs: string[] }> }
    }
    assert.equal(report.review?.mode, 'llm')
    assert.equal(report.review?.provider, 'local-heuristic')
    assert.equal(report.review?.judgments.every((judgment) => judgment.evidenceRefs.length > 0), true)
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})

test('CLI accepts --review-provider local explicitly', () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'lobster-checkup-review-provider-test-'))
  try {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'src/cli/index.ts',
      '--path',
      resolve('test/fixtures/cli'),
      '--format',
      'json',
      '--review',
      'llm',
      '--review-provider',
      'local',
      '--output',
      outputRoot,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as { review?: { provider: string } }
    assert.equal(report.review?.provider, 'local-heuristic')
  } finally {
    rmSync(outputRoot, { recursive: true, force: true })
  }
})
