# PROMPTS.md

Copy-paste prompts for each agent. Use in order: Claude plans → Gemini builds → Codex reviews → Gemini fixes → Gemini releases.

---

## CLAUDE — START SESSION

First — sync:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, SESSION.md, and BACKLOG.md.

You are the primary planner. Pick ONE high-impact task from BACKLOG.md (prefer High Priority), explain why, then:
- Define goal
- Create step-by-step plan
- Create todos
- Propose branch name and create it

Update SESSION.md with Current Task, Goal, Plan, Todos, Next Agent Action → Gemini.

Do NOT write code. Keep scope tight (one task only).

---

## CLAUDE — DIRECT TASK

First — sync:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md. Ignore BACKLOG.md.

Task: [insert task]

Define goal, step-by-step plan, todos, branch name. Update SESSION.md. Do NOT write code.

---

## CLAUDE — RESUME SESSION

First — sync:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md. Review current state. Propose next clean step or select from BACKLOG.md. Update Plan and Todos in SESSION.md. Then STOP and wait.

---

## GEMINI — BUILD

First — sync:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md.

**Before writing any code — post a summary to the user:**
- Which task you are working on
- Which files you will create or modify
- What each change does in one line
- Any migrations or manual steps the user needs to do

Wait for the user to confirm before proceeding.

Rules:
- Implement only the current task
- Keep changes small, no unrelated refactor
- Preserve architecture

After work, update SESSION.md (Work Completed, Files Changed, Decisions, Next Agent Action → Codex). Then push:
```bash
git add -A && git commit -m "wip: gemini build progress" && git push
```

---

## GEMINI — FIX CODEX ISSUES

First — sync:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md. Fix ONLY the issues listed in "Codex Review Notes". Minimal changes, no refactor, preserve structure.

Update SESSION.md (Work Completed, Files Changed, Next Agent Action → Codex). Then push:
```bash
git add -A && git commit -m "fix: apply codex review fixes" && git push
```

---

## CODEX — REVIEW

Read CLAUDE.md, AGENTS.md, and SESSION.md. Review the current git diff.

Find: bugs, unsafe assumptions, missing tests, edge cases, type issues, production risks.

Update SESSION.md — ONLY "## Codex Review Notes", replace fully, max 5 bullets. Mark each as **blocking** or **minor**. Do NOT edit code.

---

## GEMINI — RELEASE PREPARATION

First — sync:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md. Run all checks:
```bash
npm run lint
npm run build
npm test
```

Confirm all pass. Summarize what changed. Check for new Supabase migrations in `supabase/migrations/`. Verify no blocking Codex issues.

Propose release plan:
1. Merge `feature/<branch>` → `main` (no-ff)
2. Apply Supabase migration in SQL Editor (if needed — list the file)
3. Vercel auto-deploys on push to main

Do NOT execute. Update SESSION.md → Next Agent Action: "Awaiting release approval." Push SESSION.md.

---

## GEMINI — EXECUTE RELEASE

Read SESSION.md for the branch name. Run:
```bash
git checkout main && git pull
git merge --no-ff feature/<branch> -m "feat: merge feature/<branch> into main"
git push origin main
git branch -d feature/<branch>
git push origin --delete feature/<branch>
```

Then sync session files:
```bash
git add AGENTS.md SESSION.md BACKLOG.md PROMPTS.md CLAUDE.md
git commit -m "chore: post-release session sync"
git push
```

Report: branch merged, remote deleted, Vercel deploy triggered. If a migration is needed, list the file and instruct the user to run it in Supabase SQL Editor.

---

## ANY AGENT — CONTINUE SESSION (CROSS-DEVICE)

```bash
git pull
```

Read CLAUDE.md, AGENTS.md, SESSION.md, and BACKLOG.md. Verify current branch matches `## Branch` in SESSION.md (switch if not). Check Next Agent Action. Summarize state in 1–2 sentences. Proceed.

---

## ANY AGENT — PRE-CLOSE HANDOFF

- Update SESSION.md: Work Completed, Files Changed, Next Steps
- Commit and push all changes including session files (AGENTS.md, SESSION.md, BACKLOG.md, PROMPTS.md, CLAUDE.md)
- Check if Stability Gate in AGENTS.md is met — if yes, propose merging to `main`
- Provide a one-paragraph summary and a copy-paste Resume Prompt for the next session
