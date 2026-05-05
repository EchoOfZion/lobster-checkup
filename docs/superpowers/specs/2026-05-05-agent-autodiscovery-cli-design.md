# Agent Autodiscovery CLI Redesign

## Goal

Rebuild Lobster Checkup as a CLI-first local diagnostic tool that users can run without knowing where their agent sessions live.

The default experience is:

```bash
lobster-checkup
```

The tool discovers recent local agent sessions, runs evidence-backed deterministic checks, and writes a terminal summary plus local report files.

## Non-Goals

The MVP will not include:

- Web upload or shared report links.
- Redis storage.
- Next.js report app.
- LLM-assisted judgment.
- Cron scheduling.
- Automatic edits to `AGENTS.md`, `CLAUDE.md`, or other config files.
- Personality roles, mascot grading, or product recommendations.

These are outside the MVP and require a separate design once the diagnostic core is trusted.

## Product Principles

1. No manual session hunting.
   Users should not need to know JSONL paths. `--path` remains only as a debug and support escape hatch.

2. Evidence before advice.
   Every finding must include the source session, turn, detector name, confidence, and evidence excerpt or metric.

3. Deterministic first.
   The MVP reports only issues detected through reproducible rules. No LLM claims, inferred intent, or speculative diagnosis.

4. Local by default.
   Reports stay on disk unless a future explicit upload feature is added.

5. Small enough to verify.
   The first version should pass typecheck, lint, and focused fixture tests for every supported source and detector.

## Supported Sources

### Claude Code

Claude Code stores transcripts under `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.

Discovery rules:

- Encode the current working directory by replacing non-alphanumeric characters with `-`.
- Read JSONL files from that project directory.
- Also support `CLAUDE_CONFIG_DIR` when set.
- Default time window: last 7 days by file mtime or session timestamp.

### OpenClaw

OpenClaw session state may be local or on a gateway host. The local source supports the common on-disk layout:

- Store index: `~/.openclaw/agents/<agentId>/sessions/sessions.json`
- Transcript: `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`

Discovery rules:

- Prefer `openclaw sessions --all-agents --json` when the command exists and succeeds.
- Fall back to scanning `~/.openclaw/agents/*/sessions/sessions.json`.
- Resolve transcript paths from `sessionId` fields when available.
- If only remote gateway sessions are available, report that remote discovery is not implemented in MVP instead of silently producing an empty checkup.

### Hermes Agent

Hermes stores session metadata and transcript data in:

- Metadata: `~/.hermes/state.db`
- Transcripts: `~/.hermes/sessions/*.jsonl`

Discovery rules:

- MVP reads JSONL transcripts from `~/.hermes/sessions/`.
- If `state.db` exists, use it only for metadata when easy to query without adding native dependencies.
- If SQLite access would require a native package, defer database integration and continue with JSONL discovery.

## CLI Contract

```bash
lobster-checkup
lobster-checkup --source claude-code
lobster-checkup --source openclaw
lobster-checkup --source hermes
lobster-checkup --days 14
lobster-checkup --path <file-or-dir>
lobster-checkup --format json
lobster-checkup diff
```

Default behavior:

- Source: all supported local sources.
- Scope: current project when the source can map sessions to a project; otherwise recent local sessions.
- Window: 7 days.
- Output directory: `.lobster-checkup/reports/<timestamp>/`.

Generated files:

- `report.json`
- `report.html`

Terminal output:

- Sessions scanned.
- Problems found by severity.
- Top actionable fixes.
- Report file paths.

## Internal Data Model

### Session Source

```ts
interface SessionCandidate {
  source: 'claude-code' | 'openclaw' | 'hermes' | 'path'
  id: string
  transcriptPath: string
  projectPath?: string
  agentId?: string
  startedAt?: string
  updatedAt?: string
}
```

### Normalized Session

```ts
interface NormalizedSession {
  source: SessionCandidate['source']
  id: string
  transcriptPath: string
  projectPath?: string
  startedAt?: string
  endedAt?: string
  turns: NormalizedTurn[]
  usage: {
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
}
```

### Finding

```ts
interface Finding {
  fingerprint: string
  detector: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  evidence: Record<string, string | number | boolean | string[]>
  location?: {
    source: string
    sessionId: string
    transcriptPath: string
    turnIndex?: number
  }
  recommendation: {
    action: string
    rationale: string
  }
}
```

Fingerprints must be stable across runs. They are derived from source, session id, detector id, turn index, title, and key evidence values.

## MVP Detectors

### Tool Loop

Flags a turn with excessive tool calls.

Rule:

- Critical: more than 20 tool calls in one turn.
- High: more than 10 tool calls in one turn.

Evidence:

- Tool count.
- First five tool names.
- Final stop reason.

### Repeated Failure

Flags repeated failed attempts with the same tool and equivalent input.

Rule:

- High: same tool plus normalized args fails at least twice in a turn.

Evidence:

- Tool name.
- Failure count.
- Error excerpt.

### No Final Reply

Flags a turn that performs tool calls and ends without user-visible assistant text.

Rule:

- High when final assistant message has no text and final stop reason is terminal.

Evidence:

- Tool count.
- Stop reason.

### Sensitive File Read

Flags reads of sensitive paths.

Rule:

- High for `.env`, `.ssh`, credentials, secrets, `.npmrc`, `.pypirc`, cloud credential paths.

Evidence:

- Tool name.
- Redacted path.

### Sensitive Output

Flags assistant output containing likely API keys or tokens.

Rule:

- High for known token patterns.
- Evidence must not include the actual secret.

Evidence:

- Secret type.
- Message location.

### Token Waste

Flags expensive turns only when cost data exists.

Rule:

- Medium when one turn is more than 25% of known total cost.
- High when one turn is more than 50% of known total cost.

Evidence:

- Turn cost.
- Percent of known total.

## Reports

### JSON

The JSON report is the source of truth. It contains:

- Metadata.
- Source discovery diagnostics.
- Sessions scanned.
- Findings.
- Summary counts.

### HTML

The HTML report is a static file generated from JSON. It uses inline CSS and no server. It prioritizes:

- Scan summary.
- Findings grouped by severity.
- Evidence blocks.
- Recommendations.

## Testing Strategy

Use fixture-driven tests.

Required fixtures:

- Claude Code JSONL with one normal turn.
- Claude Code JSONL with a tool loop.
- OpenClaw store plus transcript.
- Hermes JSONL transcript.
- Sensitive file read.
- Sensitive output.
- Repeated failure.

Required test levels:

- Source discovery tests.
- Parser normalization tests.
- Detector tests.
- CLI smoke test writing `report.json` and `report.html`.

## Migration Plan

Keep useful existing concepts, but reduce surface area:

- Reuse existing parser knowledge where it is correct.
- Replace incrementing finding ids with stable fingerprints.
- Replace current scoring and lobster role system with plain severity counts.
- Remove web storage and Next.js app from the MVP path.

The existing Next.js files can remain temporarily if deleting them would distract from the CLI rewrite, but they must not be part of the build or documented MVP.

## Acceptance Criteria

The MVP is complete when:

- `npm run lint` passes.
- `npm run build:cli` passes.
- `npm test` passes.
- `lobster-checkup` discovers current Claude Code sessions without a `--path`.
- `lobster-checkup --path <fixture-dir>` writes local JSON and HTML reports.
- Every reported issue has stable fingerprint, evidence, location, and recommendation.
- Running `lobster-checkup diff` compares the two latest local reports using fingerprints.
