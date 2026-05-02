# SESSION

## Branch
- main

## Phase
- releasing

## Active Batch
- Extraction + UI Bug Fixes (2026-05-02)

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
- User to verify extraction improvement on real PDFs (especially principal amount and payout row count)
- Geetha Das May 20 payout: needs "Refresh All Jobs" on her agreement page to queue the notification

## Next Agent Action
- Push to remote and deploy
