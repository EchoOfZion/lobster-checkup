// ============================================================
// 龙虾体检 v4 — 本地历史数据存储
// 路径: ~/.lobster-checkup/history/
// ============================================================

import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { CheckupReport } from './types'

const HISTORY_DIR = join(homedir(), '.lobster-checkup', 'history')

/**
 * Ensure the history directory exists.
 */
function ensureDir(): void {
  mkdirSync(HISTORY_DIR, { recursive: true })
}

/**
 * Generate a filename for a checkup report.
 */
function reportFileName(report: CheckupReport): string {
  const date = report.generatedAt
    ? new Date(report.generatedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
    : new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `checkup-${date}.json`
}

/**
 * Save a checkup report to local history.
 */
export function saveToHistory(report: CheckupReport): string {
  ensureDir()
  const fileName = reportFileName(report)
  const filePath = join(HISTORY_DIR, fileName)
  writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8')
  return filePath
}

/**
 * Load all historical reports, sorted by date (newest first).
 */
export function loadHistory(): { path: string; report: CheckupReport }[] {
  ensureDir()
  const files = readdirSync(HISTORY_DIR)
    .filter(f => f.startsWith('checkup-') && f.endsWith('.json'))
    .sort()
    .reverse()

  const results: { path: string; report: CheckupReport }[] = []
  for (const file of files) {
    try {
      const filePath = join(HISTORY_DIR, file)
      const data = readFileSync(filePath, 'utf8')
      results.push({ path: filePath, report: JSON.parse(data) })
    } catch {
      // Skip corrupted files
    }
  }
  return results
}

/**
 * Load the most recent report from history.
 */
export function loadLatestReport(): CheckupReport | null {
  const history = loadHistory()
  return history.length > 0 ? history[0].report : null
}

/**
 * Get the history directory path.
 */
export function getHistoryDir(): string {
  return HISTORY_DIR
}
