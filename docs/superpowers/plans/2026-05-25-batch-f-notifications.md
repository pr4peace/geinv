# Batch F — Notification Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/notifications` into a coordinator action center with per-section manual batch emails, checkboxes, and a sent history tab.

**Architecture:** Expand the server page component to run 3 separate queries (payouts, maturities, TDS — all with a 60-day forward window). Rebuild `NotificationsClient` with two tabs: Queue (3 sections, checkboxes, Notify All/Selected) and History (reads `reminders` table). Add a new `POST /api/notifications/send` route that sends one batched email and logs one `reminders` row per selected item.

**Tech Stack:** Next.js 14 App Router · Supabase (admin client) · Resend (via `src/lib/email.ts`) · Tailwind CSS · Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/024_batch_notification_reminder_type.sql` | Create | Add `batch_notification` to DB check constraint |
| `src/types/database.ts` | Modify | Add `batch_notification` to `ReminderType` union |
| `src/lib/email.ts` | Modify | Add `sendBatchNotification()` helper |
| `src/app/api/notifications/send/route.ts` | Create | POST handler — validate, fetch, send, log per-item |
| `src/app/(app)/notifications/page.tsx` | Modify | 3 queries with 60-day window; pass typed data to client |
| `src/components/notifications/NotificationsClient.tsx` | Rewrite | Tabs, sections, checkboxes, Notify All/Selected, History |
| `src/__tests__/notifications-send.test.ts` | Create | Unit tests for the send route logic |

---

## Task 1: DB Migration — add `batch_notification` type

**Files:**
- Create: `supabase/migrations/024_batch_notification_reminder_type.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 024_batch_notification_reminder_type.sql
ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_reminder_type_check;
ALTER TABLE reminders ADD CONSTRAINT reminders_reminder_type_check
  CHECK (reminder_type IN (
    'payout', 'maturity', 'doc_return', 'quarterly_forecast', 'payout_monthly_summary',
    'batch_notification'
  ));
```

- [ ] **Step 2: Run the migration**

```bash
npm run migrate
```

Expected: no errors. If it errors with "constraint does not exist", that's fine — the `DROP CONSTRAINT IF EXISTS` handles it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/024_batch_notification_reminder_type.sql
git commit -m "feat: add batch_notification to reminders type constraint"
```

---

## Task 2: Add `batch_notification` to TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Update `ReminderType`**

Find this line in `src/types/database.ts`:
```ts
export type ReminderType = 'payout' | 'maturity' | 'doc_return' | 'quarterly_forecast' | 'payout_monthly_summary'
```

Replace with:
```ts
export type ReminderType = 'payout' | 'maturity' | 'doc_return' | 'quarterly_forecast' | 'payout_monthly_summary' | 'batch_notification'
```

- [ ] **Step 2: Verify build is clean**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ Compiled successfully` or similar, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add batch_notification ReminderType"
```

---

## Task 3: Add `sendBatchNotification` to email lib

**Files:**
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Add the helper function**

Add this function at the end of `src/lib/email.ts` (leave all existing functions untouched, including `sendQuarterlyForecast`):

```ts
export interface BatchNotificationItem {
  investor_name: string
  reference_id: string
  due_by?: string           // payouts + TDS
  maturity_date?: string    // maturities
  gross_interest?: number
  tds_amount?: number
  net_interest?: number
  principal_amount?: number
  is_overdue?: boolean
}

export async function sendBatchNotification(params: {
  type: 'payouts' | 'maturities' | 'tds'
  items: BatchNotificationItem[]
  recipientEmail: string
}): Promise<SendEmailResult> {
  const { type, items, recipientEmail } = params

  const totalNet = items.reduce((s, i) => s + (i.net_interest ?? 0), 0)
  const totalTds = items.reduce((s, i) => s + (i.tds_amount ?? 0), 0)

  const subject =
    type === 'payouts'
      ? `Interest Payouts — ${items.length} items · ₹${totalNet.toLocaleString('en-IN')} net payable`
      : type === 'maturities'
      ? `Principal Maturities — ${items.length} agreements maturing`
      : `TDS Filings Due — ${items.length} items · ₹${totalTds.toLocaleString('en-IN')} due`

  const rows = items
    .map((item) => {
      const overdueBadge = item.is_overdue
        ? ` <strong style="font-size:10px;color:#b91c1c">[OVERDUE]</strong>`
        : ''
      const dateCell =
        type === 'maturities'
          ? esc(item.maturity_date ?? '')
          : esc(item.due_by ?? '')
      const amountCell =
        type === 'payouts'
          ? `<td style="padding:6px 12px;text-align:right">₹${(item.gross_interest ?? 0).toLocaleString('en-IN')}</td>
             <td style="padding:6px 12px;text-align:right">₹${(item.tds_amount ?? 0).toLocaleString('en-IN')}</td>
             <td style="padding:6px 12px;text-align:right;font-weight:600">₹${(item.net_interest ?? 0).toLocaleString('en-IN')}</td>`
          : type === 'maturities'
          ? `<td style="padding:6px 12px;text-align:right;font-weight:600">₹${(item.principal_amount ?? 0).toLocaleString('en-IN')}</td>`
          : `<td style="padding:6px 12px;text-align:right;font-weight:600">₹${(item.tds_amount ?? 0).toLocaleString('en-IN')}</td>`
      return `<tr>
        <td style="padding:6px 12px">${esc(item.investor_name)}${overdueBadge}</td>
        <td style="padding:6px 12px;font-family:monospace;font-size:12px">${esc(item.reference_id)}</td>
        <td style="padding:6px 12px">${dateCell}</td>
        ${amountCell}
      </tr>`
    })
    .join('')

  const headerCols =
    type === 'payouts'
      ? '<th>Investor</th><th>Ref</th><th>Due By</th><th>Gross</th><th>TDS</th><th>Net Payable</th>'
      : type === 'maturities'
      ? '<th>Investor</th><th>Ref</th><th>Maturity Date</th><th>Principal</th>'
      : '<th>Investor</th><th>Ref</th><th>Due By</th><th>TDS Amount</th>'

  const html = `
    <h2>${esc(subject)}</h2>
    <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
      <thead>
        <tr style="background:#f1f5f9;color:#475569">${headerCols}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">
      Sent manually from Good Earth Investment Tracker.
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/notifications">View Notifications →</a>
    </p>`

  return sendEmail({ to: [recipientEmail], subject, html })
}
```

Note: `esc` is already defined at the top of `src/lib/email.ts` — do not redefine it.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean build, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: add sendBatchNotification email helper"
```

---

## Task 4: Write tests for the send route

**Files:**
- Create: `src/__tests__/notifications-send.test.ts`

These tests verify the route logic in isolation using mocked Supabase and email.

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

// Mock email lib
vi.mock('@/lib/email', () => ({
  sendBatchNotification: vi.fn().mockResolvedValue({ success: true, id: 'email-1' }),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { sendBatchNotification } from '@/lib/email'

// Helper to build a minimal mock Supabase chain
function buildSupabaseMock(overrides: Record<string, unknown> = {}) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    ...overrides,
  }
  return chain
}

describe('POST /api/notifications/send — route logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks salesperson role', async () => {
    // Import after mocks are set up
    const { POST } = await import('@/app/api/notifications/send/route')
    const req = new Request('http://localhost/api/notifications/send', {
      method: 'POST',
      headers: { 'x-user-role': 'salesperson', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payouts', ids: ['pay-1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('returns 400 for missing ids', async () => {
    const { POST } = await import('@/app/api/notifications/send/route')
    const req = new Request('http://localhost/api/notifications/send', {
      method: 'POST',
      headers: { 'x-user-role': 'coordinator', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payouts', ids: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 and calls sendBatchNotification for valid payouts request', async () => {
    const mockPayout = {
      id: 'pay-1', agreement_id: 'agr-1', is_tds_only: false,
      due_by: '2026-06-01', gross_interest: 3000, tds_amount: 300, net_interest: 2700,
      agreement: { investor_name: 'Test Investor', reference_id: 'GE-2026-001' },
    }
    const mockAccountant = { email: 'valli@goodearth.org.in' }
    const mockReminders = { error: null }

    const supabaseMock = {
      from: vi.fn((table: string) => {
        if (table === 'payout_schedule') {
          return { select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: undefined,
            // make it thenable
            ...{ [Symbol.iterator]: undefined },
            // final resolution
            data: [mockPayout], error: null,
          }
        }
        if (table === 'team_members') {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [mockAccountant], error: null }) }
        }
        if (table === 'reminders') {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockResolvedValue(mockReminders) }
        }
        return buildSupabaseMock()
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(supabaseMock as never)

    const { POST } = await import('@/app/api/notifications/send/route')
    const req = new Request('http://localhost/api/notifications/send', {
      method: 'POST',
      headers: { 'x-user-role': 'coordinator', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payouts', ids: ['pay-1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(sendBatchNotification).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests (expect failures — route doesn't exist yet)**

```bash
npx vitest run src/__tests__/notifications-send.test.ts 2>&1 | tail -20
```

Expected: test file loads, tests fail with "Cannot find module" or similar.

- [ ] **Step 3: Commit the test file**

```bash
git add src/__tests__/notifications-send.test.ts
git commit -m "test: add notifications send route tests (red)"
```

---

## Task 5: Create `POST /api/notifications/send` route

**Files:**
- Create: `src/app/api/notifications/send/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBatchNotification, type BatchNotificationItem } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { type, ids } = body as { type: 'payouts' | 'maturities' | 'tds'; ids: string[] }

    if (!type || !ids || ids.length === 0) {
      return NextResponse.json({ error: 'type and ids are required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Fetch items
    let items: BatchNotificationItem[] = []
    let payoutScheduleIds: string[] = []
    let agreementIds: string[] = []

    if (type === 'payouts' || type === 'tds') {
      const { data, error } = await supabase
        .from('payout_schedule')
        .select('id, due_by, gross_interest, tds_amount, net_interest, is_tds_only, agreement:agreements!inner(investor_name, reference_id)')
        .in('id', ids)
      if (error) throw error
      payoutScheduleIds = ids
      items = (data ?? []).map((p: any) => ({
        investor_name: p.agreement.investor_name,
        reference_id: p.agreement.reference_id,
        due_by: p.due_by,
        gross_interest: p.gross_interest,
        tds_amount: p.tds_amount,
        net_interest: p.net_interest,
      }))
    } else {
      const { data, error } = await supabase
        .from('agreements')
        .select('id, investor_name, reference_id, maturity_date, principal_amount')
        .in('id', ids)
      if (error) throw error
      agreementIds = ids
      items = (data ?? []).map((a: any) => ({
        investor_name: a.investor_name,
        reference_id: a.reference_id,
        maturity_date: a.maturity_date,
        principal_amount: a.principal_amount,
      }))
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'No items found for given ids' }, { status: 404 })
    }

    // 2. Idempotency check — warn if any item notified in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    let warned = false

    if (payoutScheduleIds.length > 0) {
      const { data: recent } = await supabase
        .from('reminders')
        .select('id')
        .in('payout_schedule_id', payoutScheduleIds)
        .eq('status', 'sent')
        .gte('sent_at', sevenDaysAgo)
        .limit(1)
      if ((recent ?? []).length > 0) warned = true
    }
    if (agreementIds.length > 0) {
      const { data: recent } = await supabase
        .from('reminders')
        .select('id')
        .in('agreement_id', agreementIds)
        .eq('reminder_type', 'batch_notification')
        .eq('status', 'sent')
        .gte('sent_at', sevenDaysAgo)
        .limit(1)
      if ((recent ?? []).length > 0) warned = true
    }

    // 3. Fetch accountant email
    const { data: accountants, error: accountantError } = await supabase
      .from('team_members')
      .select('email')
      .eq('role', 'accountant')
      .eq('is_active', true)
      .limit(1)
    if (accountantError || !accountants?.length) {
      return NextResponse.json({ error: 'Accountant not found' }, { status: 404 })
    }
    const recipientEmail = accountants[0].email

    // 4. Send email
    const result = await sendBatchNotification({ type, items, recipientEmail })
    if (!result.success) {
      return NextResponse.json({ error: `Email failed: ${result.error}` }, { status: 500 })
    }

    // 5. Log one reminders row per item
    const now = new Date().toISOString()
    const subject =
      type === 'payouts'
        ? `Interest Payouts — ${items.length} items`
        : type === 'maturities'
        ? `Principal Maturities — ${items.length} agreements maturing`
        : `TDS Filings Due — ${items.length} items`

    const reminderRows = ids.map((id) => ({
      reminder_type: 'batch_notification' as const,
      status: 'sent' as const,
      email_to: [recipientEmail],
      email_subject: subject,
      sent_at: now,
      scheduled_at: now,
      ...(type === 'maturities' ? { agreement_id: id } : { payout_schedule_id: id }),
    }))

    const { error: insertError } = await supabase.from('reminders').insert(reminderRows)
    if (insertError) {
      console.error('Failed to log reminders:', insertError)
      // Don't fail the request — email was sent successfully
    }

    return NextResponse.json({ success: true, warned, emailId: result.id })
  } catch (err) {
    console.error('notifications/send error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Run tests — expect green**

```bash
npx vitest run src/__tests__/notifications-send.test.ts 2>&1 | tail -20
```

Expected: all tests pass. If the Supabase chain mock is tricky, adjust the mock structure to match the actual call pattern (`.from().select().in()` etc.).

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/notifications/send/route.ts
git commit -m "feat: add POST /api/notifications/send route"
```

---

## Task 6: Expand the notifications page server component

**Files:**
- Modify: `src/app/(app)/notifications/page.tsx`

- [ ] **Step 1: Rewrite the server component**

Replace the entire contents of `src/app/(app)/notifications/page.tsx` with:

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import NotificationsClient from '@/components/notifications/NotificationsClient'
import { addDays, format } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const supabase = createAdminClient()
  const today = new Date()
  const window60 = format(addDays(today, 60), 'yyyy-MM-dd')

  // 1. Pending interest payouts (not TDS-only) — overdue + next 60 days
  const { data: payoutsRaw } = await supabase
    .from('payout_schedule')
    .select('id, due_by, gross_interest, tds_amount, net_interest, agreement:agreements!inner(investor_name, reference_id, status, deleted_at)')
    .eq('status', 'pending')
    .eq('is_tds_only', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .lte('due_by', window60)
    .order('due_by', { ascending: true })

  // 2. Pending TDS-only rows — overdue + next 60 days
  const { data: tdsRaw } = await supabase
    .from('payout_schedule')
    .select('id, due_by, tds_amount, agreement:agreements!inner(investor_name, reference_id, status, deleted_at)')
    .eq('status', 'pending')
    .eq('is_tds_only', true)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .lte('due_by', window60)
    .order('due_by', { ascending: true })

  // 3. Active agreements maturing — overdue + next 60 days
  const { data: maturitiesRaw } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, maturity_date, principal_amount')
    .eq('status', 'active')
    .is('deleted_at', null)
    .lte('maturity_date', window60)
    .order('maturity_date', { ascending: true })

  // 4. Sent history — last 30 days
  const thirtyDaysAgo = format(addDays(today, -30), 'yyyy-MM-dd')
  const { data: historyRaw } = await supabase
    .from('reminders')
    .select('id, reminder_type, sent_at, email_subject, email_to')
    .eq('status', 'sent')
    .eq('reminder_type', 'batch_notification')
    .gte('sent_at', thirtyDaysAgo)
    .order('sent_at', { ascending: false })

  const todayStr = format(today, 'yyyy-MM-dd')

  type AgreementInner = { investor_name: string; reference_id: string }

  const payouts = (payoutsRaw ?? []).map((p: any) => ({
    id: p.id as string,
    investor_name: (p.agreement as AgreementInner).investor_name,
    reference_id: (p.agreement as AgreementInner).reference_id,
    due_by: p.due_by as string,
    gross_interest: p.gross_interest as number,
    tds_amount: p.tds_amount as number,
    net_interest: p.net_interest as number,
    is_overdue: (p.due_by as string) < todayStr,
  }))

  const tdsFilings = (tdsRaw ?? []).map((p: any) => ({
    id: p.id as string,
    investor_name: (p.agreement as AgreementInner).investor_name,
    reference_id: (p.agreement as AgreementInner).reference_id,
    due_by: p.due_by as string,
    tds_amount: p.tds_amount as number,
    is_overdue: (p.due_by as string) < todayStr,
  }))

  const maturities = (maturitiesRaw ?? []).map((m: any) => ({
    id: m.id as string,
    investor_name: m.investor_name as string,
    reference_id: m.reference_id as string,
    maturity_date: m.maturity_date as string,
    principal_amount: m.principal_amount as number,
    is_overdue: (m.maturity_date as string) < todayStr,
  }))

  const history = (historyRaw ?? []).map((r: any) => ({
    id: r.id as string,
    reminder_type: r.reminder_type as string,
    sent_at: r.sent_at as string,
    email_subject: r.email_subject as string,
    email_to: r.email_to as string[],
  }))

  return (
    <NotificationsClient
      payouts={payouts}
      tdsFilings={tdsFilings}
      maturities={maturities}
      history={history}
    />
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean. If TypeScript complains about the Supabase join types, the `as any` casts in the map functions handle it — this pattern matches the existing codebase (`NotificationsClient.tsx` line 48).

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/notifications/page.tsx
git commit -m "feat: expand notifications page with 3 queries and history"
```

---

## Task 7: Rebuild `NotificationsClient` with tabs, sections, and history

**Files:**
- Rewrite: `src/components/notifications/NotificationsClient.tsx`

This is the largest task. Write it in one pass.

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/components/notifications/NotificationsClient.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { Bell, Mail, AlertCircle, CheckCircle2, Loader2, Clock, History } from 'lucide-react'

interface PayoutItem {
  id: string
  investor_name: string
  reference_id: string
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_overdue?: boolean
}

interface TdsItem {
  id: string
  investor_name: string
  reference_id: string
  due_by: string
  tds_amount: number
  is_overdue?: boolean
}

interface MaturityItem {
  id: string
  investor_name: string
  reference_id: string
  maturity_date: string
  principal_amount: number
  is_overdue?: boolean
}

interface HistoryItem {
  id: string
  reminder_type: string
  sent_at: string
  email_subject: string
  email_to: string[]
}

interface Props {
  payouts: PayoutItem[]
  tdsFilings: TdsItem[]
  maturities: MaturityItem[]
  history: HistoryItem[]
}

type Tab = 'queue' | 'history'

function OverdueBadge() {
  return (
    <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-[9px] font-bold uppercase tracking-wider border border-red-800/50">
      Overdue
    </span>
  )
}

function useSection<T extends { id: string }>(items: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; warned?: boolean; error?: string } | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    )
  }

  async function send(type: 'payouts' | 'maturities' | 'tds', ids: string[]) {
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, ids }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ success: true, warned: data.warned })
        setSelected(new Set())
      } else {
        setResult({ error: data.error || 'Failed to send' })
      }
    } catch {
      setResult({ error: 'Network error' })
    } finally {
      setSending(false)
    }
  }

  return { selected, toggle, toggleAll, sending, result, send }
}

function SectionFeedback({ result }: { result: { success?: boolean; warned?: boolean; error?: string } | null }) {
  if (!result) return null
  if (result.error) {
    return (
      <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-900/10 border border-red-900/20 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        {result.error}
      </div>
    )
  }
  return (
    <div className="mt-3 flex items-center gap-2 text-emerald-400 text-sm bg-emerald-900/10 border border-emerald-800/20 rounded-xl px-4 py-3">
      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
      Email sent to Valli.{result.warned ? ' Note: some items were notified within the last 7 days.' : ''}
    </div>
  )
}

export default function NotificationsClient({ payouts, tdsFilings, maturities, history }: Props) {
  const [tab, setTab] = useState<Tab>('queue')

  const payoutSection = useSection(payouts)
  const tdsSection = useSection(tdsFilings)
  const maturitySection = useSection(maturities)

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bell className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-bold text-slate-100">Notifications</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {(['queue', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize flex items-center gap-2 ${
              tab === t
                ? 'bg-slate-700 text-slate-100 shadow'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'queue' ? <Mail className="w-4 h-4" /> : <History className="w-4 h-4" />}
            {t === 'queue' ? 'Queue' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        <div className="space-y-6">
          {/* Payouts Section */}
          <Section
            title="Interest Payouts"
            count={payouts.length}
            selected={payoutSection.selected}
            sending={payoutSection.sending}
            result={payoutSection.result}
            onNotifyAll={() => payoutSection.send('payouts', payouts.map((p) => p.id))}
            onNotifySelected={() => payoutSection.send('payouts', Array.from(payoutSection.selected))}
          >
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={payoutSection.selected.size === payouts.length && payouts.length > 0}
                      onChange={payoutSection.toggleAll}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3">Investor</th>
                  <th className="px-4 py-3">Due By</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">TDS</th>
                  <th className="px-4 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {payouts.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => payoutSection.toggle(p.id)}
                    className={`cursor-pointer hover:bg-slate-800/40 transition-colors ${
                      payoutSection.selected.has(p.id) ? 'bg-indigo-900/10' : ''
                    } ${p.is_overdue ? 'bg-red-900/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={payoutSection.selected.has(p.id)}
                        onChange={() => payoutSection.toggle(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{p.investor_name}</span>
                        {p.is_overdue && <OverdueBadge />}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{p.reference_id}</div>
                    </td>
                    <td className={`px-4 py-3 text-sm ${p.is_overdue ? 'text-red-400' : 'text-slate-400'}`}>{p.due_by}</td>
                    <td className="px-4 py-3 text-right text-slate-400 font-mono text-sm">₹{p.gross_interest.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-slate-400 font-mono text-sm">₹{p.tds_amount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono font-bold text-sm">₹{p.net_interest.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic">No interest payouts pending.</td></tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* Maturities Section */}
          <Section
            title="Principal Maturities"
            count={maturities.length}
            selected={maturitySection.selected}
            sending={maturitySection.sending}
            result={maturitySection.result}
            onNotifyAll={() => maturitySection.send('maturities', maturities.map((m) => m.id))}
            onNotifySelected={() => maturitySection.send('maturities', Array.from(maturitySection.selected))}
          >
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={maturitySection.selected.size === maturities.length && maturities.length > 0}
                      onChange={maturitySection.toggleAll}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3">Investor</th>
                  <th className="px-4 py-3">Maturity Date</th>
                  <th className="px-4 py-3 text-right">Principal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {maturities.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => maturitySection.toggle(m.id)}
                    className={`cursor-pointer hover:bg-slate-800/40 transition-colors ${
                      maturitySection.selected.has(m.id) ? 'bg-indigo-900/10' : ''
                    } ${m.is_overdue ? 'bg-red-900/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={maturitySection.selected.has(m.id)}
                        onChange={() => maturitySection.toggle(m.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{m.investor_name}</span>
                        {m.is_overdue && <OverdueBadge />}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{m.reference_id}</div>
                    </td>
                    <td className={`px-4 py-3 text-sm ${m.is_overdue ? 'text-red-400' : 'text-slate-400'}`}>{m.maturity_date}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-mono font-bold text-sm">₹{m.principal_amount.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {maturities.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">No maturities pending.</td></tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* TDS Section */}
          <Section
            title="TDS Filings"
            count={tdsFilings.length}
            selected={tdsSection.selected}
            sending={tdsSection.sending}
            result={tdsSection.result}
            onNotifyAll={() => tdsSection.send('tds', tdsFilings.map((t) => t.id))}
            onNotifySelected={() => tdsSection.send('tds', Array.from(tdsSection.selected))}
          >
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={tdsSection.selected.size === tdsFilings.length && tdsFilings.length > 0}
                      onChange={tdsSection.toggleAll}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3">Investor</th>
                  <th className="px-4 py-3">Due By</th>
                  <th className="px-4 py-3 text-right">TDS Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tdsFilings.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => tdsSection.toggle(t.id)}
                    className={`cursor-pointer hover:bg-slate-800/40 transition-colors ${
                      tdsSection.selected.has(t.id) ? 'bg-indigo-900/10' : ''
                    } ${t.is_overdue ? 'bg-red-900/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={tdsSection.selected.has(t.id)}
                        onChange={() => tdsSection.toggle(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{t.investor_name}</span>
                        {t.is_overdue && <OverdueBadge />}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{t.reference_id}</div>
                    </td>
                    <td className={`px-4 py-3 text-sm ${t.is_overdue ? 'text-red-400' : 'text-slate-400'}`}>{t.due_by}</td>
                    <td className="px-4 py-3 text-right text-sky-400 font-mono font-bold text-sm">₹{t.tds_amount.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {tdsFilings.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">No TDS filings pending.</td></tr>
                )}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Sent (last 30 days) — {history.length}
            </h2>
          </div>
          <div className="divide-y divide-slate-800">
            {history.map((h) => (
              <div key={h.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{h.email_subject}</p>
                    <p className="text-xs text-slate-500 mt-0.5">To: {h.email_to.join(', ')}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {new Date(h.sent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            ))}
            {history.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 italic text-sm">No emails sent in the last 30 days.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Shared section wrapper
function Section({
  title, count, selected, sending, result, onNotifyAll, onNotifySelected, children,
}: {
  title: string
  count: number
  selected: Set<string>
  sending: boolean
  result: { success?: boolean; warned?: boolean; error?: string } | null
  onNotifyAll: () => void
  onNotifySelected: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
          {title} ({count})
        </h2>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={onNotifySelected}
              disabled={sending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Notify Selected ({selected.size})
            </button>
          )}
          {count > 0 && (
            <button
              onClick={onNotifyAll}
              disabled={sending || count === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Notify All
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
      {result && (
        <div className="px-6 pb-4">
          <SectionFeedback result={result} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build is clean**

```bash
npm run build 2>&1 | tail -10
```

Expected: no TypeScript errors. The `Section` component uses `React.ReactNode` — make sure `import React` is not needed (Next.js 14 with the new JSX transform doesn't require it).

- [ ] **Step 3: Run all tests**

```bash
npm test 2>&1 | tail -10
```

Expected: all pass including the notifications-send tests from Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/NotificationsClient.tsx
git commit -m "feat: rebuild NotificationsClient with tabs, sections, checkboxes, history"
```

---

## Task 8: Remove the old monthly-summary UI trigger

**Files:**
- Already handled — `NotificationsClient.tsx` was rewritten in Task 7 and no longer calls `/api/cron/monthly-summary`. Nothing to do here except verify.

- [ ] **Step 1: Confirm the old call is gone**

```bash
grep -r "monthly-summary" src/components src/app/\(app\) --include="*.tsx"
```

Expected: no results (the only remaining reference should be in `src/app/api/cron/monthly-summary/route.ts` itself).

- [ ] **Step 2: Final build + test run**

```bash
npm run build && npm test
```

Expected: clean build, all tests pass.

- [ ] **Step 3: Commit session files and push**

Update `SESSION.md` to mark the batch complete, then:

```bash
git add SESSION.md BACKLOG.md
git commit -m "chore: update session files — Batch F complete"
git push origin feature/batch-f-notifications
```

---

## Self-Review Checklist

- Spec section "Goal" → Task 7 (NotificationsClient rebuild) ✅
- Spec section "Queue Tab — 3 Sections" → Tasks 6 + 7 ✅
- Spec section "History Tab" → Tasks 6 + 7 ✅
- Spec section "Data Window" → Task 6 (60-day filter, separate `due_by` / `maturity_date`) ✅
- Spec section "POST /api/notifications/send" → Tasks 4 + 5 ✅
- Spec section "Email Format" → Task 3 (`sendBatchNotification`) ✅
- Spec section "Types — batch_notification" → Tasks 1 + 2 ✅
- Spec section "Migration 024" → Task 1 ✅
- Spec "Files" table — all 6 entries covered ✅
- Old monthly-summary UI trigger removed → Task 8 ✅
- `sendQuarterlyForecast` untouched → Task 3 explicitly says "leave untouched" ✅
