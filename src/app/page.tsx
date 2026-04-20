// ============================================================
// 龙虾体检 v4 — 首页
// ============================================================

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="flex flex-col items-center gap-8 py-32 px-8">
        <div className="text-6xl">🦞</div>
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          龙虾体检 v4
        </h1>
        <p className="max-w-md text-center text-zinc-500 dark:text-zinc-400">
          AI Agent 健康诊断工具。通过 CLI 发起体检，检测行为异常、安全风险和 Token 消耗问题。
        </p>
        <div className="rounded-xl bg-zinc-900 dark:bg-zinc-800 px-6 py-4 font-mono text-sm text-zinc-100">
          <span className="text-zinc-500">$</span> npx lobster-checkup
        </div>
        <div className="flex gap-4 text-sm text-zinc-400">
          <span>四域检测</span>
          <span>·</span>
          <span>病历卡诊断</span>
          <span>·</span>
          <span>一键修复</span>
        </div>
      </main>
    </div>
  )
}
