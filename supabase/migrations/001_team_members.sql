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
