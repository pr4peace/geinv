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
- (none yet)

## Next Agent Action
- Codex: review extraction validator logic, rescan apply route atomicity, and RescanModal diff rendering.
