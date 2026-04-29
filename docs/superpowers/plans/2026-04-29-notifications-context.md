# Notifications Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stats header (upcoming counts from source tables) and per-item trigger labels to `/notifications` so coordinators always have context, even when the queue is empty.

**Architecture:** Stats are fetched server-side in `page.tsx` using `createAdminClient()` — no new API routes. A `NotificationStats` type is passed as a prop to `NotificationsClient`. The `StatsHeader` sub-component is inlined in `NotificationsClient`. Per-item trigger labels are derived client-side from `due_date` vs today inside `QueueTable`.

**Tech Stack:** Next.js 14 App Router · React server + client components · Supabase admin client · Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/app/(app)/notifications/page.tsx` | Modify | Add `fetchStats()`, pass `stats` prop |
| `src/components/notifications/NotificationsClient.tsx` | Modify | Accept `stats`, render `StatsHeader`, add trigger label in `QueueTable` |

---

## Task 1: Add fetchStats to notifications page

**Files:**
- Modify: `src/app/(app)/notifications/page.tsx`

- [ ] **Step 1: Add the NotificationStats type and fetchStats function**

Add after the existing `EnrichedItem` type in `src/app/(app)/notifications/page.tsx`:

```ts
type NotificationStats = {
  payouts: number
  maturities: number
  tdsFilings: number
  docsOverdue: number
}

async function fetchStats(): Promise<NotificationStats> {
  const supabase = createAdminClient()
  const todayStr = new Date().toISOString().split('T')[0]
  const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  const plus90 = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
  const plus60 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
  const minus30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [payoutsRes, maturitiesRes, tdsRes, docsRes] = await Promise.all([
    supabase
      .from('payout_schedule')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'paid')
      .eq('is_tds_only', false)
      .eq('is_principal_repayment', false)
      .gte('due_by', todayStr)
      .lte('due_by', plus30),
    supabase
      .from('agreements')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null)
      .gte('maturity_date', todayStr)
      .lte('maturity_date', plus90),
    supabase
      .from('payout_schedule')
      .select('id', { count: 'exact', head: true })
      .eq('is_tds_only', true)
      .neq('status', 'paid')
      .gte('due_by', todayStr)
      .lte('due_by', plus60),
    supabase
      .from('agreements')
      .select('id', { count: 'exact', head: true })
      .eq('doc_status', 'sent_to_client')
      .is('doc_returned_date', null)
      .is('deleted_at', null)
      .lte('doc_sent_to_client_date', minus30),
  ])

  return {
    payouts: payoutsRes.count ?? 0,
    maturities: maturitiesRes.count ?? 0,
    tdsFilings: tdsRes.count ?? 0,
    docsOverdue: docsRes.count ?? 0,
  }
}
```

- [ ] **Step 2: Call fetchStats in the page and pass stats to NotificationsClient**

In `NotificationsPage`, update the parallel fetches and the return:

```ts
export default async function NotificationsPage() {
  const headersList = await headers()
  const userRole = headersList.get('x-user-role') ?? ''
  const userTeamId = headersList.get('x-user-team-id') ?? ''
  const salespersonId = userRole === 'salesperson' ? userTeamId : undefined

  const [pending, sent, stats] = await Promise.all([
    fetchItems('pending', salespersonId).catch(() => [] as EnrichedItem[]),
    fetchItems('sent', salespersonId).catch(() => [] as EnrichedItem[]),
    fetchStats().catch(() => ({ payouts: 0, maturities: 0, tdsFilings: 0, docsOverdue: 0 })),
  ])

  const todayStr = new Date().toISOString().split('T')[0]
  const sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const redFlags = pending.filter(item => {
    if (!item.due_date) return false
    const type = item.notification_type
    if (type === 'payout') return item.due_date < todayStr
    if (type === 'maturity') return item.due_date <= sevenDaysOut
    if (type === 'tds_filing') return item.due_date <= sevenDaysOut
    if (type === 'doc_return') return true
    return false
  })

  return (
    <NotificationsClient
      pending={pending}
      redFlags={redFlags}
      history={sent}
      userRole={userRole}
      stats={stats}
    />
  )
}
```

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: TypeScript error on `NotificationsClient` props until Task 2 is done — that's fine, proceed.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/notifications/page.tsx
git commit -m "feat: fetch notification stats server-side"
```

---

## Task 2: Add StatsHeader and trigger labels to NotificationsClient

**Files:**
- Modify: `src/components/notifications/NotificationsClient.tsx`

- [ ] **Step 1: Add NotificationStats type and StatsHeader component**

Add after the existing imports and type definitions in `NotificationsClient.tsx`:

```ts
type NotificationStats = {
  payouts: number
  maturities: number
  tdsFilings: number
  docsOverdue: number
}

function StatsHeader({ stats }: { stats: NotificationStats }) {
  const pills = [
    { label: 'Payouts', count: stats.payouts, window: '30 days', icon: '📅' },
    { label: 'Maturities', count: stats.maturities, window: '90 days', icon: '🏁' },
    { label: 'TDS filing', count: stats.tdsFilings, window: '60 days', icon: '📋' },
    { label: 'Docs overdue', count: stats.docsOverdue, window: null, icon: '📄' },
  ]

  return (
    <div className="flex flex-wrap gap-3">
      {pills.map(pill => (
        <div
          key={pill.label}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${
            pill.count > 0
              ? 'bg-slate-800 border-slate-700 text-slate-200'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          <span>{pill.icon}</span>
          <span className={pill.count > 0 ? 'font-semibold' : ''}>{pill.count}</span>
          <span className="text-slate-400">{pill.label}</span>
          {pill.window && pill.count > 0 && (
            <span className="text-[11px] text-slate-500">in {pill.window}</span>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add getTriggerLabel helper**

Add this function after `StatsHeader`:

```ts
function getTriggerLabel(item: EnrichedItem): string {
  const todayStr = new Date().toISOString().split('T')[0]
  const due = item.due_date
  if (!due) {
    if (item.notification_type === 'monthly_summary') return 'Monthly summary'
    if (item.notification_type === 'quarterly_forecast') return 'Quarterly forecast'
    return ''
  }

  const diffDays = Math.round(
    (new Date(due).getTime() - new Date(todayStr).getTime()) / 86400000
  )

  switch (item.notification_type) {
    case 'payout':
      return diffDays < 0
        ? `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`
        : `Due in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
    case 'maturity':
      return `Matures in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
    case 'tds_filing':
      return `Filing due in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
    case 'doc_return':
      return `Sent ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago, not returned`
    case 'monthly_summary':
      return 'Monthly summary'
    case 'quarterly_forecast':
      return 'Quarterly forecast'
    default:
      return ''
  }
}
```

- [ ] **Step 3: Add trigger label to QueueTable rows**

In `QueueTable`, find the investor name cell (the `<td>` that renders `item.agreement?.investor_name`) and add the trigger label as a sub-line:

```tsx
<td className="py-2.5 pr-4">
  {item.agreement ? (
    <div>
      <p className="text-slate-100 font-medium">{item.agreement.investor_name}</p>
      <p className="text-[10px] text-slate-500 font-mono">{item.agreement.reference_id}</p>
      {getTriggerLabel(item) && (
        <p className="text-[10px] text-slate-500 mt-0.5">{getTriggerLabel(item)}</p>
      )}
    </div>
  ) : (
    <p className="text-slate-400 italic text-xs">{TYPE_LABELS[item.notification_type]}</p>
  )}
</td>
```

- [ ] **Step 4: Accept stats prop in NotificationsClient and render StatsHeader**

Update the `NotificationsClient` props and add `StatsHeader` above the error block:

```ts
export default function NotificationsClient({
  pending, redFlags, history, userRole, stats,
}: {
  pending: EnrichedItem[]
  redFlags: EnrichedItem[]
  history: EnrichedItem[]
  userRole: string
  stats: NotificationStats
}) {
```

Add `StatsHeader` in the return, between the heading block and the error block:

```tsx
      <StatsHeader stats={stats} />

      {error && (
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/notifications/NotificationsClient.tsx
git commit -m "feat: stats header and trigger labels on notifications page"
```

---

## Task 3: Update SESSION.md and push

- [ ] **Step 1: Update SESSION.md**

Set Phase → `reviewing`, update Work Completed with this batch, Next Agent Action → `Codex: review stats queries and trigger label logic`.

- [ ] **Step 2: Push**

```bash
git push
```
