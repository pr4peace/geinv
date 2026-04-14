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
