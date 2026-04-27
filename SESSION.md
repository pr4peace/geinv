# SESSION

## Branch
- feature/investor-delete-safety

## Current Task
- Add safe investor deletion: a DELETE API route that blocks if active agreements exist, and a delete button on the investor detail page that shows which agreements block deletion.

## Goal
- `DELETE /api/investors/[id]` checks for non-deleted agreements linked to the investor. If any exist, it returns 409 with the list of blocking agreements. If none, it hard-deletes the investor. The investor detail page gets a delete button that shows a clear warning when blocked, and a confirmation dialog when safe to delete.

## Plan

### Step 1 — DELETE /api/investors/[id]
**File:** `src/app/api/investors/[id]/route.ts`
- Add `export async function DELETE`
- Query `agreements` where `investor_id = id` AND `deleted_at IS NULL`
- If any found: return 409 `{ error: 'Investor has active agreements', agreements: [...] }` with `reference_id`, `investor_name`, `status` for each
- If none: hard-delete the investor with `supabase.from('investors').delete().eq('id', id)`

### Step 2 — DeleteInvestorButton client component
**File:** `src/components/investors/DeleteInvestorButton.tsx`
- `'use client'` component
- Props: `investorId: string`, `investorName: string`, `agreementCount: number`
- If `agreementCount > 0`: render a disabled button with tooltip "Cannot delete — has linked agreements"
- If `agreementCount === 0`: render an active "Delete investor" button
  - On click: show inline confirmation ("This will permanently delete {name}. Are you sure?")
  - On confirm: `DELETE /api/investors/{id}`
  - On success: `router.push('/investors')`
  - On 409: show the list of blocking agreements (edge case — count could have changed since page load)
  - On error: show red error message

### Step 3 — Add button to investor detail page
**File:** `src/app/(app)/investors/[id]/page.tsx`
- Import `DeleteInvestorButton`
- Pass `investorId`, `investorName`, and `agreements.length` (already fetched on this page)
- Place it in the page header area, next to the existing back link — styled as a destructive action (red/outline)

### Step 4 — Verify
- `npm run build` — no errors
- `npm test` — no regressions

## Todos
- [x] Task 1: return `temp_path` from extract route
- [x] Task 1: pass `temp_path` through `new/page.tsx` → `ExtractionReview`
- [x] Task 1: move file + generate 1-year URL in `POST /api/agreements`
- [x] Task 1: `npm run build` + `npm test` + push
- [x] Task 2: Add `DELETE` handler to `src/app/api/investors/[id]/route.ts`
- [x] Task 2: Create `src/components/investors/DeleteInvestorButton.tsx`
- [x] Task 2: Add `DeleteInvestorButton` to investor detail page
- [x] Task 2: `npm run build` + `npm test` + push

## Work Completed
- **Task 1: Document URL Expiry Fix**
  - Updated `POST /api/extract` to return `temp_path` along with the 24-hour preview URL.
  - Modified `NewAgreementPage` and `ExtractionReview` to pass `temp_path` to the save request.
  - Updated `POST /api/agreements` to move the document from `temp/` to a permanent location (`{reference_id}/original.{ext}`) and store a 1-year signed URL in the database.
  - Verified move failure is non-fatal to agreement saving.
- **Task 2: Investor Delete Safety**
  - Added `DELETE /api/investors/[id]` route with a guard that blocks deletion if the investor has any non-deleted agreements (returns 409).
  - Created `DeleteInvestorButton` component with inline confirmation and error handling (shows blocking agreements on 409).
  - Integrated `DeleteInvestorButton` into the investor profile page header.
  - Fixed a lint error in `src/__tests__/agreements-api.test.ts` blocking the build.

## Files Changed
- `src/app/api/extract/route.ts` (Task 1)
- `src/app/(app)/agreements/new/page.tsx` (Task 1)
- `src/components/agreements/ExtractionReview.tsx` (Task 1)
- `src/app/api/agreements/route.ts` (Task 1)
- `src/app/api/investors/[id]/route.ts` (Task 2)
- `src/components/investors/DeleteInvestorButton.tsx` (Task 2, new)
- `src/app/(app)/investors/[id]/page.tsx` (Task 2)
- `src/__tests__/agreements-api.test.ts` (Build fix)

## Decisions
- **Task 1:** `file_url` (24-hour URL) stays for in-browser preview — only `document_url` stored in DB changes to the 1-year signed URL.
- **Task 1:** File move failure is non-fatal — agreement data must not be rolled back over a storage failure.
- **Task 2:** Hard-delete investors (not soft-delete) — investor profiles have no audit trail requirement; agreements carry the financial history.
- **Task 2:** Block on ANY non-deleted agreement (active, matured, cancelled) — not just active ones.
- **Task 2:** `agreementCount` prop pre-disables the button at page load — API does a server-side check on confirm as source of truth.

## Codex Review Notes
-

## Next Agent Action
- Codex: Review both tasks. Task 1 is on `feature/doc-url-fix` and Task 2 is on `feature/investor-delete-safety`. Both have been pushed.
