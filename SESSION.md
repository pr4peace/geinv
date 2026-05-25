# SESSION

## Branch
- feature/batch-f-notifications

## Phase
- releasing

## Active Batch
- Batch F — Notification Revamp (2026-05-25)

---

## Work Completed
- **Batch F — Notification Revamp:**
  - DB Migration: added `batch_notification` to `reminders` type check constraint.
  - API: implemented `POST /api/notifications/send` for manual batched emails.
  - UI: rebuilt `/notifications` with two tabs (Queue/History), 60-day window, and checkboxes.
  - Cleanup: removed outdated auto-reminder logic and tests.
  - Type Safety: resolved all ESLint errors and added proper types for Supabase responses.

## Pending (Batch G — Next)
- [ ] User to verify manual batch notify workflow on real data
- [ ] Refine email templates based on feedback

## Key Decisions
- All coordinator batch emails are manual-only; no cron schedule
- Auto emails are OFF — no vercel.json, no cron jobs
- History tab reads `reminders` table filtered by `reminder_type='batch_notification'`
- One `reminders` row per selected item (not one per batch) for reliable idempotency
- `sendQuarterlyForecast` in `email.ts` left untouched (governs future Batch F cron items)
- `/api/cron/monthly-summary` stays in place but is removed from the UI

## Next Agent Action
- Propose release and merge to main.
