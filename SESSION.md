# SESSION

## Branch
- feature/wave-2-remove-e2e

## Current Task
- Wave 2, Task 0: Release E2E removal to main, then hand off Task D to Gemini on a new branch.

---

## TASK 0 — Remove E2E tests ✅ Code complete, pending release

### Goal
E2E tests run against live prod, require credentials no agent has, and block every release with noise. Remove entirely. Rely on `npm run build` + `npm test` (Vitest) as the only gate.

### Work done on this branch
- Deleted `e2e/` directory and `playwright.config.ts`
- Removed `test:e2e` script and `@playwright/test` from `package.json`
- Updated `AGENTS.md` and `CLAUDE.md` to remove E2E references
- Build and unit tests verified clean

### Release steps (next action)
```bash
git checkout main && git pull
git merge --no-ff feature/wave-2-remove-e2e -m "chore: remove E2E tests — rely on vitest unit tests only"
git push origin main
git branch -d feature/wave-2-remove-e2e
git push origin --delete feature/wave-2-remove-e2e
git add AGENTS.md SESSION.md BACKLOG.md PROMPTS.md CLAUDE.md
git commit -m "chore: post-wave-2-task-0 session sync"
git push
```

---

## TASK D — Calendar rebuild (next, after Task 0 is released)

**Branch to create after release:**
```bash
git checkout main && git pull
git checkout -b feature/wave-2-calendar
```

### Goal
Fix three data bugs and replace the custom monthly-only grid with `react-big-calendar` (already in `package.json`) for month/week/agenda views.

### Bugs to fix in `src/app/(app)/calendar/page.tsx`
1. **Phantom events** — `.eq('agreement.status', 'active')` is silently ignored on aliased Supabase join. Fix: fetch active non-draft agreement IDs first, then use `.in('agreement_id', ids)` to filter payout rows.
2. **Draft payouts** — draft agreements' payout schedules show on calendar. Fix: include only `is_draft = false` agreements.
3. **Cumulative double-count** — cumulative agreements show both a payout event AND a maturity event on the same day. Fix: skip payout events where `payout_frequency = 'cumulative'`.

### Calendar component
- Replace `src/components/calendar/CalendarGrid.tsx` with `react-big-calendar`
- Views: Month, Week, Agenda (no Day view)
- Map `CalendarEvent` to `{ title, start, end, resource }`
- Theme to match dark slate UI
- Keep colour coding: amber=pending, red=overdue, green=paid, orange=maturity
- Keep click-to-agreement navigation

---

## TASK E — Multiple payment entries (after D)

Branch: `feature/wave-2-payments`

Replace `payment_date / payment_mode / payment_bank` with a `payments jsonb` array `[{date, mode, bank, amount}]`.
- Migration: `supabase/migrations/013_multiple_payments.sql` — add `payments jsonb default '[]'`
- Keep old three columns for read backwards compat, stop writing them
- Update `ExtractionReview.tsx`, `ManualAgreementForm.tsx`, `POST /api/agreements`, agreement detail page, and Gemini extraction prompt in `src/lib/claude.ts`
- Migration must be run in Supabase SQL Editor by user

---

## TASK F — Role-based access control (after E)

Branch: `feature/wave-2-rbac`

- `src/middleware.ts`: query `team_members` by email after session check; redirect to `/login?error=access_denied` if not found or inactive
- Login page: show access denied message on `?error=access_denied`
- Agreements page: salespersons see only their agreements
- Settings page: coordinators only

---

## TASK G — Google login (after F)

Branch: `feature/wave-2-google-login`

**Pre-requisite (user confirms before Gemini starts):** Google Cloud Console OAuth 2.0 credentials must be configured in Supabase Authentication → Providers → Google. User confirmed this was done on 2026-04-27 — Gemini must verify the Supabase provider is active before building the button.

- Replace entire email/password form in `src/app/login/page.tsx` with a single "Sign in with Google" button
- Call `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: \`${window.location.origin}/auth/callback\` } })`
- Keep "Good Earth / Investment Tracker" heading, dark slate background

---

## Todos
- [x] Task 0: delete e2e/ + playwright.config.ts + remove from package.json + update AGENTS.md + CLAUDE.md
- [x] Task 0: build + test verified clean
- [ ] Task 0: release to main + sync session files
- [ ] Task D: create feature/wave-2-calendar, fix 3 data bugs, rebuild with react-big-calendar, release
- [ ] Task E: create feature/wave-2-payments, migration + UI changes, release
- [ ] Task F: create feature/wave-2-rbac, middleware + role views, release
- [ ] Task G: create feature/wave-2-google-login, confirm OAuth active, replace login form, release

## Work Completed
- **Task 0:** E2E tests removed. Build and unit tests pass.

## Files Changed
- `e2e/` (deleted)
- `playwright.config.ts` (deleted)
- `package.json`
- `AGENTS.md`
- `CLAUDE.md`

## Decisions
- Each Wave 2 task gets its own branch; SESSION.md `## Branch` shows only the active branch at any time
- PROMPTS.md cleanup (removing duplicates, adding pre-work summary) was a separate approved change committed on this branch — not scope creep
- Google OAuth config is environment state, not repo state — Gemini must verify the provider is enabled before building Task G
- E2E removed permanently; `npm run build` + `npm test` is the gate

## Codex Review Notes
- Resolved: `## Branch` now shows only the active branch
- Resolved: Todos updated to accurately reflect Task 0 status (code done, release pending)
- Resolved: Google OAuth marked as environment-dependent, not "done"
- Resolved: BACKLOG.md Byju entry cleaned up

## Next Agent Action
- Gemini: Release Task 0 to main using the steps above, then create `feature/wave-2-calendar` and start Task D.
