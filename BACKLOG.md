## Backlog

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| 1 | **Multiple payment entries** | 🟠 High | Payment received in tranches. Replace `payment_date/mode/bank` single fields with `payments jsonb` array `[{date, mode, bank, amount}]`. Requires migration `013_multiple_payments.sql` + UI update in ExtractionReview and ManualAgreementForm + update Gemini extraction prompt. |
| 2 | **Role-based access control** | 🟠 High | Coordinators / accountants / salespersons see different views. Middleware checks email against `team_members`; blocks unknown users. Page-level conditional rendering per role. Blocks adding new users safely. |
| 3 | **Offer letter generation** | 🟠 High | Generate PDF offer letter from agreement form data. Completes the no-PDF-upload path. |
| 4 | **Weekly reminder cron** | 🟡 Medium | Add Monday-morning cron entry in `vercel.json` to auto-trigger the summary email. Narrow change. |
| 5 | **Dashboard segmentation** | 🟡 Medium | Split into Upcoming Payouts / Portfolio Health / Compliance Checklist. Data exists; pure UI reorganisation. |
| 6 | **Google-based login** | 🟡 Medium | Supabase OAuth config + Sign in with Google button on login page. |
| 7 | **Version number in sidebar** | 🟢 Polish | Show `v{x.y.z}` below logo in `layout.tsx`. Bump on each release. |
| 8 | **Changelog / What's new modal** | 🟢 Polish | Show "What's new" on first load after version bump using localStorage. |
| 9 | **Sortable table headers** | 🟢 Polish | Investors table — sort by name, PAN, principal, agreement count. Pure frontend, no API/DB changes. |
| 10 | **Slack integration** | ⚫ Future | Automated notifications. Adds external dependency. |

---

### ✅ Done

| Title | Notes |
|-------|-------|
| Sidebar collapse/expand | Merged to main |
| Digital agreement flow | Manual form + live payout calculator. Offer letter deferred. |
| Document URL expiry fix | Permanent storage path + 1-year signed URL on save. |
| Doc lifecycle auto-advance | Scanned signed uploads auto-set to `doc_status: 'uploaded'`. |
| Investor delete safety | `DELETE /api/investors/[id]` with agreement guard + UI button. |
