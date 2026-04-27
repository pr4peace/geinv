# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server on localhost:3000
npm run build        # production build (must pass before any merge)
npm run lint         # ESLint
npm test             # vitest unit tests (node environment, no browser)
npm run test:watch   # vitest in watch mode

# Run a single unit test file
npx vitest run src/__tests__/dashboard-reminders.test.ts

# DB scripts (require real Supabase env vars)
npm run migrate      # run migration scripts via tsx
npm run check-db     # verify DB connectivity
```

## Architecture

**Stack:** Next.js 14 App Router · Supabase (Postgres + Storage + Auth) · Tailwind CSS · Resend (email) · Vercel (hosting + cron)

### Route layout

```
src/app/
  (app)/          # authenticated shell — layout.tsx renders sidebar + nav
    dashboard/    # reminder overview + send summary button
    agreements/   # list, [id] detail, new (upload or manual), import
    investors/    # list, [id] detail with notes/merge
    calendar/     # payout calendar view
    quarterly-review/  # TDS/fund reconciliation workflow
    quarterly-reports/ # downloadable reports
    settings/     # team member management
  api/            # all route handlers — use createAdminClient(), never the SSR client
  login/          # public
  auth/callback/  # Supabase OAuth callback
```

### Two Supabase clients — never mix them

- `src/lib/supabase/admin.ts` — service role key, bypasses RLS. Used by **all API routes** and server-side data fetches in page components.
- `src/lib/supabase/server.ts` — anon key + cookie-based session. Used by **middleware only** for auth checks.

The middleware (`src/middleware.ts`) redirects unauthenticated requests to `/login`. All protected pages live under `(app)/`.

### Agreement creation: two paths

`/agreements/new` offers a choice screen:
1. **Upload PDF/DOCX** → `POST /api/extract` → Gemini reads the document and returns structured `ExtractedAgreement` → `ExtractionReview` form (pre-filled, editable) → `POST /api/agreements`
2. **Create manually** → `ManualAgreementForm` (blank form, live payout calculator) → `POST /api/agreements`

`POST /api/agreements` handles both paths: inserts the agreement, inserts `payout_schedule` rows, auto-generates `reminders` rows (payout, maturity, doc-return), and upserts an `investors` profile.

### AI extraction — naming mismatch

`src/lib/claude.ts` is **misnamed** — it uses **Google Gemini** (`@google/generative-ai`), not Anthropic Claude. It extracts structured agreement data (all fields + payout schedule table) from PDF/DOCX files. The `ANTHROPIC_API_KEY` env var is defined but not currently used in production code.

### Payout schedule calculation

`src/lib/payout-calculator.ts` — pure function, no I/O. Takes `{ principal, roiPercentage, payoutFrequency, interestType, startDate, maturityDate }` and returns `PayoutRow[]`. TDS is always 10% of gross. Used by `ManualAgreementForm` (live preview) and the historical import flow. Supports: `quarterly`, `annual`, `monthly`, `biannual`, `cumulative`/`compound` (single maturity payout).

### Reminder pipeline

1. `reminders` table holds all scheduled emails (status: `pending → sent/failed`)
2. Vercel cron calls `GET /api/reminders/process` daily at 02:00 UTC with header `x-vercel-cron: 1`
3. The route: sends pending reminders, escalates overdue payouts, sends quarterly forecast on quarter-start, sends monthly payout summary on the 1st
4. `POST /api/reminders/summary` sends an on-demand HTML summary email to accountants — the button on the Dashboard calls this

### Email

`src/lib/email.ts` wraps Resend. If `RESEND_API_KEY` is missing or the placeholder value, it **stubs silently** (logs to console, returns `success: true`). Safe to run locally without email credentials.

### Data model (key tables)

| Table | Purpose |
|---|---|
| `agreements` | Core investment records. `doc_status` tracks physical document lifecycle. `reference_id` format: `GE-{year}-{seq}`. |
| `payout_schedule` | Interest payout rows per agreement. Status: `pending → notified → paid` (or `overdue`). |
| `reminders` | Scheduled + sent emails. `agreement_id` and `payout_schedule_id` are nullable. |
| `team_members` | Roles: `coordinator`, `accountant`, `financial_analyst`, `salesperson`. |
| `investors` | Deduplicated investor profiles. Linked from agreements via `investor_id`. |
| `quarterly_reviews` | TDS and fund reconciliation records per quarter. |

### Reference ID generation

`src/lib/reference-id.ts` uses `COUNT(*)+1` — not concurrency-safe, acceptable for this single-user internal tool. A Postgres sequence is the planned replacement before multi-user rollout.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY              # for PDF/DOCX extraction (src/lib/claude.ts)
RESEND_API_KEY              # email — stubbed if missing
RESEND_FROM_EMAIL           # sender address
RESEND_BCC_EMAILS           # comma-separated, added to all outbound emails
NEXT_PUBLIC_APP_URL         # used in email link generation
INTERNAL_USER_EMAIL         # receives escalation alerts
CRON_SECRET                 # Bearer token for manually triggering POST /api/reminders/process
```

## Multi-agent development workflow

This repo uses a three-agent system documented in `AGENTS.md`:
- **Claude Code** — plans tasks, creates branches, updates `SESSION.md`
- **Gemini CLI** — implements code following `SESSION.md`
- **Codex** — reviews diffs, writes to `Codex Review Notes` in `SESSION.md`

`SESSION.md` is the live state of the current task. `BACKLOG.md` is the task queue. `PROMPTS.md` has copy-paste prompts for each agent. All four session files must be committed and pushed at the end of every session to keep devices in sync.
