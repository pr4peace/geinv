# Activity Log & Email Preview Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-salesperson email preview modal before sending reminder summaries, log all sent emails to an activity_log table, and provide an /activity-log page with type filter tabs.

**Architecture:** 9 tasks in order — DB migration first, then the data helper, then email.ts CC support, then the preview API, then the send API rewrite, then the modal component, then dashboard wiring, then the log page, then sidebar nav. Each task is independently committable and testable.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres), TypeScript, Tailwind CSS, Vitest, Resend, date-fns, lucide-react

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/013_activity_log.sql` | Create | activity_log table + activity_send_round_seq sequence |
| `src/types/database.ts` | Modify | Add ActivityLog interface and ActivityLogType |
| `src/lib/activity-log.ts` | Create | logActivity() helper — single insert into activity_log |
| `src/lib/email.ts` | Modify | Add optional cc param to sendEmail |
| `src/app/api/reminders/summary/preview/route.ts` | Create | GET — fetch data, build per-salesperson + master emails, return without sending |
| `src/app/api/reminders/summary/route.ts` | Modify | POST — accept confirmed emails array, send each, log each |
| `src/components/dashboard/SendReminderSummaryModal.tsx` | Create | Client component — idle→loading→preview modal→sending→done |
| `src/app/(app)/dashboard/page.tsx` | Modify | Swap SendReminderSummaryButton for SendReminderSummaryModal |
| `src/app/(app)/activity-log/page.tsx` | Create | Server page — activity log table with client filter tabs |
| `src/app/(app)/layout.tsx` | Modify | Add Activity Log nav item |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/013_activity_log.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/013_activity_log.sql

CREATE SEQUENCE IF NOT EXISTS activity_send_round_seq;

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_number bigint NOT NULL DEFAULT nextval('activity_send_round_seq'::regclass),
  send_round integer,
  type text NOT NULL CHECK (type IN (
    'salesperson_summary', 'master_summary', 'payout_notify', 'quarterly_forecast',
    'payout_marked_paid', 'payout_notified',
    'agreement_created', 'agreement_updated', 'agreement_deleted'
  )),
  subject text,
  sent_to text[],
  sent_cc text[],
  html_body text,
  email_status text CHECK (email_status IN ('sent', 'failed')),
  resend_id text,
  error_message text,
  recipient_name text,
  agreement_id uuid REFERENCES agreements(id) ON DELETE SET NULL,
  payout_schedule_id uuid REFERENCES payout_schedule(id) ON DELETE SET NULL,
  investor_name text,
  investors_count integer,
  actor text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_agreement_id ON activity_log(agreement_id);
```

- [ ] **Step 2: Push migration to Supabase**

```bash
cd "/Users/prashanthpalanisamy/Library/Mobile Documents/com~apple~CloudDocs/Coding/geinv"
npx supabase db push --linked
```

Expected: Migration applied with no errors.

- [ ] **Step 3: Verify table exists**

```bash
npx supabase db query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'activity_log' ORDER BY ordinal_position;" --linked
```

Expected: Rows for id, sequence_number, send_round, type, subject, sent_to, sent_cc, html_body, email_status, resend_id, error_message, recipient_name, agreement_id, payout_schedule_id, investor_name, investors_count, actor, notes, created_at.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_activity_log.sql
git commit -m "feat: activity_log migration — email + payout + agreement events"
```

---

## Task 2: TypeScript Types + logActivity Helper

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/lib/activity-log.ts`
- Create: `src/__tests__/activity-log.test.ts`

- [ ] **Step 1: Add types to `src/types/database.ts`**

At the top of the file, after the existing type exports, add:

```ts
export type ActivityLogType =
  | 'salesperson_summary'
  | 'master_summary'
  | 'payout_notify'
  | 'quarterly_forecast'
  | 'payout_marked_paid'
  | 'payout_notified'
  | 'agreement_created'
  | 'agreement_updated'
  | 'agreement_deleted'

export interface ActivityLog {
  id: string
  sequence_number: number
  send_round: number | null
  type: ActivityLogType
  subject: string | null
  sent_to: string[] | null
  sent_cc: string[] | null
  html_body: string | null
  email_status: 'sent' | 'failed' | null
  resend_id: string | null
  error_message: string | null
  recipient_name: string | null
  agreement_id: string | null
  payout_schedule_id: string | null
  investor_name: string | null
  investors_count: number | null
  actor: string | null
  notes: string | null
  created_at: string
}
```

- [ ] **Step 2: Write failing test**

Create `src/__tests__/activity-log.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.fn().mockReturnValue({ then: (r: (v: { error: null }) => unknown) => r({ error: null }) })
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

import { logActivity } from '@/lib/activity-log'

describe('logActivity', () => {
  beforeEach(() => {
    mockFrom.mockClear()
    mockInsert.mockClear()
  })

  it('inserts an email event into activity_log', async () => {
    await logActivity({
      type: 'salesperson_summary',
      send_round: 1,
      subject: 'Test Subject',
      sent_to: ['valli@example.com'],
      sent_cc: ['preetha@example.com'],
      html_body: '<p>hello</p>',
      email_status: 'sent',
      resend_id: 'resend-123',
      recipient_name: 'Preetha Shankar',
      investors_count: 2,
    })

    expect(mockFrom).toHaveBeenCalledWith('activity_log')
    const insertArg = mockInsert.mock.calls[0][0]
    expect(insertArg.type).toBe('salesperson_summary')
    expect(insertArg.sent_to).toEqual(['valli@example.com'])
    expect(insertArg.email_status).toBe('sent')
    expect(insertArg.resend_id).toBe('resend-123')
  })

  it('inserts a payout action event', async () => {
    await logActivity({
      type: 'payout_marked_paid',
      agreement_id: 'agr-1',
      payout_schedule_id: 'pay-1',
      investor_name: 'Alice',
      actor: 'irene.mariam@goodearth.org.in',
    })

    expect(mockFrom).toHaveBeenCalledWith('activity_log')
    const insertArg = mockInsert.mock.calls[0][0]
    expect(insertArg.type).toBe('payout_marked_paid')
    expect(insertArg.investor_name).toBe('Alice')
  })

  it('does not throw if insert returns error — logs to console', async () => {
    mockInsert.mockReturnValueOnce({
      then: (r: (v: { error: { message: string } }) => unknown) => r({ error: { message: 'db error' } }),
    })
    await expect(logActivity({ type: 'payout_notified', investor_name: 'Bob' })).resolves.not.toThrow()
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
npx vitest run src/__tests__/activity-log.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/activity-log'`

- [ ] **Step 4: Create `src/lib/activity-log.ts`**

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { ActivityLogType } from '@/types/database'

export async function logActivity(params: {
  type: ActivityLogType
  send_round?: number
  subject?: string
  sent_to?: string[]
  sent_cc?: string[]
  html_body?: string
  email_status?: 'sent' | 'failed'
  resend_id?: string
  error_message?: string
  recipient_name?: string
  agreement_id?: string
  payout_schedule_id?: string
  investor_name?: string
  investors_count?: number
  actor?: string
  notes?: string
}): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('activity_log').insert({
    type: params.type,
    send_round: params.send_round ?? null,
    subject: params.subject ?? null,
    sent_to: params.sent_to ?? null,
    sent_cc: params.sent_cc ?? null,
    html_body: params.html_body ?? null,
    email_status: params.email_status ?? null,
    resend_id: params.resend_id ?? null,
    error_message: params.error_message ?? null,
    recipient_name: params.recipient_name ?? null,
    agreement_id: params.agreement_id ?? null,
    payout_schedule_id: params.payout_schedule_id ?? null,
    investor_name: params.investor_name ?? null,
    investors_count: params.investors_count ?? null,
    actor: params.actor ?? null,
    notes: params.notes ?? null,
  })
  if (error) {
    console.error('[logActivity] Failed to log activity:', error.message)
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/activity-log.test.ts
```

Expected: 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/lib/activity-log.ts src/__tests__/activity-log.test.ts
git commit -m "feat: ActivityLog types and logActivity helper"
```

---

## Task 3: Add CC Support to sendEmail

**Files:**
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Update sendEmail signature and implementation**

In `src/lib/email.ts`, update `sendEmail` to accept an optional `cc` param:

```ts
export async function sendEmail(params: {
  to: string[]
  subject: string
  html: string
  cc?: string[]
}): Promise<SendEmailResult> {
  const resend = getResendClient()
  if (!resend) {
    console.log('[Email stub] Would send to:', params.to, 'CC:', params.cc, 'Subject:', params.subject)
    return { success: true, id: 'stub-' + Date.now() }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      cc: params.cc && params.cc.length > 0 ? params.cc : undefined,
      bcc: BCC_EMAILS.length > 0 ? BCC_EMAILS : undefined,
      subject: params.subject,
      html: params.html,
    })
    if (error) return { success: false, error: error.message }
    return { success: true, id: data?.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: add optional cc param to sendEmail"
```

---

## Task 4: Preview API Route

**Files:**
- Create: `src/app/api/reminders/summary/preview/route.ts`

This route builds all emails and returns them for display in the modal. It does **not** send anything.

- [ ] **Step 1: Create `src/app/api/reminders/summary/preview/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPayoutReminders, getMaturingAgreements, getDocsPendingReturn } from '@/lib/dashboard-reminders'
import { format } from 'date-fns'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmt = (n: number) => '₹' + n.toLocaleString('en-IN')

export type PreviewEmail = {
  id: string
  type: 'salesperson_summary' | 'master_summary'
  recipient_name: string
  to: Array<{ name: string; email: string }>
  cc: Array<{ name: string; email: string }>
  subject: string
  html: string
  investors_count: number
}

export type PreviewResponse = {
  send_round: number
  monthLabel: string
  emails: PreviewEmail[]
}

function buildPayoutTable(
  payouts: Array<{ investor_name: string; reference_id: string; period_to: string; net_interest: number; tds_amount: number }>,
  monthLabel: string
): string {
  if (payouts.length === 0) return '<p style="color:#6b7280;font-style:italic;font-size:13px;">No payouts.</p>'
  const rows = payouts.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:500;">${esc(r.investor_name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;font-family:monospace;color:#6b7280;">${esc(r.reference_id)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151;">${esc(r.period_to)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:600;text-align:right;color:#1d4ed8;">${fmt(r.net_interest)}</td>
    </tr>`).join('')
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;border-bottom:2px solid #e5e7eb;">Investor</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;border-bottom:2px solid #e5e7eb;">Ref</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;border-bottom:2px solid #e5e7eb;">Due Till</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;border-bottom:2px solid #e5e7eb;">Net Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function buildSalespersonEmail(
  salespersonName: string,
  monthLabel: string,
  payouts: Array<{ investor_name: string; reference_id: string; period_to: string; net_interest: number; tds_amount: number }>,
  maturities: Array<{ investor_name: string; reference_id: string; maturity_date: string; principal_amount: number }>
): string {
  const netTotal = payouts.reduce((s, r) => s + r.net_interest, 0)
  const maturityRows = maturities.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:500;">${esc(a.investor_name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;font-family:monospace;color:#6b7280;">${esc(a.reference_id)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">${esc(a.maturity_date)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:600;text-align:right;color:#059669;">${fmt(a.principal_amount)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a3a2a;padding:20px 28px;">
          <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#86efac;">Good Earth Investments</p>
          <h1 style="margin:4px 0 0;font-size:18px;font-weight:700;color:#ffffff;">Payout Reminder — ${esc(monthLabel)}</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#86efac;">Your investor payouts requiring action</p>
        </td></tr>
        ${netTotal > 0 ? `<tr><td style="background:#f0fdf4;padding:10px 28px;border-bottom:1px solid #dcfce7;">
          <p style="margin:0;font-size:13px;color:#166534;">Net payable: <strong>${fmt(netTotal)}</strong></p>
        </td></tr>` : ''}
        <tr><td style="padding:24px 28px;">
          <h3 style="font-size:13px;font-weight:600;color:#374151;margin:0 0 12px;">Interest Payouts</h3>
          ${buildPayoutTable(payouts, monthLabel)}
          ${maturities.length > 0 ? `
          <h3 style="font-size:13px;font-weight:600;color:#374151;margin:20px 0 12px;">Maturing This Month</h3>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead><tr style="background:#f8fafc;">
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#9ca3af;border-bottom:2px solid #e5e7eb;">Investor</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#9ca3af;border-bottom:2px solid #e5e7eb;">Ref</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#9ca3af;border-bottom:2px solid #e5e7eb;">Maturity Date</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#9ca3af;border-bottom:2px solid #e5e7eb;">Principal</th>
            </tr></thead>
            <tbody>${maturityRows}</tbody>
          </table>` : ''}
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
            <tr><td align="center">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;background:#1a3a2a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 20px;border-radius:6px;">View Dashboard →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">Good Earth Investment Tracker · Automated reminder</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim()
}

export async function GET() {
  try {
    const supabase = createAdminClient()
    const monthLabel = format(new Date(), 'MMMM yyyy')

    // Get next send_round value without consuming (will be consumed on POST)
    const { data: seqData } = await supabase.rpc('nextval_peek', { seq: 'activity_send_round_seq' }).maybeSingle()
    const send_round: number = (seqData as { nextval?: number } | null)?.nextval ?? Date.now()

    const [payouts, maturing] = await Promise.all([
      getPayoutReminders(),
      getMaturingAgreements(),
    ])

    // Fetch salesperson details for all payout agreements
    const allPayouts = [...payouts.overdue, ...payouts.thisMonth]
    const agreementIds = [...new Set(allPayouts.map(p => p.agreement_id))]

    let salespersonMap: Record<string, { id: string; name: string; email: string }> = {}
    if (agreementIds.length > 0) {
      const { data: agreements } = await supabase
        .from('agreements')
        .select('id, salesperson_id, salesperson_custom, salesperson:team_members!agreements_salesperson_id_fkey(id, name, email)')
        .in('id', agreementIds)

      for (const agr of agreements ?? []) {
        const sp = (agr as { id: string; salesperson?: { id: string; name: string; email: string } | null }).salesperson
        if (sp?.email) {
          salespersonMap[agr.id] = sp
        }
      }
    }

    // Fetch Valli (accountant)
    const { data: accountants } = await supabase
      .from('team_members')
      .select('id, name, email')
      .eq('role', 'accountant')
      .eq('is_active', true)

    const valli = accountants?.[0]
    if (!valli) {
      return NextResponse.json({ error: 'No active accountant found' }, { status: 404 })
    }

    // Group payouts by salesperson
    const bySalesperson = new Map<string, {
      salesperson: { id: string; name: string; email: string }
      payouts: typeof allPayouts
      maturities: typeof maturing.agreements
    }>()

    for (const payout of allPayouts) {
      const sp = salespersonMap[payout.agreement_id]
      if (!sp) continue
      if (!bySalesperson.has(sp.id)) {
        // Find maturities for this salesperson's agreements
        bySalesperson.set(sp.id, { salesperson: sp, payouts: [], maturities: [] })
      }
      bySalesperson.get(sp.id)!.payouts.push(payout)
    }

    // Add maturities to each salesperson group
    if (agreementIds.length > 0) {
      const maturingIds = maturing.agreements.map(a => a.id)
      if (maturingIds.length > 0) {
        const { data: maturingAgreements } = await supabase
          .from('agreements')
          .select('id, salesperson_id')
          .in('id', maturingIds)

        for (const agr of maturingAgreements ?? []) {
          const sp = salespersonMap[agr.id]
          if (sp && bySalesperson.has(sp.id)) {
            const maturingRow = maturing.agreements.find(a => a.id === agr.id)
            if (maturingRow) bySalesperson.get(sp.id)!.maturities.push(maturingRow)
          }
        }
      }
    }

    const emails: PreviewEmail[] = []

    // One email per salesperson
    for (const [, group] of bySalesperson) {
      if (group.payouts.length === 0 && group.maturities.length === 0) continue
      const subject = `Payout Reminder — ${monthLabel} — Your Investors`
      emails.push({
        id: group.salesperson.id,
        type: 'salesperson_summary',
        recipient_name: group.salesperson.name,
        to: [{ name: group.salesperson.name, email: group.salesperson.email }],
        cc: [{ name: valli.name, email: valli.email }],
        subject,
        html: buildSalespersonEmail(group.salesperson.name, monthLabel, group.payouts, group.maturities),
        investors_count: group.payouts.length + group.maturities.length,
      })
    }

    // Master summary — unchecked by default, shown last
    // Import buildSummaryEmail-equivalent inline (reuse the one from the POST route via shared util)
    emails.push({
      id: 'master',
      type: 'master_summary',
      recipient_name: 'Master Summary (All Investors)',
      to: [{ name: valli.name, email: valli.email }],
      cc: [],
      subject: `Reminder Summary — ${monthLabel}`,
      html: '', // filled client-side note: master HTML is built on POST; preview shows placeholder
      investors_count: allPayouts.length + maturing.agreements.length,
    })

    const response: PreviewResponse = { send_round, monthLabel, emails }
    return NextResponse.json(response)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reminders/summary/preview/route.ts
git commit -m "feat: GET /api/reminders/summary/preview — per-salesperson email preview"
```

---

## Task 5: Rewrite POST /api/reminders/summary

**Files:**
- Modify: `src/app/api/reminders/summary/route.ts`

Replace the existing POST handler. It now accepts a pre-built list of emails from the modal, sends each, and logs each to activity_log.

- [ ] **Step 1: Replace `src/app/api/reminders/summary/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { logActivity } from '@/lib/activity-log'
import { getPayoutReminders, getMaturingAgreements, getDocsPendingReturn } from '@/lib/dashboard-reminders'
import { format } from 'date-fns'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmt = (n: number) => '₹' + n.toLocaleString('en-IN')

// Build the master summary HTML (same design as the existing summary email)
function buildMasterSummaryHtml(
  monthLabel: string,
  overdue: Awaited<ReturnType<typeof getPayoutReminders>>['overdue'],
  thisMonth: Awaited<ReturnType<typeof getPayoutReminders>>['thisMonth'],
  maturing: Awaited<ReturnType<typeof getMaturingAgreements>>['agreements'],
  docs: Awaited<ReturnType<typeof getDocsPendingReturn>>
): string {
  const td = (content: string, extra = '') =>
    `<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151;${extra}">${content}</td>`
  const tdMono = (content: string) =>
    `<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#6b7280;font-family:monospace;">${content}</td>`
  const tableHead = (cols: string[]) =>
    `<tr style="background:#f8fafc;">${cols.map(c =>
      `<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;border-bottom:2px solid #e5e7eb;">${c}</th>`
    ).join('')}</tr>`
  const sectionBlock = (title: string, accentColor: string, badge: string, rows: string, cols: string[], emptyMsg: string) => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
          <tr>
            <td style="font-size:14px;font-weight:600;color:#111827;">${title}</td>
            <td style="text-align:right;"><span style="background:${accentColor}18;color:${accentColor};font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;">${badge}</span></td>
          </tr>
        </table>
        ${rows ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"><thead>${tableHead(cols)}</thead><tbody>${rows}</tbody></table>`
          : `<p style="font-size:13px;color:#9ca3af;font-style:italic;margin:0;">${emptyMsg}</p>`}
      </td></tr>
    </table>`

  const overdueRows = overdue.map(r => `<tr>${td(esc(r.investor_name), 'font-weight:500;')}${tdMono(esc(r.reference_id))}${td(esc(r.period_to))}${td(fmt(r.net_interest), 'text-align:right;font-weight:600;color:#dc2626;')}</tr>`).join('')
  const thisMonthRows = thisMonth.map(r => `<tr>${td(esc(r.investor_name), 'font-weight:500;')}${tdMono(esc(r.reference_id))}${td(esc(r.period_to))}${td(fmt(r.net_interest), 'text-align:right;font-weight:600;color:#1d4ed8;')}</tr>`).join('')
  const maturingRows = maturing.map(a => `<tr>${td(esc(a.investor_name), 'font-weight:500;')}${tdMono(esc(a.reference_id))}${td(esc(a.maturity_date))}${td(fmt(a.principal_amount), 'text-align:right;font-weight:600;color:#059669;')}</tr>`).join('')
  const docRows = docs.map(d => `<tr>${td(esc(d.investor_name), 'font-weight:500;')}${tdMono(esc(d.reference_id))}${td(esc(d.doc_sent_to_client_date))}${td(`${d.daysSinceSent} days${d.isOverdue ? ' — overdue' : ''}`, `color:${d.isOverdue ? '#ea580c' : '#6b7280'};font-weight:${d.isOverdue ? '600' : '400'};`)}</tr>`).join('')
  const netTotal = [...overdue, ...thisMonth].reduce((s, r) => s + r.net_interest, 0)

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a3a2a;padding:24px 32px;">
          <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#86efac;">Good Earth Investments</p>
          <h1 style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ffffff;">Master Summary — ${esc(monthLabel)}</h1>
        </td></tr>
        ${netTotal > 0 ? `<tr><td style="background:#f0fdf4;padding:12px 32px;border-bottom:1px solid #dcfce7;"><p style="margin:0;font-size:13px;color:#166534;">Total net payable: <strong>${fmt(netTotal)}</strong>${overdue.length > 0 ? ` · <span style="color:#dc2626;font-weight:600;">${overdue.length} overdue</span>` : ''}</p></td></tr>` : ''}
        <tr><td style="padding:28px 32px;">
          ${sectionBlock('⚠️ Overdue', '#dc2626', `${overdue.length} overdue`, overdueRows, ['Investor','Ref','Due Till','Net Amount'], 'No overdue payouts.')}
          ${sectionBlock(`📅 Due in ${esc(monthLabel)}`, '#1d4ed8', `${thisMonth.length} due`, thisMonthRows, ['Investor','Ref','Due Till','Net Amount'], 'No payouts due this month.')}
          ${sectionBlock('📋 Maturing', '#059669', `${maturing.length} maturing`, maturingRows, ['Investor','Ref','Maturity Date','Principal'], 'None.')}
          ${sectionBlock('📁 Docs Pending Return', '#ea580c', `${docs.length} pending`, docRows, ['Investor','Ref','Sent Date','Days Since Sent'], 'None.')}
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;background:#1a3a2a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 24px;border-radius:6px;">View Dashboard →</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">Good Earth Investment Tracker · Automated reminder summary</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim()
}

type ConfirmedEmail = {
  id: string
  type: 'salesperson_summary' | 'master_summary'
  subject: string
  html: string
  to: string[]
  cc: string[]
  recipient_name: string
  investors_count: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { send_round: number; emails: ConfirmedEmail[] }
    const { send_round, emails } = body

    if (!emails || emails.length === 0) {
      return NextResponse.json({ error: 'No emails to send' }, { status: 400 })
    }

    // For master summary email, build the HTML server-side
    const masterEmail = emails.find(e => e.type === 'master_summary')
    let masterHtml = masterEmail?.html ?? ''
    if (masterEmail && !masterHtml) {
      const [payouts, maturing, docs] = await Promise.all([
        getPayoutReminders(), getMaturingAgreements(), getDocsPendingReturn(),
      ])
      masterHtml = buildMasterSummaryHtml(
        format(new Date(), 'MMMM yyyy'),
        payouts.overdue, payouts.thisMonth, maturing.agreements, docs
      )
    }

    const results: Array<{ id: string; status: string; error?: string }> = []

    for (const email of emails) {
      const html = email.type === 'master_summary' ? masterHtml : email.html
      const result = await sendEmail({ to: email.to, cc: email.cc.length > 0 ? email.cc : undefined, subject: email.subject, html })

      await logActivity({
        type: email.type,
        send_round,
        subject: email.subject,
        sent_to: email.to,
        sent_cc: email.cc.length > 0 ? email.cc : undefined,
        html_body: html,
        email_status: result.success ? 'sent' : 'failed',
        resend_id: result.id,
        error_message: result.error,
        recipient_name: email.recipient_name,
        investors_count: email.investors_count,
      })

      results.push({ id: email.id, status: result.success ? 'sent' : 'failed', error: result.error })
    }

    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reminders/summary/route.ts
git commit -m "feat: rewrite POST /api/reminders/summary — per-salesperson send + activity logging"
```

---

## Task 6: SendReminderSummaryModal Component

**Files:**
- Create: `src/components/dashboard/SendReminderSummaryModal.tsx`

Replace the existing `SendReminderSummaryButton.tsx`. This new component handles the full preview modal flow.

- [ ] **Step 1: Create `src/components/dashboard/SendReminderSummaryModal.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { PreviewEmail, PreviewResponse } from '@/app/api/reminders/summary/preview/route'

type State = 'idle' | 'loading' | 'preview' | 'sending' | 'done'

type EditableEmail = PreviewEmail & {
  included: boolean
  toEditable: Array<{ name: string; email: string }>
  ccEditable: Array<{ name: string; email: string }>
}

function RecipientChip({
  name, email, onRemove,
}: { name: string; email: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-xs">
      {name || email}
      <button onClick={onRemove} className="text-slate-400 hover:text-red-400 ml-0.5 leading-none">×</button>
    </span>
  )
}

function AddRecipientInput({ onAdd }: { onAdd: (email: string) => void }) {
  const [value, setValue] = useState('')
  function handleAdd() {
    const trimmed = value.trim()
    if (!trimmed || !trimmed.includes('@')) return
    onAdd(trimmed)
    setValue('')
  }
  return (
    <div className="flex gap-1 mt-1">
      <input
        type="email"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAdd()}
        placeholder="Add email..."
        className="flex-1 bg-slate-700 text-slate-200 text-xs rounded px-2 py-1 border border-slate-600 focus:outline-none focus:border-indigo-500"
      />
      <button onClick={handleAdd} className="px-2 py-1 text-xs rounded bg-slate-600 text-slate-200 hover:bg-slate-500">+</button>
    </div>
  )
}

function EmailCard({
  email,
  onChange,
}: {
  email: EditableEmail
  onChange: (updated: Partial<EditableEmail>) => void
}) {
  const isMaster = email.type === 'master_summary'
  return (
    <div className={`border rounded-lg overflow-hidden ${email.included ? 'border-slate-600' : 'border-slate-700 opacity-50'}`}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700">
        <input
          type="checkbox"
          checked={email.included}
          onChange={e => onChange({ included: e.target.checked })}
          className="w-4 h-4 rounded accent-indigo-500"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-100">{email.recipient_name}</p>
          <p className="text-xs text-slate-400">
            {email.investors_count} investor{email.investors_count !== 1 ? 's' : ''}
            {isMaster && ' · all data'}
            {!email.included && ' · excluded'}
          </p>
        </div>
        {isMaster && (
          <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">Optional</span>
        )}
      </div>

      {email.included && (
        <div className="p-4 space-y-3">
          {/* Email preview iframe */}
          {email.html ? (
            <iframe
              srcDoc={email.html}
              className="w-full rounded border border-slate-700"
              style={{ height: 320 }}
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="h-24 flex items-center justify-center bg-slate-800 rounded border border-slate-700">
              <p className="text-xs text-slate-500 italic">Master summary preview generated on send</p>
            </div>
          )}

          {/* To */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-1">To</p>
            <div className="flex flex-wrap gap-1">
              {email.toEditable.map((r, i) => (
                <RecipientChip
                  key={i} name={r.name} email={r.email}
                  onRemove={() => onChange({ toEditable: email.toEditable.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
            <AddRecipientInput onAdd={e => onChange({ toEditable: [...email.toEditable, { name: e, email: e }] })} />
          </div>

          {/* CC */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-1">CC</p>
            <div className="flex flex-wrap gap-1">
              {email.ccEditable.map((r, i) => (
                <RecipientChip
                  key={i} name={r.name} email={r.email}
                  onRemove={() => onChange({ ccEditable: email.ccEditable.filter((_, j) => j !== i) })}
                />
              ))}
              {email.ccEditable.length === 0 && <span className="text-xs text-slate-500 italic">No CC</span>}
            </div>
            <AddRecipientInput onAdd={e => onChange({ ccEditable: [...email.ccEditable, { name: e, email: e }] })} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function SendReminderSummaryModal() {
  const [state, setState] = useState<State>('idle')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [emails, setEmails] = useState<EditableEmail[]>([])
  const [results, setResults] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function updateEmail(id: string, patch: Partial<EditableEmail>) {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  async function handleOpen() {
    setState('loading')
    setError(null)
    try {
      const res = await fetch('/api/reminders/summary/preview')
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? 'Failed to load preview')
        setState('idle')
        return
      }
      const data: PreviewResponse = await res.json()
      setPreview(data)
      setEmails(data.emails.map(e => ({
        ...e,
        included: e.type !== 'master_summary', // master unchecked by default
        toEditable: e.to,
        ccEditable: e.cc,
      })))
      setState('preview')
    } catch {
      setError('Network error')
      setState('idle')
    }
  }

  async function handleSend() {
    if (!preview) return
    setState('sending')
    setError(null)
    const selected = emails.filter(e => e.included && e.toEditable.length > 0)
    if (selected.length === 0) {
      setError('No emails selected or all recipients removed')
      setState('preview')
      return
    }
    try {
      const res = await fetch('/api/reminders/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          send_round: preview.send_round,
          emails: selected.map(e => ({
            id: e.id,
            type: e.type,
            subject: e.subject,
            html: e.html,
            to: e.toEditable.map(r => r.email),
            cc: e.ccEditable.map(r => r.email),
            recipient_name: e.recipient_name,
            investors_count: e.investors_count,
          })),
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error ?? 'Failed to send')
        setState('preview')
        return
      }
      const sentCount = (j.results as Array<{ status: string }>).filter(r => r.status === 'sent').length
      setResults(`${sentCount} email${sentCount !== 1 ? 's' : ''} sent`)
      setState('done')
      setTimeout(() => setState('idle'), 4000)
    } catch {
      setError('Network error')
      setState('preview')
    }
  }

  const selectedCount = emails.filter(e => e.included).length

  return (
    <>
      {/* Trigger button */}
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={handleOpen}
          disabled={state === 'loading' || state === 'sending'}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white transition-colors disabled:opacity-50"
        >
          {state === 'loading' ? 'Loading…' : 'Send Summary to Accounts'}
        </button>
        {state === 'done' && results && (
          <p className="text-xs text-green-400">{results}</p>
        )}
        {error && state === 'idle' && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* Modal */}
      {(state === 'preview' || state === 'sending') && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl my-8 flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Preview — {preview?.monthLabel}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{emails.length} email{emails.length !== 1 ? 's' : ''} prepared · {selectedCount} selected</p>
              </div>
              <button onClick={() => setState('idle')} className="text-slate-400 hover:text-slate-200 text-lg leading-none">×</button>
            </div>

            {/* Email cards */}
            <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
              {error && <p className="text-xs text-red-400">{error}</p>}
              {emails.map(email => (
                <EmailCard
                  key={email.id}
                  email={email}
                  onChange={patch => updateEmail(email.id, patch)}
                />
              ))}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
              <button onClick={() => setState('idle')} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
              <button
                onClick={handleSend}
                disabled={state === 'sending' || selectedCount === 0}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
              >
                {state === 'sending' ? 'Sending…' : `Send ${selectedCount} Email${selectedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/SendReminderSummaryModal.tsx
git commit -m "feat: SendReminderSummaryModal — preview, edit recipients, per-salesperson send"
```

---

## Task 7: Wire Modal into Dashboard

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Swap button for modal in dashboard page**

In `src/app/(app)/dashboard/page.tsx`, change:

```tsx
import SendReminderSummaryButton from '@/components/dashboard/SendReminderSummaryButton'
```

to:

```tsx
import SendReminderSummaryModal from '@/components/dashboard/SendReminderSummaryModal'
```

And change:

```tsx
<SendReminderSummaryButton />
```

to:

```tsx
<SendReminderSummaryModal />
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors

- [ ] **Step 3: Start dev server and test manually**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard`. Click "Send Summary to Accounts". The modal should open showing email cards for each salesperson with payouts this month, plus a master summary card (unchecked). Verify recipient chips can be removed and emails added.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: wire SendReminderSummaryModal into dashboard"
```

---

## Task 8: Activity Log Page

**Files:**
- Create: `src/app/(app)/activity-log/page.tsx`

- [ ] **Step 1: Create `src/app/(app)/activity-log/page.tsx`**

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import type { ActivityLog } from '@/types/database'
import ActivityLogClient from '@/components/activity-log/ActivityLogClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Activity Log — Good Earth Investment Tracker',
}

async function getActivityLog(): Promise<ActivityLog[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, sequence_number, send_round, type, subject, sent_to, sent_cc, html_body, email_status, resend_id, error_message, recipient_name, agreement_id, investor_name, investors_count, actor, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error || !data) return []
  return data as ActivityLog[]
}

export default async function ActivityLogPage() {
  const logs = await getActivityLog()
  return (
    <div className="p-4 sm:p-6 min-h-screen bg-slate-950">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">Activity Log</h1>
        <p className="text-xs text-slate-500 mt-0.5">All emails, payout actions and agreement events</p>
      </div>
      <ActivityLogClient logs={logs} />
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/activity-log/ActivityLogClient.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import type { ActivityLog, ActivityLogType } from '@/types/database'

type FilterTab = 'all' | 'emails' | 'payouts' | 'agreements'

const EMAIL_TYPES: ActivityLogType[] = ['salesperson_summary', 'master_summary', 'payout_notify', 'quarterly_forecast']
const PAYOUT_TYPES: ActivityLogType[] = ['payout_marked_paid', 'payout_notified']
const AGREEMENT_TYPES: ActivityLogType[] = ['agreement_created', 'agreement_updated', 'agreement_deleted']

const TYPE_LABELS: Record<ActivityLogType, string> = {
  salesperson_summary: 'Salesperson Summary',
  master_summary: 'Master Summary',
  payout_notify: 'Payout Notify',
  quarterly_forecast: 'Quarterly Forecast',
  payout_marked_paid: 'Marked Paid',
  payout_notified: 'Notified',
  agreement_created: 'Agreement Created',
  agreement_updated: 'Agreement Updated',
  agreement_deleted: 'Agreement Deleted',
}

const TYPE_COLORS: Partial<Record<ActivityLogType, string>> = {
  salesperson_summary: 'bg-indigo-900/50 text-indigo-300',
  master_summary: 'bg-purple-900/50 text-purple-300',
  payout_marked_paid: 'bg-green-900/50 text-green-300',
  payout_notified: 'bg-blue-900/50 text-blue-300',
  agreement_created: 'bg-emerald-900/50 text-emerald-300',
  agreement_deleted: 'bg-red-900/50 text-red-300',
}

function TypeBadge({ type }: { type: ActivityLogType }) {
  const color = TYPE_COLORS[type] ?? 'bg-slate-700 text-slate-300'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {TYPE_LABELS[type]}
    </span>
  )
}

function ViewModal({ log, onClose }: { log: ActivityLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-sm font-bold text-slate-100">{log.subject ?? TYPE_LABELS[log.type]}</h2>
            <p className="text-xs text-slate-400 mt-0.5">#{log.sequence_number} · {format(parseISO(log.created_at), 'dd MMM yyyy HH:mm')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg">×</button>
        </div>
        <div className="px-6 py-4 space-y-3 text-xs text-slate-400">
          {log.sent_to && <p><strong className="text-slate-300">To:</strong> {log.sent_to.join(', ')}</p>}
          {log.sent_cc && log.sent_cc.length > 0 && <p><strong className="text-slate-300">CC:</strong> {log.sent_cc.join(', ')}</p>}
          {log.resend_id && <p><strong className="text-slate-300">Resend ID:</strong> {log.resend_id}</p>}
          {log.error_message && <p className="text-red-400"><strong>Error:</strong> {log.error_message}</p>}
        </div>
        {log.html_body && (
          <div className="px-6 pb-6">
            <iframe srcDoc={log.html_body} className="w-full rounded border border-slate-700" style={{ height: 500 }} sandbox="allow-same-origin" />
          </div>
        )}
      </div>
    </div>
  )
}

export default function ActivityLogClient({ logs }: { logs: ActivityLog[] }) {
  const [tab, setTab] = useState<FilterTab>('all')
  const [viewing, setViewing] = useState<ActivityLog | null>(null)

  const filtered = logs.filter(l => {
    if (tab === 'emails') return EMAIL_TYPES.includes(l.type)
    if (tab === 'payouts') return PAYOUT_TYPES.includes(l.type)
    if (tab === 'agreements') return AGREEMENT_TYPES.includes(l.type)
    return true
  })

  const tabs: Array<{ id: FilterTab; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'emails', label: 'Emails' },
    { id: 'payouts', label: 'Payouts' },
    { id: 'agreements', label: 'Agreements' },
  ]

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800/50 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === t.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-500 uppercase tracking-wider">
                <th className="text-left py-3 pr-4 font-medium">#</th>
                <th className="text-left py-3 pr-4 font-medium">Date</th>
                <th className="text-left py-3 pr-4 font-medium">Type</th>
                <th className="text-left py-3 pr-4 font-medium">Detail</th>
                <th className="text-left py-3 pr-4 font-medium">Status</th>
                <th className="py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((log, i) => {
                const prevLog = filtered[i - 1]
                const newRound = log.send_round && prevLog?.send_round !== log.send_round
                return (
                  <>
                    {newRound && i > 0 && (
                      <tr key={`divider-${log.id}`}>
                        <td colSpan={6} className="py-0.5 bg-slate-800/30" />
                      </tr>
                    )}
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-4 text-slate-500 text-xs tabular-nums">{log.sequence_number}</td>
                      <td className="py-3 pr-4 text-slate-400 text-xs whitespace-nowrap">
                        {format(parseISO(log.created_at), 'dd MMM yyyy HH:mm')}
                      </td>
                      <td className="py-3 pr-4"><TypeBadge type={log.type} /></td>
                      <td className="py-3 pr-4 text-slate-300 text-xs">
                        {log.recipient_name ?? log.investor_name ?? log.subject ?? '—'}
                        {log.investors_count != null && (
                          <span className="text-slate-500 ml-1">· {log.investors_count} investors</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {log.email_status === 'sent' && <span className="text-xs text-green-400">Sent</span>}
                        {log.email_status === 'failed' && <span className="text-xs text-red-400" title={log.error_message ?? ''}>Failed</span>}
                        {!log.email_status && <span className="text-xs text-slate-500">—</span>}
                      </td>
                      <td className="py-3 text-right">
                        {log.html_body && (
                          <button
                            onClick={() => setViewing(log)}
                            className="text-xs text-indigo-400 hover:text-indigo-300"
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewing && <ViewModal log={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/activity-log/page.tsx" src/components/activity-log/ActivityLogClient.tsx
git commit -m "feat: activity log page with filter tabs and email view modal"
```

---

## Task 9: Add Activity Log to Sidebar Nav

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Add nav item to layout**

In `src/app/(app)/layout.tsx`, find the `navItems` array and add the Activity Log entry. Add `ScrollText` to the lucide-react import:

```tsx
import {
  LayoutDashboard,
  FileText,
  Calendar,
  BarChart3,
  FileBarChart,
  ScrollText,
  // ...existing imports
} from 'lucide-react'
```

Then in `navItems`:

```tsx
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agreements', label: 'Agreements', icon: FileText },
  { href: '/investors', label: 'Investors', icon: Users },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/quarterly-review', label: 'Quarterly Review', icon: BarChart3 },
  { href: '/quarterly-reports', label: 'Reports', icon: FileBarChart },
  { href: '/activity-log', label: 'Activity Log', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors

- [ ] **Step 3: Test navigation**

Open `http://localhost:3000/activity-log`. Should show the page with filter tabs. Initially empty until an email is sent.

- [ ] **Step 4: Commit and push**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat: add Activity Log to sidebar nav"
git push
vercel --prod
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| activity_log table with all columns | Task 1 |
| ActivityLog TypeScript types | Task 2 |
| logActivity() helper | Task 2 |
| sendEmail CC support | Task 3 |
| GET preview endpoint — per-salesperson + master | Task 4 |
| Salesperson CC logic — group by salesperson_id | Task 4 |
| Valli CC'd on each salesperson email | Task 4 |
| Master summary unchecked by default | Task 6 |
| POST accepts confirmed emails array, sends + logs | Task 5 |
| Preview modal — iframe render | Task 6 |
| Selectable/deselectable recipients (chips) | Task 6 |
| Add recipient input | Task 6 |
| Per-salesperson emails (salesperson sees only own investors) | Tasks 4+5 |
| Activity Log page with filter tabs | Task 8 |
| View modal showing html_body in iframe | Task 8 |
| Sidebar nav link | Task 9 |

### Placeholder scan

No TBD, TODO, or vague instructions. All code blocks complete. ✓

### Type consistency

- `ActivityLogType` defined in Task 2 (`src/types/database.ts`), used in `logActivity` (Task 2), `ActivityLogClient` (Task 8) ✓
- `PreviewEmail` and `PreviewResponse` exported from preview route (Task 4), imported in modal (Task 6) ✓
- `EditableEmail` extends `PreviewEmail` — all fields from `PreviewEmail` are present ✓
- `logActivity` called in Task 5 with fields matching the Task 2 signature ✓
- `sendEmail` cc param added in Task 3, used in Task 5 ✓
