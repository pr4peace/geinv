import { createAdminClient } from '@/lib/supabase/admin'

export async function generateReferenceId(): Promise<string> {
  const supabase = createAdminClient()
  const year = new Date().getFullYear()

  const { count } = await supabase
    .from('agreements')
    .select('*', { count: 'exact', head: true })

  const nextNum = String((count ?? 0) + 1).padStart(3, '0')
  return `GE-${year}-${nextNum}`
}
