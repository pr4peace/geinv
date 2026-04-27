-- 015_multiple_payments.sql
-- Replace flat payment_date/mode/bank with payments jsonb[]

ALTER TABLE agreements
  ADD COLUMN payments jsonb[] NOT NULL DEFAULT '{}';

-- Migrate existing single-payment data into array format
-- Use null for amount since historical records don't separate payment amount from principal
UPDATE agreements
SET payments = ARRAY[jsonb_build_object(
  'date', payment_date,
  'mode', payment_mode,
  'bank', payment_bank,
  'amount', NULL
)]::jsonb[]
WHERE payment_date IS NOT NULL
   OR payment_mode IS NOT NULL
   OR payment_bank IS NOT NULL;

ALTER TABLE agreements DROP COLUMN IF EXISTS payment_date;
ALTER TABLE agreements DROP COLUMN IF EXISTS payment_mode;
ALTER TABLE agreements DROP COLUMN IF EXISTS payment_bank;
