// ============================================================
// 龙虾体检 v4 — 报告存储
// 生产环境用 Upstash Redis，本地开发用文件存储
// ============================================================

import type { CheckupReport } from './types'

const REPORT_TTL = 7 * 24 * 60 * 60 // 7 days

// --- Redis backend ---

let redisClient: any = null

async function getRedis() {
  if (!redisClient) {
    const { Redis } = await import('@upstash/redis')
    const url = process.env.UPSTASH_REDIS_REST_URL!
    const token = process.env.UPSTASH_REDIS_REST_TOKEN!
    redisClient = new Redis({ url, token })
  }
  return redisClient
}

function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

// --- File backend (dev fallback) ---

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const LOCAL_STORE_DIR = join(process.cwd(), '.reports')

function ensureLocalStore() {
  if (!existsSync(LOCAL_STORE_DIR)) {
    mkdirSync(LOCAL_STORE_DIR, { recursive: true })
  }
}

function localPath(id: string): string {
  return join(LOCAL_STORE_DIR, `${id}.json`)
}

// --- Public API ---

function reportKey(id: string): string {
  return `checkup:v4:${id}`
}

/**
 * Save a checkup report.
 */
export async function saveReport(id: string, report: CheckupReport): Promise<void> {
  if (isRedisConfigured()) {
    const r = await getRedis()
    await r.set(reportKey(id), JSON.stringify(report), { ex: REPORT_TTL })
  } else {
    ensureLocalStore()
    writeFileSync(localPath(id), JSON.stringify(report, null, 2), 'utf8')
  }
}

/**
 * Load a checkup report.
 */
export async function loadReport(id: string): Promise<CheckupReport | null> {
  if (isRedisConfigured()) {
    const r = await getRedis()
    const data = await r.get<string>(reportKey(id))
    if (!data) return null
    try {
      return typeof data === 'string' ? JSON.parse(data) : data as unknown as CheckupReport
    } catch {
      return null
    }
  } else {
    const filePath = localPath(id)
    if (!existsSync(filePath)) return null
    try {
      return JSON.parse(readFileSync(filePath, 'utf8'))
    } catch {
      return null
    }
  }
}

/**
 * Generate a unique report ID.
 */
export function generateReportId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `${timestamp}-${random}`
}
