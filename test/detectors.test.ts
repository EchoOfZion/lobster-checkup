import test from 'node:test'
import assert from 'node:assert/strict'
import type { NormalizedSession, NormalizedTurn } from '../src/core/types'
import { runDetectors } from '../src/detectors'

function turn(overrides: Partial<NormalizedTurn>): NormalizedTurn {
  return {
    index: 0,
    userText: 'user',
    assistantText: 'done',
    toolCalls: [],
    finalStopReason: 'stop',
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  }
}

function session(turns: NormalizedTurn[], costUsd = 0): NormalizedSession {
  return {
    source: 'claude-code',
    id: 'session-1',
    transcriptPath: '/tmp/session.jsonl',
    turns,
    usage: { inputTokens: 0, outputTokens: 0, costUsd },
  }
}

test('runDetectors flags critical tool loops', () => {
  const findings = runDetectors([
    session([
      turn({
        toolCalls: Array.from({ length: 21 }, (_, index) => ({
          id: `tool-${index}`,
          name: 'Bash',
          args: {},
          isError: false,
        })),
      }),
    ]),
  ])

  assert.equal(findings[0].detector, 'tool-loop')
  assert.equal(findings[0].severity, 'critical')
  assert.equal(findings[0].evidence.toolCount, 21)
})

test('runDetectors flags repeated failed equivalent tool calls', () => {
  const findings = runDetectors([
    session([
      turn({
        toolCalls: [
          { id: 'a', name: 'Bash', args: { command: 'bad' }, result: 'nope', isError: true },
          { id: 'b', name: 'Bash', args: { command: 'bad' }, result: 'nope again', isError: true },
        ],
      }),
    ]),
  ])

  assert.equal(findings.some((finding) => finding.detector === 'repeated-failure'), true)
})

test('runDetectors flags no final reply after tool calls', () => {
  const findings = runDetectors([
    session([
      turn({
        assistantText: '',
        toolCalls: [{ id: 'a', name: 'Read', args: {}, isError: false }],
        finalStopReason: 'stop',
      }),
    ]),
  ])

  assert.equal(findings.some((finding) => finding.detector === 'no-final-reply'), true)
})

test('runDetectors flags sensitive file reads', () => {
  const findings = runDetectors([
    session([
      turn({
        toolCalls: [{ id: 'a', name: 'Read', args: { file_path: '/tmp/.env' }, isError: false }],
      }),
    ]),
  ])

  const finding = findings.find((item) => item.detector === 'sensitive-file-read')
  assert.ok(finding)
  assert.equal(finding.evidence.path, '[redacted-sensitive-path]')
})

test('runDetectors deduplicates identical findings in one turn', () => {
  const findings = runDetectors([
    session([
      turn({
        toolCalls: [
          { id: 'a', name: 'Read', args: { file_path: '/tmp/.env' }, isError: false },
          { id: 'b', name: 'Read', args: { file_path: '/tmp/.env' }, isError: false },
        ],
      }),
    ]),
  ])

  assert.equal(findings.filter((item) => item.detector === 'sensitive-file-read').length, 1)
})

test('runDetectors flags sensitive output without leaking the secret', () => {
  const secret = 'sk-proj-123456789012345678901234567890'
  const findings = runDetectors([
    session([
      turn({ assistantText: `token is ${secret}` }),
    ]),
  ])

  const finding = findings.find((item) => item.detector === 'sensitive-output')
  assert.ok(finding)
  assert.equal(JSON.stringify(finding).includes(secret), false)
})

test('runDetectors flags high token waste for dominant turn cost', () => {
  const findings = runDetectors([
    session([
      turn({ index: 0, costUsd: 1 }),
      turn({ index: 1, costUsd: 9 }),
    ], 10),
  ])

  const finding = findings.find((item) => item.detector === 'token-waste')
  assert.ok(finding)
  assert.equal(finding.severity, 'high')
  assert.equal(finding.evidence.percentOfTotal, 90)
})
