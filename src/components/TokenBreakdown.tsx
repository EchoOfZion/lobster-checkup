// ============================================================
// 龙虾体检 v4 — Token 花销全景组件
// ============================================================

import type { TokenAnalysis } from '@/lib/types'

function PercentBar({ label, amount, total, color }: {
  label: string; amount: number; total: number; color: string
}) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="text-zinc-500">${amount.toFixed(2)} ({pct}%)</span>
      </div>
      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function TokenBreakdown({ analysis }: { analysis: TokenAnalysis }) {
  const { totalCost, necessary, optimizable, wasted, breakdown } = analysis

  return (
    <div className="space-y-5">
      {/* 三分类 */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">花销全景</h3>
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            ${totalCost.toFixed(2)}
          </span>
        </div>

        <PercentBar label="必要" amount={necessary} total={totalCost} color="bg-emerald-500" />
        <PercentBar label="可优化" amount={optimizable} total={totalCost} color="bg-yellow-500" />
        <PercentBar label="浪费" amount={wasted} total={totalCost} color="bg-red-500" />
      </div>

      {/* 浪费明细 */}
      {(breakdown.runawayTurns > 0 || breakdown.repeatedFailures > 0 ||
        breakdown.contextBloat > 0 || breakdown.modelMismatch > 0 ||
        breakdown.heartbeatOverhead > 0) && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-3">浪费/可优化明细</h3>
          <div className="space-y-2">
            {breakdown.runawayTurns > 0 && (
              <BreakdownItem label="Runaway Turn" amount={breakdown.runawayTurns} type="wasted" />
            )}
            {breakdown.repeatedFailures > 0 && (
              <BreakdownItem label="重复失败" amount={breakdown.repeatedFailures} type="wasted" />
            )}
            {breakdown.contextBloat > 0 && (
              <BreakdownItem label="上下文膨胀" amount={breakdown.contextBloat} type="optimizable" />
            )}
            {breakdown.modelMismatch > 0 && (
              <BreakdownItem label="模型错配" amount={breakdown.modelMismatch} type="optimizable" />
            )}
            {breakdown.heartbeatOverhead > 0 && (
              <BreakdownItem label="心跳开销" amount={breakdown.heartbeatOverhead} type="optimizable" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BreakdownItem({ label, amount, type }: {
  label: string; amount: number; type: 'wasted' | 'optimizable'
}) {
  const color = type === 'wasted' ? 'text-red-500' : 'text-yellow-500'
  const tag = type === 'wasted' ? '浪费' : '可优化'
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${type === 'wasted' ? 'bg-red-500' : 'bg-yellow-500'}`} />
        <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-medium ${color}`}>${amount.toFixed(2)}</span>
        <span className="text-zinc-400">{tag}</span>
      </div>
    </div>
  )
}
