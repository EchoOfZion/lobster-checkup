import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

export type DiscoveryOptions = {
  homeDir: string
  days: number
  now?: Date
}

export function jsonlId(filePath: string): string {
  return basename(filePath).replace(/\.jsonl$/i, '')
}

export function listJsonlFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.jsonl'))
    .map((file) => join(dir, file))
    .filter((file) => {
      try {
        return statSync(file).isFile()
      } catch {
        return false
      }
    })
}

export function isWithinDays(filePath: string, days: number, now = new Date()): boolean {
  if (days <= 0) return true
  try {
    const mtime = statSync(filePath).mtime.getTime()
    const windowMs = days * 24 * 60 * 60 * 1000
    return now.getTime() - mtime <= windowMs
  } catch {
    return false
  }
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}
