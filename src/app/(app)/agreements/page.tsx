import { createAdminClient } from '@/lib/supabase/admin'
import AgreementsTable from '@/components/dashboard/AgreementsTable'
import type { Agreement } from '@/types/database'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Agreements — Good Earth Investment Tracker',
}

async function getAgreements(): Promise<Agreement[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agreements')
    .select('*, salesperson:team_members!salesperson_id(*)')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Failed to fetch agreements:', error.message)
    return []
  }
  return (data ?? []) as Agreement[]
}

export default async function AgreementsPage() {
  const agreements = await getAgreements().catch(() => [] as Agreement[])

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Agreements</h1>
          <p className="text-xs text-slate-500 mt-0.5">All investment agreements</p>
        </div>
      </div>

      <AgreementsTable agreements={agreements} />
    </div>
  )
}
