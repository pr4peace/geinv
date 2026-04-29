# Notifications Context — Design Spec
Date: 2026-04-29

## Overview

Two enhancements to `/notifications` that give coordinators immediate clarity on what's coming and why each queued item is there — especially useful when the queue is empty.

---

## Feature A: Stats Header

Always shown at the top of `/notifications`, above the Quick Send panel and the tab bar.

**Layout:** A single row of 4 stat pills. Each pill shows a count + label. If count is zero, pill is greyed out.

```
📅 Payouts: 5 in 30 days   🏁 Maturities: 2 in 90 days   📋 TDS: 1 in 60 days   📄 Docs overdue: 0
```

**Data source:** Source tables directly — NOT the `notification_queue`. Queries run server-side in `page.tsx` via `createAdminClient()` alongside existing fetches. No new API route.

**Queries:**
- **Payouts:** `payout_schedule` where `status != paid`, `is_tds_only = false`, `is_principal_repayment = false`, `due_by` between today and +30 days, agreement active + not deleted
- **Maturities:** `agreements` where `status = active`, `deleted_at = null`, `maturity_date` between today and +90 days
- **TDS filing:** `payout_schedule` where `is_tds_only = true`, `status != paid`, `due_by` between today and +60 days, agreement active + not deleted
- **Docs overdue:** `agreements` where `doc_status = sent_to_client`, `doc_returned_date = null`, `deleted_at = null`, `doc_sent_to_client_date <= today - 30 days`

**Props:** Pass a `stats: NotificationStats` object to `NotificationsClient`:
```ts
type NotificationStats = {
  payouts: number      // due in next 30 days
  maturities: number   // due in next 90 days
  tdsFilings: number   // due in next 60 days
  docsOverdue: number  // sent >30 days ago, not returned
}
```

---

## Feature B: Per-Item Trigger Label

A sub-line under each investor name in the queue table (in `QueueTable` inside `NotificationsClient`). Derived client-side from `due_date` vs today. Shown in `text-[10px] text-slate-500`.

**Label rules by notification_type:**

| Type | Label |
|---|---|
| `payout` (overdue) | `Overdue by N days` |
| `payout` (upcoming) | `Due in N days` |
| `maturity` | `Matures in N days` |
| `tds_filing` | `Filing due in N days` |
| `doc_return` | `Sent N days ago, not returned` |
| `monthly_summary` | `Monthly summary` |
| `quarterly_forecast` | `Quarterly forecast` |

"Overdue" = `due_date < today`. Days calculated from `due_date` vs today.

---

## Files to Change

| File | Change |
|---|---|
| `src/app/(app)/notifications/page.tsx` | Add `fetchStats()` function, pass `stats` prop to `NotificationsClient` |
| `src/components/notifications/NotificationsClient.tsx` | Accept `stats` prop, render `StatsHeader`, add trigger label to `QueueTable` rows |

---

## Out of Scope
- Clicking a stat pill to filter the queue
- Stats auto-refresh without page reload
- Stats for salesperson role (show to coordinators only, or show scoped counts — keep simple, show all for now)
