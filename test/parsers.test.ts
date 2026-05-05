import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { SessionCandidate } from '../src/core/types'
import { parseSession } from '../src/parsers'

function candidate(source: SessionCandidate['source'], id: string, file: string): SessionCandidate {
  return {
    source,
    id,
    transcriptPath: resolve(`test/fixtures/parsers/${file}`),
  }
}

test('parseSession normalizes Claude Code turns', () => {
  const session = parseSession(candidate('claude-code', 'claude-1', 'claude.jsonl'))

  assert.equal(session.id, 'claude-1')
  assert.equal(session.source, 'claude-code')
  assert.equal(session.turns.length, 1)
  assert.equal(session.turns[0].toolCalls[0].name, 'Read')
  assert.equal(session.turns[0].toolCalls[0].result, 'SECRET=abc')
  assert.equal(session.turns[0].assistantText, 'done')
  assert.equal(session.turns[0].finalStopReason, 'stop')
  assert.equal(session.usage.costUsd, 0.03)
})

test('parseSession normalizes OpenClaw turns', () => {
  const session = parseSession(candidate('openclaw', 'openclaw-1', 'openclaw.jsonl'))

  assert.equal(session.id, 'openclaw-1')
  assert.equal(session.turns.length, 1)
  assert.equal(session.turns[0].toolCalls[0].name, 'Bash')
  assert.equal(session.turns[0].toolCalls[0].isError, true)
  assert.equal(session.turns[0].assistantText, 'failed')
})

test('parseSession normalizes Hermes turns', () => {
  const session = parseSession(candidate('hermes', 'hermes-1', 'hermes.jsonl'))

  assert.equal(session.id, 'hermes-1')
  assert.equal(session.turns.length, 1)
  assert.equal(session.turns[0].toolCalls[0].name, 'search')
  assert.equal(session.turns[0].toolCalls[0].isError, true)
  assert.equal(session.turns[0].assistantText, 'no result')
})

test('parseSession normalizes Codex turns', () => {
  const session = parseSession(candidate('codex', 'codex-1', 'codex.jsonl'))

  assert.equal(session.id, 'codex-1')
  assert.equal(session.source, 'codex')
  assert.equal(session.projectPath, '/tmp/work')
  assert.equal(session.turns.length, 1)
  assert.equal(session.turns[0].toolCalls[0].name, 'exec_command')
  assert.equal(session.turns[0].toolCalls[0].isError, true)
  assert.equal(session.turns[0].assistantText, 'failed')
})
