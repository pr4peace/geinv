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

- Work is organised into **batches** — a batch is a group of related items shipped as one branch and one release
- One batch active at a time, one agent edits code at a time
- Keep changes small and reversible within each batch item
- Plan before implementation
- SESSION.md is the single source of truth for current work
- BACKLOG.md is the source of batches and items
- Session files (AGENTS.md, SESSION.md, BACKLOG.md, PROMPTS.md, CLAUDE.md) are committed and pushed at the end of every session — they must always be in sync across devices

---

## Work Intake (BACKLOG.md)

At the start of every session:

1. Claude MUST read BACKLOG.md
2. Select the next unstarted **batch** (in order: A → B → C → D)
3. For each item in the batch, define:
   - a clear goal
   - a step-by-step plan
   - a todo entry
4. The branch name is already defined in BACKLOG.md per batch.
5. **Create the branch immediately** before writing SESSION.md:
   ```bash
   git checkout main
   git pull
   git checkout -b feature/<batch-branch>
   ```
6. Write everything into SESSION.md with the correct branch name in `## Branch`.

Then STOP and wait for Gemini to implement.

If the user provides a specific task:
→ Ignore BACKLOG.md and use the provided task, still scoped tightly.

---

## Agent Roles

### Claude Code — Planner + Integrator (Primary Agent)

Responsibilities:
- Select next batch from BACKLOG.md
- Define goals and plans for all items in the batch
- Maintain system coherence across the codebase
- Refine Gemini output when needed

Rules:
- Always start the workflow
- Do NOT write code during planning phase
- Keep scope to the current batch only
- Prefer simple solutions
- Must update SESSION.md planning sections

---

### Gemini CLI — Builder + Releaser

Responsibilities:
- Implement all items in the current batch
- Apply fixes from Codex review
- Release the batch (merge to main, push, clean up branch)

Rules:
- Follow SESSION.md strictly
- **Before writing any code, confirm you are on the branch named in `## Branch`.** Run `git branch --show-current` and switch if needed.
- **Before starting, post a plain-English summary of every item you will build and wait for user confirmation**
- Implement ONLY items in the current batch — no unrelated refactor
- Keep changes minimal and controlled
- **Verification after completing the full batch:**
  1. `npm run build` — must be clean
  2. `npm test` — all unit tests must pass
- Update SESSION.md after completing the batch

---

### Codex — Reviewer

Responsibilities:
- Review git diff
- Find bugs and risks
- Identify missing tests and edge cases
- Suggest simpler alternatives

Rules:
- Do NOT edit code
- Do NOT change architecture
- Be strict but pragmatic — only flag issues that are demonstrably broken in the actual code
- Verify claims against the real code before raising them. Do NOT flag theoretical edge cases that the existing code already handles correctly
- Do NOT re-raise an issue that was already addressed in a previous round. Check prior Codex Review Notes before writing new ones
- Distinguish severity: mark issues as **blocking** (real bug/security risk) or **minor** (polish/nice-to-have). Do not treat minor issues as blocking
- A maximum of 5 issues per review. Prioritise the most impactful
- May update SESSION.md ONLY in allowed section
- **For every issue raised, include the exact fix** — the specific file path, the exact lines to change, and the replacement code. Vague descriptions like "add scoping" or "validate input" are not acceptable. Gemini must be able to apply the fix without interpretation.

---

## Default Workflow

1. Claude → selects next batch from BACKLOG.md, plans all items, creates branch
2. Gemini → summarises the batch to user, waits for confirmation, then builds all items
3. Codex → reviews the full batch diff
4. Gemini → fixes Codex issues
5. Repeat 3–4 until clean
6. Gemini → releases batch (build + test + merge to main + delete branch + sync session files)
7. Mark batch as done in BACKLOG.md, start next batch

### Safety Mandates
- **Build gate:** Never merge to main without `npm run build` and `npm test` both passing cleanly.
- **Batch branching:** Every batch gets one branch cut from `main`. Branch name is defined in BACKLOG.md. Claude creates it at planning time. Gemini verifies the branch before touching any code.
- **Merge before next batch:** The completed branch must be merged and deleted before starting the next batch.
- **Session file sync:** At the end of every session, all session files (AGENTS.md, SESSION.md, BACKLOG.md, PROMPTS.md, CLAUDE.md) must be committed and pushed. Never leave a session with uncommitted session files.
- **Branch hygiene:** Only two long-lived branches exist at any time: `main` and the current active batch branch. All other branches must be deleted from remote immediately after merging. Never leave stale feature branches on the remote.
- **Vercel deployment:** After every push to `main`, also run `git push origin main:feature/investment-tracker` to trigger the Vercel production deployment.

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
git push origin main:feature/investment-tracker  # triggers Vercel production deployment
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

## Phase
- One of: planning | building | reviewing | releasing
- Claude sets this to 'building' at the end of planning. Gemini sets it to 'reviewing' after completing the batch build. Gemini sets it to 'releasing' after Codex review is clean and all gates pass.

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