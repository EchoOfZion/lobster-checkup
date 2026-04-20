// ============================================================
// 龙虾体检 v4 — 安全检测域
// 只关注风险，不管行为效率也不算钱。
// ============================================================

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { ParsedSession, ContentBlock } from '../parsers/types'
import type { Finding } from '../lib/types'

let findingSeq = 0
function nextId(category: string): string {
  return `security-${category}-${String(++findingSeq).padStart(3, '0')}`
}

function getText(blocks: ContentBlock[]): string {
  return blocks.filter(b => b.type === 'text').map(b => (b as any).text).join('\n')
}

// Sensitive key patterns
const KEY_PATTERNS = [
  { pattern: /sk-ant-[a-zA-Z0-9]{20,}/, type: 'Anthropic API Key' },
  { pattern: /sk-proj-[a-zA-Z0-9]{20,}/, type: 'OpenAI API Key' },
  { pattern: /AKIA[A-Z0-9]{16}/, type: 'AWS Access Key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, type: 'GitHub Token' },
  { pattern: /xoxb-[a-zA-Z0-9-]+/, type: 'Slack Bot Token' },
  { pattern: /gsk_[a-zA-Z0-9]{20,}/, type: 'Groq API Key' },
  { pattern: /AIza[a-zA-Z0-9_-]{35}/, type: 'Google API Key' },
]

const SENSITIVE_PATHS = /\.env|\.ssh|credentials|secrets|\.aws|\.gcp|\.npmrc|\.pypirc/i

// ============================================================
// 4.2.1 运行时安全
// ============================================================

/** 检测项 1：执行不可信来源命令 — Critical */
function detectUntrustedExecution(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    for (const turn of session.turns) {
      // Find exec/shell/bash tool calls
      const execCalls = turn.toolCalls.filter(tc =>
        tc.name.match(/bash|exec|shell|terminal|command/i)
      )

      for (const exec of execCalls) {
        const command = (exec.args.command || exec.args.cmd || '') as string
        if (!command) continue

        // Check if this command text appeared in a previous toolResult (file read or web fetch)
        const prevResults = turn.toolCalls
          .filter(tc => tc.id !== exec.id && tc.result)
          .map(tc => tc.result!)

        for (const result of prevResults) {
          // Check if significant part of the command came from a tool result
          if (command.length > 10 && result.includes(command.slice(0, Math.min(50, command.length)))) {
            const sourceTool = turn.toolCalls.find(tc => tc.result === result)
            const isFileSource = sourceTool?.name.match(/read|cat|open|file/i)
            const isWebSource = sourceTool?.name.match(/web|fetch|curl|http|browser/i)

            if (isFileSource || isWebSource) {
              findings.push({
                id: nextId('untrusted-exec'),
                domain: 'security',
                severity: 'critical',
                title: '执行不可信来源命令',
                location: {
                  session: session.meta.id,
                  turn: turn.index,
                  timeRange: '',
                },
                description: `Agent 执行的命令内容来自${isFileSource ? '文件读取' : '网页抓取'}结果，而非用户直接指令。`,
                impact: {
                  riskLevel: '高',
                  exposureScope: '系统命令执行',
                },
                rootCause: [
                  'Agent 将非用户来源的内容作为命令执行',
                  '缺乏命令来源校验',
                ],
                fix: [{
                  action: '配置沙盒限制，外部来源的命令需用户确认',
                  effort: '改配置',
                  expectedEffect: '阻止间接命令注入',
                }],
                evidence: {
                  command: command.slice(0, 200),
                  source: isFileSource ? 'file_read' : 'web_fetch',
                  sourceTool: sourceTool?.name,
                },
              })
            }
          }
        }
      }
    }
  }

  return findings
}

/** 检测项 2：沙盒逃逸尝试 — Critical */
function detectSandboxEscape(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []
  // Only check exec-type tools for escape patterns
  const execToolPattern = /bash|exec|shell|terminal|command/i
  const escapePatterns = /sudo\s+\S|chmod\s+[67]\d{2}|chown\s+|--no-sandbox|--disable-security|--privileged|nsenter|docker\s+run\s+--privileged/i

  for (const session of sessions) {
    for (const turn of session.turns) {
      for (const tc of turn.toolCalls) {
        // Only check execution-type tools, not editors/planners
        if (!execToolPattern.test(tc.name)) continue
        const command = (tc.args.command || tc.args.cmd || '') as string
        if (!command) continue
        if (escapePatterns.test(command)) {
          findings.push({
            id: nextId('sandbox-escape'),
            domain: 'security',
            severity: 'critical',
            title: '沙盒逃逸尝试',
            location: {
              session: session.meta.id,
              turn: turn.index,
              timeRange: '',
            },
            description: `命令 "${command.slice(0, 80)}" 包含提权/绕过安全的操作。`,
            impact: {
              riskLevel: '严重',
              exposureScope: '沙盒安全边界',
            },
            rootCause: ['Agent 尝试提权操作', '缺乏沙盒逃逸检测'],
            fix: [{
              action: '配置工具调用黑名单，阻止提权操作',
              effort: '改配置',
              expectedEffect: '防止沙盒逃逸',
            }],
            evidence: {
              toolName: tc.name,
              command: command.slice(0, 300),
            },
          })
        }
      }
    }
  }

  return findings
}

/** 检测项 3：凭证进入上下文 — High */
function detectCredentialExposure(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    for (const turn of session.turns) {
      for (const tc of turn.toolCalls) {
        const argsStr = JSON.stringify(tc.args)

        // Check if reading sensitive files
        if (tc.name.match(/read|cat|open|file/i) && SENSITIVE_PATHS.test(argsStr)) {
          findings.push({
            id: nextId('credential-context'),
            domain: 'security',
            severity: 'high',
            title: '凭证进入上下文',
            location: {
              session: session.meta.id,
              turn: turn.index,
              timeRange: '',
            },
            description: `读取了敏感文件的内容，凭证信息进入对话上下文。`,
            impact: {
              riskLevel: '高',
              exposureScope: '凭证文件',
            },
            rootCause: [
              'Agent 读取了 .env/.ssh/credentials 等敏感文件',
              '凭证内容进入 LLM 上下文',
            ],
            fix: [{
              action: '配置敏感文件读取黑名单',
              effort: '改配置',
              expectedEffect: '阻止凭证进入上下文',
            }],
            evidence: {
              toolName: tc.name,
              filePath: argsStr.match(SENSITIVE_PATHS)?.[0] || '',
            },
          })
        }
      }
    }
  }

  return findings
}

/** 检测项 4：敏感信息输出 — High */
function detectSensitiveOutput(sessions: ParsedSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    for (const turn of session.turns) {
      for (const msg of turn.assistantMessages) {
        const text = getText(msg.content)
        for (const kp of KEY_PATTERNS) {
          if (kp.pattern.test(text)) {
            findings.push({
              id: nextId('sensitive-output'),
              domain: 'security',
              severity: 'high',
              title: '敏感信息输出',
              location: {
                session: session.meta.id,
                turn: turn.index,
                timeRange: '',
              },
              description: `Agent 回复中包含 ${kp.type} 格式的敏感信息。`,
              impact: {
                riskLevel: '高',
                exposureScope: kp.type,
              },
              rootCause: ['Agent 将敏感信息包含在回复中', '缺乏输出过滤'],
              fix: [{
                action: '配置输出过滤规则，自动脱敏',
                effort: '改配置',
                expectedEffect: '防止密钥泄露',
              }],
              evidence: {
                keyType: kp.type,
                // Don't include the actual key in evidence
              },
            })
            break // One finding per pattern per turn
          }
        }
      }
    }
  }

  return findings
}

// ============================================================
// 4.2.2 环境安全（静态扫描）
// ============================================================

/** 检测项 5：Skill/Plugin 注入 — Critical */
function detectSkillInjection(projectDir?: string): Finding[] {
  const findings: Finding[] = []
  if (!projectDir) return findings

  const injectionPatterns = [
    /(write|edit|modify|overwrite)\s+(to\s+)?(SOUL|AGENTS|CLAUDE|system\s*prompt)/i,
    /(override|replace|ignore\s+previous)/i,
    /(delete|remove|truncate)\s+.*\.(md|json|yaml|toml)/i,
  ]

  const skillFiles = ['SKILL.md', 'skill.md']
  const searchDirs = [projectDir, join(projectDir, 'skills'), join(projectDir, 'plugins')]

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue
    try {
      const files = readdirSync(dir, { recursive: true }) as string[]
      for (const file of files) {
        const fullPath = join(dir, file)
        if (!file.match(/skill|plugin/i) || !file.match(/\.md$|\.json$|\.yaml$|\.yml$/i)) continue

        try {
          const content = readFileSync(fullPath, 'utf8')
          for (const pattern of injectionPatterns) {
            const match = content.match(pattern)
            if (match) {
              findings.push({
                id: nextId('skill-injection'),
                domain: 'security',
                severity: 'critical',
                title: 'Skill/Plugin 注入风险',
                description: `文件 "${file}" 包含可能篡改核心配置的指令。`,
                impact: {
                  riskLevel: '严重',
                  exposureScope: '核心配置文件',
                },
                rootCause: [
                  'Plugin/Skill 文件包含对核心文件的写入指令',
                  'Plugin 具有过宽的文件操作权限',
                ],
                fix: [{
                  action: '配置 Plugin 沙盒，限制对核心文件的写入权限',
                  effort: '改配置',
                  expectedEffect: '消除核心配置被篡改的风险',
                }],
                evidence: {
                  filePath: fullPath,
                  matchedPattern: match[0],
                },
              })
              break
            }
          }
        } catch { /* can't read file */ }
      }
    } catch { /* can't read dir */ }
  }

  return findings
}

/** 检测项 6：API Key 明文暴露 — High */
function detectApiKeyExposure(projectDir?: string): Finding[] {
  const findings: Finding[] = []
  if (!projectDir) return findings

  const scanExtensions = /\.(json|yaml|yml|env|toml|ts|js|tsx|jsx|py|sh)$/
  const gitignorePatterns = loadGitignore(projectDir)

  function scanDir(dir: string) {
    if (!existsSync(dir)) return
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.name === 'node_modules' || entry.name === '.git') continue

        if (entry.isDirectory()) {
          scanDir(fullPath)
        } else if (scanExtensions.test(entry.name)) {
          // Check if file is gitignored
          const relativePath = fullPath.replace(projectDir + '/', '')
          if (gitignorePatterns.some(p => relativePath.includes(p))) continue

          try {
            const content = readFileSync(fullPath, 'utf8')
            for (const kp of KEY_PATTERNS) {
              if (kp.pattern.test(content)) {
                findings.push({
                  id: nextId('api-key-exposure'),
                  domain: 'security',
                  severity: 'high',
                  title: 'API Key 明文暴露',
                  description: `文件 "${entry.name}" 中包含 ${kp.type} 明文。`,
                  impact: {
                    riskLevel: '高',
                    exposureScope: kp.type,
                  },
                  rootCause: [
                    '敏感密钥以明文存储在代码/配置中',
                    '文件未被 .gitignore 忽略',
                  ],
                  fix: [{
                    action: '将密钥移到环境变量或 secrets manager',
                    effort: '改配置',
                    expectedEffect: '消除密钥泄露风险',
                  }],
                  evidence: {
                    filePath: relativePath,
                    keyType: kp.type,
                    inGitignore: false,
                  },
                })
                break
              }
            }
          } catch { /* can't read file */ }
        }
      }
    } catch { /* can't read dir */ }
  }

  scanDir(projectDir)
  return findings
}

/** 检测项 7：端口暴露 — Medium */
function detectPortExposure(projectDir?: string): Finding[] {
  const findings: Finding[] = []
  if (!projectDir) return findings

  const dockerFiles = ['docker-compose.yml', 'docker-compose.yaml', 'Dockerfile']
  for (const df of dockerFiles) {
    const filePath = join(projectDir, df)
    if (!existsSync(filePath)) continue

    try {
      const content = readFileSync(filePath, 'utf8')
      const matches = content.match(/0\.0\.0\.0:\d+/g)
      if (matches) {
        findings.push({
          id: nextId('port-exposure'),
          domain: 'security',
          severity: 'medium',
          title: '端口暴露',
          description: `${df} 中端口绑定到 0.0.0.0，对外暴露服务。`,
          impact: {
            riskLevel: '中',
            exposureScope: '网络端口',
          },
          rootCause: ['端口绑定 0.0.0.0 而非 127.0.0.1'],
          fix: [{
            action: '将端口绑定改为 127.0.0.1',
            effort: '改配置',
            expectedEffect: '仅允许本地访问',
          }],
          evidence: {
            file: df,
            bindings: matches,
          },
        })
      }
    } catch { /* can't read file */ }
  }

  return findings
}

/** 检测项 8：权限过宽 — Medium */
function detectOverPermission(projectDir?: string): Finding[] {
  const findings: Finding[] = []
  if (!projectDir) return findings

  // Check agent config files
  const configPaths = [
    join(projectDir, '.claude', 'settings.json'),
    join(projectDir, 'CLAUDE.md'),
    join(projectDir, 'AGENTS.md'),
  ]

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue

    try {
      const content = readFileSync(configPath, 'utf8')
      if (/sandbox.*off|sandbox.*disable|allow.*all|permission.*\*/i.test(content)) {
        findings.push({
          id: nextId('over-permission'),
          domain: 'security',
          severity: 'medium',
          title: '权限过宽',
          description: `配置文件中存在过宽的权限设置。`,
          impact: {
            riskLevel: '中',
            exposureScope: 'Agent 权限',
          },
          rootCause: ['沙盒或权限配置过于宽泛'],
          fix: [{
            action: '审查并收紧 Agent 权限配置',
            effort: '改配置',
            expectedEffect: '减少权限滥用风险',
          }],
          evidence: {
            filePath: configPath,
          },
        })
      }
    } catch { /* can't read file */ }
  }

  return findings
}

// --- Helper ---

function loadGitignore(dir: string): string[] {
  const gitignorePath = join(dir, '.gitignore')
  if (!existsSync(gitignorePath)) return []
  try {
    return readFileSync(gitignorePath, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
  } catch { return [] }
}

// ============================================================
// Public API
// ============================================================

export function detectSecurityIssues(
  sessions: ParsedSession[],
  projectDir?: string,
): Finding[] {
  findingSeq = 0
  return [
    // Runtime security
    ...detectUntrustedExecution(sessions),   // 1: 执行不可信来源命令
    ...detectSandboxEscape(sessions),        // 2: 沙盒逃逸尝试
    ...detectCredentialExposure(sessions),   // 3: 凭证进入上下文
    ...detectSensitiveOutput(sessions),      // 4: 敏感信息输出
    // Environment security
    ...detectSkillInjection(projectDir),     // 5: Skill/Plugin 注入
    ...detectApiKeyExposure(projectDir),     // 6: API Key 明文暴露
    ...detectPortExposure(projectDir),       // 7: 端口暴露
    ...detectOverPermission(projectDir),     // 8: 权限过宽
  ]
}
