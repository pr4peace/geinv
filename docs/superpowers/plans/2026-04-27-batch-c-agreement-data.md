# Batch C — Agreement Data + Quick Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat payment fields with a `payments jsonb[]` array, add TDS-only row tracking for cumulative agreements, add a splash screen, add a version number to the sidebar, grey out unfinished nav items, and make the investors table sortable.

**Architecture:** Two DB migrations run first (user runs in Supabase SQL Editor). All code changes flow from the type system outward — update types first, then lib, then components. Migrations are `015` and `016` (latest in repo is `014`).

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres jsonb[]), Tailwind CSS, Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/015_multiple_payments.sql` | Create | Add `payments jsonb[]`, migrate data, drop old columns |
| `supabase/migrations/016_tds_only_payout.sql` | Create | Add `is_tds_only` + `tds_filed` to `payout_schedule` |
| `src/types/database.ts` | Modify | Add `PaymentEntry` type; update `Agreement` + `PayoutSchedule` |
| `src/lib/claude.ts` | Modify | Update `ExtractedAgreement` type + extraction prompt |
| `src/components/agreements/ExtractionReview.tsx` | Modify | Replace 3 payment fields with dynamic payments array UI |
| `src/components/agreements/ManualAgreementForm.tsx` | Modify | Same as above |
| `src/app/(app)/agreements/[id]/page.tsx` | Modify | Render payments array; add TDS Filing badge + Mark Filed button |
| `src/app/api/agreements/route.ts` | Modify | Accept `payments` array; remove old payment field handling |
| `src/app/api/payout-schedule/[id]/mark-tds-filed/route.ts` | Create | PATCH endpoint to set `tds_filed = true` |
| `src/lib/payout-calculator.ts` | Modify | For cumulative: add `is_tds_only` TDS row alongside main row |
| `src/lib/reminders.ts` | Modify | Skip `generatePayoutReminders` for `is_tds_only` rows |
| `src/components/SplashScreen.tsx` | Create | Branded splash with fade-out on mount |
| `src/app/(app)/layout.tsx` | Modify | Add version number below logo; render `<SplashScreen />`; grey out Quarterly Review + Reports nav items |
| `src/components/investors/InvestorsTable.tsx` | Create | Client component with `useState` sort |
| `src/app/(app)/investors/page.tsx` | Modify | Pass data to `InvestorsTable`, remove inline table markup |

---

## ⚠️ Pre-flight: Run migrations first

Before writing any code, create the two migration files and ask the user to run them in Supabase SQL Editor. Do NOT proceed until the user confirms both have run.

---

## Task 1: Migration — multiple payments

**File:** `supabase/migrations/015_multiple_payments.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 015_multiple_payments.sql
-- Replace flat payment_date/mode/bank with payments jsonb[]

ALTER TABLE agreements
  ADD COLUMN payments jsonb[] NOT NULL DEFAULT '{}';

-- Migrate existing single-payment data into array format
-- Use null for amount since historical records don't separate payment amount from principal
UPDATE agreements
SET payments = ARRAY[jsonb_build_object(
  'date', payment_date,
  'mode', payment_mode,
  'bank', payment_bank,
  'amount', NULL
)]::jsonb[]
WHERE payment_date IS NOT NULL
   OR payment_mode IS NOT NULL
   OR payment_bank IS NOT NULL;

ALTER TABLE agreements DROP COLUMN IF EXISTS payment_date;
ALTER TABLE agreements DROP COLUMN IF EXISTS payment_mode;
ALTER TABLE agreements DROP COLUMN IF EXISTS payment_bank;
```

- [ ] **Step 2: Ask user to run in Supabase SQL Editor, wait for confirmation**

---

## Task 2: Migration — TDS-only payout row

**File:** `supabase/migrations/016_tds_only_payout.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 016_tds_only_payout.sql
-- Track TDS filing obligations on payout_schedule rows

ALTER TABLE payout_schedule
  ADD COLUMN is_tds_only boolean NOT NULL DEFAULT false,
  ADD COLUMN tds_filed boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Ask user to run in Supabase SQL Editor, wait for confirmation**

---

## Task 3: Update types

**File:** `src/types/database.ts`

- [ ] **Step 1: Add PaymentEntry interface and update Agreement**

Add after the existing type exports at the top of the file:
```typescript
export interface PaymentEntry {
  date: string | null
  mode: string | null
  bank: string | null
  amount: number | null
}
```

In the `Agreement` interface, remove:
```typescript
  payment_date: string | null
  payment_mode: string | null
  payment_bank: string | null
```
Replace with:
```typescript
  payments: PaymentEntry[]
```

- [ ] **Step 2: Update PayoutSchedule interface**

In the `PayoutSchedule` interface, add after `paid_date`:
```typescript
  is_tds_only: boolean
  tds_filed: boolean
```

- [ ] **Step 3: Run build to surface all type errors that need fixing**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -30
```

Use the error output to guide the remaining tasks.

---

## Task 4: Update Gemini extraction (claude.ts)

**File:** `src/lib/claude.ts`

- [ ] **Step 1: Update ExtractedAgreement type**

Remove:
```typescript
  payment_date: string | null
  payment_mode: string | null
  payment_bank: string | null
```
Add:
```typescript
  payments: Array<{ date: string | null; mode: string | null; bank: string | null; amount: number | null }>
```

- [ ] **Step 2: Update EXTRACTION_PROMPT**

In the prompt rules section, replace the payment rule with:
```
10. PAYMENTS: Extract ALL payment entries from the document. An investment may be funded in multiple tranches. For each entry record:
    - date: ISO date (YYYY-MM-DD) or null
    - mode: payment method (e.g. "NEFT", "RTGS", "Cheque", "UPI", "Cash") or null
    - bank: bank name or null
    - amount: payment amount as a plain number, or null if not stated
    If only one payment, return a single-element array. If no payment info found, return [].
```

In the JSON schema at the bottom of the prompt, replace:
```json
  "payment_date": "YYYY-MM-DD or null",
  "payment_mode": "string or null",
  "payment_bank": "string or null",
```
With:
```json
  "payments": [{"date": "YYYY-MM-DD or null", "mode": "string or null", "bank": "string or null", "amount": 0}],
```

- [ ] **Step 3: Run build to verify no type errors in claude.ts**

```bash
npm run build 2>&1 | grep "claude"
```

---

## Task 5: Update ExtractionReview form

**File:** `src/components/agreements/ExtractionReview.tsx`

Find the three payment fields (search for `payment_date`, `payment_mode`, `payment_bank`). Replace the entire payment section with a dynamic payments array UI.

- [ ] **Step 1: Replace payment fields with payments array state**

Where the form state currently has `payment_date`, `payment_mode`, `payment_bank` fields, replace with:
```typescript
payments: data.payments ?? []
// type: Array<{ date: string | null; mode: string | null; bank: string | null; amount: number | null }>
```

- [ ] **Step 2: Replace the 3 input fields with a payment entries list**

Replace the old three inputs with:
```tsx
{/* Payments */}
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
      Payments
    </label>
    <button
      type="button"
      onClick={() => setForm(f => ({
        ...f,
        payments: [...f.payments, { date: null, mode: null, bank: null, amount: null }]
      }))}
      className="text-xs text-indigo-400 hover:text-indigo-300"
    >
      + Add payment
    </button>
  </div>
  {form.payments.length === 0 && (
    <p className="text-xs text-slate-600 italic">No payments recorded</p>
  )}
  {form.payments.map((p, i) => (
    <div key={i} className="grid grid-cols-4 gap-2 items-start">
      <input
        type="date"
        value={p.date ?? ''}
        onChange={e => {
          const updated = [...form.payments]
          updated[i] = { ...updated[i], date: e.target.value || null }
          setForm(f => ({ ...f, payments: updated }))
        }}
        className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
        placeholder="Date"
      />
      <input
        type="text"
        value={p.mode ?? ''}
        onChange={e => {
          const updated = [...form.payments]
          updated[i] = { ...updated[i], mode: e.target.value || null }
          setForm(f => ({ ...f, payments: updated }))
        }}
        className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
        placeholder="Mode (NEFT…)"
      />
      <input
        type="text"
        value={p.bank ?? ''}
        onChange={e => {
          const updated = [...form.payments]
          updated[i] = { ...updated[i], bank: e.target.value || null }
          setForm(f => ({ ...f, payments: updated }))
        }}
        className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
        placeholder="Bank"
      />
      <div className="flex gap-1">
        <input
          type="number"
          value={p.amount ?? ''}
          onChange={e => {
            const updated = [...form.payments]
            updated[i] = { ...updated[i], amount: e.target.value ? Number(e.target.value) : null }
            setForm(f => ({ ...f, payments: updated }))
          }}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
          placeholder="Amount"
        />
        <button
          type="button"
          onClick={() => setForm(f => ({
            ...f,
            payments: f.payments.filter((_, j) => j !== i)
          }))}
          className="text-slate-600 hover:text-red-400 px-1"
        >
          ×
        </button>
      </div>
    </div>
  ))}
</div>
```

- [ ] **Step 3: Verify form submission includes payments array**

Check that the form's submit handler sends `payments: form.payments` instead of the old fields.

---

## Task 6: Update ManualAgreementForm

**File:** `src/components/agreements/ManualAgreementForm.tsx`

Apply the same payments array pattern as Task 5. The manual form currently has the same three payment fields in a grid layout.

- [ ] **Step 1: Replace payment state fields**

Change form initial state from `payment_date/mode/bank` to `payments: []`.

- [ ] **Step 2: Replace input grid with payments array UI**

Use the identical JSX from Task 5 Step 2. The class names and structure are the same dark-slate style used throughout the form.

- [ ] **Step 3: Verify build is clean**

```bash
npm run build 2>&1 | grep -E "ManualAgreement|ExtractionReview"
```

---

## Task 7: Update agreements API route

**File:** `src/app/api/agreements/route.ts`

- [ ] **Step 1: Remove payment field references**

Search for any references to `payment_date`, `payment_mode`, `payment_bank` in the route. The POST handler receives the form body and passes it to Supabase — since the column names changed, the old fields will simply not be inserted. Verify no explicit field validation or mapping references the old names.

- [ ] **Step 2: Ensure payments array passes through**

The `payments` field will arrive in the request body as a JSON array and will be passed through to Supabase naturally since the route uses spread `{ ...agreementFields }`. No additional changes needed unless there is explicit field whitelisting.

---

## Task 8: Update agreement detail page — payments display

**File:** `src/app/(app)/agreements/[id]/page.tsx`

- [ ] **Step 1: Replace the three payment Field components**

Find and remove:
```tsx
<Field label="Payment Date" value={fmt(agreement.payment_date)} />
<Field label="Payment Mode" value={fmt(agreement.payment_mode)} />
<Field label="Payment Bank" value={fmt(agreement.payment_bank)} />
```

Replace with:
```tsx
{/* Payments */}
{(agreement.payments ?? []).length > 0 ? (
  <div className="sm:col-span-3">
    <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Payments</p>
    <div className="space-y-1">
      {(agreement.payments ?? []).map((p, i) => (
        <div key={i} className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-200">
          {p.date && <span>{fmtDate(p.date)}</span>}
          {p.mode && <span className="text-slate-400">{p.mode}</span>}
          {p.bank && <span className="text-slate-400">{p.bank}</span>}
          {p.amount != null && <span className="font-medium">{fmtCurrency(p.amount)}</span>}
        </div>
      ))}
    </div>
  </div>
) : (
  <Field label="Payment" value="—" />
)}
```

---

## Task 9: Update payout calculator — TDS-only row for cumulative

**File:** `src/lib/payout-calculator.ts`

For cumulative agreements, the calculator currently returns a single row with the full interest. Add a second `is_tds_only` row to track the TDS filing obligation.

- [ ] **Step 1: Update PayoutRow interface**

Add to the `PayoutRow` interface:
```typescript
  is_tds_only: boolean
  tds_filed: boolean
```

- [ ] **Step 2: Add TDS-only row in cumulative branch**

In the cumulative/compound block (lines ~56–84), after `rows.push({...})`, add:
```typescript
    // TDS filing tracking row — internal use only, no investor reminder
    rows.push({
      period_from: toISO(start),
      period_to: toISO(maturity),
      due_by: toISO(maturity),
      no_of_days: totalDays,
      gross_interest: 0,
      tds_amount: tds,
      net_interest: 0,
      is_principal_repayment: false,
      is_tds_only: true,
      tds_filed: false,
      status: 'paid',
    })
```

- [ ] **Step 3: Set is_tds_only/tds_filed defaults on periodic rows**

In all periodic `rows.push({...})` calls, add:
```typescript
      is_tds_only: false,
      tds_filed: false,
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/__tests__/payout-calculator.test.ts
```

---

## Task 10: Update reminders — skip is_tds_only rows

**File:** `src/lib/reminders.ts`

- [ ] **Step 1: Add guard in generatePayoutReminders**

At the top of `generatePayoutReminders`, add:
```typescript
  if (payoutRow.is_tds_only) return []
```

This prevents any investor-facing reminder for TDS-only tracking rows.

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/__tests__/reminders.test.ts
```

---

## Task 11: TDS Filed API endpoint

**File:** `src/app/api/payout-schedule/[id]/mark-tds-filed/route.ts` (new file — create directories as needed)

- [ ] **Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('payout_schedule')
    .update({ tds_filed: true })
    .eq('id', id)
    .eq('is_tds_only', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

---

## Task 12: Agreement detail — TDS Filing badge + Mark Filed button

**File:** `src/app/(app)/agreements/[id]/page.tsx`

Find the payout schedule table in the detail page. For each row where `is_tds_only === true`:

- [ ] **Step 1: Add TDS Filing badge**

In the payout row render, add a badge when `row.is_tds_only`:
```tsx
{row.is_tds_only && (
  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-900/40 text-violet-400">
    TDS Filing
  </span>
)}
```

- [ ] **Step 2: Show TDS amount and Mark Filed button**

For `is_tds_only` rows, show the TDS amount and a Mark Filed action:
```tsx
{row.is_tds_only && (
  <div className="flex items-center gap-3">
    <span className="text-sm text-slate-400">
      TDS due: <span className="text-white font-medium">₹{row.tds_amount.toLocaleString('en-IN')}</span>
    </span>
    {row.tds_filed ? (
      <span className="text-xs text-emerald-400 font-medium">✓ Filed</span>
    ) : (
      <MarkTdsFiledButton payoutId={row.id} />
    )}
  </div>
)}
```

- [ ] **Step 3: Create MarkTdsFiledButton client component**

Create inline in the page file or as `src/components/agreements/MarkTdsFiledButton.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function MarkTdsFiledButton({ payoutId }: { payoutId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClick() {
    setLoading(true)
    await fetch(`/api/payout-schedule/${payoutId}/mark-tds-filed`, { method: 'POST' })
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-xs px-2.5 py-1 rounded-lg bg-violet-900/40 text-violet-300 hover:bg-violet-800/40 disabled:opacity-50 transition-colors"
    >
      {loading ? 'Saving…' : 'Mark Filed'}
    </button>
  )
}
```

---

## Task 13: Splash screen

**File:** `src/components/SplashScreen.tsx` (new)

- [ ] **Step 1: Create SplashScreen component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Leaf } from 'lucide-react'

export function SplashScreen() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1200)
    const hideTimer = setTimeout(() => setVisible(false), 1700)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-900/40">
          <Leaf className="w-8 h-8 text-white" />
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-white tracking-tight">Good Earth</p>
          <p className="text-sm text-slate-500 mt-0.5">Investment Tracker</p>
        </div>
      </div>
    </div>
  )
}
```

---

## Task 14: Version number + splash in layout

**File:** `src/app/(app)/layout.tsx`

- [ ] **Step 1: Add version number below logo text**

In the logo `<div>` block, after `<p className="text-xs text-slate-500 leading-tight">Investments</p>`, add:
```tsx
<p className="text-[10px] text-slate-700 leading-tight mt-0.5">v0.1.0</p>
```

- [ ] **Step 2: Import and render SplashScreen**

Add import:
```typescript
import { SplashScreen } from '@/components/SplashScreen'
```

In the return JSX, before the `<div className="flex h-screen...">` wrapper, add:
```tsx
<>
  <SplashScreen />
  <div className="flex h-screen bg-slate-950 overflow-hidden">
    {/* existing sidebar and main content */}
  </div>
</>
```

- [ ] **Step 3: Grey out Quarterly Review + Reports nav items**

In the `navItems` array in `layout.tsx`, add a `comingSoon?: boolean` flag:
```typescript
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agreements', label: 'Agreements', icon: FileText },
  { href: '/investors', label: 'Investors', icon: Users },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/quarterly-review', label: 'Quarterly Review', icon: BarChart3, comingSoon: true },
  { href: '/quarterly-reports', label: 'Reports', icon: FileBarChart, comingSoon: true },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

Update the nav item render to handle `comingSoon`:
```tsx
{navItems.map(({ href, label, icon: Icon, comingSoon }) => {
  const isActive = !comingSoon && (pathname === href || pathname.startsWith(href + '/'))
  return comingSoon ? (
    <div
      key={href}
      className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-slate-700 cursor-not-allowed select-none"
    >
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 flex-shrink-0" />
        {label}
      </div>
      <span className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">Soon</span>
    </div>
  ) : (
    <Link
      key={href}
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-indigo-600 text-white'
          : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </Link>
  )
})}
```

---

## Task 15: Sortable investors table

**File:** `src/components/investors/InvestorsTable.tsx` (new)

- [ ] **Step 1: Create the client component**

```tsx
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

type InvestorRow = {
  id: string
  name: string
  pan: string | null
  aadhaar: string | null
  address: string | null
  birth_year: number | null
  payout_bank_name: string | null
  payout_bank_account: string | null
  payout_bank_ifsc: string | null
  created_at: string
  total_agreements: number
  active_agreements: number
  total_principal: number
}

type SortKey = 'name' | 'pan' | 'total_principal' | 'total_agreements'

function SortHeader({
  label, sortKey, current, dir, onSort,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
    >
      {label}
      <span className="ml-1 text-slate-600">
        {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  )
}

export function InvestorsTable({ investors }: { investors: InvestorRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    return [...investors].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = typeof av === 'string'
        ? (av as string).localeCompare(bv as string)
        : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [investors, sortKey, sortDir])

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900/60">
          <tr>
            <SortHeader label="Investor" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="PAN" sortKey="pan" current={sortKey} dir={sortDir} onSort={handleSort} />
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Aadhaar</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Address</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden xl:table-cell">Payout Bank</th>
            <SortHeader label="Agreements" sortKey="total_agreements" current={sortKey} dir={sortDir} onSort={handleSort} />
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Active</th>
            <SortHeader label="Total Principal" sortKey="total_principal" current={sortKey} dir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {sorted.map(investor => (
            <tr key={investor.id} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/investors/${investor.id}`} className="font-medium text-white hover:text-indigo-400 transition-colors">
                  {investor.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-400 font-mono text-xs">{investor.pan ?? '—'}</td>
              <td className="px-4 py-3 text-slate-400 font-mono text-xs">{investor.aadhaar ?? '—'}</td>
              <td className="px-4 py-3 text-slate-400 hidden lg:table-cell text-xs">{investor.address ?? '—'}</td>
              <td className="px-4 py-3 text-slate-400 hidden xl:table-cell text-xs">{investor.payout_bank_name ?? '—'}</td>
              <td className="px-4 py-3 text-slate-300">{investor.total_agreements}</td>
              <td className="px-4 py-3 text-slate-300">{investor.active_agreements}</td>
              <td className="px-4 py-3 text-white font-medium">
                ₹{investor.total_principal.toLocaleString('en-IN')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Update investors page to use InvestorsTable**

**File:** `src/app/(app)/investors/page.tsx`

Import the component:
```typescript
import { InvestorsTable } from '@/components/investors/InvestorsTable'
```

Replace the inline `<table>...</table>` block with:
```tsx
<InvestorsTable investors={investors} />
```

Keep the summary cards, CSV export button, and page header unchanged — only the table markup moves to the component.

---

## Task 16: Final verification

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: clean, no errors.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all pass. Payout calculator tests should show 2 rows for cumulative (main + TDS-only).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: batch C — multiple payments, TDS-only row, splash screen, version, sortable investors"
```

---

## Verification Checklist

- [ ] Agreement form (manual + extraction review): payments array renders with Add/Remove, all 4 fields
- [ ] Existing agreements: payments field shows migrated data (or "—" if none)
- [ ] Cumulative payout table: shows main row + "TDS Filing" badge row with amount + Mark Filed button
- [ ] Mark Filed → button disappears, "✓ Filed" label appears (page.refresh works)
- [ ] Splash screen: appears on first load, fades after ~1.5s, does not re-appear on navigation
- [ ] Sidebar: version number visible below "Investments" text
- [ ] Investors table: clicking Name/PAN/Total Principal/Agreements column header sorts; clicking again reverses direction
- [ ] `npm run build` clean, `npm test` all green
