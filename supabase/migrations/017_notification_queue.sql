-- supabase/migrations/017_notification_queue.sql

create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references agreements(id) on delete cascade,
  payout_schedule_id uuid references payout_schedule(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'payout', 'maturity', 'tds_filing', 'doc_return', 'monthly_summary', 'quarterly_forecast'
  )),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dismissed')),
  recipients jsonb not null default '{}',
  suggested_subject text,
  suggested_body text,
  sent_at timestamptz,
  sent_by uuid references team_members(id),
  created_at timestamptz not null default now()
);

-- For agreement-specific items: prevent duplicate pending rows per payout/agreement/type/date
create unique index notification_queue_agreement_unique
  on notification_queue(agreement_id, coalesce(payout_schedule_id, '00000000-0000-0000-0000-000000000000'::uuid), notification_type, due_date)
  where status = 'pending' and agreement_id is not null;

-- For summary/forecast items (no agreement): prevent duplicate pending rows per type/date
create unique index notification_queue_summary_unique
  on notification_queue(notification_type, due_date)
  where status = 'pending' and agreement_id is null;

create index notification_queue_status_date on notification_queue(status, due_date);
create index notification_queue_agreement on notification_queue(agreement_id);
