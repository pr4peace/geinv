import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { User } from 'lucide-react'

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

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3">Investor</th>
              <th className="text-left px-4 py-3">PAN</th>
              <th className="text-left px-4 py-3">Aadhaar</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Address</th>
              <th className="text-left px-4 py-3 hidden xl:table-cell">Payout Bank</th>
              <th className="text-center px-4 py-3">Agreements</th>
              <th className="text-center px-4 py-3">Active</th>
              <th className="text-right px-5 py-3">Total Principal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {investors.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500 text-sm">
                  No investors found.
                </td>
              </tr>
            )}
            {investors.map((inv) => (
              <tr key={inv.id} className="hover:bg-slate-700/20 transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/investors/${inv.id}`} className="flex items-center gap-2.5 group">
                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <span className="font-medium text-slate-200 group-hover:text-indigo-400 transition-colors">
                      {inv.name}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {inv.pan ?? '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {inv.aadhaar ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell max-w-xs truncate">
                  {inv.address ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400 hidden xl:table-cell">
                  {inv.payout_bank_name
                    ? `${inv.payout_bank_name} · ${inv.payout_bank_account ?? '—'}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-center text-slate-300">{inv.total_agreements}</td>
                <td className="px-4 py-3 text-center">
                  {inv.active_agreements > 0 ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-900/40 text-green-400">
                      {inv.active_agreements}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right font-medium text-slate-200">
                  {inv.total_principal > 0 ? fmt(inv.total_principal) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-700 bg-slate-900/50">
            <tr>
              <td colSpan={7} className="px-5 py-2 text-xs text-slate-500 font-medium">
                {investors.length} investor{investors.length !== 1 ? 's' : ''}
              </td>
              <td className="px-5 py-2 text-right text-sm font-semibold text-slate-100">
                {fmt(totalPrincipal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
