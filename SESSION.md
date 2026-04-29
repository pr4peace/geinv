# SESSION

## Branch
- main

## Phase
- implementing

## Active Batch
- Sequential queue — Gemini works through all batches in order

---

## Queue for Gemini (in order)

### Batch 1 — Quick Send Panel + Notifications Context
**Status:** In progress / just completed
Plans:
- `docs/superpowers/plans/2026-04-29-quick-send-panel.md`
- `docs/superpowers/plans/2026-04-29-notifications-context.md`

- [x] Quick Send Panel (4 items)
- [x] Notifications Context (2 items)

---

### Batch 2 — Extraction Pipeline Redesign
**Status:** Done
Plan: `docs/superpowers/plans/2026-04-29-extraction-pipeline.md`

- [x] Task 1 — ExtractionFlag type + validateExtraction() + tests
- [x] Task 2 — Harden Gemini prompt (row count, math check, coverage, compound TDS, is_tds_only)
- [x] Task 3 — PDF pre-processing (pdfjs-dist + canvas + sharp)
- [x] Task 4 — ExtractionReview flags panel + save gate
- [x] Task 5 — Rescan route: return current values + flags
- [x] Task 6 — New rescan/apply route (atomic update)
- [x] Task 7 — RescanModal diff view + flags + payout schedule update
- [x] Task 8 — SESSION.md update + push

---

### Batch 3 — Rescan Required UI
**Status:** Done
**Migration already applied:** `rescan_required boolean NOT NULL DEFAULT false` added to `agreements` table. 33 agreements already flagged in DB.

- [x] Task 1 — Add `rescan_required` to TypeScript Agreement interface in `src/types/database.ts`
- [x] Task 2 — Agreements list: amber "Rescan required" badge for agreements where `rescan_required = true`
- [x] Task 3 — Agreement detail page: amber banner at top when `rescan_required = true`
- [x] Task 4 — `rescan/apply` route: set `rescan_required = false` on successful apply
- [x] Task 5 — Build + test + push

---

## Phase
- reviewing

## Work Completed
- Batch 1 — Quick Send Panel complete (silent insert fix, SP names, QuickSendPanel component, integrated)
- Batch 2 — Extraction Pipeline Redesign complete:
  - Extraction validator engine catching TDS/net mismatches and coverage gaps.
  - Hardened Gemini prompt with row count, math check, and coverage rules.
  - PDF pre-processing: high-contrast B&W images via pdfjs-dist + canvas + sharp.
  - Gated review UI in ExtractionReview with flags panel.
  - Atomic rescan/apply route replacing agreement + payouts in one operation.
  - RescanModal redesigned with side-by-side diff view and flag resolution.
- Batch 3 — Rescan Required UI complete (badges, banners, flag reset)
- **Codex Review Fixes applied:**
  - Secured `GET /api/reminders/process` with `CRON_SECRET` check.
  - Updated Quarterly Review to use storage paths and secure downloads instead of public URLs.
  - Implemented salesperson scoping for KPIs and Cash Flow Forecast.
  - Created `apply_rescan_update` RPC and updated route for atomic mutations.
  - Added RBAC and salesperson scoping to `check-duplicate` endpoint.
- **Codex Review Fixes (Round 2) applied:**
  - Implemented atomicity/error-checking in agreement creation and CSV import (abort if payouts fail).
  - Added file size (10MB) and MIME type validation to signed agreement and reconciliation uploads.
  - Sanitized PostgREST control characters in duplicate check `.or()` filters.
- Batch C.2 — TDS rows, rescan, bulk mark-paid, What's New modal
- Batch F — notifications page, sidebar nav, salesperson gates
- Batch G — TDS calculation fixes, inline confirmations, undo toast

## Decisions
- No native browser dialogs anywhere — standing rule
- QuickSendPanel filters client-side (no new API)
- Stats header queries source tables directly (not notification_queue)
- Rescan now includes payout schedule update + diff view + flag resolution
- Extraction flags: fix / retry-scan / accept-as-is — all three options
- Save blocked until all flags resolved
- PDF pre-processing: high-contrast B&W images via pdfjs-dist + canvas + sharp, falls back to raw PDF if conversion fails
- Rescan required flag handled via UI badges/banners and reset on apply

## Codex Review Notes
- **File:** `src/app/api/agreements/route.ts:276`
  **Severity:** high
  **Issue:** agreement creation still returns `201` after payout schedule insert or reminder insert failures, so production can persist a live agreement without its required payout rows and silently tell the user the save succeeded.
  **Fix:** make the agreement insert, payout_schedule insert, and any required follow-up writes one transactional unit (RPC/SQL transaction), and if `payoutError` is non-null return an error instead of logging and continuing.

- **File:** `src/app/api/agreements/import/route.ts:139`
  **Severity:** high
  **Issue:** CSV import ignores the result of `payout_schedule.insert(...)`, then writes the audit row and increments `imported`, so a failed payout insert produces an apparently successful import with a corrupted agreement missing all payout history.
  **Fix:** capture the insert result, abort that row on any `payout_schedule` error, and only write the audit row plus `imported++` after the payout rows have been inserted successfully.

- **File:** `src/app/api/agreements/[id]/upload-signed/route.ts:28`
  **Severity:** medium
  **Issue:** the signed-agreement upload route accepts any file type and any file size, so a coordinator can accidentally store arbitrary large or non-document files in the `agreements` bucket and publish long-lived signed URLs for them.
  **Fix:** add the same kind of server-side validation used in `src/app/api/extract/route.ts` before reading the buffer: enforce an explicit size cap and allow only PDF/DOCX MIME types/extensions.

- **File:** `src/app/api/quarterly-review/[id]/upload/route.ts:30`
  **Severity:** medium
  **Issue:** quarterly reconciliation upload has no MIME or size validation, so malformed or oversized files are accepted into storage and only fail later when the reconciliation parser tries to read them.
  **Fix:** reject files above a fixed size limit and allow only the spreadsheet formats the parser actually supports before calling `file.arrayBuffer()` and storage upload.

- **File:** `src/app/api/agreements/route.ts:138`
  **Severity:** medium
  **Issue:** duplicate detection builds a PostgREST `.or(...)` filter by directly interpolating `investor_name` and `investor_pan`, so reserved characters like commas and parentheses can alter the query logic instead of being treated as literal input.
  **Fix:** sanitize or escape PostgREST control characters before constructing `orFilter` here, and mirror the same sanitizer in `src/app/api/agreements/import/route.ts` and `src/app/api/agreements/check-duplicate/route.ts`.

## Next Agent Action
- Codex: final check of atomicity fixes, file validations, and filter sanitization.
