-- 016_tds_only_payout.sql
-- Track TDS filing obligations on payout_schedule rows

ALTER TABLE payout_schedule
  ADD COLUMN is_tds_only boolean NOT NULL DEFAULT false,
  ADD COLUMN tds_filed boolean NOT NULL DEFAULT false;
