create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role text not null check (role in ('coordinator', 'accountant', 'financial_analyst', 'salesperson', 'admin')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Seed initial team
insert into team_members (name, email, role) values
  ('Admin Master', 'admin@goodearth.org.in', 'admin'),
  ('Irene Mariam', 'irene.mariam@goodearth.org.in', 'coordinator'),
  ('Valli Sivakumar', 'valli.sivakumar@goodearth.org.in', 'accountant'),
  ('Liya Mathew', 'liya.mathew@goodearth.org.in', 'financial_analyst'),
  ('Prashanth Palanisamy', 'prashanth.palanisamy@goodearth.org.in', 'coordinator'),
  ('Byju', 'byju@goodearth.org.in', 'salesperson'),
  ('Byjoo', 'byjoo@goodearth.org.in', 'salesperson'),
  ('Preetha Shankar', 'preetha.shankar@goodearth.org.in', 'salesperson'),
  ('George Mathew', 'george.mathew@goodearth.org.in', 'salesperson'),
  ('Ajay Chandrashekar', 'ajay.chandrashekar@goodearth.org.in', 'salesperson')
on conflict (email) do nothing;
