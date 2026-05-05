import test from 'node:test'
import assert from 'node:assert/strict'
import { findingFingerprint } from '../src/core/fingerprint'

test('findingFingerprint is stable for equivalent values', () => {
  const first = findingFingerprint({
    source: 'claude-code',
    sessionId: 'abc',
    detector: 'tool-loop',
    turnIndex: 2,
    title: 'Tool loop',
    evidence: { toolCount: 21, toolNames: ['Bash', 'Read'] },
  })

  const second = findingFingerprint({
    source: 'claude-code',
    sessionId: 'abc',
    detector: 'tool-loop',
    turnIndex: 2,
    title: 'Tool loop',
    evidence: { toolNames: ['Bash', 'Read'], toolCount: 21 },
  })

  assert.equal(first, second)
  assert.match(first, /^tool-loop:[a-f0-9]{16}$/)
})
