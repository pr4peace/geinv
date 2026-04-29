## Backlog — Release Batches

Each batch = one branch + one release. Gemini works through all items in a batch before releasing.

---

## Version Milestones

| Version | Batch | What it means |
|---|---|---|
| **V1** | After Batch C | Core investment tracking — agreements, payouts, calendar, reminders, RBAC. Team can use it daily. |
| **V2** | After Batch D | Full agreement lifecycle — calculator, offer letter, client signing, digital agreement creation through the system. |

---

### 🩹 Batch C.2 — Post-Launch Hotfixes (branch: `feature/batch-c2-hotfixes`)
*Fixes from first real upload session. Applied urgently — some already on main.*

| Item | Status | Notes |
|---|---|---|
| **Gemini model → gemini-2.5-flash** | ✅ main | Old model retired |
| **maxOutputTokens 65536 + JSON mode** | ✅ main | Fixes JSON truncation on large agreements |
| **investment_start_date prompt fix** | ✅ main | Body paragraph priority over payment table |
| **Biannual/compound extraction mapping** | ✅ main | bi-annual/half-yearly → biannual; compounded → cumulative |
| **Biannual + monthly in dropdown** | ✅ main | ExtractionReview form was missing these options |
| **Agreements list refresh after upload** | ✅ main | router.refresh() before push |
| **Cancel button during extraction** | ✅ main | AbortController on in-flight fetch |
| **"Add another agreement" post-upload** | ✅ main | Button on detail page after new upload |
| **Overdue filter fix** | ✅ main | due_by < today instead of period_to < monthStart |
| **Maturity reminder catch-up** | ✅ main | Immediate reminder if all lead-day dates are past |
| **Mark past payouts as paid on import** | ✅ main | Checkbox in ExtractionReview + API |
| **TDS rows on 31st March (cumulative/compound)** | 🔲 todo | One row per 31 Mar in term, is_tds_only |
| **Re-scan without re-upload** | 🔲 todo | Button on detail page, re-runs Gemini from stored doc |
| **Per-agreement mark-past-paid + row revert** | 🔲 todo | Bulk button with confirm + per-row undo |
| **Splash screen "What's New"** | 🔲 todo | Max 3 views per user, localStorage count |

---

### 🩹 Batch C.1 — Extraction Fixes + Post-V1 Patch (branch: `feature/batch-c1-patch`)
*Quick patch after V1. No migrations, no new features.*

| Item | Notes |
|---|---|
| **Gemini extraction fixes** | `src/lib/claude.ts`: add `monthly`/`biannual` to frequency type + prompt rules, fix `investment_start_date` prompt, add `maxOutputTokens: 8192`, better truncation error, add frequency validation. |
| **Sign out button** | Add to sidebar in `src/app/(app)/layout.tsx`. Call `supabase.auth.signOut()` then redirect to `/login`. |
| **Sidebar collapse toggle — Apple style** | Move toggle to header bar (logo row), remove verbose bottom button. Done. |
| **Dashboard layout fix** | Remove `max-w-3xl mx-auto` + `min-h-screen` — content was centering in the middle. Done. |
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
| **PDF pre-processing for extraction accuracy** | Before sending to Gemini, convert each PDF page to a high-contrast B&W image (grayscale + contrast boost + sharpen) using `sharp` + `pdf2pic` or `pdfjs-dist`. Eliminates grey backgrounds, light ink, and scan artifacts that cause Gemini to misread numbers. Particularly important for payout schedule tables. Implement in `src/lib/claude.ts` as a pre-processing step before the Gemini API call. |
| **Versioning system rework** | Full rework of `src/lib/version.ts` + `src/components/WhatsNewModal.tsx` — current implementation needs review. Ensure version bump, localStorage tracking (max 3 views), and modal display all work correctly end-to-end. |
| **Quick Send — extended timeframes** | Add `Quarter (90 days)`, `6 months (180 days)`, `1 year (365 days)` to the timeframe dropdown in `QuickSendPanel`. Simple change to `TIMEFRAME_OPTIONS` array in `src/components/notifications/QuickSendPanel.tsx`. |
| **E-sign integration** | Replace physical signing step with third-party e-sign (Dropbox Sign / DocuSign). Magic link flow, webhook to auto-update `doc_status`. Build after Batch D is stable. |
| **Slack integration** | Automated notifications. External dependency. |
| **Custom domain** | Move off Vercel subdomain to a proper domain. |
| **FAQ / About the tool** | Internal page explaining the tool, how to use it, investment agreement glossary for the team. |
| **Personal dashboards** | Role-scoped dashboard views — coordinator sees everything, salesperson sees only their agreements. Design-first. |
| **Backfill TDS rows (Settings)** | Button in Settings to insert missing 31 Mar TDS rows for cumulative/compound agreements uploaded before the fix. API: POST /api/admin/backfill-tds-rows. |

---

### ✅ Done

| **Batch C.5 — UI polish + bug fixes** | Remove `updated_at` DB errors, inline confirmations in PayoutSchedule, salesperson scoping for investors search. |
| **Batch C.4 — Salesperson RBAC Fixes** | Security: block quarterly tools for salespersons, scope calendar to assigned agreements, add cancel button to extraction flow. |
| **Batch C.3 — Small hotfixes** | TDS-only rows for cumulative, Document Re-scanning, Bulk-mark payouts as paid, "What's New" modal, test fixes for overdue filter. |
| **Batch C.1 — Extraction Fixes + Post-V1 Patch** | Gemini extraction fixes (monthly/biannual, prompt tuning), Sign out button, Apple-style sidebar toggle, Full-width dashboard layout. |
| **Pre-Launch Finalisation** | Codex final review, security fixes (role gates, salesperson scoping, atomic reminders), data wipe, Vercel → main, GitHub default branch → main, stale branches deleted. |
| **Batch C.1 — Extraction Fixes + Post-V1 Patch** | Gemini extraction fixes (monthly/biannual, maxOutputTokens, validation), sign-out button, Apple-style sidebar toggle, dashboard full-width layout fix. |
| **Batch C — Agreement Data & Polish (V1)** | Migrations 015+016, multiple payments, cumulative TDS-only, splash screen, v0.1.0, collapsible sidebar, global search, sortable investors, salesperson scoping fixes. |
| **Batch B — Calendar & Reminders** | Fixed phantom payouts, rebuilt calendar with react-big-calendar, fixed reminder lead times, added Monday cron. |
| **Batch A — Auth & Access** | Google Login, Middleware RBAC with header propagation, API-level access control. |
| Remove E2E tests | E2E tests removed; relying on Vitest unit tests. |
| Sidebar collapse/expand | Merged to main |
| Digital agreement flow | Manual form + live payout calculator |
| Document URL expiry fix | Permanent storage path + 1-year signed URL |
| Doc lifecycle auto-advance | Scanned signed uploads → `doc_status: 'uploaded'` |
| Investor delete safety | `DELETE /api/investors/[id]` with agreement guard + UI |
