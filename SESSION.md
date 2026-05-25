# SESSION

## Branch
- feature/batch-e1-foundation

## Phase
- building

## Active Batch
- Batch E.1 — Design System Foundation + Dashboard (2026-05-25)

---

## What's Stable in This Build

### Extraction
- Gemini extracts structured data from PDF/DOCX via text-layer grounding
- `investor_name` = primary investor only; `investor2_name` = second investor for joint agreements
- Extraction review shows: interest payouts + TDS filing preview + maturity payout card

### Payout Schedule (auto-generated on save)
- Interest rows: exactly as extracted from the agreement table
- TDS filing rows (`is_tds_only`): one per payout, Indian quarterly deadlines (Jul 31 / Oct 31 / Jan 31 / May 31); stub-period row uses correct filing deadline
- Principal repayment row: auto-added if extraction didn't produce one
- Cumulative/compound: full schedule auto-generated (accrued interest row + annual TDS rows + principal repayment)

### Agreement Detail Page (Actions section)
- **Interest Payouts card**: all rows, combined Status/Action column (Mark Paid / Undo)
- **TDS Filings card**: all `is_tds_only` rows, combined Status/Action column (Mark Filed)
- **Maturity Payout card**: principal return, falls back to agreement data if no DB row exists

---

## Work Completed
- Batch F complete and merged (see session log below)

## Files Changed
- (none yet — building)

## Key Decisions
- E.1 is the foundation sub-batch: design tokens + shell + dashboard. E.2 (agreements) and E.3 (remaining pages) follow on separate branches after E.1 merges.
- Global search and sidebar collapse toggle are intentionally removed in the new design (fixed 224px sidebar).
- `src/app/page.tsx` redirect changes from `/agreements` to `/dashboard` — do NOT touch `src/middleware.ts` for this.
- Docs-pending panel: ONLY `doc_status='sent_to_client'`; `uploaded` means complete, not pending.
- Activity feed: use `email_subject` directly from `reminders` table — no `investor_name` join needed.
- Notify/Paid payout actions on kanban cards: `POST /api/agreements/[agreement_id]/payouts/[id]/notify` and `.../paid`.

## Codex Review Notes
- (none yet)

## Next Agent Action
- Gemini to build Batch E.1 per spec at `docs/superpowers/specs/2026-05-25-batch-e1-foundation-dashboard-design.md`

## Session Log
2026-05-25 · Gemini · releasing
✅ Rebuilt /notifications UI with robust checkbox selection and 60-day window.
✅ Successfully migrated Gemini extraction to 2.5/3.5 family with tiered fallback (Claude -> Pro -> Flash).
✅ Hardened API security and input validation as per Codex review.
❌ Initial release of Pro models failed with 404; resolved by using tiered fallback logic.
💡 Use tiered fallback by default for all AI features to prevent single-model downtime or quota issues.
