// ============================================================
// 龙虾体检 v4 — 处方清单组件
// 按 severity + 投入产出比排序的修复清单
// ============================================================

import type { Finding } from '@/lib/types'
import { SeverityBadge } from './SeverityBadge'

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const EFFORT_ORDER: Record<string, number> = {
  '一键': 0,
  '改配置': 1,
  '改代码': 2,
}

interface PrescriptionItem {
  finding: Finding
  fix: Finding['fix'][number]
}

export function PrescriptionList({ findings }: { findings: Finding[] }) {
  // Flatten and sort
  const items: PrescriptionItem[] = []
  for (const finding of findings) {
    for (const fix of finding.fix) {
      items.push({ finding, fix })
    }
  }

  items.sort((a, b) => {
    const sevA = SEVERITY_ORDER[a.finding.severity] ?? 99
    const sevB = SEVERITY_ORDER[b.finding.severity] ?? 99
    if (sevA !== sevB) return sevA - sevB

    const effA = EFFORT_ORDER[a.fix.effort] ?? 99
    const effB = EFFORT_ORDER[b.fix.effort] ?? 99
    if (effA !== effB) return effA - effB

    return (b.fix.weeklySavings || 0) - (a.fix.weeklySavings || 0)
  })

  // Deduplicate by action
  const seen = new Set<string>()
  const unique = items.filter(item => {
    if (seen.has(item.fix.action)) return false
    seen.add(item.fix.action)
    return true
  })

  if (unique.length === 0) return null

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">处方清单</h2>
      <div className="space-y-2">
        {unique.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3"
          >
            <span className="text-xs font-bold text-zinc-400 mt-0.5 shrink-0 w-5 text-right">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <SeverityBadge severity={item.finding.severity} />
                <span className="text-xs text-zinc-400">{item.finding.title}</span>
              </div>
              <p className="text-sm text-zinc-800 dark:text-zinc-200">{item.fix.action}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                <span className={
                  item.fix.effort === '一键' ? 'text-emerald-500' :
                  item.fix.effort === '改配置' ? 'text-yellow-500' : 'text-orange-500'
                }>
                  {item.fix.effort}
                </span>
                {item.fix.expectedEffect && (
                  <span>→ {item.fix.expectedEffect}</span>
                )}
                {item.fix.weeklySavings ? (
                  <span className="text-emerald-500">省 ${item.fix.weeklySavings.toFixed(2)}/周</span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
