import test from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { discoverClaudeCodeSessions } from '../src/sources/claude-code'
import { discoverCodexSessions } from '../src/sources/codex'
import { discoverHermesSessions } from '../src/sources/hermes'
import { discoverOpenClawSessions } from '../src/sources/openclaw'
import { discoverPathSessions } from '../src/sources/path'

const fixtureRoot = resolve('test/fixtures/sources')
const homeDir = join(fixtureRoot, 'home')

test('discoverClaudeCodeSessions maps cwd to encoded project directory', () => {
  const sessions = discoverClaudeCodeSessions({
    cwd: '/tmp/work',
    homeDir,
    days: 7,
    now: new Date('2026-05-05T00:00:00.000Z'),
  })

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].source, 'claude-code')
  assert.equal(sessions[0].id, 'claude-session')
  assert.match(sessions[0].transcriptPath, /claude-session\.jsonl$/)
})

test('discoverOpenClawSessions reads sessions.json and resolves transcript files', () => {
  const sessions = discoverOpenClawSessions({
    homeDir,
    days: 7,
    now: new Date('2026-05-05T00:00:00.000Z'),
  })

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].source, 'openclaw')
  assert.equal(sessions[0].id, 'openclaw-session')
  assert.equal(sessions[0].agentId, 'agent-a')
  assert.match(sessions[0].transcriptPath, /openclaw-session\.jsonl$/)
})

test('discoverOpenClawSessions treats unknown index shapes as empty', () => {
  const sessions = discoverOpenClawSessions({
    homeDir: resolve('test/fixtures/sources/unknown-openclaw-home'),
    days: 7,
    now: new Date('2026-05-05T00:00:00.000Z'),
  })

  assert.deepEqual(sessions, [])
})

test('discoverHermesSessions reads local JSONL transcripts', () => {
  const sessions = discoverHermesSessions({
    homeDir,
    days: 7,
    now: new Date('2026-05-05T00:00:00.000Z'),
  })

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].source, 'hermes')
  assert.equal(sessions[0].id, 'hermes-session')
})

test('discoverCodexSessions reads nested Codex JSONL transcripts', () => {
  const sessions = discoverCodexSessions({
    homeDir: join(fixtureRoot, 'codex-home'),
    days: 7,
    now: new Date('2026-05-05T00:00:00.000Z'),
  })

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].source, 'codex')
  assert.equal(sessions[0].id, 'rollout-test')
})

test('discoverPathSessions accepts a directory of JSONL files', () => {
  const sessions = discoverPathSessions({
    path: join(fixtureRoot, 'path-dir'),
  })

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].source, 'path')
  assert.equal(sessions[0].id, 'path-session')
})
