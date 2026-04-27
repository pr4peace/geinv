# SESSION

## Branch
- main

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
- **Fixed Codex blocking issues:**
  - Restricted Payout Frequency to allowed DB values (`quarterly`, `annual`, `cumulative`).
  - Forced Lock-in Years to be an integer in both frontend and backend.
  - Added frontend and backend validation to ensure `maturity_date > investment_start_date`.
  - Added frontend and backend validation to ensure a payout schedule is actually generated/provided before saving non-draft agreements.
  - Added server-side validation for `payout_frequency` and `lock_in_years` in `POST /api/agreements`.
  - Committed missing regression coverage in `src/__tests__/payout-calculator.test.ts`.
  - Added new regression coverage for API validation in `src/__tests__/agreements-api.test.ts` (both rejection and positive paths).
- Fixed vitest config to exclude `e2e` directory.
- Fixed lint errors in `ManualAgreementForm.tsx` and `agreements-api.test.ts`.
- Added `test-results/` to `.gitignore` and removed artifacts from git history.
- Verified build with `npm run build` (success).
- Verified unit tests with `npm test` (success).

## Files Changed
- `src/app/(app)/agreements/new/page.tsx`: Added choice step and routing.
- `src/components/agreements/ManualAgreementForm.tsx`: New component for manual entry with validation.
- `src/components/agreements/UploadStep.tsx`: Added back button.
- `src/app/api/agreements/route.ts`: Added backend validation for manual/digital agreements.
- `src/__tests__/payout-calculator.test.ts`: New unit tests for payout calculation.
- `src/__tests__/agreements-api.test.ts`: New unit tests for API validation.
- `vitest.config.ts`: Excluded `e2e` directory from unit tests.
- `.gitignore`: Added `test-results/`.

## Decisions
- Used `useMemo` for live payout schedule to ensure it updates whenever financial terms or dates change.
- Explicitly mapped payout rows in `ManualAgreementForm` to remove the `status` field (which is set to 'paid' by the utility but should be 'pending' for new agreements), allowing the database default to take over.
- Simplified `ManualAgreementForm` by removing PDF preview and extraction-specific logic.
- **Local-Only Rule:** All work remains local. No pushing to GitHub or Vercel until final verification and explicit approval at the end of the session.
- **Rejection over Mutation:** Changed from rounding fractional `lock_in_years` to rejecting them in both UI and API to avoid silent mutation of financial terms.

## Codex Review Notes
- **Resolved** Lint errors and positive-path test coverage added.
- **Resolved** `test-results/` artifacts removed and ignored.
- **Note on E2E** Playwright tests are failing due to missing `E2E_USER_EMAIL` in the CLI environment. This is expected as per `CLAUDE.md` and does not block the release of the logic changes which are verified by unit tests and manual local verification.

## Next Agent Action
- Awaiting release approval.
