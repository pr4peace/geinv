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
**Status:** Queued
Plan: `docs/superpowers/plans/2026-04-29-extraction-pipeline.md`

- [ ] Task 1 — ExtractionFlag type + validateExtraction() + tests
- [ ] Task 2 — Harden Gemini prompt (row count, math check, coverage, compound TDS, is_tds_only)
- [ ] Task 3 — PDF pre-processing (pdfjs-dist + canvas + sharp)
- [ ] Task 4 — ExtractionReview flags panel + save gate
- [ ] Task 5 — Rescan route: return current values + flags
- [ ] Task 6 — New rescan/apply route (atomic update)
- [ ] Task 7 — RescanModal diff view + flags + payout schedule update
- [ ] Task 8 — SESSION.md update + push

---

## Work Completed
- Batch C.2 — TDS rows, rescan, bulk mark-paid, What's New modal
- Batch F — notifications page, sidebar nav, salesperson gates
- Batch G — TDS calculation fixes, inline confirmations, undo toast

## Decisions
- No native browser dialogs anywhere — standing rule
- QuickSendPanel filters client-side (no new API)
- Stats header queries source tables directly (not notification_queue)
- Rescan now includes payout schedule update + diff view + flag resolution
- Extraction flags: fix / re-upload / accept-as-is — all three options
- Save blocked until all flags resolved
- PDF pre-processing: high-contrast B&W images via pdfjs-dist + canvas + sharp, falls back to raw PDF if conversion fails

## Codex Review Notes
- (none yet)

## Next Agent Action
- Gemini: complete Batch 1 if not done. Then immediately proceed to Batch 2. Read each plan file fully before starting. Work through all tasks in order. Run `npm run build` and `npm test` after each task. Push when all batches complete.
