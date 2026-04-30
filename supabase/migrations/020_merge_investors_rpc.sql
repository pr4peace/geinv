
-- Function to merge two investors with security checks for salespersons
CREATE OR REPLACE FUNCTION merge_investors(
  p_source_id UUID,
  p_target_id UUID,
  p_user_role TEXT,
  p_user_team_id UUID
) RETURNS VOID AS $$
BEGIN
  -- 1. Security Check for salespersons
  IF p_user_role = 'salesperson' THEN
    -- Must have access to at least one agreement of the source investor
    IF NOT EXISTS (
      SELECT 1 FROM agreements 
      WHERE investor_id = p_source_id 
        AND salesperson_id = p_user_team_id
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Unauthorized: No access to source investor';
    END IF;

    -- Must have access to at least one agreement of the target investor
    -- (Otherwise they are merging their agreements into a "black hole")
    IF NOT EXISTS (
      SELECT 1 FROM agreements 
      WHERE investor_id = p_target_id 
        AND salesperson_id = p_user_team_id
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Unauthorized: No access to target investor';
    END IF;
  END IF;

  -- 2. Verify both exist
  IF NOT EXISTS (SELECT 1 FROM investors WHERE id = p_source_id) OR
     NOT EXISTS (SELECT 1 FROM investors WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'Investor not found';
  END IF;

  -- 3. Prevent self-merge
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot merge an investor into themselves';
  END IF;

  -- 4. Re-point agreements
  UPDATE agreements
  SET investor_id = p_target_id, updated_at = NOW()
  WHERE investor_id = p_source_id;

  -- 5. Re-point notes
  UPDATE investor_notes
  SET investor_id = p_target_id, updated_at = NOW()
  WHERE investor_id = p_source_id;

  -- 6. Delete source
  DELETE FROM investors WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql;
