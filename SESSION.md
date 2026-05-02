# SESSION

## Branch
- main

## Phase
- releasing

## Active Batch
- Batch Rescan Improvements

---

## Work Completed
- **Batch Rescan Tool (Settings → /settings/batch-rescan):**
  - Multi-select agreement list with search + doc_status filter
  - "Scan All Selected" fires `/api/admin/batch-rescan` (5 concurrent extractions, max 20)
  - Consolidated diff cards with expand/collapse showing field-level changes
  - Per-card actions: Accept, Skip, Apply Now
  - Bulk "Apply N Accepted" button at top
  - Progress bar during scanning
  - Error cards for failed extractions
  - Summary counts (accepted/skipped/applied/total)
  - Link added to Settings page
- **Notification Filters:**
  - Cascading filters: When / Type / Who with color-coded chips
  - Date presets: All, Next 7/14/30 days, This Month/Quarter/FY, Custom
  - Fixed net amounts — correct FK join for `payout_schedule` data
  - Byju added as salesperson

## Pending
- Aanandsudhan N due date discrepancy (2026-03-31 vs 2026-04-07) — user checking with Irene

## Next Agent Action
- User to review Batch Rescan and notification filters
