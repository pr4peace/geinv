-- ─────────────────────────────────────────────────────────────────────────────
-- 009: Investor profiles, soft delete, and import schema additions
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Investors table (primary applicant profile)
CREATE TABLE IF NOT EXISTS investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pan text,
  aadhaar text,
  address text,
  birth_year integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investors_pan_idx ON investors (pan) WHERE pan IS NOT NULL;
CREATE INDEX IF NOT EXISTS investors_name_idx ON investors (lower(name));

-- 2. Link agreements to investors (nullable — existing rows get NULL)
ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS investor_id uuid REFERENCES investors(id) ON DELETE SET NULL;

-- 3. Soft delete
ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 4. Import fields — investor birth year and second applicant
ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS investor_birth_year integer,
  ADD COLUMN IF NOT EXISTS investor2_name text,
  ADD COLUMN IF NOT EXISTS investor2_pan text,
  ADD COLUMN IF NOT EXISTS investor2_aadhaar text,
  ADD COLUMN IF NOT EXISTS investor2_address text,
  ADD COLUMN IF NOT EXISTS investor2_birth_year integer;

-- 5. Expand status to include 'combined'
ALTER TABLE agreements DROP CONSTRAINT IF EXISTS agreements_status_check;
ALTER TABLE agreements ADD CONSTRAINT agreements_status_check
  CHECK (status IN ('active', 'matured', 'cancelled', 'combined'));

-- 6. Expand payout_frequency to include 'monthly' and 'biannual'
ALTER TABLE agreements DROP CONSTRAINT IF EXISTS agreements_payout_frequency_check;
ALTER TABLE agreements ADD CONSTRAINT agreements_payout_frequency_check
  CHECK (payout_frequency IN ('quarterly', 'annual', 'cumulative', 'monthly', 'biannual'));

-- 7. Index on investor_id for fast profile lookups
CREATE INDEX IF NOT EXISTS agreements_investor_id_idx ON agreements (investor_id) WHERE investor_id IS NOT NULL;

-- 8. Backfill: create investor records for existing agreements and link them
-- Match by PAN first (exact), then by name (case-insensitive). Runs in a DO block.
DO $$
DECLARE
  rec RECORD;
  inv_id uuid;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (COALESCE(investor_pan, lower(investor_name)))
      id AS agreement_id,
      investor_name,
      investor_pan,
      investor_aadhaar,
      investor_address
    FROM agreements
    WHERE investor_id IS NULL
    ORDER BY COALESCE(investor_pan, lower(investor_name)), created_at ASC
  LOOP
    -- Try to find existing investor by PAN
    IF rec.investor_pan IS NOT NULL THEN
      SELECT id INTO inv_id FROM investors WHERE pan = rec.investor_pan LIMIT 1;
    END IF;

    -- Fallback: find by name
    IF inv_id IS NULL THEN
      SELECT id INTO inv_id FROM investors WHERE lower(name) = lower(rec.investor_name) LIMIT 1;
    END IF;

    -- Create if not found
    IF inv_id IS NULL THEN
      INSERT INTO investors (name, pan, aadhaar, address)
      VALUES (rec.investor_name, rec.investor_pan, rec.investor_aadhaar, rec.investor_address)
      RETURNING id INTO inv_id;
    END IF;

    -- Link all agreements for this investor
    IF rec.investor_pan IS NOT NULL THEN
      UPDATE agreements SET investor_id = inv_id
      WHERE investor_pan = rec.investor_pan AND investor_id IS NULL;
    ELSE
      UPDATE agreements SET investor_id = inv_id
      WHERE lower(investor_name) = lower(rec.investor_name) AND investor_pan IS NULL AND investor_id IS NULL;
    END IF;

    inv_id := NULL;
  END LOOP;
END $$;
