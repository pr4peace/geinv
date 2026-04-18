# Playwright E2E Test Suite

**Date:** 2026-04-18
**Status:** In Progress
**Target:** https://geinv.vercel.app (production)

## Context

Good Earth Investment Tracker is a Next.js + Supabase app. Auth is Supabase email/password. The app is deployed on Vercel. We need E2E tests to verify all key pages and the three features just shipped:
- Maturing (90 days) KPI card on dashboard
- Frequency Breakdown panel on dashboard
- Calendar reminder events (blue)

Test credentials go in `.env.test` (gitignored). The env var names are `E2E_USER_EMAIL` and `E2E_USER_PASSWORD`. Irene's email is `irene@goodearth.com`.

## Tech Stack

- Playwright (`@playwright/test`)
- Tests live in `e2e/` at project root
- Auth: log in via the `/login` page UI, save `storageState` in `playwright/.auth/user.json`
- All tests use the saved auth state (no re-login per test)

## File Structure

```
e2e/
  auth.setup.ts          # global setup: log in, save storageState
  dashboard.spec.ts      # dashboard page tests
  calendar.spec.ts       # calendar page tests
  agreements.spec.ts     # agreements list + detail tests
  investors.spec.ts      # investors page tests
playwright.config.ts
.env.test                # E2E_USER_EMAIL, E2E_USER_PASSWORD (gitignored)
```

## Tasks

### Task 1: Install Playwright and configure

Install `@playwright/test`, create `playwright.config.ts` targeting `https://geinv.vercel.app`. Create `e2e/auth.setup.ts` that navigates to `/login`, fills email + password from env vars `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`, clicks the sign-in button, waits for redirect to `/dashboard`, then saves `storageState` to `playwright/.auth/user.json`. All other test files should use this saved auth state via `storageState` in the config. Add `.env.test` to `.gitignore`. Create `playwright/.auth/` directory (gitignored). Add `"test:e2e": "playwright test"` to package.json scripts.

**Deliverable:** `playwright.config.ts`, `e2e/auth.setup.ts`, gitignore updates, package.json script update. `npx playwright test --list` should show auth setup project.

---

### Task 2: Dashboard tests

File: `e2e/dashboard.spec.ts`

Use saved auth state. Navigate to `/dashboard`. Assert:

1. **All 7 KPI cards** are visible by label text:
   - "Active Principal"
   - "Active Agreements"
   - "Quarter Gross Interest"
   - "Quarter TDS"
   - "Quarter Net Outflow"
   - "Overdue Payouts"
   - "Maturing (90 days)" ← the newly added card

2. **Frequency Breakdown panel** — assert all three labels are visible: "Quarterly", "Annual", "Cumulative"

3. **Forecast panel** — assert the section heading contains "Q" (quarter label like "Q1-2026-27")

4. **Upcoming Payouts** — assert the section heading "Upcoming Payouts" is visible (or "No payouts" if empty)

5. **Agreements table** — assert the table is visible with at least one column header ("Investor" or "Principal")

**Deliverable:** `e2e/dashboard.spec.ts` with all 5 assertions passing.

---

### Task 3: Calendar tests

File: `e2e/calendar.spec.ts`

Use saved auth state. Navigate to `/calendar`. Assert:

1. **Calendar header** shows the current month name (e.g. "April 2026")
2. **Navigation buttons** "← Prev" and "Next →" are visible
3. **Legend items** — all 5 legend entries are visible by label:
   - "Payout due (pending/notified)"
   - "Payout overdue"
   - "Payout paid"
   - "Maturity date"
   - "Reminder scheduled" ← newly added blue entry
4. **Day cells** — the grid renders at least 28 cells (one per day)
5. **Month navigation** — click "Next →", assert month label changes to the next month name

**Deliverable:** `e2e/calendar.spec.ts` with all 5 assertions passing.

---

### Task 4: Agreements and investors page tests

File: `e2e/agreements.spec.ts` and `e2e/investors.spec.ts`

**Agreements list** (`/agreements`):
1. Page heading "Agreements" is visible
2. A table or list renders with at least one row (assume at least one agreement exists in production)
3. Filter dropdowns are visible (look for "Status" or "Frequency" filter elements)
4. "New Agreement" or "Add" button is visible

**Agreement detail** (navigate from list to first agreement):
1. Click the first agreement row/link
2. Assert the URL changes to `/agreements/[id]`
3. Assert "Payout Schedule" section is visible
4. Assert "Reminder History" section is visible

**Investors** (`/investors`):
1. Page heading "Investors" is visible
2. A table renders with at least one row
3. CSV download button is visible

**Deliverable:** Both spec files with all assertions passing.

---

### Task 5: Run full suite and fix failures

Run `npx playwright test` against production. Review results. Fix any test failures due to:
- Selector mismatches (update selectors to match actual rendered HTML)
- Timing issues (add appropriate waits)
- Empty data (skip or conditionally assert if no data exists in production)

**Deliverable:** All tests green. Output of `npx playwright test` with no failures.
