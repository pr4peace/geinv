# SESSION

## Branch
- main

## Current Task
- Batch B complete. Next: Batch A — Google login + RBAC.

## Goal
- Batch B (Calendar & Reminders) is complete and released. Next is Batch A.

---

## PENDING — Release Task 0 first (if not done)

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

### ✅ Item 1 — Fix calendar data bugs (`src/app/(app)/calendar/page.tsx`)
DONE. All 3 bugs fixed:
1. Phantom events — fetch active non-draft IDs first, filter with `.in('agreement_id', ids)`
2. Draft payouts — `.eq('is_draft', false)` on agreement query
3. Cumulative double-count — skip payout events where `payout_frequency === 'cumulative'`

### ✅ Item 2 — Rebuild CalendarGrid (`src/components/calendar/CalendarGrid.tsx`)
DONE. `react-big-calendar` with Month/Week/Agenda views, dark slate theme, colour coding, click-to-agreement navigation.

### Item 3 — Fix reminders wrong dates

**Root cause:** `REMINDER_CONFIG.payout = [0]` in `src/lib/reminders.ts:19` — only day-of reminders generated for payouts. Fix: change to `[7, 0]` to add a 7-day advance reminder.

**Monthly summary trigger:** verified correct — fires on UTC day 1 at 2am UTC = 7:30am IST, idempotent, no timezone issues.

**Steps:**
1. Create `src/__tests__/reminders.test.ts` with tests for `generatePayoutReminders` (see plan doc)
2. Run tests — confirm they fail on `REMINDER_CONFIG.payout` assertion
3. Change `REMINDER_CONFIG.payout` from `[0]` to `[7, 0]` in `src/lib/reminders.ts:19`
4. Run tests — confirm all 6 pass
5. Run `npm test` — confirm no regressions
6. Commit: `feat: add 7-day advance payout reminder (lead_days=[7,0])`

**Test file to create** (`src/__tests__/reminders.test.ts`):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.useFakeTimers()
vi.setSystemTime(new Date('2026-04-27T00:00:00.000Z'))

import { generatePayoutReminders, REMINDER_CONFIG } from '@/lib/reminders'
import type { Agreement, PayoutSchedule } from '@/types/database'

const BASE_AGREEMENT: Agreement = {
  id: 'agr-1', reference_id: 'GE-2026-001', agreement_date: '2026-01-01',
  investment_start_date: '2026-01-01', agreement_type: 'Fixed Deposit',
  document_url: null, is_draft: false, status: 'active',
  investor_name: 'Test Investor', investor_pan: null, investor_aadhaar: null,
  investor_address: null, investor_relationship: null, investor_parent_name: null,
  nominees: [], principal_amount: 100000, roi_percentage: 12,
  payout_frequency: 'quarterly', interest_type: 'simple', lock_in_years: 1,
  maturity_date: '2027-01-01', payment_date: null, payment_mode: null,
  payment_bank: null, salesperson_id: null, salesperson_custom: null,
  tds_filing_name: null, doc_status: 'draft', doc_sent_to_client_date: null,
  doc_returned_date: null, doc_return_reminder_days: 14, investor_id: null,
  investor_birth_year: null, investor2_name: null, investor2_pan: null,
  investor2_aadhaar: null, investor2_address: null, investor2_birth_year: null,
  deleted_at: null, created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const FUTURE_PAYOUT: PayoutSchedule = {
  id: 'pay-1', agreement_id: 'agr-1', period_from: '2026-04-01',
  period_to: '2026-06-30', no_of_days: 91,
  due_by: '2026-07-01', // 65 days ahead — both 7-day and day-of generate
  gross_interest: 3000, tds_amount: 300, net_interest: 2700,
  is_principal_repayment: false, status: 'pending',
  paid_date: null, created_at: '2026-01-01T00:00:00.000Z',
}

const NEAR_PAYOUT: PayoutSchedule = {
  ...FUTURE_PAYOUT, id: 'pay-near',
  due_by: '2026-05-01', // 4 days ahead — 7-day reminder would be in the past, only day-of generates
}

const PAST_PAYOUT: PayoutSchedule = {
  ...FUTURE_PAYOUT, id: 'pay-past', due_by: '2026-04-01',
}

describe('generatePayoutReminders', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-27T00:00:00.000Z'))
  })

  it('REMINDER_CONFIG.payout includes both 7-day and day-of lead times', () => {
    expect(REMINDER_CONFIG.payout).toEqual([7, 0])
  })

  it('generates both 7-day and day-of reminders for a far-future payout', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, FUTURE_PAYOUT, 'coord@example.com', null)
    expect(reminders).toHaveLength(2)
    expect(reminders.map(r => r.lead_days).sort()).toEqual([0, 7])
  })

  it('includes salesperson in email_to when provided', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, FUTURE_PAYOUT, 'coord@example.com', 'sales@example.com')
    for (const r of reminders) {
      expect(r.email_to).toContain('coord@example.com')
      expect(r.email_to).toContain('sales@example.com')
    }
  })

  it('skips 7-day reminder when it falls in the past (payout 4 days away)', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, NEAR_PAYOUT, 'coord@example.com', null)
    expect(reminders).toHaveLength(1)
    expect(reminders[0].lead_days).toBe(0)
  })

  it('generates no reminders for a past payout', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, PAST_PAYOUT, 'coord@example.com', null)
    expect(reminders).toHaveLength(0)
  })

  it('returns empty array when emailTo list is empty', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, FUTURE_PAYOUT, '', null)
    expect(reminders).toHaveLength(0)
  })
})
```

### Item 4 — Weekly reminder cron

**Two changes:**
1. Add GET handler to `src/app/api/reminders/summary/route.ts` (Vercel cron is GET-only)
2. Add Monday 8am IST cron to `vercel.json`

**Steps:**
1. In `src/app/api/reminders/summary/route.ts`:
   - Add `NextRequest` to the import
   - Extract the existing POST body into a `sendReminderSummary()` async helper that returns `{ success: boolean, sentTo: string[] }` and throws on error
   - Replace the existing POST handler to call the helper
   - Add a new GET handler that checks `request.headers.get('x-vercel-cron') === '1'` (returns 401 if not), then calls `sendReminderSummary()`
   - Keep all existing `buildSummaryEmail`, `sectionBlock`, `td`, `tdMono`, `tableHead` helpers unchanged

2. In `vercel.json`, add a second cron entry:
   ```json
   {
     "path": "/api/reminders/summary",
     "schedule": "30 2 * * 1"
   }
   ```
   `30 2 * * 1` = 2:30am UTC every Monday = 8:00am IST every Monday.

3. Run `npm run build` — must be clean
4. Run `npm test` — must pass
5. Commit: `feat: add weekly Monday cron for reminder summary email`

---

## Todos
- [x] Task 0: E2E removal code complete
- [x] Task 0: release `feature/wave-2-remove-e2e` → main (if not done yet)
- [x] Batch B Item 1: fix 3 calendar data bugs
- [x] Batch B Item 2: rebuild CalendarGrid with react-big-calendar
- [x] Batch B Item 3: add 7-day advance payout reminder + tests
- [x] Batch B Item 4: add GET handler to summary route + Monday cron to vercel.json
- [x] Batch B: build + test clean, release to main
- [ ] Batch A: Google login + RBAC (`feature/batch-a-auth`)
- [ ] Batch C: Multiple payments + cumulative TDS (`feature/batch-c-agreement-data`)
- [ ] Batch D: Dashboard + polish (`feature/batch-d-dashboard`)

## Work Completed
- Task 0: E2E tests removed from codebase.
- Batch B Item 1: Calendar data bugs fixed (phantom payouts, draft filtering, cumulative skip).
- Batch B Item 2: CalendarGrid rebuilt with react-big-calendar (Month/Week/Agenda, dark theme).
- Batch B Item 3: Added 7-day advance payout reminder. Created `src/__tests__/reminders.test.ts` to verify.
- Batch B Item 4: Refactored `src/app/api/reminders/summary/route.ts` to support GET requests for cron jobs. Added weekly Monday cron to `vercel.json`.
- Fixed ESLint and TypeScript errors in `src/components/calendar/CalendarGrid.tsx` that were blocking the production build.

## Files Changed
- `e2e/` (deleted — on feature/wave-2-remove-e2e)
- `playwright.config.ts` (deleted — on feature/wave-2-remove-e2e)
- `package.json` (on feature/wave-2-remove-e2e)
- `src/app/(app)/calendar/page.tsx` ✅
- `src/components/calendar/CalendarGrid.tsx` ✅
- `src/__tests__/reminders.test.ts` ✅
- `src/lib/reminders.ts` ✅
- `src/app/api/reminders/summary/route.ts` ✅
- `vercel.json` ✅

## Decisions
- Batches group related items into one branch + one release for faster shipping
- Calendar branch already created by Gemini — finishing Batch B before Batch A
- `npm run build` + `npm test` is the only gate (E2E removed)
- Google OAuth configured in Supabase on 2026-04-27 — Gemini must verify before building Batch A
- Payout reminder config changed from `[0]` → `[7, 0]` (add 7-day advance reminder; day-of kept for immediacy)
- Monthly summary trigger verified correct: fires at 2am UTC on day 1 = 7:30am IST, idempotent

## Codex Review Notes
-

## Next Agent Action
- Codex: Review the diff for Batch B (feature/wave-2-calendar merged into main).
- Claude: Select Batch A from BACKLOG.md and plan implementation.
