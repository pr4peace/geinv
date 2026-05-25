# Batch F — Notification Revamp Design

**Date:** 2026-05-25  
**Branch:** `feature/batch-f-notifications`  
**Status:** Approved

---

## Goal

Replace the basic monthly summary + single send button on `/notifications` with a coordinator action center. Coordinator batch emails are **manual-only**; existing automated red-flag and summary jobs remain governed by Batch F.

---

## Page Structure

`/notifications` — one page, two tabs:

- **Queue** (default) — items needing action, grouped into 3 sections
- **History** — emails sent in the last 30 days

### Queue Tab — 3 Sections

Each section has:
- A table with checkboxes per row
- **Notify All** button (sends one batched email for all items in that section)
- **Notify Selected** button (active when rows are checked — sends batched email for checked items only)
- Idempotency warning if any selected item was notified in the last 7 days (warning, not a block — coordinator can override)

| Section | Data source | Overdue colour |
|---|---|---|
| **Payouts** | `payout_schedule` where `status=pending`, `is_tds_only=false` | Red badge |
| **Maturities** | `agreements` where `status=active` | Red badge |
| **TDS Filings** | `payout_schedule` where `status=pending`, `is_tds_only=true` | Red badge |

### History Tab

Reads from `reminders` table: `status = 'sent'`, `sent_at ≥ 30 days ago`, ordered by `sent_at DESC`.  
Columns: Date Sent · Type · Subject · Recipient.

---

## Data Window

- Payouts/TDS filter: `due_by ≤ today + 60 days` (no lower bound — includes all overdue)
- Maturities filter: `maturity_date ≤ today + 60 days` (no lower bound — includes all overdue)

---

## API

### `POST /api/notifications/send`

```ts
body: {
  type: 'payouts' | 'maturities' | 'tds'
  ids: string[]
  // For type='payouts' or 'tds': ids are payout_schedule.id values
  // For type='maturities': ids are agreements.id values
}
```

Steps:
1. Validate role — block `salesperson`
2. Fetch the specified items by IDs
3. Check idempotency — if any item has a `reminders` row with `status=sent` in last 7 days, include a warning in the response but proceed
4. Build one batched HTML email (same style as existing monthly summary email in `src/lib/email.ts`)
5. Send to accountant (fetch from `team_members` where `role=accountant`, `is_active=true`)
6. Log **one `reminders` row per selected item**, all with the same `email_subject`, `email_to`, and `sent_at=now()`. For payouts/TDS set `payout_schedule_id`; for maturities set `agreement_id`. Use `reminder_type='batch_notification'`.
7. Return `{ success: true, warned: boolean, emailId: string }`

### `/api/cron/monthly-summary`

Stays in place but is no longer linked from the UI. Manual API call only. No cron schedule (no vercel.json exists).

---

## Email Format

One HTML email per "Notify All / Notify Selected" action. Format reuses the existing table style from `src/lib/email.ts`. Subject lines:

- Payouts: `Interest Payouts — <count> items · ₹<total net> net payable`
- Maturities: `Principal Maturities — <count> agreements maturing`
- TDS Filings: `TDS Filings Due — <count> items · ₹<total tds> due`

---

## Types

In `src/types/database.ts`:

```ts
// Add to ReminderType union:
export type ReminderType = 'payout' | 'maturity' | 'doc_return' | 'quarterly_forecast' | 'payout_monthly_summary' | 'batch_notification'
```

`batch_notification` distinguishes coordinator-initiated batch sends from the existing per-payout individual notifies.

---

## Migration

Add `supabase/migrations/024_batch_notification_reminder_type.sql` to update the `reminders_reminder_type_check` constraint to include `batch_notification`. Check the current allowed values in `supabase/migrations/011_feedback_apr2026.sql` before writing the constraint.

---

## Files

| File | Change |
|---|---|
| `src/app/(app)/notifications/page.tsx` | Expand server component — 3 queries with 60-day window, pass to client |
| `src/components/notifications/NotificationsClient.tsx` | Full rebuild — tabs, sections, checkboxes, Notify All/Selected, history list |
| `src/types/database.ts` | Add `batch_notification` to `ReminderType` |
| `src/lib/email.ts` | Add `sendBatchNotification()` helper; leave `sendQuarterlyForecast()` untouched |
| `src/app/api/notifications/send/route.ts` | New POST route — validate, fetch, email, log per-item |
| `supabase/migrations/024_batch_notification_reminder_type.sql` | Add `batch_notification` to DB check constraint |

No new tables. No nav changes (Notifications already in sidebar).

---

## Out of Scope

- Auto-send / cron scheduling for coordinator batch emails
- Automated red-flag and summary jobs (governed by rest of Batch F, not this spec)
- Investor-direct emails (accountant only)
- Per-row notify button changes on agreement detail page (unchanged)
- `/api/cron/monthly-summary` deletion (leave in place, just remove UI trigger)
