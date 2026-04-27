# SESSION

## Branch
- main

## Phase
- pre-launch

## Active Batch
- Pre-Launch Finalisation

## Items
- [ ] **Final Codex review** — full review of all code on `main`
- [ ] **Data wipe** — delete all test data (agreements, investors, payout_schedule, reminders) via Supabase dashboard
- [ ] **Vercel production branch → main** — Settings → Git → Production Branch → `main`
- [ ] Delete stale remote branches: `origin/feature/investment-tracker`, `origin/feature/sidebar-collapse`
- [ ] Remove `git push origin main:feature/investment-tracker` lines from AGENTS.md and PROMPTS.md

## Work Completed
- Batch C.1 merged to main. Build + 45 tests pass.
- Extraction fixes, sign-out, Apple-style sidebar toggle, dashboard full-width layout all in.

## Files Changed
- See `git log` on main.

## Codex Review Notes
- TBD — awaiting full final review.

## Decisions
- Pre-launch = final code review + data wipe before real team use begins.

## Next Agent Action
- Codex: do a full review of all changed files across Batch C and C.1. Flag anything blocking for production use.
