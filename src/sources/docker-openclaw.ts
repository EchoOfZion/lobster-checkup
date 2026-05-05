import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import type { SessionCandidate } from '../core/types'
import { discoverOpenClawSessions } from './openclaw'

type Options = {
  days: number
  now?: Date
}

type DockerRow = {
  ID?: string
  Image?: string
  Names?: string
}

type DockerMount = {
  Type?: string
  Source?: string
  Destination?: string
}

export function discoverDockerOpenClawSessions(options: Options): SessionCandidate[] {
  const rows = listDockerRows().filter(isOpenClawRow)
  const candidates: SessionCandidate[] = []

  for (const row of rows) {
    const mounts = inspectMounts(row.ID || '')
    for (const mount of mounts) {
      const hostRoot = hostOpenClawRoot(mount)
      if (!hostRoot) continue
      const found = discoverOpenClawSessions({ homeDir: hostRoot, days: options.days, now: options.now })
      candidates.push(...found.map((candidate) => ({
        ...candidate,
        source: 'docker-openclaw' as const,
        agentId: candidate.agentId || row.Names,
      })))
    }
  }

  return candidates
}

function listDockerRows(): DockerRow[] {
  try {
    const output = execFileSync('docker', ['ps', '-a', '--format', '{{json .}}'], { encoding: 'utf8', timeout: 5000 })
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as DockerRow)
  } catch {
    return []
  }
}

function inspectMounts(id: string): DockerMount[] {
  if (!id) return []
  try {
    const output = execFileSync('docker', ['inspect', id, '--format', '{{json .Mounts}}'], { encoding: 'utf8', timeout: 5000 })
    return JSON.parse(output) as DockerMount[]
  } catch {
    return []
  }
}

function isOpenClawRow(row: DockerRow): boolean {
  return `${row.Image || ''} ${row.Names || ''}`.toLowerCase().includes('openclaw')
}

function hostOpenClawRoot(mount: DockerMount): string | null {
  if (mount.Type !== 'bind' || !mount.Source || !mount.Destination) return null
  const destination = mount.Destination
  const source = mount.Source

  if (destination.endsWith('/.openclaw') && existsSync(join(source, 'agents'))) {
    return source.replace(/\/\.openclaw$/, '')
  }
  if (existsSync(join(source, '.openclaw', 'agents'))) {
    return source
  }
  return null
}
