// ============================================================
// 龙虾体检 v4 — 病历卡组件
// ============================================================

'use client'

import { useState } from 'react'
import type { Finding } from '@/lib/types'
import { SeverityBadge } from './SeverityBadge'

export function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {finding.title}
          </h4>
          {finding.llmAssisted && (
            <span className="text-[10px] text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded px-1">
              LLM
            </span>
          )}
        </div>
        {finding.location && (
          <span className="text-xs text-zinc-400 shrink-0">
            Turn {finding.location.turn}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{finding.description}</p>

      {/* Impact */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(finding.impact).map(([key, value]) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400"
          >
            <span className="font-medium">{key}:</span> {String(value)}
          </span>
        ))}
      </div>

      {/* Root Cause */}
      {finding.rootCause.length > 0 && (
        <div>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">根因: </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {finding.rootCause.join('；')}
          </span>
        </div>
      )}

      {/* Fix */}
      {finding.fix.length > 0 && (
        <div className="space-y-1">
          {finding.fix.map((fix, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2">
              <span className="text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">Rx</span>
              <div className="text-xs">
                <span className="text-zinc-800 dark:text-zinc-200">{fix.action}</span>
                <span className="ml-2 text-zinc-400">
                  [{fix.effort}]
                  {fix.expectedEffect && ` → ${fix.expectedEffect}`}
                  {fix.weeklySavings ? ` 省 $${fix.weeklySavings.toFixed(2)}/周` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Evidence (collapsible) */}
      {Object.keys(finding.evidence).length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            {expanded ? '收起证据' : '展开证据'}
          </button>
          {expanded && (
            <pre className="mt-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-600 dark:text-zinc-400 overflow-x-auto">
              {JSON.stringify(finding.evidence, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
