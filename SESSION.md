# SESSION

## Branch
- feature/batch-c-agreement-data

## Phase
- building

## Active Batch
- Batch C — Agreement Data + Quick Polish (`feature/batch-c-agreement-data`)

## Items
- [ ] Migrations: run `015_multiple_payments.sql` + `016_tds_only_payout.sql` in Supabase SQL Editor
- [ ] Multiple payment entries (`payments jsonb[]` replacing `payment_date/mode/bank`)
- [ ] Cumulative TDS-only row (`is_tds_only` + `tds_filed` on `payout_schedule`)
- [ ] Splash screen (fade-out on initial app load)
- [ ] Version number in sidebar (`v0.1.0` below logo in `layout.tsx`)
- [ ] Grey out Quarterly Review + Reports nav items (non-clickable, "Soon" badge)
- [ ] Collapsible sidebar (toggle button, collapsed state persisted in localStorage, tooltips when collapsed)
- [ ] Global search bar in sidebar (search investors + agreements by name/ref)
- [ ] Sortable investors table (client component, `useState` sort)
- [ ] Build + test clean, release to main

## Work Completed
- Batch A released: Google Login, Middleware RBAC, API-level access control.

## Files Changed
-

## Codex Review Notes
-

## Decisions
- `payments jsonb[]` entries: `{ date, mode, bank, amount }` — amount included for tranche tracking
- Migration migrates existing single-payment data with `amount: null` (historical amounts unknown)
- TDS-only rows are separate `payout_schedule` rows, not columns on main row
- `generatePayoutReminders` skips `is_tds_only` rows — no investor-facing reminder
- Splash fades at 1.2s, fully hidden at 1.7s — CSS transition, no server dependency
- Investors table extracted to `src/components/investors/InvestorsTable.tsx` client component
- Migration numbers are `015` + `016` (latest in repo is `014`)

## Next Agent Action
- Gemini: Read the full plan at `docs/superpowers/plans/2026-04-27-batch-c-agreement-data.md`.
  Summarise all 5 items to user, wait for confirmation, then implement in this order:
  1. Create migration files, ask user to run both in Supabase SQL Editor — wait for confirmation before writing any code
  2. Update `src/types/database.ts` — run build to surface type errors
  3. Update `src/lib/claude.ts` (ExtractedAgreement + prompt)
  4. Update `ExtractionReview.tsx` + `ManualAgreementForm.tsx` (payments array UI)
  5. Update `src/app/api/agreements/route.ts`
  6. Update `src/app/(app)/agreements/[id]/page.tsx` (payments display + TDS badge + Mark Filed button)
  7. Create `src/app/api/payout-schedule/[id]/mark-tds-filed/route.ts`
  8. Update `src/lib/payout-calculator.ts` (TDS-only row for cumulative)
  9. Update `src/lib/reminders.ts` (skip is_tds_only)
  10. Create `src/components/SplashScreen.tsx`
  11. Update `src/app/(app)/layout.tsx` (version + splash)
  12. Create `src/components/investors/InvestorsTable.tsx` + update `src/app/(app)/investors/page.tsx`
  Run `npm run build` + `npm test`. Release to main, sync session files, mark Batch C done in BACKLOG.md.
