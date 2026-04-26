# AGENTS.md

## Overview

This repository is developed using three agents:

- Claude Code (Primary planner + integrator)
- Gemini CLI (Builder)
- Codex (Reviewer)

All agents must read:

- CLAUDE.md → project knowledge and architecture
- AGENTS.md → system rules (this file)
- SESSION.md → current working state
- BACKLOG.md → list of tasks
- PROMPTS.md → copy-paste prompts for each agent role

---

## Core Principles

- One task at a time
- One agent edits code at a time
- Keep changes small and reversible
- Plan before implementation
- SESSION.md is the single source of truth for current work
- BACKLOG.md is the source of tasks
- Session files (AGENTS.md, SESSION.md, BACKLOG.md, PROMPTS.md) are committed and pushed at the end of every session — they must always be in sync across devices

---

## Work Intake (BACKLOG.md)

At the start of every session:

1. Claude MUST read BACKLOG.md
2. Select ONE task (prefer High Priority)
3. Convert it into:
   - a clear task
   - a goal
   - a step-by-step plan
   - a todo list
4. Propose a descriptive, semantic branch name (e.g., `feature/activity-log-auth` instead of `feature/your-task-name`).
5. **Create the branch immediately** before writing SESSION.md:
   ```bash
   git checkout main
   git pull
   git checkout -b feature/<task-name>
   ```
6. Write everything into SESSION.md with the correct branch name in the `## Branch` field.

Then STOP and wait for implementation.

If the user provides a task explicitly:
→ Ignore BACKLOG.md and use the provided task.

---

## Agent Roles

### Claude Code — Planner + Integrator (Primary Agent)

Responsibilities:
- Select task from BACKLOG.md
- Define goal and plan
- Break work into steps
- Maintain system coherence
- Refine Gemini output
- Prepare release

Rules:
- Always start the workflow
- Do NOT write code during planning phase
- Keep scope tight (one task only)
- Prefer simple solutions
- Do not expand scope unnecessarily
- Must update SESSION.md planning sections

---

### Gemini CLI — Builder

Responsibilities:
- Implement planned tasks
- Build base-layer code
- Apply fixes from Codex review

Rules:
- Follow SESSION.md strictly
- **Before writing any code, confirm you are on the branch named in `## Branch`.** Run `git branch --show-current` and switch if needed.
- Implement ONLY the current task
- Do NOT refactor unrelated code
- Keep changes minimal and controlled
- **Verification order after every implementation:**
  1. `npm run build` — must be clean
  2. `npm test` — all unit tests must pass
  3. `npm run test:e2e` — run Playwright against localhost; all existing tests must pass
- Update SESSION.md after work, including E2E result

---

### Codex — Reviewer

Responsibilities:
- Review git diff
- Find bugs and risks
- Identify missing tests and edge cases
- Suggest simpler alternatives
- **Verify E2E results:** Check SESSION.md Work Completed for Playwright output. If E2E was not run or any test failed, flag it as a **blocking** issue regardless of other findings.

Rules:
- Do NOT edit code
- Do NOT change architecture
- Be strict but pragmatic — only flag issues that are demonstrably broken in the actual code
- Verify claims against the real code before raising them. Do NOT flag theoretical edge cases that the existing code already handles correctly
- Do NOT re-raise an issue that was already addressed in a previous round. Check prior Codex Review Notes before writing new ones
- Distinguish severity: mark issues as **blocking** (real bug/security risk) or **minor** (polish/nice-to-have). Do not treat minor issues as blocking
- A maximum of 5 issues per review. Prioritise the most impactful
- May update SESSION.md ONLY in allowed section

---

## Default Workflow

1. Claude → selects task and plans
2. Gemini → implements base layer
3. Codex → reviews changes
4. Gemini → fixes Codex issues
5. Repeat 3–4 until clean
6. Claude → prepares release
7. User → approves
8. Claude → executes release

### Safety Mandates
- **Post-Build Review:** Never deploy to production (Vercel --prod) without first running a full build (`npm run build`) and having the **Codex** agent review the final state and any build warnings/logs.
- **Semantic Branching:** Propose descriptive, semantic branch names (e.g., `feature/activity-log-auth` instead of `feature/your-task-name`).
- **Branch hygiene:** Every task gets its own branch cut from `main`. Claude creates the branch at planning time. Gemini verifies the branch before touching any code. Work never accumulates on a stale or misnamed branch.
- **Merge before next task:** Before starting a new task, Claude merges the completed branch into `main` and deletes the old branch.
- **Session file sync:** At the end of every session, all four session files (AGENTS.md, SESSION.md, BACKLOG.md, PROMPTS.md) must be committed and pushed — to whichever branch is active. This keeps both devices (MacBook Pro and Mac Mini) in sync. Never leave a session with uncommitted session files.

---

## Stability Gate — When to Merge a Feature Branch to `main`

A feature branch is ready to merge into `main` when ALL of the following are true:

1. **Build passes** — `npm run build` completes with no errors
2. **Tests pass** — `npm test` all green; no regressions
3. **Codex review clean** — no blocking issues outstanding
4. **SESSION.md is up to date** — Work Completed reflects what was actually done
5. **User has approved** — explicit go-ahead from the user (never auto-merge)

When these are met, Claude:
```bash
git checkout main
git pull
git merge --no-ff feature/<task-name> -m "feat: merge feature/<task-name> into main"
git push origin main
git branch -d feature/<task-name>
git push origin --delete feature/<task-name>
```

Then update SESSION.md `## Branch` to `main` and push.

---

## SESSION.md Structure

```md
# SESSION

## Branch
-

## Current Task
-

## Goal
-

## Plan
-

## Todos
-

## Work Completed
-

## Files Changed
-

## Decisions
-

## Codex Review Notes
-

## Next Agent Action
-