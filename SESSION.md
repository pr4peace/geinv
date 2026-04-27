# SESSION

## Branch
- feature/wave-2-calendar

## Current Task
- Batch B — Calendar & Reminders. Fix calendar data bugs and rebuild with react-big-calendar.

## Status
- Task 0 (E2E removal) code is done on `feature/wave-2-remove-e2e` — **needs release to main first**
- Batch A (Auth & Access) is next after Batch B per BACKLOG.md order — but Calendar is already in progress on this branch, so finish B first
- This branch was created by Gemini; Task 0 release is a prerequisite

---

## PENDING — Release Task 0 first

```bash
git checkout main && git pull
git merge --no-ff feature/wave-2-remove-e2e -m "chore: remove E2E tests"
git push origin main
git branch -d feature/wave-2-remove-e2e
git push origin --delete feature/wave-2-remove-e2e
git checkout feature/wave-2-calendar
```

---

## BATCH B — Calendar & Reminders (branch: feature/wave-2-calendar)

### Item 1 — Fix calendar data bugs (`src/app/(app)/calendar/page.tsx`)
1. **Phantom events** — `.eq('agreement.status', 'active')` silently ignored on aliased Supabase join. Fix: fetch active non-draft agreement IDs first, filter payout rows with `.in('agreement_id', ids)`.
2. **Draft payouts showing** — exclude `is_draft = true` agreements from all calendar queries.
3. **Cumulative double-count** — skip payout events where `payout_frequency = 'cumulative'` (maturity event covers it).

### Item 2 — Rebuild CalendarGrid with react-big-calendar (`src/components/calendar/CalendarGrid.tsx`)
- Replace custom monthly-only grid with `react-big-calendar` (already in `package.json`)
- Views: Month, Week, Agenda
- Map events to `{ title, start, end, resource }`
- Dark slate theme — override react-big-calendar CSS to match `bg-slate-950` UI
- Keep colour coding: amber=pending, red=overdue, green=paid, orange=maturity
- Keep click-to-agreement navigation

### Item 3 — Fix reminders wrong dates (`src/lib/reminders.ts`, `src/lib/reminders-monthly-summary.ts`)
- Investigate why reminders are only being set for due dates
- Check monthly summary trigger logic — ensure it fires on the 1st of each month correctly
- Fix any off-by-one or timezone issues found

### Item 4 — Weekly reminder cron (`vercel.json`)
- Add a Monday 8am IST cron entry that triggers `POST /api/reminders/summary`
- 8am IST = 2:30am UTC → `"30 2 * * 1"`

### Verification
- `npm run build` — clean
- `npm test` — no regressions

### Release
```bash
git checkout main && git pull
git merge --no-ff feature/wave-2-calendar -m "feat: calendar rebuild + reminder fixes"
git push origin main
git branch -d feature/wave-2-calendar
git push origin --delete feature/wave-2-calendar
git add AGENTS.md SESSION.md BACKLOG.md PROMPTS.md CLAUDE.md
git commit -m "chore: post-batch-b sync"
git push
```

---

## Todos
- [x] Task 0: E2E removal code complete
- [ ] Task 0: release `feature/wave-2-remove-e2e` → main
- [ ] Batch B Item 1: fix 3 calendar data bugs
- [ ] Batch B Item 2: rebuild CalendarGrid with react-big-calendar
- [ ] Batch B Item 3: fix reminders wrong dates
- [ ] Batch B Item 4: add Monday morning cron to vercel.json
- [ ] Batch B: build + test clean, release to main
- [ ] Batch A: Google login + RBAC (`feature/batch-a-auth`)
- [ ] Batch C: Multiple payments + cumulative TDS (`feature/batch-c-agreement-data`)
- [ ] Batch D: Dashboard + polish (`feature/batch-d-dashboard`)

## Work Completed
- Task 0: E2E tests removed from codebase. Build and unit tests pass.

## Files Changed
- `e2e/` (deleted — on feature/wave-2-remove-e2e)
- `playwright.config.ts` (deleted — on feature/wave-2-remove-e2e)
- `package.json` (on feature/wave-2-remove-e2e)
- `AGENTS.md`, `CLAUDE.md` (on feature/wave-2-remove-e2e)

## Decisions
- Batches group related items into one branch + one release for faster shipping
- Calendar branch already created by Gemini — finishing Batch B before Batch A
- `npm run build` + `npm test` is the only gate (E2E removed)
- Google OAuth configured in Supabase on 2026-04-27 — Gemini must verify before building Batch A

## Codex Review Notes
-

## Next Agent Action
- Gemini: (1) Release `feature/wave-2-remove-e2e` → main first. (2) Stay on `feature/wave-2-calendar`. (3) Work through Batch B items 1–4. (4) Build + test. (5) Release Batch B to main.
