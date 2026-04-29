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
- **File:** `src/app/api/reminders/process/route.ts:90`
  **Severity:** critical
  **Issue:** `GET /api/reminders/process` trusts only `x-vercel-cron: 1`, which any external caller can spoof to enqueue notifications and flip payout rows to `overdue` without authentication.
  **Fix:** Delete the public `GET` handler entirely or make it use the same `Authorization: Bearer ${CRON_SECRET}` check as `POST`, so `processReminders()` is never reachable from a spoofable header path.

- **File:** `src/app/api/quarterly-review/[id]/upload/route.ts:45`
  **Severity:** high
  **Issue:** uploaded reconciliation spreadsheets are written to a private bucket but persisted as `getPublicUrl()` links, which either exposes sensitive finance files if the bucket is ever public or breaks `reconcile`/`reconcile-ui` because those routes later `fetch()` an unauthenticated URL.
  **Fix:** replace the `getPublicUrl()` block at lines 63-64 with storage-path persistence, e.g. store `filePath` in `quarterly_reviews`, then in both reconcile routes download with `supabase.storage.from('reconciliations').download(storedPath)` using the admin client instead of `fetch(url)`.

- **File:** `src/app/api/kpi/route.ts:4`
  **Severity:** high
  **Issue:** the KPI endpoint returns company-wide principal, overdue totals, quarterly forecast, and maturity data for every authenticated user; a salesperson can call it directly and see the full book instead of only their assigned agreements.
  **Fix:** read `x-user-role` and `x-user-team-id` in this route, reject salespeople or pass `salespersonId` through to `getDashboardKPIs()`, `getQuarterlyForecast()`, and `getFrequencyBreakdown()`, then add `.eq('salesperson_id', salespersonId)` / joined-agreement filters inside `src/lib/kpi.ts` for every underlying query.

- **File:** `src/app/api/agreements/[id]/rescan/apply/route.ts:28`
  **Severity:** high
  **Issue:** rescan apply updates the agreement, deletes all existing payout rows, and then reinserts new rows in separate statements with no transaction, so any insert failure leaves the agreement half-applied and permanently wipes its original payout schedule.
  **Fix:** move the whole mutation into a single Postgres transaction via an RPC (update agreement fields, delete old `payout_schedule`, insert replacement rows, and only then commit), or at minimum call one SQL function from this route instead of the current line-28-to-95 multi-step sequence.

- **File:** `src/app/api/agreements/check-duplicate/route.ts:4`
  **Severity:** medium
  **Issue:** the duplicate-check endpoint has no API-level role check or salesperson scoping, so any authenticated salesperson can query arbitrary investor names/PANs and enumerate agreement metadata outside their portfolio.
  **Fix:** add the same guard used by creation routes at the top of this handler (`if (userRole !== 'coordinator' && userRole !== 'admin') return 403`), and if this route ever needs salesperson access later, scope the query by `salesperson_id = x-user-team-id` before returning duplicates.

## Next Agent Action
- Codex: review extraction validator logic, rescan apply route atomicity, and RescanModal diff rendering.
