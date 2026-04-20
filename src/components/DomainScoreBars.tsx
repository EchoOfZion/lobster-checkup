// ============================================================
// 龙虾体检 v4 — 域健康度分数条
// ============================================================

import type { DomainScores } from '@/lib/types'

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-yellow-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-red-500'
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'
  if (score >= 40) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-sm text-zinc-500 dark:text-zinc-400 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`w-10 text-right text-sm font-semibold ${scoreTextColor(score)}`}>
        {score}
      </span>
    </div>
  )
}

export function DomainScoreBars({ scores }: { scores: DomainScores }) {
  return (
    <div className="space-y-3">
      <ScoreBar label="行为" score={scores.behavior} />
      <ScoreBar label="安全" score={scores.security} />
      <ScoreBar label="Token" score={scores.token} />
    </div>
  )
}
