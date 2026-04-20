// ============================================================
// GET /api/checkup/[id] — 获取体检报告
// ============================================================

import { NextResponse } from 'next/server'
import { loadReport } from '@/lib/redis'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Missing report ID' }, { status: 400 })
  }

  try {
    const report = await loadReport(id)

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found or expired' },
        { status: 404 },
      )
    }

    return NextResponse.json(report)
  } catch (error) {
    console.error('Failed to load report:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
