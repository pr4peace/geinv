-- 012: Make reminders.agreement_id nullable to support global reminders (monthly summary, quarterly forecast)
ALTER TABLE reminders
  ALTER COLUMN agreement_id DROP NOT NULL;
