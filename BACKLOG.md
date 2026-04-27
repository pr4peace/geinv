## Backlog — Release Batches

Each batch = one branch + one release. Gemini works through all items in a batch before releasing.

---

### 🟠 Batch C — Agreement Data + Quick Polish (branch: `feature/batch-c-agreement-data`)
*DB changes to the agreement model + two small frontend items folded in.*

| Item | Notes |
|---|---|
| **Multiple payment entries** | Replace `payment_date/mode/bank` with `payments jsonb[]`. Each entry: `{ date, mode, bank, amount }`. Migration `015_multiple_payments.sql`. Update ExtractionReview, ManualAgreementForm, API route, detail page, Gemini extraction prompt. |
| **Cumulative TDS-only row** | Add `is_tds_only boolean default false` + `tds_filed boolean default false` to `payout_schedule`. Migration `016_tds_only_payout.sql`. Show TDS amount on the row. Generate a TDS filing reminder. Skip investor-facing payout reminders for these rows. Show "TDS Filing" badge with a Mark Filed button. |
| **Splash screen** | Full-screen loading splash shown on initial app load. Good Earth branding, fade out after 1–2s or once data is ready. |
| **Version number in sidebar** | `v{x.y.z}` below logo in `layout.tsx`. Bump on each release. 1-line change. |
| **Grey out Quarterly Review + Reports nav** | Mark both nav items as `coming soon` in `layout.tsx` — greyed out, non-clickable, small "Soon" badge. Quarterly Review and Reports pages are not yet functional. |
| **Sortable table headers** | Investors table — sort by name, PAN, principal, agreement count. Pure `useState` sort, no API changes. |

---

### 🟠 Batch D — Offer Letter Flow (branch: `feature/batch-d-offer-letter`)
*Calculator with smart defaults → offer letter PDF → client magic link upload → converts to agreement.*

**Architecture:** `Calculator (defaults + overrides) → PayoutSchedule[] → PDF (grammar wrapper) → email + magic link → signed upload → Convert to Agreement`

| Item | Notes |
|---|---|
| **Comprehensive interest calculator** | Standalone tool at `/calculator`. Auto-populates sensible defaults (quarterly, simple interest, common lock-in). ROI suggestion based on principal — learned from uploaded docs over time (future); hardcode a starter tier table for now. **Fixed payout day option**: first period pro-rata from start date to first occurrence of chosen day, then full periods always on that day. All inputs overridable. Live output: full payout schedule table (period, days, gross, TDS 10%, net, running total). Extend `src/lib/payout-calculator.ts` with optional `fixedPayoutDay?: number`. |
| **Offer letter PDF** | `@react-pdf/renderer`. Pure grammar wrapper around calculator output — no editable content, just formatted presentation. Sections: Good Earth letterhead, investor details, terms (principal, ROI, frequency, dates), full payout schedule table. Modular section components so layout can be adjusted without rewriting. |
| **Send offer letter to client** | "Send Offer Letter" button on calculator/agreement page. Generates PDF, attaches to Resend email. Creates unique upload token (UUID, 30-day expiry) on `agreements`. Magic link in email body. Updates `doc_status: sent_to_client`. Migration `017_upload_token.sql`. |
| **Client magic link upload** | Public route `/upload/[token]` — no auth. Validates token + expiry. Client uploads signed PDF → Supabase Storage → `doc_status: uploaded` → coordinator notification email. |
| **Approved offer letter → Agreement** | "Convert to Agreement" button appears once signed offer letter is uploaded. Pre-fills the New Agreement form with all calculator data (principal, ROI, schedule, dates). Coordinator reviews, confirms → agreement record created with payout schedule imported. Signed offer letter stored for reference. |
| **Agreement signing (client)** | After agreement is created and Good Earth signs (`doc_status: partner_signed`), "Send Agreement to Client" button generates a new magic link (separate upload token) and emails the agreement PDF. Client signs, uploads via magic link → `doc_status: uploaded`. Reuses the same `/upload/[token]` route — token carries context (offer_letter vs agreement) so it handles both. Coordinator notified on upload. |

---

### 🟡 Batch E — UI Design Pass (branch: `feature/batch-e-design`)
*Do this last — after all core flows work. Use claude.ai/design for mockups first.*

| Item | Notes |
|---|---|
| **Dashboard segmentation** | Split into Upcoming Payouts / Portfolio Health / Compliance Checklist. Design mockup first. |
| **Changelog / What's new modal** | Show on first load after version bump using localStorage. |
| **Full UI polish** | Apply design pass across all pages based on mockups. Typography, spacing, colour consistency. |

---

### 🔧 Ops / Config

| Item | Notes |
|---|---|
| **Vercel production branch → main** | Change Vercel project production branch from `feature/investment-tracker` to `main` so releases don't need the workaround push. Settings → Git → Production Branch. Once done, remove `git push origin main:feature/investment-tracker` from AGENTS.md and PROMPTS.md. |

---

### ⚫ Future

| Item | Notes |
|---|---|
| **E-sign integration** | Replace physical signing step with third-party e-sign (Dropbox Sign / DocuSign). Magic link flow, webhook to auto-update `doc_status`. Build after Batch D is stable. |
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
