import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPolicy } from '../src/policy'

test('loadPolicy uses defaults when no config exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lobster-policy-default-'))
  try {
    const result = loadPolicy(dir)

    assert.equal(result.source, 'default')
    assert.equal(result.policy.sensitivePathPatterns.includes('\\.env'), true)
    assert.equal(result.policy.requiredVerificationCommands.includes('npm test'), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loadPolicy merges .lobster-checkup.json overrides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lobster-policy-file-'))
  try {
    writeFileSync(join(dir, '.lobster-checkup.json'), JSON.stringify({
      sensitivePathPatterns: ['private-token'],
      requiredVerificationCommands: ['pnpm test:e2e'],
      requiredSkillsByIntent: { 检测: 'lobster-checkup' },
      retainRawFindingsInHtml: false,
      reviewProvider: 'codex',
    }))

    const result = loadPolicy(dir)

    assert.equal(result.source, 'file')
    assert.equal(result.policy.sensitivePathPatterns.includes('private-token'), true)
    assert.equal(result.policy.requiredVerificationCommands.includes('pnpm test:e2e'), true)
    assert.equal(result.policy.requiredSkillsByIntent['检测'], 'lobster-checkup')
    assert.equal(result.policy.retainRawFindingsInHtml, false)
    assert.equal(result.policy.reviewProvider, 'codex')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
