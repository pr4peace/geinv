## Backlog

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| 0 | **Remove E2E tests** | 🟢 Wave 2 | Delete `e2e/` folder and `playwright.config.ts`. Remove `test:e2e` script from `package.json`. Update `AGENTS.md` verification steps to remove E2E. Update `CLAUDE.md`. Rely on `npm run build` + `npm test` (Vitest) as the only gate. Reason: E2E runs against live prod, requires credentials no agent has, creates noise every session. |
| 1 | **Calendar phantom payouts + rebuild with react-big-calendar** | 🔴 Bug | Three bugs in `src/app/(app)/calendar/page.tsx`: (1) **Phantom payout events** — Supabase aliased join filter `.eq('agreement.status', 'active')` is silently ignored (alias vs table name mismatch), so payout rows for deleted/inactive agreements appear. Fix: fetch active agreement IDs first, then filter payout rows with `.in('agreement_id', ids)`. (2) **Draft payouts showing** — no `is_draft` filter, draft agreements' full payout schedules show on calendar. Fix: exclude `is_draft = true` agreements. (3) **Cumulative double-count** — cumulative agreements show both a payout event and a maturity event on the same day. Fix: skip payout events where the agreement's `payout_frequency = 'cumulative'` (maturity event is sufficient). Also: replace custom `CalendarGrid.tsx` with `react-big-calendar` (already installed) to get month/week/agenda views with correct navigation. |
| 2 | **Reminders firing on wrong dates** | 🔴 Bug | Reminders are only being set for the due date; monthly report reminders may not be triggering correctly. Investigate `generatePayoutReminders` in `src/lib/reminders.ts` and the monthly summary logic in `src/lib/reminders-monthly-summary.ts`. |
| 3 | **Cumulative agreements — TDS-only row** | 🟠 High | For cumulative agreements the single maturity payout row should be flagged `is_tds_only = true`. Design: (1) add `is_tds_only boolean default false` column to `payout_schedule` via migration; (2) set it to `true` when `payout_frequency = 'cumulative'` in `POST /api/agreements`; (3) reminder system skips investor-facing emails for `is_tds_only` rows; (4) dashboard/payout table shows a distinct "TDS Filing" status badge for these rows so coordinators can track internally with a separate status (e.g. `tds_filed`). No payout reminder to investor — internal tracking only. |
| 4 | **Multiple payment entries** | 🟠 High | Payment received in tranches. Replace `payment_date/mode/bank` single fields with `payments jsonb` array `[{date, mode, bank, amount}]`. Requires migration `013_multiple_payments.sql` + UI update in ExtractionReview and ManualAgreementForm + update Gemini extraction prompt. |
| 5 | **Add Byju to team_members** | ✅ Ready to run | `INSERT INTO team_members (name, email, role, is_active) VALUES ('Byju', 'byju@goodearth.org.in', 'coordinator', true) ON CONFLICT (email) DO NOTHING;` — run in Supabase SQL Editor. Using coordinator for now; add `management` role via migration later if needed. |
| 6 | **Role-based access control** | 🟠 High | Coordinators / accountants / salespersons see different views. Middleware checks email against `team_members`; blocks unknown users. Page-level conditional rendering per role. Blocks adding new users safely. |
| 7 | **Offer letter generation** | 🟠 High | Generate PDF offer letter from agreement form data. Completes the no-PDF-upload path. |
| 8 | **Weekly reminder cron** | 🟡 Medium | Add Monday-morning cron entry in `vercel.json` to auto-trigger the summary email. Narrow change. |
| 9 | **Dashboard segmentation** | 🟡 Medium | Split into Upcoming Payouts / Portfolio Health / Compliance Checklist. Data exists; pure UI reorganisation. |
| 10 | **Google-based login** | 🟡 Medium | Supabase OAuth config + Sign in with Google button on login page. |
| 11 | **Version number in sidebar** | 🟢 Polish | Show `v{x.y.z}` below logo in `layout.tsx`. Bump on each release. |
| 12 | **Changelog / What's new modal** | 🟢 Polish | Show "What's new" on first load after version bump using localStorage. |
| 13 | **Sortable table headers** | 🟢 Polish | Investors table — sort by name, PAN, principal, agreement count. Pure frontend, no API/DB changes. |
| 14 | **Slack integration** | ⚫ Future | Automated notifications. Adds external dependency. |

---

### ✅ Done

| Title | Notes |
|-------|-------|
| Sidebar collapse/expand | Merged to main |
| Digital agreement flow | Manual form + live payout calculator. |
| Document URL expiry fix | Permanent storage path + 1-year signed URL on save. |
| Doc lifecycle auto-advance | Scanned signed uploads auto-set to `doc_status: 'uploaded'`. |
| Investor delete safety | `DELETE /api/investors/[id]` with agreement guard + UI button. |
