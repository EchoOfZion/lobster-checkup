// ============================================================
// 龙虾体检 v4 — doctor --fix 一键修复
// 读取 findings 中 effort="一键" 的修复项，应用到配置
// ============================================================

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { CheckupReport, Finding } from '../../lib/types'
import { loadLatestReport } from '../../lib/history'

interface FixAction {
  finding: Finding
  fix: Finding['fix'][number]
  apply: () => void
}

/**
 * Collect all one-click fixes from a report.
 */
function collectFixes(report: CheckupReport, projectDir: string): FixAction[] {
  const fixes: FixAction[] = []

  for (const finding of report.findings) {
    for (const fix of finding.fix) {
      if (fix.effort !== '一键') continue

      // Determine the fix action based on the finding type
      const action = createFixAction(finding, fix, projectDir)
      if (action) {
        fixes.push({ finding, fix, apply: action })
      }
    }
  }

  return fixes
}

/**
 * Create a fix action function based on the finding type.
 */
function createFixAction(
  finding: Finding,
  fix: Finding['fix'][number],
  projectDir: string,
): (() => void) | null {
  const agentsFile = join(projectDir, 'AGENTS.md')
  const claudeFile = join(projectDir, '.claude', 'settings.json')

  // Circuit breaker rule
  if (finding.id.includes('tool-loop') || finding.id.includes('repeated-fail')) {
    return () => appendToAgentsMd(agentsFile, `
## 断路器规则
- 连续 5 次工具调用失败后，必须停下来问用户
- 同一命令失败 2 次后，不再尝试，改用其他策略或询问用户
`)
    }

  // Instruction drift / memory strategy
  if (finding.id.includes('instruction-drift')) {
    return () => appendToAgentsMd(agentsFile, `
## 记忆策略
- 每次心跳/定时任务，先 read 指定的指令文件，不依赖上下文记忆
`)
    }

  // Repetitive output
  if (finding.id.includes('repetitive-output')) {
    return () => appendToAgentsMd(agentsFile, `
## 去重规则
- 不要重复已经告知用户的信息
- 每次回复前检查是否与之前的回复重复
`)
    }

  // Heartbeat optimization
  if (finding.id.includes('heartbeat-cost')) {
    return () => appendToAgentsMd(agentsFile, `
## 心跳优化
- 心跳检查简化为: 读取监控文件 → 有变化才汇报，无变化只回复"无变化"
- 不要在心跳中执行不必要的操作
`)
    }

  // Error learning
  if (finding.id.includes('repeated-fail')) {
    return () => appendToAgentsMd(agentsFile, `
## 错误学习
- 同一命令失败 2 次后不再尝试，询问用户或更换策略
`)
    }

  return null
}

/**
 * Append content to AGENTS.md, creating it if it doesn't exist.
 */
function appendToAgentsMd(filePath: string, content: string): void {
  let existing = ''
  if (existsSync(filePath)) {
    existing = readFileSync(filePath, 'utf8')
  }

  // Avoid duplicate content
  const trimmedContent = content.trim()
  if (existing.includes(trimmedContent.split('\n')[0])) {
    return // Already exists
  }

  writeFileSync(filePath, existing + '\n' + trimmedContent + '\n', 'utf8')
}

/**
 * Run doctor --fix command.
 */
export async function runDoctorFix(projectDir?: string): Promise<void> {
  const dir = projectDir || process.cwd()

  console.log('🔧 龙虾体检 — 一键修复\n')

  // Load latest report
  const report = loadLatestReport()
  if (!report) {
    console.log('未找到体检报告。请先运行 lobster-checkup 进行体检。')
    return
  }

  // Collect fixes
  const fixes = collectFixes(report, dir)
  if (fixes.length === 0) {
    console.log('没有可一键修复的项。')
    return
  }

  // Preview changes
  console.log(`找到 ${fixes.length} 个可一键修复的项:\n`)
  for (let i = 0; i < fixes.length; i++) {
    const { finding, fix } = fixes[i]
    console.log(`  ${i + 1}. [${finding.severity.toUpperCase()}] ${finding.title}`)
    console.log(`     修复: ${fix.action}`)
    if (fix.weeklySavings) {
      console.log(`     预期省: $${fix.weeklySavings.toFixed(2)}/周`)
    }
    console.log('')
  }

  // Apply fixes
  console.log('正在应用修复...\n')
  for (const fix of fixes) {
    try {
      fix.apply()
      console.log(`  ✓ ${fix.finding.title}`)
    } catch (e) {
      console.log(`  ✗ ${fix.finding.title}: ${(e as Error).message}`)
    }
  }

  console.log('\n✅ 修复完成！建议重新运行体检验证效果。')
}
