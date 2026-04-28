# SESSION

## Branch
- main

## Phase
- building

## Active Batch
- Batch F — Notification Revamp

---

## For Gemini

Read these two files before doing anything:

1. **Spec:** `docs/superpowers/specs/2026-04-28-batch-f-notifications-design.md`
2. **Plan:** `docs/superpowers/plans/2026-04-28-batch-f-notifications.md`

The plan has 14 tasks. Work through them in order, task by task. Each task has exact file paths, complete code, and commit instructions. Follow them precisely.

**Before writing any code:** Post a plain-English summary of all 14 tasks and wait for user confirmation.

**Rules:**
- Push to `main` directly (no branch needed for this batch)
- `npm run build` must pass after every task before committing
- `npm test` must pass at the end
- Do not skip tasks or merge steps
- The migration (Task 1) requires manual execution in Supabase SQL Editor — list the SQL and ask the user to run it before proceeding to Task 2

---

## Key context from today's session

- All salesperson RBAC scoping is already done for agreements, investors, calendar, dashboard
- `src/lib/reminders.ts` body builders currently private — Task 3 exports them
- Latest migration is `016_tds_only_payout.sql` — new one is `017_notification_queue.sql`
- The `paid` route already has a salesperson gate; `revert`, `mark-past-paid`, `rescan` do not yet
- `RescanModal` exists at `src/components/agreements/RescanModal.tsx`
- `PayoutScheduleSection` is at `src/components/agreements/PayoutScheduleSection.tsx`
- Agreement detail page already reads `x-user-role` and `x-user-team-id` from headers

## Work Completed
- Spec written: `docs/superpowers/specs/2026-04-28-batch-f-notifications-design.md`
- Plan written: `docs/superpowers/plans/2026-04-28-batch-f-notifications.md`

## Files Changed
- SESSION.md

## Decisions
- Everything goes through review queue — cron populates, humans send
- Salesperson: view + create only, no processing actions
- Push directly to main, no feature branch

## Codex Review Notes
- Pending

## Next Agent Action
- Gemini: read spec + plan, summarise 14 tasks, wait for confirmation, implement task by task
