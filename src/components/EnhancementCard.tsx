// ============================================================
// 龙虾体检 v4 — 增强建议卡片
// ============================================================

import type { Enhancement } from '@/lib/types'

const TYPE_LABELS: Record<string, { label: string; style: string }> = {
  builtin: { label: '内置', style: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  ecosystem: { label: '生态', style: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  thirdparty: { label: '第三方', style: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400' },
}

export function EnhancementCard({ enhancement }: { enhancement: Enhancement }) {
  const rec = enhancement.recommendation
  const typeInfo = rec ? TYPE_LABELS[rec.type] || TYPE_LABELS.thirdparty : null

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {enhancement.direction}
        </span>
        {typeInfo && (
          <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${typeInfo.style}`}>
            {typeInfo.label}
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        检测条件: {enhancement.condition}
      </p>

      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {enhancement.suggestion}
      </p>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-emerald-600 dark:text-emerald-400">
          预期效果: {enhancement.expectedEffect}
        </span>
      </div>

      {rec && (
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-xs">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            推荐: {rec.product}
          </span>
          <span className="ml-2 text-zinc-400">{rec.action}</span>
        </div>
      )}
    </div>
  )
}
