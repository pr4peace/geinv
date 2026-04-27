> Claude Code does not need prompts here — standing instructions live in CLAUDE.md.

# PROMPTS.md

Copy-paste prompts for each agent. Workflow: Claude plans batch → Gemini builds all items in batch → Codex reviews → Gemini fixes → Gemini releases batch.

---

## GEMINI — BUILD

First — sync:
```bash
git pull
```

Read CLAUDE.md, AGENTS.md, and SESSION.md.

**Before writing any code — post a summary to the user:**
- Which batch you are working on
- All items in the batch and what each does
- Which files you will create or modify per item
- Any migrations or manual steps the user needs to do

Wait for the user to confirm before proceeding.

Work through ALL items in the current batch in sequence. Do not stop between items — complete the full batch, then update SESSION.md and push.

Rules:
- Implement only items in the current batch
- Keep changes small, no unrelated refactor
- Preserve architecture

After completing the full batch, update SESSION.md (Work Completed, Files Changed, Decisions, Next Agent Action → Codex). Then push:
```bash
git add -A && git commit -m "feat: [batch name] — all items complete" && git push
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

## GEMINI — RELEASE BATCH

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

Confirm all pass. Summarize what changed across all batch items. Check for new Supabase migrations in `supabase/migrations/` — list any that need to be run. Verify no blocking Codex issues.

Then execute the release:
```bash
git checkout main && git pull
git merge --no-ff feature/<batch-branch> -m "feat: <batch name>"
git push origin main
git push origin main:feature/investment-tracker  # triggers Vercel production deployment
git branch -d feature/<batch-branch>
git push origin --delete feature/<batch-branch>
```

Then sync session files and update BACKLOG.md to mark the batch as done:
```bash
git add AGENTS.md SESSION.md BACKLOG.md PROMPTS.md CLAUDE.md
git commit -m "chore: post-release sync — <batch name>"
git push
```

If a migration is needed, list the file path and ask the user to run it in Supabase SQL Editor before confirming deploy success.

---

## ANY AGENT — CONTINUE SESSION (CROSS-DEVICE)

```bash
git pull
```

Read CLAUDE.md, AGENTS.md, SESSION.md, and BACKLOG.md. Verify current branch matches `## Branch` in SESSION.md (switch if not). Check Next Agent Action. Summarize batch status in 1–2 sentences. Proceed.

---

## ANY AGENT — PRE-CLOSE HANDOFF

- Update SESSION.md: Work Completed, Files Changed, which batch items are done vs pending
- Commit and push all changes including session files (AGENTS.md, SESSION.md, BACKLOG.md, PROMPTS.md, CLAUDE.md)
- If all batch items are done and build/tests pass, propose releasing the batch
- Provide a one-paragraph summary and a copy-paste Resume Prompt for the next session
