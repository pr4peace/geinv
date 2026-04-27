-- Add 'admin' to the team_members role check constraint
alter table team_members drop constraint if exists team_members_role_check;
alter table team_members add constraint team_members_role_check
  check (role in ('coordinator', 'accountant', 'financial_analyst', 'salesperson', 'admin'));

-- Update Byju's role to salesperson
update team_members set role = 'salesperson' where email = 'byju@goodearth.org.in';
