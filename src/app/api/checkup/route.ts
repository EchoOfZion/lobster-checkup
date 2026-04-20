// ============================================================
// POST /api/checkup — 提交体检报告
// ============================================================

import { NextResponse } from 'next/server'
import { saveReport, generateReportId } from '@/lib/redis'
import type { CheckupReport, CheckupSubmission } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const body = await request.json() as CheckupSubmission

    if (!body.report || body.version !== 4) {
      return NextResponse.json(
        { error: 'Invalid submission: version must be 4 and report is required' },
        { status: 400 },
      )
    }

    const report = body.report as CheckupReport

    // Basic validation
    if (!report.findings || !report.healthRole || !report.domainScores) {
      return NextResponse.json(
        { error: 'Invalid report: missing required fields' },
        { status: 400 },
      )
    }

    const id = generateReportId()
    await saveReport(id, report)

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
    const url = `${baseUrl}/r/${id}`

    return NextResponse.json({ id, url }, { status: 201 })
  } catch (error) {
    console.error('Failed to save report:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
