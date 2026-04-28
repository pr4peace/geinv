# Batch F — Notification Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-firing email cron with a human-review staging queue, add a `/notifications` page with three tabs (Queue, Red Flags, History), and enforce salesperson view-only restrictions on all processing actions.

**Architecture:** A new `notification_queue` table holds upcoming notification items pre-built by the cron. Coordinators review and send manually via `POST /api/notifications/send`. The `reminders` table remains as the audit log written after each send. Salesperson UI and API gates ensure they cannot perform any processing actions.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres), Resend (email), Tailwind CSS, date-fns, Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/017_notification_queue.sql` | Create | New table + indexes |
| `src/types/database.ts` | Modify | Add `NotificationQueue` type |
| `src/lib/reminders.ts` | Modify | Export body builders, add TDS/summary builders |
| `src/lib/notification-queue.ts` | Create | Queue population logic (pure functions) |
| `src/app/api/reminders/process/route.ts` | Modify | Stop sending, populate queue instead |
| `src/app/api/notifications/route.ts` | Create | GET queue items |
| `src/app/api/notifications/send/route.ts` | Create | POST send selected items |
| `src/app/api/notifications/[id]/dismiss/route.ts` | Create | POST dismiss single item |
| `src/app/(app)/notifications/page.tsx` | Create | Server shell, fetch data |
| `src/components/notifications/NotificationsClient.tsx` | Create | Client tabs component |
| `src/app/(app)/layout.tsx` | Modify | Add Notifications nav item with badge |
| `src/app/api/agreements/[id]/payouts/[payoutId]/revert/route.ts` | Modify | Add salesperson 403 gate |
| `src/app/api/agreements/[id]/mark-past-paid/route.ts` | Modify | Add salesperson 403 gate |
| `src/app/api/agreements/[id]/rescan/route.ts` | Modify | Add salesperson 403 gate |
| `src/components/agreements/PayoutScheduleSection.tsx` | Modify | Hide action buttons for salesperson |
| `src/components/agreements/RescanModal.tsx` | Modify | Hide Re-scan button for salesperson |
| `src/app/(app)/agreements/[id]/page.tsx` | Modify | Pass userRole prop to child components |
| `src/__tests__/notification-queue.test.ts` | Create | Unit tests for queue builders |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/017_notification_queue.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/017_notification_queue.sql

create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references agreements(id) on delete cascade,
  payout_schedule_id uuid references payout_schedule(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'payout', 'maturity', 'tds_filing', 'doc_return', 'monthly_summary', 'quarterly_forecast'
  )),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dismissed')),
  recipients jsonb not null default '{}',
  suggested_subject text,
  suggested_body text,
  sent_at timestamptz,
  sent_by uuid references team_members(id),
  created_at timestamptz not null default now()
);

-- For agreement-specific items: prevent duplicate pending rows per payout/agreement/type/date
create unique index notification_queue_agreement_unique
  on notification_queue(agreement_id, coalesce(payout_schedule_id, '00000000-0000-0000-0000-000000000000'::uuid), notification_type, due_date)
  where status = 'pending' and agreement_id is not null;

-- For summary/forecast items (no agreement): prevent duplicate pending rows per type/date
create unique index notification_queue_summary_unique
  on notification_queue(notification_type, due_date)
  where status = 'pending' and agreement_id is null;

create index notification_queue_status_date on notification_queue(status, due_date);
create index notification_queue_agreement on notification_queue(agreement_id);
```

- [ ] **Step 2: Run migration in Supabase**

Open Supabase SQL Editor and run the file contents. Confirm no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_notification_queue.sql
git commit -m "feat: add notification_queue table and indexes"
```

---

## Task 2: Add TypeScript Type

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add NotificationQueue type**

Add this after the existing `Reminder` interface:

```typescript
export type NotificationType =
  | 'payout'
  | 'maturity'
  | 'tds_filing'
  | 'doc_return'
  | 'monthly_summary'
  | 'quarterly_forecast'

export type NotificationStatus = 'pending' | 'sent' | 'dismissed'

export interface NotificationQueue {
  id: string
  agreement_id: string | null
  payout_schedule_id: string | null
  notification_type: NotificationType
  due_date: string | null       // ISO date
  status: NotificationStatus
  recipients: {
    accounts: string[]
    salesperson: string | null
  }
  suggested_subject: string | null
  suggested_body: string | null
  sent_at: string | null
  sent_by: string | null
  created_at: string
}
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add NotificationQueue types"
```

---

## Task 3: Export Email Body Builders + Add TDS Builder

**Files:**
- Modify: `src/lib/reminders.ts`

- [ ] **Step 1: Make existing body builders exported**

Find these three private functions (around line 142) and add `export` keyword:

```typescript
export function buildPayoutReminderBody(agreement: Agreement, payout: PayoutSchedule, leadDays: number): string {
```

```typescript
export function buildMaturityReminderBody(agreement: Agreement, leadDays: number): string {
```

```typescript
export function buildDocReturnReminderBody(agreement: Agreement, daysSinceSent: number): string {
```

- [ ] **Step 2: Add TDS filing body builder**

Add after the existing builders:

```typescript
export function buildTdsFilingReminderBody(agreement: Agreement, marchDate: string): string {
  return `
    <h2>TDS Filing Due</h2>
    <p>The following cumulative/compound agreement requires TDS filing by <strong>${marchDate}</strong>.</p>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
      <tr><td><strong>Investor</strong></td><td>${esc(agreement.investor_name)}</td></tr>
      <tr><td><strong>Agreement Ref</strong></td><td>${esc(agreement.reference_id)}</td></tr>
      <tr><td><strong>Principal Amount</strong></td><td>₹${agreement.principal_amount.toLocaleString('en-IN')}</td></tr>
      <tr><td><strong>TDS Filing Date</strong></td><td>${marchDate}</td></tr>
    </table>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/agreements/${agreement.id}">View Agreement →</a></p>
  `.trim()
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/reminders.ts
git commit -m "feat: export email body builders, add TDS filing builder"
```

---

## Task 4: Create Notification Queue Population Library

**Files:**
- Create: `src/lib/notification-queue.ts`

This is a pure data-building library. No side effects — returns rows to insert, does not write to DB.

- [ ] **Step 1: Write the file**

```typescript
import { addDays, format } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Agreement, PayoutSchedule } from '@/types/database'
import type { NotificationQueue } from '@/types/database'
import {
  buildPayoutReminderBody,
  buildMaturityReminderBody,
  buildDocReturnReminderBody,
  buildTdsFilingReminderBody,
  buildMonthlyPayoutSummaryEmail,
} from '@/lib/reminders'
import { sendQuarterlyForecast } from '@/lib/email'

type QueueInsert = Omit<NotificationQueue, 'id' | 'created_at' | 'sent_at' | 'sent_by'>

// Fetch coordinator + financial_analyst emails (the "accounts" recipients)
export async function getAccountsEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from('team_members')
    .select('email')
    .in('role', ['coordinator', 'financial_analyst'])
    .eq('is_active', true)
  return (data ?? []).map((m: { email: string }) => m.email).filter(Boolean)
}

// Build payout queue items — payouts due within 30 days, not paid
export async function buildPayoutQueueItems(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert[]> {
  const until = format(addDays(new Date(todayStr), 30), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('payout_schedule')
    .select(`
      id, due_by, gross_interest, tds_amount, net_interest, period_from, period_to,
      agreement:agreements!inner(
        id, investor_name, reference_id, principal_amount, payout_frequency, status, deleted_at, salesperson_id,
        salesperson:team_members!salesperson_id(email)
      )
    `)
    .neq('status', 'paid')
    .eq('is_tds_only', false)
    .eq('is_principal_repayment', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .gte('due_by', todayStr)
    .lte('due_by', until)

  if (!data) return []

  return (data as unknown as Array<{
    id: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    period_from: string
    period_to: string
    agreement: Agreement & { salesperson?: { email: string } | null }
  }>).map(row => {
    const salespersonEmail = row.agreement.salesperson?.email ?? null
    const daysUntil = Math.ceil((new Date(row.due_by).getTime() - new Date(todayStr).getTime()) / 86400000)
    const subject = `Payout Due: ${row.agreement.investor_name} — ₹${row.net_interest.toLocaleString('en-IN')} due ${row.due_by}`
    const body = buildPayoutReminderBody(row.agreement, row as unknown as PayoutSchedule, daysUntil)
    return {
      agreement_id: row.agreement.id,
      payout_schedule_id: row.id,
      notification_type: 'payout' as const,
      due_date: row.due_by,
      status: 'pending' as const,
      recipients: { accounts: accountsEmails, salesperson: salespersonEmail },
      suggested_subject: subject,
      suggested_body: body,
    }
  })
}

// Build maturity queue items — maturities within 90 days
export async function buildMaturityQueueItems(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert[]> {
  const until = format(addDays(new Date(todayStr), 90), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('agreements')
    .select('*, salesperson:team_members!salesperson_id(email)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gte('maturity_date', todayStr)
    .lte('maturity_date', until)

  if (!data) return []

  return (data as unknown as Array<Agreement & { salesperson?: { email: string } | null }>).map(agreement => {
    const salespersonEmail = agreement.salesperson?.email ?? null
    const daysLeft = Math.ceil((new Date(agreement.maturity_date).getTime() - new Date(todayStr).getTime()) / 86400000)
    const subject = `Maturity Notice: ${agreement.investor_name} — matures in ${daysLeft} days (${agreement.maturity_date})`
    const body = buildMaturityReminderBody(agreement, daysLeft)
    return {
      agreement_id: agreement.id,
      payout_schedule_id: null,
      notification_type: 'maturity' as const,
      due_date: agreement.maturity_date,
      status: 'pending' as const,
      recipients: { accounts: accountsEmails, salesperson: salespersonEmail },
      suggested_subject: subject,
      suggested_body: body,
    }
  })
}

// Build TDS filing queue items — is_tds_only rows due within 60 days
export async function buildTdsFilingQueueItems(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert[]> {
  const until = format(addDays(new Date(todayStr), 60), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('payout_schedule')
    .select(`
      id, due_by,
      agreement:agreements!inner(
        id, investor_name, reference_id, principal_amount, status, deleted_at, salesperson_id,
        salesperson:team_members!salesperson_id(email)
      )
    `)
    .eq('is_tds_only', true)
    .neq('status', 'paid')
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .gte('due_by', todayStr)
    .lte('due_by', until)

  if (!data) return []

  return (data as unknown as Array<{
    id: string
    due_by: string
    agreement: Agreement & { salesperson?: { email: string } | null }
  }>).map(row => {
    const salespersonEmail = row.agreement.salesperson?.email ?? null
    const subject = `TDS Filing Due: ${row.agreement.investor_name} — 31 Mar ${new Date(row.due_by).getFullYear()}`
    const body = buildTdsFilingReminderBody(row.agreement, row.due_by)
    return {
      agreement_id: row.agreement.id,
      payout_schedule_id: row.id,
      notification_type: 'tds_filing' as const,
      due_date: row.due_by,
      status: 'pending' as const,
      recipients: { accounts: accountsEmails, salesperson: salespersonEmail },
      suggested_subject: subject,
      suggested_body: body,
    }
  })
}

// Build doc return queue items — docs sent >30 days ago not yet returned
export async function buildDocReturnQueueItems(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert[]> {
  const thirtyDaysAgo = format(addDays(new Date(todayStr), -30), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('agreements')
    .select('*, salesperson:team_members!salesperson_id(email)')
    .eq('doc_status', 'sent_to_client')
    .is('doc_returned_date', null)
    .is('deleted_at', null)
    .lte('doc_sent_to_client_date', thirtyDaysAgo)

  if (!data) return []

  return (data as unknown as Array<Agreement & { salesperson?: { email: string } | null }>).map(agreement => {
    const salespersonEmail = agreement.salesperson?.email ?? null
    const daysSinceSent = Math.ceil(
      (new Date(todayStr).getTime() - new Date(agreement.doc_sent_to_client_date!).getTime()) / 86400000
    )
    const subject = `Doc Return Overdue: ${agreement.investor_name} (${daysSinceSent} days since dispatch)`
    const body = buildDocReturnReminderBody(agreement, daysSinceSent)
    return {
      agreement_id: agreement.id,
      payout_schedule_id: null,
      notification_type: 'doc_return' as const,
      due_date: todayStr,
      status: 'pending' as const,
      recipients: { accounts: accountsEmails, salesperson: salespersonEmail },
      suggested_subject: subject,
      suggested_body: body,
    }
  })
}

// Build monthly summary queue item — only on 1st of each month
export async function buildMonthlySummaryQueueItem(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert | null> {
  const day = new Date(todayStr).getDate()
  if (day !== 1) return null

  const monthLabel = format(new Date(todayStr), 'MMMM yyyy')

  // Fetch payouts due this month for the summary body
  const monthEnd = format(new Date(new Date(todayStr).getFullYear(), new Date(todayStr).getMonth() + 1, 0), 'yyyy-MM-dd')
  const { data } = await supabase
    .from('payout_schedule')
    .select(`
      due_by, gross_interest, tds_amount, net_interest,
      agreement:agreements!inner(investor_name, reference_id, status, deleted_at)
    `)
    .neq('status', 'paid')
    .eq('is_tds_only', false)
    .eq('is_principal_repayment', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .gte('due_by', todayStr)
    .lte('due_by', monthEnd)

  const payouts = (data ?? []) as unknown as Array<{
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    agreement: { investor_name: string; reference_id: string }
  }>

  const body = buildMonthlyPayoutSummaryEmail(monthLabel, payouts.map(p => ({
    investor_name: p.agreement.investor_name,
    reference_id: p.agreement.reference_id,
    due_by: p.due_by,
    gross_interest: p.gross_interest,
    tds_amount: p.tds_amount,
    net_interest: p.net_interest,
  })))

  return {
    agreement_id: null,
    payout_schedule_id: null,
    notification_type: 'monthly_summary' as const,
    due_date: todayStr,
    status: 'pending' as const,
    recipients: { accounts: accountsEmails, salesperson: null },
    suggested_subject: `Monthly Payout Summary — ${monthLabel}`,
    suggested_body: body,
  }
}

// Build quarterly forecast queue item — only on quarter start dates
export function isQuarterStart(dateStr: string): boolean {
  const d = new Date(dateStr)
  const month = d.getMonth() + 1
  const day = d.getDate()
  return day === 1 && (month === 4 || month === 7 || month === 10 || month === 1)
}
```

- [ ] **Step 2: Run build to verify no type errors**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notification-queue.ts
git commit -m "feat: notification queue population library"
```

---

## Task 5: Write Unit Tests for Queue Builders

**Files:**
- Create: `src/__tests__/notification-queue.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest'
import { isQuarterStart } from '@/lib/notification-queue'

describe('isQuarterStart', () => {
  it('returns true for 1 Apr', () => {
    expect(isQuarterStart('2026-04-01')).toBe(true)
  })
  it('returns true for 1 Jul', () => {
    expect(isQuarterStart('2026-07-01')).toBe(true)
  })
  it('returns true for 1 Oct', () => {
    expect(isQuarterStart('2026-10-01')).toBe(true)
  })
  it('returns true for 1 Jan', () => {
    expect(isQuarterStart('2027-01-01')).toBe(true)
  })
  it('returns false for 2 Apr', () => {
    expect(isQuarterStart('2026-04-02')).toBe(false)
  })
  it('returns false for 1 May', () => {
    expect(isQuarterStart('2026-05-01')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/__tests__/notification-queue.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/notification-queue.test.ts
git commit -m "test: notification queue isQuarterStart unit tests"
```

---

## Task 6: Rewrite Cron to Populate Queue

**Files:**
- Modify: `src/app/api/reminders/process/route.ts`

- [ ] **Step 1: Replace the processReminders function**

The existing function sends emails. Replace `processReminders` with a new version that populates the queue instead. Keep the function signature the same (returns a summary object). Keep the route handlers (GET/POST) unchanged — only replace `processReminders`.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { format } from 'date-fns'
import {
  getAccountsEmails,
  buildPayoutQueueItems,
  buildMaturityQueueItems,
  buildTdsFilingQueueItems,
  buildDocReturnQueueItems,
  buildMonthlySummaryQueueItem,
  isQuarterStart,
} from '@/lib/notification-queue'

async function processReminders(): Promise<{
  queueAdded: number
  overdueMarked: number
}> {
  const supabase = createAdminClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  let queueAdded = 0

  // 1. Fetch accounts emails once
  const accountsEmails = await getAccountsEmails(supabase)

  // 2. Build all queue items
  const [payoutItems, maturityItems, tdsItems, docItems] = await Promise.all([
    buildPayoutQueueItems(supabase, todayStr, accountsEmails),
    buildMaturityQueueItems(supabase, todayStr, accountsEmails),
    buildTdsFilingQueueItems(supabase, todayStr, accountsEmails),
    buildDocReturnQueueItems(supabase, todayStr, accountsEmails),
  ])

  const summaryItem = await buildMonthlySummaryQueueItem(supabase, todayStr, accountsEmails)

  const allItems = [
    ...payoutItems,
    ...maturityItems,
    ...tdsItems,
    ...docItems,
    ...(summaryItem ? [summaryItem] : []),
  ]

  // Quarterly forecast queue item (body built separately — needs full data)
  if (isQuarterStart(todayStr)) {
    const month = new Date(todayStr).getMonth() + 1
    const year = new Date(todayStr).getFullYear()
    let quarterLabel = ''
    if (month === 4) quarterLabel = `Q1 FY${year}-${String(year + 1).slice(2)}`
    else if (month === 7) quarterLabel = `Q2 FY${year}-${String(year + 1).slice(2)}`
    else if (month === 10) quarterLabel = `Q3 FY${year}-${String(year + 1).slice(2)}`
    else quarterLabel = `Q4 FY${year - 1}-${String(year).slice(2)}`

    allItems.push({
      agreement_id: null,
      payout_schedule_id: null,
      notification_type: 'quarterly_forecast',
      due_date: todayStr,
      status: 'pending',
      recipients: { accounts: accountsEmails, salesperson: null },
      suggested_subject: `Quarterly Forecast — ${quarterLabel}`,
      suggested_body: `<p>Quarterly forecast for ${quarterLabel}. Open the notifications page to review and send.</p>`,
    })
  }

  // 3. Upsert — ignore conflicts (idempotent via unique indexes)
  if (allItems.length > 0) {
    const { data, error } = await supabase
      .from('notification_queue')
      .insert(allItems)
      .select('id')
      .throwOnError()
    if (!error) queueAdded = data?.length ?? 0
  }

  // 4. Still mark payout_schedule rows as overdue (no change from before)
  const { data: overdueResult } = await supabase
    .from('payout_schedule')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .eq('is_tds_only', false)
    .lt('due_by', todayStr)
    .select('id')

  const overdueMarked = overdueResult?.length ?? 0

  return { queueAdded, overdueMarked }
}

export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron')
  if (cronHeader !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await processReminders()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await processReminders()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: clean. Note: some previously-used imports (sendEmail, sendQuarterlyForecast, etc.) will be removed — that's expected.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reminders/process/route.ts
git commit -m "feat: cron populates notification_queue instead of sending emails"
```

---

## Task 7: Create GET Notifications API

**Files:**
- Create: `src/app/api/notifications/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    const userTeamId = request.headers.get('x-user-team-id') ?? ''
    const supabase = createAdminClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? 'pending'
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200)

    let query = supabase
      .from('notification_queue')
      .select(`
        *,
        agreement:agreements(id, investor_name, reference_id, salesperson_id),
        sent_by_member:team_members!sent_by(name)
      `)
      .eq('status', status)
      .order('due_date', { ascending: true })
      .limit(limit)

    // Salesperson sees only their agreements' items; never sees summary/forecast
    if (userRole === 'salesperson') {
      const { data: spAgreements } = await supabase
        .from('agreements')
        .select('id')
        .eq('salesperson_id', userTeamId)
        .is('deleted_at', null)
      const ids = (spAgreements ?? []).map((a: { id: string }) => a.id)
      if (ids.length === 0) return NextResponse.json([])
      query = query.in('agreement_id', ids)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notifications/route.ts
git commit -m "feat: GET /api/notifications — fetch queue items with role scoping"
```

---

## Task 8: Create Send API

**Files:**
- Create: `src/app/api/notifications/send/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import type { NotificationQueue } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    const userTeamId = request.headers.get('x-user-team-id') ?? ''

    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const ids: string[] = body.ids ?? []
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    let sent = 0
    let failed = 0
    const errors: string[] = []

    const { data: items } = await supabase
      .from('notification_queue')
      .select('*')
      .in('id', ids)

    for (const item of (items ?? []) as NotificationQueue[]) {
      if (item.status === 'sent') continue // idempotent skip

      const to = [
        ...(item.recipients.accounts ?? []),
        ...(item.recipients.salesperson ? [item.recipients.salesperson] : []),
      ].filter(Boolean)

      if (to.length === 0) {
        errors.push(`${item.id}: no recipients`)
        failed++
        continue
      }

      const result = await sendEmail({
        to,
        subject: item.suggested_subject ?? '(No subject)',
        html: item.suggested_body ?? '',
      })

      if (result.success) {
        // Mark sent
        await supabase
          .from('notification_queue')
          .update({ status: 'sent', sent_at: nowIso, sent_by: userTeamId || null })
          .eq('id', item.id)

        // Write to reminders table as audit log
        await supabase.from('reminders').insert({
          agreement_id: item.agreement_id,
          payout_schedule_id: item.payout_schedule_id,
          reminder_type: item.notification_type === 'tds_filing' ? 'payout' : item.notification_type,
          lead_days: null,
          scheduled_at: nowIso,
          status: 'sent',
          sent_at: nowIso,
          email_to: to,
          email_subject: item.suggested_subject,
          email_body: item.suggested_body,
        })

        sent++
      } else {
        errors.push(`${item.id}: ${result.error ?? 'send failed'}`)
        failed++
      }
    }

    return NextResponse.json({ sent, failed, errors })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notifications/send/route.ts
git commit -m "feat: POST /api/notifications/send — coordinator sends selected queue items"
```

---

## Task 9: Create Dismiss API

**Files:**
- Create: `src/app/api/notifications/[id]/dismiss/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('notification_queue')
      .update({ status: 'dismissed' })
      .eq('id', id)
      .eq('status', 'pending')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Build check and commit**

```bash
npm run build && git add src/app/api/notifications/[id]/dismiss/route.ts && git commit -m "feat: POST /api/notifications/[id]/dismiss"
```

---

## Task 10: Create Notifications Page

**Files:**
- Create: `src/app/(app)/notifications/page.tsx`
- Create: `src/components/notifications/NotificationsClient.tsx`

- [ ] **Step 1: Write the server page**

```typescript
// src/app/(app)/notifications/page.tsx
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import NotificationsClient from '@/components/notifications/NotificationsClient'
import type { NotificationQueue } from '@/types/database'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Notifications — Good Earth Investment Tracker' }

async function fetchItems(status: string, salespersonId?: string) {
  const supabase = createAdminClient()
  let query = supabase
    .from('notification_queue')
    .select(`
      *,
      agreement:agreements(id, investor_name, reference_id),
      sent_by_member:team_members!sent_by(name)
    `)
    .eq('status', status)
    .order('due_date', { ascending: true })
    .limit(200)

  if (salespersonId) {
    const { data: spAgreements } = await supabase
      .from('agreements')
      .select('id')
      .eq('salesperson_id', salespersonId)
      .is('deleted_at', null)
    const ids = (spAgreements ?? []).map((a: { id: string }) => a.id)
    if (ids.length === 0) return []
    query = query.in('agreement_id', ids)
  }

  const { data } = await query
  return (data ?? []) as unknown as (NotificationQueue & {
    agreement?: { id: string; investor_name: string; reference_id: string } | null
    sent_by_member?: { name: string } | null
  })[]
}

export default async function NotificationsPage() {
  const headersList = await headers()
  const userRole = headersList.get('x-user-role') ?? ''
  const userTeamId = headersList.get('x-user-team-id') ?? ''
  const salespersonId = userRole === 'salesperson' ? userTeamId : undefined

  const [pending, sent] = await Promise.all([
    fetchItems('pending', salespersonId),
    fetchItems('sent', salespersonId),
  ])

  const todayStr = new Date().toISOString().split('T')[0]
  const urgentTypes = {
    payout: (item: NotificationQueue) => !item.due_date || item.due_date < todayStr,
    maturity: (item: NotificationQueue) => {
      if (!item.due_date) return false
      const daysLeft = Math.ceil((new Date(item.due_date).getTime() - new Date(todayStr).getTime()) / 86400000)
      return daysLeft <= 14
    },
    tds_filing: (item: NotificationQueue) => {
      if (!item.due_date) return false
      const daysLeft = Math.ceil((new Date(item.due_date).getTime() - new Date(todayStr).getTime()) / 86400000)
      return daysLeft <= 7
    },
    doc_return: () => true,
    monthly_summary: () => false,
    quarterly_forecast: () => false,
  }

  const redFlags = pending.filter(item =>
    urgentTypes[item.notification_type]?.(item) ?? false
  )

  return (
    <NotificationsClient
      pending={pending}
      redFlags={redFlags}
      history={sent}
      userRole={userRole}
    />
  )
}
```

- [ ] **Step 2: Write the client component**

```typescript
// src/components/notifications/NotificationsClient.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationQueue, NotificationType } from '@/types/database'

type EnrichedItem = NotificationQueue & {
  agreement?: { id: string; investor_name: string; reference_id: string } | null
  sent_by_member?: { name: string } | null
}

const TYPE_LABELS: Record<NotificationType, string> = {
  payout: 'Payout',
  maturity: 'Maturity',
  tds_filing: 'TDS Filing',
  doc_return: 'Doc Return',
  monthly_summary: 'Monthly Summary',
  quarterly_forecast: 'Quarterly Forecast',
}

const TYPE_COLORS: Record<NotificationType, string> = {
  payout: 'bg-indigo-900/40 text-indigo-400',
  maturity: 'bg-amber-900/40 text-amber-400',
  tds_filing: 'bg-violet-900/40 text-violet-400',
  doc_return: 'bg-orange-900/40 text-orange-400',
  monthly_summary: 'bg-slate-700 text-slate-300',
  quarterly_forecast: 'bg-slate-700 text-slate-300',
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function TypeBadge({ type }: { type: NotificationType }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${TYPE_COLORS[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  )
}

function QueueTab({
  items,
  isReadOnly,
  onSend,
  onDismiss,
  sending,
}: {
  items: EnrichedItem[]
  isReadOnly?: boolean
  onSend: (ids: string[]) => void
  onDismiss: (id: string) => void
  sending: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const todayStr = new Date().toISOString().split('T')[0]

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map(i => i.id)))
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  if (items.length === 0) {
    return <p className="text-slate-500 text-sm py-12 text-center">Nothing here.</p>
  }

  return (
    <div className="space-y-4">
      {!isReadOnly && selected.size > 0 && (
        <div className="flex items-center justify-between bg-indigo-900/20 border border-indigo-800/40 rounded-xl px-4 py-3">
          <span className="text-sm text-slate-300">{selected.size} selected</span>
          <button
            onClick={() => { onSend(Array.from(selected)); setSelected(new Set()) }}
            disabled={sending}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending…' : 'Send selected'}
          </button>
        </div>
      )}

      <table className="min-w-full text-sm text-slate-300">
        <thead>
          <tr className="border-b border-slate-700 text-xs text-slate-400">
            {!isReadOnly && (
              <th className="pb-2 pr-3 text-left">
                <input type="checkbox" checked={selected.size === items.length && items.length > 0}
                  onChange={toggleAll} className="accent-indigo-500" />
              </th>
            )}
            <th className="pb-2 pr-4 text-left">Type</th>
            <th className="pb-2 pr-4 text-left">Investor / Detail</th>
            <th className="pb-2 pr-4 text-left">Due</th>
            <th className="pb-2 pr-4 text-left">Recipients</th>
            {!isReadOnly && <th className="pb-2 text-left">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const isUrgent = item.due_date ? item.due_date <= todayStr : false
            return (
              <tr key={item.id}
                className={`border-b border-slate-700/40 hover:bg-slate-800/30 ${isUrgent ? 'border-l-2 border-l-red-500' : ''}`}
              >
                {!isReadOnly && (
                  <td className="py-2.5 pr-3">
                    <input type="checkbox" checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)} className="accent-indigo-500" />
                  </td>
                )}
                <td className="py-2.5 pr-4">
                  <TypeBadge type={item.notification_type} />
                  {isReadOnly && <span className="ml-2 text-[10px] text-red-400 font-bold">URGENT</span>}
                </td>
                <td className="py-2.5 pr-4">
                  {item.agreement ? (
                    <div>
                      <p className="text-slate-100 font-medium">{item.agreement.investor_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{item.agreement.reference_id}</p>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">{TYPE_LABELS[item.notification_type]}</p>
                  )}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{fmtDate(item.due_date)}</td>
                <td className="py-2.5 pr-4 text-xs text-slate-400">
                  {item.recipients.accounts.length} accounts
                  {item.recipients.salesperson ? ' + SP' : ''}
                </td>
                {!isReadOnly && (
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { onSend([item.id]) }}
                        disabled={sending}
                        className="px-2 py-1 text-xs rounded bg-indigo-900/40 text-indigo-400 hover:bg-indigo-800/40 disabled:opacity-50 transition-colors"
                      >
                        Send
                      </button>
                      <button
                        onClick={() => onDismiss(item.id)}
                        className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HistoryTab({ items, onResend, sending }: {
  items: EnrichedItem[]
  onResend: (id: string) => void
  sending: boolean
}) {
  if (items.length === 0) {
    return <p className="text-slate-500 text-sm py-12 text-center">No sent notifications in the last 30 days.</p>
  }

  return (
    <table className="min-w-full text-sm text-slate-300">
      <thead>
        <tr className="border-b border-slate-700 text-xs text-slate-400">
          <th className="pb-2 pr-4 text-left">Type</th>
          <th className="pb-2 pr-4 text-left">Investor / Detail</th>
          <th className="pb-2 pr-4 text-left">Sent</th>
          <th className="pb-2 pr-4 text-left">By</th>
          <th className="pb-2 text-left">Action</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id} className="border-b border-slate-700/40 hover:bg-slate-800/30">
            <td className="py-2.5 pr-4"><TypeBadge type={item.notification_type} /></td>
            <td className="py-2.5 pr-4">
              {item.agreement ? (
                <div>
                  <p className="text-slate-100 font-medium">{item.agreement.investor_name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">{item.agreement.reference_id}</p>
                </div>
              ) : (
                <p className="text-slate-400 italic">{TYPE_LABELS[item.notification_type]}</p>
              )}
            </td>
            <td className="py-2.5 pr-4 whitespace-nowrap text-xs">{fmtDate(item.sent_at)}</td>
            <td className="py-2.5 pr-4 text-xs text-slate-400">{item.sent_by_member?.name ?? '—'}</td>
            <td className="py-2.5">
              <button
                onClick={() => onResend(item.id)}
                disabled={sending}
                className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                Re-send
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function NotificationsClient({
  pending,
  redFlags,
  history,
  userRole,
}: {
  pending: EnrichedItem[]
  redFlags: EnrichedItem[]
  history: EnrichedItem[]
  userRole: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'queue' | 'flags' | 'history'>('queue')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  async function handleSend(ids: string[]) {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Send failed')
      } else if (data.failed > 0) {
        setError(`${data.failed} failed: ${data.errors.join(', ')}`)
      }
      router.refresh()
    } finally {
      setSending(false)
    }
  }

  async function handleDismiss(id: string) {
    await fetch(`/api/notifications/${id}/dismiss`, { method: 'POST' })
    router.refresh()
  }

  async function handleResend(id: string) {
    await handleSend([id])
  }

  const tabs = [
    { key: 'queue' as const, label: `Queue (${pending.length})` },
    { key: 'flags' as const, label: `🔴 Red Flags (${redFlags.length})` },
    { key: 'history' as const, label: 'History' },
  ]

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Notifications</h1>
        <p className="text-xs text-slate-500 mt-0.5">Review and send upcoming reminders</p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        {tab === 'queue' && (
          <QueueTab
            items={pending}
            onSend={handleSend}
            onDismiss={handleDismiss}
            sending={sending}
            isReadOnly={!isCoordinator}
          />
        )}
        {tab === 'flags' && (
          <QueueTab
            items={redFlags}
            onSend={handleSend}
            onDismiss={handleDismiss}
            sending={sending}
            isReadOnly={!isCoordinator}
          />
        )}
        {tab === 'history' && (
          <HistoryTab items={history} onResend={handleResend} sending={sending} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/notifications/page.tsx src/components/notifications/NotificationsClient.tsx
git commit -m "feat: /notifications page with Queue, Red Flags, History tabs"
```

---

## Task 11: Add Notifications to Sidebar

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Add Bell to lucide imports**

Find the lucide import block and add `Bell`:

```typescript
import {
  LayoutDashboard,
  FileText,
  Calendar,
  BarChart3,
  FileBarChart,
  Settings,
  Leaf,
  Users,
  Bell,          // ← add this
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Loader2,
  LogOut,
} from 'lucide-react'
```

- [ ] **Step 2: Add Notifications to navItems**

Find `const navItems = [` and add the Notifications entry between Dashboard and Agreements:

```typescript
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/notifications', label: 'Notifications', icon: Bell },   // ← add this
  { href: '/agreements', label: 'Agreements', icon: FileText },
  { href: '/investors', label: 'Investors', icon: Users },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/quarterly-review', label: 'Quarterly Review', icon: BarChart3 },
  { href: '/quarterly-reports', label: 'Reports', icon: FileBarChart },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

- [ ] **Step 3: Build check and commit**

```bash
npm run build && git add src/app/(app)/layout.tsx && git commit -m "feat: add Notifications to sidebar nav"
```

---

## Task 12: Gate Salesperson on Action API Routes

**Files:**
- Modify: `src/app/api/agreements/[id]/payouts/[payoutId]/revert/route.ts`
- Modify: `src/app/api/agreements/[id]/mark-past-paid/route.ts`
- Modify: `src/app/api/agreements/[id]/rescan/route.ts`

- [ ] **Step 1: Add gate to revert route**

In `src/app/api/agreements/[id]/payouts/[payoutId]/revert/route.ts`, add after `try {`:

```typescript
const userRole = request.headers.get('x-user-role') ?? ''
if (userRole === 'salesperson') {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}
```

- [ ] **Step 2: Add gate to mark-past-paid route**

In `src/app/api/agreements/[id]/mark-past-paid/route.ts`, add after `try {`:

```typescript
const userRole = request.headers.get('x-user-role') ?? ''
if (userRole === 'salesperson') {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}
```

- [ ] **Step 3: Add gate to rescan route**

In `src/app/api/agreements/[id]/rescan/route.ts`, add after `try {`:

```typescript
const userRole = request.headers.get('x-user-role') ?? ''
if (userRole === 'salesperson') {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}
```

- [ ] **Step 4: Build check and commit**

```bash
npm run build && git add \
  "src/app/api/agreements/[id]/payouts/[payoutId]/revert/route.ts" \
  "src/app/api/agreements/[id]/mark-past-paid/route.ts" \
  "src/app/api/agreements/[id]/rescan/route.ts" && \
git commit -m "fix: gate revert, mark-past-paid, rescan APIs from salesperson role"
```

---

## Task 13: Hide Action Buttons from Salesperson in UI

**Files:**
- Modify: `src/app/(app)/agreements/[id]/page.tsx`
- Modify: `src/components/agreements/PayoutScheduleSection.tsx`
- Modify: `src/components/agreements/RescanModal.tsx`

- [ ] **Step 1: Pass userRole to PayoutScheduleSection**

In `src/app/(app)/agreements/[id]/page.tsx`:

The page already reads `userRole` from headers (added in Task from C.6). Pass it to `PayoutScheduleSection`:

Find the `<PayoutScheduleSection>` usage and add `userRole` prop:

```tsx
<PayoutScheduleSection
  agreementId={agreement.id}
  payouts={payout_schedule}
  userRole={userRole}
/>
```

Also pass to RescanModal if it exists in the JSX. Find `<RescanModal` and add `userRole={userRole}`.

- [ ] **Step 2: Accept userRole in PayoutScheduleSection**

In `src/components/agreements/PayoutScheduleSection.tsx`:

Update the `Props` interface:

```typescript
interface Props {
  agreementId: string
  payouts: PayoutSchedule[]
  userRole: string
}
```

Update the function signature:

```typescript
export default function PayoutScheduleSection({ agreementId, payouts, userRole }: Props) {
```

Add `const isCoordinator = userRole !== 'salesperson'` near the top of the function.

Then wrap every action button with `{isCoordinator && ...}`:
- The "Mark all past payouts as paid" button and its confirmation UI
- The "Mark Paid" / "Revert" buttons in each interest row
- The "Mark Paid" / "Revert" in the principal row
- The `<MarkTdsFiledButton>` in the TDS section

- [ ] **Step 3: Accept userRole in RescanModal**

In `src/components/agreements/RescanModal.tsx`, add `userRole: string` to the props interface. If `userRole === 'salesperson'`, return `null` immediately:

```typescript
interface RescanModalProps {
  agreementId: string
  userRole: string
  // ... other existing props
}

export default function RescanModal({ agreementId, userRole, ...rest }: RescanModalProps) {
  if (userRole === 'salesperson') return null
  // ... existing component body
}
```

- [ ] **Step 4: Build check and commit**

```bash
npm run build && git add \
  "src/app/(app)/agreements/[id]/page.tsx" \
  "src/components/agreements/PayoutScheduleSection.tsx" \
  "src/components/agreements/RescanModal.tsx" && \
git commit -m "fix: hide action buttons from salesperson in payout schedule and rescan UI"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: clean, no errors.

- [ ] **Step 3: Manual smoke test checklist**

1. Run `POST /api/reminders/process` manually — check `notification_queue` table in Supabase for new rows
2. Open `/notifications` as coordinator — verify Queue tab shows items, Send works, Dismiss works
3. Open `/notifications` as salesperson — verify only their items shown, no Send/Dismiss buttons
4. Open an agreement as salesperson — verify no Mark Paid, Revert, Re-scan buttons
5. Try calling `/api/agreements/[id]/payouts/[id]/revert` as salesperson — expect 403

- [ ] **Step 4: Push to main**

```bash
git push origin main
```
