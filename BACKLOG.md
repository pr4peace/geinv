## Backlog — Release Batches

Each batch = one branch + one release. Gemini works through all items in a batch before releasing.

---

### 🟠 Batch C — Agreement Data + Quick Polish (branch: `feature/batch-c-agreement-data`)
*DB changes to the agreement model + two small frontend items folded in.*

| Item | Notes |
|---|---|
| **Multiple payment entries** | Replace `payment_date/mode/bank` with `payments jsonb []`. Migration `013_multiple_payments.sql`. Update ExtractionReview, ManualAgreementForm, API route, detail page, Gemini extraction prompt. |
| **Cumulative TDS-only row** | Add `is_tds_only boolean default false` to `payout_schedule`. Set `true` when `payout_frequency = 'cumulative'`. Skip investor reminders for these rows. Show "TDS Filing" badge in payout table with trackable `tds_filed` status. Migration needed. |
| **Version number in sidebar** | `v{x.y.z}` below logo in `layout.tsx`. Bump on each release. 1-line change. |
| **Sortable table headers** | Investors table — sort by name, PAN, principal, agreement count. Pure `useState` sort, no API changes. |

---

### 🟡 Batch D — Dashboard Polish (branch: `feature/batch-d-dashboard`)
*Pure frontend. Version number + sortable tables moved to Batch C.*

| Item | Notes |
|---|---|
| **Dashboard segmentation** | Split into Upcoming Payouts / Portfolio Health / Compliance Checklist sections. Data already fetched. |
| **Changelog / What's new modal** | Show on first load after version bump using localStorage. |

---

### 🟠 Batch E — Offer Letter Flow (branch: `feature/batch-e-offer-letter`)
*Part of the Create Agreement flow. No external dependencies — physical signing, not e-sign.*

| Item | Notes |
|---|---|
| **Generate offer letter PDF** | Render agreement data into a PDF offer letter. Library TBD (react-pdf or puppeteer). Needs template design before implementation. |
| **Send offer letter to client** | Email PDF attachment via Resend from agreement detail page. Button: "Send Offer Letter". Updates `doc_status: sent_to_client`. |
| **Mark as signed / approved** | "Mark as Signed" button on agreement detail after client returns physical signed copy. Updates `doc_status: returned`. Optionally attach scanned copy (upload already exists). |

---

### ⚫ Future

| Item | Notes |
|---|---|
| **E-sign integration** | Replace physical signing step with third-party e-sign (Dropbox Sign / DocuSign). Magic link flow, webhook to auto-update `doc_status`. Build after Batch E is stable. |
| **Slack integration** | Automated notifications. External dependency. |

---

### ✅ Done

| Title | Notes |
|---|---|
| **Batch A — Auth & Access** | Google Login integration, Middleware RBAC with header propagation, comprehensive API-level access control. |
| **Batch B — Calendar & Reminders** | Fixed phantom payouts, rebuilt calendar with react-big-calendar, fixed reminder lead times, added Monday cron. |
| Remove E2E tests | E2E tests removed; relying on Vitest unit tests. |
| Sidebar collapse/expand | Merged to main |
| Digital agreement flow | Manual form + live payout calculator |
| Document URL expiry fix | Permanent storage path + 1-year signed URL |
| Doc lifecycle auto-advance | Scanned signed uploads → `doc_status: 'uploaded'` |
| Investor delete safety | `DELETE /api/investors/[id]` with agreement guard + UI |
