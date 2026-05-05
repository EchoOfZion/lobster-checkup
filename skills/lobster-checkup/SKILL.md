---
name: lobster-checkup
description: "检测 / 体检 AI Agent。Use when the user asks to check, diagnose, audit, or run a checkup on Codex, Claude Code, OpenClaw, Docker OpenClaw, Hermes, or local agent sessions. Automatically discovers recent sessions and reports a GStack-style Safety, Process, and Outcome evaluation with deterministic evidence."
version: "1.0.0"
license: MIT
user-invocable: true
argument-hint: "[--source claude-code|openclaw|hermes] [--days N] [--path file-or-dir]"
---

# Lobster Checkup

Run a local deterministic health check on recent agent sessions. The user should not need to know where session files live.

The report leads with a GStack-style evaluation:

- Safety: secret handling, sensitive file access, and credential exposure.
- Process: skill usage, planning, tool-loop control, and strategy changes after failure.
- Outcome: user-visible conclusion, verification evidence, and unfinished-work signals.

## Default workflow

1. Run the detector from the repository root:

```bash
npx tsx src/cli/index.ts --format json
```

2. If the user names a framework, pass `--source`:

```bash
npx tsx src/cli/index.ts --format json --source codex
npx tsx src/cli/index.ts --format json --source claude-code
npx tsx src/cli/index.ts --format json --source openclaw
npx tsx src/cli/index.ts --format json --source docker-openclaw
npx tsx src/cli/index.ts --format json --source hermes
```

3. If the user explicitly gives a file or directory, pass `--path`:

```bash
npx tsx src/cli/index.ts --format json --path "<file-or-dir>"
```

4. If the user asks for trend/history, pass `--trend`:

```bash
npx tsx src/cli/index.ts --format json --trend
```

5. If the user provides a personal policy config, pass `--config`:

```bash
npx tsx src/cli/index.ts --format json --config "<config-path>"
```

6. Summarize the JSON report for the user.

7. If the user asks for model-based self-review, keep it explicit:

```bash
npx tsx src/cli/index.ts --review llm --review-provider codex
```

Use `--review-provider local` for a deterministic fallback. Do not run the Codex provider silently; it may invoke the user's configured model.

## Response format

Report only what the detector can support with evidence:

- Sessions scanned and sources checked.
- Overall status and Safety / Process / Outcome scores.
- Top issues first. Keep this list short and action-oriented.
- Sessions worth reviewing from the `diagnoses` field.
- Trend direction when the `trend` field is present.
- Optional self-review summary when the `review` field is present. Mention the provider name and only include judgments with evidence references.
- Raw finding counts as supporting context, not the main answer.
- Local report paths from the `output` field.

If there are no findings, say that no deterministic issues were found in the scanned sessions. Do not claim the agent is perfect.

## Safety rules

- Do not ask the user for session paths unless automatic discovery found nothing or the user already supplied a path.
- Do not upload reports or session contents.
- Do not auto-edit `AGENTS.md`, `CLAUDE.md`, `.env`, or any configuration files.
- Do not reveal secrets found by the detector. Use the redacted evidence only.
- Do not invent LLM-based conclusions; this MVP is deterministic only.

## Supported local sources

- Claude Code: `~/.claude/projects/<encoded-cwd>/*.jsonl`
- Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl`
- OpenClaw: `~/.openclaw/agents/*/sessions/sessions.json` plus transcript JSONL
- Docker OpenClaw: OpenClaw containers with host bind mounts exposing `.openclaw`
- Hermes: `~/.hermes/sessions/*.jsonl`
