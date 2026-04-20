// ============================================================
// 龙虾体检 v4 — 概览区组件
// ============================================================

import type { CheckupReport } from '@/lib/types'
import { DomainScoreBars } from './DomainScoreBars'

const GRADE_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  A: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', ring: 'ring-emerald-200 dark:ring-emerald-800' },
  B: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-400', ring: 'ring-yellow-200 dark:ring-yellow-800' },
  C: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', ring: 'ring-orange-200 dark:ring-orange-800' },
  D: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', ring: 'ring-red-200 dark:ring-red-800' },
}

export function ReportOverview({ report }: { report: CheckupReport }) {
  const { healthRole, domainScores, summary } = report
  const gradeStyle = GRADE_STYLES[healthRole.grade] || GRADE_STYLES.C

  return (
    <section className="space-y-6">
      {/* 角色评级卡片 */}
      <div className={`rounded-2xl p-6 ${gradeStyle.bg} ring-1 ${gradeStyle.ring}`}>
        <div className="flex items-center gap-4">
          <div className={`flex items-center justify-center h-16 w-16 rounded-xl ${gradeStyle.bg} ring-2 ${gradeStyle.ring}`}>
            <span className={`text-3xl font-bold ${gradeStyle.text}`}>{healthRole.grade}</span>
          </div>
          <div>
            <h2 className={`text-xl font-bold ${gradeStyle.text}`}>{healthRole.name}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{healthRole.description}</p>
          </div>
        </div>
      </div>

      {/* 总结 */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">{summary.oneLiner}</p>
      </div>

      {/* 三域健康度 */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-4">域健康度</h3>
        <DomainScoreBars scores={domainScores} />
      </div>

      {/* Severity 统计 */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Critical" count={summary.severityCounts.critical} color="text-red-600 dark:text-red-400" bgColor="bg-red-50 dark:bg-red-900/20" />
        <StatCard label="High" count={summary.severityCounts.high} color="text-orange-600 dark:text-orange-400" bgColor="bg-orange-50 dark:bg-orange-900/20" />
        <StatCard label="Medium" count={summary.severityCounts.medium} color="text-yellow-600 dark:text-yellow-400" bgColor="bg-yellow-50 dark:bg-yellow-900/20" />
        <StatCard label="Low" count={summary.severityCounts.low} color="text-zinc-500 dark:text-zinc-400" bgColor="bg-zinc-50 dark:bg-zinc-800/50" />
      </div>

      {/* Top 3 修复 + 省钱 */}
      {summary.top3Fixes.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">最值得修的 Top 3</h3>
          <ol className="space-y-2">
            {summary.top3Fixes.map((fix, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-sm font-bold text-zinc-400 mt-0.5">{i + 1}.</span>
                <div>
                  <span className="text-sm text-zinc-900 dark:text-zinc-100">{fix.action}</span>
                  <span className="ml-2 text-xs text-zinc-400">
                    [{fix.effort}]
                    {fix.weeklySavings ? ` 省 $${fix.weeklySavings.toFixed(2)}/周` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {summary.totalSavingsPerWeek > 0 && (
            <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              总计每周可省 ${summary.totalSavingsPerWeek.toFixed(2)}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function StatCard({ label, count, color, bgColor }: { label: string; count: number; color: string; bgColor: string }) {
  return (
    <div className={`rounded-lg ${bgColor} p-3 text-center`}>
      <div className={`text-2xl font-bold ${color}`}>{count}</div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{label}</div>
    </div>
  )
}
