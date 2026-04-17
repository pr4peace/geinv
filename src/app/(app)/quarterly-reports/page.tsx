import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Reports — Good Earth Investment Tracker',
}

type RoiRow = {
  interest_type: string
  roi_percentage: number
  count: number
  principal: number
}

async function getRoiBreakdown(): Promise<RoiRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agreements')
    .select('interest_type, roi_percentage, principal_amount')
    .eq('status', 'active')
    .is('deleted_at', null)
  if (error || !data) return []

  const map = new Map<string, RoiRow>()
  for (const a of data) {
    const key = `${a.interest_type}__${a.roi_percentage}`
    const existing = map.get(key) ?? { interest_type: a.interest_type, roi_percentage: a.roi_percentage, count: 0, principal: 0 }
    existing.count++
    existing.principal += a.principal_amount
    map.set(key, existing)
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.interest_type !== b.interest_type) return a.interest_type.localeCompare(b.interest_type)
    return a.roi_percentage - b.roi_percentage
  })
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function RoiTable({ data, label, totalPrincipal }: { data: RoiRow[]; label: string; totalPrincipal: number }) {
  const subtotal = data.reduce((s, r) => s + r.principal, 0)
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300">{label}</h2>
        <p className="text-xs text-slate-500 mt-0.5">Subtotal: {fmt(subtotal)}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-xs text-slate-500 uppercase tracking-wide">
            <th className="text-left px-5 py-3">ROI %</th>
            <th className="text-center px-4 py-3">Agreements</th>
            <th className="text-right px-5 py-3">Principal</th>
            <th className="text-right px-5 py-3">% of Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {data.length === 0 && (
            <tr><td colSpan={4} className="py-8 text-center text-slate-500">None</td></tr>
          )}
          {data.map((row) => (
            <tr key={`${row.interest_type}-${row.roi_percentage}`} className="hover:bg-slate-700/20">
              <td className="px-5 py-3 font-semibold text-slate-200">{row.roi_percentage}%</td>
              <td className="px-4 py-3 text-center text-slate-300">{row.count}</td>
              <td className="px-5 py-3 text-right font-medium text-slate-100">{fmt(row.principal)}</td>
              <td className="px-5 py-3 text-right text-slate-400">
                {totalPrincipal > 0 ? ((row.principal / totalPrincipal) * 100).toFixed(1) + '%' : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-700 bg-slate-900/50">
          <tr>
            <td colSpan={2} className="px-5 py-2 text-xs text-slate-500">Subtotal</td>
            <td className="px-5 py-2 text-right text-sm font-semibold text-slate-100">{fmt(subtotal)}</td>
            <td className="px-5 py-2 text-right text-slate-400">
              {totalPrincipal > 0 ? ((subtotal / totalPrincipal) * 100).toFixed(1) + '%' : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default async function QuarterlyReportsPage() {
  const rows = await getRoiBreakdown().catch(() => [] as RoiRow[])

  const simpleRows = rows.filter(r => r.interest_type === 'simple')
  const compoundRows = rows.filter(r => r.interest_type !== 'simple')
  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0)

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Reports</h1>
          <p className="text-xs text-slate-500 mt-0.5">Principal breakdown by interest type and ROI — active agreements only</p>
        </div>
        <a
          href="/api/quarterly-reports/download"
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
        >
          Export CSV
        </a>
      </div>

      <div className="space-y-6">
        <RoiTable data={simpleRows} label="Simple Interest" totalPrincipal={totalPrincipal} />
        <RoiTable data={compoundRows} label="Compound / Cumulative" totalPrincipal={totalPrincipal} />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-slate-300">Total Active Principal</span>
          <span className="text-xl font-bold text-slate-100">{fmt(totalPrincipal)}</span>
        </div>
      </div>
    </div>
  )
}
