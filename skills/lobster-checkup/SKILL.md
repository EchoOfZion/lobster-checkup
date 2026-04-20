---
name: lobster-checkup
description: "龙虾体检 v4 — 给 AI Agent 做全面体检。当用户说 '体检'、'checkup'、'诊断 Agent'、'检查 Agent 健康' 时触发。基于 Session 原始数据检测行为异常、安全风险、Token 浪费，输出量化诊断报告和可执行的优化方案。"
version: "4.0.0"
license: MIT
metadata:
  author: GoPlusSecurity
user-invocable: true
allowed-tools: Bash(cd */lobster-checkup-v4 && npx tsx src/cli/index.ts *)
argument-hint: "[<session-path>|--diff|--export json|--no-upload|doctor --fix]"
---

# 龙虾体检 v4 — Lobster Checkup

AI Agent 健康诊断引擎。解析 Session JSONL，检测四域问题（行为/安全/Token/增强），输出量化报告。

## 执行入口

所有命令在 lobster-checkup-v4 项目根目录执行。

```bash
cd "/Users/mike/Agent Guard/lobster-checkup-v4" && npx tsx src/cli/index.ts $ARGUMENTS
```

## 命令路由

解析 `$ARGUMENTS` 确定子命令：

| 参数 | 功能 |
|------|------|
| _(无参数)_ | 自动发现本机 Session 数据，运行完整体检，生成报告链接 |
| `<path>` | 对指定路径的 Session JSONL 文件运行体检 |
| `--diff` | 与上次体检结果对比，展示分数/问题数/花费变化趋势 |
| `--export json` | 输出完整 JSON 格式报告（适合管道处理） |
| `--no-upload` | 仅本地输出，不上传到 Web |
| `--behavior` | 仅运行行为检测域 |
| `--security` | 仅运行安全检测域 |
| `--cost` | 仅运行 Token 消耗检测域 |
| `--enhance` | 仅生成增强建议 |
| `--schedule weekly` | 配置定期体检（daily/weekly/monthly） |
| `doctor --fix` | 一键修复：将 effort="一键" 的修复方案写入 AGENTS.md |

## 执行流程

### 步骤 1：运行体检

```bash
cd "/Users/mike/Agent Guard/lobster-checkup-v4" && npx tsx src/cli/index.ts $ARGUMENTS
```

脚本自动完成：
1. 发现 Session 文件（三平台自动扫描 + Hermes 远程拉取）
2. 解析为内部数据模型（自动识别 Claude Code / OpenClaw / Hermes 格式）
3. 运行确定性检测（行为 + 安全 + Token）
4. 运行 LLM 辅助检测（如有 `ANTHROPIC_API_KEY`）
5. 生成增强建议
6. 计算域健康度分数（0-100）和龙虾角色评级（A-D）
7. 保存到本地历史（`~/.lobster-checkup/history/`）
8. 上传到 Web 并返回报告链接（除非 `--no-upload`）

### 步骤 2：展示结果

将脚本输出直接展示给用户。报告包含：

1. **龙虾角色评级** — 满血/微胖/亚健康/带病上岗/ICU/标本龙虾（A-D级）
2. **三域健康度** — 行为/安全/Token 各 0-100 分
3. **问题统计** — Critical/High/Medium/Low 各多少个
4. **Token 花销全景** — 必要/可优化/浪费 三分类
5. **Top 3 修复建议** — 按投入产出比排序
6. **每周可省金额** — 全部修复后的预估节省
7. **报告链接** — Web 报告页（如已上传）

### 步骤 3：解读（可选）

如果用户要求解读报告：
- Critical 问题需要立即处理（如工具死循环、沙盒逃逸）
- High 问题建议尽快处理（如编辑损坏、凭证泄露）
- 修复建议按"投入最小、收益最大"排序
- `doctor --fix` 可一键将所有"一键"修复写入 AGENTS.md

## 检测能力

### 行为检测域（16 项）
工具死循环、重复失败、任务偷换、指令漂移、任务中断、误解意图、信息捏造、虚报进度、重复输出、编辑损坏等。

### 安全检测域（8 项）
不可信命令执行、沙盒逃逸、凭证进入上下文、敏感信息输出、Skill 注入、API Key 暴露等。

### Token 消耗检测域（7 项）
总花费趋势、单 turn 异常、模型成本错配、上下文膨胀、心跳成本、runaway turn、每任务成本。

### 增强建议域（10 项）
断路器、工具调用预算、Session 拆分、模型路由、去重输出、错误学习、Skill 推荐等。

## 支持的 Agent 框架

| 框架 | Session 路径 | 格式 |
|------|-------------|------|
| Claude Code | `~/.claude/projects/<id>/*.jsonl` | Anthropic 原生格式（type: user/assistant/summary） |
| OpenClaw | `~/.openclaw/agents/<id>/sessions/*.jsonl` | OpenClaw 格式（type: session/message/model_change） |
| Hermes | `~/.hermes/sessions/*.jsonl`（本地）或远程 SSH 拉取 | OpenAI-style（role: session_meta/user/assistant/tool） |

## 环境变量

| 变量 | 用途 |
|------|------|
| `ANTHROPIC_API_KEY` | LLM 辅助检测（任务偷换/信息捏造/虚报进度等） |
| `LOBSTER_CHECKUP_BASE_URL` | Web 报告 API 地址（默认 localhost:3000） |
| `HERMES_SSH_HOST` | Hermes 远程 SSH 地址（如 `hermes@10.0.0.1`） |
| `HERMES_SSH_KEY` | Hermes SSH 私钥路径 |
| `HERMES_REMOTE_PATH` | Hermes 远程 Session 目录 |

## Hermes 远程配置

Hermes Agent 运行在远程 VM 上，体检工具通过 SSH 自动拉取 Session 数据。
通过环境变量配置：

| 变量 | 用途 | 示例 |
|------|------|------|
| `HERMES_SSH_HOST` | SSH user@host | `hermes@10.0.0.1` |
| `HERMES_SSH_KEY` | SSH 私钥路径 | `~/.ssh/id_hermes` |
| `HERMES_REMOTE_PATH` | 远程 Session 目录（默认 `~/.hermes/sessions`） | |

无参数运行时，如已配置 `HERMES_SSH_HOST`，工具会自动尝试 SSH 连接。未配置或连接失败则跳过（不报错）。

---

*Powered by GoPlus Labs*
