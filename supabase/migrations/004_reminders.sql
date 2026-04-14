create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references agreements(id) on delete cascade,
  payout_schedule_id uuid references payout_schedule(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('payout', 'maturity', 'doc_return', 'quarterly_forecast')),
  lead_days integer,
  scheduled_at timestamptz not null,
  status text default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  email_to text[] not null default '{}',
  email_subject text,
  email_body text,
  created_at timestamptz default now()
);

create index idx_reminders_agreement_id on reminders(agreement_id);
create index idx_reminders_scheduled_at on reminders(scheduled_at);
create index idx_reminders_status on reminders(status);
