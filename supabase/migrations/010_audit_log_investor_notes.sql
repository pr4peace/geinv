-- ─────────────────────────────────────────────────────────────────────────────
-- 010: Agreement audit log + investor notes
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Agreement change history
CREATE TABLE IF NOT EXISTS agreement_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  changed_by text NOT NULL DEFAULT 'system',
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted', 'restored', 'status_changed', 'doc_status_changed')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_agreement_id_idx ON agreement_audit_log (agreement_id, created_at DESC);

-- 2. Investor notes / communication log
CREATE TABLE IF NOT EXISTS investor_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investor_notes_investor_id_idx ON investor_notes (investor_id, created_at DESC);
