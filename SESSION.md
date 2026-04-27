# SESSION

## Branch
- feature/wave-2-remove-e2e  ← start here
- feature/wave-2-calendar     ← after #0 is released
- feature/wave-2-payments     ← after calendar is released
- feature/wave-2-rbac         ← after payments is released
- feature/wave-2-google-login ← after RBAC is released

## Current Task
- Wave 2 — five sequential tasks. Do one, release it, move to the next. Do NOT batch them.

---

## TASK 0 — Remove E2E tests (branch: feature/wave-2-remove-e2e)

### Goal
E2E tests run against live prod, require credentials no agent has, and block every release with noise. Remove entirely. Rely on `npm run build` + `npm test` (Vitest) as the only gate.

### Steps
1. Delete `e2e/` directory entirely
2. Delete `playwright.config.ts`
3. Remove `"test:e2e": "playwright test"` from `package.json` scripts
4. Remove `@playwright/test` from `devDependencies` in `package.json` (keep `dotenv` as it is needed for migration scripts)
5. In `AGENTS.md`: remove all references to `npm run test:e2e` from the Gemini verification steps
6. In `CLAUDE.md`: remove the E2E section that references `.env.test` and Playwright
7. `npm run build` + `npm test` — must be clean
8. Push: `git add -A && git commit -m "chore: remove E2E tests — rely on vitest unit tests only" && git push -u origin feature/wave-2-remove-e2e`

### Release
1. Merge feature/wave-2-remove-e2e → main
2. Sync session files

---

## TASK D — Calendar rebuild (branch: feature/wave-2-calendar)

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
- Replace `src/components/calendar/CalendarGrid.tsx` with a new `react-big-calendar` implementation
- Views: Month, Week, Agenda (no Day view needed)
- Map existing `CalendarEvent` types to react-big-calendar's `Event` format: `{ title, start, end, resource }`
- Theme to match dark slate UI — override react-big-calendar CSS variables or use inline styles
- Keep the existing colour coding: amber=pending, red=overdue, green=paid, orange=maturity
- Keep click-to-agreement navigation
- Import react-big-calendar CSS: `import 'react-big-calendar/lib/css/react-big-calendar.css'` in the component

### Steps
1. Fix the three data bugs in `calendar/page.tsx`
2. Rewrite `CalendarGrid.tsx` using react-big-calendar
3. `npm run build` + `npm test` clean
4. Push and release same pattern as Task 0

---

## TASK E — Multiple payment entries (branch: feature/wave-2-payments)

```bash
git checkout main && git pull
git checkout -b feature/wave-2-payments
```

### Goal
Replace single `payment_date / payment_mode / payment_bank` fields with a JSONB array supporting multiple payment tranches per agreement.

### Steps
1. **Migration** — create `supabase/migrations/013_multiple_payments.sql`:
   ```sql
   alter table agreements add column if not exists payments jsonb default '[]'::jsonb;
   ```
   Keep the old three columns — stop writing them, keep reading them for backwards compat.

2. **Type** — add to `src/types/database.ts`:
   ```ts
   payments: Array<{ date: string; mode: string; bank: string; amount: number }>
   ```

3. **ExtractionReview.tsx** — replace the three single `payment_date / payment_mode / payment_bank` inputs with an add/remove row UI: `[{date, mode, bank, amount}]`. Add a "+ Add payment" button. Remove entries with a trash icon.

4. **ManualAgreementForm.tsx** — same add/remove row UI for payments.

5. **`POST /api/agreements/route.ts`** — include `payments` in the insert payload.

6. **Agreement detail page** — display payments array instead of single fields.

7. **Gemini extraction prompt** (`src/lib/claude.ts`) — update prompt to extract multiple payment rows instead of single `payment_date / payment_mode / payment_bank`.

8. `npm run build` + `npm test` clean. Push and release.

> Note: migration must be run manually in Supabase SQL Editor before or after deploy.

---

## TASK F — Role-based access control (branch: feature/wave-2-rbac)

```bash
git checkout main && git pull
git checkout -b feature/wave-2-rbac
```

### Goal
Block unknown users at the middleware level. Give coordinators, accountants, and salespersons role-appropriate views.

### Steps
1. **`src/middleware.ts`** — after the existing Supabase session check, query `team_members` by `session.user.email`. If no match or `is_active = false`, redirect to `/login?error=access_denied`. Pass role via a response header `x-user-role` for page-level use.

2. **`src/app/login/page.tsx`** — show "You don't have access to this application." message when `?error=access_denied` is in the URL.

3. **Agreements page** — salespersons see only agreements where `salesperson_id` matches their `team_members` ID. Coordinators and accountants see all.

4. **Settings page** — visible to coordinators only. Show "Access denied" for other roles.

5. `npm run build` + `npm test` clean. Push and release.

---

## TASK G — Google login (branch: feature/wave-2-google-login)

```bash
git checkout main && git pull
git checkout -b feature/wave-2-google-login
```

### Goal
Add "Sign in with Google" button to the login page. OAuth callback already exists.

### Pre-requisite — ✅ DONE
Google Cloud Console OAuth 2.0 credentials created and enabled in Supabase. Redirect URI: `https://rzbklsfktktjlzepnunu.supabase.co/auth/v1/callback`

### Steps (Gemini)
1. **`src/app/login/page.tsx`** — **replace the entire email/password form** with a single "Sign in with Google" button. No email input, no password input, no submit button — Google only:
   ```ts
   await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
   ```
2. Style: white card button with Google logo (use an inline SVG or text "G"), centred on the dark slate background. Keep the "Good Earth / Investment Tracker" heading above it.
3. `npm run build` + `npm test` clean. Push and release.

---

## Todos
- [x] Task 0: delete e2e/ + playwright.config.ts + remove from package.json + update AGENTS.md + CLAUDE.md
- [ ] Task 0: build + test + push + release to main
- [ ] Task D: fix 3 calendar data bugs in calendar/page.tsx
- [ ] Task D: rebuild CalendarGrid with react-big-calendar (month/week/agenda)
- [ ] Task D: build + test + push + release to main
- [ ] Task E: migration 013_multiple_payments.sql
- [ ] Task E: update types, ExtractionReview, ManualAgreementForm, API route, detail page, extraction prompt
- [ ] Task E: build + test + push + release to main
- [ ] Task F: middleware role check + access denied redirect
- [ ] Task F: salesperson agreement filter + settings page guard
- [ ] Task F: build + test + push + release to main
- [ ] Task G: confirm Google OAuth config done (user) then add button
- [ ] Task G: build + test + push + release to main

## Work Completed
- **Task 0: Remove E2E tests**
  - Deleted `e2e/` directory and `playwright.config.ts`.
  - Removed `test:e2e` script and `@playwright/test` from `package.json`.
  - Updated `AGENTS.md` and `CLAUDE.md` to remove references to E2E testing.
  - Removed accidentally committed screenshot.
  - Verified clean build and unit tests.

## Files Changed
- `e2e/` (deleted)
- `playwright.config.ts` (deleted)
- `package.json`
- `AGENTS.md`
- `CLAUDE.md`
- `SESSION.md`

## Decisions
- Each task gets its own branch and release — do not batch
- E2E removed permanently; Vitest unit tests + build are the gate
- `payments` JSONB column added; old `payment_date/mode/bank` kept for backwards compat, not written
- RBAC: middleware blocks unknown users; salespersons filtered at query level not UI level
- Google login: code is trivial; Supabase + Google Cloud config must be done by user first
- `dotenv` reinstalled as devDependency as it is needed for migration scripts.

## Codex Review Notes
-

## Next Agent Action
- Gemini: Task 0 code cleanup is complete. Proceed to release Task 0 to main, then start Task D.
