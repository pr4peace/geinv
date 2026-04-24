# Dashboard Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered dashboard with a focused 3-section reminders page: overdue + this-month interest payouts, agreements maturing this month, and documents pending return from client.

**Architecture:** One new data-fetching module (`dashboard-reminders.ts`) keeps all three Supabase queries in one place. Three focused display components replace the old KPI/Forecast/UpcomingPayouts components. `PayoutReminders` is a client component (needs Mark Paid / Notify buttons); the other two are server components. Dashboard page makes three parallel queries then renders the sections.

**Tech Stack:** Next.js 14 App Router, Supabase JS client, TypeScript, Tailwind CSS, Vitest (unit tests)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/dashboard-reminders.ts` | Create | Three data-fetching functions: `getPayoutReminders`, `getMaturingAgreements`, `getDocsPendingReturn` |
| `src/components/dashboard/PayoutReminders.tsx` | Create | Client component — overdue + this-month payout list with Mark Paid / Notify buttons, mobile-responsive |
| `src/components/dashboard/MaturingSection.tsx` | Create | Server component — agreements maturing this month, display only |
| `src/components/dashboard/DocReturnSection.tsx` | Create | Server component — agreements with doc_status='sent_to_client' and no return date |
| `src/app/(app)/dashboard/page.tsx` | Modify | Remove old imports/components, add three new sections |
| `src/tests/dashboard-reminders.test.ts` | Create | Unit tests for the three data-fetching functions using the existing Supabase mock helper |

**Old components kept on disk but removed from the dashboard page:**
`KPICards`, `ForecastPanel`, `FrequencyBreakdownPanel`, `UpcomingPayouts`

---

## Task 1: Data Layer — `dashboard-reminders.ts`

**Files:**
- Create: `src/lib/dashboard-reminders.ts`
- Create: `src/tests/dashboard-reminders.test.ts`

The key date logic: **overdue** = `period_to` is before the first day of the current month AND status ≠ 'paid'. **This month** = `period_to` falls within the current month AND status ≠ 'paid'. Both exclude `is_principal_repayment = true` and deleted/inactive agreements.

- [ ] **Step 1: Write failing tests**

Create `src/tests/dashboard-reminders.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ──────────────────────────────────────────────────────────
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

function makeChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  const methods = ['select','eq','neq','is','gte','lte','lt','order','in','not']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain['then'] = undefined
  // make it thenable for await
  ;(chain as { data: unknown; error: unknown }).data = data
  ;(chain as { data: unknown; error: unknown }).error = error
  // The final resolution — mimic Supabase's promise shape
  Object.defineProperty(chain, Symbol.toStringTag, { value: 'Promise' })
  return chain
}

import {
  getPayoutReminders,
  getMaturingAgreements,
  getDocsPendingReturn,
} from '@/lib/dashboard-reminders'

describe('getPayoutReminders', () => {
  beforeEach(() => { mockFrom.mockReset() })

  it('splits rows into overdue and thisMonth buckets correctly', async () => {
    const today = new Date()
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString().split('T')[0]
    const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString().split('T')[0]

    const rows = [
      { id: '1', period_to: '2026-03-31', status: 'pending', net_interest: 1000, tds_amount: 100, gross_interest: 1100, is_principal_repayment: false, agreement_id: 'a1', agreements: { investor_name: 'Alice', reference_id: 'REF-001', payout_frequency: 'quarterly', id: 'a1' } },
      { id: '2', period_to: lastOfMonth, status: 'pending', net_interest: 2000, tds_amount: 200, gross_interest: 2200, is_principal_repayment: false, agreement_id: 'a2', agreements: { investor_name: 'Bob', reference_id: 'REF-002', payout_frequency: 'annual', id: 'a2' } },
    ]

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      then: undefined,
    }
    // Return full rows on first call
    mockFrom.mockReturnValue({ ...chain, then: (resolve: (v: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }) })

    const result = await getPayoutReminders()
    expect(result.overdue).toHaveLength(1)
    expect(result.overdue[0].id).toBe('1')
    expect(result.thisMonth).toHaveLength(1)
    expect(result.thisMonth[0].id).toBe('2')
    expect(result.netTotal).toBe(3000)
  })
})

describe('getMaturingAgreements', () => {
  beforeEach(() => { mockFrom.mockReset() })

  it('returns agreements maturing this month', async () => {
    const rows = [
      { id: 'a1', investor_name: 'Alice', reference_id: 'REF-001', principal_amount: 500000, maturity_date: '2026-05-10', interest_type: 'cumulative' },
    ]
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
    })
    const result = await getMaturingAgreements()
    expect(result.agreements).toHaveLength(1)
    expect(result.totalPrincipal).toBe(500000)
  })
})

describe('getDocsPendingReturn', () => {
  beforeEach(() => { mockFrom.mockReset() })

  it('returns agreements with doc_status sent_to_client and no return date', async () => {
    const rows = [
      { id: 'a1', investor_name: 'Alice', reference_id: 'REF-001', doc_sent_to_client_date: '2026-04-02', doc_return_reminder_days: 30 },
    ]
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
    })
    const result = await getDocsPendingReturn()
    expect(result).toHaveLength(1)
    expect(result[0].reference_id).toBe('REF-001')
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
cd "/Users/prashanthpalanisamy/Library/Mobile Documents/com~apple~CloudDocs/Coding/geinv"
npx vitest run src/tests/dashboard-reminders.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/dashboard-reminders'`

- [ ] **Step 3: Create `src/lib/dashboard-reminders.ts`**

```ts
import { startOfMonth, endOfMonth, format, differenceInDays } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'

export type PayoutReminderRow = {
  id: string
  agreement_id: string
  period_to: string
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  status: string
  investor_name: string
  reference_id: string
  payout_frequency: string
}

export type MaturingRow = {
  id: string
  investor_name: string
  reference_id: string
  principal_amount: number
  maturity_date: string
  interest_type: string
  daysRemaining: number
}

export type DocReturnRow = {
  id: string
  investor_name: string
  reference_id: string
  doc_sent_to_client_date: string
  doc_return_reminder_days: number
  daysSinceSent: number
  isOverdue: boolean
}

export type PayoutRemindersResult = {
  overdue: PayoutReminderRow[]
  thisMonth: PayoutReminderRow[]
  netTotal: number
}

export async function getPayoutReminders(): Promise<PayoutRemindersResult> {
  const supabase = createAdminClient()
  const today = new Date()
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('payout_schedule')
    .select(`
      id, agreement_id, period_to, due_by,
      gross_interest, tds_amount, net_interest, status,
      agreements!inner(id, investor_name, reference_id, payout_frequency, status, deleted_at)
    `)
    .neq('status', 'paid')
    .eq('is_principal_repayment', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .lte('period_to', monthEnd)

  if (error || !data) return { overdue: [], thisMonth: [], netTotal: 0 }

  const rows = (data as unknown as Array<{
    id: string
    agreement_id: string
    period_to: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    status: string
    agreements: { id: string; investor_name: string; reference_id: string; payout_frequency: string }
  }>).map(r => ({
    id: r.id,
    agreement_id: r.agreements.id,
    period_to: r.period_to,
    due_by: r.due_by,
    gross_interest: r.gross_interest,
    tds_amount: r.tds_amount,
    net_interest: r.net_interest,
    status: r.status,
    investor_name: r.agreements.investor_name,
    reference_id: r.agreements.reference_id,
    payout_frequency: r.agreements.payout_frequency,
  }))

  const overdue = rows
    .filter(r => r.period_to < monthStart)
    .sort((a, b) => a.period_to.localeCompare(b.period_to))

  const thisMonth = rows
    .filter(r => r.period_to >= monthStart && r.period_to <= monthEnd)
    .sort((a, b) => a.period_to.localeCompare(b.period_to))

  const netTotal = rows.reduce((s, r) => s + r.net_interest, 0)

  return { overdue, thisMonth, netTotal }
}

export async function getMaturingAgreements(): Promise<{ agreements: MaturingRow[]; totalPrincipal: number }> {
  const supabase = createAdminClient()
  const today = new Date()
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, principal_amount, maturity_date, interest_type')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gte('maturity_date', monthStart)
    .lte('maturity_date', monthEnd)
    .order('maturity_date', { ascending: true })

  if (error || !data) return { agreements: [], totalPrincipal: 0 }

  const agreements: MaturingRow[] = (data as Array<{
    id: string; investor_name: string; reference_id: string;
    principal_amount: number; maturity_date: string; interest_type: string
  }>).map(a => ({
    ...a,
    daysRemaining: differenceInDays(new Date(a.maturity_date), today),
  }))

  const totalPrincipal = agreements.reduce((s, a) => s + a.principal_amount, 0)
  return { agreements, totalPrincipal }
}

export async function getDocsPendingReturn(): Promise<DocReturnRow[]> {
  const supabase = createAdminClient()
  const today = new Date()

  const { data, error } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, doc_sent_to_client_date, doc_return_reminder_days')
    .eq('doc_status', 'sent_to_client')
    .is('doc_returned_date', null)
    .is('deleted_at', null)
    .order('doc_sent_to_client_date', { ascending: true })

  if (error || !data) return []

  return (data as Array<{
    id: string; investor_name: string; reference_id: string;
    doc_sent_to_client_date: string; doc_return_reminder_days: number
  }>).map(a => {
    const daysSinceSent = differenceInDays(today, new Date(a.doc_sent_to_client_date))
    return {
      ...a,
      daysSinceSent,
      isOverdue: daysSinceSent > a.doc_return_reminder_days,
    }
  }).sort((a, b) => b.daysSinceSent - a.daysSinceSent)
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
npx vitest run src/tests/dashboard-reminders.test.ts
```

Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-reminders.ts src/tests/dashboard-reminders.test.ts
git commit -m "feat: dashboard reminders data layer — payout/maturing/doc-return queries"
```

---

## Task 2: `PayoutReminders` Client Component

**Files:**
- Create: `src/components/dashboard/PayoutReminders.tsx`

This is a client component because it calls `/api/agreements/[id]/payouts/[payoutId]/notify` and `/api/agreements/[id]/payouts/[payoutId]/paid`, then calls `router.refresh()` to reload server data.

- [ ] **Step 1: Create `src/components/dashboard/PayoutReminders.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import type { PayoutReminderRow } from '@/lib/dashboard-reminders'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function fmtDate(d: string) {
  return format(parseISO(d), 'dd MMM yyyy')
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function PayoutRow({ row, isOverdue }: { row: PayoutReminderRow; isOverdue: boolean }) {
  const router = useRouter()
  const [notifying, setNotifying] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNotify() {
    setNotifying(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/agreements/${row.agreement_id}/payouts/${row.id}/notify`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? 'Failed to notify')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setNotifying(false)
    }
  }

  async function handlePaid() {
    setPaying(true)
    setError(null)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const res = await fetch(
        `/api/agreements/${row.agreement_id}/payouts/${row.id}/paid`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paid_date: today }),
        }
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? 'Failed to mark paid')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setPaying(false)
    }
  }

  const borderColor = isOverdue ? 'border-l-red-500' : 'border-l-amber-500'

  return (
    <div className={`bg-slate-800/60 border border-slate-700 border-l-4 ${borderColor} rounded-lg p-3 sm:p-4`}>
      {/* Top row: name + amount */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{row.investor_name}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Due till {fmtDate(row.period_to)} · {capitalize(row.payout_frequency)} · {row.reference_id}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-slate-100">{fmt(row.net_interest)}</p>
          <p className="text-xs text-red-400">TDS {fmt(row.tds_amount)}</p>
        </div>
      </div>

      {/* Action buttons — inline on desktop, full-width grid on mobile */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-2 sm:mt-2">
        <button
          onClick={handlePaid}
          disabled={paying}
          className={`py-2 sm:py-1.5 px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
            isOverdue
              ? 'bg-red-700 hover:bg-red-600 text-white'
              : 'bg-green-800/60 hover:bg-green-700/60 text-green-300'
          }`}
        >
          {paying ? 'Saving…' : 'Mark Paid'}
        </button>
        <button
          onClick={handleNotify}
          disabled={notifying}
          className="py-2 sm:py-1.5 px-3 rounded-md text-xs font-medium bg-indigo-700/60 hover:bg-indigo-600/60 text-indigo-200 transition-colors disabled:opacity-50"
        >
          {notifying ? 'Sending…' : row.status === 'notified' ? 'Re-notify' : 'Notify'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

interface Props {
  overdue: PayoutReminderRow[]
  thisMonth: PayoutReminderRow[]
  netTotal: number
  monthLabel: string
}

export default function PayoutReminders({ overdue, thisMonth, netTotal, monthLabel }: Props) {
  const overdueCount = overdue.length
  const thisMonthCount = thisMonth.length

  if (overdueCount === 0 && thisMonthCount === 0) {
    return (
      <section>
        <h2 className="text-sm font-bold text-slate-100 mb-3">Interest Payouts</h2>
        <p className="text-sm text-slate-500 italic">No outstanding payouts.</p>
      </section>
    )
  }

  return (
    <section>
      {/* Section header */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-sm font-bold text-slate-100">Interest Payouts</h2>
        {overdueCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-900/60 text-red-300 text-xs font-semibold">
            {overdueCount} Overdue
          </span>
        )}
        {thisMonthCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 text-xs font-semibold">
            {thisMonthCount} Due in {monthLabel}
          </span>
        )}
        <span className="ml-auto text-xs text-slate-500">Net total {fmt(netTotal)}</span>
      </div>

      {/* Overdue */}
      {overdueCount > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Overdue</p>
          <div className="flex flex-col gap-3">
            {overdue.map(row => (
              <PayoutRow key={row.id} row={row} isOverdue />
            ))}
          </div>
        </div>
      )}

      {/* This month */}
      {thisMonthCount > 0 && (
        <div>
          <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">{monthLabel}</p>
          <div className="flex flex-col gap-3">
            {thisMonth.map(row => (
              <PayoutRow key={row.id} row={row} isOverdue={false} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/prashanthpalanisamy/Library/Mobile Documents/com~apple~CloudDocs/Coding/geinv"
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors relating to `PayoutReminders.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/PayoutReminders.tsx
git commit -m "feat: PayoutReminders client component — overdue + this-month, mobile-responsive"
```

---

## Task 3: `MaturingSection` Server Component

**Files:**
- Create: `src/components/dashboard/MaturingSection.tsx`

- [ ] **Step 1: Create `src/components/dashboard/MaturingSection.tsx`**

```tsx
import { format, parseISO } from 'date-fns'
import type { MaturingRow } from '@/lib/dashboard-reminders'
import Link from 'next/link'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface Props {
  agreements: MaturingRow[]
  totalPrincipal: number
  monthLabel: string
}

export default function MaturingSection({ agreements, totalPrincipal, monthLabel }: Props) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-sm font-bold text-slate-100">Maturing This Month</h2>
        {agreements.length > 0 ? (
          <span className="px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 text-xs font-semibold">
            {agreements.length} agreement{agreements.length > 1 ? 's' : ''}
          </span>
        ) : null}
        {agreements.length > 0 && (
          <span className="ml-auto text-xs text-slate-500">{fmt(totalPrincipal)} principal</span>
        )}
      </div>

      {agreements.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No agreements maturing in {monthLabel}.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {agreements.map(a => (
            <Link
              key={a.id}
              href={`/agreements/${a.id}`}
              className="block bg-slate-800/60 border border-slate-700 border-l-4 border-l-emerald-500 rounded-lg p-3 sm:p-4 hover:bg-slate-700/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{a.investor_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Matures {format(parseISO(a.maturity_date), 'dd MMM yyyy')} · {a.reference_id} · {capitalize(a.interest_type)}
                  </p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <p className="text-sm font-bold text-emerald-400">{fmt(a.principal_amount)}</p>
                  <span className="bg-emerald-900/50 text-emerald-300 text-xs px-2 py-0.5 rounded">
                    {a.daysRemaining <= 0 ? 'Today' : `${a.daysRemaining}d`}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors relating to `MaturingSection.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/MaturingSection.tsx
git commit -m "feat: MaturingSection component — agreements maturing this month"
```

---

## Task 4: `DocReturnSection` Server Component

**Files:**
- Create: `src/components/dashboard/DocReturnSection.tsx`

- [ ] **Step 1: Create `src/components/dashboard/DocReturnSection.tsx`**

```tsx
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import type { DocReturnRow } from '@/lib/dashboard-reminders'

interface Props {
  docs: DocReturnRow[]
}

export default function DocReturnSection({ docs }: Props) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-sm font-bold text-slate-100">Docs Pending Return</h2>
        {docs.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-orange-900/60 text-orange-300 text-xs font-semibold">
            {docs.length} agreement{docs.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No documents pending return.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map(doc => (
            <Link
              key={doc.id}
              href={`/agreements/${doc.id}`}
              className="block bg-slate-800/60 border border-slate-700 border-l-4 border-l-orange-500 rounded-lg p-3 sm:p-4 hover:bg-slate-700/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{doc.investor_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sent {format(parseISO(doc.doc_sent_to_client_date), 'dd MMM yyyy')} · {doc.reference_id}
                  </p>
                  <p className={`text-xs mt-0.5 ${doc.isOverdue ? 'text-orange-400' : 'text-slate-500'}`}>
                    {doc.daysSinceSent} day{doc.daysSinceSent !== 1 ? 's' : ''} ago
                  </p>
                </div>
                <div className="shrink-0">
                  {doc.isOverdue ? (
                    <span className="bg-orange-900/60 text-orange-300 text-xs px-2 py-1 rounded font-semibold">
                      Overdue
                    </span>
                  ) : (
                    <span className="border border-slate-600 text-slate-400 text-xs px-2 py-1 rounded">
                      Waiting
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors relating to `DocReturnSection.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/DocReturnSection.tsx
git commit -m "feat: DocReturnSection component — documents pending return from client"
```

---

## Task 5: Wire Up Dashboard Page

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

Remove the four old components from this file and replace with the three new sections.

- [ ] **Step 1: Replace `src/app/(app)/dashboard/page.tsx`**

```tsx
import { format } from 'date-fns'
import {
  getPayoutReminders,
  getMaturingAgreements,
  getDocsPendingReturn,
} from '@/lib/dashboard-reminders'
import PayoutReminders from '@/components/dashboard/PayoutReminders'
import MaturingSection from '@/components/dashboard/MaturingSection'
import DocReturnSection from '@/components/dashboard/DocReturnSection'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [payouts, maturing, docs] = await Promise.all([
    getPayoutReminders().catch(() => ({ overdue: [], thisMonth: [], netTotal: 0 })),
    getMaturingAgreements().catch(() => ({ agreements: [], totalPrincipal: 0 })),
    getDocsPendingReturn().catch(() => []),
  ])

  const monthLabel = format(new Date(), 'MMMM yyyy')

  return (
    <div className="p-4 sm:p-6 space-y-8 min-h-screen bg-slate-950 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-xs text-slate-500 mt-0.5">{monthLabel}</p>
      </div>

      {/* Section 1: Interest Payouts */}
      <PayoutReminders
        overdue={payouts.overdue}
        thisMonth={payouts.thisMonth}
        netTotal={payouts.netTotal}
        monthLabel={format(new Date(), 'MMMM')}
      />

      <hr className="border-slate-800" />

      {/* Section 2: Maturing This Month */}
      <MaturingSection
        agreements={maturing.agreements}
        totalPrincipal={maturing.totalPrincipal}
        monthLabel={monthLabel}
      />

      <hr className="border-slate-800" />

      {/* Section 3: Docs Pending Return */}
      <DocReturnSection docs={docs} />
    </div>
  )
}
```

- [ ] **Step 2: Start dev server and open `/dashboard`**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard`. Verify:
- Page loads without errors
- Section 1 shows overdue (red border-left) and this-month payouts (amber border-left)
- "Due till" date shown (not "due_by")
- Mark Paid and Notify buttons are present
- Section 2 shows agreements maturing this month (or empty state)
- Section 3 shows documents pending return (or empty state)
- On mobile viewport (< 640px) the action buttons are full-width stacked

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/dashboard/page.tsx
git commit -m "feat: rebuild dashboard as 3-section reminders page — payouts, maturing, doc return"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Overdue = period_to before current month, status ≠ paid | Task 1 `getPayoutReminders` |
| This month = period_to in current month, status ≠ paid | Task 1 `getPayoutReminders` |
| Display "Due till" (period_to), not due_by | Task 2 `PayoutRow` renders `row.period_to` |
| Overdue rows: Mark Paid + Notify buttons | Task 2 `PayoutRow` |
| This-month rows: Mark Paid + Notify (Re-notify if already notified) | Task 2 `PayoutRow` |
| Maturing this month — count + principal total | Task 3 `MaturingSection` |
| Docs pending return — days since sent, overdue badge | Task 4 `DocReturnSection` |
| Mobile: buttons full-width below on < 640px | Task 2 — `grid grid-cols-2 sm:flex` |
| Empty states for each section | Tasks 2, 3, 4 — all handle empty gracefully |
| Remove KPICards, ForecastPanel, FrequencyBreakdownPanel, UpcomingPayouts | Task 5 |
| Parallel data fetching | Task 5 — `Promise.all` |
| Filter deleted agreements | Task 1 — `.is('agreements.deleted_at', null)` |

All spec requirements covered. ✓

### Placeholder scan

No TBD, TODO, or "similar to Task N" references. All code blocks are complete and self-contained. ✓

### Type consistency

- `PayoutReminderRow` defined in Task 1, imported in Task 2 — `row.agreement_id`, `row.period_to`, `row.net_interest`, `row.tds_amount`, `row.status`, `row.investor_name`, `row.reference_id`, `row.payout_frequency` — all present in the type definition. ✓
- `MaturingRow` defined in Task 1, imported in Task 3 — `a.daysRemaining`, `a.maturity_date`, `a.principal_amount`, `a.interest_type` — all present. ✓
- `DocReturnRow` defined in Task 1, imported in Task 4 — `doc.daysSinceSent`, `doc.isOverdue`, `doc.doc_sent_to_client_date` — all present. ✓
- Task 5 passes `payouts.overdue`, `payouts.thisMonth`, `payouts.netTotal` — match `PayoutRemindersResult` fields. ✓
