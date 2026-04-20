// ============================================================
// 龙虾体检 v4 — LLM 辅助检测入口
// 统一调用所有 LLM 辅助检测项
// ============================================================

import type { ParsedSession } from '../parsers/types'
import type { Finding } from '../lib/types'
import { type LLMConfig, isLLMAvailable } from './client'
import { detectTaskSubstitution } from './task-substitution'
import { detectFabrication } from './fabrication'
import { detectFakeProgress } from './progress-check'
import { detectIntentMisunderstanding } from './intent-check'
import { detectUnnecessaryWrites } from './write-check'

export { generateOneLiner } from './summary-gen'
export { type LLMConfig, isLLMAvailable } from './client'

/**
 * Run all LLM-assisted behavior detections.
 * Returns empty array if LLM is not configured.
 *
 * These correspond to behavior detection items:
 * - 5: 任务偷换
 * - 8: 误解用户意图
 * - 9: 信息捏造
 * - 10: 虚报进度
 * - 15: 不必要的文件写入
 */
export async function runLLMDetections(
  sessions: ParsedSession[],
  config: LLMConfig | undefined,
): Promise<Finding[]> {
  if (!config || !isLLMAvailable(config)) {
    return []
  }

  // Run all detections in parallel
  const [
    taskSubstitution,
    fabrication,
    fakeProgress,
    intentMisunderstanding,
    unnecessaryWrites,
  ] = await Promise.all([
    detectTaskSubstitution(sessions, config).catch(() => [] as Finding[]),
    detectFabrication(sessions, config).catch(() => [] as Finding[]),
    detectFakeProgress(sessions, config).catch(() => [] as Finding[]),
    detectIntentMisunderstanding(sessions, config).catch(() => [] as Finding[]),
    detectUnnecessaryWrites(sessions, config).catch(() => [] as Finding[]),
  ])

  return [
    ...taskSubstitution,
    ...fabrication,
    ...fakeProgress,
    ...intentMisunderstanding,
    ...unnecessaryWrites,
  ]
}
