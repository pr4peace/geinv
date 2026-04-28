# SESSION

## Branch
- feature/batch-c2-hotfixes

## Phase
- releasing

## Current Task
- Batch C.2 — Post-Launch Hotfixes (remaining items)

## Goal
- Implement remaining hotfixes from Batch C.2: TDS rows for cumulative agreements, Re-scan agreement, Bulk-mark payouts as paid, and What's New modal.

## Plan
1. Update agreement creation API to loop through financial year-ends (March 31st) for cumulative agreements TDS rows.
2. Create Re-scan API and UI (RescanModal) to re-extract data from existing docs.
3. Add bulk "Mark past payouts as paid" and individual "Revert" buttons + APIs.
4. Add "What's New" modal to layout.

## Todos
- [x] Item 1 — TDS 31st March rows for cumulative/compound
- [x] Item 2 — Re-scan agreement without re-upload
- [x] Item 3 — Per-agreement mark-past-paid + per-row revert
- [x] Item 4 — Splash screen What's New

## Work Completed
- Modified `src/app/api/agreements/route.ts` to generate TDS-only rows for every 31st March within the agreement term for cumulative/compound interest types.
- Created `src/app/api/agreements/[id]/rescan/route.ts` to re-run Gemini extraction on stored documents.
- Created `src/components/agreements/RescanModal.tsx` and integrated it into the agreement detail page.
- Created `src/app/api/agreements/[id]/mark-past-paid/route.ts` for bulk updating past payouts.
- Created `src/app/api/agreements/[id]/payouts/[payoutId]/revert/route.ts` for individual payout reverts.
- Updated `src/components/agreements/PayoutScheduleSection.tsx` with bulk-mark and per-row revert buttons.
- Created `src/components/WhatsNewModal.tsx` to show recent updates to users.
- Integrated `WhatsNewModal` into `src/app/(app)/layout.tsx`.
- Fixed failing test in `src/__tests__/dashboard-reminders.test.ts` by adding missing `due_by` to mock data.

## Files Changed
- `src/app/api/agreements/route.ts`
- `src/app/api/agreements/[id]/rescan/route.ts`
- `src/app/(app)/agreements/[id]/page.tsx`
- `src/components/agreements/RescanModal.tsx`
- `src/app/api/agreements/[id]/mark-past-paid/route.ts`
- `src/app/api/agreements/[id]/payouts/[payoutId]/revert/route.ts`
- `src/components/agreements/PayoutScheduleSection.tsx`
- `src/components/WhatsNewModal.tsx`
- `src/app/(app)/layout.tsx`
- `src/__tests__/dashboard-reminders.test.ts`
- `SESSION.md`

## Decisions
- Re-scan updates only agreement fields, not the payout schedule, to avoid complex merge logic for now.
- What's New modal version set to `v1`, shows up to 3 times per user.

## Codex Review Notes
- Pending

## Next Agent Action
- Codex: review the changes in Batch C.2.

