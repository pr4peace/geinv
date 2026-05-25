-- 024_batch_notification_reminder_type.sql
ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_reminder_type_check;
ALTER TABLE reminders ADD CONSTRAINT reminders_reminder_type_check
  CHECK (reminder_type IN (
    'payout', 'maturity', 'doc_return', 'quarterly_forecast', 'payout_monthly_summary',
    'batch_notification'
  ));
