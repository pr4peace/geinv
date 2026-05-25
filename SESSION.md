# SESSION

## Branch
- feature/batch-f-notifications

## Phase
- releasing

## Active Batch
- Batch F — Notification Revamp (2026-05-25)

---

## Work Completed
- **Batch F — Notification Revamp:**
  - DB Migration: added `batch_notification` to `reminders` type check constraint.
  - API: implemented `POST /api/notifications/send` for manual batched emails.
  - UI: rebuilt `/notifications` with two tabs (Queue/History), 60-day window, and checkboxes.
  - Cleanup: removed outdated auto-reminder logic and tests.
  - Type Safety: resolved all ESLint errors and added proper types for Supabase responses.
- **Codex Review Fixes:**
  - Migration 024: recreated `reminders` table to fix drop/alter conflict and ensure availability.
  - Security: hardened `POST /api/notifications/send` to allow only `coordinator` and `admin` roles.
  - RBAC: added `/notifications` to restricted routes in middleware to block salespersons.
  - Validation: tightened API input validation and added status/deleted_at checks during item fetch.
  - Formatting: cleaned up trailing whitespace and extra blank lines across 3 files.

## Files Changed
- `supabase/migrations/024_batch_notification_reminder_type.sql`
- `src/app/api/notifications/send/route.ts`
- `src/middleware.ts`
- `docs/superpowers/specs/2026-05-25-batch-f-notifications-design.md`
- `src/__tests__/notifications-send.test.ts`
- `src/lib/email.ts`
- `SESSION.md`

## Pending (Batch G — Next)
- [ ] User to verify manual batch notify workflow on real data
- [ ] Refine email templates based on feedback

## Key Decisions
- All coordinator batch emails are manual-only; no cron schedule
- Auto emails are OFF — no vercel.json, no cron jobs
- History tab reads `reminders` table filtered by `reminder_type='batch_notification'`
- One `reminders` row per selected item (not one per batch) for reliable idempotency
- `sendQuarterlyForecast` in `email.ts` left untouched (governs future Batch F cron items)
- `/api/cron/monthly-summary` stays in place but is removed from the UI

## Codex Review Notes
- **blocking** — `supabase/migrations/024_batch_notification_reminder_type.sql:1-7` assumes `reminders` exists, but the immediately prior `023_debloat_cleanup.sql` drops it. A fresh migration run will fail at `ALTER TABLE reminders`, and even if skipped the app now depends on this table for history/idempotency. Replace the entire file with:
```sql
-- 024_batch_notification_reminder_type.sql
CREATE TABLE IF NOT EXISTS reminders (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references agreements(id) on delete cascade,
  payout_schedule_id uuid references payout_schedule(id) on delete cascade,
  reminder_type text not null,
  lead_days integer,
  scheduled_at timestamptz not null,
  status text default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  email_to text[] not null default '{}',
  email_subject text,
  email_body text,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_agreement_id on reminders(agreement_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled_at on reminders(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reminders_status on reminders(status);

ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_reminder_type_check;
ALTER TABLE reminders ADD CONSTRAINT reminders_reminder_type_check
  CHECK (reminder_type IN (
    'payout', 'maturity', 'doc_return', 'quarterly_forecast', 'payout_monthly_summary',
    'batch_notification'
  ));
```

- **blocking** — `src/app/api/notifications/send/route.ts:9-12` only blocks salespersons. Because this route uses the admin client and sends accountant emails, any active non-salesperson team member can manually trigger batch sends. Replace lines 9-12 with:
```ts
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
```

- **blocking** — `src/middleware.ts:80-84` does not restrict `/notifications`, so salespersons can open the server-rendered page and see all pending payouts, TDS filings, maturities, and sent history fetched through `createAdminClient()`. Replace lines 80-84 with:
```ts
      const restrictedRoutes = [
        '/settings',
        '/agreements/new',
        '/agreements/import',
        '/notifications',
      ]
```

- **blocking** — `src/app/api/notifications/send/route.ts:14-63` trusts the client-supplied `type` and `ids`. An invalid `type` falls into the maturity branch, payout/TDS requests are not constrained to pending rows or the matching `is_tds_only` category, and partial matches still send email while logging all requested IDs. Replace lines 14-63 with:
```ts
    const body = await request.json()
    const { type: rawType, ids: rawIds } = body as { type?: unknown; ids?: unknown }
    const allowedTypes = new Set(['payouts', 'maturities', 'tds'])

    if (typeof rawType !== 'string' || !allowedTypes.has(rawType)) {
      return NextResponse.json({ error: 'type must be payouts, maturities, or tds' }, { status: 400 })
    }
    if (
      !Array.isArray(rawIds) ||
      rawIds.length === 0 ||
      rawIds.some((id) => typeof id !== 'string' || id.length === 0)
    ) {
      return NextResponse.json({ error: 'ids must be a non-empty string array' }, { status: 400 })
    }

    const type = rawType as 'payouts' | 'maturities' | 'tds'
    const ids = Array.from(new Set(rawIds))

    const supabase = createAdminClient()

    // 1. Fetch items
    let items: BatchNotificationItem[] = []
    let payoutScheduleIds: string[] = []
    let agreementIds: string[] = []

    if (type === 'payouts' || type === 'tds') {
      const { data, error } = await supabase
        .from('payout_schedule')
        .select('id, due_by, gross_interest, tds_amount, net_interest, is_tds_only, agreement:agreements!inner(investor_name, reference_id, status, deleted_at)')
        .eq('status', 'pending')
        .eq('is_tds_only', type === 'tds')
        .eq('agreements.status', 'active')
        .is('agreements.deleted_at', null)
        .in('id', ids)
      if (error) throw error
      payoutScheduleIds = ids
      items = (data ?? []).map((p) => {
        const agreement = p.agreement as unknown as { investor_name: string; reference_id: string }
        return {
          investor_name: agreement.investor_name,
          reference_id: agreement.reference_id,
          due_by: p.due_by,
          gross_interest: p.gross_interest,
          tds_amount: p.tds_amount,
          net_interest: p.net_interest,
        }
      })
    } else {
      const { data, error } = await supabase
        .from('agreements')
        .select('id, investor_name, reference_id, maturity_date, principal_amount')
        .eq('status', 'active')
        .is('deleted_at', null)
        .in('id', ids)
      if (error) throw error
      agreementIds = ids
      items = (data ?? []).map((a) => ({
        investor_name: a.investor_name,
        reference_id: a.reference_id,
        maturity_date: a.maturity_date,
        principal_amount: a.principal_amount,
      }))
    }

    if (items.length !== ids.length) {
      return NextResponse.json({ error: 'Some selected items were not found or are no longer pending' }, { status: 400 })
    }
```

- **minor** — `git diff --check origin/main...HEAD` currently fails on whitespace in `docs/superpowers/specs/2026-05-25-batch-f-notifications-design.md:3-4,38`, `src/__tests__/notifications-send.test.ts:68,73`, and an extra blank line at `src/lib/email.ts:222`. Remove the trailing spaces/extra final blank line so the patch is clean before release.

## Next Agent Action
- Codex
