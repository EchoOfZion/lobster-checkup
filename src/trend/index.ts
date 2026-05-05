import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { CheckupReport, TrendMetric, TrendReport } from '../core/types'

type Counts = {
  safetyIssues: number
  repeatedFailures: number
  verificationGaps: number
  skillGaps: number
  toolControlBreakdowns: number
  llmReviewRisks: number
}

export function buildTrendReport(current: CheckupReport, reportsRoot: string): TrendReport {
  const previousReports = readPreviousReports(reportsRoot, current.generatedAt)
  if (previousReports.length === 0) {
    return {
      status: 'not_enough_history',
      currentWindowDays: current.windowDays,
      previousWindowDays: current.windowDays,
      metrics: metricsFromCounts(countReport(current), zeroCounts()),
    }
  }

  const previous = sumCounts(previousReports.map(countReport))
  return {
    status: 'ready',
    currentWindowDays: current.windowDays,
    previousWindowDays: current.windowDays,
    metrics: metricsFromCounts(countReport(current), previous),
  }
}

function readPreviousReports(root: string, before: string): CheckupReport[] {
  if (!existsSync(root)) return []
  const files = listReportFiles(root)
  return files.map((file) => readReport(file))
    .filter((report): report is CheckupReport => Boolean(report))
    .filter((report) => report.generatedAt < before)
}

function listReportFiles(root: string): string[] {
  const output: string[] = []
  for (const entry of readdirSync(root)) {
    const full = join(root, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) output.push(...listReportFiles(full))
    if (stat.isFile() && entry === 'report.json') output.push(full)
  }
  return output
}

function readReport(path: string): CheckupReport | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CheckupReport
  } catch {
    return null
  }
}

function countReport(report: CheckupReport): Counts {
  const findings = Array.isArray(report.findings) ? report.findings : []
  const topIssues = Array.isArray(report.evaluation?.topIssues) ? report.evaluation.topIssues : []
  const judgments = Array.isArray(report.review?.judgments) ? report.review.judgments : []
  return {
    safetyIssues: findings.filter((finding) => finding.detector === 'sensitive-file-read' || finding.detector === 'sensitive-output').length,
    repeatedFailures: findings.filter((finding) => finding.detector === 'repeated-failure').length,
    verificationGaps: topIssues.filter((issue) => issue.id === 'claimed-success-without-verification').length,
    skillGaps: topIssues.filter((issue) => issue.id === 'skill-not-used').length,
    toolControlBreakdowns: topIssues.filter((issue) => issue.id === 'tool-control-breakdown').length,
    llmReviewRisks: judgments.filter((judgment) => judgment.verdict === 'risk').length,
  }
}

function sumCounts(counts: Counts[]): Counts {
  return counts.reduce((sum, count) => ({
    safetyIssues: sum.safetyIssues + count.safetyIssues,
    repeatedFailures: sum.repeatedFailures + count.repeatedFailures,
    verificationGaps: sum.verificationGaps + count.verificationGaps,
    skillGaps: sum.skillGaps + count.skillGaps,
    toolControlBreakdowns: sum.toolControlBreakdowns + count.toolControlBreakdowns,
    llmReviewRisks: sum.llmReviewRisks + count.llmReviewRisks,
  }), zeroCounts())
}

function zeroCounts(): Counts {
  return {
    safetyIssues: 0,
    repeatedFailures: 0,
    verificationGaps: 0,
    skillGaps: 0,
    toolControlBreakdowns: 0,
    llmReviewRisks: 0,
  }
}

function metricsFromCounts(current: Counts, previous: Counts): TrendReport['metrics'] {
  return {
    safetyIssues: metric(current.safetyIssues, previous.safetyIssues),
    repeatedFailures: metric(current.repeatedFailures, previous.repeatedFailures),
    verificationGaps: metric(current.verificationGaps, previous.verificationGaps),
    skillGaps: metric(current.skillGaps, previous.skillGaps),
    toolControlBreakdowns: metric(current.toolControlBreakdowns, previous.toolControlBreakdowns),
    llmReviewRisks: metric(current.llmReviewRisks, previous.llmReviewRisks),
  }
}

function metric(current: number, previous: number): TrendMetric {
  return {
    current,
    previous,
    delta: current - previous,
    direction: current < previous ? 'improved' : current > previous ? 'regressed' : 'unchanged',
  }
}
