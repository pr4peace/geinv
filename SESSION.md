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
- [x] Add two-path choice to `/agreements/new/page.tsx` ("Upload PDF" / "Create manually")
- [x] Create `ManualAgreementForm.tsx` with all form fields and empty initial state
- [x] Wire live payout calculator using `calculatePayoutSchedule` + `useMemo`
- [x] Render live schedule with `PayoutScheduleTable`
- [x] Save: POST to `/api/agreements` with calculated `payout_schedule`, handle 409, redirect on success
- [x] `npm run build` — clean
- [x] `npm test` — no regressions

## Work Completed
- Added a "Choice" screen to `/agreements/new` with two paths: "Upload PDF / DOCX" and "Create Manually".
- Created `ManualAgreementForm.tsx` component providing a full form for manual agreement entry.
- Integrated `calculatePayoutSchedule` in `ManualAgreementForm` using `useMemo` for live payout schedule preview.
- Reused `PayoutScheduleTable` to display the computed schedule.
- Implemented `handleSave` in `ManualAgreementForm` to POST to `/api/agreements` with calculated schedule.
- Handled duplicate detection (409) in the manual flow with confirmation bypass.
- Added `onBack` support to `UploadStep` for returning to the choice screen.
- Fixed vitest config to exclude `e2e` directory.
- Fixed lint errors in `ManualAgreementForm.tsx`.
- Verified build with `npm run build` (success).
- Verified unit tests with `npm test` (success).
- Attempted E2E tests with `npx playwright test` (failed due to missing environment variables for auth, as expected in this environment).

## Files Changed
- `src/app/(app)/agreements/new/page.tsx`: Added choice step and routing.
- `src/components/agreements/ManualAgreementForm.tsx`: New component for manual entry.
- `src/components/agreements/UploadStep.tsx`: Added back button.
- `vitest.config.ts`: Excluded `e2e` directory from unit tests.

## Decisions
- Used `useMemo` for live payout schedule to ensure it updates whenever financial terms or dates change.
- Explicitly mapped payout rows in `ManualAgreementForm` to remove the `status` field (which is set to 'paid' by the utility but should be 'pending' for new agreements), allowing the database default to take over.
- Simplified `ManualAgreementForm` by removing PDF preview and extraction-specific logic.

## Codex Review Notes
-

## Next Agent Action
- Codex: Review the changes and verify against the plan. Note that E2E tests were attempted but failed due to missing credentials in the environment.
