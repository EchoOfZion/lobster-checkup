// ============================================================
// 龙虾体检 v4 — 域诊断区域组件
// ============================================================

'use client'

import { useState } from 'react'
import type { Finding, Domain } from '@/lib/types'
import { FindingCard } from './FindingCard'
import { SeverityBadge } from './SeverityBadge'

const DOMAIN_INFO: Record<Domain, { title: string; description: string }> = {
  behavior: {
    title: '行为检测域',
    description: '检测 Agent 的工具调用、任务执行、信息准确性和输出质量',
  },
  security: {
    title: '安全检测域',
    description: '检测运行时安全和环境安全风险',
  },
  token: {
    title: 'Token 消耗检测域',
    description: '检测花费异常、模型错配和可优化的消耗',
  },
  enhancement: {
    title: '增强建议域',
    description: '不是问题，但可以让 Agent 运行得更好',
  },
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/** Group findings by title, preserving severity sort within each group */
function groupFindings(findings: Finding[]): { title: string; severity: string; items: Finding[] }[] {
  const groups = new Map<string, Finding[]>()
  for (const f of findings) {
    const key = f.title
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }
  const result: { title: string; severity: string; items: Finding[] }[] = []
  for (const [title, items] of groups) {
    // Use the highest severity in the group
    const severity = items.reduce(
      (best, f) => ((SEVERITY_ORDER[f.severity] ?? 99) < (SEVERITY_ORDER[best] ?? 99) ? f.severity : best),
      items[0].severity
    )
    result.push({ title, severity, items })
  }
  // Sort groups by highest severity, then by count desc
  result.sort((a, b) => {
    const sd = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    if (sd !== 0) return sd
    return b.items.length - a.items.length
  })
  return result
}

const COLLAPSE_THRESHOLD = 3

function FindingGroup({ group }: { group: { title: string; severity: string; items: Finding[] } }) {
  const [expanded, setExpanded] = useState(false)
  const { items } = group

  if (items.length < COLLAPSE_THRESHOLD) {
    // Render individually
    return (
      <>
        {items.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </>
    )
  }

  // Collapsed group: show summary header + expand to see individual cards
  // Show first card always, collapse the rest
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <SeverityBadge severity={group.severity as any} />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {group.title}
          </span>
          <span className="text-xs text-zinc-400 bg-zinc-200 dark:bg-zinc-700 rounded-full px-2 py-0.5">
            {items.length} 个
          </span>
        </div>
        <span className="text-xs text-zinc-400">
          {expanded ? '收起' : '展开全部'}
        </span>
      </button>

      {/* Always show first card */}
      <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
        <FindingCard finding={items[0]} />
      </div>

      {/* Collapsed rest */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {items.slice(1).map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      )}

      {!expanded && items.length > 1 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-4 py-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
        >
          还有 {items.length - 1} 个同类问题...
        </button>
      )}
    </div>
  )
}

export function DomainSection({
  domain,
  findings,
  score,
}: {
  domain: Domain
  findings: Finding[]
  score?: number
}) {
  const info = DOMAIN_INFO[domain]
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  )
  const groups = groupFindings(sorted)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{info.title}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{info.description}</p>
        </div>
        {score !== undefined && (
          <div className="text-right">
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{score}</div>
            <div className="text-xs text-zinc-400">/100</div>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-center text-sm text-zinc-400">
          未发现问题
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <FindingGroup key={group.title} group={group} />
          ))}
        </div>
      )}
    </section>
  )
}
