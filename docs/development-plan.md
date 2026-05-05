# Lobster Checkup Development Plan

## Purpose

Lobster Checkup should become a local-first personal agent health check system. Its job is not to count every bad-looking event. Its job is to help a person understand whether their agent usage is safe, focused, verifiable, and improving over time.

The product direction is:

- Read recent local agent sessions automatically.
- Produce a small number of evidence-backed issues.
- Separate deterministic evidence from model judgment.
- Use LLM self-review only as an optional second pass.
- Keep raw logs local and redacted before any model review.

## Current Baseline

Implemented:

- CLI-first local checkup engine.
- Skill-first workflow through `skills/lobster-checkup/SKILL.md`.
- Auto-discovery for Codex, Claude Code, OpenClaw, Docker OpenClaw, Hermes, and explicit paths.
- Deterministic findings:
  - Sensitive file access.
  - Sensitive output.
  - Repeated failed tool calls.
  - No final user-visible reply after tools.
  - Tool volume as supporting evidence, not a standalone top issue.
  - Token/cost concentration.
- GStack-style evaluation:
  - Safety.
  - Process.
  - Outcome.
  - Overall status and score.
  - Top issues.
- Optional self-review:
  - `--review llm`
  - `--review-provider local`
  - `--review-provider codex`
  - Evidence gate for LLM judgments.
  - Redacted review packet.
- Session replay diagnosis:
  - `diagnoses` report field.
  - "Sessions worth reviewing" in terminal and HTML reports.
- Trend report:
  - `--trend`
  - Local report history reader.
  - Backward-compatible handling for legacy reports.
- Personal policy config:
  - `.lobster-checkup.json`
  - `--config <path>`
  - Configurable sensitive path patterns.
  - Configurable verification command patterns.
  - Configurable review provider default.

## Product Principles

1. **Evidence before judgment**
   Every issue must trace back to deterministic evidence or a gated LLM judgment with evidence references.

2. **Few actionable issues**
   The default report should not show hundreds of repeated findings. It should show the highest-value problems and keep raw evidence in JSON.

3. **Complex work is allowed**
   Many tool calls, high token usage, or long sessions are not automatically bad. They become concerning when paired with no progress, repeated failure, missing verification, or no final conclusion.

4. **Local-first privacy**
   Raw transcripts stay local. Review packets must be redacted. Model-based review is explicit, not silent.

5. **Personal improvement over audit theater**
   The system should help the user improve their agent setup, skills, prompts, and habits.

## Roadmap

### Phase 1: Session Replay Diagnosis

Goal: make each high-risk session explainable.

Status: implemented as an MVP.

Build:

- A session-level diagnosis object:
  - User goal summary.
  - What the agent attempted.
  - Key failure or risk points.
  - Verification evidence.
  - Final user-facing result.
  - Suggested next action.
- `--session <id>` or report links that focus on one session.
- HTML section for "Sessions worth reviewing".

Acceptance:

- A user can open a report and identify the 3 most important sessions to review.
- Each selected session explains why it matters without exposing raw secrets.

### Phase 2: Trend Report

Goal: turn checkup from a snapshot into a personal health trend.

Status: implemented as an MVP.

Build:

- Report history reader for `.lobster-checkup/reports/**/report.json`.
- Compare current 7 days with previous 7 days.
- Trend metrics:
  - Safety issue rate.
  - Repeated-failure rate.
  - Verification evidence rate.
  - Skill-trigger rate.
  - Tool-control breakdown rate.
  - LLM review risk count.
- Terminal and HTML trend section.

Acceptance:

- `npm run checkup -- --trend` shows whether behavior improved, regressed, or stayed flat.
- Trend output includes only aggregate metrics, not transcript content.

### Phase 3: Personal Policy Config

Goal: let each user define what healthy agent behavior means for their workflows.

Status: implemented as an MVP.

Build:

- `.lobster-checkup.yml` or `.lobster-checkup.json`.
- Configurable policy:
  - Sensitive path patterns.
  - Required verification commands by project type.
  - Required skills by user intent.
  - Allowed high-tool-count task categories.
  - Provider preference for review.
  - Whether to retain raw findings in HTML.
- Policy loader with defaults.

Acceptance:

- Running checkup without config behaves as today.
- Adding config changes evaluation without code edits.
- Invalid config produces a clear error with line/key context.

### Phase 4: Stronger Outcome Evaluation

Goal: judge whether the agent solved the user's real problem, not just whether it behaved cleanly.

Build:

- Goal extraction from user turns.
- Final-answer classification:
  - Completed with evidence.
  - Completed without evidence.
  - Blocked and honestly reported.
  - Blocked but overclaimed.
  - No conclusion.
- Optional Codex/Claude/OpenClaw reviewer for goal-outcome matching.
- Evidence gate remains mandatory.

Acceptance:

- Report can distinguish "expensive but successful" from "expensive and unresolved".
- Outcome score is not driven by tool count alone.

### Phase 5: Provider System

Goal: support multiple self-review providers safely.

Build:

- Provider interface:
  - `local`
  - `codex`
  - `claude`
  - `openclaw`
- Provider capability detection.
- Provider timeout and fallback policy.
- JSON schema enforcement for provider output.
- Provider-specific docs.

Acceptance:

- `--review-provider codex` works when Codex CLI is available.
- Missing or failing provider falls back cleanly and records `providerError`.
- Provider output cannot bypass the evidence gate.

### Phase 6: Privacy Hardening

Goal: make reports safe to keep and share selectively.

Build:

- `--no-raw-findings`
- `--redact-paths`
- `--no-transcript-paths`
- `--report-level summary|standard|audit`
- Review packet export for inspection.
- Secret pattern expansion and tests.

Acceptance:

- Summary report can be shared without local paths or transcript details.
- Audit report retains full local evidence for private debugging.

### Phase 7: Agent Setup Recommendations

Goal: recommend concrete changes to the user's agent environment.

Build:

- Suggested skill additions.
- Suggested `AGENTS.md` rules.
- Suggested end-of-turn checklist.
- Suggested command allow/deny policy.
- Suggested verification commands per repo.

Acceptance:

- Report includes a "Recommended setup changes" section.
- Each recommendation references the issue it addresses.
- The tool never edits config files automatically.

## Near-Term Implementation Order

1. Strengthen outcome evaluation.
2. Expand self-review providers.
3. Harden privacy/export modes.
4. Generate setup recommendations.
5. Improve session replay diagnosis with deeper LLM-backed goal/result matching.
6. Refine trend windows and retention policy.
7. Add validation and examples for personal policy config.

## Non-Goals

- Do not upload raw transcripts.
- Do not silently call external models.
- Do not claim the agent is "good" just because no deterministic issue was found.
- Do not make tool count alone a health failure.
- Do not auto-edit user configuration or secrets.

## Open Questions

- Should report history be stored as immutable snapshots or compacted summaries?
- Should session replay diagnosis be generated by deterministic heuristics first, LLM second, or both?
- What is the right default retention policy for `.lobster-checkup/reports`?
- Should personal policy live in the repository, user home, or both?
- Should OpenClaw provider review use `openclaw agent` or Gateway directly?
