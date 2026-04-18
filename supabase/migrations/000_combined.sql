-- ============================================================
-- Good Earth Investment Tracker — Combined Migration
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 001: Team Members
-- ============================================================
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null check (role in ('coordinator', 'accountant', 'financial_analyst', 'salesperson')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Seed initial team
insert into team_members (name, email, role) values
  ('Irene', 'irene@goodearth.com', 'coordinator'),
  ('Valli', 'valli@goodearth.com', 'accountant'),
  ('Liya', 'liya@goodearth.com', 'financial_analyst'),
  ('Preetha', 'preetha@goodearth.com', 'salesperson'),
  ('George', 'george@goodearth.com', 'salesperson'),
  ('Ajay', 'ajay@goodearth.com', 'salesperson'),
  ('Irene (Sales)', 'irene.sales@goodearth.com', 'salesperson')
on conflict (email) do nothing;

-- ============================================================
-- 002: Agreements
-- ============================================================
create table if not exists agreements (
  id uuid primary key default gen_random_uuid(),
  reference_id text unique not null,
  agreement_date date not null,
  investment_start_date date not null,
  agreement_type text default 'Investment Agreement',
  document_url text,
  is_draft boolean default false,
  status text not null default 'active' check (status in ('active', 'matured', 'cancelled')),
  -- Investor details
  investor_name text not null,
  investor_pan text,
  investor_aadhaar text,
  investor_address text,
  investor_relationship text,
  investor_parent_name text,
  nominees jsonb default '[]'::jsonb,
  -- Investment terms
  principal_amount numeric not null,
  roi_percentage numeric not null,
  payout_frequency text not null check (payout_frequency in ('quarterly', 'annual', 'cumulative')),
  interest_type text default 'simple' check (interest_type in ('simple', 'compound')),
  lock_in_years integer not null,
  maturity_date date not null,
  -- Payment info
  payment_date date,
  payment_mode text,
  payment_bank text,
  -- Team assignment
  salesperson_id uuid references team_members(id) on delete set null,
  salesperson_custom text,
  -- Document lifecycle
  doc_status text default 'draft' check (doc_status in ('draft', 'partner_signed', 'sent_to_client', 'returned', 'uploaded')),
  doc_sent_to_client_date date,
  doc_returned_date date,
  doc_return_reminder_days integer default 14,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger agreements_updated_at
  before update on agreements
  for each row execute function update_updated_at_column();

-- Index for common queries
create index idx_agreements_status on agreements(status);
create index idx_agreements_payout_frequency on agreements(payout_frequency);
create index idx_agreements_maturity_date on agreements(maturity_date);
create index idx_agreements_salesperson_id on agreements(salesperson_id);

-- ============================================================
-- 003: Payout Schedule
-- ============================================================
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

-- ============================================================
-- 004: Reminders
-- ============================================================
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references agreements(id) on delete cascade,
  payout_schedule_id uuid references payout_schedule(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('payout', 'maturity', 'doc_return', 'quarterly_forecast', 'payout_monthly_summary')),
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

-- ============================================================
-- 005: Quarterly Reviews
-- ============================================================
create table if not exists quarterly_reviews (
  id uuid primary key default gen_random_uuid(),
  quarter text not null,
  quarter_start date not null,
  quarter_end date not null,
  incoming_funds_doc_url text,
  incoming_funds_status text default 'pending' check (incoming_funds_status in ('pending', 'completed')),
  incoming_funds_result jsonb,
  tds_doc_url text,
  tds_status text default 'pending' check (tds_status in ('pending', 'completed')),
  tds_result jsonb,
  created_at timestamptz default now(),
  unique(quarter)
);

create index idx_quarterly_reviews_quarter on quarterly_reviews(quarter);
