-- 011: Feedback Apr 2026 — TDS filing name, investor bank details, monthly summary reminder type

-- 1. Add TDS filing name to agreements
ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS tds_filing_name text;

-- 2. Add payout bank details to investors table
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS payout_bank_name text,
  ADD COLUMN IF NOT EXISTS payout_bank_account text,
  ADD COLUMN IF NOT EXISTS payout_bank_ifsc text;

-- 3. Add payout_monthly_summary to reminder_type constraint
ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_reminder_type_check;
ALTER TABLE reminders ADD CONSTRAINT reminders_reminder_type_check
  CHECK (reminder_type IN (
    'payout', 'maturity', 'doc_return', 'quarterly_forecast', 'payout_monthly_summary'
  ));
