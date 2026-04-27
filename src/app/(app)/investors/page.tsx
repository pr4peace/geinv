import { createAdminClient } from '@/lib/supabase/admin'
import { InvestorsTable } from '@/components/investors/InvestorsTable'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Investors — Good Earth Investment Tracker',
}

type InvestorRow = {
  id: string
  name: string
  pan: string | null
  aadhaar: string | null
  address: string | null
  birth_year: number | null
  payout_bank_name: string | null
  payout_bank_account: string | null
  payout_bank_ifsc: string | null
  created_at: string
  total_agreements: number
  active_agreements: number
  total_principal: number
}

async function getInvestors(): Promise<InvestorRow[]> {
  const supabase = createAdminClient()

  const { data: investors, error } = await supabase
    .from('investors')
    .select('id, name, pan, aadhaar, address, birth_year, payout_bank_name, payout_bank_account, payout_bank_ifsc, created_at')
    .order('name', { ascending: true })

  if (error || !investors) return []

  // Get agreement stats per investor
  const { data: agreements } = await supabase
    .from('agreements')
    .select('investor_id, status, principal_amount')
    .is('deleted_at', null)
    .not('investor_id', 'is', null)

  const statsMap = new Map<string, { total: number; active: number; principal: number }>()
  for (const a of agreements ?? []) {
    if (!a.investor_id) continue
    const existing = statsMap.get(a.investor_id) ?? { total: 0, active: 0, principal: 0 }
    existing.total++
    if (a.status === 'active') existing.active++
    existing.principal += a.principal_amount ?? 0
    statsMap.set(a.investor_id, existing)
  }

  return investors.map((inv) => {
    const stats = statsMap.get(inv.id) ?? { total: 0, active: 0, principal: 0 }
    return {
      ...inv,
      total_agreements: stats.total,
      active_agreements: stats.active,
      total_principal: stats.principal,
    }
  })
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

export default async function InvestorsPage() {
  const investors = await getInvestors().catch(() => [] as InvestorRow[])

  const totalPrincipal = investors.reduce((s, i) => s + i.total_principal, 0)
  const activeInvestors = investors.filter((i) => i.active_agreements > 0).length

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Investors</h1>
          <p className="text-xs text-slate-500 mt-0.5">{investors.length} investors · {activeInvestors} with active agreements</p>
        </div>
        <a
          href="/api/investors/download"
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
        >
          Export CSV
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Investors</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{investors.length}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Active Investors</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{activeInvestors}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Principal</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{fmt(totalPrincipal)}</p>
        </div>
      </div>

      <InvestorsTable investors={investors} />
    </div>
  )
}
