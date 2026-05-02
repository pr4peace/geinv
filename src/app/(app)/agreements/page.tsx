import Link from 'next/link'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import AgreementsTable from '@/components/agreements/AgreementsTable'
import TrashAgreements from '@/components/agreements/TrashAgreements'
import type { Agreement, AgreementStatus } from '@/types/database'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Agreements — Good Earth Investment Tracker',
}

async function getAgreements(salespersonId?: string): Promise<Agreement[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('agreements')
    .select('*, salesperson:team_members!salesperson_id(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (salespersonId) {
    query = query.eq('salesperson_id', salespersonId)
  }

  const { data, error } = await query
  if (error) {
    console.error('Failed to fetch agreements:', error.message)
    return []
  }
  return (data ?? []) as Agreement[]
}

async function getDeletedAgreements(): Promise<Agreement[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('agreements')
    .select('id, reference_id, investor_name, agreement_date, principal_amount, status, deleted_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  return (data ?? []) as Agreement[]
}

const VALID_STATUSES: AgreementStatus[] = ['active', 'matured', 'cancelled', 'combined']

export default async function AgreementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const initialStatus: AgreementStatus | 'all' =
    status && VALID_STATUSES.includes(status as AgreementStatus)
      ? (status as AgreementStatus)
      : 'all'

  const headersList = await headers()
  const userRole = headersList.get('x-user-role') ?? ''
  const userTeamId = headersList.get('x-user-team-id') ?? ''
  
  const isSalesperson = userRole === 'salesperson'
  const salespersonId = isSalesperson ? userTeamId : undefined

  const [agreements, deletedAgreements] = await Promise.all([
    getAgreements(salespersonId).catch(() => [] as Agreement[]),
    getDeletedAgreements().catch(() => [] as Agreement[]),
  ])

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Agreements</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isSalesperson ? 'Your assigned investment agreements' : 'All investment agreements'}
          </p>
        </div>
        {!isSalesperson && (
          <div className="flex items-center gap-2">
            <Link
              href="/agreements/import"
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 border border-slate-700 hover:bg-slate-800 transition-colors"
            >
              Import historical
            </Link>
            <Link
              href="/agreements/new"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              + New Agreement
            </Link>
          </div>
        )}
      </div>

      <AgreementsTable agreements={agreements} initialStatus={initialStatus} />

      {!isSalesperson && deletedAgreements.length > 0 && (
        <TrashAgreements agreements={deletedAgreements} />
      )}
    </div>
  )
}
