## Backlog — Release Batches

Each batch = one branch + one release. Gemini works through all items in a batch before releasing.

---

### 🔴 Batch A — Auth & Access (branch: `feature/batch-a-auth`)
*Everything needed to safely onboard the team. Do this first.*

| Item | Notes |
|---|---|
| **Google login** | Replace email/password form with Google-only button. `src/app/login/page.tsx`. OAuth config already done in Supabase. |
| **Role-based access control** | Middleware checks email against `team_members`; blocks unknowns. Salespersons see only their agreements. Settings page coordinator-only. |

---

### 🟠 Batch C — Agreement Data (branch: `feature/batch-c-agreement-data`)
*All changes to the agreement model together — one migration run.*

| Item | Notes |
|---|---|
| **Multiple payment entries** | Replace `payment_date/mode/bank` with `payments jsonb []`. Migration `013_multiple_payments.sql`. Update ExtractionReview, ManualAgreementForm, API route, detail page, Gemini extraction prompt. |
| **Cumulative TDS-only row** | Add `is_tds_only boolean default false` to `payout_schedule`. Set `true` when `payout_frequency = 'cumulative'`. Skip investor reminders for these rows. Show "TDS Filing" badge in payout table with trackable `tds_filed` status. Migration needed. |

---

### 🟡 Batch D — Dashboard & UI Polish (branch: `feature/batch-d-dashboard`)
*Pure frontend, no API/DB changes. Fast to build and review.*

| Item | Notes |
|---|---|
| **Dashboard segmentation** | Split into Upcoming Payouts / Portfolio Health / Compliance Checklist sections. Data already fetched. |
| **Version number in sidebar** | `v{x.y.z}` below logo in `layout.tsx`. Bump on each release. |
| **Sortable table headers** | Investors table — sort by name, PAN, principal, agreement count. Pure `useState` sort. |
| **Changelog / What's new modal** | Show on first load after version bump using localStorage. |

---

### 🟠 Batch E — Offer Letter (branch: `feature/batch-e-offer-letter`)
*Standalone — needs PDF template design. Separate session.*

| Item | Notes |
|---|---|
| **Offer letter generation** | Generate PDF offer letter from agreement form data. Needs template design + PDF renderer library choice. |

---

### ⚫ Future

| Item | Notes |
|---|---|
| **Slack integration** | Automated notifications. External dependency. |

---

### ✅ Done

| Title | Notes |
|---|---|
| **Batch B — Calendar & Reminders** | Fixed phantom payouts, rebuilt calendar with react-big-calendar, fixed reminder lead times, added Monday cron. |
| Remove E2E tests | E2E tests removed; relying on Vitest unit tests. |
| Sidebar collapse/expand | Merged to main |
| Digital agreement flow | Manual form + live payout calculator |
| Document URL expiry fix | Permanent storage path + 1-year signed URL |
| Doc lifecycle auto-advance | Scanned signed uploads → `doc_status: 'uploaded'` |
| Investor delete safety | `DELETE /api/investors/[id]` with agreement guard + UI |
