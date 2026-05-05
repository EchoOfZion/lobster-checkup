import test from 'node:test'
import assert from 'node:assert/strict'
import type { Finding, NormalizedSession, NormalizedTurn } from '../src/core/types'
import { buildSessionDiagnoses } from '../src/diagnosis'

function turn(overrides: Partial<NormalizedTurn>): NormalizedTurn {
  return {
    index: 0,
    userText: 'Fix the test failure',
    assistantText: 'I changed the file',
    toolCalls: [],
    finalStopReason: 'stop',
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  }
}

function session(id: string, turns: NormalizedTurn[]): NormalizedSession {
  return {
    source: 'codex',
    id,
    transcriptPath: `/tmp/${id}.jsonl`,
    turns,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  }
}

function finding(sessionId: string, detector: string, severity: Finding['severity']): Finding {
  return {
    fingerprint: `${detector}:${sessionId}`,
    detector,
    severity,
    title: detector,
    description: detector,
    evidence: {},
    recommendation: { action: 'fix it', rationale: 'risk' },
    location: { source: 'codex', sessionId, transcriptPath: `/tmp/${sessionId}.jsonl`, turnIndex: 0 },
  }
}

test('buildSessionDiagnoses ranks risky sessions and summarizes goal/result', () => {
  const diagnoses = buildSessionDiagnoses([
    session('safe', [turn({ assistantText: 'Done. npm test passed.' })]),
    session('risky', [turn({
      userText: 'Ship this feature',
      assistantText: '',
      toolCalls: [{ id: 'a', name: 'exec_command', args: { cmd: 'npm test' }, isError: true }],
    })]),
  ], [
    finding('risky', 'repeated-failure', 'high'),
    finding('risky', 'no-final-reply', 'high'),
  ])

  assert.equal(diagnoses[0].sessionId, 'risky')
  assert.equal(diagnoses[0].priority, 'high')
  assert.match(diagnoses[0].goalSummary, /Ship this feature/)
  assert.match(diagnoses[0].verificationSummary, /attempted but failed/)
  assert.equal(diagnoses[0].findingRefs.length, 2)
})
