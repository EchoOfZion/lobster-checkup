import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CheckupPolicy } from '../core/types'

export type LoadedPolicy = {
  source: 'default' | 'file'
  path?: string
  policy: CheckupPolicy
}

export const defaultPolicy: CheckupPolicy = {
  sensitivePathPatterns: ['\\.env', '\\.ssh', 'credentials', 'secrets', '\\.npmrc', '\\.pypirc', '\\.aws', '\\.gcp'],
  requiredVerificationCommands: ['npm test', 'npm run lint', 'npm run build', 'npm run checkup', 'pnpm test', 'pytest', 'cargo test', 'go test'],
  requiredSkillsByIntent: {
    '检测|体检|checkup|health\\s*check|diagnose': 'lobster-checkup',
  },
  retainRawFindingsInHtml: true,
}

export function loadPolicy(cwd: string, explicitPath?: string): LoadedPolicy {
  const path = explicitPath || join(cwd, '.lobster-checkup.json')
  if (!existsSync(path)) return { source: 'default', policy: defaultPolicy }

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<CheckupPolicy>
  return {
    source: 'file',
    path,
    policy: {
      ...defaultPolicy,
      ...parsed,
      sensitivePathPatterns: mergeList(defaultPolicy.sensitivePathPatterns, parsed.sensitivePathPatterns),
      requiredVerificationCommands: mergeList(defaultPolicy.requiredVerificationCommands, parsed.requiredVerificationCommands),
      requiredSkillsByIntent: {
        ...defaultPolicy.requiredSkillsByIntent,
        ...(parsed.requiredSkillsByIntent || {}),
      },
    },
  }
}

function mergeList(defaults: string[], override: string[] | undefined): string[] {
  return Array.from(new Set([...(override || []), ...defaults]))
}
