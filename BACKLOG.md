## Backlog

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| 1 | **Calendar payout dates wrong** | 🔴 Bug | Payout dates showing incorrectly on the calendar page. Needs investigation — likely a date formatting or timezone issue in `src/app/(app)/calendar/page.tsx` or `CalendarGrid.tsx`. |
| 2 | **Reminders firing on wrong dates** | 🔴 Bug | Reminders are only being set for the due date; monthly report reminders may not be triggering correctly. Investigate `generatePayoutReminders` in `src/lib/reminders.ts` and the monthly summary logic in `src/lib/reminders-monthly-summary.ts`. |
| 3 | **Cumulative agreements — TDS-only flag** | 🟠 High | Cumulative agreements have no periodic payout — only TDS is relevant. Should the payout schedule row be marked as TDS-only rather than a full interest payout? Affects how reminders and dashboard totals are calculated. Needs design decision before implementing. |
| 4 | **Multiple payment entries** | 🟠 High | Payment received in tranches. Replace `payment_date/mode/bank` single fields with `payments jsonb` array `[{date, mode, bank, amount}]`. Requires migration `013_multiple_payments.sql` + UI update in ExtractionReview and ManualAgreementForm + update Gemini extraction prompt. |
| 5 | **Add Byju as default salesperson** | 🟠 High | Add Byju to `team_members` table with role `salesperson`. Can be done directly in Supabase SQL Editor: `INSERT INTO team_members (name, email, role) VALUES ('Byju', 'byju@goodearth.com', 'salesperson');` — confirm email with user before running. Also consider making a salesperson the default pre-selected in the agreement form. |
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
