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
