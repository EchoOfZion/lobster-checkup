# Skill-First Agent Checkup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a skill-first local agent detector where `skills/lobster-checkup/SKILL.md` triggers a deterministic CLI engine that auto-discovers Claude Code, OpenClaw, and Hermes sessions.

**Architecture:** The skill is the user entrypoint. The CLI is a local execution engine with source discovery, parser normalization, deterministic detectors, JSON/HTML reporters, and local history. Old Web, Redis, LLM, schedule, and auto-fix paths are removed from the MVP build path.

**Tech Stack:** TypeScript, Node.js built-in `node:test`, `tsx`, plain filesystem APIs, static HTML generation.

---

## File Structure

- Create `src/core/types.ts`: shared source, session, turn, finding, and report types.
- Create `src/core/fingerprint.ts`: stable finding fingerprint helper.
- Create `src/sources/claude-code.ts`: Claude Code session discovery.
- Create `src/sources/openclaw.ts`: OpenClaw local store discovery.
- Create `src/sources/hermes.ts`: Hermes JSONL discovery.
- Create `src/sources/path.ts`: explicit file/directory discovery.
- Create `src/sources/index.ts`: source orchestration and filtering.
- Replace `src/parsers/*`: normalize supported transcript formats into `NormalizedSession`.
- Replace `src/detectors/*`: deterministic MVP detectors only.
- Create `src/reporters/json.ts`, `src/reporters/html.ts`, `src/reporters/terminal.ts`: report output.
- Replace `src/cli/index.ts`: skill-friendly CLI with `--format json` stdout discipline.
- Replace `skills/lobster-checkup/SKILL.md`: concise skill workflow.
- Create `test/fixtures/*`: representative transcripts and stores.
- Create `test/*.test.ts`: fixture-driven source, parser, detector, CLI tests.
- Modify `package.json`: CLI-only scripts and `node --import tsx --test`.
- Modify `tsconfig.cli.json`: ESM-compatible CLI build.

## Task 1: CLI Project Baseline

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.cli.json`
- Test: command verification

- [ ] **Step 1: Update scripts for CLI MVP**

Set scripts to:

```json
{
  "scripts": {
    "build": "npm run build:cli",
    "build:cli": "tsc -p tsconfig.cli.json",
    "lint": "eslint src test skills --ext .ts,.tsx,.md",
    "test": "node --import tsx --test \"test/**/*.test.ts\"",
    "checkup": "tsx src/cli/index.ts"
  }
}
```

- [ ] **Step 2: Remove runtime deps not used by MVP**

Keep only dependencies needed by the CLI. Move or remove Next, React, Redis, and Tailwind from MVP dependencies.

- [ ] **Step 3: Make CLI build ESM-compatible**

Set `tsconfig.cli.json` module options to allow `import.meta` or remove `import.meta` from CLI code. Prefer:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

- [ ] **Step 4: Run baseline commands**

Run:

```bash
npm test
npm run build
```

Expected before implementation: tests may report no tests or fail because files are missing. TypeScript should guide remaining missing imports after later tasks.

## Task 2: Core Types and Fingerprints

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/fingerprint.ts`
- Test: `test/fingerprint.test.ts`

- [ ] **Step 1: Write failing fingerprint test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { findingFingerprint } from '../src/core/fingerprint'

test('findingFingerprint is stable for equivalent values', () => {
  const first = findingFingerprint({
    source: 'claude-code',
    sessionId: 'abc',
    detector: 'tool-loop',
    turnIndex: 2,
    title: 'Tool loop',
    evidence: { toolCount: 21, toolNames: ['Bash', 'Read'] },
  })

  const second = findingFingerprint({
    source: 'claude-code',
    sessionId: 'abc',
    detector: 'tool-loop',
    turnIndex: 2,
    title: 'Tool loop',
    evidence: { toolNames: ['Bash', 'Read'], toolCount: 21 },
  })

  assert.equal(first, second)
  assert.match(first, /^tool-loop:[a-f0-9]{16}$/)
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- test/fingerprint.test.ts
```

Expected: FAIL because `src/core/fingerprint.ts` does not exist.

- [ ] **Step 3: Implement types and fingerprint**

Create `src/core/types.ts` with `SessionCandidate`, `NormalizedSession`, `NormalizedTurn`, `ToolCall`, `Finding`, `CheckupReport`, and source/severity unions.

Create `src/core/fingerprint.ts` using `node:crypto` SHA-256 over canonicalized JSON. Sort object keys recursively.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- test/fingerprint.test.ts
```

Expected: PASS.

## Task 3: Source Discovery

**Files:**
- Create: `src/sources/*.ts`
- Test: `test/sources.test.ts`
- Fixtures: `test/fixtures/sources/...`

- [ ] **Step 1: Write fixture tests**

Test that:

- Claude Code discovery maps a cwd to encoded project directory.
- OpenClaw discovery reads `sessions.json` and resolves transcript files.
- Hermes discovery reads `sessions/*.jsonl`.
- Explicit path discovery accepts one file or all JSONL files in a directory.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- test/sources.test.ts
```

Expected: FAIL because source modules do not exist.

- [ ] **Step 3: Implement source modules**

Implement pure functions that accept explicit roots for testing:

```ts
discoverClaudeCodeSessions({ cwd, homeDir, days })
discoverOpenClawSessions({ homeDir, days })
discoverHermesSessions({ homeDir, days })
discoverPathSessions({ path })
discoverSessions(options)
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- test/sources.test.ts
```

Expected: PASS.

## Task 4: Parser Normalization

**Files:**
- Replace: `src/parsers/types.ts`
- Replace: `src/parsers/claude-code.ts`
- Replace: `src/parsers/openclaw.ts`
- Replace: `src/parsers/hermes.ts`
- Replace: `src/parsers/index.ts`
- Test: `test/parsers.test.ts`

- [ ] **Step 1: Write parser tests**

Use fixtures for one normal Claude Code turn, one OpenClaw turn, and one Hermes turn. Assert normalized session id, source, turn count, text content, tool calls, tool results, stop reason, and usage.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- test/parsers.test.ts
```

Expected: FAIL until parser modules match the new model.

- [ ] **Step 3: Implement parser normalization**

Implement format detection and parsing into `NormalizedSession`. Keep parser behavior deterministic and tolerant of malformed JSONL lines.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- test/parsers.test.ts
```

Expected: PASS.

## Task 5: Deterministic Detectors

**Files:**
- Replace: `src/detectors/behavior.ts`
- Replace: `src/detectors/security.ts`
- Replace: `src/detectors/token.ts`
- Create: `src/detectors/index.ts`
- Test: `test/detectors.test.ts`

- [ ] **Step 1: Write detector tests**

Tests cover:

- Tool loop critical at >20 calls.
- Repeated failure high at two equivalent failed calls.
- No final reply high when tool calls happen and no text is produced.
- Sensitive file read high for `.env`.
- Sensitive output high without leaking the actual secret in evidence.
- Token waste high when one turn is more than 50% of known cost.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- test/detectors.test.ts
```

Expected: FAIL until detectors are implemented.

- [ ] **Step 3: Implement MVP detectors**

Implement `runDetectors(sessions)` returning stable-fingerprint findings. Remove old scoring, enhancement, and LLM-dependent detector paths from the MVP API.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- test/detectors.test.ts
```

Expected: PASS.

## Task 6: Reports and History

**Files:**
- Create: `src/reporters/json.ts`
- Create: `src/reporters/html.ts`
- Create: `src/reporters/terminal.ts`
- Replace: `src/lib/history.ts`
- Test: `test/reporters.test.ts`

- [ ] **Step 1: Write reporter tests**

Assert JSON report includes metadata, discovery diagnostics, sessions, findings, and summary counts. Assert HTML report includes escaped finding text and recommendations.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- test/reporters.test.ts
```

Expected: FAIL until reporters are implemented.

- [ ] **Step 3: Implement reporters**

Generate:

- `.lobster-checkup/reports/<timestamp>/report.json`
- `.lobster-checkup/reports/<timestamp>/report.html`

Terminal reporter writes human output to stderr when `--format json` is used.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- test/reporters.test.ts
```

Expected: PASS.

## Task 7: Skill-Friendly CLI

**Files:**
- Replace: `src/cli/index.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Write CLI smoke tests**

Test `--path <fixture-dir> --format json` prints valid JSON to stdout, writes reports, and sends progress logs to stderr.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- test/cli.test.ts
```

Expected: FAIL until CLI is implemented.

- [ ] **Step 3: Implement CLI**

Support:

```bash
lobster-checkup
lobster-checkup --format json
lobster-checkup --path <file-or-dir>
lobster-checkup --source claude-code|openclaw|hermes
lobster-checkup --days 14
lobster-checkup diff
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- test/cli.test.ts
```

Expected: PASS.

## Task 8: Rewrite the Skill

**Files:**
- Replace: `skills/lobster-checkup/SKILL.md`
- Optional create: `skills/lobster-checkup/agents/openai.yaml`

- [ ] **Step 1: Rewrite SKILL.md**

The skill must say:

- Trigger on detection/checkup language.
- Run `npx tsx src/cli/index.ts --format json`.
- Do not ask for session paths unless user supplied one.
- Do not upload.
- Do not auto-edit config.
- Summarize JSON findings with evidence and recommendations.

- [ ] **Step 2: Validate concise trigger metadata**

Confirm frontmatter description contains "检测", "体检", "checkup", "Claude Code", "OpenClaw", "Hermes", and "自动发现".

## Task 9: Remove Old Build Blockers

**Files:**
- Delete or exclude: `src/app/**`
- Delete or exclude: `src/components/**`
- Delete or exclude: `src/llm/**`
- Delete or exclude: `src/lib/redis.ts`
- Delete or exclude: old unused commands

- [ ] **Step 1: Remove MVP-unused imports and files from build path**

Either delete old Next/LLM/Web files or move them outside `src` so CLI lint/typecheck does not include them.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass.

## Task 10: Final Manual Check

**Files:**
- None unless fixes are needed.

- [ ] **Step 1: Run current-project detection**

Run:

```bash
npm run checkup -- --format json
```

Expected: valid JSON. It may report no OpenClaw/Hermes sessions if absent, but it should not crash.

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional source, test, skill, and docs changes. Do not include unrelated `lobster-checkup-PRD-v4.md` or generated `dist/`.

---

## Self-Review

Spec coverage:

- Skill-first trigger: Task 8.
- Automatic source discovery: Task 3.
- Deterministic parsing and detectors: Tasks 4 and 5.
- Local JSON/HTML reports: Task 6.
- Skill-friendly JSON stdout: Task 7.
- Removing old Web/LLM/doctor paths from MVP build: Tasks 1 and 9.
- Verification: Task 10.

Placeholder scan: no TBD/TODO/implement-later placeholders are included.

Type consistency: all tasks use `SessionCandidate`, `NormalizedSession`, `Finding`, and `CheckupReport` from `src/core/types.ts`.
