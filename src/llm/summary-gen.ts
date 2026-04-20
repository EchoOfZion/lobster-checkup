// ============================================================
// 龙虾体检 v4 — LLM 总结生成
// 生成一句话体检总结（替换 summary.ts 中的 fallback 版本）
// ============================================================

import type { Finding, HealthRole, DomainScores, SeverityCounts, TokenAnalysis } from '../lib/types'
import { llmCall, type LLMConfig } from './client'

const SYSTEM_PROMPT = `你是龙虾体检报告的总结生成器。请根据提供的检测结果，生成一句话（30-60个字）的体检总结。

要求：
- 语言简洁有力，点出最核心的问题
- 包含具体数字（如"3个严重问题"、"省 $12/周"）
- 如果没有问题，生动地表达"满血状态"
- 风格参考：诊断报告的主诉行

只返回一句话，不要返回 JSON 或其他格式。`

interface SummaryContext {
  healthRole: HealthRole
  domainScores: DomainScores
  severityCounts: SeverityCounts
  totalFindings: number
  totalSavingsPerWeek: number
  tokenAnalysis: TokenAnalysis
  topIssues: string[]
}

/**
 * Generate a one-liner summary using LLM.
 * Falls back to the deterministic version if LLM call fails.
 */
export async function generateOneLiner(
  context: SummaryContext,
  config: LLMConfig,
): Promise<string> {
  const prompt = `## 体检结果

评级: ${context.healthRole.name}（${context.healthRole.grade}级）- ${context.healthRole.description}

域健康度:
- 行为域: ${context.domainScores.behavior}/100
- 安全域: ${context.domainScores.security}/100
- Token域: ${context.domainScores.token}/100

问题统计: Critical ${context.severityCounts.critical} / High ${context.severityCounts.high} / Medium ${context.severityCounts.medium} / Low ${context.severityCounts.low}
总发现: ${context.totalFindings} 个问题

花费: $${context.tokenAnalysis.totalCost.toFixed(2)}（必要 $${context.tokenAnalysis.necessary.toFixed(2)} / 可优化 $${context.tokenAnalysis.optimizable.toFixed(2)} / 浪费 $${context.tokenAnalysis.wasted.toFixed(2)}）
每周可省: $${context.totalSavingsPerWeek.toFixed(2)}

最突出的问题:
${context.topIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

请生成一句话体检总结（30-60字）。`

  try {
    const response = await llmCall(prompt, SYSTEM_PROMPT, config)
    const text = response.text.trim()
    // Validate: should be a single sentence, not JSON
    if (text.length > 10 && text.length < 200 && !text.startsWith('{')) {
      return text
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback
  return generateFallbackOneLiner(context)
}

function generateFallbackOneLiner(context: SummaryContext): string {
  const { severityCounts, totalFindings, totalSavingsPerWeek, healthRole } = context

  if (totalFindings === 0) {
    return '所有检测域均无问题，Agent 运行状态良好。'
  }

  const parts: string[] = []
  if (severityCounts.critical > 0) parts.push(`${severityCounts.critical} 个严重问题`)
  if (severityCounts.high > 0) parts.push(`${severityCounts.high} 个高风险问题`)

  let summary = `${healthRole.name}：发现 ${totalFindings} 个问题`
  if (parts.length > 0) {
    summary += `（含${parts.join('、')}）`
  }
  if (totalSavingsPerWeek > 0) {
    summary += `，优化后每周可省 $${totalSavingsPerWeek.toFixed(2)}`
  }
  summary += '。'

  return summary
}
