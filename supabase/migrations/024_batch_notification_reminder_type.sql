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
