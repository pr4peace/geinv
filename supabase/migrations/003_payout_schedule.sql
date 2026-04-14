create table if not exists payout_schedule (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references agreements(id) on delete cascade,
  period_from date not null,
  period_to date not null,
  no_of_days integer,
  due_by date not null,
  gross_interest numeric not null,
  tds_amount numeric not null,
  net_interest numeric not null,
  is_principal_repayment boolean default false,
  status text default 'pending' check (status in ('pending', 'notified', 'paid', 'overdue')),
  paid_date date,
  created_at timestamptz default now()
);

create index idx_payout_schedule_agreement_id on payout_schedule(agreement_id);
create index idx_payout_schedule_due_by on payout_schedule(due_by);
create index idx_payout_schedule_status on payout_schedule(status);
