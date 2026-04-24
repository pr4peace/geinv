# Activity Log, Email Preview Modal & Salesperson Routing — Design Spec

**Date:** 2026-04-24
**Goal:** Add a preview modal before sending reminder summaries, route individual emails per salesperson (with Valli CC'd on each), log all activity (emails, payout actions, agreement events) with sequence numbers, and provide an Activity Log page with type filters to review history.

---

## Overview

Sending a reminder summary currently fires one email immediately with no preview and no audit trail. This spec replaces that with:

1. A **preview modal** showing each email before it sends, with selectable/editable recipients
2. **Per-salesperson emails** — each salesperson receives only their own investors' payouts; Valli is CC'd on every one
3. A **Master Summary** option Irene can send to Valli with all payouts combined
4. An **activity_log table** recording all significant events — emails sent, payouts marked paid/notified, agreements created/updated — with a shared sequence number per send round for emails
5. An **/activity-log page** in the sidebar with type filters (Emails / Payouts / Agreements) to review full history

---

## Section 1 — Data Model

### New table: `activity_log`

One table covers all event types. The `type` column determines which optional fields are populated.

```sql
CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_number serial NOT NULL,
  send_round integer,                 -- groups emails from one "Send" action (email events only)
  type text NOT NULL CHECK (type IN (
    -- email types
    'salesperson_summary', 'master_summary', 'payout_notify', 'quarterly_forecast',
    -- payout action types
    'payout_marked_paid', 'payout_notified',
    -- agreement action types
    'agreement_created', 'agreement_updated', 'agreement_deleted'
  )),
  -- email fields (populated for email types)
  subject text,
  sent_to text[],
  sent_cc text[],
  html_body text,
  email_status text CHECK (email_status IN ('sent', 'failed')),
  resend_id text,
  error_message text,
  recipient_name text,
  -- shared reference fields
  agreement_id uuid REFERENCES agreements(id) ON DELETE SET NULL,
  payout_schedule_id uuid REFERENCES payout_schedule(id) ON DELETE SET NULL,
  investor_name text,                 -- denormalised for display without joins
  investors_count integer,
  -- metadata
  actor text,                         -- who triggered the action (email address or 'system')
  notes text,                         -- free text for context
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_activity_log_type ON activity_log(type);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_activity_log_agreement_id ON activity_log(agreement_id);

CREATE SEQUENCE activity_send_round_seq;
```

### TypeScript type (src/types/database.ts)

```ts
export type ActivityLogType =
  | 'salesperson_summary' | 'master_summary' | 'payout_notify' | 'quarterly_forecast'
  | 'payout_marked_paid' | 'payout_notified'
  | 'agreement_created' | 'agreement_updated' | 'agreement_deleted'

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

### Changes to `src/lib/email.ts`

- Add optional `cc?: string[]` param to `sendEmail`
- `sendEmail` returns `resend_id` (already returned as `id` from Resend)

### New `src/lib/activity-log.ts`

Single exported function used by all callers:

```ts
export async function logActivity(params: {
  type: ActivityLogType
  // email fields
  send_round?: number
  subject?: string
  sent_to?: string[]
  sent_cc?: string[]
  html_body?: string
  email_status?: 'sent' | 'failed'
  resend_id?: string
  error_message?: string
  recipient_name?: string
  investors_count?: number
  // reference fields
  agreement_id?: string
  payout_schedule_id?: string
  investor_name?: string
  actor?: string
  notes?: string
}): Promise<void>
```

---

## Section 2 — Preview Modal Flow

### GET `/api/reminders/summary/preview`

Returns the data needed to render the modal — **no email is sent**.

Response shape:
```ts
{
  send_round: number,           // next sequence number from email_send_round_seq
  monthLabel: string,
  emails: Array<{
    id: string,                 // client-side key (salesperson_id or 'master')
    type: 'salesperson_summary' | 'master_summary',
    recipient_name: string,     // e.g. "Preetha Shankar" or "Master Summary"
    to: Array<{ name: string; email: string }>,
    cc: Array<{ name: string; email: string }>,
    subject: string,
    html: string,
    investors_count: number,
  }>
}
```

Logic:
1. Fetch `getPayoutReminders()`, `getMaturingAgreements()`, `getDocsPendingReturn()`
2. For each payout row, join to `agreements.salesperson_id` → `team_members` to get salesperson
3. Group payouts by salesperson. Build one email per salesperson containing only their payouts
4. Valli (`role = 'accountant'`) is always pre-populated as CC on each salesperson email
5. Build one master summary email (all payouts, same format as current summary)
6. Get next `send_round` value from sequence (but do NOT consume it yet — consumed on POST)

### POST `/api/reminders/summary`

Accepts the user's confirmed recipient selections:

```ts
{
  send_round: number,
  emails: Array<{
    id: string,
    type: string,
    subject: string,
    html: string,
    to: string[],     // user may have edited/deselected
    cc: string[],
    recipient_name: string,
    investors_count: number,
  }>
}
```

For each email in the array:
1. Call `sendEmail({ to, cc, subject, html })`
2. Call `logEmail(...)` with result (sent or failed)

Returns `{ results: Array<{ id, status, error? }> }`.

---

## Section 3 — Salesperson Email Routing

### Per-salesperson email

- Built from payouts filtered to that salesperson's `agreement.salesperson_id`
- Subject: `"[Month] Payout Reminder — Your Investors"`
- Contains only: interest payouts for their investors (overdue + this month), maturities for their investors
- Docs pending return are NOT included per-salesperson (coordinator-level concern)
- Valli CC'd by default

### Master summary email

- Identical to current summary: all 4 sections (overdue, this month, maturing, docs pending)
- Sent to Valli only (no CC)
- Optional — shown in preview but unchecked by default (Irene must actively choose to include it)

### Salesperson with no payouts this month

Not included in the email list at all — no email sent, no preview card shown.

### Agreements with `salesperson_custom` (free-text, no email)

Shown in the preview card as a note ("Managed by: [name]") but no email sent since no email address is available.

---

## Section 4 — Preview Modal UI

### Component: `src/components/dashboard/SendReminderSummaryModal.tsx`

States: `idle` → `loading` → `preview` → `sending` → `done`

**idle:** "Send Summary" button in dashboard header.

**loading:** Button shows spinner while `GET /api/reminders/summary/preview` runs.

**preview modal:**
- Modal title: "Preview — Reminder Summary [Month]"
- One card per email (salesperson emails first, master summary last)
- Each card:
  - Recipient name as heading
  - Email preview in `<iframe srcdoc="...">` (height ~400px, scrollable)
  - **To:** row — each recipient shown as a removable chip (×)
  - **CC:** row — each recipient shown as a removable chip (×)
  - "Add recipient" text input with + button — adds to To field
  - Checkbox in card header to include/exclude this email entirely
- "Send Selected" button at bottom (disabled if nothing selected)
- "Cancel" button

**sending:** Button shows spinner, cards disabled.

**done:** Toast "X emails sent" + modal closes. Dashboard header shows last sent time.

---

## Section 5 — Activity Log Page

### Route: `/activity-log`

Added to sidebar nav. Shows all event types with filter tabs at the top.

### Filter tabs

**All · Emails · Payouts · Agreements**

- **All** — everything, newest first
- **Emails** — types: salesperson_summary, master_summary, payout_notify, quarterly_forecast
- **Payouts** — types: payout_marked_paid, payout_notified
- **Agreements** — types: agreement_created, agreement_updated, agreement_deleted

### Data fetch

```ts
const { data } = await supabase
  .from('activity_log')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(300)
```

Filter applied client-side (300 rows is sufficient for local filtering without extra API calls).

### Table columns

| # | Date | Type | Detail | Actor | Status/Notes | |
|---|------|------|--------|-------|--------------|---|
| sequence_number | created_at | type badge | investor_name / recipient_name / subject | actor | email_status badge or notes | View button (email types only) |

Email rows grouped visually by `send_round` (same send action shown together with a light separator).

### View modal (email types only)

Clicking "View" opens a modal with the full `html_body` rendered in an iframe. Shows To, CC, subject, sent_at, resend_id.

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/013_activity_log.sql` | Create `activity_log` table + `activity_send_round_seq` sequence |
| `src/types/database.ts` | Add `ActivityLog` interface and `ActivityLogType` |
| `src/lib/email.ts` | Add optional `cc` param to `sendEmail` |
| `src/lib/activity-log.ts` | Create — `logActivity()` helper |
| `src/app/api/reminders/summary/preview/route.ts` | Create — GET, returns email previews per salesperson + master |
| `src/app/api/reminders/summary/route.ts` | Rewrite POST — accepts confirmed emails array, sends + logs each |
| `src/components/dashboard/SendReminderSummaryModal.tsx` | Create — replaces SendReminderSummaryButton |
| `src/app/(app)/dashboard/page.tsx` | Swap button for modal component |
| `src/app/(app)/activity-log/page.tsx` | Create — activity log page with filter tabs |
| `src/app/(app)/layout.tsx` | Add "Activity Log" to sidebar nav |

---

## Out of Scope

- Email reply tracking or inbox integration
- Scheduling sends for a future time
- Per-investor unsubscribe
- Logging payout_notify or quarterly_forecast emails (can be added later by calling `logActivity` from those routes)
- Agreement form creation flow (separate spec)
