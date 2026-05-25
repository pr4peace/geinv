# SESSION

## Branch
- feature/batch-f-notifications

## Phase
- building

## Active Batch
- Batch F — Notification Revamp (2026-05-25)

---

## Work Completed
- Design spec written and reviewed: `docs/superpowers/specs/2026-05-25-batch-f-notifications-design.md`
- Implementation plan written: `docs/superpowers/plans/2026-05-25-batch-f-notifications.md`
- Branch `feature/batch-f-notifications` created from main

## Pending (Gemini to implement — 8 tasks)
1. Task 1 — Migration 024: add `batch_notification` to reminders check constraint
2. Task 2 — Add `batch_notification` to `ReminderType` in `src/types/database.ts`
3. Task 3 — Add `sendBatchNotification()` to `src/lib/email.ts`
4. Task 4 — Write failing tests in `src/__tests__/notifications-send.test.ts`
5. Task 5 — Create `POST /api/notifications/send/route.ts`
6. Task 6 — Expand `src/app/(app)/notifications/page.tsx` (3 queries, 60-day window, history)
7. Task 7 — Rebuild `src/components/notifications/NotificationsClient.tsx` (tabs, sections, checkboxes, history)
8. Task 8 — Verify old monthly-summary trigger is gone; final build + test run

## Key Decisions
- All coordinator batch emails are manual-only; no cron schedule
- Auto emails are OFF — no vercel.json, no cron jobs
- History tab reads `reminders` table filtered by `reminder_type='batch_notification'`
- One `reminders` row per selected item (not one per batch) for reliable idempotency
- `sendQuarterlyForecast` in `email.ts` left untouched (governs future Batch F cron items)
- `/api/cron/monthly-summary` stays in place but is removed from the UI

## Next Agent Action
- Gemini: read SESSION.md and the plan at `docs/superpowers/plans/2026-05-25-batch-f-notifications.md`, summarise all 8 tasks to the user, wait for confirmation, then implement in order
