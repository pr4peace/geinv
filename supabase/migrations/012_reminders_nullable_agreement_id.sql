-- 012: Make agreement_id nullable on reminders to support non-agreement reminders
-- (e.g. payout_monthly_summary, quarterly_forecast)

ALTER TABLE reminders ALTER COLUMN agreement_id DROP NOT NULL;
