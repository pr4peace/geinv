# SESSION

## Branch
- main

## Phase
- releasing

## Active Batch
- Batch C — Agreement Data + Quick Polish (`feature/batch-c-agreement-data`)

## Items
- [x] Migrations: `015_multiple_payments.sql` + `016_tds_only_payout.sql`
- [x] Multiple payment entries (`payments jsonb[]`)
- [x] Cumulative TDS-only row (`is_tds_only` + `tds_filed`)
- [x] Splash screen
- [x] Version number in sidebar (`v0.1.0`)
- [x] Grey out Quarterly Review + Reports nav
- [x] Collapsible sidebar (localStorage persistence + tooltips)
- [x] Global search bar (agreements + investors)
- [x] Sortable investors table
- [x] Search sanitisation + AbortController stale-response fix
- [x] mark-tds-filed returns 404 when no row matched
- [x] Investor list scoped for salesperson role
- [x] Investor detail page scoped for salesperson
- [x] Investor CSV download scoped for salesperson
- [x] Tests for both ^ above
- [x] Build + test clean, release to main

## Work Completed
- Batch C features built, Codex-reviewed, and blocking fixes applied.
- All tests pass, build is clean.
- Merged to main.

## Files Changed
- Multiple files in src/app, src/components, src/lib, src/__tests__, and supabase/migrations.

## Codex Review Notes
- All blocking issues from Batch C review resolved.

## Decisions
- `payments jsonb[]` entries: `{ date, mode, bank, amount }`
- `is_tds_only` rows injected at API level for cumulative agreements
- Client-side sort for investors table (small dataset)
- RBAC via `x-user-role` / `x-user-team-id` headers set by middleware
- Extracted investor detail access check to helper in `lib/investors-page.ts` for testability.

## Next Agent Action
- Batch C complete. Claude to select Batch D from BACKLOG.md.
