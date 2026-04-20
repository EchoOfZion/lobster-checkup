// ============================================================
// 龙虾体检 v4 — Severity 标签组件
// ============================================================

import type { Severity } from '@/lib/types'

const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Critical' },
  high: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', label: 'High' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: 'Medium' },
  low: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', label: 'Low' },
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const style = SEVERITY_STYLES[severity]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

export function SeverityDot({ severity }: { severity: Severity }) {
  const dotColors: Record<Severity, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-zinc-400',
  }
  return <span className={`inline-block h-2 w-2 rounded-full ${dotColors[severity]}`} />
}
