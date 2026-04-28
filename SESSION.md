# SESSION

## Branch
- feature/batch-c2-hotfixes

## Phase
- building

## Active Batch
- Batch C.2 — Post-Launch Hotfixes (remaining items)

---

## Context — What Was Done Today (on main, already pushed)

These were urgent fixes applied directly to `main` while Irene was uploading agreements:

- Gemini model upgraded to `gemini-2.5-flash` (model retired)
- `maxOutputTokens` raised to 65536, `responseMimeType: 'application/json'` added → fixes truncation
- `investment_start_date` prompt rewritten — body paragraph → payout schedule period_from → payment table (priority order)
- Biannual/semi-annual/half-yearly all map to `biannual`; compounded/compound map to `cumulative`
- Biannual + Monthly added to ExtractionReview payout frequency dropdown
- Agreements list forced-refresh after upload (router.refresh() before push)
- Cancel button on extraction loading step (AbortController)
- "Add another agreement" button shown on detail page after new upload (?new=1)
- Overdue filter fixed — now uses `due_by < today` instead of `period_to < monthStart`
- Maturity reminder catch-up — generates one immediate reminder if all lead-day dates are past
- "Mark all past payouts as paid" checkbox + API logic on import (for historical agreements)

---

## Remaining Items for Gemini to Build

### Item 1 — TDS rows on 31st March for cumulative/compound agreements

**Goal:** For cumulative or compound interest agreements, insert a TDS-only payout_schedule row for each 31st March that falls within the agreement term (investment_start_date → maturity_date). These rows are for TDS filing purposes only — no cash payout. They already have `is_tds_only: true`.

**Problem:** Currently, a single TDS-only row is added at the end (copy of the last row). Instead, we need one per financial year-end (31st March) within the term.

**File:** `src/app/api/agreements/route.ts` — the section starting at line ~247 (`// Add internal TDS tracking row for cumulative/compound if missing`)

**Plan:**
1. Replace the single TDS-only row logic with a loop that generates one row per 31st March within the agreement term
2. For each 31st March date between `investment_start_date` and `maturity_date`:
   - `period_from` = investment_start_date (or previous 31st March + 1 day)
   - `period_to` = this 31st March
   - `due_by` = this 31st March
   - `gross_interest` = 0, `tds_amount` = 0, `net_interest` = 0 (amounts not known at upload time)
   - `is_tds_only` = true
   - `is_principal_repayment` = false
   - `no_of_days` = null
3. If the Gemini-extracted payout_schedule already contains `is_tds_only: true` rows, skip generation (don't double-insert)

---

### Item 2 — Re-scan agreement without re-uploading

**Goal:** A "Re-scan" button on the agreement detail page. Pulls the stored doc from Supabase Storage, re-runs Gemini extraction, shows the ExtractionReview form pre-filled with new data. User confirms → agreement fields + payout schedule updated.

**Files to create/modify:**
- `src/app/api/agreements/[id]/rescan/route.ts` — new API route (POST)
- `src/app/(app)/agreements/[id]/page.tsx` — add Re-scan button
- `src/components/agreements/RescanModal.tsx` — new component (modal wrapping ExtractionReview or a simplified inline review form)

**Plan:**

API route `POST /api/agreements/[id]/rescan`:
1. Fetch agreement by ID (admin client)
2. Get `document_url` — if null, return 400 ("No document stored")
3. Download the file from Supabase Storage using the permanent path `{reference_id}/original.{ext}` (or derive from document_url)
4. Run through `extractAgreementData()` from `src/lib/claude.ts`
5. Return the extracted data as JSON (same shape as `ExtractedAgreement`)
6. Do NOT update the agreement yet — just return the extraction result

On the agreement detail page:
1. Add a "Re-scan" button (small, secondary style) in the header actions area
2. On click: POST to `/api/agreements/[id]/rescan`, show loading state
3. On success: show a modal/panel with the extracted data for review. User can confirm → sends a PATCH to update the agreement fields.

For the PATCH — create `PATCH /api/agreements/[id]` route:
- Accepts same fields as POST `/api/agreements` (minus payout_schedule for now)
- Updates agreement fields only (not payout schedule — too complex to merge)
- Returns updated agreement

Keep the re-scan modal simple — just show key fields (investor_name, investment_start_date, payout_frequency, interest_type, principal_amount, roi_percentage, maturity_date) as read-only extracted values with a confirm button.

---

### Item 3 — Per-agreement "Mark past payouts as paid" + per-row undo

**Goal:** On the agreement detail page, allow marking all historical payouts as paid (with confirmation), and allow reverting individual paid rows back to pending.

**Files to modify:**
- `src/components/agreements/PayoutScheduleSection.tsx` — add bulk-mark button + per-row revert
- `src/app/api/agreements/[id]/mark-past-paid/route.ts` — new API route (POST)
- `src/app/api/agreements/[id]/payouts/[payoutId]/revert/route.ts` — new API route (POST)

**Plan:**

Bulk mark:
1. In `PayoutScheduleSection`, add a button above the interest payouts table: "Mark past payouts as paid" — only visible if there are pending rows with `due_by < today`
2. On click: show a browser `confirm()` dialog. On confirm: POST to `/api/agreements/[id]/mark-past-paid`
3. API route: updates all payout_schedule rows where `agreement_id = id AND status != 'paid' AND is_tds_only = false AND due_by < today` → set `status: 'paid', paid_date: today`
4. On success: `router.refresh()`

Per-row revert:
1. For each row with `status: 'paid'`, add a small "Revert" button next to "Mark Filed" / paid indicator
2. On click: POST to `/api/agreements/[id]/payouts/[payoutId]/revert`
3. API route: updates that single row → set `status: 'pending', paid_date: null`
4. On success: `router.refresh()`

---

### Item 4 — Splash screen "What's New"

**Goal:** On app load, show a "What's New" modal listing recent fixes and features. Shown max 3 times per user (tracked in localStorage as `whats_new_seen_count`). Dismissed with X. Never shown again after 3 views.

**Files to create/modify:**
- `src/components/WhatsNewModal.tsx` — new component
- `src/app/(app)/layout.tsx` — render WhatsNewModal

**Plan:**

WhatsNewModal:
1. On mount, read `localStorage.getItem('whats_new_v1_count')` (use a version key so new releases can reset)
2. If count < 3: show modal, increment count on dismiss
3. If count >= 3: render nothing
4. Modal content: list of what's new (hardcode for now — Gemini should list the real fixes from this session)
5. X button to close, backdrop click also closes
6. Style: dark modal, centered, max-w-lg, shows a short list of fixes/features with a checkmark per item

Current what's new items to list (Gemini should use these):
- Gemini AI extraction upgraded to latest model
- Biannual and monthly payout frequencies now supported
- Agreements list refreshes immediately after upload
- Cancel button during extraction
- Historical agreements: mark past payouts as paid on import
- Overdue payouts now surface correctly on dashboard

---

## Todos

- [ ] Item 1 — TDS 31st March rows for cumulative/compound
- [ ] Item 2 — Re-scan agreement without re-upload
- [ ] Item 3 — Per-agreement mark-past-paid + per-row revert
- [ ] Item 4 — Splash screen What's New

---

## Work Completed
- Branch `feature/batch-c2-hotfixes` created

## Files Changed
- SESSION.md, BACKLOG.md

## Decisions
- Urgent fixes were applied directly to `main` today (documented above) due to live uploading in progress
- Remaining items go on this branch

## Codex Review Notes
- Pending

## Next Agent Action
- Gemini: read SESSION.md, summarise all 4 items, wait for confirmation, then build in order 1 → 2 → 3 → 4
