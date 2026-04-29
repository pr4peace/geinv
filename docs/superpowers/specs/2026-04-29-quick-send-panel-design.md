# Quick Send Panel — Design Spec
Date: 2026-04-29

## Overview

A collapsible "Quick Send" panel at the top of `/notifications` that lets the coordinator configure a type + timeframe, preview matching items with checkboxes, review inline summary stats, and send emails in one flow — without leaving the page.

Also includes a fix for the `notification_queue` silent insert failure on re-runs.

---

## Feature: Quick Send Panel

### Location
Top of `/notifications` page, above the existing queue sections. Collapsible — starts collapsed, expands on click.

### Configure Row
Two dropdowns + one button, inline:
- **Type:** `Payouts | Maturity | TDS Filing | All`
- **Timeframe:** `7 days | 14 days | 31 days`
- **Preview button:** loads results inline below the configure row

### Preview List
Appears below the configure row after Preview is clicked. Table with columns:
- Checkbox (checked by default)
- Investor name
- Reference ID
- Due date
- Amount (net payout, or maturity principal)
- Salesperson

Unchecking a row excludes it from the send. Summary stats update live as checkboxes change.

**Empty state:** Single line — "No [type] due in the next [N] days."

### Summary Bar
Shown between the preview list and the Send button. Updates live with checkbox state:
- `X of Y selected`
- Salesperson breakdown: `Ravi: 4 · Priya: 2 · Unassigned: 1`
- Total net value (₹) — shown for Payouts and All types
- **"Send to selected" button**

### Send Action
- Calls existing `POST /api/notifications/send` with selected `payout_schedule_id` or `agreement_id` values + type
- On success: shows existing `UndoToast` (5s, bottom-right), panel collapses back to configure state
- On error: inline error message below the Send button

---

## Bug Fix: notification_queue Silent Insert Failure

**File:** `src/app/api/reminders/process/route.ts`

**Problem:** Plain `.insert()` with no `onConflict` causes Postgres to return a 409 on duplicate items. The route silently ignores the error (`if (!error)`), so subsequent cron runs add nothing to the queue.

**Fix:** Replace `.insert(allItems)` with `.upsert(allItems, { onConflict: '...', ignoreDuplicates: true })`. Need to confirm the unique index column(s) on `notification_queue` to specify the conflict target.

---

## API

No new routes needed. Quick Send queries `notification_queue` (already populated by cron) filtered by type + due_date window. Sends via existing `POST /api/notifications/send`.

If the queue is empty (cron hasn't run), the preview will show the empty state. A "Refresh queue" trigger (calls `POST /api/reminders/process` with CRON_SECRET) is out of scope for this batch.

---

## Files to Change

| File | Change |
|---|---|
| `src/app/(app)/notifications/page.tsx` | Mount `QuickSendPanel` above queue sections |
| `src/components/notifications/NotificationsClient.tsx` | Add `QuickSendPanel` component or import it |
| `src/components/notifications/QuickSendPanel.tsx` | New component — configure, preview list, summary bar, send |
| `src/app/api/reminders/process/route.ts` | Fix insert → upsert with ignoreDuplicates |

---

## Out of Scope
- Manual cron trigger from the UI
- Saving preset configurations
- Per-item email preview before sending
