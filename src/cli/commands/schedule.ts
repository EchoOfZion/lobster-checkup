// ============================================================
// 龙虾体检 v4 — --schedule 定期体检（本地 cron）
// ============================================================

import { execSync } from 'child_process'
import { platform } from 'os'

const CRON_COMMENT = '# lobster-checkup scheduled job'

/**
 * Configure periodic checkup via cron.
 */
export function runSchedule(interval: string): void {
  console.log('⏰ 龙虾体检 — 定期体检配置\n')

  if (platform() === 'win32') {
    console.log('Windows 不支持 cron。请使用 Task Scheduler 手动配置。')
    console.log('命令: npx lobster-checkup --no-upload')
    return
  }

  const cronExpression = getCronExpression(interval)
  if (!cronExpression) {
    console.log('支持的间隔: daily, weekly, monthly')
    console.log('示例: lobster-checkup --schedule weekly')
    return
  }

  const command = `${cronExpression} npx lobster-checkup --no-upload >> ~/.lobster-checkup/cron.log 2>&1`

  try {
    // Get existing crontab
    let existing = ''
    try {
      existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' })
    } catch {
      // No existing crontab
    }

    // Remove old lobster-checkup entry
    const lines = existing.split('\n').filter(line =>
      !line.includes('lobster-checkup') && line !== CRON_COMMENT
    )

    // Add new entry
    lines.push(CRON_COMMENT)
    lines.push(command)

    // Write new crontab
    const newCrontab = lines.filter(Boolean).join('\n') + '\n'
    execSync(`echo '${newCrontab.replace(/'/g, "'\\''") }' | crontab -`, {
      encoding: 'utf8',
    })

    console.log(`✅ 已配置 ${interval} 体检:`)
    console.log(`   ${command}`)
    console.log(`\n日志位置: ~/.lobster-checkup/cron.log`)
    console.log(`取消: crontab -e 删除 lobster-checkup 相关行`)
  } catch (e) {
    console.log(`❌ 配置失败: ${(e as Error).message}`)
    console.log('\n手动配置:')
    console.log(`  crontab -e`)
    console.log(`  添加: ${command}`)
  }
}

function getCronExpression(interval: string): string | null {
  switch (interval.toLowerCase()) {
    case 'daily':
      return '0 9 * * *'         // Every day at 9 AM
    case 'weekly':
      return '0 9 * * 1'         // Every Monday at 9 AM
    case 'monthly':
      return '0 9 1 * *'         // 1st of every month at 9 AM
    default:
      return null
  }
}
