# PROMPTS.md

---

## CLAUDE — START SESSION (BACKLOG → PLAN)

First — sync before anything else:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, SESSION.md, and BACKLOG.md.

You are the primary planner.

First:
- scan BACKLOG.md
- pick ONE high-impact task (prefer High Priority)
- briefly explain why

Then:
- define goal
- create a simple step-by-step plan
- create todos
- propose branch name

Update SESSION.md:
- Current Task
- Goal
- Plan
- Todos
- Next Agent Action → Gemini

Do NOT write code.
Keep scope tight (one task only).

---

## CLAUDE — DIRECT TASK (OVERRIDE BACKLOG)

First — sync before anything else:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md.

You are the primary planner.

Ignore BACKLOG.md.

Task:
[insert task]

Do:
- define goal
- create a simple step-by-step plan
- create todos
- propose branch name

Update SESSION.md:
- Current Task
- Goal
- Plan
- Todos
- Next Agent Action → Gemini

Do NOT write code.
Keep scope tight.

---

## GEMINI — BUILD

First — sync before anything else:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md.

Follow the plan and todos.

Rules:
- implement only current task
- keep changes small
- no unrelated refactor
- preserve architecture

After work, update SESSION.md:
- Work Completed
- Files Changed
- Decisions
- Next Agent Action → Codex

Then — push before closing:
```bash
git add -A && git commit -m "wip: gemini build progress" && git push
```

---

## CODEX — REVIEW

Read CLAUDE.md, AGENTS.md, and SESSION.md.

Review the current git diff.

Find:
- bugs
- unsafe assumptions
- missing tests
- edge cases
- type issues
- production risks

Update SESSION.md:
- ONLY "## Codex Review Notes"
- Replace fully
- Max 5–7 bullets

Do NOT edit code.

---

## GEMINI — FIX CODEX ISSUES

First — sync before anything else:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md.

Fix ONLY issues in "Codex Review Notes".

Rules:
- minimal changes
- no refactor
- preserve structure

After fixing:
- update Work Completed
- update Files Changed
- Next Agent Action → Codex

Then — push before closing:
```bash
git add -A && git commit -m "fix: apply codex review fixes" && git push
```

---

## GEMINI — RELEASE PREPARATION

First — sync before anything else:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md.

You are preparing this feature branch for release.

Run all checks:
```bash
npm run lint
npm run build
npm test
```

Then:
- Confirm all checks pass (stop and report if any fail)
- Summarize what changed (files, behaviour, any new env vars)
- Check if any new Supabase migration files exist in `supabase/migrations/`
- Verify SESSION.md Codex Review Notes has no outstanding **blocking** issues

Propose the release plan:
1. Merge `feature/<branch>` → `main` (no-ff)
2. Apply Supabase migration in SQL Editor (if needed)
3. Vercel auto-deploys on push to main — confirm no manual step needed

Do NOT execute.
Update SESSION.md → Next Agent Action: "Awaiting release approval."
Then push SESSION.md.

---

## GEMINI — EXECUTE RELEASE

Read SESSION.md to confirm the branch name.

Run:
```bash
git checkout main
git pull
git merge --no-ff feature/<branch> -m "feat: merge feature/<branch> into main"
git push origin main
git branch -d feature/<branch>
git push origin --delete feature/<branch>
```

Then:
- Update SESSION.md → Branch: `main`
- Commit and push session files:
```bash
git add AGENTS.md SESSION.md BACKLOG.md PROMPTS.md CLAUDE.md
git commit -m "chore: post-release session sync"
git push
```
- Confirm Vercel deployment triggered (check that push succeeded)
- Report: branch merged, remote branch deleted, session files synced

If a Supabase migration is needed, list the file path and instruct the user to run it manually in the Supabase SQL Editor before confirming deploy success.

---

## CLAUDE — RELEASE PREPARATION

Read CLAUDE.md, AGENTS.md, and SESSION.md.

Prepare this for release.

Do:
- run lint, type-check, tests, build
- summarize what changed
- check if Supabase migration exists

Then propose:
1. GitHub push
2. Supabase (if needed)
3. Vercel deploy

Do NOT execute.
Wait for approval.

---

## APPROVAL PROMPT

Proceed with release.

---

## GEMINI — BROAD FIX (OPTIONAL)

Read CLAUDE.md, AGENTS.md, and SESSION.md.

Apply fixes across relevant files based on Codex review.

Rules:
- only apply listed fixes
- keep changes minimal and consistent
- do not change architecture

Update SESSION.md after work.

---

## GEMINI — QUICK GAP CHECK

Scan the repository and current task.

What am I missing?
List gaps, risks, and edge cases.

Do NOT edit code.

---

## CODEX — STRICT REVIEW (ALT)

Review the current git diff.

Be strict.

Find:
- bugs
- edge cases
- production risks
- type issues
- missing validations

Give concise bullet points only.

Do NOT edit files.

---

## CLAUDE — SIMPLIFY

Review current implementation.

Can this be simpler?

Reduce complexity.
Avoid over-engineering.

---

## ANY AGENT — PRE-CLOSE HANDOFF

Prepare for session handoff.

Do:
- Update SESSION.md with "Work Completed", "Files Changed", and "Next Steps".
- Ensure all feature changes are committed and pushed to the current branch.
- **Commit and push session files** (AGENTS.md, SESSION.md, BACKLOG.md, PROMPTS.md) even if only SESSION.md changed — this keeps both devices (MacBook Pro and Mac Mini) in sync.
- Check if the current feature branch meets the Stability Gate in AGENTS.md. If yes, propose merging to `main`.
- Save core context to project memory.
- Provide a summary and a "Resume Prompt" for the next session.

---

## ANY AGENT — CONTINUE SESSION (CROSS-DEVICE)

Read CLAUDE.md, AGENTS.md, SESSION.md, and BACKLOG.md.

Resume the session based on the "Handoff State" in SESSION.md.

Do:
- Run `git pull` first to ensure you have the latest session files.
- Verify current branch matches `## Branch` in SESSION.md. If not, run `git checkout <branch>`.
- Check "Next Steps" and "Next Agent Action" in SESSION.md.
- Summarize the current state in 1-2 sentences.

Then:
- Proceed with the Next Agent Action.

---

## CLAUDE — RESUME SESSION (PLANNER)

Read CLAUDE.md, AGENTS.md, and SESSION.md.

Resume as primary planner.

Do:
- Review current state and "Handoff State".
- Propose the next clean step or select a task from BACKLOG.md.
- Update Plan and Todos in SESSION.md.

Then STOP and wait for implementation.

---

## IDEA CAPTURE

This sounds like a new task.

Do you want me to add it to BACKLOG.md?

---

## MANUAL BACKLOG ADD (TERMINAL)

echo "- [ ] new task" >> BACKLOG.md

---