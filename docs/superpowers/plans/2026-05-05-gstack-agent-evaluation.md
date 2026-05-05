# GStack Agent Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw finding counts as the primary output with a GStack-style Safety, Process, and Outcome evaluation that surfaces a small set of actionable issues.

**Architecture:** Keep deterministic findings as evidence, then add an evaluation layer that aggregates those findings and session signals into dimensions, scores, overall status, and top issues. Reporters should lead with the evaluation and retain raw findings as supporting data.

**Tech Stack:** TypeScript, Node test runner, existing CLI/reporters.

---

### Task 1: Evaluation Types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add evaluation types**

Add `EvaluationDimension`, `EvaluationIssue`, `EvaluationSummary`, and attach `evaluation` to `CheckupReport`.

- [ ] **Step 2: Run typecheck**

Run: `npm run build`
Expected: Type errors in report creation until evaluation is wired.

### Task 2: Evaluation Aggregator

**Files:**
- Create: `src/evaluation/index.ts`
- Test: `test/evaluation.test.ts`

- [ ] **Step 1: Write failing tests**

Cover score calculation, top issue aggregation, skill/checkup process detection, and verification/outcome signals.

- [ ] **Step 2: Implement aggregator**

Export `evaluateReportInputs(sessions, findings)` that returns dimensions, top issues, and overall status.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: evaluation tests pass with the existing detector tests.

### Task 3: CLI Wiring

**Files:**
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Attach evaluation to reports**

Call `evaluateReportInputs(parsedSessions, findings)` before writing JSON/HTML/terminal reports.

- [ ] **Step 2: Run CLI test**

Run: `npm test`
Expected: CLI JSON report includes `evaluation`.

### Task 4: Reporters Lead With Evaluation

**Files:**
- Modify: `src/reporters/terminal.ts`
- Modify: `src/reporters/html.ts`
- Modify: `src/reporters/json.ts` if needed
- Test: `test/reporters.test.ts`

- [ ] **Step 1: Update terminal output**

Print overall status, dimension scores, and top issues before raw finding counts.

- [ ] **Step 2: Update HTML output**

Add an evaluation section before findings.

- [ ] **Step 3: Run reporter tests**

Run: `npm test`
Expected: terminal/html include evaluation fields.

### Task 5: Final Verification

**Files:**
- No code changes.

- [ ] **Step 1: Run full verification**

Run:
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run checkup`

Expected:
- Tests pass.
- Lint exits 0.
- Build exits 0.
- Checkup scans local sessions and prints evaluation before finding counts.
