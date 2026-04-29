# Quick Send Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible Quick Send panel to `/notifications` that lets coordinators pick a notification type + timeframe, preview matching queue items with checkboxes, review salesperson breakdown stats, and send in one click.

**Architecture:** All preview filtering happens client-side from the already-fetched `pending` queue items — no new API routes needed. The panel receives `pending` from `NotificationsClient` and filters by `notification_type` and `due_date` window. Sending uses the existing `POST /api/notifications/send`. Also fixes a silent insert bug in the cron route that prevents duplicate-safe re-runs.

**Tech Stack:** Next.js 14 App Router · React (client component) · Tailwind CSS · Supabase (existing admin client) · existing `POST /api/notifications/send`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/app/api/reminders/process/route.ts` | Modify | Fix batch insert → per-item loop with 23505 swallow |
| `src/app/(app)/notifications/page.tsx` | Modify | Add salesperson name to agreement join in `fetchItems` |
| `src/components/notifications/QuickSendPanel.tsx` | Create | Configure + preview + summary + send panel |
| `src/components/notifications/NotificationsClient.tsx` | Modify | Mount QuickSendPanel above tabs, pass pending + handleSend |

---

## Task 1: Fix notification_queue silent insert failure

**Files:**
- Modify: `src/app/api/reminders/process/route.ts:66-79`

**Problem:** `.insert(allItems)` fails silently when any item conflicts with the unique partial index. On every re-run after the first, nothing gets added to the queue.

**Fix:** Replace batch insert with a per-item loop that swallows error code `23505` (unique_violation).

- [ ] **Step 1: Replace the batch insert block**

In `src/app/api/reminders/process/route.ts`, replace lines 66–79:

```ts
  // 3. Insert per-item — swallow unique constraint violations (idempotent re-runs)
  for (const item of allItems) {
    const { error } = await supabase.from('notification_queue').insert(item)
    if (!error) {
      queueAdded++
    } else if (error.code !== '23505') {
      console.error('notification_queue insert error:', error.message)
    }
    // 23505 = unique_violation — item already pending, skip silently
  }
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reminders/process/route.ts
git commit -m "fix: insert notification_queue items individually to survive re-runs"
```

---

## Task 2: Add salesperson name to page fetch

The Quick Send summary bar needs to show a salesperson breakdown by name, not email. Update `fetchItems` in the notifications page to join the salesperson's name through the agreement.

**Files:**
- Modify: `src/app/(app)/notifications/page.tsx`

- [ ] **Step 1: Update the `EnrichedItem` type and `fetchItems` query**

In `src/app/(app)/notifications/page.tsx`, replace the `EnrichedItem` type and `fetchItems` function:

```ts
type EnrichedItem = NotificationQueue & {
  agreement?: {
    id: string
    investor_name: string
    reference_id: string
    salesperson?: { name: string } | null
  } | null
  sent_by_member?: { name: string } | null
}

async function fetchItems(status: string, salespersonId?: string): Promise<EnrichedItem[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('notification_queue')
    .select(`
      *,
      agreement:agreements(id, investor_name, reference_id, salesperson:team_members!salesperson_id(name)),
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
  return (data ?? []) as EnrichedItem[]
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: no TypeScript errors. The `EnrichedItem` type is used in `NotificationsClient` — if that file references `agreement.salesperson`, the type now supports it. If it doesn't, no change needed there.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/notifications/page.tsx
git commit -m "feat: add salesperson name to notification queue page fetch"
```

---

## Task 3: Build QuickSendPanel component

**Files:**
- Create: `src/components/notifications/QuickSendPanel.tsx`

The panel is self-contained. It receives `pending` items and `onSend` from `NotificationsClient`. It filters client-side, renders the preview table with checkboxes, shows a summary bar, and calls `onSend` with selected IDs.

- [ ] **Step 1: Create the file**

Create `src/components/notifications/QuickSendPanel.tsx`:

```tsx
'use client'

import { useState, useMemo } from 'react'
import type { NotificationQueue, NotificationType } from '@/types/database'

type EnrichedItem = NotificationQueue & {
  agreement?: {
    id: string
    investor_name: string
    reference_id: string
    salesperson?: { name: string } | null
  } | null
}

type FilterType = 'all' | 'payout' | 'maturity' | 'tds_filing'
type Timeframe = 7 | 14 | 31

const TYPE_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'payout', label: 'Payouts' },
  { value: 'maturity', label: 'Maturity' },
  { value: 'tds_filing', label: 'TDS Filing' },
]

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 31, label: '31 days' },
]

const FILTER_TYPES: Record<FilterType, NotificationType[]> = {
  all: ['payout', 'maturity', 'tds_filing'],
  payout: ['payout'],
  maturity: ['maturity'],
  tds_filing: ['tds_filing'],
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function QuickSendPanel({
  pending,
  onSend,
  sending,
}: {
  pending: EnrichedItem[]
  onSend: (ids: string[]) => void
  sending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filterType, setFilterType] = useState<FilterType>('payout')
  const [timeframe, setTimeframe] = useState<Timeframe>(7)
  const [previewed, setPreviewed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const todayStr = new Date().toISOString().split('T')[0]
  const cutoffStr = new Date(Date.now() + timeframe * 86400000).toISOString().split('T')[0]

  const matchedItems = useMemo(() => {
    const types = FILTER_TYPES[filterType]
    return pending.filter(item =>
      item.due_date != null &&
      item.due_date >= todayStr &&
      item.due_date <= cutoffStr &&
      types.includes(item.notification_type)
    )
  }, [pending, filterType, timeframe, todayStr, cutoffStr])

  const selectedItems = matchedItems.filter(item => selected.has(item.id))

  // Salesperson breakdown from selected items
  const spBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    let unassigned = 0
    for (const item of selectedItems) {
      const name = item.agreement?.salesperson?.name
      if (name) {
        counts[name] = (counts[name] ?? 0) + 1
      } else {
        unassigned++
      }
    }
    return { counts, unassigned }
  }, [selectedItems])

  function handlePreview() {
    const allIds = new Set(matchedItems.map(i => i.id))
    setSelected(allIds)
    setPreviewed(true)
  }

  function toggleAll() {
    if (selected.size === matchedItems.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(matchedItems.map(i => i.id)))
    }
  }

  function toggle(id: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function handleSend() {
    onSend(Array.from(selected))
    setPreviewed(false)
    setSelected(new Set())
  }

  function handleTypeChange(v: FilterType) {
    setFilterType(v)
    setPreviewed(false)
    setSelected(new Set())
  }

  function handleTimeframeChange(v: Timeframe) {
    setTimeframe(v)
    setPreviewed(false)
    setSelected(new Set())
  }

  const spSummaryParts = [
    ...Object.entries(spBreakdown.counts).map(([name, count]) => `${name}: ${count}`),
    ...(spBreakdown.unassigned > 0 ? [`Unassigned: ${spBreakdown.unassigned}`] : []),
  ]

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">Quick Send</span>
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wide">preset bulk send</span>
        </div>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-800">
          {/* Configure row */}
          <div className="flex items-center gap-3 pt-4 flex-wrap">
            <select
              value={filterType}
              onChange={e => handleTypeChange(e.target.value as FilterType)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <select
              value={timeframe}
              onChange={e => handleTimeframeChange(Number(e.target.value) as Timeframe)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {TIMEFRAME_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <button
              onClick={handlePreview}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              Preview
            </button>
          </div>

          {/* Preview table */}
          {previewed && (
            <>
              {matchedItems.length === 0 ? (
                <p className="text-slate-500 text-sm italic py-4 text-center">
                  No {TYPE_OPTIONS.find(o => o.value === filterType)?.label.toLowerCase()} due in the next {timeframe} days.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-slate-300">
                    <thead>
                      <tr className="border-b border-slate-700 text-xs text-slate-400">
                        <th className="pb-2 pr-3 text-left w-8">
                          <input
                            type="checkbox"
                            checked={selected.size === matchedItems.length && matchedItems.length > 0}
                            onChange={toggleAll}
                            className="accent-indigo-500"
                          />
                        </th>
                        <th className="pb-2 pr-4 text-left">Investor</th>
                        <th className="pb-2 pr-4 text-left">Ref</th>
                        <th className="pb-2 pr-4 text-left whitespace-nowrap">Due</th>
                        <th className="pb-2 text-left">Salesperson</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedItems.map(item => (
                        <tr key={item.id} className="border-b border-slate-700/40 hover:bg-slate-800/20">
                          <td className="py-2.5 pr-3">
                            <input
                              type="checkbox"
                              checked={selected.has(item.id)}
                              onChange={() => toggle(item.id)}
                              className="accent-indigo-500"
                            />
                          </td>
                          <td className="py-2.5 pr-4 font-medium text-slate-100">
                            {item.agreement?.investor_name ?? <span className="italic text-slate-500">—</span>}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-[10px] text-slate-500">
                            {item.agreement?.reference_id ?? '—'}
                          </td>
                          <td className="py-2.5 pr-4 whitespace-nowrap text-xs">
                            {fmtDate(item.due_date)}
                          </td>
                          <td className="py-2.5 text-xs text-slate-400">
                            {item.agreement?.salesperson?.name ?? <span className="italic">Unassigned</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary bar */}
              {matchedItems.length > 0 && (
                <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-3 gap-4 flex-wrap">
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-300 font-medium">
                      {selected.size} of {matchedItems.length} selected
                    </p>
                    {spSummaryParts.length > 0 && (
                      <p className="text-[11px] text-slate-500">
                        {spSummaryParts.join(' · ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={selected.size === 0 || sending}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {sending ? 'Sending…' : `Send ${selected.size > 0 ? selected.size : ''} notification${selected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/notifications/QuickSendPanel.tsx
git commit -m "feat: add QuickSendPanel component"
```

---

## Task 4: Wire QuickSendPanel into NotificationsClient

**Files:**
- Modify: `src/components/notifications/NotificationsClient.tsx`

Mount `QuickSendPanel` above the tab bar. Pass it `pending` items and the existing `handleSend` function.

- [ ] **Step 1: Import QuickSendPanel**

At the top of `src/components/notifications/NotificationsClient.tsx`, add the import after the existing imports:

```ts
import QuickSendPanel from '@/components/notifications/QuickSendPanel'
```

- [ ] **Step 2: Update the EnrichedItem type to include salesperson name**

Replace the existing `EnrichedItem` type in `NotificationsClient.tsx`:

```ts
type EnrichedItem = NotificationQueue & {
  agreement?: {
    id: string
    investor_name: string
    reference_id: string
    salesperson?: { name: string } | null
  } | null
  sent_by_member?: { name: string } | null
}
```

- [ ] **Step 3: Mount QuickSendPanel in the return JSX**

In the `NotificationsClient` return, add `QuickSendPanel` between the error block and the tab bar. Only show it to coordinators. Replace:

```tsx
      <div className="flex gap-1 border-b border-slate-800">
```

with:

```tsx
      {isCoordinator && (
        <QuickSendPanel
          pending={pending}
          onSend={handleSend}
          sending={sending}
        />
      )}

      <div className="flex gap-1 border-b border-slate-800">
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: no TypeScript errors, clean build.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/notifications/NotificationsClient.tsx
git commit -m "feat: mount QuickSendPanel on notifications page"
```

---

## Task 5: Update SESSION.md and push

- [ ] **Step 1: Update SESSION.md**

Update `SESSION.md`:
- Active Batch → `Quick Send Panel`
- Phase → `reviewing`
- Work Completed: list all 4 tasks
- Files Changed: list the 4 files
- Next Agent Action → `Codex: review QuickSendPanel logic and type consistency`

- [ ] **Step 2: Push**

```bash
git push
```
