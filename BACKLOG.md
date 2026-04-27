## Backlog — Release Batches

Each batch = one branch + one release. Gemini works through all items in a batch before releasing.

---

## Version Milestones

| Version | Batch | What it means |
|---|---|---|
| **V1** | After Batch C | Core investment tracking — agreements, payouts, calendar, reminders, RBAC. Team can use it daily. |
| **V2** | After Batch D | Full agreement lifecycle — calculator, offer letter, client signing, digital agreement creation through the system. |

---

### 🩹 Batch C.1 — Extraction Fixes + Post-V1 Patch (branch: `feature/batch-c1-patch`)
*Quick patch after V1. No migrations, no new features.*

| Item | Notes |
|---|---|
| **Gemini extraction fixes** | `src/lib/claude.ts`: add `monthly`/`biannual` to frequency type + prompt rules, fix `investment_start_date` prompt, add `maxOutputTokens: 8192`, better truncation error, add frequency validation. |
| **Post-V1 bugs** | Any issues surfaced from real team usage after V1 ships. Tracked here as they come in. |

---

### 🟠 Batch D — Offer Letter Flow · **V2 Release** (branch: `feature/batch-d-offer-letter`)
*Comprehensive interest calculator → offer letter PDF → client magic link upload → converts to agreement.*

**Architecture:** `Calculator (defaults + overrides) → PayoutSchedule[] → PDF (grammar wrapper) → email + magic link → signed upload → Convert to Agreement → Agreement signing`

| Item | Notes |
|---|---|
| **Comprehensive interest calculator** | Standalone tool at `/calculator`. Auto-populates sensible defaults. ROI suggestion based on principal (starter tier table, overridable). **Fixed payout day option**: first period pro-rata, then full periods always on chosen day. All inputs overridable. Live output: full payout schedule (period, days, gross, TDS 10%, net, running total). Extend `src/lib/payout-calculator.ts` with optional `fixedPayoutDay?: number`. |
| **Offer letter PDF** | `@react-pdf/renderer`. Grammar wrapper around calculator output. Sections: Good Earth letterhead, investor details, terms, full payout schedule table. Modular section components. |
| **Send offer letter to client** | "Send Offer Letter" button. Generates PDF, attaches to Resend email. Creates unique upload token (UUID, 30-day expiry) on `agreements`. Magic link in email. Updates `doc_status: sent_to_client`. Migration `017_upload_token.sql`. |
| **Client magic link upload (offer letter)** | Public route `/upload/[token]` — no auth. Validates token + expiry. Client uploads signed offer letter → Supabase Storage → coordinator notification. |
| **Approved offer letter → Agreement** | "Convert to Agreement" button once signed offer letter uploaded. Pre-fills New Agreement form with calculator data. Coordinator confirms → agreement created with payout schedule imported. |
| **Agreement signing (client)** | After `doc_status: partner_signed`, "Send Agreement to Client" generates new magic link. Client signs + uploads → `doc_status: uploaded`. Reuses `/upload/[token]` route with type context. |

---

### 🟠 Batch F — Notification Revamp (branch: `feature/batch-f-notifications`)
*Three-layer model: auto-fire red flags only → coordinator staging report → keep existing weekly/monthly summaries.*

| Item | Notes |
|---|---|
| **Tighten auto-fire to red flags only** | Cron only auto-sends: payout overdue, maturity <14 days, doc not returned >30 days. Remove day-of + 7-day advance payout auto-reminders. Update `src/lib/reminders.ts` + `src/app/api/reminders/process/route.ts`. |
| **Notification report page** | New `/notifications` page. Three sections: 🔴 Red Flags (auto-sent, read-only), 🟡 Action Queue (upcoming payouts/maturities/docs, checkboxes), 📋 History (last 30 days). Filter by type/salesperson/date. |
| **Notify selected / Notify all** | `POST /api/notifications/send` — takes selected item IDs + type, sends one batched email per category, logs to reminders table. Idempotency warning if notified in last 7 days. |
| **Notification nav item** | Add "Notifications" to sidebar in `layout.tsx`. |
| **Automated summaries untouched** | Weekly Monday + monthly 1st + quarterly forecast crons stay exactly as-is. |

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
| **Vercel production branch → main** | Change Vercel project production branch from `feature/investment-tracker` to `main`. Settings → Git → Production Branch. Once done, remove `git push origin main:feature/investment-tracker` from AGENTS.md and PROMPTS.md. |

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
| **Batch C — Agreement Data & Polish (V1)** | Migrations 015+016, multiple payments, cumulative TDS-only, splash screen, v0.1.0, collapsible sidebar, global search, sortable investors, salesperson scoping fixes. |
| **Batch B — Calendar & Reminders** | Fixed phantom payouts, rebuilt calendar with react-big-calendar, fixed reminder lead times, added Monday cron. |
| **Batch A — Auth & Access** | Google Login, Middleware RBAC with header propagation, API-level access control. |
| Remove E2E tests | E2E tests removed; relying on Vitest unit tests. |
| Sidebar collapse/expand | Merged to main |
| Digital agreement flow | Manual form + live payout calculator |
| Document URL expiry fix | Permanent storage path + 1-year signed URL |
| Doc lifecycle auto-advance | Scanned signed uploads → `doc_status: 'uploaded'` |
| Investor delete safety | `DELETE /api/investors/[id]` with agreement guard + UI |
