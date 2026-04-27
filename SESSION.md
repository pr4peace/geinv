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
- [ ] Add `DELETE` handler to `src/app/api/investors/[id]/route.ts`
- [ ] Create `src/components/investors/DeleteInvestorButton.tsx`
- [ ] Add `DeleteInvestorButton` to investor detail page
- [ ] `npm run build` — clean
- [ ] `npm test` — no regressions

## Work Completed
-

## Files Changed
-

## Decisions
- Hard-delete investors (not soft-delete) — investor profiles have no audit trail requirement; the agreements carry the history
- Block deletion when ANY non-deleted agreement exists — even matured or cancelled ones, since they still represent financial history
- Only truly orphaned investors (all agreements soft-deleted) can be removed
- `agreementCount` prop pre-disables the button at page load — API does a server-side check on confirm as source of truth
- No auto-delete of investors when an agreement is deleted — investor profiles are independent entities

## Codex Review Notes
-

## Next Agent Action
- Gemini: Implement the plan in SESSION.md. Confirm branch is `feature/investor-delete-safety` before writing any code. Run `npm run build` and `npm test` after. Push when done.
