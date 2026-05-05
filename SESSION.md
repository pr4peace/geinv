# SESSION

## Branch
- main

## Phase
- releasing

## Active Batch
- Auto-generate TDS Filing rows post-extraction (2026-05-06)

---

## Work Completed
- **PDF Text-Layer Extraction:**
  - `extractPdfTextLayer()` added to `src/lib/claude.ts` using pdfjs-dist `getTextContent()`
  - `buildTextLayerContext()` formats extracted amounts + payout table rows as ground-truth preamble
  - Injected into both Claude and Gemini extraction paths (no new dependencies)
  - RULE 2 fix: `due_by` now explicitly uses "Payable to" column, not "On or before" TDS deadline

- **PayoutScheduleTable redesigned (per Irene):**
  - Removed FY grouping and FY subtotals
  - 3 clean sections: Interest Payouts | TDS Filing Requirements | Principal Repayment
  - Single total row at bottom of Interest Payouts only

- **Bug Fixes:**
  - Net payout total was 0 for compound/cumulative agreements — fixed filter in `agreements/[id]/page.tsx`
  - PendingPayouts — added net total subtotal row
  - PendingTdsFilings — added total pending TDS subtotal row
  - DocLifecycleStepper — "Uploaded" step now shows green (was indigo)
  - Maturity notifications — net amount now displayed (was showing `—`)

- **Batch Rescan Tool (Settings → /settings/batch-rescan):**
  - Multi-select, parallel scan, diff cards, bulk apply

- **Notification Filters:**
  - Cascading When / Type / Who filters with date presets

## Pending
- Aanandsudhan N due date discrepancy (2026-03-31 vs 2026-04-07) — user checking with Irene

---

## Task: Auto-generate TDS Filing rows post-extraction

### Problem
After extraction and agreement creation, no `is_tds_only = true` rows are inserted into `payout_schedule`. The `PendingTdsFilings` component (shown on the agreement detail page) reads `payout_schedule` rows where `is_tds_only = true` to display TDS filing deadlines and amounts. Without these rows, TDS filings are invisible after extraction.

### What to build
After inserting the regular payout rows, automatically generate one `is_tds_only` row per non-zero-TDS payout row, with:
- `agreement_id`: same as the parent row
- `is_tds_only`: true
- `tds_amount`: exact value from the corresponding payout row (no rounding, no aggregation)
- `gross_interest`: 0
- `net_interest`: 0
- `due_by`: the Indian TDS filing deadline for the quarter containing the payout's `due_by`
- `period_from` / `period_to`: the TDS filing quarter start/end (see mapping below)
- `is_principal_repayment`: false
- `tds_filed`: false
- `status`: 'pending'
- `no_of_days`: null

### TDS Quarter → Filing Deadline mapping (India)
```
Payout due_by month → due_by for TDS row    → period_from → period_to
Apr–Jun (4–6)       → {same year}-07-31      → {same year}-04-01 → {same year}-06-30
Jul–Sep (7–9)       → {same year}-10-31      → {same year}-07-01 → {same year}-09-30
Oct–Dec (10–12)     → {next year}-01-31      → {same year}-10-01 → {same year}-12-31
Jan–Mar (1–3)       → {same year}-05-31      → {same year}-01-01 → {same year}-03-31
```

### Helper function
Add `getTdsFilingDeadline(dueDateStr: string): { due_by: string; period_from: string; period_to: string }` in `src/lib/payout-calculator.ts` (pure, no I/O). Export it.

### Where to call it — TWO places

**1. `src/app/api/agreements/route.ts` — POST handler**
After the block that inserts `rows` into `payout_schedule` (line ~257), add:
- Fetch the newly inserted rows back (select `id, due_by, tds_amount, agreement_id` where `agreement_id = agreement.id AND is_tds_only = false`)
- Build `tdsFilingRows` by mapping each row with `tds_amount > 0` through the helper
- Insert `tdsFilingRows` into `payout_schedule`
- If the insert fails, log a console.error but do NOT roll back the whole agreement — TDS rows are non-fatal

**2. `src/app/api/agreements/[id]/rescan/apply/route.ts` — POST handler**
After the `supabase.rpc('apply_rescan_update', ...)` call succeeds, add:
- Fetch all `payout_schedule` rows for `agreement_id = id` where `is_tds_only = false`
- Build and insert `tdsFilingRows` the same way (same helper)
- Same non-fatal error handling

### Do NOT touch
- `apply_rescan_update` Postgres RPC function — it deletes+replaces payout rows and that's fine; we add TDS rows in the API layer after it returns
- `PendingTdsFilings` component — it already works correctly, just needs rows to exist
- `payout-calculator.ts` logic for regular payouts — only add the new helper

### No tests required
This is internal wiring. Manual verification: after applying a rescan on Murali's agreement, `PendingTdsFilings` should show TDS rows with amounts matching each payout's TDS column.

## Next Agent Action
- Gemini: implement the Task above, then push to main
