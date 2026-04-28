# SESSION

## Branch
- main

## Phase
- reviewing

## Active Batch
- Batch G — UX polish + data fixes (push directly to main)

---

## Items for Gemini

### Item 1 — TDS amounts showing as zero for cumulative/compound agreements
- [x] Complete

### Item 2 — Inline confirmation for BackfillTdsButton (no Chrome UI)
- [x] Complete

### Item 3 — Floating undo toast for destructive actions
- [x] Complete

### Item 4 — Standing rule: no native browser dialogs anywhere
- [x] Complete

---

## Todos
- [x] Item 1 — Calculate TDS amounts for cumulative/compound rows
- [x] Item 2 — BackfillTdsButton inline confirmation
- [x] Item 3 — UndoToast component + wire into PayoutScheduleSection + NotificationsClient
- [x] Item 4 — Remove all remaining confirm()/alert() calls

---

## Work Completed
- Batch F complete — notification queue, /notifications page, sidebar nav, salesperson gates
- Gemini truncation fix — graceful JSON repair on MAX_TOKENS with user warning
- Batch G complete — TDS calculation fixes, inline confirmations, undo toast

## Files Changed
- src/app/api/agreements/route.ts
- src/app/api/admin/backfill-tds-rows/route.ts
- src/components/settings/BackfillTdsButton.tsx
- src/components/UndoToast.tsx
- src/components/agreements/PayoutScheduleSection.tsx
- src/components/notifications/NotificationsClient.tsx
- src/app/api/agreements/[id]/revert-past-paid/route.ts
- src/app/api/notifications/[id]/revert-dismiss/route.ts
- src/components/investors/MergeInvestorButton.tsx
- src/components/agreements/ImportFlow.tsx

## Decisions
- No native browser dialogs anywhere in the app — standing rule
- TDS amounts must be calculated, not left as zero
- Undo toast is always 5 seconds, bottom-right
- Added bulk revert and notification revert API routes to support undo functionality

## Codex Review Notes
- Pending

## Next Agent Action
- Codex: review Batch G diff and check for logic errors in compound interest calculation.
