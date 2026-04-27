# Batch B Items 3 & 4 — Reminders Fix + Weekly Cron

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7-day advance payout reminders and a weekly Monday cron that auto-sends the summary email.

**Architecture:** Two targeted changes — (1) expand the payout reminder lead-days config from `[0]` to `[7, 0]` so agreements generate both a 7-day-ahead and a day-of payout reminder; (2) add a GET handler to the existing summary route so Vercel cron can trigger it, then register a Monday 8am IST cron entry.

**Tech Stack:** Next.js 14 App Router, Vercel cron (GET-only), date-fns, Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/reminders.ts` | Modify | Change `REMINDER_CONFIG.payout` from `[0]` to `[7, 0]` |
| `src/__tests__/reminders.test.ts` | Create | Unit tests for `generatePayoutReminders` |
| `src/app/api/reminders/summary/route.ts` | Modify | Extract shared logic; add GET handler with `x-vercel-cron: 1` auth |
| `vercel.json` | Modify | Add Monday 8am IST cron targeting `/api/reminders/summary` |

---

## Task 1: Add 7-day advance payout reminders

### Context

`src/lib/reminders.ts:19` currently has:
```ts
payout: [0],  // day-of reminder only (monthly summary handled separately by cron)
```
This means new agreements only get a payout reminder on the due date itself. Adding `7` gives coordinators a week of advance notice.

`generatePayoutReminders` (line 25) iterates `REMINDER_CONFIG.payout` and calls `subDays(dueDate, leadDays)`. It skips any `scheduledAt` that is in the past (`isBefore(scheduledAt, startOfDay(new Date()))`). So adding `7` is safe — it won't backfill past agreements, only future ones.

**Files:**
- Modify: `src/lib/reminders.ts:19`

- [ ] **Step 1: Write the failing test (new file)**

Create `src/__tests__/reminders.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Lock "today" to 2026-04-27 so lead-day cutoffs are deterministic
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-04-27T00:00:00.000Z'))

import { generatePayoutReminders, REMINDER_CONFIG } from '@/lib/reminders'
import type { Agreement, PayoutSchedule } from '@/types/database'

const BASE_AGREEMENT: Agreement = {
  id: 'agr-1',
  reference_id: 'GE-2026-001',
  agreement_date: '2026-01-01',
  investment_start_date: '2026-01-01',
  agreement_type: 'Fixed Deposit',
  document_url: null,
  is_draft: false,
  status: 'active',
  investor_name: 'Test Investor',
  investor_pan: null,
  investor_aadhaar: null,
  investor_address: null,
  investor_relationship: null,
  investor_parent_name: null,
  nominees: [],
  principal_amount: 100000,
  roi_percentage: 12,
  payout_frequency: 'quarterly',
  interest_type: 'simple',
  lock_in_years: 1,
  maturity_date: '2027-01-01',
  payment_date: null,
  payment_mode: null,
  payment_bank: null,
  salesperson_id: null,
  salesperson_custom: null,
  tds_filing_name: null,
  doc_status: 'draft',
  doc_sent_to_client_date: null,
  doc_returned_date: null,
  doc_return_reminder_days: 14,
  investor_id: null,
  investor_birth_year: null,
  investor2_name: null,
  investor2_pan: null,
  investor2_aadhaar: null,
  investor2_address: null,
  investor2_birth_year: null,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const FUTURE_PAYOUT: PayoutSchedule = {
  id: 'pay-1',
  agreement_id: 'agr-1',
  period_from: '2026-04-01',
  period_to: '2026-06-30',
  no_of_days: 91,
  due_by: '2026-07-01', // 65 days in the future — both 7-day and day-of should generate
  gross_interest: 3000,
  tds_amount: 300,
  net_interest: 2700,
  is_principal_repayment: false,
  status: 'pending',
  paid_date: null,
  created_at: '2026-01-01T00:00:00.000Z',
}

const NEAR_PAYOUT: PayoutSchedule = {
  ...FUTURE_PAYOUT,
  id: 'pay-near',
  due_by: '2026-05-01', // 4 days away — 7-day advance would be in the past, only day-of generates
}

const PAST_PAYOUT: PayoutSchedule = {
  ...FUTURE_PAYOUT,
  id: 'pay-past',
  due_by: '2026-04-01', // in the past — nothing generates
}

describe('generatePayoutReminders', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-27T00:00:00.000Z'))
  })

  it('REMINDER_CONFIG.payout includes both 7-day and day-of lead times', () => {
    expect(REMINDER_CONFIG.payout).toEqual([7, 0])
  })

  it('generates both 7-day and day-of reminders when payout is far in the future', () => {
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

  it('skips the 7-day reminder when it falls in the past (payout is 4 days away)', () => {
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
    // '' is falsy — filtered out — emailTo is empty
    expect(reminders).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/__tests__/reminders.test.ts
```

Expected: FAIL — `expect(REMINDER_CONFIG.payout).toEqual([7, 0])` fails because it is currently `[0]`.

- [ ] **Step 3: Update REMINDER_CONFIG in reminders.ts**

In `src/lib/reminders.ts` line 19, change:
```typescript
  payout: [0],            // day-of reminder only (monthly summary handled separately by cron)
```
to:
```typescript
  payout: [7, 0],         // 7-day advance + day-of (monthly summary also handled by cron)
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/__tests__/reminders.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm test
```

Expected: all tests pass. No other test references `REMINDER_CONFIG.payout` as `[0]`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reminders.ts src/__tests__/reminders.test.ts
git commit -m "feat: add 7-day advance payout reminder (lead_days=[7,0])"
```

---

## Task 2: Add GET handler to summary route + weekly cron

### Context

Vercel cron jobs only issue GET requests. `/api/reminders/summary` currently only has a `POST` handler used by the dashboard "Send Summary" button. To let Vercel's Monday cron trigger it, we need a GET handler that checks `x-vercel-cron: 1`.

The shared logic is identical — send the full Reminder Summary email to all active accountants.

**Files:**
- Modify: `src/app/api/reminders/summary/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Extract shared logic and add GET handler in summary route**

Open `src/app/api/reminders/summary/route.ts`. The file currently imports `NextResponse` but not `NextRequest`. Replace the entire file with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { getPayoutReminders, getMaturingAgreements, getDocsPendingReturn } from '@/lib/dashboard-reminders'
import { format } from 'date-fns'

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

// ... (keep all existing buildSummaryEmail, sectionBlock, td, tdMono, tableHead helpers unchanged) ...

async function sendReminderSummary(): Promise<{ success: boolean; sentTo: string[] }> {
  const supabase = createAdminClient()

  const { data: accountants } = await supabase
    .from('team_members')
    .select('email, name')
    .eq('role', 'accountant')
    .eq('is_active', true)

  if (!accountants?.length) {
    throw new Error('No active accountant found')
  }

  const emailTo = accountants.map((a: { email: string }) => a.email)
  const monthLabel = format(new Date(), 'MMMM yyyy')

  const [payouts, maturing, docs] = await Promise.all([
    getPayoutReminders(),
    getMaturingAgreements(),
    getDocsPendingReturn(),
  ])

  const html = buildSummaryEmail(monthLabel, payouts.overdue, payouts.thisMonth, maturing.agreements, docs)

  const result = await sendEmail({
    to: emailTo,
    subject: `Reminder Summary — ${monthLabel}`,
    html,
  })

  if (!result.success) {
    throw new Error(result.error ?? 'Failed to send email')
  }

  return { success: true, sentTo: emailTo }
}

/** GET — called by Vercel Cron (Monday 8am IST). Checks x-vercel-cron: 1 header. */
export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron')
  if (cronHeader !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendReminderSummary()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** POST — called manually from dashboard "Send Summary" button. No auth required (internal tool). */
export async function POST() {
  try {
    const result = await sendReminderSummary()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal server error'
    const status = msg === 'No active accountant found' ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
```

**Important:** Keep all the existing `buildSummaryEmail`, `sectionBlock`, `td`, `tdMono`, `tableHead` helper functions exactly as they are — only the two exported handlers and the new `sendReminderSummary` helper change.

- [ ] **Step 2: Add the Monday cron to vercel.json**

Replace the contents of `vercel.json` with:

```json
{
  "crons": [
    {
      "path": "/api/reminders/process",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/reminders/summary",
      "schedule": "30 2 * * 1"
    }
  ]
}
```

`"30 2 * * 1"` = 2:30am UTC every Monday = 8:00am IST every Monday.

- [ ] **Step 3: Run build to verify no TypeScript errors**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reminders/summary/route.ts vercel.json
git commit -m "feat: add weekly Monday cron for reminder summary email"
```

---

## Verification Checklist

- [ ] `npm run build` clean
- [ ] `npm test` all green
- [ ] `REMINDER_CONFIG.payout` is `[7, 0]`
- [ ] New agreement creation generates 2 payout reminders per future payout row (7-day + day-of)
- [ ] `/api/reminders/summary` GET returns 401 without `x-vercel-cron: 1`
- [ ] `vercel.json` has two cron entries
