# Batch F — Notification Revamp Design

**Date:** 2026-04-28  
**Status:** Approved  
**Author:** Claude Code (brainstorm session with Prashanth)

---

## Problem

The current notification system fires emails automatically without any human review. This causes:
- Noisy auto-emails (payout reminders 7 days before + day-of, maturity at 90/30/7 days)
- No coordinator control over what goes out or when
- TDS filing reminders don't exist as emails at all
- No single place to see what's coming up and act on it

## Goal

Give the accounts team (coordinator) full control over all outbound notifications through a review queue. Nothing sends automatically to external parties. The cron maintains DB state but humans send everything.

---

## Design

### Approach: Simple Staging Queue

One new `/notifications` page. The cron populates a `notification_queue` table instead of firing emails. Coordinator reviews, selects, and sends. The `reminders` table stays as audit log.

---

## Data Model

### New table: `notification_queue`

```sql
create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references agreements(id) on delete cascade,
  payout_schedule_id uuid references payout_schedule(id) on delete cascade,
  notification_type text not null,
    -- 'payout' | 'maturity' | 'tds_filing' | 'doc_return' 
    -- | 'monthly_summary' | 'quarterly_forecast'
  due_date date,                          -- payout due date, maturity date, 31 Mar, etc.
  status text not null default 'pending', -- 'pending' | 'sent' | 'dismissed'
  recipients jsonb not null default '{}', -- { accounts: string[], salesperson: string | null }
  suggested_subject text,                 -- pre-built subject line
  suggested_body text,                    -- pre-built HTML email body
  sent_at timestamptz,
  sent_by uuid references team_members(id),
  created_at timestamptz not null default now()
);

create index on notification_queue(status, due_date);
create index on notification_queue(agreement_id);
create unique index on notification_queue(agreement_id, payout_schedule_id, notification_type, due_date)
  where status = 'pending'; -- prevent duplicate pending rows
```

### Existing tables (unchanged)
- `reminders` — stays as full audit log. Written to when coordinator sends.
- `payout_schedule` — cron still marks `status = 'overdue'` where due.

---

## Notification Types & Recipients

| Type | Trigger window | Accounts | Salesperson |
|---|---|---|---|
| `payout` | Due in next 30 days | ✅ | ✅ |
| `maturity` | Due in next 90 days | ✅ | ✅ |
| `tds_filing` | 31 Mar rows due in next 60 days | ✅ | ✅ (awareness) |
| `doc_return` | >30 days since sent to client | ✅ | ✅ |
| `monthly_summary` | 1st of each month | ✅ | ❌ |
| `quarterly_forecast` | Quarter start | ✅ | ❌ |

---

## Cron Changes (`GET /api/reminders/process`)

The cron **stops sending all emails**. It instead:

1. **Populates `notification_queue`** — idempotently inserts rows for upcoming items (checks for existing `pending` row before inserting):
   - Active payout_schedule rows with `due_by` within 30 days and `status != 'paid'`
   - Active agreements with `maturity_date` within 90 days
   - TDS-only payout_schedule rows with `due_by` within 60 days
   - Agreements with `doc_status = 'sent_to_client'` and `doc_sent_to_client_date` > 30 days ago
   - On 1st of month: one `monthly_summary` row (no agreement)
   - On quarter start: one `quarterly_forecast` row (no agreement)

2. **Still marks overdue** — `payout_schedule.status = 'overdue'` where `due_by < today` and `status = 'pending'`. No change.

3. **Sends nothing** — remove all `sendEmail()` calls from the cron.

**Pre-builds email content** at queue time (subject + body) using existing builder functions in `src/lib/reminders.ts`. This means the coordinator sees exactly what will be sent before clicking Send.

---

## Send API

### `POST /api/notifications/send`

**Auth:** coordinator or admin only (x-user-role header check)

**Request body:**
```json
{ "ids": ["uuid1", "uuid2"] }
```

**For each ID:**
1. Fetch the `notification_queue` row
2. If already `sent`, skip silently
3. Send email using existing `sendEmail()` with `suggested_subject` + `suggested_body` to `recipients`
4. Mark `notification_queue` row as `sent`, set `sent_at = now()`, `sent_by = callerTeamMemberId`
5. Write row to `reminders` table for audit (same schema as today)

**Response:**
```json
{ "sent": 3, "failed": 1, "errors": ["uuid4: email failed"] }
```

### `POST /api/notifications/[id]/dismiss`

Mark a single queue item as `dismissed` (won't show in queue again).

---

## `/notifications` Page

**Route:** `src/app/(app)/notifications/page.tsx`  
**Access:** All authenticated roles (salesperson sees only their items)

### Three tabs

**Queue tab (default)**
- All `status: 'pending'` rows ordered by `due_date ASC`
- Grouped by `notification_type`
- Checkbox per row
- "Send selected" button (calls `/api/notifications/send`)
- "Dismiss" button per row
- Urgency highlight: red border if `due_date < today + 7 days`
- Per row shows: type badge, investor name, due date, recipient preview

**Red Flags tab**
- Same as Queue but filtered to urgent:
  - `payout` where `due_date < today` (overdue)
  - `maturity` where `due_date < today + 14 days`
  - `tds_filing` where `due_date < today + 7 days`
  - `doc_return` (all — already >30 days)
- Read-only label "URGENT" — but still sendable

**History tab**
- `status: 'sent'` rows, last 30 days
- Shows: sent_at, sent_by name, type, investor, subject
- "Re-send" button per row (creates new send, doesn't update old row)

### Salesperson scoping
If `x-user-role = 'salesperson'`: filter all queries to `agreement_id IN (agreements where salesperson_id = userTeamId)`. Monthly summary and quarterly forecast are hidden from salesperson view.

---

## Sidebar Navigation

Add "Notifications" to sidebar in `src/app/(app)/layout.tsx`:
- Icon: `Bell` (already imported in codebase)
- Between Dashboard and Agreements
- Show a red dot badge if any `notification_queue` rows are `pending` with `due_date <= today + 7`

---

## Migration

**File:** `supabase/migrations/018_notification_queue.sql`

Creates `notification_queue` table with indexes as defined above.

---

## What Stays Unchanged

- `reminders` table structure and existing data
- Monthly summary email template (`buildMonthlyPayoutSummaryEmail`)
- Quarterly forecast email template (`sendQuarterlyForecast`)
- Payout/maturity/doc-return email body builders in `src/lib/reminders.ts`
- All existing `reminders` API routes (`/api/reminders/summary`, etc.)
- Vercel cron schedule (still daily at 02:00 UTC)

---

## Implementation Order

1. Migration — `018_notification_queue.sql`
2. Cron rewrite — populate queue, stop sending
3. Send API — `POST /api/notifications/send` + dismiss
4. `/notifications` page — Queue tab first, then Red Flags, then History
5. Sidebar badge

---

## Out of Scope (Future)

- Push notifications / Slack
- Investor-facing emails (external recipients)
- Email preview modal before sending
- Scheduled send (send at a specific time)
