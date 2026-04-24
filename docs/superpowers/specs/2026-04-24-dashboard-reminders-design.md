# Dashboard Reminders — Design Spec

**Date:** 2026-04-24
**Goal:** Replace the current cluttered dashboard with a focused, mobile-friendly reminders page. KPI cards and forecast panel are removed for now and will be re-introduced separately.

---

## Summary

The dashboard becomes a single-purpose "what needs attention" screen with three reminder sections. It is fully responsive — on mobile, action buttons become full-width tap targets.

---

## Section 1 — Interest Payouts

### What it shows
- **Overdue** payouts: `payout_schedule` rows where `period_to < first day of current month` AND `status != 'paid'` AND `is_principal_repayment = false` AND agreement is active + not deleted.
- **This month** payouts: rows where `period_to` falls within the current calendar month AND `status != 'paid'` AND `is_principal_repayment = false` AND agreement is active + not deleted.

### Date field
Display `period_to` as the due date (labelled "Due till"), **not** `due_by`. Overdue/current-month bucketing is also driven by `period_to`.

### Sort order
Overdue rows first (sorted by `period_to` ascending — oldest first). Then this-month rows sorted by `period_to` ascending.

### Header
- Section title: "Interest Payouts"
- Pill: "N Overdue" (red, hidden if 0)
- Pill: "N Due in [Month]" (blue, hidden if 0)
- Right-aligned: "Net total ₹X" (sum of `net_interest` for all shown rows)

### Per-row info
- Investor name
- "Due till [date] · [frequency] · [reference_id]"
- Net interest amount (large) + TDS amount (small, red)

### Per-row actions
- **Overdue rows**: "Mark Paid" (red) + "Notify" (blue) — both always visible
- **This-month rows**: "Notify" (indigo) + "Mark Paid" (green) — both always visible. If status is already `notified`, button label changes to "Re-notify".

### Mobile
On screens < 640px: investor name + date on top row, amount on top-right. Buttons become a full-width grid (1×2 for overdue, 1×1 for this-month) below the info row.

---

## Section 2 — Maturing This Month

### What it shows
Agreements where `maturity_date` falls within the current calendar month AND `status = 'active'` AND `deleted_at IS NULL`.

### Header
- Section title: "Maturing This Month"
- Pill: "N agreements" (green)
- Right-aligned: "₹X principal" (sum of `principal_amount`)

### Per-row info
- Investor name
- "Matures [date] · [reference_id] · [interest_type]"
- Principal amount (green)
- Days remaining badge (e.g. "10 days")

### No actions
This section is informational only. Clicking a row links to the agreement detail page.

### Mobile
Name left, principal + days badge right. No button rows needed.

---

## Section 3 — Documents Pending Return

### What it shows
Agreements where `doc_status = 'sent_to_client'` AND `doc_returned_date IS NULL` AND `deleted_at IS NULL`.

### Header
- Section title: "Docs Pending Return"
- Pill: "N agreements" (orange)

### Per-row info
- Investor name
- "Sent [doc_sent_to_client_date] · [reference_id]"
- Days since sent (computed: today − `doc_sent_to_client_date`)
- Badge: "Overdue" (orange/red) if days since sent > `doc_return_reminder_days`, otherwise "Waiting" (grey)

### Sort order
Longest-waiting first (days since sent, descending).

### No actions
Informational — clicking links to the agreement detail page.

### Mobile
Name left, days-ago text below name, badge right.

---

## Page Layout

```
/dashboard
├── Page heading "Dashboard" + current month label
├── Section 1: Interest Payouts
│   ├── [Overdue group]
│   └── [This month group]
├── Divider
├── Section 2: Maturing This Month
├── Divider
└── Section 3: Docs Pending Return
```

Each section collapses gracefully when empty ("No overdue payouts", etc.) rather than hiding entirely — helps confirm the data is loading correctly.

---

## Data Fetching

Single server component (`dashboard/page.tsx`) makes three parallel queries via `Promise.all`:

1. **Payout reminders query** — `payout_schedule` joined to `agreements` (inner), filtered as above, selecting `period_to`, `due_by`, `net_interest`, `tds_amount`, `gross_interest`, `status`, `is_principal_repayment`, `agreement.investor_name`, `agreement.reference_id`, `agreement.payout_frequency`, `agreement.id`.

2. **Maturing query** — `agreements` where `maturity_date` within current month, `status = active`, `deleted_at IS NULL`.

3. **Doc return query** — `agreements` where `doc_status = sent_to_client`, `doc_returned_date IS NULL`, `deleted_at IS NULL`, selecting `investor_name`, `reference_id`, `doc_sent_to_client_date`, `doc_return_reminder_days`.

All queries use `createAdminClient()` (server-side, authenticated via middleware).

---

## Components

| Component | Type | Purpose |
|-----------|------|---------|
| `dashboard/page.tsx` | Server | Data fetching, renders the three sections |
| `components/dashboard/PayoutReminders.tsx` | Client | Overdue + this-month payout list with Mark Paid / Notify buttons |
| `components/dashboard/MaturingSection.tsx` | Server | Maturing agreements list (no client interactivity needed) |
| `components/dashboard/DocReturnSection.tsx` | Server | Docs pending return list (no client interactivity needed) |

`PayoutReminders` is a client component because it has Mark Paid and Notify buttons that call API routes and trigger `router.refresh()`.

The existing `KPICards`, `ForecastPanel`, `FrequencyBreakdownPanel`, and `UpcomingPayouts` components are **removed from the dashboard page** (components themselves stay on disk for later use).

---

## Responsive Behaviour

| Viewport | Layout |
|----------|--------|
| ≥ 640px | Row layout: name+date left, amount centre-right, buttons right |
| < 640px | Two-row card: name+date+amount on top row; buttons full-width below |

Tailwind classes: `sm:flex-row flex-col`, `sm:grid-cols-none`, button wrapper `grid grid-cols-2 sm:flex sm:gap-2`.

---

## What Is Removed from Dashboard

- `KPICards` (active principal, agreements count, quarter gross/net, overdue KPI, maturing KPI)
- `ForecastPanel` (quarterly cash flow table + quarter selector + send-to-accounts button)
- `FrequencyBreakdownPanel`
- `UpcomingPayouts` (replaced by `PayoutReminders`)

These will be re-added to a separate `/kpis` or `/forecast` page in a future iteration.

---

## Out of Scope

- Sending reminder emails from the dashboard (Notify button calls existing `/api/agreements/[id]/payouts/[payoutId]/notify`)
- Changing reminder schedule logic (already handled by cron)
- Any KPI cards or financial summary numbers
