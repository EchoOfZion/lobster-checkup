import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CheckupReport } from '../core/types'
import { renderHtmlReport } from './html'
import { formatJsonReport } from './json'

export function writeLocalReports(report: CheckupReport, outputRoot = '.lobster-checkup/reports'): { dir: string; jsonPath: string; htmlPath: string } {
  const stamp = report.generatedAt.replace(/[:.]/g, '-')
  const dir = join(outputRoot, stamp)
  mkdirSync(dir, { recursive: true })

  const jsonPath = join(dir, 'report.json')
  const htmlPath = join(dir, 'report.html')
  writeFileSync(jsonPath, formatJsonReport(report), 'utf8')
  writeFileSync(htmlPath, renderHtmlReport(report), 'utf8')
  return { dir, jsonPath, htmlPath }
}
