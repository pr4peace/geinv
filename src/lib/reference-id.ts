import { createAdminClient } from '@/lib/supabase/admin'

// NOTE: This uses COUNT(*)+1 which is not safe under concurrent inserts or after deletions.
// For this single-user internal tool the practical risk is minimal, but a Postgres sequence
// should replace this before multi-user support is added (Phase 2).
// Also add a UNIQUE constraint on reference_id in the DB (already in migration 002).
export async function generateReferenceId(): Promise<string> {
  const supabase = createAdminClient()
  const year = new Date().getFullYear()

  const { count } = await supabase
    .from('agreements')
    .select('*', { count: 'exact', head: true })

  const nextNum = String((count ?? 0) + 1).padStart(3, '0')
  return `GE-${year}-${nextNum}`
}
