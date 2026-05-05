import test from 'node:test'
import assert from 'node:assert/strict'
import type { Finding, NormalizedSession, NormalizedTurn } from '../src/core/types'
import { evaluateReportInputs } from '../src/evaluation'

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

function session(turns: NormalizedTurn[], id = 'session-1'): NormalizedSession {
  return {
    source: 'codex',
    id,
    transcriptPath: `/tmp/${id}.jsonl`,
    turns,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  }
}

function finding(overrides: Partial<Finding>): Finding {
  return {
    fingerprint: 'finding-1',
    detector: 'tool-loop',
    severity: 'high',
    title: 'Tool loop',
    description: 'too many tools',
    evidence: {},
    recommendation: { action: 'stop earlier', rationale: 'avoid waste' },
    location: {
      source: 'codex',
      sessionId: 'session-1',
      transcriptPath: '/tmp/session-1.jsonl',
    },
    ...overrides,
  }
}

test('evaluateReportInputs scores safety from sensitive findings', () => {
  const evaluation = evaluateReportInputs([
    session([turn({})]),
  ], [
    finding({ detector: 'sensitive-file-read', severity: 'high', title: 'secret read' }),
  ])

  const safety = evaluation.dimensions.find((dimension) => dimension.id === 'safety')
  assert.ok(safety)
  assert.equal(safety.status, 'needs_attention')
  assert.equal(evaluation.topIssues[0].dimension, 'safety')
})

test('evaluateReportInputs detects checkup requests that did not use the skill', () => {
  const evaluation = evaluateReportInputs([
    session([
      turn({
        userText: '检测一下这个 agent',
        assistantText: 'I will inspect manually',
        toolCalls: [{ id: 'a', name: 'exec_command', args: { cmd: 'ls' }, isError: false }],
      }),
    ]),
  ], [])

  assert.equal(evaluation.topIssues.some((issue) => issue.id === 'skill-not-used'), true)
  assert.equal(evaluation.dimensions.find((dimension) => dimension.id === 'process')?.status, 'needs_attention')
})

test('evaluateReportInputs rewards checkup requests that read the skill', () => {
  const evaluation = evaluateReportInputs([
    session([
      turn({
        userText: '检测',
        assistantText: 'Using skills/lobster-checkup/SKILL.md',
        toolCalls: [{ id: 'a', name: 'exec_command', args: { cmd: 'sed -n 1,120p skills/lobster-checkup/SKILL.md' }, isError: false }],
      }),
    ]),
  ], [])

  assert.equal(evaluation.topIssues.some((issue) => issue.id === 'skill-not-used'), false)
})

test('evaluateReportInputs detects success claims without verification', () => {
  const evaluation = evaluateReportInputs([
    session([
      turn({
        userText: '修一下',
        assistantText: '已完成，测试通过',
        toolCalls: [{ id: 'a', name: 'exec_command', args: { cmd: 'sed -n 1,20p file.ts' }, isError: false }],
      }),
    ]),
  ], [])

  assert.equal(evaluation.topIssues.some((issue) => issue.id === 'claimed-success-without-verification'), true)
  assert.equal(evaluation.dimensions.find((dimension) => dimension.id === 'outcome')?.status, 'needs_attention')
})

test('evaluateReportInputs does not treat tool volume alone as a top issue', () => {
  const evaluation = evaluateReportInputs([
    session([turn({})]),
  ], Array.from({ length: 10 }, (_, index) => finding({
    fingerprint: `tool-loop-${index}`,
    detector: 'tool-loop',
    severity: index % 2 === 0 ? 'critical' : 'high',
  })))

  assert.equal(evaluation.topIssues.some((issue) => issue.id === 'tool-loop'), false)
  assert.equal(evaluation.dimensions.find((dimension) => dimension.id === 'process')?.status, 'healthy')
})

test('evaluateReportInputs escalates tool volume when paired with failed repetition', () => {
  const evaluation = evaluateReportInputs([
    session([turn({})]),
  ], [
    finding({ fingerprint: 'loop-1', detector: 'tool-loop', severity: 'critical' }),
    finding({ fingerprint: 'repeat-1', detector: 'repeated-failure', severity: 'high' }),
  ])

  assert.equal(evaluation.topIssues.some((issue) => issue.id === 'tool-control-breakdown'), true)
  assert.equal(evaluation.dimensions.find((dimension) => dimension.id === 'process')?.status, 'critical')
})
