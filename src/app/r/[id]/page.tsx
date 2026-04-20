// ============================================================
// 龙虾体检 v4 — 报告页（单页滚动）
// /r/[id]
// ============================================================

import { notFound } from 'next/navigation'
import { loadReport } from '@/lib/redis'
import type { CheckupReport, Domain } from '@/lib/types'
import { ReportOverview } from '@/components/ReportOverview'
import { DomainSection } from '@/components/DomainSection'
import { TokenBreakdown } from '@/components/TokenBreakdown'
import { EnhancementCard } from '@/components/EnhancementCard'
import { PrescriptionList } from '@/components/PrescriptionList'

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const report = await loadReport(id)

  if (!report) {
    notFound()
  }

  const behaviorFindings = report.findings.filter(f => f.domain === 'behavior')
  const securityFindings = report.findings.filter(f => f.domain === 'security')
  const tokenFindings = report.findings.filter(f => f.domain === 'token')

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-10">
        {/* Header */}
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            龙虾体检报告
          </h1>
          <p className="text-xs text-zinc-400">
            v{report.version} · {report.generatedAt ? new Date(report.generatedAt).toLocaleString('zh-CN') : ''} · {report.sessionCount} 个 Session · {report.periodDays} 天
          </p>
        </header>

        {/* 概览区 */}
        <ReportOverview report={report} />

        <hr className="border-zinc-200 dark:border-zinc-800" />

        {/* 行为域 */}
        <DomainSection
          domain="behavior"
          findings={behaviorFindings}
          score={report.domainScores.behavior}
        />

        <hr className="border-zinc-200 dark:border-zinc-800" />

        {/* 安全域 */}
        <DomainSection
          domain="security"
          findings={securityFindings}
          score={report.domainScores.security}
        />

        <hr className="border-zinc-200 dark:border-zinc-800" />

        {/* Token 域 */}
        <DomainSection
          domain="token"
          findings={tokenFindings}
          score={report.domainScores.token}
        />

        {/* Token 花销全景 */}
        <TokenBreakdown analysis={report.tokenAnalysis} />

        <hr className="border-zinc-200 dark:border-zinc-800" />

        {/* 增强建议域 */}
        {report.enhancements.length > 0 && (
          <>
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">增强建议</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  不是问题，但可以让 Agent 运行得更好
                </p>
              </div>
              <div className="space-y-3">
                {report.enhancements.map((e) => (
                  <EnhancementCard key={e.id} enhancement={e} />
                ))}
              </div>
            </section>

            <hr className="border-zinc-200 dark:border-zinc-800" />
          </>
        )}

        {/* 处方清单 */}
        <PrescriptionList findings={report.findings} />

        {/* Footer */}
        <footer className="text-center text-xs text-zinc-400 pb-8">
          龙虾体检 v4 · 报告有效期 7 天
        </footer>
      </div>
    </div>
  )
}
