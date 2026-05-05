#!/usr/bin/env node
import { cwd } from 'node:process'
import type { AgentSource, CheckupReport } from '../core/types'
import { buildSessionDiagnoses } from '../diagnosis'
import { runDetectors } from '../detectors'
import { evaluateReportInputs } from '../evaluation'
import { parseSessions } from '../parsers'
import { loadPolicy } from '../policy'
import { runSelfReview } from '../review'
import { discoverSessions } from '../sources'
import { buildTrendReport } from '../trend'
import { writeLocalReports } from '../reporters/files'
import { formatJsonReport, summarizeFindings } from '../reporters/json'
import { renderTerminalReport } from '../reporters/terminal'

type Options = {
  command: 'checkup' | 'diff' | 'help'
  source?: AgentSource
  days: number
  path?: string
  format: 'text' | 'json'
  review?: 'llm'
  reviewProvider?: 'local' | 'codex'
  trend: boolean
  configPath?: string
  outputRoot: string
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv)
  if (options.command === 'help') {
    process.stdout.write(helpText())
    return
  }
  if (options.command === 'diff') {
    process.stderr.write('diff is not implemented in this MVP yet.\n')
    process.exitCode = 1
    return
  }

  const report = await runCheckup(options)
  const written = writeLocalReports(report, options.outputRoot)
  const reportWithOutput = {
    ...report,
    output: written,
  }

  if (options.format === 'json') {
    process.stdout.write(formatJsonReport(reportWithOutput))
  } else {
    process.stdout.write(renderTerminalReport(report))
    process.stdout.write(`JSON report: ${written.jsonPath}\nHTML report: ${written.htmlPath}\n`)
  }
}

async function runCheckup(options: Options): Promise<CheckupReport> {
  const currentDir = cwd()
  const loadedPolicy = loadPolicy(currentDir, options.configPath)
  const { candidates, diagnostics } = discoverSessions({
    cwd: currentDir,
    days: options.days,
    source: options.source,
    path: options.path,
  })
  const sessions = parseSessions(candidates)
  const findings = runDetectors(sessions, loadedPolicy.policy)
  const evaluation = evaluateReportInputs(sessions, findings)
  const diagnoses = buildSessionDiagnoses(sessions, findings)

  const report: CheckupReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    cwd: currentDir,
    windowDays: options.days,
    discovery: diagnostics,
    sessions: candidates,
    scannedSessions: sessions.length,
    findings,
    evaluation,
    diagnoses,
    policy: {
      source: loadedPolicy.source,
      path: loadedPolicy.path,
    },
    summary: summarizeFindings(findings),
  }
  if (options.trend) {
    report.trend = buildTrendReport(report, options.outputRoot)
  }
  if (options.review === 'llm') {
    report.review = await runSelfReview(report, {
      mode: 'llm',
      provider: options.reviewProvider || loadedPolicy.policy.reviewProvider,
      cwd: currentDir,
    })
  }
  return report
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    command: 'checkup',
    days: 7,
    format: 'text',
    trend: false,
    outputRoot: '.lobster-checkup/reports',
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === 'diff') {
      options.command = 'diff'
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.command = 'help'
      continue
    }
    if (arg === '--source') {
      options.source = parseSource(args[++index])
      continue
    }
    if (arg === '--days') {
      options.days = Number.parseInt(args[++index] || '7', 10)
      continue
    }
    if (arg === '--path') {
      options.path = args[++index]
      continue
    }
    if (arg === '--format') {
      options.format = args[++index] === 'json' ? 'json' : 'text'
      continue
    }
    if (arg === '--review') {
      options.review = args[++index] === 'llm' ? 'llm' : undefined
      continue
    }
    if (arg === '--review-provider') {
      options.reviewProvider = parseReviewProvider(args[++index])
      continue
    }
    if (arg === '--trend') {
      options.trend = true
      continue
    }
    if (arg === '--config') {
      options.configPath = args[++index]
      continue
    }
    if (arg === '--output') {
      options.outputRoot = args[++index] || options.outputRoot
      continue
    }
    if (!arg.startsWith('-')) {
      options.path = arg
    }
  }

  return options
}

function parseSource(value: string | undefined): AgentSource | undefined {
  if (
    value === 'claude-code' ||
    value === 'codex' ||
    value === 'openclaw' ||
    value === 'docker-openclaw' ||
    value === 'hermes' ||
    value === 'path'
  ) return value
  return undefined
}

function parseReviewProvider(value: string | undefined): 'local' | 'codex' | undefined {
  if (value === 'local' || value === 'codex') return value
  return undefined
}

function helpText(): string {
  return `Lobster Checkup

Usage:
  lobster-checkup
  lobster-checkup --format json
  lobster-checkup --source claude-code|codex|openclaw|docker-openclaw|hermes
  lobster-checkup --days 14
  lobster-checkup --path <file-or-dir>
  lobster-checkup --review llm
  lobster-checkup --review llm --review-provider codex
  lobster-checkup --trend
  lobster-checkup --config .lobster-checkup.json
  lobster-checkup diff
`
}

main().catch((error) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
