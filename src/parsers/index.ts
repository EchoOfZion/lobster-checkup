// ============================================================
// 龙虾体检 v4 — Session 解析入口
// ============================================================

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { claudeCodeParser } from './claude-code'
import { openClawParser } from './openclaw'
import { hermesParser } from './hermes'
import type { ParsedSession, SessionParser } from './types'

// Registered parsers (order matters: first match wins)
const parsers: SessionParser[] = [
  claudeCodeParser,
  openClawParser,
  hermesParser,
]

/**
 * Parse a single JSONL file into a ParsedSession.
 * Auto-detects format from file content.
 */
export function parseSessionFile(filePath: string): ParsedSession {
  const raw = readFileSync(filePath, 'utf8').trim()
  if (!raw) throw new Error(`Empty file: ${filePath}`)

  const lines = raw.split('\n')

  for (const parser of parsers) {
    if (parser.detect(lines)) {
      return parser.parse(lines, filePath)
    }
  }

  throw new Error(`Unknown session format: ${filePath}`)
}

/**
 * Parse all JSONL files in a directory.
 */
export function parseSessionDirectory(dirPath: string): ParsedSession[] {
  const sessions: ParsedSession[] = []
  const files = readdirSync(dirPath)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => join(dirPath, f))

  for (const file of files) {
    try {
      sessions.push(parseSessionFile(file))
    } catch (e) {
      console.warn(`Skipping ${file}: ${(e as Error).message}`)
    }
  }

  return sessions
}

/**
 * Discover and parse sessions from default locations.
 * Returns all found sessions across all known platforms.
 */
export function discoverSessions(homedir: string): ParsedSession[] {
  const sessions: ParsedSession[] = []

  // Claude Code: ~/.claude/projects/*/*.jsonl
  const claudeDir = join(homedir, '.claude', 'projects')
  try {
    for (const project of readdirSync(claudeDir)) {
      const projectDir = join(claudeDir, project)
      if (statSync(projectDir).isDirectory()) {
        sessions.push(...parseSessionDirectory(projectDir))
      }
    }
  } catch { /* directory not found */ }

  // OpenClaw: ~/.openclaw/agents/*/sessions/*.jsonl
  const openClawDir = join(homedir, '.openclaw', 'agents')
  try {
    for (const agent of readdirSync(openClawDir)) {
      const sessionsDir = join(openClawDir, agent, 'sessions')
      try {
        if (statSync(sessionsDir).isDirectory()) {
          sessions.push(...parseSessionDirectory(sessionsDir))
        }
      } catch { /* sessions dir not found */ }
    }
  } catch { /* directory not found */ }

  // Hermes: ~/.hermes/sessions/*.jsonl (local)
  const hermesDir = join(homedir, '.hermes', 'sessions')
  try {
    if (statSync(hermesDir).isDirectory()) {
      sessions.push(...parseSessionDirectory(hermesDir))
    }
  } catch { /* directory not found */ }

  return sessions
}

/**
 * Fetch Hermes sessions from remote VM via SSH.
 * Returns parsed sessions from remote host.
 *
 * Configuration via environment variables:
 *   HERMES_SSH_HOST — SSH user@host (e.g. hermes@10.0.0.1)
 *   HERMES_SSH_KEY  — Path to SSH private key
 *   HERMES_REMOTE_PATH — Remote sessions directory (default: ~/.hermes/sessions)
 */
export function discoverRemoteHermesSessions(
  sshHost: string = process.env.HERMES_SSH_HOST || '',
  sshKey: string = process.env.HERMES_SSH_KEY || join(require('os').homedir(), '.ssh', 'hermes_vm_key'),
  remotePath: string = process.env.HERMES_REMOTE_PATH || '~/.hermes/sessions',
): ParsedSession[] {
  if (!sshHost) return [] // No remote host configured
  const { execSync } = require('child_process')
  const { mkdtempSync, rmSync } = require('fs')
  const { tmpdir } = require('os')

  const sessions: ParsedSession[] = []
  const tmpDir = mkdtempSync(join(tmpdir(), 'hermes-sessions-'))

  try {
    // SCP all jsonl files from remote
    execSync(
      `scp -i "${sshKey}" -o StrictHostKeyChecking=no "${sshHost}:${remotePath}/*.jsonl" "${tmpDir}/"`,
      { stdio: 'pipe', timeout: 30000 },
    )
    sessions.push(...parseSessionDirectory(tmpDir))
  } catch {
    // SSH not available or no files
  } finally {
    try { rmSync(tmpDir, { recursive: true }) } catch { /* cleanup */ }
  }

  return sessions
}

export type { ParsedSession, SessionParser } from './types'
