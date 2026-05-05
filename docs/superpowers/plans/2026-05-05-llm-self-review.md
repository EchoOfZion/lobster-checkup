# LLM Self Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `--review llm` second-pass review that uses redacted deterministic evidence as input and requires evidence references for every LLM judgment.

**Architecture:** Keep deterministic detectors as the source of evidence. Add `src/review/` with redacted review packets, a provider interface, a local heuristic provider for tests/MVP behavior, and an evidence gate that discards unreferenced judgments. Wire CLI reports to include `review` only when requested.

**Tech Stack:** TypeScript, Node test runner, existing CLI/reporters.

---

### Task 1: Review Types

**Files:**
- Modify: `src/core/types.ts`
- Test: `test/review.test.ts`

- [ ] **Step 1: Write failing type/API test**

Test that `runSelfReview(report, { mode: 'llm' })` returns goal, progress, verification, truthfulness, and recommendations with `evidenceRefs`.

- [ ] **Step 2: Add core review types**

Add `ReviewMode`, `ReviewJudgment`, `ReviewResult`, and optional `review` on `CheckupReport`.

### Task 2: Redacted Evidence Packet And Evidence Gate

**Files:**
- Create: `src/review/index.ts`
- Test: `test/review.test.ts`

- [ ] **Step 1: Write failing tests**

Test that sensitive paths/secrets do not enter review packets and judgments without known evidence refs are dropped.

- [ ] **Step 2: Implement minimal review pipeline**

Build evidence IDs from findings and top issues. Redact JSON payloads before provider review. Filter provider judgments by known evidence IDs.

### Task 3: CLI Flag And Reporters

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/reporters/terminal.ts`
- Modify: `src/reporters/html.ts`
- Test: `test/cli.test.ts`
- Test: `test/reporters.test.ts`

- [ ] **Step 1: Write failing CLI/report tests**

Test `--review llm --format json` includes `review` and default checkup does not.

- [ ] **Step 2: Wire review into CLI**

Parse `--review llm`; run `runSelfReview` after evaluation.

- [ ] **Step 3: Render review summary**

Terminal/HTML should show review status and evidence-backed judgments after top issues.

### Task 4: Verification

**Files:**
- No code changes.

- [ ] **Step 1: Run full verification**

Run:
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run checkup`
- `npm run checkup -- --review llm --format json`

Expected:
- Tests pass.
- Lint exits 0.
- Build exits 0.
- Default checkup has no `review`.
- `--review llm` report includes evidence-backed review only.
