# SESSION

## Branch
- feature/digital-agreement-form

## Current Task
- Add a "Create manually" path to the New Agreement flow so agreements can be created via form entry without uploading a PDF.

## Goal
- Users can create a new agreement by filling in a form directly (no PDF upload). The payout schedule is computed live from principal, ROI%, frequency, and dates using the existing `calculatePayoutSchedule` utility. On save, the agreement and payout schedule rows are written to the database using the existing `POST /api/agreements` endpoint. Offer letter generation is out of scope for this session.

## Plan

### Step 1 — Entry point: two paths on /agreements/new
**File:** `src/app/(app)/agreements/new/page.tsx`
- Replace the current single-step (upload only) page with a choice screen: two cards — "Upload PDF" and "Create manually"
- "Upload PDF" → existing flow (UploadStep → extract → ExtractionReview)
- "Create manually" → renders the new `ManualAgreementForm` component directly

### Step 2 — Create ManualAgreementForm component
**File:** `src/components/agreements/ManualAgreementForm.tsx`
- `'use client'` component
- Same `FormState` shape as `ExtractionReview` — all fields start empty (or sensible defaults: `reference_id` auto-generated, `payout_frequency: 'quarterly'`, `interest_type: 'simple'`)
- Same field sections as ExtractionReview: investor details, financial terms, payment info, salesperson, nominees
- No PDF preview pane, no extraction warnings
- Salesperson dropdown loaded via `GET /api/team` (same fetch as ExtractionReview)

### Step 3 — Live payout schedule preview
- Import `calculatePayoutSchedule` from `@/lib/payout-calculator`
- Use `useMemo` over `[principal, roi, frequency, interestType, startDate, maturityDate]` to compute the schedule whenever those fields change
- Render the result using the existing `PayoutScheduleTable` component
- Show the preview section only when all required numeric/date fields are filled

### Step 4 — Save
- On submit: same validation as ExtractionReview (required fields, numeric checks)
- POST to `/api/agreements` with `document_url: null` and `payout_schedule` from the live calculator
- On success: `router.push('/agreements/' + created.id)`
- Duplicate detection: same 409 handling as ExtractionReview

### Step 5 — Verify
- `npm run build` — no errors
- `npm test` — no regressions

## Todos
- [ ] Add two-path choice to `/agreements/new/page.tsx` ("Upload PDF" / "Create manually")
- [ ] Create `ManualAgreementForm.tsx` with all form fields and empty initial state
- [ ] Wire live payout calculator using `calculatePayoutSchedule` + `useMemo`
- [ ] Render live schedule with `PayoutScheduleTable`
- [ ] Save: POST to `/api/agreements` with calculated `payout_schedule`, handle 409, redirect on success
- [ ] `npm run build` — clean
- [ ] `npm test` — no regressions

## Work Completed
-

## Files Changed
-

## Decisions
- Offer letter generation is deferred — it requires template design and PDF rendering, a separate session
- `document_url` is `null` for manually-created agreements — the API already supports this
- Live payout schedule uses `useMemo` not `useEffect` — no async, pure calculation, no extra state
- Reuse `PayoutScheduleTable` and `calculatePayoutSchedule` — no new calculation logic needed
- Two-path entry replaces the old single upload page — cleaner than hiding/showing within the same component

## Codex Review Notes
-

## Next Agent Action
- Gemini: Implement the plan in SESSION.md. Confirm you are on branch `feature/digital-agreement-form` before writing any code. Verify with `npm run build` and `npm test` after implementation.
