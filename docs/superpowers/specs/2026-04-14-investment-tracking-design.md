# Good Earth Investment Tracker — Design Spec
**Date:** 2026-04-14  
**Status:** Approved

---

## Context

Good Earth Eco Projects collects private investment funds from individuals under fixed-return agreements. Each agreement specifies a principal amount, rate of interest, payout frequency (quarterly or annual), and a maturity date. Interest and TDS amounts are pre-calculated in the agreement document itself.

The core operational problem is **missed dates** — payout due dates, TDS filing deadlines, and maturity notices are currently tracked manually and slip through the cracks across teams. There is no single source of truth linking an agreement to its schedule, no automated reminders, and no structured workflow to confirm that payouts have actually been executed.

This tool solves that by: (1) extracting all agreement data automatically from uploaded documents, (2) generating a complete reminder schedule for every critical date, and (3) providing a 3-step payout workflow that tracks reminders → accounts notification → payment confirmation.

A secondary process — quarterly TDS reconciliation — is included as a parallel tool that cross-checks TDS filings against the system's own payout records.

---

## Team

The app is used by one primary user (Irene, Investment Coordinator) but sends emails to several internal people. All team members are configured in the app with their name, email, and role.

| Name | Role | Involved in |
|---|---|---|
| Irene | Investment Coordinator | Primary app user; receives all system reminders |
| Salesperson | Investor relationship (multiple) | One assigned per agreement; receives payout reminders for their agreements and document return follow-ups |
| Valli | Accountant | Receives "Notify Accounts" email for every interest and TDS payout |
| Liya | Financial Analyst | Receives quarterly review prompts (incoming funds + TDS reconciliation) |

Current salespeople: **Preetha, George, Ajay, Irene**. Managed as a list in the app; new salespeople can be added at any time.

When uploading a new agreement, the user selects the assigned salesperson from this list. If the investor was brought in by someone outside the standard list (e.g. a one-off referral), a **"Other / Custom"** option is available with a free-text name field. This name is stored on the agreement for reference but does not receive automated emails.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js (App Router) | Full-stack, easy to deploy |
| Database + Auth + Storage | Supabase | Handles all three in one; easy to extend |
| AI extraction | Claude API (claude-sonnet-4-6) | Reads PDFs and extracts structured data reliably |
| Email / reminders | Resend | Simple API, good free tier |
| Hosting | Vercel | One-click Next.js deploy |

---

## Data Model

### `team_members`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. "Irene", "Vali" |
| email | text | Where reminders are routed |
| role | enum | coordinator, accountant, financial_analyst, salesperson |
| is_active | boolean | Soft-delete; inactive salespeople remain on historical agreements |

### `agreements`
| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| reference_id | text | Auto-generated (e.g. GE-2026-001) |
| agreement_date | date | Date the agreement was signed |
| investment_start_date | date | Date money was received (interest runs from here) |
| agreement_type | text | "Investment Agreement" / "Advance Agreement" (display only) |
| document_url | text | URL of uploaded PDF in Supabase Storage |
| is_draft | boolean | True if only a draft has been uploaded; false once signed copy is received |
| status | enum | active, matured, cancelled |
| investor_name | text | |
| investor_pan | text | |
| investor_aadhaar | text | Optional |
| investor_address | text | |
| investor_relationship | text | S/o, D/o, W/o etc. |
| investor_parent_name | text | |
| nominees | jsonb | Array of {name, pan} |
| principal_amount | numeric | In INR |
| roi_percentage | numeric | e.g. 15.0 |
| payout_frequency | enum | quarterly, annual, cumulative |
| interest_type | enum | simple, compound |
| lock_in_years | integer | |
| maturity_date | date | Derived from investment_start_date + lock_in_years |
| payment_date | date | Date cheque/transfer was made |
| payment_mode | text | Cheque No. / Bank transfer etc. |
| payment_bank | text | |
| salesperson_id | uuid | FK → team_members (role: salesperson); nullable if custom |
| salesperson_custom | text | Free-text name when investor source is outside the standard team |
| doc_status | enum | draft, partner_signed, sent_to_client, returned, uploaded |
| doc_sent_to_client_date | date | Date handed to the salesperson for client delivery |
| doc_returned_date | date | Date signed copy was received back |
| doc_return_reminder_days | integer | Days after sending before a reminder fires (default: 14) |
| created_at | timestamptz | |

### `payout_schedule`
Each row = one interest payout period, extracted directly from the agreement table.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| agreement_id | uuid | FK → agreements |
| period_from | date | |
| period_to | date | |
| no_of_days | integer | |
| due_by | date | "On or before" date from agreement |
| gross_interest | numeric | As stated in agreement |
| tds_amount | numeric | As stated in agreement (10%) |
| net_interest | numeric | As stated in agreement |
| status | enum | pending, notified, paid, overdue |
| paid_date | date | Actual date marked paid |
| is_principal_repayment | boolean | True for the final maturity row |

### `reminders`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| agreement_id | uuid | FK → agreements |
| payout_schedule_id | uuid | FK → payout_schedule (nullable for maturity reminders) |
| reminder_type | enum | payout, maturity, cancellation_window |
| lead_days | integer | Days before due_by this fires (e.g. 90, 30, 14, 7) |
| scheduled_at | timestamptz | Exact datetime to send |
| status | enum | pending, sent, failed |
| sent_at | timestamptz | |
| email_subject | text | |
| email_body | text | |

### `quarterly_reviews`
One record per quarter, holding both reconciliation checks.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| quarter | text | e.g. "Q1-2026-27" (Apr–Jun 2026) |
| created_at | timestamptz | |
| incoming_funds_doc_url | text | Uploaded Tally incoming funds export |
| incoming_funds_status | enum | pending, completed |
| incoming_funds_result | jsonb | matched, missing_agreement, extra_in_system, amount_mismatch arrays |
| tds_doc_url | text | Uploaded Tally TDS export |
| tds_status | enum | pending, completed |
| tds_result | jsonb | matched, missing_from_tally, extra_in_tally, amount_mismatch arrays |

---

## Features

### 1. Agreement Upload & AI Extraction

**Two upload modes:**

| Mode | When to use | Effect |
|---|---|---|
| **Draft** | Signed copy not yet back; want to start tracking immediately | Agreement active in system, all payouts and reminders running, visually flagged as draft throughout |
| **Signed** | Signed copy in hand | Agreement active, no flag |

**Flow:**
1. User clicks "Add New Agreement", uploads the document (draft or signed), and selects the upload mode
2. Claude API reads the document and returns structured JSON: all agreement fields + the full payout schedule table (every row)
3. A review screen shows the extracted data side-by-side with the original document
4. User assigns the salesperson, confirms fields, and saves
5. On save: agreement and payout schedule rows are written to the database, reminder schedule is auto-generated, and `doc_status` is set to `sent_to_client` (if draft) or `uploaded` (if signed)

**Upgrading a draft to signed:**
When the signed copy is received, the user opens the agreement, clicks "Upload Signed Copy", and replaces the draft document. The draft flag is removed across the entire UI automatically.

**AI extraction scope:** All fields in the data model above, including every row of the payout schedule table.

**Supported formats:** PDF (digital or scanned), DOCX

**Draft visual treatment (applied everywhere the agreement appears):**
- Amber/yellow left border on all dashboard rows
- "Draft" badge on the agreement — visible in the agreements table, agreement detail page, payout checklist rows, and calendar events
- Tooltip on hover: "Payout tracking active — signed copy not yet received"
- The document return reminder system (14-day countdown) runs in parallel as an ongoing prompt to chase the signed copy

---

### 2. Dashboard

**KPI cards (top row):**
- Total principal invested (all active agreements)
- This quarter's anticipated gross interest payout
- This quarter's anticipated TDS deduction
- This quarter's anticipated net cash outflow (gross − TDS)
- Overdue payouts (count + amount, red if non-zero)
- Principal maturing in next 90 days (early warning for large cash needs)

**Quarterly cash flow forecast panel:**
A dedicated section below the KPI cards showing the full picture for the current quarter — and a "Send to Accounts" button.

Contents of the forecast:
- Quarter label and date range (e.g. Q1 2026-27: Apr–Jun 2026)
- Table: one row per payout due in the quarter — investor name, due date, gross interest, TDS, net payout, frequency
- Subtotals by month within the quarter (April / May / June) so Valli can plan cash availability month by month
- Grand totals: gross interest, TDS, net outflow
- Any principal repayments (maturities) due in the quarter, shown separately as they represent larger cash events

**"Send to Accounts" button:**
Clicking this sends a formatted email to Valli with the quarterly forecast as a clean HTML table (suitable for printing or forwarding). The email is also available to preview before sending. This can be triggered at the start of each quarter or on demand at any time.

**Breakdown by payout frequency (below forecast panel):**
A summary row showing totals split by frequency:
- **Quarterly** — count of agreements, sum of principal, total expected interest
- **Annual** — count of agreements, sum of principal, total expected interest
- **Cumulative** — count of agreements, sum of principal, total expected interest

**Upcoming payouts list:**
- Sorted by urgency (overdue first, then by due date)
- Colour-coded: red = overdue, amber = due within 30 days, grey = further out
- Each row shows investor name, frequency, net amount, TDS, and 3-step checklist status

**All agreements table:**
- Shows ALL agreements regardless of status (active, matured, cancelled) — no agreements are hidden
- Columns: Investor name, principal, rate, payout frequency, start date, maturity date, status badge
- **Status badge:** Active (green), Matured (grey), Cancelled (red) — status is editable per agreement
- **Sort controls:** Click any column header to sort ascending/descending
- **Filter bar:** Dropdown filters above the table for:
  - Payout frequency (All / Quarterly / Annual / Cumulative)
  - Status (All / Active / Matured / Cancelled)
  - Interest rate range (e.g. ≥13%, ≥14%, ≥15%)
  - Investment value (ascending / descending)
- **Footer row:** Running totals for the filtered/sorted view — sum of principal, weighted average rate

---

### 3. Payout 3-Step Checklist

Every payout row tracks three steps:

| Step | Who | Action |
|---|---|---|
| 1. Reminded | System (auto) | Email fires on schedule — no user action |
| 2. Accounts Notified | User | Clicks "Notify Accounts" → app sends pre-drafted email to accounts team with payout details |
| 3. Marked Paid | User | Clicks "Mark as Paid" once transfer is confirmed |

Additional actions: "Re-notify Accounts" button available at step 3 if accounts team hasn't acted.

Each step logs a timestamp. Expanding a payout row shows the full checklist with timestamps and a preview of the notification email sent.

---

### 4. Automated Reminder Schedule

On agreement save, the system auto-generates reminders for every critical date:

**For each payout due date:**
- 14 days before
- 7 days before
- On the due date (if still unpaid)

**For maturity date (principal repayment):**
- 90 days before (3-month notice as per agreement clause)
- 30 days before
- 14 days before
- 7 days before

**For cancellation window (3-month notice clause):**
- No automatic reminders; user can manually flag an agreement as "under cancellation notice"

All reminder timings are configurable per agreement if needed.

**Reminder routing:**
- **Step 1 auto-reminder** (system email) → Irene (coordinator) + assigned salesperson for that agreement
- **Step 2 "Notify Accounts"** (user-triggered) → Valli (accountant); email includes investor name, gross interest, TDS, net amount, due date, and investor bank details (once available)
- **Quarterly review prompt** (start of each quarter) → Liya (financial analyst) + Irene

All emails sent via Resend. Each email includes a direct link back to the relevant item in the app.

---

### 5. Calendar View

Monthly calendar showing all critical dates across all agreements, colour-coded by type:
- 🟡 Payout due dates
- 🔴 Overdue payouts
- 🟠 Maturity dates
- 🔵 Scheduled reminder fire dates

Clicking a date opens the relevant payout or agreement detail.

---

### 6. Agreement Detail View

Per-agreement page showing:
- All agreement fields (editable)
- Full payout schedule table with status per row (Pending / Paid / Overdue)
- TDS summary: total TDS across all payouts, per quarter
- Nominee information
- Original document (PDF viewer)
- Reminder history log

---

### 7. Agreement Document Lifecycle Tracking

Every agreement has a physical journey before it is scanned and uploaded. The app tracks five stages:

| Stage | Meaning |
|---|---|
| Draft | Agreement has been prepared but not yet signed by the partner |
| Partner Signed | Good Earth's partner has signed; ready to send |
| Sent to Client | Handed to the sales spokesperson for delivery to the client |
| Returned | Signed copy received back from the client |
| Uploaded | Document scanned and uploaded to the system |

**Where it appears:**
- A `doc_status` column in the All Agreements table on the dashboard (visible and filterable)
- Each agreement's detail page shows the full document trail with dates and the spokesperson's name
- Agreements not yet uploaded are shown with a distinct visual treatment (e.g. italic row, status badge in orange)

**Return reminder:**
- When an agreement moves to "Sent to Client", the app starts a countdown
- If the agreement has not moved to "Returned" within `doc_return_reminder_days` (default: 14 days), an email reminder fires to Irene and the assigned salesperson
- The reminder repeats every 7 days until the status is updated

**Upload trigger:**
- When status is updated to "Returned", a prompt appears to scan and upload the signed document
- Once uploaded, status automatically advances to "Uploaded" and the agreement becomes fully active in the system

---

### 8. Quarterly Review

A structured end-of-quarter process with two reconciliation checks, aligned to Indian financial quarters (Q1: Apr–Jun, Q2: Jul–Sep, Q3: Oct–Dec, Q4: Jan–Mar).

Both checks are triggered from a single "Quarterly Review" section in the app. The user selects the quarter, runs both checks, and gets a combined report.

---

#### 7a. Incoming Funds Reconciliation

**Purpose:** Verify that every investment payment received by Good Earth (as recorded in Tally) has a corresponding signed agreement in the system. Catches cases where money came in but no agreement was created.

**Flow:**
1. User selects a quarter and uploads the Tally export for incoming funds (Excel or PDF)
2. App parses the export: party name, amount received, date, payment mode
3. App compares each entry against `agreements` table — matching on investor name + principal amount + approximate payment date (±7 days tolerance)
4. Reconciliation report shows:
   - **Matched** ✓ — incoming payment has a corresponding agreement
   - **Missing agreement** ⚠️ — money received in Tally but no agreement found in system
   - **Extra in system** ⚠️ — agreement exists in system but no matching incoming payment in Tally for that period
   - **Amount mismatch** ⚠️ — same party but amounts differ

**Matching logic:** Party name + principal amount + date within ±7 days. Flag if amount differs by more than ₹100.

---

#### 7b. TDS Reconciliation

**Purpose:** Cross-check the TDS filing sheet prepared from Tally against the system's own interest payout records for that quarter, before filing with the government.

**Flow:**
1. User uploads the Tally TDS export for the selected quarter (Excel or PDF)
2. App parses the export: investor name, PAN, interest paid, TDS deducted
3. App compares each row against `payout_schedule` records marked paid in that quarter
4. Reconciliation report shows:
   - **Matched** ✓ — Tally entry matches system record exactly
   - **Missing from Tally** ⚠️ — payout recorded in system but absent from Tally TDS sheet
   - **Extra in Tally** ⚠️ — entry in Tally with no matching system payout record
   - **Amount mismatch** ⚠️ — same investor/PAN but interest or TDS amount differs

**Matching logic:** Investor PAN + quarter period. Flag if amounts differ by more than ₹1 (rounding tolerance).

---

**Combined output:** A single downloadable reconciliation report (CSV or PDF) covering both checks for the selected quarter, for audit records.

---

## Reminder Best Practices Applied

Based on standard practices for fixed-return investment management:
- **Payout reminders:** 14 days + 7 days in advance (gives accounts team enough lead time for bank transfers)
- **Maturity reminders:** 90 days + 30 days + 14 days + 7 days (aligns with the 3-month notice clause in the agreements themselves)
- **Escalation:** If step 2 (accounts notified) is not followed by step 3 (mark paid) within 3 days of due date, a follow-up email fires automatically

---

## Phase 2 (Out of Scope for Now)

- WhatsApp integration (Twilio / Meta Business API)
- Investor-facing notifications (notify clients of upcoming payouts)
- Multi-user access with role-based permissions (accounts team gets their own login)
- Agreement generation — given investment terms (investor details, principal, rate, frequency, duration), auto-generate a fully formatted Word document (.docx) ready to print and send; uses the existing agreement format as a template
- Investor bank account details per agreement (account number, IFSC, bank name) — to be added to agreements once Good Earth starts including them in the agreement documents; will be extracted by Claude AI automatically when present and used to populate the accounts notification email
- Bulk import of existing agreements

---

## Verification Plan

1. Upload each of the three sample agreements (Janhavi, Aanandasudan, Anantharamu) and verify all fields + payout rows are extracted correctly
2. Confirm reminder schedule is generated correctly for each agreement (check dates, lead times)
3. Walk through the 3-step payout checklist for one payout row end-to-end
4. Verify an email reminder fires and arrives with correct content
5. Upload a mock Tally incoming funds export and verify it correctly flags a payment with no matching agreement
6. Upload a mock Tally TDS export and verify reconciliation correctly identifies a missing payout and an amount mismatch
6. Check calendar view shows all three agreements' dates correctly
