## Priority Order

---

### 🔴 Bugs — Fix Before / During Irene's Upload (188 docs, next 3 days)

1. **Document URL expiry** — uploaded PDFs are stored with 24-hour signed URLs in `document_url`. After 24 hours the document viewer breaks on every agreement page. Fix: move file from `temp/` to permanent path (`{reference_id}/original.{ext}`) on save and generate a 1-year signed URL. Files: `src/app/api/extract/route.ts` (return `temp_path`), `src/app/api/agreements/route.ts` (move file + regenerate URL on insert).

2. **Investor orphan / delete safety** _(in progress — branch: `feature/investor-delete-safety`)_ — agreements delete (soft) but investors are never cleaned up. Need `DELETE /api/investors/[id]` that blocks if non-deleted agreements exist, plus a delete button on the investor detail page with a confirmation dialog.

---

### 🟠 High Priority

3. **Role-based access control** — coordinator / accountant / salesperson need different views before onboarding more users. Supabase `team_members.role` already exists; needs middleware or page-level checks and conditional UI rendering.

4. **Offer letter generation** — deferred from digital agreement flow. Generate a PDF offer letter from agreement form data (template + PDF renderer). Replaces the current PDF-only path fully.

---

### 🟡 Medium Priority

5. **Automated weekly reminders** — dashboard already has the review UI and send button. Remaining gap: the Vercel cron fires daily at 2am for all reminders; no Monday-specific summary schedule. Add a second cron entry in `vercel.json` that runs Monday morning and triggers the summary email automatically.

6. **Dashboard segmentation** — split dashboard into Upcoming Payouts, Portfolio Health, Compliance Checklist sections. Data already exists; purely a UI reorganisation.

7. **Google-based login** — Supabase already supports OAuth; mostly Supabase dashboard config + a "Sign in with Google" button on the login page.

---

### 🟢 Polish / Easy

8. **Version number in sidebar** — show `v{x.y.z}` below the logo in `src/app/(app)/layout.tsx`. Bump manually on each release so Irene can see which build she's on.

9. **Changelog / What's new modal** — show a "What's new in v{x}" modal on first load after a version bump, using localStorage to track last-seen version. Surfaces new features and bug fixes to Irene without her needing to ask.

10. **Sortable table headers** — investors table (name, PAN, principal, agreement count); pure frontend `useState` sort, no API/DB changes.

---

### ⚫ Low Priority / Future

11. **Slack integration** — automated notifications; adds external dependency.

---

### ✅ Done

- **Sidebar collapse/expand** — merged to main
- **Create agreement flow (digital)** — manual form + live payout calculator; merged to main (offer letter deferred to #4)
