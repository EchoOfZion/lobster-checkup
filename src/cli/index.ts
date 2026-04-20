#!/usr/bin/env node
// ============================================================
// 龙虾体检 v4 — CLI 入口
// ============================================================

// Load .env.local if present (for local config like HERMES_SSH_HOST)
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx)
      const val = trimmed.slice(eqIdx + 1)
      if (!process.env[key]) process.env[key] = val
    }
  }
}

import { runCheckup, printReport, type CheckupOptions } from './commands/checkup'
import { runDoctorFix } from './commands/doctor'
import { runDiff } from './commands/diff'
import { runSchedule } from './commands/schedule'

function parseArgs(args: string[]): {
  command: string
  options: CheckupOptions & { diff?: boolean; schedule?: string; fix?: boolean; help?: boolean }
} {
  const options: CheckupOptions & { diff?: boolean; schedule?: string; fix?: boolean; help?: boolean } = {}
  let command = 'checkup'
  let i = 0

  while (i < args.length) {
    const arg = args[i]

    switch (arg) {
      case 'doctor':
        command = 'doctor'
        break
      case '--fix':
        options.fix = true
        break
      case '--behavior':
        options.behavior = true
        break
      case '--security':
        options.security = true
        break
      case '--cost':
        options.cost = true
        break
      case '--enhance':
        options.enhance = true
        break
      case '--export':
        if (args[i + 1] === 'json') {
          options.exportJson = true
          i++
        }
        break
      case '--diff':
        options.diff = true
        break
      case '--schedule':
        options.schedule = args[i + 1] || 'weekly'
        i++
        break
      case '--no-upload':
        options.noUpload = true
        break
      case '--path':
        options.path = args[i + 1]
        i++
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        // Treat positional arg as path
        if (!arg.startsWith('-') && arg !== 'doctor') {
          options.path = arg
        }
        break
    }
    i++
  }

  // Resolve command
  if (options.diff) command = 'diff'
  if (options.schedule) command = 'schedule'
  if (command === 'doctor' && options.fix) command = 'doctor-fix'

  return { command, options }
}

function printHelp(): void {
  console.log(`
🦞 龙虾体检 v4 — AI Agent 健康诊断工具

用法:
  lobster-checkup                    # 完整体检
  lobster-checkup <path>             # 指定 Session 文件/目录
  lobster-checkup --behavior         # 仅行为检测
  lobster-checkup --security         # 仅安全检测
  lobster-checkup --cost             # 仅 Token 检测
  lobster-checkup --enhance          # 仅增强建议
  lobster-checkup --export json      # 导出病历卡 JSON
  lobster-checkup --diff             # 对比上次体检
  lobster-checkup --schedule weekly  # 配置定期体检
  lobster-checkup --no-upload        # 不上传，仅本地输出
  lobster-checkup doctor --fix       # 一键修复

选项:
  --path <path>        指定 Session 文件或目录路径
  --behavior           仅运行行为检测域
  --security           仅运行安全检测域
  --cost               仅运行 Token 消耗检测域
  --enhance            仅生成增强建议
  --export json        输出完整 JSON 报告
  --diff               与上次体检结果对比
  --schedule <间隔>    配置定期体检 (daily/weekly/monthly)
  --no-upload          不上传到 Web，仅保存本地
  --help, -h           显示帮助

环境变量:
  ANTHROPIC_API_KEY          LLM 辅助检测用的 API Key
  LOBSTER_CHECKUP_BASE_URL   Web 报告 API 地址
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const { command, options } = parseArgs(args)

  if (options.help) {
    printHelp()
    return
  }

  // Load LLM config from environment
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    options.llmConfig = { apiKey }
  }

  // Load base URL from environment
  options.baseUrl = process.env.LOBSTER_CHECKUP_BASE_URL

  switch (command) {
    case 'checkup': {
      const report = await runCheckup(options)

      if (options.exportJson) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        printReport(report)
      }
      break
    }

    case 'doctor-fix':
      await runDoctorFix(options.path || process.cwd())
      break

    case 'diff':
      runDiff()
      break

    case 'schedule':
      runSchedule(options.schedule!)
      break

    default:
      printHelp()
  }
}

main().catch((err) => {
  console.error('错误:', err.message || err)
  process.exit(1)
})
