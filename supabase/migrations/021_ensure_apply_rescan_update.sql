-- 021: Ensure apply_rescan_update function exists on remote
-- This migration re-creates the function in case it was dropped or never applied

CREATE OR REPLACE FUNCTION apply_rescan_update(
  p_agreement_id UUID,
  p_agreement_data JSONB,
  p_payout_rows JSONB
) RETURNS VOID AS $$
DECLARE
  v_maturity_date DATE;
  v_status TEXT;
BEGIN
  v_maturity_date := (p_agreement_data->>'maturity_date')::DATE;
  
  SELECT status INTO v_status FROM agreements WHERE id = p_agreement_id;
  
  IF v_status = 'active' AND v_maturity_date < CURRENT_DATE THEN
    v_status := 'matured';
  END IF;

  CREATE TEMP TABLE existing_payout_statuses AS
  SELECT period_from, period_to, is_tds_only, status, tds_filed
  FROM payout_schedule
  WHERE agreement_id = p_agreement_id;

  UPDATE agreements
  SET
    agreement_date = (p_agreement_data->>'agreement_date')::DATE,
    investment_start_date = (p_agreement_data->>'investment_start_date')::DATE,
    agreement_type = p_agreement_data->>'agreement_type',
    investor_name = p_agreement_data->>'investor_name',
    investor_pan = p_agreement_data->>'investor_pan',
    investor_aadhaar = p_agreement_data->>'investor_aadhaar',
    investor_address = p_agreement_data->>'investor_address',
    tds_filing_name = p_agreement_data->>'tds_filing_name',
    nominees = COALESCE(p_agreement_data->'nominees', '[]'::JSONB),
    principal_amount = (p_agreement_data->>'principal_amount')::NUMERIC,
    roi_percentage = (p_agreement_data->>'roi_percentage')::NUMERIC,
    payout_frequency = p_agreement_data->>'payout_frequency',
    interest_type = p_agreement_data->>'interest_type',
    lock_in_years = (p_agreement_data->>'lock_in_years')::INTEGER,
    maturity_date = v_maturity_date,
    status = v_status,
    payments = COALESCE(p_agreement_data->'payments', '[]'::JSONB),
    rescan_required = FALSE,
    updated_at = NOW()
  WHERE id = p_agreement_id;

  DELETE FROM payout_schedule WHERE agreement_id = p_agreement_id;

  INSERT INTO payout_schedule (
    agreement_id,
    period_from,
    period_to,
    no_of_days,
    due_by,
    gross_interest,
    tds_amount,
    net_interest,
    is_principal_repayment,
    is_tds_only,
    tds_filed,
    status
  )
  SELECT
    p_agreement_id,
    (row->>'period_from')::DATE,
    (row->>'period_to')::DATE,
    (row->>'no_of_days')::INTEGER,
    (row->>'due_by')::DATE,
    (row->>'gross_interest')::NUMERIC,
    (row->>'tds_amount')::NUMERIC,
    (row->>'net_interest')::NUMERIC,
    COALESCE((row->>'is_principal_repayment')::BOOLEAN, FALSE),
    COALESCE((row->>'is_tds_only')::BOOLEAN, FALSE),
    COALESCE(
      (SELECT tds_filed FROM existing_payout_statuses 
       WHERE period_from = (row->>'period_from')::DATE 
         AND period_to = (row->>'period_to')::DATE 
         AND is_tds_only = COALESCE((row->>'is_tds_only')::BOOLEAN, FALSE)
       LIMIT 1),
      COALESCE((row->>'tds_filed')::BOOLEAN, FALSE)
    ),
    COALESCE(
      (SELECT status FROM existing_payout_statuses 
       WHERE period_from = (row->>'period_from')::DATE 
         AND period_to = (row->>'period_to')::DATE 
         AND is_tds_only = COALESCE((row->>'is_tds_only')::BOOLEAN, FALSE)
       LIMIT 1),
       COALESCE((row->>'status'), 'pending')
    )
  FROM jsonb_array_elements(p_payout_rows) AS row;

  DROP TABLE existing_payout_statuses;
END;
$$ LANGUAGE plpgsql;
