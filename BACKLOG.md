## Backlog

| # | Title | Priority | Notes |
|---|-------|----------|-------|
| 1 | **Document URL expiry** | 🔴 Fix now | Uploaded PDFs stored with 24-hour signed URLs — document viewer breaks overnight. Fix: move file from `temp/` to `{reference_id}/original.{ext}` on agreement save, generate 1-year URL. Files: `api/extract/route.ts`, `api/agreements/route.ts`, `agreements/new/page.tsx`, `ExtractionReview.tsx` |
| 2 | **Investor delete safety** | 🔴 Fix now | No DELETE endpoint for investors. Need `DELETE /api/investors/[id]` that blocks (409) if non-deleted agreements exist, plus delete button with confirmation on investor detail page. Branch: `feature/investor-delete-safety` |
| 3 | **Multiple payment entries** | 🟠 High | Payment received can come in multiple tranches. Need to support multiple `{date, mode, bank, amount}` entries per agreement instead of single payment fields. Requires DB migration (JSONB array or new `agreement_payments` table) + UI update in ExtractionReview and ManualAgreementForm. |
| 4 | **Role-based access control** | 🟠 High | Coordinator / accountant / salesperson need different views. `team_members.role` exists; needs middleware/page-level checks and conditional UI. Blocks adding new users. |
| 5 | **Offer letter generation** | 🟠 High | Deferred from digital agreement flow. Generate PDF offer letter from form data. Completes the no-PDF-upload path. |
| 6 | **Weekly reminder cron** | 🟡 Medium | Dashboard already has review UI + send button. Gap: add a Monday-morning cron entry in `vercel.json` to auto-trigger the summary email. Narrow change. |
| 7 | **Dashboard segmentation** | 🟡 Medium | Split into Upcoming Payouts / Portfolio Health / Compliance Checklist. Data exists; pure UI reorganisation. |
| 8 | **Google-based login** | 🟡 Medium | Supabase OAuth already supported. Mostly Supabase dashboard config + Sign in with Google button. |
| 9 | **Version number in sidebar** | 🟢 Polish | Show `v{x.y.z}` below logo in `layout.tsx`. Bump on each release so Irene can see which build she's on. |
| 10 | **Changelog / What's new modal** | 🟢 Polish | Show "What's new" on first load after version bump using localStorage. Surfaces features and fixes to Irene. |
| 11 | **Sortable table headers** | 🟢 Polish | Investors table — sort by name, PAN, principal, agreement count. Pure frontend `useState`, no API/DB changes. |
| 12 | **Slack integration** | ⚫ Future | Automated notifications. Adds external dependency. |

---

### ✅ Done

| Title | Notes |
|-------|-------|
| Sidebar collapse/expand | Merged to main |
| Digital agreement flow | Manual form + live payout calculator merged to main. Offer letter deferred to #5. |
